# MISSION 05.8 — Rate Limiting Security Remediation Review Report

**Project:** AIET-UniSphere  
**Production Project Reference:** `eddsaafwwmtfnjukxamx`  
**Review Type:** READ-ONLY SECURITY REVIEW & PRE-DEPLOYMENT AUDIT  
**Date:** November 7, 2026  
**Auditor:** Senior Supabase Security Engineer & PostgreSQL Database Architect  
**Status:** COMPLETE — ZERO PRODUCTION MUTATIONS EXECUTED — STOPPING FOR OWNER APPROVAL  

---

## 1. Executive Summary

Mission 05.8 performed an exhaustive read-only security audit of the AIET-UniSphere production rate-limiting and abuse-protection architecture. 

### Key Audit Findings
1. **Remote Database State:** The production database ledger currently records migrations `00001` through `00036`. The storage table `public.auth_rate_limits` is live and protected by Row Level Security (RLS).
2. **PL/pgSQL Syntax Exception on PostgreSQL 16 Engine:** The stored procedures initially recorded under migration `00036` contain a syntax error where language special forms (`GREATEST` and `LEAST`) were schema-qualified as `pg_catalog.greatest(...)` and `pg_catalog.least(...)`. In PostgreSQL standard SQL grammar, these are reserved expressions (like `COALESCE` and `CASE`), not catalog functions. Calling them causes a runtime exception:
   `ERROR: function pg_catalog.greatest(integer, integer) does not exist`.
3. **Remediation Strategy:** In accordance with the immutable migration rule (never mutating already applied migrations), a **forward-only migration `00037_rate_limit_procedure_correction.sql`** has been prepared. Supabase CLI dry-run confirms that `00037` is recognized as the exact and only pending migration.
4. **Edge Function Security Posture:** `supabase/functions/identifier-login/index.ts` enforces strict HMAC-SHA-256 identifier derivation with domain separation (`aiet:auth:identifier:v1:`), fails closed with HTTP 503 if `RATE_LIMIT_HMAC_SECRET` is missing, and never logs or persists raw identifiers.
5. **Zero Disruption Guarantee:** The rate-limiting architecture is completely decoupled from core schemas (`profiles`, `departments`, `timetable_entries`). Core university workflows remain 100% operational.

---

## 2. Procedure Audit & Comparison: Migration 00036 vs. Proposed 00037

### 2.1. The Five Rate-Limiting Procedures

| # | Stored Procedure Signature | Purpose | PostgreSQL 16 Defect in 00036 | Correction in Proposed 00037 |
|---|---|---|---|---|
| **1** | `check_and_increment_ip_rate_limit(p_client_ip text)` | Atomic IP window increment (15 req/60s) | Uses `pg_catalog.greatest` for `retry_after` and `remaining` | Replaced with unqualified `GREATEST(...)` |
| **2** | `check_identifier_rate_limit(p_identifier_hash text)` | Pre-check for locked-out identifiers (5 failed/15m) | Uses `pg_catalog.greatest` for `retry_after` and `remaining` | Replaced with unqualified `GREATEST(...)` |
| **3** | `record_failed_identifier_attempt(p_identifier_hash text)` | Increments failed login count on bad credentials | Uses `pg_catalog.greatest` for `retry_after` and `remaining` | Replaced with unqualified `GREATEST(...)` |
| **4** | `clear_identifier_rate_limit(p_identifier_hash text)` | Clears failed attempt bucket on successful login | None (syntactically clean) | Preserved with full privilege hardening |
| **5** | `prune_expired_auth_rate_limits(p_batch_size int4)` | Non-blocking maintenance cleanup (`SKIP LOCKED`) | Uses `pg_catalog.greatest(..., pg_catalog.least(...))` | Replaced with `GREATEST(..., LEAST(...))` |

### 2.2. Procedure Security Attributes Inspection
All five procedures across `00036` and proposed `00037` strictly enforce:
- **`SECURITY DEFINER`:** Executes with the elevated privileges of the creator (`postgres`), allowing access to `public.auth_rate_limits` despite caller restrictions.
- **`SET search_path = ''`:** Secures all internal function logic against schema-shadowing and Trojan horse attacks by ensuring unqualified objects do not search user schemas.
- **Unqualified SQL Expressions:** Core language forms (`GREATEST`, `LEAST`, `COALESCE`, `NULLIF`, `CASE`) are evaluated by PostgreSQL's grammar parser directly and do not require or allow schema prefixes.
- **Privilege Separation:**
  ```sql
  REVOKE ALL ON FUNCTION public.<proc_name>(...) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.<proc_name>(...) TO service_role;
  ```
  This guarantees that neither anonymous public callers nor authenticated standard users can invoke the rate-limiting procedures directly via the Supabase REST API (`/rest/v1/rpc/...`).

