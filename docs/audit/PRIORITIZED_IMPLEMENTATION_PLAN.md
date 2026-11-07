# AIET-UniSphere — Prioritized Implementation & Remediation Plan

**Audit Date:** November 7, 2026  
**Auditor Roles:** Senior Full-Stack Architect, Supabase Security Engineer, QA Lead  
**Objective:** Provide an exact, dependency-ordered engineering roadmap to resolve all audit blockers, secure production, and prepare the project for stable development.

---

## 1. Remediation Phase Overview

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                    REMEDIATION PHASE ROADMAP                           │
  ├──────────┬─────────────────────────────┬───────────┬───────────────────┤
  │ Phase    │ Description                 │ Severity  │ Primary Objective │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────┤
  │ Phase 0  │ CI/CD & Build Restoration   │ BLOCKER   │ Unblock `npm build│
  │ Phase 1  │ Database Migration Parity   │ CRITICAL  │ Patch SEC-01 & DB │
  │ Phase 2  │ Edge Functions Deployment   │ HIGH      │ Restore USN login │
  │ Phase 3  │ Storage & Unrouted Modules  │ MEDIUM    │ Secure buckets    │
  │ Phase 4  │ Code Quality & Oxlint Fixes │ MEDIUM    │ Clear 243 warnings│
  │ Phase 5  │ Verification & E2E Sign-Off │ LOW       │ Multi-role test   │
  └──────────┴─────────────────────────────┴───────────┴───────────────────┘
```

---

## 2. Phase 0: Immediate CI & Build Pipeline Restoration

**Target:** Restore clean exit codes for `npm run typecheck`, `npm run lint`, and `npm run build`.

### Step 0.1: Resolve Fatal TypeScript Failure in `HODSealManager.tsx`
- **Severity:** **BLOCKER**
- **Affected File:** `src/hod/pages/HODSealManager.tsx`
- **Root Cause:** Imports non-existent `updateDepartmentSeal` from `departmentService.ts`. The component is untracked and unrouted.
- **Recommended Action:**
  - Option A (Recommended): Quarantine or remove untracked `src/hod/pages/HODSealManager.tsx` until the department seal feature is formally architected and scheduled.
  - Option B: Implement `updateDepartmentSeal(departmentId: string, file: File): Promise<string>` in `src/services/departmentService.ts` backed by Supabase Storage `department-seals` bucket.
- **Verification:** `npm run typecheck` passes without TS2724 error.

### Step 0.2: Fix React Rules-of-Hooks Error in `CreateExternalCourseModal.tsx`
- **Severity:** **CRITICAL RUNTIME ERROR / LINT FAILURE**
- **Affected File:** `src/faculty/components/CreateExternalCourseModal.tsx:16-30`
- **Root Cause:** Early return statement `if (!isOpen) return null;` precedes 11 `useState` hook calls.
- **Recommended Action:**
  Move the conditional return statement down to line 75, directly before the return of the JSX element:
  ```tsx
  // Declare all hooks at the top level
  const [title, setTitle] = useState('');
  ...
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Return null AFTER all hooks are called
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">...</div>
  );
  ```
- **Verification:** `npx oxlint --quiet` exits with code 0 (0 errors).

---

## 3. Phase 1: Database Migration Alignment & Production Patching

**Target:** Eliminate duplicate migration versions, prevent migration collisions, and patch critical privilege escalation on live Supabase production.

### Step 1.1: Quarantine or Renumber Duplicate Untracked Migrations
- **Severity:** **HIGH**
- **Affected Files:** `supabase/migrations/00010_leave_date_validation.sql` through `00019_repair_submit_leave_request_rpc.sql`
- **Root Cause:** Duplicate prefix numbers `00010` to `00019` collide with already-applied tracked migrations.
- **Recommended Action:**
  1. Inspect the 10 untracked leave migrations to determine if any features (e.g. date validation, edit/cancel) are missing from the main codebase.
  2. If needed, renumber these files sequentially to start at `00036_...` through `00045_...`.
  3. If their functionality has already been superseded by `00009_review_leave_request_rpc.sql` and `00013_supabase_storage_and_file_metadata.sql`, safely remove or stash them outside `supabase/migrations/`.
- **Verification:** `npx supabase migration list` shows no duplicate version rows.

### Step 1.2: Apply Pending Security Migrations to Production
- **Severity:** **CRITICAL (SEC-01 & SEC-03)**
- **Affected Migrations:**
  - `00033_assessment_review_system.sql`
  - `00034_secure_public_signup_trigger.sql`
  - `00035_timetable_concurrency_guard.sql`
- **Recommended Action:**
  Execute migration push to production Supabase:
  ```bash
  npx supabase db push --linked
  ```
- **Verification:**
  1. `npx supabase migration list --remote` confirms `00033`, `00034`, and `00035` are marked as applied.
  2. Run `tests/security_signup_and_concurrency.test.mjs` against live database to ensure anonymous signup cannot claim `FACULTY` or `HOD` roles.

---

## 4. Phase 2: Edge Functions Deployment & Authentication Parity

**Target:** Restore USN/Employee ID login and deploy backend functions for GitHub and Local LLM integrations.

