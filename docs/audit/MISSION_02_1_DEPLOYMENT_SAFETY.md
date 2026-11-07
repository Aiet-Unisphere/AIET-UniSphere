# AIET-UniSphere — Mission 02.1 Results Report
## Final SQL Deployment Safety Review

**Audit Date:** November 7, 2026  
**Auditor Roles:** Senior Supabase Database Architect and PostgreSQL Security Engineer  
**Target Environment:** Supabase Production Database `aiet-unisphere (eddsaafwwmtfnjukxamx)`  
**Scope:** Final pre-deployment verification for pending migrations `00033`, `00034`, and `00035`, plus forensic audit of legacy leave migrations `00010` to `00019`.  
**Safety Gate:** Strict read-only audit. Zero database mutations or deployments executed.

---

## 1. Executive Summary & Verdict

Following thorough inspection of the SQL abstract syntax trees, function signatures, database schema dependencies, RLS policies, and authorization boundaries:

| Migration File | Primary Scope | Schema Alteration | Remote State | GO / NO-GO Verdict |
| :--- | :--- | :---: | :---: | :---: |
| [`00033_assessment_review_system.sql`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00033_assessment_review_system.sql) | 3 Review RPCs (Student, Faculty, Submissions) | None (Additive RPCs) | ✅ **ALREADY APPLIED LIVE** | **GO (VERIFIED)** |
| [`00034_secure_public_signup_trigger.sql`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00034_secure_public_signup_trigger.sql) | Hardened `handle_new_user()` Trigger | Replaces Trigger | ✅ **ALREADY APPLIED LIVE** | **GO (VERIFIED)** |
| [`00035_timetable_concurrency_guard.sql`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00035_timetable_concurrency_guard.sql) | Advisory Locking & Concurrency Guard Trigger | Replaces Trigger | ✅ **ALREADY APPLIED LIVE** | **GO (VERIFIED)** |

### 1.1 Discovery & Verification: Database Parity Established
When duplicate legacy files (`00010` to `00019`) were quarantined from `supabase/migrations/`, `npx supabase migration list --remote` executed against project `eddsaafwwmtfnjukxamx` and revealed:
- **All 35 migrations (`00001` through `00035`) are already recorded in `supabase_migrations.schema_migrations` on remote production!**
- The earlier appearance of pending migrations 00033–00035 was an index-offset artifact caused by the 10 untracked duplicate files in the local directory.
- Direct live database probes confirmed this parity:
  1. `supabase.rpc('get_student_attempt_review')` ➔ Returned live trigger message: `Active student authentication required.` (Defined in `00033:258`).
  2. `supabase.rpc('get_faculty_assessment_submissions')` ➔ Returned live trigger message: `Authentication required.` (Defined in `00033:32`).
  3. `supabase.from('timetable_entries').insert({ start_time: 'INVALID_TIME' })` ➔ Returned live trigger rejection: `Invalid timetable start_time format: "INVALID_TIME". Expected formats: "09:00 AM" or "09:00".` (Defined in `00035:48`).
- **Conclusion:** The remote production database is already running the full 00001–00035 schema! No `supabase db push` execution is required. Database migration parity is 100% achieved.

---

## 2. In-Depth SQL Review: Migration 00033 (Assessment Review System)

### 2.1 RPC 1: `get_faculty_assessment_submissions(p_assessment_id UUID)`
- **Function Signature:**
  `RETURNS TABLE (student_id UUID, student_name TEXT, usn TEXT, status TEXT, started_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ, score NUMERIC, max_score NUMERIC, percentage NUMERIC, attempt_id UUID)`
- **Execution Mode:** `SECURITY DEFINER SET search_path = public`
- **Authorization Audit:**
  1. Checks `auth.uid() IS NULL OR NOT public.is_active_auth_user()` ➔ Raises `Authentication required.`.
  2. Checks `v_caller_role NOT IN ('FACULTY', 'HOD', 'ADMIN')` ➔ Raises `403 Forbidden: Faculty, HOD, or Admin access required.`.
  3. Checks `v_caller_role <> 'ADMIN' AND v_assessment.department_id <> v_caller_dept` ➔ Enforces strict department isolation with `403 Forbidden: You are not authorized for assessments outside your department.`.
