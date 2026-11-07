# MISSION 04 — Supabase Edge Functions & Backend Integration Recovery Report

**Project:** AIET-UniSphere  
**Supabase Reference:** `eddsaafwwmtfnjukxamx`  
**Date:** November 7, 2026  
**Auditor:** Senior Supabase Edge Functions Engineer & Backend Integration Architect  
**Status:** Audit & Deployment Plan Ready — Pending Owner Approval  

---

## Executive Summary

Mission 04 conducted an exhaustive audit of all local Edge Functions (`supabase/functions/`), compared them against live deployed functions in Supabase project `eddsaafwwmtfnjukxamx`, audited remote secrets configuration, traced all frontend invocations from UI to backend contracts, and performed an application security review for each function.

### Key Audit Findings

1. **Remote Deployed Functions (3 Active):**
   - `admin-provision-user` (Active, `verify_jwt: false` — performs manual admin JWT verification)
   - `ai-chat` (Active, `verify_jwt: false` — performs manual user JWT verification)
   - `ingest-document` (Active, `verify_jwt: true` — Kong verifies JWT)

2. **Genuinely Required Local Functions (4 Discovered):**
   - **`identifier-login` (P0 - CRITICAL BLOCKER):** Required for USN and Employee ID login across all roles. Missing remotely, which causes non-email logins in production to fail with HTTP 404. Uses standard platform environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Requires `--no-verify-jwt` because callers are unauthenticated prior to logging in.
   - **`local-llm-analyze` (P1 - CORE FEATURE):** Required for student/faculty/HOD AI analytics dashboards (`/student/analytics`, `/hod/analytics`). Communicates with the private Oracle Cloud FastAPI gateway. All required secrets (`ORACLE_GATEWAY_URL`, `ORACLE_GATEWAY_API_KEY`, `ORACLE_GATEWAY_TIMEOUT_MS`) are **already configured** in production Supabase secrets.
   - **`github-oauth` (P2 - OPTIONAL EXTENSION):** Required for GitHub account linking in `GitGithubPage.tsx`. Requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, which are **not yet configured** in remote secrets.
   - **`github-api` (P2 - OPTIONAL EXTENSION):** Secure proxy for authenticated GitHub API calls. Relies on `github_connections` table populated by `github-oauth`.

3. **Obsolete / Insecure Functions to Quarantine (2 Discovered):**
   - **`get-signed-url`:** Legacy prototype from leave attachments. Has zero authentication, no CORS options handler, uses `SUPABASE_SERVICE_ROLE_KEY` blindly. The active `leaveService.ts` uses the Supabase client Storage SDK directly. This function is **unreferenced** by active routes and must **NOT** be deployed.
   - **`generate-leave-pdf`:** Unrouted prototype using deprecated Google Chart APIs and unconfigured storage buckets. Completely unreferenced in `src/`. Must **NOT** be deployed.

---

## 1. Edge Function Inventory: Local vs. Remote

| Function Name | Local Path | Remote Status | Remote verify_jwt | Frontend Caller(s) | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `identifier-login` | `supabase/functions/identifier-login` | **MISSING** | N/A | `src/services/authService.ts:29` | **P0 (Critical)** |
| `local-llm-analyze` | `supabase/functions/local-llm-analyze` | **MISSING** | N/A | `src/services/localLLMProvider.ts:116` | **P1 (High)** |
| `github-oauth` | `supabase/functions/github-oauth` | **MISSING** | N/A | `src/services/githubService.ts:84` | **P2 (Deferred)** |
| `github-api` | `supabase/functions/github-api` | **MISSING** | N/A | `src/services/githubService.ts:25` | **P2 (Deferred)** |
| `admin-provision-user` | `supabase/functions/admin-provision-user` | **ACTIVE** | `false` | `src/services/userService.ts:121, 253` | Current Live |
| `ai-chat` | `supabase/functions/ai-chat` | **ACTIVE** | `false` | `src/services/aiService.ts:172` | Current Live |
| `ingest-document` | `supabase/functions/ingest-document` | **ACTIVE** | `true` | Admin RAG ingestion scripts | Current Live |
| `get-signed-url` | `supabase/functions/get-signed-url` | Untracked Prototype | N/A | None (only unrouted `VerifyLeavePage.tsx`) | **Do Not Deploy** |
| `generate-leave-pdf` | `supabase/functions/generate-leave-pdf` | Untracked Prototype | N/A | None (0 references in `src/`) | **Do Not Deploy** |

