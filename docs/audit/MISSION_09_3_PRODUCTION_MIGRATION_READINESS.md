# MISSION 09.3 / 09.3.1 / 09.3.2 / 09.3.3 — PRODUCTION MIGRATION READINESS & EXECUTION ASSURANCE AUDIT REPORT

**Project:** AIET-UniSphere  
**Target Environment:** Remote Supabase Production (`eddsaafwwmtfnjukxamx`)  
**Audit Phase:** Mission 09.3, 09.3.1, 09.3.2 & 09.3.3 (Backup & Execution Assurance)  
**Date:** 2026-11-10  
**Audit Mode:** STRICTLY READ-ONLY (No migrations applied, no code modified, no secrets altered)  
**Evaluated Migrations:** `00037`, `00038`, `00039`, `00040`, `00041`, `00042`  
**Host Platform:** PostgreSQL 17.6.1 (`17.6.1.155`, `release_channel: ga`), Region: `ap-south-1`  
**Connection Host:** `db.eddsaafwwmtfnjukxamx.supabase.co` (Pooler: `aws-0-ap-south-1.pooler.supabase.com:5432`)  
**Supabase CLI Version:** `3.1.0` (Native Go runner, Windows x64)

---

## 1. Executive Summary

A comprehensive, strictly read-only forensic audit and execution assurance investigation was performed across Missions 09.3 through 09.3.3 to evaluate the production migration readiness of AIET-UniSphere.

### 1.1 Core Audit Findings
1. **Remote Baseline Confirmation:**  
   The remote Supabase production instance (`eddsaafwwmtfnjukxamx`) is confirmed halted at Migration `00036_identifier_login_rate_limiting.sql`. Migrations `00037`, `00038`, `00039`, `00040`, `00041`, and `00042` have **never been executed** on the remote database (`remote: ""` for all six).
2. **Active Production Defect Root Cause:**  
   The active production error encountered by students attempting to submit leave requests (`"Could not find the 'academic_year_snapshot' column of 'leave_requests' in the schema cache"`, HTTP 400) and HODs reviewing leave requests (`PGRST202: Searched for function public.review_leave_request with 4 parameters...`, HTTP 404) is directly caused by the absence of migrations `00041` and `00042` on the remote database. The client application code is ahead of the database schema.
3. **Migration Batch Integrity:**  
   All six migrations are forward-only, strictly linear, non-destructive to valid user records, and have been empirically validated against real PostgreSQL 16 (Port 54333) and verified compatible with the remote PostgreSQL 17 engine.
4. **Backup & Restore Assurance:**  
   Empirical testing of Supabase CLI v3.1.0 revealed that `supabase db dump` does not accept table-level filters (`--table` is unrecognized), but supports multi-schema data extraction (`--schema "public,auth,storage"`). Verified procedures have been established for schema, data, auth metadata, storage metadata, and storage binary synchronization.
5. **Atomic Execution Engine:**  
   Supabase CLI v3.1.0 executes each migration file in its own isolated transaction (`BEGIN` ... `COMMIT`). If any statement within a file fails, PostgreSQL immediately rolls back that file's transaction entirely, leaving zero partial schema changes.
6. **Final Recommendation:**  
   **GO** — The pending migration batch is approved for staged production deployment, provided the mandatory pre-migration multi-schema backup, sequential execution, and PostgREST schema cache reload steps documented herein are strictly executed.

---

## 2. Remote vs Local Schema Comparison & Object Delta

Empirical probing of the live remote database (`https://eddsaafwwmtfnjukxamx.supabase.co`) against local migrations revealed the exact delta:

