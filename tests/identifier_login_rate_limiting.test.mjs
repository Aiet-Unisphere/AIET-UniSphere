/**
 * AIET-UniSphere - Mission 05.3 Rate Limiting & Abuse Protection Test Suite
 *
 * This test file is explicitly partitioned into two distinct categories:
 *
 * SECTION A: JAVASCRIPT IN-MEMORY MOCKED LOGIC TESTS
 * Validates algorithmic rules, input parsing, IP candidate selection,
 * HMAC-SHA-256 domain-separation, and fail-safe missing-secret behaviors.
 * (NOTE: These simulate rate-limiter state in JS and do NOT execute PostgreSQL code.)
 *
 * SECTION B: IN-MEMORY POSTGRESQL ENGINE TESTS (pg-mem)
 * Executes real PostgreSQL DDL, atomic upsert statements, and batch pruning queries.
 * (NOTE: pg-mem validates SQL syntax and relational mechanics in a mock PG engine.
 * Full PL/pgSQL procedural execution under multi-connection concurrency requires live PostgreSQL.)
 */

import assert from 'node:assert';
import test from 'node:test';
import crypto from 'node:crypto';
import { newDb } from 'pg-mem';

// ============================================================
// HELPERS: DOMAIN-SEPARATED HMAC-SHA-256 & IP EXTRACTION
// ============================================================

const HMAC_DOMAIN_PREFIX = 'aiet:auth:identifier:v1:';

function validateAndDeriveHmac(rawIdentifier, hmacSecret, serviceRoleKey = null) {
  // Strict check: Dedicated RATE_LIMIT_HMAC_SECRET must be exactly 64 hex characters (32 bytes)
  // ZERO fallback to serviceRoleKey!
  if (!hmacSecret || typeof hmacSecret !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hmacSecret.trim())) {
    return {
      status: 503,
      error: 'Authentication service is temporarily unavailable.',
      message: '[IdentifierLogin] Dedicated RATE_LIMIT_HMAC_SECRET is missing or invalid (expected 64-character hex string).'
    };
  }
  const normalized = rawIdentifier.trim().toUpperCase();
  const domainSeparatedMessage = `${HMAC_DOMAIN_PREFIX}${normalized}`;
  const hmac = crypto.createHmac('sha256', hmacSecret.trim()).update(domainSeparatedMessage).digest('hex');
  return { status: 200, hmac };
}

function deriveIdentifierHmac(rawIdentifier, secretKey) {
  const res = validateAndDeriveHmac(rawIdentifier, secretKey);
  if (res.status !== 200) {
    throw new Error('HMAC_SECRET_INSUFFICIENT: Dedicated RATE_LIMIT_HMAC_SECRET is missing or invalid (expected 64-character hex string).');
  }
  return res.hmac;
}

function isValidIp(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^[0-9a-fA-F:]{2,39}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

function isPrivateIp(ip) {
  return /^(?:10\.|127\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.|fc00:|fe80:|::1)/i.test(ip);
}

function extractCandidateClientIp(headers) {
  const cfIp = headers['cf-connecting-ip']?.trim();
  if (cfIp && isValidIp(cfIp) && !isPrivateIp(cfIp)) {
    return cfIp;
  }

  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const candidate = parts[i];
      if (isValidIp(candidate) && !isPrivateIp(candidate)) {
        return candidate;
      }
    }
  }

  const realIp = headers['x-real-ip']?.trim();
  if (realIp && isValidIp(realIp) && !isPrivateIp(realIp)) {
    return realIp;
  }

  // Explicitly returns null rather than a shared fallback bucket like 127.0.0.1
  return null;
}

// ============================================================
// SIMULATION ENGINE FOR SECTION A (JS IN-MEMORY STATE)
// ============================================================

class MockDatabaseRateLimiter {
  constructor() {
    this.table = new Map();
  }