### Step 2.1: Deploy `identifier-login` Edge Function
- **Severity:** **HIGH (SEC-02)**
- **Affected Directory:** `supabase/functions/identifier-login/`
- **Dependencies:** Requires Supabase Service Role Key configured in Edge Function runtime environment.
- **Recommended Action:**
  Deploy with `--no-verify-jwt` so pre-authentication lookups succeed:
  ```bash
  npx supabase functions deploy identifier-login --no-verify-jwt
  ```
- **Verification:** Sign in using a test student USN (e.g., `4AI21CS001`) from `/login/student` and verify session issuance.

### Step 2.2: Deploy `github-oauth` and `github-api` Edge Functions
- **Severity:** **MEDIUM (SEC-04)**
- **Affected Directories:**
  - `supabase/functions/github-oauth/`
  - `supabase/functions/github-api/`
- **Dependencies:** Set GitHub secrets via Supabase CLI:
  ```bash
  npx supabase secrets set GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=...
  ```
- **Recommended Action:**
  ```bash
  npx supabase functions deploy github-oauth --no-verify-jwt
  npx supabase functions deploy github-api --verify-jwt
  ```
- **Verification:** Authorize GitHub app via `/student/github` and verify repository sync.

### Step 2.3: Deploy `local-llm-analyze` Edge Function
- **Severity:** **MEDIUM (SEC-04)**
- **Affected Directory:** `supabase/functions/local-llm-analyze/`
- **Dependencies:** Configure Oracle Gateway URL and API key secrets:
  ```bash
  npx supabase secrets set ORACLE_GATEWAY_URL=... ORACLE_GATEWAY_API_KEY=...
  ```
- **Recommended Action:**
  ```bash
  npx supabase functions deploy local-llm-analyze --verify-jwt
  ```
- **Verification:** Run test query from `/student/analytics` and verify chart/summary JSON response.

---

## 5. Phase 3: Storage Policy Hardening & Leave Verification Module

**Target:** Clean up untracked orphaned files and secure storage buckets.

### Step 3.1: Clean or Properly Route `VerifyLeavePage.tsx`
- **Severity:** **MEDIUM (SEC-05)**
- **Affected File:** `src/pages/VerifyLeavePage.tsx`
- **Recommended Action:**
  1. Remove hardcoded `https://YOUR_SUPABASE_STORAGE_URL/` placeholder.
  2. Replace with `supabase.storage.from('leave-pdfs').createSignedUrl(result.pdf_url, 300)`.
  3. If public QR code verification of printed leave letters is an active requirement, add route `<Route path="/verify-leave/:verificationId" element={<VerifyLeavePage />} />` in `src/App.tsx`.
  4. If not needed, archive this file.

### Step 3.2: Verify Storage Policies on Supabase Remote
- **Severity:** **LOW (SEC-08)**
- **Scope:** Buckets `avatars`, `assignment-submissions`, `assessment-files`, `external-learning-evidence`.
- **Recommended Action:** Audit Supabase Storage dashboard or run storage test scripts to confirm RLS policies restrict cross-student file access.

---

## 6. Phase 4: Code Quality & Oxlint Hygiene

**Target:** Clear non-fatal warnings to establish a zero-warning quality baseline.

### Step 4.1: Clean Unused Imports and Variables (178 occurrences)
- **Scope:** Remove unused Lucide icon imports (`Filter`, `Lock`, `Unlock`, `Save`) and prefix unused parameters with `_`.
- **Recommended Action:** Run `npx oxlint --fix` to automatically clean unused imports where safe, followed by manual review of remaining warnings.

### Step 4.2: Resolve `useEffect` Dependency Arrays (38 occurrences)
- **Scope:** `src/admin/pages/UserList.tsx`, `src/pages/StudentDashboard.tsx`, etc.
- **Recommended Action:** Wrap external fetch functions in `useCallback` or move inline within `useEffect` hooks.

### Step 4.3: Separate Components from Exported Utilities (27 occurrences)
- **Scope:** `src/components/TimetableCalendar.tsx`, etc.
- **Recommended Action:** Move constants like `TIMETABLE_DAYS` and helper functions like `parseTimeToMinutes` into `src/shared/utils/timetableUtils.ts` to preserve React Fast Refresh performance.

---

## 7. Phase 5: Verification & End-to-End Sign-Off

**Target:** Complete end-to-end user journey validation across all four roles on the live environment.

### Verification Matrix

| Role | Test Case | Target State | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **Student** | USN Login | Live Production | Enters USN + password -> successfully loads `/student/dashboard`. |
| **Student** | Public Signup | Live Production | Registers via `/signup/student` -> profile role is strictly `STUDENT`. |
| **Student** | Take Assessment | Live Production | Completes quiz attempt -> reviews submission via 00033 review RPC. |
| **Faculty** | Create External Course | Live Production | Opens modal -> no React Hook error -> creates course successfully. |
| **Faculty** | Record Attendance | Live Production | Submits batch attendance -> atomic record created in database. |
| **HOD** | Create Timetable Entry | Live Production | Schedules class -> concurrency guard prevents room collision. |
| **HOD** | Approve Leave Request | Live Production | Reviews request -> status updates to `APPROVED` with reviewer notes. |
| **Admin** | Provision Faculty User | Live Production | Fills user form -> `admin-provision-user` creates auth account. |
| **CI** | Full Automated Pipeline | Local / CI Server | `npm run typecheck && npm run lint && npm test && npm run build` exits 0. |

