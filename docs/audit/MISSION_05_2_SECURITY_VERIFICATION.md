# MISSION 05.2 — Identifier Login Rate-Limiting Security Verification Report

**Project:** AIET-UniSphere  
**Supabase Reference:** `eddsaafwwmtfnjukxamx`  
**Date:** November 7, 2026  
**Auditor:** Senior Application Security Engineer & Supabase Database Architect  
**Review Mode:** Read-Only Source Code & SQL Verification  
**Executive Verdict:** **CONDITIONAL PASS** (Requires 2 Security Remediations Prior to Production Edge Function Deployment)

---

## 1. Executive Summary

An independent, line-by-line inspection of the Mission 05.1 implementation was conducted across all SQL migrations, Edge Function code, automated tests, and configuration files.

### Verdict Breakdown
- **SQL Migration (`00036_identifier_login_rate_limiting.sql`):** **PASS (Safe for Schema Application)**. The migration is purely additive, implements strict row-level isolation, enforces `SECURITY DEFINER` with fixed `search_path = public, pg_temp`, and restricts execution strictly to `service_role`.
- **Edge Function (`identifier-login/index.ts`):** **CONDITIONAL PASS (Hold Deployment)**. While atomic rate limiting, uniform 401 failure handling, and input validation are functional, two security gaps were identified:
  1. Plain SHA-256 allows offline dictionary enumeration of low-entropy USNs/Employee IDs if database rows are read.
  2. Client IP extraction allows header spoofing if requests bypass Cloudflare, and defaults to a shared `"127.0.0.1"` bucket that can cause accidental denial-of-service.
- **Automated Test Suite (`tests/identifier_login_rate_limiting.test.mjs`):** **CONDITIONAL PASS**. Tests 1–11 validate logical rules using a JavaScript in-memory mock class (`DatabaseRateLimiter`), not the actual PostgreSQL PL/pgSQL stored procedures. PL/pgSQL concurrency and row locking under load remain unproven against live PostgreSQL.

---

## 2. Classified Security Findings

| ID | Severity | Category | File Path & Lines | Title |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-05-01** | **HIGH** | Identifier Privacy | `supabase/functions/identifier-login/index.ts:46-52` | Plain SHA-256 Enables Offline Rainbow-Table Enumeration of Predictable USNs |
| **SEC-05-02** | **MEDIUM** | IP Trust & Spoofing | `supabase/functions/identifier-login/index.ts:28-42` | Untrusted `X-Forwarded-For` Fallback & Shared IP DoS Vector |
| **SEC-05-03** | **MEDIUM** | Database Maintenance | `supabase/migrations/00036_identifier_login_rate_limiting.sql:1-26` | Unbounded Table Storage Growth (Missing Expired Window Pruning) |
| **SEC-05-04** | **LOW** | Test Realism | `tests/identifier_login_rate_limiting.test.mjs:71-154` | Rate-Limiter Unit Tests Rely on JavaScript Mock Class Rather than Real PL/pgSQL |

---

## 3. Detailed Security Checks & Evidence

### A. Identifier Privacy (Finding SEC-05-01)
- **Code Inspected:** `supabase/functions/identifier-login/index.ts`, lines 46–52:
  ```typescript
  async function hashIdentifier(rawIdentifier: string): Promise<string> {
    const normalized = rawIdentifier.trim().toUpperCase();
    const data = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  ```
- **Evidence & Vulnerability:**
  - AIET college USNs follow a strict, predictable format: `4AL` + 2-digit year (e.g. `21`, `22`, `23`, `24`, `25`) + 2-character branch code (e.g. `CS`, `IS`, `EC`, `ME`) + 3-digit serial (`001`–`200`).
  - Total USN keyspace is under 100,000 combinations.
  - Plain unsalted `SHA-256` can be fully precomputed into a rainbow table in less than 2 seconds on modern consumer hardware.
  - If a read-only database leak or backup exposure occurs, an attacker can reverse all hashed records in `auth_rate_limits` instantly.
- **Normalization Consistency:**
  - Key normalization is strictly consistent: `identifier.trim().toUpperCase()` is used for hashing (line 47), DB lookup (line 113), failed attempt recording (lines 122, 133), and clearance on success (line 138).
- **Required Remediation:**
  - Upgrade `hashIdentifier` to **HMAC-SHA-256** using a server-side secret (e.g., `RATE_LIMIT_HMAC_SECRET` or derived from `SUPABASE_SERVICE_ROLE_KEY`):
    ```typescript
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(Deno.env.get("RATE_LIMIT_HMAC_KEY") ?? serviceRoleKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", hmacKey, data);
    ```
  - The secret remains strictly inside the Edge Function environment and is never transmitted to the browser or stored in PostgreSQL.