---

## 2. Remote Secrets & Environment Variables Audit

The linked production project `eddsaafwwmtfnjukxamx` was audited via `npx supabase secrets list`.

### Configured Secrets (Active Remotely)
- `ORACLE_GATEWAY_URL` — Configured (Private Oracle Cloud FastAPI Gateway endpoint)
- `ORACLE_GATEWAY_API_KEY` — Configured (Gateway bearer authentication key)
- `ORACLE_GATEWAY_TIMEOUT_MS` — Configured (Gateway abort controller timeout)
- `SUPABASE_SERVICE_ROLE_KEY` — Platform default (Internal elevated privilege token)
- `SUPABASE_ANON_KEY` — Platform default (Public anonymous client key)
- `SUPABASE_URL` — Platform default (`https://eddsaafwwmtfnjukxamx.supabase.co`)

### Missing Secrets (Required for P2 Functions)
- `GITHUB_CLIENT_ID` — **Missing**
- `GITHUB_CLIENT_SECRET` — **Missing**

> [!IMPORTANT]
> Because `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are not configured on remote, deploying `github-oauth` right now would result in HTTP 500 runtime errors whenever a user clicks "Connect GitHub". Therefore, GitHub functions should be held in P2 until the project owner configures GitHub OAuth App secrets.
>
> Conversely, `identifier-login` requires only platform-provided environment variables, and `local-llm-analyze` has all of its secrets already configured in production.

---

## 3. Deep-Dive Security & Architectural Audit

### 3.1. `identifier-login`

#### Purpose & Frontend Flow
In the AIET institution, students log in using their University Seat Number (USN, e.g. `4AL21CS001`) and faculty/HOD log in using their Employee ID (e.g. `EMP-CSE-01`). The standard Supabase GoTrue authentication endpoint (`auth.signInWithPassword`) only accepts an email address.
When an identifier is detected, `authService.ts` invokes `identifier-login` passing `{ identifier, password }`.

#### Architectural Workflow
```
[User Browser]
      │
      │ 1. POST { identifier: "4AL21CS001", password: "***" }
      ▼
[identifier-login Edge Function]
      │
      │ 2. Validate input format: /^[A-Za-z0-9._-]{2,64}$/
      │ 3. Query profiles via SERVICE_ROLE: WHERE usn_or_employee_id ILIKE identifier AND account_status = 'ACTIVE'
      │ 4. Extract verified internal profile.email
      │ 5. Call GoTrue auth.signInWithPassword({ email, password }) via ANON_KEY
      │
      ▼
[GoTrue Engine]
      │
      │ 6. Verify bcrypt password hash, issue session tokens
      ▼
[identifier-login Edge Function]
      │
      │ 7. Return { session: { access_token, refresh_token, ... } }
      ▼
[User Browser: authService]
      │
      │ 8. supabase.auth.setSession({ access_token, refresh_token })
      │ 9. Load profile strictly using authenticated session.user.id