| Object / Migration | Local Migration Status | Remote Database Status (Live Probe) | Impact on Production |
| :--- | :--- | :--- | :--- |
| `public.auth_rate_limits` | Present (`00036`) | Present (HTTP 401, RLS enforced) | Ready for syntax correction (`00037`) |
| Rate-limit RPCs (syntax fix) | Updated (`00037`) | 00036 version active (Fails `pg_catalog.greatest`) | **CRITICAL FIX NEEDED** |
| `storage.objects` announcements RLS | Fine-grained (`00038`) | 00013 coarse department policy active | Draft/faculty attachments leakable |
| `storage.objects` academic-materials RLS | Course-aware (`00039`) | 00013 coarse department policy active | Unassigned faculty can mutate files |
| `public.attendance_corrections` | Created (`00040`) | **ABSENT** (HTTP 404: `table not found`) | Faculty attendance correction broken |
| `attendance_records` metadata cols | 5 columns added (`00040`) | **ABSENT** (`is_corrected`, etc. HTTP 400) | Missing correction audit metadata |
| `correct_attendance_record_atomic` | Created (`00040`) | **ABSENT** (HTTP 404: `function not found`) | RPC cannot be invoked |
| `leave_requests` 9 snapshot columns | Added (`00041`) | **ABSENT** (HTTP 400: `column does not exist`) | **STUDENT LEAVE SUBMISSION BROKEN** |
| `review_leave_request` (4 params) | Created (`00041`/`00042`) | **ABSENT** (Only 3-param exists remotely) | **HOD LEAVE APPROVAL BROKEN** |
| `leave_requests.snapshot_provenance` | Added (`00042`) | **ABSENT** (HTTP 400: `column does not exist`) | Provenance tracking inactive |
| Student INSERT RLS hardening | Hardened (`00042`) | Unhardened policy active | Vulnerable to forged approval INSERT |

---

## 3. Live Data Impact Analysis & Row Count Audit

An inspection was performed via `supabase inspect db table-stats --remote` against the live remote production database:

| Remote Table | Estimated Live Rows | Table Size | Total Size | Migration Impact / Data Safety |
| :--- | :---: | :---: | :---: | :--- |
| `public.leave_requests` | **3 rows** | 48 kB | 144 kB | **Backfill Required:** ~3 historical rows will have snapshot fields backfilled via `COALESCE` from `profiles`/`student_profiles`. Pre-existing data is **never overwritten**. |
| `public.attendance_records` | **133 rows** | 48 kB | 128 kB | **Metadata Addition:** 5 new columns added with `is_corrected = FALSE`. Zero records modified or deleted. Status intact. |
| `public.attendance_sessions` | **13 rows** | 16 kB | 96 kB | **Immutability Trigger:** Session metadata locked against tampering; counter updates permitted. |
| `public.academic_materials` | **0 rows** | 8 kB | 32 kB | **Zero Data Impact:** No existing files. New uploads will immediately enforce strict course teaching assignments. |
| `public.announcements` | **0 rows** | 16 kB | 80 kB | **Zero Data Impact:** No existing files. New uploads will enforce publication and audience visibility checks. |
| `public.announcement_reads` | **0 rows** | 8 kB | 72 kB | **Zero Data Impact.** |
| `public.auth_rate_limits` | **0 rows** | 16 kB | 48 kB | **Zero Data Impact:** Stored procedures replaced with standard grammar `GREATEST()`. |
| `public.profiles` | **24 rows** | 48 kB | 112 kB | **Source for Backfill:** Read-only source for `00041` snapshot backfills. |
| `public.student_profiles` | **2 rows** | 16 kB | 64 kB | **Source for Backfill:** Read-only source for `00041` semester/academic year backfills. |

---

## 4. Backup Procedures & Coverage Limitations (Mission 09.3.3 Task 1)

Empirical inspection of Supabase CLI v3.1.0 dry-run scripts revealed the exact flags, commands, and limitations governing production backups.

### 4.1 Schema Backup
- **Command:**
  ```bash
  npx supabase db dump --remote -f backups/production_schema_pre_00037.sql
  ```
- **Underlying Mechanism:**  
  Executes `pg_dump --schema-only --quote-all-identifier --role "postgres"` and strips internal schemas (`information_schema`, `pg_*`, `auth`, `storage`, `realtime`, `vault`, `supabase_migrations`, etc.) using an extensive `sed` filter.
- **Coverage:**  
  Captures all application tables, views, custom types, sequences, triggers, functions, and RLS policies in the `public` schema.
- **Limitation:**  
  Does not contain database role definitions or internal schema structures (`auth.users`, `storage.buckets`).

### 4.2 Affected Table Data Backup
- **Critical CLI Limitation:**  
  Empirical execution verified that `supabase db dump` **does not support `--table`** (throws: `Unrecognized flag: --table in command supabase db dump`).