---

### B. Client IP Trust & Spoofing (Finding SEC-05-02)
- **Code Inspected:** `supabase/functions/identifier-login/index.ts`, lines 21–44:
  ```typescript
  function getTrustedClientIp(req: Request): string {
    const cfIp = req.headers.get("cf-connecting-ip");
    if (cfIp && isValidIp(cfIp.trim())) return cfIp.trim();

    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",");
      for (const part of parts) {
        const candidate = part.trim();
        if (isValidIp(candidate)) return candidate;
      }
    }

    const realIp = req.headers.get("x-real-ip");
    if (realIp && isValidIp(realIp.trim())) return realIp.trim();

    return "127.0.0.1";
  }
  ```
- **Evidence & Vulnerability:**
  1. **Header Order:** `cf-connecting-ip` is checked first, followed by `x-forwarded-for`, `x-real-ip`, and fallback to `"127.0.0.1"`.
  2. **Spoofing Risk:** When requests route through Cloudflare, `cf-connecting-ip` is reliably overwritten by Cloudflare's edge. However, if any request reaches the function without `cf-connecting-ip` (e.g., direct Kong gateway invocation or internal service calls), the function reads the *first* comma-separated token in `x-forwarded-for`. A client can inject `X-Forwarded-For: 203.0.113.1` to bypass IP-based rate limiting by spoofing a fresh IP on each attempt.
  3. **Shared Fallback Denial-of-Service:** If headers are stripped or absent, all such clients resolve to `"127.0.0.1"`. In this case, 15 failed logins across *different* legitimate users would lock out *all* users sharing the `"127.0.0.1"` bucket.
- **Required Remediation:**
  - In production Supabase Edge Functions hosted behind Cloudflare, `cf-connecting-ip` must be treated as the sole authoritative client IP.
  - If `cf-connecting-ip` is absent, use the *last* non-private IP in `x-forwarded-for` (appended by trusted proxy), or require a dedicated rate-limit client token.

---

### C. PostgreSQL Security & RPC Analysis
- **Code Inspected:** `supabase/migrations/00036_identifier_login_rate_limiting.sql`:
  - `check_and_increment_ip_rate_limit(p_client_ip TEXT)` (Lines 36–75)
  - `check_identifier_rate_limit(p_identifier_hash TEXT)` (Lines 77–114)
  - `record_failed_identifier_attempt(p_identifier_hash TEXT)` (Lines 116–163)
  - `clear_identifier_rate_limit(p_identifier_hash TEXT)` (Lines 165–174)

| Criteria | Verification Result | Evidence |
| :--- | :--- | :--- |
| **`SECURITY DEFINER` & `search_path`** | **PASS** | Every function explicitly defines `SECURITY DEFINER SET search_path = public, pg_temp;` (Lines 40, 77, 126, 175). |
| **Least-Privilege Execution Grants** | **PASS** | Lines 184–194 revoke all permissions from `PUBLIC`, `anon`, and `authenticated`, granting execution strictly to `service_role`. |
| **Row Level Security** | **PASS** | Line 28: `ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;`. Zero policies exist for unprivileged users. Table is inaccessible via standard PostgREST API. |
| **Atomic Concurrency Safety** | **PASS** | `INSERT ... ON CONFLICT (bucket_key) DO UPDATE` operates under row-level lock. Two simultaneous requests increment sequentially without lost updates. |
| **Window Expiry & Resets** | **PASS** | Correctly resets `request_count = 1` and advances `expires_at` whenever `auth_rate_limits.expires_at <= v_now` (Lines 57–64, 147–154). |
| **SQL Injection Safety** | **PASS** | All parameters use static parameterized SQL with string concatenation bounded strictly to sanitized variables (`'ip:' || trim(p_client_ip)`). No dynamic `EXECUTE` used. |
| **Storage Growth (SEC-05-03)** | **MEDIUM FINDING** | Table `auth_rate_limits` has an index on `expires_at` (Line 24), but contains **no pruning trigger, automated cleanup, or pg_cron job**. Over time, expired records will accumulate. |

- **Storage Growth Remediation:**
  Add opportunistic pruning inside `check_and_increment_ip_rate_limit` (e.g., `DELETE FROM public.auth_rate_limits WHERE expires_at < v_now - INTERVAL '1 hour';` with a 1% probability filter or scheduled maintenance).