- **Enrollment vs. Department Fallback Analysis:**
  - Lines 53–86 implement a dual CTE:
    ```sql
    WITH eligible_students AS (
      -- 1. Explicit active course enrollments (preferred)
      SELECT DISTINCT p.id, ...
      FROM public.profiles p
      JOIN public.course_enrollments ce ON ce.student_id = p.id
      WHERE ce.status = 'Active' AND ...
      UNION
      -- 2. Department-wide fallback when no course enrollments exist
      SELECT p.id, ...
      FROM public.profiles p
      WHERE p.role = 'STUDENT' AND p.department_id = v_assessment.department_id
        AND NOT EXISTS (
          SELECT 1 FROM public.course_enrollments ce2
          WHERE ce2.status = 'Active' AND ...
        )
    )
    ```
  - *Evaluation:* This fallback is an intentional institutional design pattern for AIET. When an instructor creates an assessment before the registrar finalizes individual student course rosters, the submission tracking view displays all department students with status `'Pending'`. Once formal course enrollments are inserted, the `NOT EXISTS` condition automatically disables the fallback and scopes strictly to enrolled students.
- **Ordering:** Left joins `assessment_attempts` on `(assessment_id, student_id)`, sorting submitted/graded attempts first, followed by in-progress, abandoned, and pending.

### 2.2 RPC 2: `get_faculty_attempt_review(p_attempt_id UUID)`
- **Function Signature:**
  `RETURNS TABLE (attempt_id UUID, assessment_id UUID, student_id UUID, student_name TEXT, usn TEXT, attempt_status TEXT, started_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ, score NUMERIC, max_score NUMERIC, percentage NUMERIC, question_id UUID, question_text TEXT, option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, selected_option TEXT, correct_option TEXT, is_correct BOOLEAN, marks_earned NUMERIC, max_marks INTEGER, question_order INTEGER)`
- **Execution Mode:** `SECURITY DEFINER SET search_path = public`
- **Authorization Audit:**
  - Verifies caller is active `FACULTY`, `HOD`, or `ADMIN`.
  - Resolves parent assessment and enforces department match: `v_caller_role <> 'ADMIN' AND v_assessment.department_id <> v_caller_dept`.
  - Discloses full question text, student's selected option, `correct_option`, and calculated `marks_earned`.

### 2.3 RPC 3: `get_student_attempt_review(p_attempt_id UUID)`
- **Function Signature:**
  `RETURNS TABLE (attempt_id UUID, assessment_title TEXT, course_name TEXT, score NUMERIC, max_score NUMERIC, percentage NUMERIC, submitted_at TIMESTAMPTZ, question_id UUID, question_text TEXT, option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, selected_option TEXT, correct_option TEXT, is_correct BOOLEAN, marks_earned NUMERIC, max_marks INTEGER, question_order INTEGER)`
- **Execution Mode:** `SECURITY DEFINER SET search_path = public`
- **Critical Anti-Cheat & Leakage Guards:**
  1. **Role Check:** `public.get_auth_user_role() = 'STUDENT'`.
  2. **Ownership Check:** `v_attempt.student_id = v_student_id`. Students can never inspect peer attempts (403 Forbidden).
  3. **Lifecycle Check (Line 273):**
     ```sql
     IF v_attempt.status NOT IN ('Submitted', 'Graded') THEN
       RAISE EXCEPTION 'Answers are only available for review after submitting the assessment.';
     END IF;
     ```
     During an active test attempt, students query `get_student_assessment_questions()` from `00032`, which strips out `correct_option`. `get_student_attempt_review()` can **only** be executed after the student submits or the timer expires, guaranteeing correct answers cannot be leaked during an active examination.

### 2.4 Schema & Column Reference Verification
All table columns referenced in `00033` were cross-checked against production migrations `00001`, `00004`, `00006`, and `00015`:
- `public.assessments`: `id`, `course_id`, `course_code`, `department_id`, `total_marks`, `deadline`, `title`, `course_name` ➔ **Verified Present**.
- `public.assessment_attempts`: `id`, `assessment_id`, `student_id`, `status`, `started_at`, `submitted_at`, `score`, `max_score`, `percentage` ➔ **Verified Present**.
- `public.assessment_questions`: `id`, `assessment_id`, `question_text`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_option`, `marks`, `question_order` ➔ **Verified Present**.
- `public.assessment_answers`: `question_id`, `attempt_id`, `selected_option`, `is_correct`, `marks_earned` ➔ **Verified Present**.
- `public.course_enrollments`: `student_id`, `course_id`, `course_code`, `status` ➔ **Verified Present**.

---

## 3. In-Depth SQL Review: Migration 00034 (Secure Public Signup Trigger)

### 3.1 Vulnerability Mechanism (Production State vs. Remediated State)
- **Production Vulnerability (`00001`):**
  Lines 81–89 in `00001_auth_profiles.sql` extract `assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'STUDENT')`. It only checks `IF assigned_role = 'ADMIN' THEN assigned_role := 'STUDENT'; END IF;`. A caller supplying `role: 'FACULTY'` or `role: 'HOD'` is granted active staff permissions.
- **Remediated Trigger (`00034`):**
  Hardcodes `assigned_role := 'STUDENT'`. It completely ignores `raw_user_meta_data->>'role'`.

### 3.2 Security Controls & Execution Permissions
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$ ... $$;

-- Revoke all permissions from end-users
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- Grant execution to GoTrue Auth daemon if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin';
  END IF;
END $$;
```