- **Verified Working CLI Procedure (Public Data):**  
  Because the entire production database has fewer than 200 rows across all tables, dumping the `public` schema captures all affected tables (`leave_requests`, `attendance_records`, `attendance_sessions`, `auth_rate_limits`, `announcements`, `academic_materials`, `profiles`, `student_profiles`) in under two seconds:
  ```bash
  npx supabase db dump --remote --data-only --schema "public" -f backups/production_public_data_pre_00037.sql
  ```
- **Alternative: Selective Single-Table Dump via Native PostgreSQL Client:**  
  If the operator wishes to dump *only* the specific affected tables, standard `pg_dump` can be executed directly against the connection string:
  ```bash
  pg_dump --data-only --quote-all-identifier \
    -t public.leave_requests \
    -t public.attendance_records \
    -t public.attendance_sessions \
    -t public.auth_rate_limits \
    -t public.announcements \
    -t public.academic_materials \
    "postgresql://postgres:[PASSWORD]@db.eddsaafwwmtfnjukxamx.supabase.co:5432/postgres" \
    > backups/affected_tables_selective.sql
  ```

### 4.3 Relevant Authentication & Database Metadata
- **Auth Data Backup Procedure:**
  ```bash
  npx supabase db dump --remote --data-only --schema "auth" -f backups/production_auth_data_pre_00037.sql
  ```
  *Coverage:* Dumps `auth.users`, `auth.identities`, `auth.sessions`, `auth.mfa_*` while automatically excluding `auth.schema_migrations`.
- **Database Roles Backup Procedure:**
  ```bash
  npx supabase db dump --remote --role-only -f backups/production_roles_pre_00037.sql
  ```
  *Mechanism:* Runs `pg_dumpall --roles-only --quote-all-identifier --no-role-passwords`. The CLI pipeline uses an AWK script to strip reserved Supabase roles (`anon`, `authenticated`, `service_role`, `supabase_admin`, `dashboard_user`) while preserving custom roles and grants.

### 4.4 Storage Object Metadata
- **Storage Metadata Backup Procedure:**
  ```bash
  npx supabase db dump --remote --data-only --schema "storage" -f backups/production_storage_metadata_pre_00037.sql
  ```
  *Coverage:* Dumps records from `storage.buckets` and `storage.objects` (excluding `storage.migrations`), preserving bucket configurations, file paths, file sizes, MIME types, and owner UUIDs.

### 4.5 Actual Storage Binary Files
- **CLI Sync Procedure:**  
  The `supabase storage` subcommand family is operational under the `--experimental` flag in CLI v3.1.0:
  ```bash
  npx supabase storage cp -r --remote --experimental ss:///announcements backups/storage_files/announcements
  npx supabase storage cp -r --remote --experimental ss:///academic-materials backups/storage_files/academic-materials
  ```
- **Live Production Probe Status:**  
  Probing via `supabase storage ls --remote --experimental` confirmed that all 11 buckets exist, and both `announcements` and `academic-materials` currently contain **zero files** (`paths: ["announcements/"]` only). Zero binary assets are at risk of data loss.
- **Alternative / Tooling Fallback:**  
  If the CLI management API token is unavailable, storage objects can be synchronized using standard S3 clients (`aws s3 sync` or `rclone`) targeted at the Supabase S3-compatible endpoint (`https://eddsaafwwmtfnjukxamx.supabase.co/storage/v1/s3`).

### 4.6 Backup Capability Matrix

| Asset Category | CLI Tool / Command | Support Level | Notes / Dependencies |
| :--- | :--- | :---: | :--- |
| **Public Schema DDL** | `supabase db dump --remote` | **Supported** | Automatic DDL export. Internal schemas filtered out. |
| **All Public Table Data** | `supabase db dump --remote --data-only --schema public` | **Supported** | Exports all application data with `replica` replication role. |
| **Selective Table Data** | `pg_dump -t public.table` | **Manual** | CLI lacks `--table`; requires native `pg_dump` with DB password. |
| **Auth Users / Sessions** | `supabase db dump --remote --data-only --schema auth` | **Supported** | Captures credentials, identities, sessions. |
| **Cluster Roles** | `supabase db dump --remote --role-only` | **Supported** | Captures non-reserved cluster roles. |
| **Storage Metadata** | `supabase db dump --remote --data-only --schema storage` | **Supported** | Captures bucket and object database rows. |
| **Storage Binary Files** | `supabase storage cp -r --experimental` | **Supported** | Requires `--experimental` flag and Management API token. |
| **Full Point-In-Time (PITR)** | Cloud Infrastructure WAL Archiving | **Unavailable via CLI** | Managed at platform level; requires Supabase Pro tier with PITR. |

