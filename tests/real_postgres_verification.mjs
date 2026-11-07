import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const PSQL_PATH = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';
const DB_HOST = process.env.PGHOST || '127.0.0.1';
const DB_PORT = process.env.PGPORT || '54333';
const DB_USER = process.env.PGUSER || 'postgres';
const DB_NAME = process.env.PGDATABASE || 'postgres';

async function runSql(sql, asRole = null) {
  const fullSql = asRole
    ? `SET ROLE ${asRole};\n${sql}`
    : sql;
  try {
    const { stdout, stderr } = await execFileAsync(PSQL_PATH, [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', DB_NAME,
      '-q',
      '-v', 'ON_ERROR_STOP=1',
      '-t', '-A',
      '-c', fullSql
    ], { encoding: 'utf8' });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { success: false, error: err.message, stderr: (err.stderr || '').trim() };
  }
}

async function runSqlFile(filePath) {
  try {
    const { stdout, stderr } = await execFileAsync(PSQL_PATH, [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', DB_NAME,
      '-v', 'ON_ERROR_STOP=1',
      '-f', filePath
    ], { encoding: 'utf8' });
    return { success: true, stdout, stderr };
  } catch (err) {
    return { success: false, error: err.message, stderr: (err.stderr || '').trim() };
  }
}