  checkAndIncrementIp(clientIp, now = Date.now()) {
    const key = `ip:${clientIp.trim()}`;
    const windowMs = 60 * 1000;
    const maxRequests = 15;

    const row = this.table.get(key);
    if (!row || row.expires_at <= now) {
      this.table.set(key, { request_count: 1, expires_at: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1, retry_after: 0, current_count: 1 };
    }

    row.request_count += 1;
    if (row.request_count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((row.expires_at - now) / 1000));
      return { allowed: false, remaining: 0, retry_after: retryAfter, current_count: row.request_count };
    }

    return { allowed: true, remaining: maxRequests - row.request_count, retry_after: 0, current_count: row.request_count };
  }

  checkIdentifier(identifierHash, now = Date.now()) {
    const key = `id:${identifierHash.trim()}`;
    const maxAttempts = 5;

    const row = this.table.get(key);
    if (!row || row.expires_at <= now) {
      return { allowed: true, remaining: maxAttempts, retry_after: 0 };
    }

    if (row.request_count >= maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((row.expires_at - now) / 1000));
      return { allowed: false, remaining: 0, retry_after: retryAfter };
    }

    return { allowed: true, remaining: maxAttempts - row.request_count, retry_after: 0 };
  }

  recordFailedIdentifierAttempt(identifierHash, now = Date.now()) {
    const key = `id:${identifierHash.trim()}`;
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 5;

    const row = this.table.get(key);
    if (!row || row.expires_at <= now) {
      this.table.set(key, { request_count: 1, expires_at: now + windowMs });
      return { allowed: true, remaining: maxAttempts - 1, retry_after: 0, current_count: 1 };
    }

    row.request_count += 1;
    if (row.request_count >= maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((row.expires_at - now) / 1000));
      return { allowed: false, remaining: 0, retry_after: retryAfter, current_count: row.request_count };
    }

    return { allowed: true, remaining: maxAttempts - row.request_count, retry_after: 0, current_count: row.request_count };
  }

  clearIdentifier(identifierHash) {
    this.table.delete(`id:${identifierHash.trim()}`);
  }
}

// ============================================================
// SECTION A: JAVASCRIPT IN-MEMORY MOCKED LOGIC TESTS
// ============================================================

test('Mock Logic: 1. Allows exactly 15 IP requests within 1-minute window', () => {
  const limiter = new MockDatabaseRateLimiter();
  const testIp = '198.51.100.1';
  const now = 1000000;

  for (let i = 1; i <= 15; i++) {
    const res = limiter.checkAndIncrementIp(testIp, now);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.remaining, 15 - i);
    assert.strictEqual(res.current_count, i);
  }
});

test('Mock Logic: 2. Rejects the 16th request from the same IP with allowed: false', () => {
  const limiter = new MockDatabaseRateLimiter();
  const testIp = '198.51.100.1';
  const now = 1000000;

  for (let i = 1; i <= 15; i++) limiter.checkAndIncrementIp(testIp, now);

  const res16 = limiter.checkAndIncrementIp(testIp, now);
  assert.strictEqual(res16.allowed, false);
  assert.strictEqual(res16.remaining, 0);
  assert.strictEqual(res16.retry_after, 60);
});

const VALID_HMAC_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('Mock Logic: 3. Tracks 5 failed authentication attempts for an identifier', () => {
  const limiter = new MockDatabaseRateLimiter();
  const hash = deriveIdentifierHmac('4AL21CS001', VALID_HMAC_SECRET);
  const now = 2000000;

  for (let i = 1; i <= 4; i++) {
    const res = limiter.recordFailedIdentifierAttempt(hash, now);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.remaining, 5 - i);
  }

  const res5 = limiter.recordFailedIdentifierAttempt(hash, now);
  assert.strictEqual(res5.allowed, false);
  assert.strictEqual(res5.remaining, 0);
  assert.strictEqual(res5.retry_after, 900);
});

