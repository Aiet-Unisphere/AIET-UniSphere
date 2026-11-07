# MISSION 05 – Edge Function Deployment Security Audit & Pre-Flight Report

**Project:** AIET-UniSphere  
**Supabase Reference:** `eddsaafwwmtfnjukxamx`  
**Date:** November 7, 2026  
**Auditor:** Senior Supabase Edge Functions Engineer & Application Security Architect  
**Deployment Status:** **HALTED — MANDATORY STOP CONDITION TRIGGERED**  

---

## 1. Executive Summary & Mandatory Stop Condition

During **Phase 1: Final Security Review**, the implementation of both authorized Edge Functions (`identifier-login` and `local-llm-analyze`) was inspected line-by-line against production security requirements.

> [!CAUTION]
> ### STOP CONDITION TRIGGERED: Rate Limiting / Abuse Protection Missing in `identifier-login`
> **Instructional Mandate:**  
> *"IMPORTANT: If effective rate limiting or abuse protection is missing, STOP and report the issue. Do not deploy."*
>
> **Finding:**  
> `supabase/functions/identifier-login/index.ts` contains **no rate limiting or abuse protection** at the Edge Function layer (neither in-memory IP/identifier throttling nor request concurrency bounds).  
> 
> In accordance with project instructions and strict deployment boundaries, **deployment has been immediately halted before executing any deployment commands or modifying remote production state.**

---

## 2. Phase 1 — Detailed Security Review Findings

### 2.1. `identifier-login` Security Audit

| Security Criteria | Status | Code Review Evidence & Analysis |
| :--- | :--- | :--- |
| **Identifier & Password Validation** | **PASS** | Validates `identifier` against strict regex `/^[A-Za-z0-9._-]{2,64}$/`. Validates password string length `1..256`. Rejects malformed types with HTTP `401 Invalid credentials.` |
| **Uniform Failure Responses** | **PASS** | Uniformly returns HTTP `401 { error: "Invalid credentials or account unavailable." }` across: (1) identifier not found in `profiles`, (2) profile found but `account_status != 'ACTIVE'`, (3) invalid password in GoTrue engine. |
| **No Email or Account Enumeration** | **PASS** | Internal user `email` is never returned in HTTP responses. Timing and error messaging remain uniform regardless of whether an identifier exists in the database. |
| **Internal Supabase Auth Delegation** | **PASS** | Uses `admin` client (service-role) solely to resolve internal email, then strictly delegates credential verification to GoTrue via public `auth.signInWithPassword({ email, password })`. Session tokens (`access_token`, `refresh_token`) are cleanly returned. |
| **Credential & Secret Logging** | **PASS** | Line 59 logs only `error.message`. Passwords, raw identifiers, emails, and tokens are never printed to console or logs. |
| **Privilege Escalation Protection** | **PASS** | Governed by database trigger `on_auth_user_created` (Migration 00034), which enforces `role = 'STUDENT'` and `account_status = 'ACTIVE'` for all signups. |
| **Effective Rate Limiting & Abuse Protection** | **FAIL (BLOCKED)** | **MISSING in Edge Function code.** The function does not inspect client IP (e.g., `x-forwarded-for` or `cf-connecting-ip`), lacks an in-memory token bucket / sliding window, and has no per-identifier attempt counter before executing the database lookup. |

#### Risk Assessment of Missing Abuse Protection in `identifier-login`
1. **Database Lookup Flooding (Denial of Service):** An attacker can submit tens of thousands of requests with random identifiers. Even if GoTrue has default IP limits on `signInWithPassword`, the database query `SELECT email, account_status FROM profiles WHERE usn_or_employee_id ILIKE identifier` executes *before* calling GoTrue, potentially exhausting database connection pools and CPU.
2. **Distributed Credential Stuffing / Brute-Force:** Without per-identifier throttling at the function gateway, an attacker can attempt hundreds of passwords against a known USN or Employee ID across multiple client sessions without triggering early rejection.

---

### 2.2. `local-llm-analyze` Security Audit

| Security Criteria | Status | Code Review Evidence & Analysis |
| :--- | :--- | :--- |
| **JWT Authentication** | **PASS** | Lines 655–687 enforce `Authorization: Bearer <token>` and call `userClient.auth.getUser()`. Unauthenticated requests immediately receive `401 UNAUTHORIZED`. |
| **Caller Authorization & Role Restrictions** | **PASS** | Lines 697–723 query `profiles` to obtain the verified role (`STUDENT`, `FACULTY`, `HOD`, `ADMIN`). Verifies `account_status === 'ACTIVE'`. Rejects role spoofing with `403 ROLE_MISMATCH`. Enforces department and student ID boundaries. |
| **Gateway Secrets Isolation** | **PASS** | `ORACLE_GATEWAY_URL`, `ORACLE_GATEWAY_API_KEY`, and `ORACLE_GATEWAY_TIMEOUT_MS` are fetched strictly from server environment variables via `Deno.env.get()`. Never exposed to client. |
| **Private Oracle Endpoint Dispatch** | **PASS** | Requests dispatch strictly to `${gatewayUrl}/v1/analyze` via HTTP `POST` with `X-API-Key` header. |
| **Timeout & Error Handling** | **PASS** | Configured with `AbortController` bound to `ORACLE_GATEWAY_TIMEOUT_MS` (35,000 ms). Catches timeouts and connection aborts, returning graceful fallback payloads with `trend: "INSUFFICIENT_DATA"` so deterministic frontend analytics remain functional. |
| **Output Sanitization & Credential Redaction** | **PASS** | Outgoing analytics payload is scrubbed by `assertCredentialSafety()` and `maskStudentIdentifiers()`. Incoming model text is checked for script tags, SQL injection patterns, and bounded in length. All error messages have tokens redacted via regex. |
| **Rate Limiting** | **PASS** | Implements an in-memory token bucket per authenticated `userId` (lines 19–38), enforcing a strict cap of 60 requests per hour with HTTP 429 response. |