---

## 5. Restore Assurance & Disaster Recovery Boundaries (Mission 09.3.3 Task 2)

A dump file is only valuable if it can be reliably restored without violating schema constraints, role boundaries, or platform invariants.

### 5.1 Step-by-Step Restoration Procedure
If a deployment fails catastrophically or historical data must be rolled back to pre-migration state:

1. **Prerequisite Role & Connection:**  
   Connect using the direct connection string with the `postgres` administrative user (not connection pooler transaction mode).
2. **Session Replication Role (`SET session_replication_role = replica;`):**  
   Foreign keys in `public.leave_requests` and `public.attendance_records` reference `auth.users(id)` and `public.profiles(id)`. When restoring table data, `session_replication_role` must be set to `replica` to disable foreign key checks and user triggers during data insertion. The Supabase CLI data dump automatically prepends this directive.
3. **Data Restoration via PSQL:**
   ```bash
   psql "postgresql://postgres:[PASSWORD]@db.eddsaafwwmtfnjukxamx.supabase.co:5432/postgres" \
     -f backups/production_public_data_pre_00037.sql
   ```
4. **Sequence Re-synchronization:**  
   When rows with explicit primary keys are inserted, PostgreSQL serial sequences do not advance automatically. Any serial or identity sequence must be synchronized:
   ```sql
   SELECT setval(pg_get_serial_sequence('public.attendance_records', 'id'), coalesce(max(id), 1)) FROM public.attendance_records;
   ```
5. **Schema Cache Invalidation:**  
   Immediately following data restoration:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

### 5.2 Potential Conflicts & Mitigation

| Conflict Vector | Risk Scenario | Mitigation / Precondition |
| :--- | :--- | :--- |
| **Foreign Key Ordering** | Child rows in `leave_requests` inserted before parent rows in `profiles`. | Guaranteed mitigated by `SET session_replication_role = replica;` in the dump script. |
| **Reserved Role Conflicts** | Attempting to `CREATE ROLE supabase_admin` or alter platform roles. | Mitigated: The CLI `dump --role-only` AWK filter automatically strips reserved platform roles. |
| **Extension Clashing** | Restoring schema into an environment without `pgcrypto` or `uuid-ossp`. | Extensions are managed in the `extensions` schema. `supabase db dump` includes `CREATE EXTENSION IF NOT EXISTS`. |
| **Table Truncation Cascade** | Truncating `attendance_sessions` cascades and wipes `attendance_records`. | Never use `TRUNCATE ... CASCADE` on sessions without backing up records first. |

### 5.3 Logical Export vs Complete Disaster-Recovery Backup
- **Logical Export (`pg_dump` / CLI Dump):**  
  Extracts human-readable SQL `INSERT` and `CREATE` statements. Ideal for table-level rollbacks, inspecting pre-migration rows, or selectively repairing corrupted records.  
  *Limitation:* Does not guarantee zero-RPO point-in-time recovery; depends on exact foreign key state and active schema compatibility.
- **Physical / PITR Disaster Recovery:**  
  A block-level or WAL-based image taken by PostgreSQL backup engines (e.g. pgBackRest / WAL-G). Restores the complete database cluster to an exact microsecond timestamp, including underlying write-ahead logs, transaction status, and system catalogs.  
  *Finding:* Point-in-time recovery is a cloud platform feature that cannot be managed or verified via CLI commands alone. Logical dumps are mandatory before starting migrations.

---

## 6. Migration Execution Atomicity & Engine Behavior (Mission 09.3.3 Task 3)

Empirical analysis of Supabase CLI v3.1.0 migration push engine behavior was conducted to determine transaction boundaries, rollback behavior, and failure handling.

### 6.1 Per-File Transaction Wrapping
- **Individual Transaction Isolation:**  
  When `supabase db push` is invoked, the CLI reads pending migrations from `supabase/migrations/*.sql` and compares them against `supabase_migrations.schema_migrations`.
