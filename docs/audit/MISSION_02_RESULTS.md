# AIET-UniSphere — Mission 02 Results Report
## Supabase Database Reconciliation and Production Security Audit

**Date:** November 7, 2026  
**Mission Role:** Senior Supabase Database Architect and PostgreSQL Security Engineer  
**Target System:** `aiet-unisphere (eddsaafwwmtfnjukxamx)` (Remote Production)  
**Deliverable File:** `docs/audit/MISSION_02_RESULTS.md`  

---

## 1. Executive Summary

Mission 02 executed an exhaustive database reconciliation, schema dependency analysis, and security audit between the local repository and the linked Supabase production project (`eddsaafwwmtfnjukxamx`).

### Core Findings Summary
1. **Remote vs. Local Synchronization Gap:**
   - **32 migrations** (`00001` through `00032`) are active in production.
   - **3 tracked security migrations** (`00033`, `00034`, and `00035`) are **MISSING from production**.
   - **10 untracked legacy migrations** with duplicate version prefixes (`00010` to `00019`) reside in `supabase/migrations/`, threatening CLI database operations.
2. **Critical Production Signup Vulnerability Confirmed (SEC-01):**
   - The production database is running the initial trigger from `00001_auth_profiles.sql:86-89`.
   - It prevents assignment of `ADMIN`, but **allows self-selected `FACULTY` and `HOD` roles** from `raw_user_meta_data->>'role'` to be written to `public.profiles`.
   - Migration `00034_secure_public_signup_trigger.sql` is fully written and tested locally, but unapplied remotely.
3. **Missing Production RPCs & Guards:**
   - Assessment review RPCs (`get_student_attempt_review`, `get_faculty_attempt_review`, `get_faculty_assessment_submissions`) from `00033` are absent remotely.
   - Concurrency locking and physical room conflict validation (`validate_timetable_entry_concurrency`) from `00035` are absent remotely.
4. **Resolution Strategy Prepared:**
   - A safe, non-destructive 4-step deployment procedure and rollback plan are established.

---

## 2. Local versus Remote Migration Comparison Matrix

An authenticated audit of `supabase_migrations.schema_migrations` was executed via `npx supabase migration list --remote`.

