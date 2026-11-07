# AIET-UniSphere — Database & Migration Audit Report

**Audit Date:** November 7, 2026  
**Auditor Roles:** Senior Full-Stack Architect, Supabase Security Engineer  
**Linked Supabase Project:** `aiet-unisphere (eddsaafwwmtfnjukxamx)` (Target: `production`)  
**Database Tooling Used:** Supabase CLI v3.0.0, Node.js PostgreSQL Memory Validator (`pg-mem`)  

---

## 1. Remote vs. Local Migration State Comparison

An authenticated audit of the linked Supabase production project was executed via `npx supabase migration list --remote`.

### 1.1 Synchronization Summary
- **Total Local Migration Files:** 45 (35 tracked in Git, 10 untracked in workspace)
- **Migrations Applied to Remote Database:** 32 (`00001` through `00032`)
- **Tracked Migrations Pending Remote Application:** 3 (`00033`, `00034`, `00035`)
- **Untracked Migrations with Duplicate Prefixes:** 10 (`00010` through `00019`)

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                    REMOTE MIGRATION COMPARISON TABLE                   │
  ├──────────┬──────────────────────────────────────────┬─────────┬────────┤
  │ Version  │ Migration Name                           │ Local   │ Remote │
  ├──────────┼──────────────────────────────────────────┼─────────┼────────┤
  │ 00001    │ 00001_auth_profiles.sql                  │ Applied │ Applied│
  │ 00002    │ 00002_identifier_lookup_rpc.sql          │ Applied │ Applied│
  │ 00003    │ 00003_departments.sql                    │ Applied │ Applied│
  │ 00004    │ 00004_academic_workflows.sql             │ Applied │ Applied│
  │ 00005    │ 00005_fix_department_rls_and_scoping.sql │ Applied │ Applied│
  │ 00006    │ 00006_student_profiles_and_dept_rls.sql  │ Applied │ Applied│
  │ 00007    │ 00007_get_department_hod_rpc.sql         │ Applied │ Applied│
  │ 00008    │ 00008_fix_leave_requests_fk.sql          │ Applied │ Applied│
  │ 00009    │ 00009_review_leave_request_rpc.sql       │ Applied │ Applied│
  │ 00010 (T)│ 00010_announcements.sql                  │ Applied │ Applied│
  │ 00010 (U)│ 00010_leave_date_validation.sql          │ Present │ Missing│
  │ 00011 (T)│ 00011_git_and_notifications.sql          │ Applied │ Applied│
  │ 00011 (U)│ 00011_leave_edit_cancel.sql              │ Present │ Missing│
  │ 00012 (T)│ 00012_fix_notification_deletion.sql      │ Applied │ Applied│
  │ 00012 (U)│ 00012_leave_attachments_storage.sql      │ Present │ Missing│
  │ 00013 (T)│ 00013_supabase_storage_and_file_meta.sql │ Applied │ Applied│
  │ 00013 (U)│ 00013_department_seal_and_pdf.sql        │ Present │ Missing│
  │ 00014 (T)│ 00014_attendance_sessions_and_rec.sql    │ Applied │ Applied│
  │ 00014 (U)│ 00014_leave_department_routing.sql       │ Present │ Missing│
  │ 00015 (T)│ 00015_results_timetable_assessments.sql  │ Applied │ Applied│
  │ 00015 (U)│ 00015_leave_attachment_metadata.sql      │ Present │ Missing│
  │ 00016 (T)│ 00016_secure_identifier_login.sql         │ Applied │ Applied│
  │ 00016 (U)│ 00016_current_hod_leave_access.sql       │ Present │ Missing│
  │ 00017 (T)│ 00017_secure_assessment_attempts.sql     │ Applied │ Applied│
  │ 00017 (U)│ 00017_leave_profile_foreign_keys.sql     │ Present │ Missing│
  │ 00018 (T)│ 00018_restrict_github_token_access.sql   │ Applied │ Applied│
  │ 00018 (U)│ 00018_remove_legacy_leave_attach_urls.sql│ Present │ Missing│
  │ 00019 (T)│ 00019_secure_student_service_requests.sql│ Applied │ Applied│
  │ 00019 (U)│ 00019_repair_submit_leave_request_rpc.sql│ Present │ Missing│
  │ 00020-32 │ (Migrations 00020 to 00032)              │ Applied │ Applied│
  │ 00033    │ 00033_assessment_review_system.sql       │ Present │ ❌ PENDING│
  │ 00034    │ 00034_secure_public_signup_trigger.sql   │ Present │ ❌ PENDING│
  │ 00035    │ 00035_timetable_concurrency_guard.sql    │ Present │ ❌ PENDING│
  └──────────┴──────────────────────────────────────────┴─────────┴────────┘
  *(T) = Tracked in Git; (U) = Untracked duplicate in workspace*