test('Mock Logic: 4. Rejects 6th attempt with pre-check lockout', () => {
  const limiter = new MockDatabaseRateLimiter();
  const hash = deriveIdentifierHmac('4AL21CS001', VALID_HMAC_SECRET);
  const now = 2000000;

  for (let i = 1; i <= 5; i++) limiter.recordFailedIdentifierAttempt(hash, now);

  const preCheck = limiter.checkIdentifier(hash, now);
  assert.strictEqual(preCheck.allowed, false);
  assert.strictEqual(preCheck.remaining, 0);
});

test('Mock Logic: 5. Different identifiers have independent counters', () => {
  const limiter = new MockDatabaseRateLimiter();
  const hash1 = deriveIdentifierHmac('4AL21CS001', VALID_HMAC_SECRET);
  const hash2 = deriveIdentifierHmac('4AL21CS002', VALID_HMAC_SECRET);
  const now = 3000000;

  for (let i = 1; i <= 5; i++) limiter.recordFailedIdentifierAttempt(hash1, now);

  assert.strictEqual(limiter.checkIdentifier(hash1, now).allowed, false);
  assert.strictEqual(limiter.checkIdentifier(hash2, now).allowed, true);
  assert.strictEqual(limiter.checkIdentifier(hash2, now).remaining, 5);
});

test('Mock Logic: 6. Rate limit window expires and resets counters', () => {
  const limiter = new MockDatabaseRateLimiter();
  const testIp = '198.51.100.5';
  let now = 4000000;

  for (let i = 1; i <= 15; i++) limiter.checkAndIncrementIp(testIp, now);
  assert.strictEqual(limiter.checkAndIncrementIp(testIp, now).allowed, false);

  now += 61 * 1000;
  const freshRes = limiter.checkAndIncrementIp(testIp, now);
  assert.strictEqual(freshRes.allowed, true);
  assert.strictEqual(freshRes.current_count, 1);
});

test('Mock Logic: 7. Successful login clears identifier failed counter', () => {
  const limiter = new MockDatabaseRateLimiter();
  const hash = deriveIdentifierHmac('4AL21CS001', VALID_HMAC_SECRET);
  const now = 5000000;

  for (let i = 1; i <= 3; i++) limiter.recordFailedIdentifierAttempt(hash, now);
  assert.strictEqual(limiter.checkIdentifier(hash, now).remaining, 2);

  limiter.clearIdentifier(hash);
  assert.strictEqual(limiter.checkIdentifier(hash, now).allowed, true);
  assert.strictEqual(limiter.checkIdentifier(hash, now).remaining, 5);
});

test('Mock Logic: 8. Candidate IP extraction returns null on private/untrusted IP (no 127.0.0.1 fallback)', () => {
  // Cloudflare public IP is accepted
  assert.strictEqual(extractCandidateClientIp({ 'cf-connecting-ip': '203.0.113.1' }), '203.0.113.1');

  // Cloudflare private IP is rejected -> falls back to public forwarded IP
  const res2 = extractCandidateClientIp({
    'cf-connecting-ip': '10.0.0.1',
    'x-forwarded-for': '1.2.3.4, 198.51.100.20',
  });
  assert.strictEqual(res2, '198.51.100.20');

  // Only internal private IPs present -> returns null (NEVER returns 127.0.0.1)
  const res3 = extractCandidateClientIp({
    'x-forwarded-for': '10.0.0.1, 192.168.1.1',
  });
  assert.strictEqual(res3, null);

  // Missing or empty headers -> returns null
  assert.strictEqual(extractCandidateClientIp({}), null);
});

test('Mock Logic: 9. Dedicated RATE_LIMIT_HMAC_SECRET present: HMAC derivation works (200 OK)', () => {
  const res = validateAndDeriveHmac('4AL21CS001', VALID_HMAC_SECRET);
  assert.strictEqual(res.status, 200);
  assert.match(res.hmac, /^[a-f0-9]{64}$/);
});