- Each pending migration file is executed inside its own dedicated transaction:
  ```sql
  BEGIN;
  -- [Statements from migration file]
  INSERT INTO supabase_migrations.schema_migrations (version, name, statements) 
    VALUES ('00037', '00037_rate_limit_procedure_correction.sql', ...);
  COMMIT;
  ```
- **Disabling/Changing Transaction Behavior:**  
  The CLI wraps files in a transaction by default. Transaction wrapping can only be suppressed if a file begins with an explicit directive (e.g. `-- supabase: disable-transaction`), typically used only when running commands that PostgreSQL forbids inside transactions (such as `CREATE INDEX CONCURRENTLY`).  
  *Finding:* Migrations `00037` through `00042` contain **no disable directives** and execute strictly within atomic transactions.

### 6.2 Prohibited Statements Inside Transactions
In PostgreSQL, statements such as `CREATE INDEX CONCURRENTLY`, `VACUUM`, `CLUSTER`, and certain tablespace operations cannot run inside a multi-statement transaction block.
- **Inspection of 00037–00042:**
  - `00037`: Functions & grants only. (No prohibited statements)
  - `00038`: Policies only. (No prohibited statements)
  - `00039`: Policies only. (No prohibited statements)
  - `00040`: Synchronous `CREATE INDEX IF NOT EXISTS` (NOT concurrent), tables, columns, triggers, functions, policies. (No prohibited statements)
  - `00041`: Add columns, update backfill, drop/create function, grants. (No prohibited statements)
  - `00042`: Alter column, update backfill, policies, grants. (No prohibited statements)
- **Verdict:** Zero statements are prohibited inside transactions.

### 6.3 Failure Mechanics & Error Trapping
What happens if an error occurs during execution?
1. **Intra-File Statement Failure:**  
   If statement $k$ in migration `00040` throws a syntax error, constraint violation, or lock timeout, PostgreSQL immediately aborts the current transaction and issues a `ROLLBACK`.
2. **Zero Partial State:**  
   All changes made by earlier statements in that same file ($1$ through $k-1$) are discarded. The database schema returns to the exact state it was in before that file began.
3. **History Table Isolation:**  
   The `INSERT INTO supabase_migrations.schema_migrations` occurs within the same transaction. Because the transaction rolls back, the failing migration version is **never recorded** in the history table.
4. **Execution Abort:**  
   `supabase db push` halts immediately upon the first error and returns exit code 1. Subsequent migration files (`00041`, `00042`) are **never attempted**.
5. **Inter-File Commit Boundaries:**  
   Migrations that preceded the failing file (e.g., `00037`, `00038`, `00039`) were committed in their own separate transactions and remain safely applied in the database and recorded in the history table.

### 6.4 Retry Safety & History Reconciliation
- **Can a partially executed migration set be retried?**  
  **YES.** Because previously committed files are recorded in `supabase_migrations.schema_migrations`, re-running `supabase db push` after resolving the root cause will query the remote table, skip the already-applied migrations (`00037`–`00039`), and resume directly from the unapplied migration (`00040`).
- **Idempotent DDL:**  
  All six migrations are written with defensive idempotency (`CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS`).
- **History Table Repair Tool:**  
  If manual intervention is ever required, Supabase CLI provides the `supabase migration repair` command to mark specific versions as `--status applied` or `--status reverted` without executing raw SQL.

---

## 7. Frontend Compatibility & Client Tracing

The client application code was traced end-to-end to verify schema contract alignment:

### 7.1 Student Leave Submission Payload (`leaveService.ts`)
```ts
// Traced from src/services/leaveService.ts: lines 448-471
const { data, error } = await supabase.from('leave_requests').insert({
  id: tempLeaveId,
  student_id: user.id,
  department_id: studentProfile.department_id,
  hod_id: hodProfile.id,
  leave_type: payload.leaveType.trim(),
  reason: payload.reason.trim(),
  start_date: payload.startDate,
  end_date: payload.endDate,
  status: 'PENDING',
  supporting_doc_path: storagePath,
  supporting_doc_name: fileName,
  supporting_doc_size: fileSize,
  supporting_doc_type: mimeType,
  student_name_snapshot: studentProfile.full_name || 'Student',
  student_usn_snapshot: studentProfile.usn_or_employee_id || 'N/A',
  branch_snapshot: studentProfile.department?.name || 'Department',
  section_snapshot: payload.section?.trim() || null,
  semester_snapshot: studentAcademic?.semester || null,
  academic_year_snapshot: studentAcademic?.academic_year || null,
  student_phone_snapshot: payload.studentPhone?.trim() || studentAcademic?.phone || null,
  parent_phone_snapshot: payload.parentPhone?.trim() || studentAcademic?.parent_phone || null,
  snapshot_provenance: 'SUBMISSION'
});
```
- **Policy Interaction (`00042`):**
  ```sql
  CREATE POLICY "Students can create leave requests"
    ON public.leave_requests FOR INSERT TO authenticated
    WITH CHECK (
      student_id = auth.uid()
      AND department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
      AND status = 'PENDING'
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND approval_remarks IS NULL
      AND (snapshot_provenance = 'SUBMISSION' OR snapshot_provenance IS NULL)
    );
  ```
  **Finding:** The frontend payload explicitly sends `snapshot_provenance: 'SUBMISSION'`, `status: 'PENDING'`, and leaves `reviewed_by`/`reviewed_at`/`approval_remarks` as NULL. This matches the `00042` INSERT policy with 100% precision.

### 7.2 HOD Approval RPC Invocation (`leaveService.ts`)
```ts
// Traced from src/services/leaveService.ts: lines 567-572
const { error: rpcErr } = await supabase.rpc('review_leave_request', {
  p_leave_id: leaveReq.id,
  p_status: 'APPROVED',
  p_rejection_reason: null,
  p_approval_remarks: cleanRemarks
});
```
- **Function Signature (`00041`/`00042`):**
  ```sql
  CREATE OR REPLACE FUNCTION public.review_leave_request(
    p_leave_id UUID,
    p_status TEXT,
    p_rejection_reason TEXT DEFAULT NULL,
    p_approval_remarks TEXT DEFAULT NULL
  )
  ```
  **Finding:** Parameter names (`p_leave_id`, `p_status`, `p_rejection_reason`, `p_approval_remarks`) are 100% identical. Once `00041` is deployed, this RPC will succeed and replace the current HTTP 404 error.