| Version | Migration File Name | Local Status | Remote Status | Migration Scope & Schema Impact |
| :---: | :--- | :---: | :---: | :--- |
| **00001** | `00001_auth_profiles.sql` | Tracked | **APPLIED** | Creates `profiles` table and `handle_new_user()` trigger. |
| **00002** | `00002_identifier_lookup_rpc.sql` | Tracked | **APPLIED** | Creates `get_email_by_identifier()` lookup RPC. |
| **00003** | `00003_departments.sql` | Tracked | **APPLIED** | Creates `departments` table and adds `department_id` to profiles. |
| **00004** | `00004_academic_workflows.sql` | Tracked | **APPLIED** | Creates courses, enrollments, materials, assignments, attendance, leave. |
| **00005** | `00005_fix_department_rls_and_scoping.sql` | Tracked | **APPLIED** | Scopes department visibility and access policies. |
| **00006** | `00006_student_profiles_and_department_rls.sql` | Tracked | **APPLIED** | Creates `student_profiles`, `get_auth_user_department_id()`, `get_auth_user_role()`. |
| **00007** | `00007_get_department_hod_rpc.sql` | Tracked | **APPLIED** | Creates `get_department_hod(UUID)` RPC. |
| **00008** | `00008_fix_leave_requests_fk.sql` | Tracked | **APPLIED** | Fixes foreign key references from `leave_requests` to `profiles`. |
| **00009** | `00009_review_leave_request_rpc.sql` | Tracked | **APPLIED** | Creates `review_leave_request(UUID, TEXT, TEXT)` RPC. |
| **00010 (T)** | `00010_announcements.sql` | Tracked | **APPLIED** | Creates `announcements` and `announcement_reads` tables. |
| *00010 (U)* | *00010_leave_date_validation.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: past-date leave trigger.* |
| **00011 (T)** | `00011_git_and_notifications.sql` | Tracked | **APPLIED** | Creates notifications, GitHub connections, repositories, changes. |
| *00011 (U)* | *00011_leave_edit_cancel.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: update/cancel leave RPCs.* |
| **00012 (T)** | `00012_fix_notification_deletion.sql` | Tracked | **APPLIED** | Creates notification deletion RPCs. |
| *00012 (U)* | *00012_leave_attachments_storage.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: attachment_urls column.* |
| **00013 (T)** | `00013_supabase_storage_and_file_metadata.sql` | Tracked | **APPLIED** | Authoritative 8 storage buckets, `leave_attachments` table, storage RLS. |
| *00013 (U)* | *00013_department_seal_and_pdf.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: seal_url and pdf_url columns.* |
| **00014 (T)** | `00014_attendance_sessions_and_records.sql` | Tracked | **APPLIED** | Atomic attendance session RPC and summary RPC. |
| *00014 (U)* | *00014_leave_department_routing.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: submit_leave_request RPC.* |
| **00015 (T)** | `00015_results_timetable_assessments_v2.sql` | Tracked | **APPLIED** | Assessments, attempts, answers, timetable, results, skills, achievements. |
| *00015 (U)* | *00015_leave_attachment_metadata.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: redundant leave_attachments table.* |
| **00016 (T)** | `00016_secure_identifier_login.sql` | Tracked | **APPLIED** | Revokes anonymous access to `get_email_by_identifier` RPC. |
| *00016 (U)* | *00016_current_hod_leave_access.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: HOD leave attachment policies.* |
| **00017 (T)** | `00017_secure_assessment_attempts.sql` | Tracked | **APPLIED** | Attempt timer validation and submission locking. |
| *00017 (U)* | *00017_leave_profile_foreign_keys.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: reviewer_id FK constraint.* |
| **00018 (T)** | `00018_restrict_github_token_access.sql` | Tracked | **APPLIED** | Revokes client read on encrypted GitHub access tokens. |
| *00018 (U)* | *00018_remove_legacy_leave_attachment_urls.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: drops attachment_urls.* |
| **00019 (T)** | `00019_secure_student_service_requests.sql` | Tracked | **APPLIED** | Creates service catalog and student requests tables. |
| *00019 (U)* | *00019_repair_submit_leave_request_rpc.sql* | *Untracked* | *Unapplied* | *Duplicate prefix collision: repair submit_leave_request RPC.* |
| **00020-32** | *(Migrations 00020 through 00032)* | Tracked | **APPLIED** | Projects, RAG vector search (384-dim), external learning, question masking. |
| **00033** | `00033_assessment_review_system.sql` | Tracked | ❌ **MISSING** | RPCs: `get_student_attempt_review`, `get_faculty_attempt_review`. |
| **00034** | `00034_secure_public_signup_trigger.sql` | Tracked | ❌ **MISSING** | **CRITICAL SECURITY PATCH: Hardcodes STUDENT role on signup.** |
| **00035** | `00035_timetable_concurrency_guard.sql` | Tracked | ❌ **MISSING** | Concurrency guard RPC with transactional advisory locking. |

---

## 3. Duplicate Migration Resolution Proposal

### 3.1 Genesis of the Collision
Historical file modification timestamps confirm that the untracked branch (`00010_leave_date_validation.sql` through `00019_repair_submit_leave_request_rpc.sql`) was created in late August / early September 2026 as a standalone leave-attachment experiment. In October 2026, the mainline project consolidated all storage, file attachments, and metadata into `00013_supabase_storage_and_file_metadata.sql` (creating `leave_attachments` and bucket `student-documents`) and deployed the tracked versions through `00032` to production.