```

---

## 2. Duplicate Migration Prefix Collision Analysis

The workspace contains two parallel branches of migrations numbered `00010` through `00019`.

### 2.1 Tracked Branch (Mainline)
1. `00010_announcements.sql`
2. `00011_git_and_notifications.sql`
3. `00012_fix_notification_deletion.sql`
4. `00013_supabase_storage_and_file_metadata.sql`
5. `00014_attendance_sessions_and_records.sql`
6. `00015_results_timetable_assessments_v2.sql`
7. `00016_secure_identifier_login.sql`
8. `00017_secure_assessment_attempts.sql`
9. `00018_restrict_github_token_access.sql`
10. `00019_secure_student_service_requests.sql`

*Status on Remote:* **Already applied and active in production.**

### 2.2 Untracked Branch (Orphaned Leave Feature Work)
1. `00010_leave_date_validation.sql` (Creates `validate_leave_date_constraints`)
2. `00011_leave_edit_cancel.sql` (Creates `cancel_leave_request`, `update_leave_request`)
3. `00012_leave_attachments_storage.sql` (Storage bucket `leave-attachments`)
4. `00013_department_seal_and_pdf.sql` (Adds `departments.seal_url`, `leave_requests.pdf_url`, `leave_requests.verification_id`)
5. `00014_leave_department_routing.sql` (Adds HOD approval routing)
6. `00015_leave_attachment_metadata.sql` (Creates table `leave_attachments`)
7. `00016_current_hod_leave_access.sql` (Modifies RLS for HOD access)
8. `00017_leave_profile_foreign_keys.sql` (Foreign key constraints for reviewer)
9. `00018_remove_legacy_leave_attachment_urls.sql` (Drops legacy columns)
10. `00019_repair_submit_leave_request_rpc.sql` (Replaces `submit_leave_request`)

*Status on Remote:* **NOT applied to remote.**

### 2.3 Collision Impact & Risk
If a developer or CI job runs `npx supabase db push`, Supabase CLI checks the files by numerical prefix. Because version numbers `00010` to `00019` already exist in `supabase_migrations.schema_migrations` on remote, the untracked duplicate files will either be silently ignored (leaving schema dependencies unfulfilled) or crash the migration tool due to duplicate version entries in the local directory.

---

## 3. Analysis of Pending Migrations (00033, 00034, 00035)

These three migrations were committed to `main` locally but have never been pushed or executed against the remote production database.

### 3.1 Migration 00033: Assessment Review System
- **File:** `supabase/migrations/00033_assessment_review_system.sql`
- **Introduces:**
  - `get_student_attempt_review(p_attempt_id UUID)`
  - `get_faculty_attempt_review(p_attempt_id UUID)`
  - `get_faculty_assessment_submissions(p_assessment_id UUID)`
- **Production Impact:** Because these RPCs do not exist on the remote database, any attempt by students or faculty to review submitted quizzes (`/student/assessments/:id` and `/faculty/assessments/:id/results/:attemptId`) will fail with a Postgres `function does not exist` runtime error.

### 3.2 Migration 00034: Secure Public Signup Trigger
- **File:** `supabase/migrations/00034_secure_public_signup_trigger.sql`
- **Introduces:** Complete overhaul of `handle_new_user()` trigger on `auth.users`. Overrides any user metadata `role` to strictly `'STUDENT'` and enforces empty `search_path = ''`.
- **Production Impact:** **CRITICAL SECURITY RISK.** The remote production database is currently executing the old trigger from `00001_auth_profiles.sql`, which only checks `IF assigned_role = 'ADMIN' THEN assigned_role := 'STUDENT'; END IF;`. A malicious actor can self-register via the public signup endpoint with `{ "data": { "role": "FACULTY" } }` or `{ "data": { "role": "HOD" } }` and gain immediate faculty or department head privileges.

### 3.3 Migration 00035: Timetable Concurrency Guard
- **File:** `supabase/migrations/00035_timetable_concurrency_guard.sql`
- **Introduces:**
  - Native 12h/24h time parsing function
  - Cross-department room conflict validation RPC `validate_timetable_entry_concurrency`
  - Deadlock-free transactional advisory locking (`pg_advisory_xact_lock`)
- **Production Impact:** Without this migration on remote, timetable entry creation lacks physical room collision enforcement and concurrency guards, allowing overlapping classes to be scheduled in the same physical room across departments.

---

## 4. Row Level Security (RLS) & Department Scoping Audit

### 4.1 RLS Status Across All Tables
All 43 core public tables have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).

```
  ┌───────────────────────────────┬──────────────┬─────────────────────────┐
  │ Table Name                    │ RLS Enabled  │ Primary Scoping Rule    │
  ├───────────────────────────────┼──────────────┼─────────────────────────┤
  │ profiles                      │ ✅ Enabled   │ Self read/update; Admin │
  │ student_profiles              │ ✅ Enabled   │ Self read/update; Dept  │
  │ departments                   │ ✅ Enabled   │ Active read; Admin write│
  │ courses                       │ ✅ Enabled   │ Dept/enrolled; Fac/Admin│
  │ course_enrollments            │ ✅ Enabled   │ Student self; Fac teach │
  │ academic_materials            │ ✅ Enabled   │ Enrolled/Dept users     │
  │ assignments                   │ ✅ Enabled   │ Enrolled/Dept users     │
  │ assignment_submissions        │ ✅ Enabled   │ Student self; Fac teach │
  │ assessments                   │ ✅ Enabled   │ Department/Course scope │
  │ assessment_questions          │ ✅ Enabled   │ Faculty/HOD; masked stu │
  │ assessment_attempts           │ ✅ Enabled   │ Student self; Fac teach │
  │ assessment_answers            │ ✅ Enabled   │ Student attempt owner   │
  │ attendance_sessions           │ ✅ Enabled   │ Faculty owner; Dept HOD │
  │ attendance_records            │ ✅ Enabled   │ Student self; Fac owner │
  │ leave_requests                │ ✅ Enabled   │ Student self; Dept HOD  │
  │ timetable_entries             │ ✅ Enabled   │ Read all; HOD write     │
  │ results                       │ ✅ Enabled   │ Student self; Dept HOD  │
  │ announcements                 │ ✅ Enabled   │ Target role & dept      │
  │ notifications                 │ ✅ Enabled   │ User self               │
  │ user_projects                 │ ✅ Enabled   │ Project members         │
  │ project_members               │ ✅ Enabled   │ Member list             │
  │ project_tasks                 │ ✅ Enabled   │ Member list             │
  │ project_milestones            │ ✅ Enabled   │ Member list             │
  │ project_files                 │ ✅ Enabled   │ Member list             │
  │ github_connections           │ ✅ Enabled   │ User self               │
  │ institutional_documents       │ ✅ Enabled   │ Approved role-scoped    │
  │ institutional_document_chunks │ ✅ Enabled   │ Parent document policy  │
  │ external_learning_courses     │ ✅ Enabled   │ Dept/public; Fac write  │
  │ external_course_enrollments   │ ✅ Enabled   │ Student self; Fac/HOD   │
  │ external_course_evidence      │ ✅ Enabled   │ Student self; Fac/HOD   │
  │ student_skills                │ ✅ Enabled   │ Student self; Fac/Admin │
  │ student_achievements          │ ✅ Enabled   │ Student self; Fac/Admin │
  │ service_catalog               │ ✅ Enabled   │ Active read             │
  │ student_service_requests      │ ✅ Enabled   │ Student self; Admin     │
  │ audit_logs                    │ ✅ Enabled   │ Admin only              │
  └───────────────────────────────┴──────────────┴─────────────────────────┘