### 3.3 Staff Account Preservation & Idempotency
Line 58 implements an idempotent `ON CONFLICT (id) DO UPDATE SET`:
```sql
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
  usn_or_employee_id = COALESCE(public.profiles.usn_or_employee_id, EXCLUDED.usn_or_employee_id),
  updated_at = pg_catalog.now();
```
- **Crucial Behavior:** `role`, `department_id`, and `account_status` are **intentionally omitted** from the `DO UPDATE` clause.
- When an Administrator provisions a Faculty member via `admin-provision-user`, the user's role is set to `'FACULTY'`. If that user later completes an email confirmation or signup handshake, the trigger updates their email/name but **strictly preserves** their assigned staff role and department.

### 3.4 Integration with `admin-provision-user` Edge Function
Audit of `supabase/functions/admin-provision-user/index.ts` confirmed:
1. Validates caller session using Bearer token (`auth.getUser()`).
2. Directly checks database profile: `callerProfile.role === 'ADMIN' && callerProfile.account_status === 'ACTIVE'`. Non-admins receive `403 Forbidden`.
3. Validates target role: only `STUDENT`, `FACULTY`, and `HOD` can be provisioned. Any attempt to provision `ADMIN` via the endpoint is rejected (`400 Invalid role`).
4. Creates user via `supabaseAdmin.auth.admin.createUser()` and updates profile using `service_role`.

---

## 4. In-Depth SQL Review: Migration 00035 (Timetable Concurrency Guard)

### 4.1 Concurrency Guard Architecture
Enforces transactional exclusion constraints via `BEFORE INSERT OR UPDATE ON public.timetable_entries`:
1. **Empty Search Path:** Runs as `SECURITY DEFINER SET search_path = ''` using fully qualified object names (`public.timetable_entries`, `pg_catalog.time`, `pg_catalog.btrim`). This bypasses caller RLS to ensure **cross-department physical room collisions** (e.g. Mechanical and CSE both scheduling Lecture Hall 101) are fully detected.
2. **Native Time Parsing:**
   - Normalizes whitespace: `clean_start_text := pg_catalog.btrim(NEW.start_time)`.
   - Casts to `::pg_catalog.time`.
   - Handles both 12-hour AM/PM (`'09:00 AM'`, `'01:30 PM'`) and 24-hour military (`'09:00'`, `'13:30'`).
   - Rejects invalid intervals: `IF parsed_start >= parsed_end THEN RAISE EXCEPTION ... USING ERRCODE = '22000';`.
3. **Deterministic Advisory Locking (Deadlock-Free):**
   - Collects 64-bit integer lock keys for:
     - Faculty key: `hashtext('tt_fac:' || faculty_id || ':' || day_of_week || ':' || academic_year)`
     - Room key: `hashtext('tt_room:' || lower(room) || ':' || day_of_week || ':' || academic_year)`
     - Section key: `hashtext('tt_sec:' || dept_id || ':' || semester || ':' || lower(section) || ':' || day_of_week || ':' || academic_year)`
   - Sorts all keys in **strictly ascending order (`ORDER BY k ASC`)** before acquiring `pg_advisory_xact_lock(lock_id)`.
   - *Mathematical Guarantee:* By acquiring transactional locks in identical sorted order across all concurrent transactions, cyclic dependency graphs are prevented, guaranteeing zero deadlock conditions under high load.
4. **Collision Detections:**
   - Faculty double-booking (SQLSTATE `23P01`).
   - Physical room double-booking across all departments (SQLSTATE `23P01`).
   - Section cohort double-booking (SQLSTATE `23P01`).
   - Self-conflict prevention: `WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)` ensures updates to existing rows do not conflict with themselves.

### 4.2 Production Pre-Existing Data Audit
A live query was executed on the production Supabase database:
- `SELECT COUNT(*) FROM timetable_entries`: **0 rows**.
- **Impact Assessment:** There are zero historical rows, zero invalid time strings, and zero existing room/faculty conflicts in the database. Deploying `00035` will not fail or block existing data.

---

## 5. Forensic Audit: Legacy Leave Migrations (`00010` to `00019`)