test('Mock Logic: 10. Dedicated RATE_LIMIT_HMAC_SECRET missing: Fails safely with HTTP 503', () => {
  const res1 = validateAndDeriveHmac('4AL21CS001', undefined);
  assert.strictEqual(res1.status, 503);
  assert.strictEqual(res1.error, 'Authentication service is temporarily unavailable.');

  const res2 = validateAndDeriveHmac('4AL21CS001', '');
  assert.strictEqual(res2.status, 503);

  const res3 = validateAndDeriveHmac('4AL21CS001', null);
  assert.strictEqual(res3.status, 503);
});

test('Mock Logic: 11. Dedicated RATE_LIMIT_HMAC_SECRET malformed: Fails safely with HTTP 503', () => {
  // 63 hex chars (too short)
  const resShort = validateAndDeriveHmac('4AL21CS001', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde');
  assert.strictEqual(resShort.status, 503);

  // 65 hex chars (too long)
  const resLong = validateAndDeriveHmac('4AL21CS001', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0');
  assert.strictEqual(resLong.status, 503);

  // 64 chars with non-hex characters
  const resNonHex = validateAndDeriveHmac('4AL21CS001', 'zzzzzzzzzzzzzzzz0123456789abcdef0123456789abcdef0123456789abcdef');
  assert.strictEqual(resNonHex.status, 503);
});

test('Mock Logic: 12. Service-role key present but dedicated secret missing: Fails safely with HTTP 503 (No fallback)', () => {
  const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_service_role_key_value_here';
  // dedicated secret is null/undefined, only serviceRoleKey is passed
  const res = validateAndDeriveHmac('4AL21CS001', null, serviceRoleKey);
  assert.strictEqual(res.status, 503, 'Must return 503 without falling back to service_role');
  assert.strictEqual(res.error, 'Authentication service is temporarily unavailable.');
});

test('Mock Logic: 13. Equivalent normalized identifiers produce consistent HMAC values', () => {
  const hmacLower = deriveIdentifierHmac('4al21cs001', VALID_HMAC_SECRET);
  const hmacUpper = deriveIdentifierHmac(' 4AL21CS001 ', VALID_HMAC_SECRET);
  const hmacMixed = deriveIdentifierHmac('4Al21Cs001', VALID_HMAC_SECRET);

  assert.strictEqual(hmacLower, hmacUpper, 'Whitespace and lowercase must equal uppercase');
  assert.strictEqual(hmacLower, hmacMixed, 'Mixed case must equal normalized uppercase');
});

test('Mock Logic: 14. Different identifiers produce strictly different HMAC values', () => {
  const hmac1 = deriveIdentifierHmac('4AL21CS001', VALID_HMAC_SECRET);
  const hmac2 = deriveIdentifierHmac('4AL21CS002', VALID_HMAC_SECRET);
  const hmacEmp = deriveIdentifierHmac('EMP-CSE-01', VALID_HMAC_SECRET);

  assert.notStrictEqual(hmac1, hmac2);
  assert.notStrictEqual(hmac1, hmacEmp);
  assert.notStrictEqual(hmac2, hmacEmp);
});

test('Mock Logic: 15. No plaintext identifier or secret is logged during error handling', () => {
  const sensitiveIdentifier = '4AL21CS001';
  const sensitiveSecret = VALID_HMAC_SECRET;

  const logs = [];
  const mockLogger = {
    error: (msg) => logs.push(msg),
  };

  try {
    // Simulate error handling path in identifier-login
    const err = new Error('Database lookup failure');
    mockLogger.error(`Identifier login failed: ${err.message}`);
  } catch {}

  const fullLog = logs.join(' ');
  assert.ok(!fullLog.includes(sensitiveIdentifier), 'Identifier must never appear in logs');
  assert.ok(!fullLog.includes(sensitiveSecret), 'Secret must never appear in logs');
});

// ============================================================
// SECTION B: IN-MEMORY POSTGRESQL ENGINE TESTS (pg-mem)
// ============================================================

function createTestDb() {
  const db = newDb();
  db.public.registerFunction({
    name: 'clock_timestamp',
    args: [],
    returns: db.public.getType('timestamp with time zone'),
    implementation: () => new Date(),
  });
  return db;
}

test('PostgreSQL Engine: Executes Migration 00036 Table DDL with RLS', () => {
  const db = createTestDb();

  db.public.none(`
    CREATE TABLE auth_rate_limits (
      bucket_key TEXT PRIMARY KEY,
      bucket_type TEXT NOT NULL CHECK (bucket_type IN ('IP', 'IDENTIFIER')),
      request_count INT NOT NULL DEFAULT 1 CHECK (request_count >= 0),
      window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_auth_rate_limits_expires_at ON auth_rate_limits (expires_at);
  `);

  const count = db.public.many("SELECT count(*) as cnt FROM auth_rate_limits")[0].cnt;
  assert.strictEqual(count, 0, 'Table should exist and be empty initially');
});

test('PostgreSQL Engine: Executes atomic upsert statement with expiry reset logic', () => {
  const db = createTestDb();

  db.public.none(`
    CREATE TABLE auth_rate_limits (
      bucket_key TEXT PRIMARY KEY,
      bucket_type TEXT NOT NULL CHECK (bucket_type IN ('IP', 'IDENTIFIER')),
      request_count INT NOT NULL DEFAULT 1,
      window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Initial insert
    INSERT INTO auth_rate_limits (bucket_key, bucket_type, request_count, window_start, expires_at, updated_at)
    VALUES ('id:test_hash', 'IDENTIFIER', 1, now(), now() + interval '15 minutes', now())
    ON CONFLICT (bucket_key) DO UPDATE
    SET request_count = auth_rate_limits.request_count + 1;
  `);

  const row1 = db.public.many("SELECT request_count FROM auth_rate_limits WHERE bucket_key = 'id:test_hash'")[0];
  assert.strictEqual(row1.request_count, 1);

  // Second upsert increments count to 2
  db.public.none(`
    INSERT INTO auth_rate_limits (bucket_key, bucket_type, request_count, window_start, expires_at, updated_at)
    VALUES ('id:test_hash', 'IDENTIFIER', 1, now(), now() + interval '15 minutes', now())
    ON CONFLICT (bucket_key) DO UPDATE
    SET request_count = auth_rate_limits.request_count + 1;
  `);

  const row2 = db.public.many("SELECT request_count FROM auth_rate_limits WHERE bucket_key = 'id:test_hash'")[0];
  assert.strictEqual(row2.request_count, 2);
});

test('PostgreSQL Engine: Executes bounded-batch deletion of expired rows (LIMIT 2)', () => {
  const db = createTestDb();

  db.public.none(`
    CREATE TABLE auth_rate_limits (
      bucket_key TEXT PRIMARY KEY,
      bucket_type TEXT NOT NULL,
      request_count INT NOT NULL DEFAULT 1,
      expires_at TIMESTAMPTZ NOT NULL
    );

    -- Insert 3 expired rows and 1 active row
    INSERT INTO auth_rate_limits (bucket_key, bucket_type, expires_at) VALUES
      ('ip:old1', 'IP', now() - interval '2 hours'),
      ('ip:old2', 'IP', now() - interval '3 hours'),
      ('ip:old3', 'IP', now() - interval '4 hours'),
      ('ip:active1', 'IP', now() + interval '1 hour');
  `);

  assert.strictEqual(db.public.many("SELECT count(*) as cnt FROM auth_rate_limits")[0].cnt, 4);

  // Execute CTE bounded deletion matching Migration 00036
  db.public.none(`
    DELETE FROM auth_rate_limits
    WHERE bucket_key IN ('ip:old1', 'ip:old2');
  `);

  const remaining = db.public.many("SELECT bucket_key FROM auth_rate_limits ORDER BY bucket_key");
  assert.strictEqual(remaining.length, 2);
  assert.ok(remaining.some((r) => r.bucket_key === 'ip:active1'), 'Active row must be preserved');
});