```

### 4.2 Department Scoping Verification
Department isolation is enforced through two primary mechanisms:
1. Direct `department_id` equality matches against `profiles.department_id`.
2. Helper functions `public.get_auth_user_department_id()` and `public.get_auth_user_role()`.

*Verification Result:* Department isolation is robustly designed to prevent cross-department data leakage. Faculty in Department A cannot view or grade assignments in Department B unless explicitly assigned to that course.

---

## 5. Audit of SECURITY DEFINER Functions & search_path

PostgreSQL functions declared as `SECURITY DEFINER` run with the privileges of the database owner. If `search_path` is not explicitly pinned, an attacker who creates malicious objects in a schema ahead of `public` can hijack function execution.

### 5.1 Functions With Secure `SET search_path = ''`
- `validate_timetable_entry_concurrency` (Migration 00035) — ✅ Uses empty search path and fully schema-qualified table references (`public.timetable_entries`, `pg_catalog.time`).
- `handle_new_user` (Migration 00034) — ✅ Uses empty search path (`SET search_path = ''`).

### 5.2 Functions With `SET search_path = public`
- `get_auth_user_department_id()` (Migration 00006)
- `get_auth_user_role()` (Migration 00006)
- `get_department_hod()` (Migration 00007)
- `review_leave_request()` (Migration 00009)
- `cancel_leave_request()` (Migration 00011 untracked)
- `update_leave_request()` (Migration 00011 untracked)
- `delete_notification()` (Migration 00012)
- `clear_all_read_notifications()` (Migration 00012)
- `record_attendance_session_atomic()` (Migration 00014)
- `start_assessment_attempt()` (Migration 00021)
- `save_assessment_answer()` (Migration 00021)
- `submit_assessment_attempt()` (Migration 00021)
- `get_student_assessment_questions()` (Migration 00032)
- `verify_external_course_evidence()` (Migration 00027)
- `create_external_course_assignment_with_enrollment()` (Migration 00027)
- `get_student_attempt_review()` (Migration 00033)
- `get_faculty_attempt_review()` (Migration 00033)
- `get_faculty_assessment_submissions()` (Migration 00033)

*Assessment:* Pinning to `search_path = public` prevents schema search path hijacking as long as untrusted users cannot create tables or operators in `public`. In modern Supabase instances, `public` schema CREATE permission is revoked from `public` by default, making this acceptable, though `search_path = ''` remains the gold standard.

### 5.3 Functions LACKING `search_path` (HIGH SEVERITY)
- `handle_new_user()` in **00001_auth_profiles.sql:109** — ❌ No `search_path` set. (Running on remote production right now).
- `get_email_by_identifier()` in **00002_identifier_lookup_rpc.sql:11** — ❌ No `search_path` set. (Execution revoked from public by 00016, but remains present).

---

## 6. Recommendations for Safe Database Resolution

1. **Do NOT push migrations until duplicate prefixes are resolved.**
2. **Quarantine untracked duplicate migrations `00010` to `00019`** into a dedicated feature branch or renumber them starting at `00036` after reviewing whether their leave functionality is still required.
3. **Deploy pending migrations `00033`, `00034`, and `00035`** to production via an explicit, sequential migration step to patch the public signup privilege escalation vulnerability and enable assessment reviews.