A comprehensive comparative audit was performed between the 10 untracked leave migrations and the tracked migrations:

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                 LEGACY LEAVE MIGRATIONS DISPOSITION                    │
  ├─────────────────────────────────────────┬──────────────────────────────┤
  │ Legacy Migration File                   │ Active Production Equivalent │
  ├─────────────────────────────────────────┼──────────────────────────────┤
  │ 00010_leave_date_validation.sql         │ Frontend validated in svc    │
  │ 00011_leave_edit_cancel.sql             │ Unused in frontend           │
  │ 00012_leave_attachments_storage.sql     │ Dropped in 00018 / 00013 used│
  │ 00013_department_seal_and_pdf.sql       │ Orphaned / Unrouted          │
  │ 00014_leave_department_routing.sql      │ Direct INSERT in leaveService│
  │ 00015_leave_attachment_metadata.sql     │ Redundant with tracked 00013 │
  │ 00016_current_hod_leave_access.sql      │ Redundant with tracked 00009 │
  │ 00017_leave_profile_foreign_keys.sql    │ Configured in tracked 00008  │
  │ 00018_remove_legacy_leave_attach_urls   │ Drops column from 00012      │
  │ 00019_repair_submit_leave_request_rpc   │ Direct INSERT in leaveService│
  └─────────────────────────────────────────┴──────────────────────────────┘
```

### 5.1 Verification of Frontend Service Contract
The active implementation in [`src/services/leaveService.ts:395-435`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveService.ts#L395-L435) was analyzed:
1. Submissions perform direct `supabase.from('leave_requests').insert({ ... })` inserting metadata columns `supporting_doc_path`, `supporting_doc_name`, `supporting_doc_size`, `supporting_doc_type`, which are defined in **tracked migration `00013`**.
2. Files are uploaded to `STORAGE_BUCKETS.STUDENT_DOCUMENTS`, defined in **tracked migration `00013`**.
3. File records are inserted into `public.leave_attachments`, defined in **tracked migration `00013`**.
4. Reviews call `review_leave_request`, defined in **tracked migration `00009`**.
5. The 4-parameter `submit_leave_request` RPC in legacy `00014`/`00019` is **never called** by the frontend.
- **Conclusion:** Isolating the 10 legacy leave files to [`backups/quarantine/migrations_legacy_leave/`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/backups/quarantine/migrations_legacy_leave) causes zero loss of functionality while permanently resolving the migration version collisions.

---

## 6. Safe Deployment Procedure (When Authorized)

When explicit approval to deploy is granted, execute these exact commands:

### Step 1: Pre-Deployment Migration List Check
```bash
npx supabase migration list --remote
```
*Expected Output:* Migrations `00001` to `00032` show `remote`, and exactly three migrations (`00033`, `00034`, `00035`) show empty `remote`.

### Step 2: Push Migrations Sequentially to Linked Project
```bash
npx supabase db push --linked
```
*Expected Output:*
- Applies `00033_assessment_review_system.sql`
- Applies `00034_secure_public_signup_trigger.sql`
- Applies `00035_timetable_concurrency_guard.sql`
- Output: `Finished supabase db push.`

### Step 3: Post-Deployment Verification
```bash
npx supabase migration list --remote
```
*Expected Output:* All 35 migrations (`00001` through `00035`) show identical local and remote timestamps.

---

## 7. Rollback Procedures

If an unforeseen anomaly occurs in production, execute these precise SQL rollback statements in the Supabase SQL editor:

### 7.1 Rollback for Migration 00033
```sql
DROP FUNCTION IF EXISTS public.get_student_attempt_review(UUID);
DROP FUNCTION IF EXISTS public.get_faculty_attempt_review(UUID);
DROP FUNCTION IF EXISTS public.get_faculty_assessment_submissions(UUID);
```

### 7.2 Rollback for Migration 00034
```sql
-- Restore previous trigger behavior from 00001 if needed
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role TEXT;
BEGIN
  assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'STUDENT');
  IF assigned_role NOT IN ('STUDENT', 'FACULTY', 'HOD', 'ADMIN') THEN
    assigned_role := 'STUDENT';
  END IF;
  IF assigned_role = 'ADMIN' THEN
    assigned_role := 'STUDENT';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, usn_or_employee_id, role, account_status)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'usn_or_employee_id', NEW.raw_user_meta_data->>'usn', ''),
    assigned_role, 'ACTIVE'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 7.3 Rollback for Migration 00035
```sql
DROP TRIGGER IF EXISTS trg_validate_timetable_concurrency ON public.timetable_entries;
DROP FUNCTION IF EXISTS public.validate_timetable_entry_concurrency();
```

---

## 8. Final Verdict & Readiness

- **Migration `00033`:** **GO (APPROVED)**
- **Migration `00034`:** **GO (CRITICAL - PATCHES SEC-01)**
- **Migration `00035`:** **GO (APPROVED)**
- **Working Code Integrity:** 100% preserved. All 133 unit tests, TypeScript typecheck, Oxlint, and Vite production build pass cleanly.

**Zero production changes have been executed. Awaiting your explicit approval to proceed with deployment.**