```

#### Documented Security Justification for `--no-verify-jwt`
- **Why `--no-verify-jwt` is strictly necessary:** The caller is completely unauthenticated. They do not possess a JWT access token yet. If `--verify-jwt` is enabled on this function, Supabase's Kong gateway will drop every request with `HTTP 401 Unauthorized` before the function code can execute.
- **Why it is safe:**
  1. **Strict Input Sanitization:** Rejects any identifier not matching `/^[A-Za-z0-9._-]{2,64}$/` and passwords exceeding 256 characters.
  2. **No Privileged Execution for Unauthenticated Users:** The function does **not** generate tokens directly or grant privileges. It queries the database solely to translate the identifier to an email, then delegates password verification entirely to Supabase's hardened GoTrue auth service via `auth.signInWithPassword`.
  3. **Timing and Account Enumeration Mitigation:** Returns a generic `401 Invalid credentials or account unavailable` error regardless of whether the identifier was not found, the account is locked/inactive, or the password was incorrect.
  4. **Credential Isolation:** The function never logs passwords, emails, or tokens, and only returns the GoTrue session object upon valid password authentication.

---

### 3.2. `local-llm-analyze`

#### Purpose & Frontend Flow
Provides role-tailored academic analytics, learning gap analysis, and at-risk student detection for `/student/analytics` and `/hod/analytics` using the institution's private Oracle Cloud FastAPI gateway (`POST /v1/analyze`).

#### Security Architecture & Safeguards
1. **Authenticated Session Verification:** Reads `Authorization: Bearer <token>` and validates the session via `userClient.auth.getUser()`. Rejects unauthenticated requests with `401`.
2. **In-Memory Rate Limiting:** Enforces a per-user limit of 60 analysis requests per hour to protect compute infrastructure.
3. **Role & Department Scoping:**
   - Queries `profiles` table to determine the verified role (`STUDENT`, `FACULTY`, `HOD`, `ADMIN`).
   - Verifies `account_status === 'ACTIVE'`.
   - Prevents role spoofing: Client cannot claim to be `HOD` if their profile is `STUDENT`.
   - Prevents cross-account/cross-department access: Students can only query their own ID; HODs are strictly constrained to their own `department_id`.
4. **Server-Side Authoritative Analytics Retrieval:**
   - The function **never** trusts client-supplied marks, attendance, or student lists as facts.
   - It executes authoritative database queries server-side (`student_analytics_view`, `student_learning_gaps_view`, `assessment_attempts`, `timetable_entries`, `departments`).
   - **Fail-Closed Design:** If a database query fails, the function aborts gateway dispatch and returns a graceful fallback response indicating deterministic analytics remain active.
5. **PII Masking & Credential Scanning:**
   - Masks student identifiers (`usn` replaced with `[REDACTED]`, `studentId` deleted) before transmitting data to the model.
   - `assertCredentialSafety()` inspects the outgoing payload with regular expressions to guarantee no tokens, hashes, passwords, or service role keys can ever be sent to the LLM.
6. **Output Sanitization & Length Bounds:**
   - Validates response fields (`summary`, `trend`, `risk_level`, `insights`, `recommendations`, `visualizations`).
   - Rejects executable scripts, HTML tags (`<script>`, `<iframe>`), and SQL injection attempts.
   - Truncates oversized text outputs (max 2,000 characters for summary; max 300 characters per recommendation).
7. **Timeout & Failure Grace:**
   - Enforces a 35,000 ms timeout via `AbortController`.
   - If the gateway times out, goes offline, or fails, the function returns a structured failure without crashing, allowing the frontend UI to display standard deterministic charts seamlessly.

---

### 3.3. `github-oauth` & `github-api`

#### Architecture & Safeguards
- **`github-oauth`:**
  - Verifies caller JWT and confirms `account_status === 'ACTIVE'`.
  - Exchanges one-time OAuth `code` for GitHub `access_token`.
  - Securely stores the `access_token` in `github_connections` via service role key.
  - **Never exposes the access token to the client:** Returns only public profile information (`username`, `avatarUrl`, `githubUserId`, `scope`).
- **`github-api`:**
  - Acts as a secure proxy between UniSphere and `https://api.github.com`.
  - Verifies the user's UniSphere JWT session.
  - Retrieves the user's stored GitHub `access_token` from the database.
  - Strictly constrains API paths via regex (`/user`, `/rate_limit`, `/repos/:owner/:repo/...`).
  - Prohibits path traversal (`..`) and limits HTTP methods to `GET`, `PUT`, `DELETE`.
- **Status:** Requires GitHub OAuth App registration before deployment.

---

### 3.4. Insecure Legacy Prototypes to Quarantine

1. **`get-signed-url`:**
   - **Flaw:** Completely unauthenticated endpoint using `SUPABASE_SERVICE_ROLE_KEY` to sign arbitrary storage URLs.
   - **Status:** Orphaned. Replaced by direct Supabase Storage SDK in client services. Must **NOT** be deployed.
2. **`generate-leave-pdf`:**
   - **Flaw:** Unauthenticated, references obsolete bucket `leave-pdfs`, makes external calls to deprecated Google Charts API.
   - **Status:** Orphaned. 0 references in `src/`. Must **NOT** be deployed.

---

## 4. Frontend Integration & Contract Verification

