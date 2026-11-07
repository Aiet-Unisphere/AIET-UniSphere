# AIET-UniSphere — Security Audit & Vulnerability Assessment Report

**Audit Date:** November 7, 2026  
**Auditor Roles:** Senior Full-Stack Architect, Supabase Security Engineer  
**Scope:** Frontend Codebase, Edge Functions, SQL Schema & Migrations, Authentication Flows, Storage Buckets, and RLS Policies.  
**Constraint Compliance:** Zero secret or credential values are revealed in this document.

---

## 1. Executive Summary of Security Posture

The application demonstrates strong security engineering principles in several subsystems:
- Robust RAG prompt-injection protection codified in `aiService.ts` and validated by 20 unit tests.
- Context isolation preventing cross-student data leakage.
- Atomic PostgreSQL transactions for attendance and timetable scheduling.
- Proper RLS policy design on 43 public database tables.

However, **critical vulnerabilities currently exist in the production environment** resulting from unsynchronized migrations, undeployed serverless edge functions, and unpatched trigger definitions.

---

## 2. Vulnerability Index

| ID | Title | Severity | Location | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Production Public Signup Privilege Escalation to FACULTY / HOD | **CRITICAL** | Remote DB (`handle_new_user` trigger) | **Active in Production** |
| **SEC-02** | Complete Lockout of USN / Employee ID Logins in Production | **HIGH** | `src/services/authService.ts`, Edge Function `identifier-login` | **Active in Production** |
| **SEC-03** | Mutable `search_path` on Production `SECURITY DEFINER` Trigger | **HIGH** | Remote DB (`handle_new_user` in 00001) | **Active in Production** |
| **SEC-04** | Undeployed Edge Functions Paralyzing GitHub & Local LLM Security Boundaries | **HIGH** | `supabase/functions/github-oauth`, `github-api`, `local-llm-analyze` | **Active in Production** |
| **SEC-05** | Storage Exposure & Hardcoded Placeholder in Untracked Verification Page | **MEDIUM** | `src/pages/VerifyLeavePage.tsx:91` | **Present in Workspace** |
| **SEC-06** | React Rules-of-Hooks Conditional Call in Faculty External Course Modal | **MEDIUM** | `src/faculty/components/CreateExternalCourseModal.tsx:18-29` | **Present in Workspace** |
| **SEC-07** | Duplicate Migration Prefix Collision Threatening DB Integrity | **MEDIUM** | `supabase/migrations/00010_*.sql` to `00019_*.sql` | **Present in Workspace** |
| **SEC-08** | Storage Bucket Policy Coverage Gaps on Custom Buckets | **LOW** | `supabase/migrations/00012_leave_attachments_storage.sql` | **Present in Workspace** |

---

## 3. Detailed Vulnerability Analysis

---

### SEC-01: Production Public Signup Privilege Escalation to FACULTY / HOD
- **Severity:** **CRITICAL (CVSS 9.8)**
- **Affected System:** Remote Supabase Production Database (`eddsaafwwmtfnjukxamx`)
- **Affected Code / File:** `supabase/migrations/00001_auth_profiles.sql:86-89`
- **Evidence:**
  In `00001_auth_profiles.sql` (currently running in production):
  ```sql
  -- Prevent public signup from assigning ADMIN role
  IF assigned_role = 'ADMIN' THEN
    assigned_role := 'STUDENT';
  END IF;
  ```
  The trigger inspects `NEW.raw_user_meta_data->>'role'`. It explicitly converts `'ADMIN'` to `'STUDENT'`, but **allows `'FACULTY'` and `'HOD'` to pass straight through into `public.profiles.role`!
  Local migration `00034_secure_public_signup_trigger.sql` resolves this:
  ```sql
  -- Strict institutional security policy:
  -- Public self-registration ALWAYS creates a 'STUDENT' role.
  assigned_role := 'STUDENT';
  ```
  However, migration audit confirms migration `00034` is **unapplied on the remote production database**.