---

## 3. Forward-Only Migration 00037 Verification

### 3.1. Proposed Migration File
Created file: `supabase/migrations/00037_rate_limit_procedure_correction.sql`
- **Design:** Pure forward-only DDL using `CREATE OR REPLACE FUNCTION` and explicit permission grants.
- **Non-Destructive:** Does not alter table columns, primary keys, or indexes. Existing active rate-limit buckets are left intact.

### 3.2. Dry-Run Verification Evidence
Executed read-only dry run against production project `eddsaafwwmtfnjukxamx`:
```powershell
npx supabase db push --dry-run --remote
```
**Command Output:**
```
Target: project aiet-unisphere (eddsaafwwmtfnjukxamx) · production
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 00037_rate_limit_procedure_correction.sql
{"upToDate":false,"dryRun":true,"migrations":["00037_rate_limit_procedure_correction.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push.","target":{"kind":"linked","project_ref":"eddsaafwwmtfnjukxamx","project_name":"aiet-unisphere","environment":"production"}}
```
**Finding:** Migration `00037` cleanly integrates with Supabase migration tracking as the single, unambiguous pending migration without version collisions.

---

## 4. Cryptographic HMAC Identifier Protection Audit

### 4.1. Edge Function Secret Storage
In `supabase/functions/identifier-login/index.ts`:
- **Secret Retrieval:** `Deno.env.get("RATE_LIMIT_HMAC_SECRET")?.trim()`.
- **Validation:** Enforces strict regex `/^[0-9a-fA-F]{64}$/` (exactly 32 bytes).
- **Strict Key Separation:** All fallbacks to `SUPABASE_SERVICE_ROLE_KEY` have been completely removed.
- **Fail-Closed Gate:** If `RATE_LIMIT_HMAC_SECRET` is missing, unconfigured, or invalid, the function immediately halts and returns HTTP `503 Service Unavailable` with generic client error:
  `{"error": "Authentication service is temporarily unavailable."}`
  No backend queries or GoTrue calls are made.

### 4.2. Normalization & Domain Separation
```typescript
const HMAC_DOMAIN_PREFIX = "aiet:auth:identifier:v1:";
const normalized = rawIdentifier.trim().toUpperCase();
const domainSeparatedMessage = `${HMAC_DOMAIN_PREFIX}${normalized}`;
```
- **Normalization:** Trimming whitespace and converting to uppercase ensures that `4AI21CS001`, `  4ai21cs001  `, and `4Ai21Cs001` produce identical HMAC values, preventing attackers from bypassing brute-force limits via casing tricks.
- **Domain Separation & Key Versioning:** The `aiet:auth:identifier:v1:` prefix guarantees that derived HMACs cannot collide with or be repurposed for other application features. Future key or algorithm updates can simply bump the version tag to `v2:`.

### 4.3. Identifier Privacy in Storage and Logging
- **Database Table (`auth_rate_limits`):** The primary key stored is `'id:' || v_clean_hash`. The raw USN / Employee ID is **never passed to PostgreSQL** and never stored.
- **Logging:** Console errors print only `error.message`. Plaintext identifiers, passwords, emails, and session tokens are strictly excluded from logs.

---

## 5. Atomicity & Concurrency Behavior

### 5.1. Atomic Serialization via Row-Level Locks
Both IP and identifier counters utilize atomic PostgreSQL `INSERT ... ON CONFLICT (bucket_key) DO UPDATE`:
```sql
INSERT INTO public.auth_rate_limits (bucket_key, bucket_type, request_count, ...)
VALUES (v_key, 'IP', 1, ...)
ON CONFLICT (bucket_key) DO UPDATE
SET
  request_count = CASE
    WHEN public.auth_rate_limits.expires_at <= v_now THEN 1
    ELSE public.auth_rate_limits.request_count + 1
  END, ...
RETURNING request_count, expires_at INTO v_count, v_expires;
```
- When multiple requests hit the same bucket key concurrently, PostgreSQL's row-level lock on the conflicting row serializes the transactions.
- There is **no read-then-write race condition (TOCTOU)**. The increment and threshold check occur within the same atomic statement.

### 5.2. Concurrency Test Evidence
During Mission 05.6 live testing on PostgreSQL 16:
- 30 concurrent, parallel client processes executed simultaneous calls against `check_and_increment_ip_rate_limit`.
- **Result:** Exactly 15 requests received `allowed: true`; exactly 15 requests received `allowed: false`.
- Table inspection verified `request_count` updated to exactly `30`. Zero lost updates; zero threshold bypasses.

---

## 6. Client IP Extraction & Anti-Spoofing Audit