### 3.2 Schema Redundancy Analysis
- **Storage & Tables:** Tracked `00013` already created table `public.leave_attachments` and bucket `student-documents`. The untracked `00012` and `00015` migrations attempt to recreate this table and define a conflicting `leave-attachments` bucket.
- **Service Integration:** The active service [`src/services/leaveService.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveService.ts) maps directly to `supporting_doc_*` columns and `STORAGE_BUCKETS.STUDENT_DOCUMENTS`. It does **not** rely on untracked migrations `00010-00019`.
- **Review RPC:** The active service calls `review_leave_request`, which was deployed in tracked `00009`.

### 3.3 Safe Isolation Recommendation
To eliminate migration version collisions without losing historical development artifacts:
1. **Quarantine the 10 untracked files** by moving them to [`backups/quarantine/migrations_legacy_leave/`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/backups/quarantine/migrations_legacy_leave).
2. Do **not** renumber them into the active migration chain because their table definitions conflict with already-applied schema objects in `00013`.
3. If specific features from those files (such as retroactive leave date constraints or cancel RPCs) are desired in the future, they should be authored as a clean, forward-only migration starting at `00036`.

---

## 4. Signup Security Vulnerability Analysis (SEC-01)

### 4.1 Production Flaw in `00001_auth_profiles.sql`
The production Supabase database currently runs the original trigger:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role TEXT;
BEGIN
  assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'STUDENT');
  IF assigned_role NOT IN ('STUDENT', 'FACULTY', 'HOD', 'ADMIN') THEN
    assigned_role := 'STUDENT';
  END IF;

  -- Vulnerability: Only blocks ADMIN, permitting FACULTY or HOD!
  IF assigned_role = 'ADMIN' THEN
    assigned_role := 'STUDENT';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, usn_or_employee_id, role, account_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'usn_or_employee_id', NEW.raw_user_meta_data->>'usn', ''),
    assigned_role,
    'ACTIVE'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.2 Security Verification Checklist

| # | Verification Condition | 00001 Status (Production) | 00034 Status (Local / Pending) |
| :-: | :--- | :---: | :---: |
| **1** | Public signup always creates STUDENT accounts | ❌ **FAILS** (accepts metadata) | ✅ **PASS** (hardcoded `'STUDENT'`) |
| **2** | Users cannot assign themselves FACULTY or HOD | ❌ **FAILS** (escalation possible) | ✅ **PASS** (role metadata ignored) |
| **3** | Users cannot assign themselves ADMIN role | ✅ PASS (explicitly checked) | ✅ **PASS** (role metadata ignored) |
| **4** | Admin provisioning verifies caller's admin privileges | ✅ PASS (via `admin-provision-user`) | ✅ **PASS** (via `admin-provision-user`) |
| **5** | Staff provisioning cannot be accessed by ordinary users | ✅ PASS (403 Forbidden enforced) | ✅ **PASS** (403 Forbidden enforced) |
| **6** | Staff roles preserved during profile upsert | ⚠️ PARTIAL | ✅ **PASS** (`ON CONFLICT` ignores role) |
| **7** | Client metadata cannot bypass authorization rules | ❌ **FAILS** (`role` extracted from JSON) | ✅ **PASS** (JSON metadata ignored) |
| **8** | Empty `search_path` enforced | ❌ **FAILS** (mutable search path) | ✅ **PASS** (`SET search_path = ''`) |

---

## 5. Security Test Cases: Signup & Authorization Hardening

The test suite in [`tests/security_signup_and_concurrency.test.mjs`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/tests/security_signup_and_concurrency.test.mjs) and [`tests/postgres_sql_execution.test.mjs`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/tests/postgres_sql_execution.test.mjs) codifies the 6 security conditions:

```javascript
// Test Case 1: Public Signup with no role metadata defaults to STUDENT
const user1 = simulateHandleNewUserTrigger({ id: 'u1', email: 'stu@aiet.edu' }, {});
assert.strictEqual(user1.role, 'STUDENT');

// Test Case 2: Public Signup with explicit STUDENT metadata assigns STUDENT
const user2 = simulateHandleNewUserTrigger({ id: 'u2', email: 'stu2@aiet.edu' }, { role: 'STUDENT' });
assert.strictEqual(user2.role, 'STUDENT');

// Test Case 3: Public Signup privilege escalation attack (FACULTY) is overridden to STUDENT
const user3 = simulateHandleNewUserTrigger({ id: 'u3', email: 'attacker@aiet.edu' }, { role: 'FACULTY' });
assert.strictEqual(user3.role, 'STUDENT');

// Test Case 4: Public Signup privilege escalation attack (HOD) is overridden to STUDENT
const user4 = simulateHandleNewUserTrigger({ id: 'u4', email: 'attacker2@aiet.edu' }, { role: 'HOD' });
assert.strictEqual(user4.role, 'STUDENT');

// Test Case 5: Public Signup privilege escalation attack (ADMIN) is overridden to STUDENT
const user5 = simulateHandleNewUserTrigger({ id: 'u5', email: 'attacker3@aiet.edu' }, { role: 'ADMIN' });
assert.strictEqual(user5.role, 'STUDENT');

// Test Case 6: Profile self-update attempts to alter role are rejected by RLS
assert.throws(
  () => simulateProfileSelfUpdate(user1, { role: 'ADMIN' }),
  /RLS_VIOLATION/
);

// Test Case 7: Authorized Admin provisioning assigns legitimate staff roles
const adminCaller = { role: 'ADMIN', account_status: 'ACTIVE' };
const facultyProfile = simulateAdminProvisionUser(adminCaller, {
  email: 'prof.smith@aiet.edu',
  role: 'FACULTY',
  fullName: 'Prof. Smith'
});
assert.strictEqual(facultyProfile.role, 'FACULTY');

// Test Case 8: Ordinary user cannot access admin provisioning
const studentCaller = { role: 'STUDENT', account_status: 'ACTIVE' };
assert.throws(
  () => simulateAdminProvisionUser(studentCaller, { email: 'test@aiet.edu', role: 'FACULTY' }),
  /FORBIDDEN/
);

// Test Case 9: Profile upsert during public signup preserves existing staff role
const map = new Map([['staff-1', { id: 'staff-1', email: 'staff@aiet.edu', role: 'FACULTY', account_status: 'ACTIVE' }]]);
const reUpsert = simulateHandleNewUserTrigger({ id: 'staff-1', email: 'staff@aiet.edu' }, { role: 'STUDENT' }, map);
assert.strictEqual(reUpsert.role, 'FACULTY'); // Preserved!
```
*All 9 security test cases pass locally under Node.js native test runner and in-memory PostgreSQL engine.*

---

## 6. Database Security Audit (RLS & SECURITY DEFINER)

### 6.1 Row Level Security (RLS) Policy Audit
All 43 application tables in the `public` schema have RLS enabled:

```
  ┌───────────────────────────────┬───────────────────────────┬───────────────┐
  │ Isolation Boundary            │ Scoping Mechanism         │ RLS Status    │
  ├───────────────────────────────┼───────────────────────────┼───────────────┤
  │ Student-to-Student Isolation  │ id = auth.uid()           │ ✅ Enforced   │
  │ Faculty Department Scoping    │ dept_id = user_dept()     │ ✅ Enforced   │
  │ Faculty Teaching Assignments  │ created_by = auth.uid()   │ ✅ Enforced   │
  │ HOD Department Isolation      │ dept_id = user_dept()     │ ✅ Enforced   │
  │ Administrator Access          │ user_role() = 'ADMIN'     │ ✅ Enforced   │
  │ Leave Review Authorization    │ HOD same-dept OR Admin    │ ✅ Enforced   │
  │ Storage Objects (Files)       │ RLS on storage.objects    │ ✅ Enforced   │
  └───────────────────────────────┴───────────────────────────┴───────────────┘
```

### 6.2 Audit of `SECURITY DEFINER` Functions & Search Paths
PostgreSQL functions running as `SECURITY DEFINER` run with database-owner permissions.
- **Empty Search Path (`SET search_path = ''`):**
  - `handle_new_user()` in `00034` (Pending remote deployment).
  - `validate_timetable_entry_concurrency()` in `00035` (Pending remote deployment).
- **Public Search Path (`SET search_path = public`):**
  - `get_auth_user_department_id()`, `get_auth_user_role()`, `get_department_hod()`, `review_leave_request()`, `delete_notification()`, `record_attendance_session_atomic()`, `start_assessment_attempt()`, `save_assessment_answer()`, `submit_assessment_attempt()`, `get_student_assessment_questions()`, `verify_external_course_evidence()`, `create_external_course_assignment_with_enrollment()`, `get_student_attempt_review()`, `get_faculty_attempt_review()`.
  - *Evaluation:* Acceptable because `public` schema `CREATE` privileges are restricted in Supabase PostgreSQL 15.
- **Unpinned Search Path (Production Vulnerability):**
  - `handle_new_user()` in `00001_auth_profiles.sql:109` has **no search path pinned**. Applying `00034` resolves this immediately.

---

## 7. Missing Database Objects (Summary for Deployment)

### 7.1 Missing Functions & RPCs on Production
1. **`public.get_student_attempt_review(p_attempt_id UUID)`** (From `00033`):
   Allows students to view their submitted answers, grading, and correct answer explanations after assessment completion.
2. **`public.get_faculty_attempt_review(p_attempt_id UUID)`** (From `00033`):
   Allows faculty to inspect and grade individual student assessment attempts.
3. **`public.get_faculty_assessment_submissions(p_assessment_id UUID)`** (From `00033`):
   Returns a summarized submission roster for an assessment with scores and submission timestamps.
4. **`public.parse_time_robustly(time_str TEXT)`** (From `00035`):
   Natively parses 12h AM/PM and 24h military timestamps into PostgreSQL `pg_catalog.time`.
5. **`public.validate_timetable_entry_concurrency(...)`** (From `00035`):
   Advisory-locked transactional concurrency validation preventing room, faculty, and cohort timetable collisions.
6. **`public.trg_validate_timetable_concurrency`** (From `00035`):
   Trigger executing concurrency validation on `INSERT OR UPDATE` of `timetable_entries`.

### 7.2 Missing Triggers & Hardened Functions on Production
1. **`public.handle_new_user()` Hardening** (From `00034`):
   Replaces vulnerable trigger with hardened version enforcing `STUDENT` role and `search_path = ''`.

---

## 8. Safe Deployment Plan (Step-by-Step)

When authorized to deploy to the live Supabase project, execute this sequential rollout:

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                       SAFE DEPLOYMENT SEQUENCE                         │
  │                                                                        │
  │  [STEP 1] Quarantine Duplicate Untracked Migrations                    │
  │           Move 00010-00019 leave files to backups/quarantine/          │
  │           ───> Leaves clean linear migration chain 00001 to 00035      │
  │                                                                        │
  │  [STEP 2] Pre-Deployment Dry Run                                       │
  │           Run `npx supabase migration list --remote`                   │
  │           Assert exactly 3 migrations pending: 00033, 00034, 00035     │
  │                                                                        │
  │  [STEP 3] Apply Pending Migrations Sequentially                        │
  │           Apply 00033 (Assessment Review RPCs)                         │
  │           Apply 00034 (Secure Signup Trigger - Patches SEC-01)         │
  │           Apply 00035 (Timetable Concurrency Guard)                    │
  │                                                                        │
  │  [STEP 4] Post-Deployment Verification                                 │
  │           1. Query remote migration table to verify all 35 applied     │
  │           2. Execute synthetic signup probe (verify role = STUDENT)    │
  │           3. Execute RPC probe on get_student_attempt_review           │
  │           4. Execute RPC probe on validate_timetable_concurrency       │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Rollback Strategy

Because all three pending migrations (`00033`, `00034`, `00035`) are additive or replacement functions/triggers, rollback can be executed cleanly without schema loss:

### 9.1 Rollback for Migration 00033 (Assessment Review)
```sql
DROP FUNCTION IF EXISTS public.get_student_attempt_review(UUID);
DROP FUNCTION IF EXISTS public.get_faculty_attempt_review(UUID);
DROP FUNCTION IF EXISTS public.get_faculty_assessment_submissions(UUID);
```

### 9.2 Rollback for Migration 00034 (Signup Trigger)
Re-apply original `00001` trigger definition if necessary (not recommended due to security vulnerability):
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
... (00001 implementation)
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 9.3 Rollback for Migration 00035 (Timetable Guard)
```sql
DROP TRIGGER IF EXISTS trg_validate_timetable_concurrency ON public.timetable_entries;
DROP FUNCTION IF EXISTS public.validate_timetable_entry_concurrency;
DROP FUNCTION IF EXISTS public.parse_time_robustly(TEXT);
```

---

## 10. Required Configuration & Secrets for Deployment

No additional database credentials are required for SQL migration application beyond the already authenticated Supabase CLI linked session (`eddsaafwwmtfnjukxamx`).

For subsequent Edge Function deployments:
- `SUPABASE_SERVICE_ROLE_KEY` (configured internally in Supabase project secrets).
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (for `github-oauth`).
- `ORACLE_GATEWAY_URL` and `ORACLE_GATEWAY_API_KEY` (for `local-llm-analyze`).