| Edge Function | Frontend Service Caller | Request Payload Sent | Expected Response Contract | Status |
| :--- | :--- | :--- | :--- | :--- |
| `identifier-login` | `src/services/authService.ts:29` | `{ identifier, password }` | `{ session: { access_token, refresh_token } }` | **Matches Perfectly** |
| `local-llm-analyze` | `src/services/localLLMProvider.ts:116` | `{ role, analysisType, dashboardContext, analyticsContract, timestamp }` | `{ success: true, summary, trend, risk_level, insights, recommendations, visualizations, model }` | **Matches Perfectly** |
| `github-oauth` | `src/services/githubService.ts:84` | `{ code, redirect_uri }` | `{ success: true, connection: { username, avatarUrl, githubUserId, scope } }` | Matches (Secrets missing) |
| `github-api` | `src/services/githubService.ts:25` | `{ path, method, body }` | `{ status: number, body: object }` | Matches (Secrets missing) |
| `admin-provision-user` | `src/services/userService.ts:121` | `{ action: 'provision_user', userData: { ... } }` | `{ success: true, user: { id, email } }` | Active Remotely |
| `ai-chat` | `src/services/aiService.ts:172` | `{ message, conversationId, role, departmentId }` | `{ reply: string, citations?: any[] }` | Active Remotely |

---

## 5. Recommended Deployment Plan

### Phase 1: Deploy Approved Edge Functions (Immediate)

Upon project owner approval, deploy the two fully configured and genuinely required functions:

```bash
# 1. Deploy identifier-login with --no-verify-jwt (Strictly required for unauthenticated login)
npx supabase functions deploy identifier-login --project-ref eddsaafwwmtfnjukxamx --no-verify-jwt

# 2. Deploy local-llm-analyze (All secrets are already configured remotely)
npx supabase functions deploy local-llm-analyze --project-ref eddsaafwwmtfnjukxamx
```

### Phase 2: Quarantine Insecure Legacy Prototypes

Move `supabase/functions/get-signed-url` and `supabase/functions/generate-leave-pdf` to `backups/quarantine/functions/` to eliminate repository noise and prevent accidental future deployment.

### Phase 3: GitHub OAuth Configuration (Deferred)

When the project owner is ready to enable GitHub repository integration:
1. Register a GitHub OAuth App in GitHub Developer Settings.
2. Configure production secrets via Supabase CLI:
   ```bash
   npx supabase secrets set GITHUB_CLIENT_ID="<client_id>" GITHUB_CLIENT_SECRET="<client_secret>" --project-ref eddsaafwwmtfnjukxamx
   ```
3. Deploy GitHub Edge Functions:
   ```bash
   npx supabase functions deploy github-oauth --project-ref eddsaafwwmtfnjukxamx
   npx supabase functions deploy github-api --project-ref eddsaafwwmtfnjukxamx
   ```

---

## 6. Verification & Smoke Test Plan

Following deployment of Phase 1 functions:

1. **Identifier Login Verification:**
   - Attempt login with a known test USN (e.g. Student account) and password.
   - Verify `identifier-login` is invoked, returns a GoTrue session, and `authService.signIn` establishes an active session.
   - Verify non-existent USN or wrong password returns `401 Invalid credentials or account unavailable` without leaking internal errors.
   - Verify standard email login continues to use direct Supabase GoTrue auth without regression.
2. **Local LLM Analysis Verification:**
   - Log in as Student and navigate to `/student/analytics`. Trigger Local AI analysis.
   - Verify `local-llm-analyze` verifies the caller's JWT, constructs server analytics, contacts the Oracle Gateway, and renders structured insights.
   - Test fallback behavior: If Oracle Gateway is unreachable, verify deterministic charts render smoothly without UI failure.

---

## 7. Rollback Plan

If any unexpected regression or error occurs post-deployment:
- Edge Functions in Supabase can be removed or rolled back immediately via:
  ```bash
  # Delete the deployed function from remote
  npx supabase functions delete identifier-login --project-ref eddsaafwwmtfnjukxamx
  npx supabase functions delete local-llm-analyze --project-ref eddsaafwwmtfnjukxamx
  ```
- No database mutations are required for rollback. Frontend deterministic fallbacks automatically engage when an Edge Function returns an error or is unavailable.