### 6.1. Header Precedence & Trusted Reverse Proxy Path
`extractCandidateClientIp(req)` in `identifier-login`:
1. **Cloudflare Connecting IP (`cf-connecting-ip`):** Supabase Edge Functions execute in Deno Deploy behind Cloudflare edge infrastructure. Cloudflare strips client-supplied `cf-connecting-ip` headers and sets it authoritatively to the client's TCP connecting IP.
2. **Reverse Proxy Inspection (`x-forwarded-for`):** If `cf-connecting-ip` is absent, the header is split and traversed **from right to left** (reverse order). In standard proxy chains, clients prepend spoofed IPs to the left, while legitimate reverse proxies append client hops to the right. Taking the rightmost valid public candidate prevents client spoofing.
3. **Private IP Filtering:** Evaluated against `isPrivateIp()`:
   - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `fc00::/7`, `fe80::/10`, `::1`.
   - Private addresses are rejected.
4. **No Shared Fallback Bucket:** If no trustworthy public IP can be extracted, the function returns `null`. This prevents collapsing untrusted clients into a shared bucket (e.g., `127.0.0.1` or `'unknown'`), which would allow one attacker to DoS all clients. Returning `null` bypasses IP rate limiting for that request while keeping identifier rate limiting 100% active.

---

## 7. Rate Limits & Anti-Enumeration Verification

| Parameter | Configured Value | Enforcement Location | Client Response When Exceeded |
|---|---|---|---|
| **Max Requests per IP** | 15 requests / 60 seconds | `check_and_increment_ip_rate_limit` | HTTP `429 Too Many Requests`<br>`{"error": "Too many login requests from your network. Please try again later."}`<br>`Retry-After: <seconds>` |
| **Max Identifier Failures** | 5 failed attempts / 15 minutes | `check_identifier_rate_limit`<br>`record_failed_identifier_attempt` | HTTP `429 Too Many Requests`<br>`{"error": "Too many failed login attempts for this identifier. Please try again later."}`<br>`Retry-After: <seconds>` |
| **Failed Attempt Quota Reset** | On successful login | `clear_identifier_rate_limit` | Counter purged immediately upon password authentication |

### 7.1. Account Enumeration Defense
The function returns identical HTTP `401 Unauthorized` responses across all authentication failure conditions:
- Identifier does not exist in `profiles`: `{"error": "Invalid credentials or account unavailable."}`
- Profile exists but `account_status != 'ACTIVE'`: `{"error": "Invalid credentials or account unavailable."}`
- Password incorrect in GoTrue: `{"error": "Invalid credentials or account unavailable."}`
- Malformed format: `{"error": "Invalid credentials."}`
Attackers cannot determine whether a given USN or Employee ID exists at the institution.

---

## 8. RPC & Table Exposure Audit

### 8.1. Row Level Security & Table Isolation
- Table `public.auth_rate_limits` has RLS enabled (`rowsecurity = true`).
- `REVOKE ALL ON TABLE public.auth_rate_limits FROM PUBLIC, anon, authenticated;`
- Live REST API probe against production:
  ```powershell
  GET https://eddsaafwwmtfnjukxamx.supabase.co/rest/v1/auth_rate_limits
  ```
  **Observed Response:** HTTP `401 Unauthorized`
  ```json
  {
    "code": "42501",
    "message": "permission denied for table auth_rate_limits"
  }
  ```

### 8.2. RPC Execution Revocation
- Live REST API probe against production:
  ```powershell
  POST https://eddsaafwwmtfnjukxamx.supabase.co/rest/v1/rpc/check_and_increment_ip_rate_limit
  ```
  **Observed Response:** HTTP `401 Unauthorized`
  ```json
  {
    "code": "42501",
    "message": "permission denied for function check_and_increment_ip_rate_limit"
  }
  ```
- Ordinary clients, anonymous attackers, and authenticated students/faculty **cannot invoke, inspect, reset, or bypass** rate-limit counters directly.

---

## 9. Rollback & Dependency Analysis

### 9.1. Database Dependency Audit
- **Foreign Keys:** `public.auth_rate_limits` has **zero foreign key references** to any table (`profiles`, `departments`, etc.), and no core tables reference it.
- **Views & Triggers:** Zero views, triggers, or core procedures reference `auth_rate_limits`.
- **Decoupling Verdict:** Dropping or altering `auth_rate_limits` will have **zero impact** on attendance, assessments, grading, timetables, or user accounts.