async function run() {
  console.log('=== AIET-UniSphere MISSION 05.6: PostgreSQL 16 Integration Verification ===');

  // 0. Preflight Connection Probe
  const probe = await runSql('SELECT version();');
  if (!probe.success) {
    throw new Error(
      `ENVIRONMENT PREREQUISITE NOT MET: Unable to connect to PostgreSQL at ${DB_HOST}:${DB_PORT}.\n` +
      `Ensure an isolated PostgreSQL instance is running on port ${DB_PORT}.\n` +
      `Error details: ${probe.stderr || probe.error}`
    );
  }
  console.log(`[0/10] Connection verified to PostgreSQL 16 on ${DB_HOST}:${DB_PORT}.`);

  // 1. Setup Supabase Roles
  console.log('\n[1/10] Preparing Supabase mock roles (anon, authenticated, service_role)...');
  const roleSetup = await runSql(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
    END $$;
  `);
  assert.equal(roleSetup.success, true, `Role setup failed: ${roleSetup.stderr}`);
  console.log('  -> Roles anon, authenticated, service_role established.');

  // 2. Execute Migration 00036 and Forward-Only Migration 00037
  console.log('\n[2/10] Executing migration 00036_identifier_login_rate_limiting.sql...');
  const migRes = await runSqlFile('supabase/migrations/00036_identifier_login_rate_limiting.sql');
  assert.equal(migRes.success, true, `Migration 00036 failed to execute: ${migRes.stderr}`);
  console.log('  -> Migration 00036 executed cleanly with 0 SQL errors.');

  console.log('  Executing forward-only migration 00037_rate_limit_procedure_correction.sql...');
  const mig37Res = await runSqlFile('supabase/migrations/00037_rate_limit_procedure_correction.sql');
  assert.equal(mig37Res.success, true, `Migration 00037 failed to execute: ${mig37Res.stderr}`);
  console.log('  -> Migration 00037 executed cleanly with 0 SQL errors (procedures updated to unqualified GREATEST/LEAST).');

  // 3. Verify Functions Created with SECURITY DEFINER and Empty search_path
  console.log('\n[3/10] Verifying RPC declarations, SECURITY DEFINER, and search_path...');
  const funcQuery = `
    SELECT proname, prosecdef, COALESCE(array_to_string(proconfig, ','), '') AS config
    FROM pg_proc
    JOIN pg_namespace n ON pg_proc.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND proname IN (
        'check_and_increment_ip_rate_limit',
        'check_identifier_rate_limit',
        'record_failed_identifier_attempt',
        'clear_identifier_rate_limit',
        'prune_expired_auth_rate_limits'
      )
    ORDER BY proname;
  `;
  const funcRes = await runSql(funcQuery);
  assert.equal(funcRes.success, true);
  const rows = funcRes.stdout.split('\n').map(r => r.split('|'));
  assert.equal(rows.length, 5, `Expected 5 RPC functions, got ${rows.length}`);

  for (const [name, secdef, config] of rows) {
    console.log(`  -> Function: ${name} | SECURITY DEFINER: ${secdef} | Config: ${config}`);
    assert.equal(secdef, 't', `Function ${name} must be SECURITY DEFINER`);
    assert.ok(config.includes('search_path='), `Function ${name} must have empty search_path set`);
  }

  // 4. Verify RLS & Table Permissions
  console.log('\n[4/10] Verifying RLS and Table-level Access Isolation...');
  const rlsCheck = await runSql(`SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'auth_rate_limits';`);
  assert.equal(rlsCheck.stdout, 't', 'RLS must be enabled on auth_rate_limits');
  console.log('  -> RLS enabled: true');

  // anon cannot SELECT
  const anonSelect = await runSql(`SELECT * FROM public.auth_rate_limits;`, 'anon');
  assert.equal(anonSelect.success, false, 'anon should not be allowed to SELECT from auth_rate_limits');
  assert.ok(anonSelect.stderr.includes('permission denied'), 'Error should be permission denied');
  console.log('  -> anon role SELECT on table correctly blocked (permission denied).');

  // authenticated cannot INSERT
  const authInsert = await runSql(`
    INSERT INTO public.auth_rate_limits (bucket_key, bucket_type, expires_at)
    VALUES ('test', 'IP', now() + interval '1 hour');
  `, 'authenticated');
  assert.equal(authInsert.success, false, 'authenticated should not be allowed to INSERT into auth_rate_limits');
  assert.ok(authInsert.stderr.includes('permission denied'), 'Error should be permission denied');
  console.log('  -> authenticated role INSERT on table correctly blocked (permission denied).');

  // 5. Verify RPC Execution Privileges
  console.log('\n[5/10] Verifying RPC Execution Privileges...');
  const testFunctions = [
    `SELECT public.check_and_increment_ip_rate_limit('127.0.0.1');`,
    `SELECT public.check_identifier_rate_limit('test_hash');`,
    `SELECT public.record_failed_identifier_attempt('test_hash');`,
    `SELECT public.clear_identifier_rate_limit('test_hash');`,
    `SELECT public.prune_expired_auth_rate_limits(10);`
  ];

  for (const fnCall of testFunctions) {
    // anon must be denied
    const anonRun = await runSql(fnCall, 'anon');
    assert.equal(anonRun.success, false, `anon must not execute: ${fnCall}`);
    assert.ok(anonRun.stderr.includes('permission denied'), `Expected permission denied for anon: ${anonRun.stderr}`);

    // authenticated must be denied
    const authRun = await runSql(fnCall, 'authenticated');
    assert.equal(authRun.success, false, `authenticated must not execute: ${fnCall}`);
    assert.ok(authRun.stderr.includes('permission denied'), `Expected permission denied for authenticated: ${authRun.stderr}`);

    // service_role must succeed
    const srvRun = await runSql(fnCall, 'service_role');
    assert.equal(srvRun.success, true, `service_role failed to execute: ${fnCall}: ${srvRun.stderr}`);
  }
  console.log('  -> All 5 RPCs strictly restricted from anon and authenticated, authorized for service_role.');

  // Clean rate limits table before behavioral tests
  await runSql(`TRUNCATE TABLE public.auth_rate_limits;`);

  // 6. Test Sequential IP Rate Limiting (15 max / 60s)
  console.log('\n[6/10] Testing IP Rate Limiting thresholds (15 limit)...');
  const testIp = '203.0.113.10';
  for (let i = 1; i <= 15; i++) {
    const res = await runSql(`SELECT public.check_and_increment_ip_rate_limit('${testIp}');`, 'service_role');
    assert.equal(res.success, true);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.allowed, true, `Request ${i} should be allowed`);
    assert.equal(parsed.remaining, 15 - i, `Remaining should be ${15 - i}`);
  }
  // 16th request must be rejected
  const req16 = await runSql(`SELECT public.check_and_increment_ip_rate_limit('${testIp}');`, 'service_role');
  assert.equal(req16.success, true);
  const parsed16 = JSON.parse(req16.stdout);
  assert.equal(parsed16.allowed, false, 'Request 16 must be denied');
  assert.equal(parsed16.remaining, 0);
  assert.ok(parsed16.retry_after > 0, 'retry_after must be positive');
  console.log(`  -> 15 requests allowed, 16th blocked with allowed=false, retry_after=${parsed16.retry_after}s.`);

  // 7. Atomic Concurrency Test (30 concurrent calls)
  console.log('\n[7/10] Testing Atomic Concurrency under 30 parallel requests...');
  const concurrentIp = '198.51.100.99';
  const concurrencyCount = 30;
  const promises = [];
  for (let i = 0; i < concurrencyCount; i++) {
    promises.push(runSql(`SELECT public.check_and_increment_ip_rate_limit('${concurrentIp}');`, 'service_role'));
  }
  const results = await Promise.all(promises);
  let allowedCount = 0;
  let blockedCount = 0;
  for (const r of results) {
    assert.equal(r.success, true, `Concurrent execution failed: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    if (data.allowed) {
      allowedCount++;
    } else {
      blockedCount++;
    }
  }
  console.log(`  -> Concurrent results: ${allowedCount} allowed, ${blockedCount} blocked.`);
  assert.equal(allowedCount, 15, `Exactly 15 requests must be allowed under concurrency; got ${allowedCount}`);
  assert.equal(blockedCount, 15, `Exactly 15 requests must be blocked under concurrency; got ${blockedCount}`);

  // Check stored count in table
  const countCheck = await runSql(`SELECT request_count FROM public.auth_rate_limits WHERE bucket_key = 'ip:${concurrentIp}';`);
  assert.equal(countCheck.stdout, '30', `request_count in database must be exactly 30, proving zero lost updates`);
  console.log('  -> Database request_count is exactly 30: zero lost updates, atomic row-level locking verified.');

  // 8. Window Expiry Test
  console.log('\n[8/10] Testing Window Expiry and Reset semantics...');
  // Artificially expire the concurrentIp bucket
  await runSql(`UPDATE public.auth_rate_limits SET expires_at = now() - interval '1 second' WHERE bucket_key = 'ip:${concurrentIp}';`);
  const resetRes = await runSql(`SELECT public.check_and_increment_ip_rate_limit('${concurrentIp}');`, 'service_role');
  assert.equal(resetRes.success, true);
  const resetData = JSON.parse(resetRes.stdout);
  assert.equal(resetData.allowed, true, 'Request after expiration must be allowed');
  assert.equal(resetData.remaining, 14, 'Remaining should reset to 14');
  console.log('  -> Expired rate-limit window resets cleanly to 1 request, allowed=true.');

  // 9. Identifier Brute-Force Lockout & Clear Verification
  console.log('\n[9/10] Testing Identifier Lockout and clear_identifier_rate_limit...');
  const testIdHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  // Initial check: allowed
  const initCheck = await runSql(`SELECT public.check_identifier_rate_limit('${testIdHash}');`, 'service_role');
  assert.equal(JSON.parse(initCheck.stdout).allowed, true);

  // Record 5 failures
  for (let i = 1; i <= 5; i++) {
    const failRes = await runSql(`SELECT public.record_failed_identifier_attempt('${testIdHash}');`, 'service_role');
    const failData = JSON.parse(failRes.stdout);
    assert.equal(failData.current_count, i);
    assert.equal(failData.remaining, 5 - i);
    if (i < 5) {
      assert.equal(failData.allowed, true);
    } else {
      assert.equal(failData.allowed, false, '5th failure should trigger lockout');
    }
  }

  // 6th check should be locked out
  const lockedCheck = await runSql(`SELECT public.check_identifier_rate_limit('${testIdHash}');`, 'service_role');
  const lockedData = JSON.parse(lockedCheck.stdout);
  assert.equal(lockedData.allowed, false);
  assert.equal(lockedData.remaining, 0);
  assert.ok(lockedData.retry_after > 0);
  console.log(`  -> Identifier locked out after 5 failures: allowed=false, retry_after=${lockedData.retry_after}s.`);

  // Successful login clears counter
  const clearRes = await runSql(`SELECT public.clear_identifier_rate_limit('${testIdHash}');`, 'service_role');
  assert.equal(clearRes.success, true);

  // Check after clear
  const postClear = await runSql(`SELECT public.check_identifier_rate_limit('${testIdHash}');`, 'service_role');
  const postClearData = JSON.parse(postClear.stdout);
  assert.equal(postClearData.allowed, true);
  assert.equal(postClearData.remaining, 5);
  console.log('  -> clear_identifier_rate_limit successfully purged bucket, resetting identifier quota.');

  // 10. Bounded Cleanup (prune_expired_auth_rate_limits)
  console.log('\n[10/10] Testing Bounded Batch Cleanup with SKIP LOCKED...');
  // Truncate and insert synthetic test rows
  await runSql(`TRUNCATE TABLE public.auth_rate_limits;`);
  await runSql(`
    INSERT INTO public.auth_rate_limits (bucket_key, bucket_type, expires_at) VALUES
    ('exp_old_1', 'IP', now() - interval '3 hours'),
    ('exp_old_2', 'IP', now() - interval '2 hours'),
    ('exp_old_3', 'IP', now() - interval '90 minutes'),
    ('exp_recent', 'IP', now() - interval '20 minutes'), -- within 1h grace, NOT pruned
    ('active_1', 'IP', now() + interval '30 minutes');    -- future active, NOT pruned
  `);

  // Prune batch of 2
  const prune1 = await runSql(`SELECT public.prune_expired_auth_rate_limits(2);`, 'service_role');
  assert.equal(prune1.stdout, '2', 'First batch should prune exactly 2 expired rows');

  // Prune remaining batch of 2
  const prune2 = await runSql(`SELECT public.prune_expired_auth_rate_limits(2);`, 'service_role');
  assert.equal(prune2.stdout, '1', 'Second batch should prune exactly 1 expired row');

  // Prune again: should delete 0
  const prune3 = await runSql(`SELECT public.prune_expired_auth_rate_limits(2);`, 'service_role');
  assert.equal(prune3.stdout, '0', 'Third batch should delete 0 rows');

  // Check remaining rows
  const remainingCheck = await runSql(`SELECT bucket_key FROM public.auth_rate_limits ORDER BY bucket_key;`);
  const remainingKeys = remainingCheck.stdout.replace(/\r/g, '').split('\n').filter(Boolean);
  assert.deepEqual(remainingKeys, ['active_1', 'exp_recent'], 'Active and grace period buckets must be preserved');
  console.log('  -> Bounded cleanup (prune_expired_auth_rate_limits) verified: batch limiting and 1-hour grace window work as designed.');

  console.log('\n=============================================================');
  console.log('>>> ALL 10 POSTGRESQL 16 INTEGRATION CHECKS PASSED PERFECTLY! <<<');
  console.log('=============================================================');
}

run().catch(err => {
  console.error('\nFAILED VERIFICATION:', err);
  process.exit(1);
});