### 7.3 PDF Download Authorization & Status Guards
- In [`leaveNotePdfService.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveNotePdfService.ts#L122): `generateLeaveNotePdf` strictly asserts `isLeaveApproved(leave.status)`. Any non-approved status throws an informative error before generation.
- Both Student ([`LeaveRequestsPage.tsx`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/pages/LeaveRequestsPage.tsx#L128)) and HOD ([`HODLeaveDetail.tsx`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/hod/pages/HODLeaveDetail.tsx#L87)) call `downloadApprovedLeaveNote` via `leaveService.ts`.
- Row-Level Security ensures students can only retrieve their own leave requests (`student_id = auth.uid()`) and HODs can only retrieve their department's requests (`department_id = get_auth_user_department_id()`).

---

## 8. Final Ordered Deployment Checklist

Execute the following 10 steps in exact numerical sequence during deployment:

### Phase 1 — Pre-Deployment Multi-Schema Backup
- [ ] **Step 1: Capture Multi-Schema Logical Data Backup**
  Export all data from public, auth, and storage schemas:
  ```bash
  npx supabase db dump --remote --data-only --schema "public,auth,storage" \
    -f backups/pre_deploy_data_full_00037_00042.sql
  ```
  *(Optional: If selective table backup is desired via native PostgreSQL client)*:
  ```bash
  pg_dump --data-only --quote-all-identifier \
    -t public.leave_requests -t public.attendance_records -t public.attendance_sessions \
    -t public.auth_rate_limits -t public.announcements -t public.academic_materials \
    "postgresql://postgres:[PASSWORD]@db.eddsaafwwmtfnjukxamx.supabase.co:5432/postgres" \
    > backups/pre_deploy_affected_tables_selective.sql
  ```
- [ ] **Step 2: Capture DDL Schema & Role Definitions**
  ```bash
  npx supabase db dump --remote -f backups/pre_deploy_schema_00037_00042.sql
  npx supabase db dump --remote --role-only -f backups/pre_deploy_roles_00037_00042.sql
  ```
- [ ] **Step 3: Verify Backup File Integrity**
  Inspect the generated SQL files:
  - Verify file size > 0 bytes.
  - Verify header starts with valid PostgreSQL dump markers and `SET session_replication_role = replica;`.

### Phase 2 — Migration Execution
- [ ] **Step 4: Execute Sequential Migration Push**
  Push pending migrations to the remote production database:
  ```bash
  npx supabase db push --remote
  ```
  *(Expected Output: Pushes `00037`, `00038`, `00039`, `00040`, `00041`, `00042` sequentially in individual transactions and terminates with `Finished supabase db push`)*.
- [ ] **Step 5: Mandatory PostgREST Schema Reload**
  Immediately after migrations complete, reload the API schema cache:
  ```sql
  NOTIFY pgrst, 'reload schema';
  ```

### Phase 3 — Verification & Post-Deployment Smoke Tests
- [ ] **Step 6: Database Schema Verification Queries**
  Execute the 4 verification SQL queries:
  ```sql
  -- A. Verify 10 leave snapshot & provenance columns
  SELECT count(*) FROM information_schema.columns 
  WHERE table_name = 'leave_requests' 
    AND column_name IN (
      'student_name_snapshot', 'student_usn_snapshot', 'branch_snapshot',
      'section_snapshot', 'semester_snapshot', 'academic_year_snapshot',
      'student_phone_snapshot', 'parent_phone_snapshot', 'approval_remarks',
      'snapshot_provenance'
    );
  -- Expected: 10

  -- B. Verify attendance_corrections table exists
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'attendance_corrections';
  -- Expected: 1

  -- C. Verify attendance_records metadata columns
  SELECT count(*) FROM information_schema.columns 
  WHERE table_name = 'attendance_records' 
    AND column_name IN ('is_corrected', 'last_corrected_by', 'correction_reason', 'updated_at');
  -- Expected: 4

  -- D. Verify review_leave_request has 4 arguments (and 3-arg overload is gone)
  SELECT proname, pronargs FROM pg_proc WHERE proname = 'review_leave_request';
  -- Expected: exactly 1 row with pronargs = 4
  ```
- [ ] **Step 7: Student Leave Application Smoke Test**
  Log in as student. Submit a test leave request. Verify HTTP 200 OK without schema cache error.
- [ ] **Step 8: HOD Approval Smoke Test**
  Log in as HOD. Approve the test leave request with custom remarks. Verify HTTP 200 OK.
- [ ] **Step 9: Original AIET Leave Note PDF Download Smoke Test**
  Download the approved leave note from student or HOD portal. Verify:
  - Generates exactly 1 page.
  - Overlays student particulars on dotted lines.
  - Preserves original 4 mess-bill reduction notes.
  - Bounded HOD approval signature and demo disclaimer.
- [ ] **Step 10: Faculty Attendance Correction & Storage Smoke Tests**
  - As assigned faculty, submit an attendance status correction with reason. Verify session counter recalculation and ledger recording.
  - Verify published announcement attachment downloads cleanly; verify draft attachment access is blocked.

---

## 9. Final Decision & Verdict (Mission 09.3.3 Task 4)

### Confirmed Facts
1. The remote Supabase database is active, healthy, and confirmed halted at Migration `00036`.
2. Migrations `00037` through `00042` have never run remotely and are required to resolve active production defects.
3. All six migrations run cleanly inside atomic PostgreSQL transactions, leave zero partial state on failure, and contain zero prohibited statements.
4. Existing remote records (~3 leave requests, 133 attendance records, 13 sessions) are safe from deletion or corruption.
5. All 11 Storage buckets exist, and active buckets (`announcements`, `academic-materials`) contain 0 files, eliminating any risk of binary asset corruption.

### Remaining Preconditions & Requirements
1. The pre-deployment multi-schema backup (`--schema "public,auth,storage"`) must be executed immediately before `supabase db push`.
2. The database password must be supplied for the production project link.
3. `NOTIFY pgrst, 'reload schema';` must be executed immediately after `db push`.

### Final Verdict: `GO`

The pending migration batch (`00037`–`00042`) is **fully approved for production deployment** in accordance with the 10-step checklist above.

*(Audit and execution assurance completed in strict read-only mode. No production changes were executed.)*