---

### D. Authentication Behavior & Anti-Enumeration
- **Failure Counting Points:**
  - `record_failed_identifier_attempt` is invoked at line 122 (lookup error / profile inactive) and line 133 (bad password).
  - Failed attempts are never incremented before credential evaluation.
- **Lockout Threshold:**
  - On the 5th failed attempt, `record_failed_identifier_attempt` returns `allowed: false`. The user receives HTTP 401 for that attempt.
  - On the 6th attempt, `check_identifier_rate_limit` triggers at line 106 *before* querying `profiles`, returning HTTP `429 { error: "Too many failed attempts..." }`. Exactly 5 failures are permitted.
- **Targeted Cache Clearance:**
  - Successful authentication calls `clear_identifier_rate_limit` with the specific user's `identifierHash` (line 138), clearing only that user's failure counter.
- **Anti-Enumeration Uniformity:**
  - Non-existent user, inactive account, and invalid password all return identical payload and status:
    `{ error: "Invalid credentials or account unavailable." }, 401` (Lines 123, 134).
  - Rate-limit 429 errors do not reveal whether the identifier exists.

---

### E. Test Quality & Realism (Finding SEC-05-04)
- **Code Inspected:** `tests/identifier_login_rate_limiting.test.mjs`
  - **Tests 1–11:** Exercise an in-memory JavaScript class `DatabaseRateLimiter` (lines 71–154). While mathematically verifying the rate-limiting algorithm, these tests **do not execute PostgreSQL PL/pgSQL**.
  - **Test 12:** Uses `pg-mem` to execute `CREATE TABLE` and raw SQL `INSERT ... ON CONFLICT DO UPDATE`. However, `pg-mem` does not support PL/pgSQL procedural language blocks, meaning the actual stored procedure definitions (`check_and_increment_ip_rate_limit`, etc.) were not executed by the test runner.
- **Remaining Unproven Properties:**
  - PL/pgSQL clock drift (`clock_timestamp()` vs `now()`) on high-concurrency production PostgreSQL.
  - PostgREST RPC serialization of `jsonb` return types.
  - Live execution against production database connection pool.

---

## 4. Migration & Deployment Safety

### Migration 00036 Safety Assessment: **SAFE TO APPLY**
- **Additive Schema:** Creates one new standalone table `public.auth_rate_limits` and 4 new stored procedures.
- **Zero Collision Risk:** Table name and function names do not collide with any of migrations 00001–00035.
- **Zero Data Risk:** Does not modify or drop existing tables, columns, indexes, foreign keys, or triggers. Requires zero data backfill.
- **Rollback Complexity:** Extremely low. Can be completely reversed by dropping the 4 functions and dropping `auth_rate_limits`.

### Supabase CLI Dry-Run Command
- Installed CLI version: **`3.0.0`**
- In Supabase CLI 3.0.0, the non-destructive dry-run command is:
  ```bash
  npx supabase db push --dry-run --remote
  ```
- **Execution Note:** Per strict restrictions, this dry-run command was **not executed** during this read-only review. The command prints pending migrations without applying changes.

---

## 5. Deployment Readiness Verdict

| Component | Target Project | Status | Deployment Recommendation |
| :--- | :--- | :--- | :--- |
| **Migration `00036`** | `eddsaafwwmtfnjukxamx` | **PASS** | Safe to apply via `supabase db push`. |
| **Edge Function `local-llm-analyze`** | `eddsaafwwmtfnjukxamx` | **PASS** | Fully audited in Mission 04/05. Secrets already configured remotely. Safe to deploy. |
| **Edge Function `identifier-login`** | `eddsaafwwmtfnjukxamx` | **CONDITIONAL** | **Hold deployment** until HMAC-SHA-256 upgrade (SEC-05-01) and Cloudflare IP enforcement (SEC-05-02) are implemented. |

---

## 6. Required Remediations Before Deployment

1. **HMAC-SHA-256 Upgrade:** Replace plain `SHA-256` in `hashIdentifier` with `HMAC-SHA-256` using `SUPABASE_SERVICE_ROLE_KEY` as the cryptographic salt.
2. **Cloudflare IP Hardening:** Enforce `cf-connecting-ip` as primary header and reject arbitrary spoofed `X-Forwarded-For` chains.
3. **Storage Pruning:** Add an opportunistic `DELETE FROM auth_rate_limits WHERE expires_at < v_now - INTERVAL '1 hour'` in migration 00036 to bound long-term table storage.

**Awaiting project-owner review and instructions before making any code or database changes.**