- **Impact:** Any anonymous visitor calling `supabase.auth.signUp()` with metadata `{ "role": "FACULTY" }` or `{ "role": "HOD" }` will immediately be granted staff privileges, bypassing all administrative onboarding checks and gaining access to student records and departmental data.
- **Recommended Fix:**
  Deploy migration `00034` immediately to the production Supabase database via `npx supabase db push` (after resolving migration prefix duplicates).

---

### SEC-02: Complete Lockout of USN / Employee ID Logins in Production
- **Severity:** **HIGH (CVSS 8.2)**
- **Affected System:** Production Authentication Flow
- **Affected Code / Files:**
  - `src/services/authService.ts:28-34`
  - `supabase/migrations/00016_secure_identifier_login.sql:3`
  - `supabase/functions/identifier-login/index.ts`
- **Evidence:**
  1. Migration `00016_secure_identifier_login.sql` (applied in production) executed:
     ```sql
     REVOKE EXECUTE ON FUNCTION public.get_email_by_identifier(TEXT) FROM PUBLIC, anon, authenticated;
     GRANT EXECUTE ON FUNCTION public.get_email_by_identifier(TEXT) TO service_role;
     ```
  2. `authService.ts` correctly handles this by calling `supabase.functions.invoke('identifier-login', ...)` for non-email inputs.
  3. Edge Function audit confirms `identifier-login` is **NOT deployed** on project `eddsaafwwmtfnjukxamx`.
- **Impact:** 100% of students attempting to sign in using their University Serial Number (e.g., `4AI21CS001`) and faculty attempting to sign in with their Employee ID (e.g., `FAC-001`) fail with a network/function error. Only users who remember and type their full raw email address can authenticate.
- **Recommended Fix:**
  Deploy Edge Function `identifier-login` to production using `npx supabase functions deploy identifier-login --no-verify-jwt`.

---