### 9.2. Emergency Database Rollback SQL
If the rate-limiting procedures must be dropped in an emergency:
```sql
REVOKE EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.check_identifier_rate_limit(text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.record_failed_identifier_attempt(text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.clear_identifier_rate_limit(text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.prune_expired_auth_rate_limits(int4) FROM service_role;

DROP FUNCTION IF EXISTS public.check_and_increment_ip_rate_limit(text);
DROP FUNCTION IF EXISTS public.check_identifier_rate_limit(text);
DROP FUNCTION IF EXISTS public.record_failed_identifier_attempt(text);
DROP FUNCTION IF EXISTS public.clear_identifier_rate_limit(text);
DROP FUNCTION IF EXISTS public.prune_expired_auth_rate_limits(int4);

DROP TABLE IF EXISTS public.auth_rate_limits CASCADE;
```
*Note:* Before dropping database objects, `identifier-login` Edge Function must first be rolled back to commit `557f381` so it does not attempt to invoke non-existent RPCs.

---

## 10. Architectural Documentation: In-Memory Rate Limiting in `local-llm-analyze`

The `local-llm-analyze` Edge Function contains an in-memory token bucket (`MAX_REQUESTS_PER_HOUR = 60`) keyed by `user.id`.

### Risk Analysis
1. **Serverless Ephemerality:** Deno Deploy isolates are spun up on demand and recycled after idle periods (~5–15 minutes). When an isolate terminates, in-memory counters reset to 0.
2. **Multi-Region & Auto-Scaling:** Requests from the same user that hit different regional edge instances maintain independent memory maps. An authenticated user could theoretically exceed 60 requests/hour across multiple concurrent isolates.
3. **Acceptability & Scope Boundary:**
   - The endpoint strictly requires JWT authentication and verifies that `profile.account_status === 'ACTIVE'`.
   - It performs read-only server-side analytics reconstruction and cannot corrupt database state.
   - The upstream Oracle Cloud gateway enforces its own rate bounds and timeouts.
   - In accordance with Mission 05.8 restrictions, modifying `local-llm-analyze` is out of scope. For future phases, an atomic database rate-limiter or Redis/Upstash token bucket can be introduced if global strictness is required.

---

## 11. Secret-Rotation Impact Assessment

If `RATE_LIMIT_HMAC_SECRET` is rotated in the production vault:
1. **Impact on User Accounts:** **ZERO**. Passwords, email addresses, profiles, and GoTrue JWT sessions are untouched.
2. **Impact on Rate-Limit State:** Rotating the secret alters the derived HMAC digest for all identifiers. Existing locked-out identifiers will have their lockout cleared immediately (their old hash bucket will expire naturally after 15 minutes and be pruned).
3. **Downtime:** **ZERO**. The new secret takes effect immediately upon the next function invocation.

---

## 12. Deployment Checklist & Explicit Stop Conditions

When approved by the project owner, execution MUST proceed in this exact sequence:

```mermaid
flowchart TD
    A["Pre-Check: Verify RATE_LIMIT_HMAC_SECRET offline"] --> B["Step 1: Deploy Migration 00037 (npx supabase db push --remote)"]
    B -->|Check db push output| C{"Migration Successful?"}
    C -->|No: STOP| D["STOP: Do not proceed. Investigate migration error."]
    C -->|Yes| E["Step 2: Set RATE_LIMIT_HMAC_SECRET in Production Vault"]
    E --> F["Step 3: Deploy identifier-login (--no-verify-jwt)"]
    F --> G["Step 4: Deploy local-llm-analyze"]
    G --> H["Step 5: Execute Smoke Tests"]
    H -->|Smoke Tests Fail| I["Invoke Rollback Procedure"]
    H -->|Smoke Tests Pass| J["Production Deployment Successful"]
```

### Explicit Mandatory Stop Conditions
> [!CAUTION]
> **HALT IMMEDIATELY if any of the following occur during deployment:**
> 1. `npx supabase db push --remote` produces any SQL errors or attempts to push unexpected migrations beyond `00037`.
> 2. `npx supabase secrets list` fails to show `RATE_LIMIT_HMAC_SECRET`.
> 3. `identifier-login` returns HTTP 500 or 503 during post-deployment smoke tests.
> 4. Valid user login fails.

---

## 13. Security Review Verdict

| Component | Status | Review Verdict |
|---|---|---|
| `supabase/migrations/00037_rate_limit_procedure_correction.sql` | **PROPOSED** | **READY FOR PRODUCTION DEPLOYMENT** |
| `supabase/functions/identifier-login/index.ts` | **SECURITY VERIFIED** | **READY FOR DEPLOYMENT** (Requires secret `RATE_LIMIT_HMAC_SECRET`) |
| `local-llm-analyze` Edge Function | **ARCHITECTURALLY AUDITED** | **READY FOR DEPLOYMENT** |

In accordance with the final requirement of Mission 05.8:
**Execution is HALTED. All reports and proposed migration files are staged. Awaiting explicit project-owner approval before any production operation.**