---

## 3. Phase 2 — Configuration & Pre-Flight Check

- **Linked Supabase Project:** Verified as `eddsaafwwmtfnjukxamx` (`aiet-unisphere`, production).
- **Remote Secret Verification:**
  - `ORACLE_GATEWAY_URL` — Present and configured remotely.
  - `ORACLE_GATEWAY_API_KEY` — Present and configured remotely.
  - `ORACLE_GATEWAY_TIMEOUT_MS` — Present and configured remotely.
  - `SUPABASE_SERVICE_ROLE_KEY` — System platform default.
  - `SUPABASE_ANON_KEY` — System platform default.
  - `SUPABASE_URL` — System platform default.
- **Pending/Unrelated Functions:** Legacy unauthenticated prototypes (`get-signed-url` and `generate-leave-pdf`) were previously quarantined to `backups/quarantine/functions/` and are excluded from deployment.

---

## 4. Proposed Remediation for `identifier-login`

To satisfy the rate-limiting and abuse protection requirement without altering frontend contracts or adding external dependencies, `identifier-login/index.ts` should be updated with a dual-key rate limiter:

1. **Client IP Rate Limiting:** Track requests per client IP (derived from `x-forwarded-for` or `cf-connecting-ip`) — e.g., max 15 requests per minute per IP.
2. **Identifier Attempt Throttling:** Track failed authentication attempts per identifier — e.g., max 5 failed attempts per 15-minute window per identifier, preventing targeted password spraying against specific USNs/Employee IDs.
3. **HTTP 429 Response:** Return `{ error: "Too many login attempts. Please try again later." }` with HTTP status `429` when thresholds are exceeded.

### Recommended Implementation Patch

```typescript
// ============================================================
// RATE LIMITING & ABUSE PROTECTION
// Dual-window in-memory limiter: per Client IP and per Identifier
// ============================================================
interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const ipBuckets = new Map<string, RateLimitBucket>();
const identifierBuckets = new Map<string, RateLimitBucket>();

const MAX_IP_REQUESTS_PER_MINUTE = 15;
const IP_WINDOW_MS = 60 * 1000;

const MAX_IDENTIFIER_ATTEMPTS = 5;
const IDENTIFIER_LOCKOUT_MS = 15 * 60 * 1000;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || "unknown-ip";
}

function checkIpRateLimit(ip: string): boolean {
  if (ip === "unknown-ip") return true;
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now > bucket.resetTime) {
    ipBuckets.set(ip, { count: 1, resetTime: now + IP_WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_IP_REQUESTS_PER_MINUTE) return false;
  bucket.count++;
  return true;
}

function checkIdentifierRateLimit(id: string): boolean {
  const now = Date.now();
  const bucket = identifierBuckets.get(id);
  if (!bucket || now > bucket.resetTime) {
    return true; // Not locked out
  }
  return bucket.count < MAX_IDENTIFIER_ATTEMPTS;
}

function recordFailedIdentifierAttempt(id: string): void {
  const now = Date.now();
  const bucket = identifierBuckets.get(id);
  if (!bucket || now > bucket.resetTime) {
    identifierBuckets.set(id, { count: 1, resetTime: now + IDENTIFIER_LOCKOUT_MS });
  } else {
    bucket.count++;
  }
}

function clearIdentifierAttempts(id: string): void {
  identifierBuckets.delete(id);
}
```

---

## 5. Summary of Actions Taken & Next Steps

1. **Deployment Status:** **Zero functions deployed** to remote production.
2. **Production Integrity:** No production database objects or secrets were modified.
3. **Documented Findings:** Detailed security review findings saved to `docs/audit/MISSION_05_DEPLOYMENT_RESULTS.md`.
4. **Action Required:**
   - Review the identified rate-limiting vulnerability in `identifier-login`.
   - Provide approval to apply the rate-limiting remediation patch to `supabase/functions/identifier-login/index.ts`.
   - Upon applying and verifying the patch, proceed with Phase 3 (`identifier-login`) and Phase 4 (`local-llm-analyze`) deployment.