### SEC-03: Mutable `search_path` on Production `SECURITY DEFINER` Trigger
- **Severity:** **HIGH (CVSS 7.5)**
- **Affected System:** Remote Supabase Production Database
- **Affected Code / File:** `supabase/migrations/00001_auth_profiles.sql:109`
- **Evidence:**
  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER AS $$
  ...
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```
  Notice the absence of `SET search_path = ''` or `SET search_path = public`.
  Because this trigger runs automatically on every user creation within the privileged `auth.users` context, an unpinned search path creates an operational security vulnerability.
- **Impact:** Potential search-path manipulation in shared database environments.
- **Recommended Fix:**
  Applying migration `00034` fixes this, as it explicitly defines `SET search_path = ''` on `handle_new_user()`.

---

### SEC-04: Undeployed Edge Functions Paralyzing External Security Boundaries
- **Severity:** **HIGH (CVSS 7.1)**
- **Affected System:** Supabase Edge Function Layer
- **Affected Code / Files:**
  - `supabase/functions/local-llm-analyze/`
  - `supabase/functions/github-oauth/`
  - `supabase/functions/github-api/`
- **Evidence:**
  `npx supabase functions list` on production reveals only three active functions:
  1. `admin-provision-user`
  2. `ai-chat`
  3. `ingest-document`
- **Impact:**
  - `local-llm-analyze`: When local LLM analytics are enabled, client calls fail immediately. While the client fails safely, the feature is inoperative.
  - `github-oauth` and `github-api`: The application cannot securely exchange GitHub OAuth codes or proxy API requests. Direct GitHub API calls from the browser would risk exposing tokens or failing CORS preflights.
- **Recommended Fix:**
  Deploy `local-llm-analyze`, `github-oauth`, and `github-api` after setting their required secrets via `npx supabase secrets set`.

---

### SEC-05: Storage Exposure & Hardcoded Placeholder in Untracked Verification Page
- **Severity:** **MEDIUM (CVSS 5.3)**
- **Affected System:** Frontend Routing & Leave Verification
- **Affected Code / File:** `src/pages/VerifyLeavePage.tsx:90-93`
- **Evidence:**
  ```tsx
  {result.pdf_url ? (
    <p>
      <a href={`https://YOUR_SUPABASE_STORAGE_URL/${result.pdf_url}`} target="_blank" rel="noreferrer">Download PDF</a>
    </p>
  ) : null}
  ```
  The component contains a hardcoded placeholder domain `YOUR_SUPABASE_STORAGE_URL` and directly generates links without validating URL origin or using standard Supabase Storage download methods. Furthermore, this page invokes `get-signed-url`, an untracked, undeployed Edge Function.
- **Impact:** Dead links, broken user experience, and potential phishing vector if the placeholder domain were ever registered.
- **Recommended Fix:**
  Replace with standard `supabase.storage.from('leave-pdfs').createSignedUrl()` calls via `storageService.ts`, or quarantine this orphaned file until the leave verification epic is scheduled for release.

---

### SEC-06: React Rules-of-Hooks Violation in Faculty External Course Modal
- **Severity:** **MEDIUM (Code Quality / Runtime Crash)**
- **Affected System:** Faculty External Course Management
- **Affected Code / File:** `src/faculty/components/CreateExternalCourseModal.tsx:16-29`
- **Evidence:**
  ```tsx
  export const CreateExternalCourseModal: React.FC<CreateExternalCourseModalProps> = ({
    isOpen,
    onClose,
    onSuccess
  }) => {
    if (!isOpen) return null;

    const [title, setTitle] = useState('');
    const [platform, setPlatform] = useState('Coursera');
    ...
  ```
  Line 16 returns early if `!isOpen`. Lines 18 through 29 declare 11 hooks conditionally.
- **Impact:** If `isOpen` changes from `false` to `true` while rendered, React throws a fatal runtime exception: *"Rendered fewer hooks than expected. This may be caused by an accidental early return statement."* This crashes the entire Faculty Course view under React Error Boundaries.
- **Recommended Fix:**
  Move `if (!isOpen) return null;` to immediately before the JSX `return (` statement, after all `useState` hook declarations.

---

### SEC-07: Duplicate Migration Prefix Collision Threatening Database Integrity
- **Severity:** **MEDIUM (DevOps & Deployment Integrity)**
- **Affected System:** Migration Pipeline
- **Affected Code / Files:** `supabase/migrations/00010_*.sql` to `00019_*.sql`
- **Evidence:**
  Two sets of 10 migrations share version prefixes `00010` through `00019`.
  The tracked set is already applied on production; the untracked set is present only in the local working directory.
- **Impact:** Automated CI/CD deployment via `supabase db push` will fail or enter an unrecoverable migration state due to checksum discrepancies and duplicate keys in `supabase_migrations.schema_migrations`.
- **Recommended Fix:**
  Renumber the untracked migrations starting from `00036` or relocate them to a feature branch.

---

### SEC-08: Storage Bucket Policy Coverage Gaps on Custom Buckets
- **Severity:** **LOW (Data Leakage Risk)**
- **Affected System:** Supabase Storage
- **Affected Code / File:** `supabase/migrations/00012_leave_attachments_storage.sql`
- **Evidence:**
  Bucket `leave-attachments` is defined in an untracked migration with commented-out RLS policies:
  ```sql
  -- ON storage.objects FOR ALL
  ```
  If this bucket is created manually without policies, files stored in it may either be publicly readable or inaccessible to authorized HODs.
- **Impact:** Unauthorized cross-student access to medical certificates and leave letters.
- **Recommended Fix:**
  Consolidate all storage bucket definitions and RLS policies into `00013_supabase_storage_and_file_metadata.sql` standards, ensuring `leave-attachments` enforces student-owner insert/select and department-HOD select policies.

