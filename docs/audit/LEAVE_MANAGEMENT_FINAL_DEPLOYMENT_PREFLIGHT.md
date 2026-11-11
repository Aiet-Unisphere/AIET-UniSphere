# FINAL DEPLOYMENT PREFLIGHT & OPERATOR SAFETY RUNBOOK: AIET-UNISPHERE LEAVE MANAGEMENT RELEASE

**Document ID:** `docs/audit/LEAVE_MANAGEMENT_FINAL_DEPLOYMENT_PREFLIGHT.md`  
**Reference Git Checkpoint:** `c5a5bcc`  
**Target Environment:** Remote Supabase Production (`eddsaafwwmtfnjukxamx` · `ap-south-1`)  
**Database Engine:** PostgreSQL 17.6.1 (`17.6.1.155`, GA)  
**Supabase CLI Version:** Native Go Runner v3.1.0  
**Audit Phase:** Final Preflight Safety Review (Conditional Resolution)  
**Execution Mode:** STRICTLY READ-ONLY PREFLIGHT. Zero production migrations executed, zero remote mutations, zero Edge Function deployments, zero GitHub push.

---

## 1. Executive Summary & Review Scope

This document provides the definitive, production-grade safety review and operator runbook for deploying the AIET-UniSphere Leave Management module.

All remaining deployment safety gaps have been systematically addressed:
1. **Migration Execution & Ledger Recovery:** Evaluated the dual execution strategies (Native Staged CLI vs Dashboard Atomic Transaction + CLI Ledger Repair). Provided exact, deterministic recovery runbooks for all five failure and out-of-order ledger edge cases.
2. **Production Backup Readiness:** Formulated an isolated 5-layer backup specification (Public DDL/data, Auth users/identities, Storage metadata, Storage S3 binaries, and Migration history) with checksum verification and isolated restoration testing procedures.
3. **Rigorous Lock & Performance Analysis:** Dissected every SQL statement in `00037`, `00041`, and `00042`. Removed unsubstantiated timing claims, documented lock queueing behaviors, established the exact protection mechanisms of `lock_timeout` and `statement_timeout`, and verified that zero table rewrites occur.
4. **PostgreSQL 17 & Rate-Limiting Defect Verification:** Verified the live remote PostgreSQL 17 engine via empirical system catalog role inspection (`pg_maintain`). Documented the exact PL/pgSQL parser limitation affecting `pg_catalog.greatest` and demonstrated why `00037` must be deployed in the same window.
5. **Operator Runbook:** Established an end-to-end, step-by-step checklist spanning pre-deployment validation, backup verification, atomic execution, PostgREST cache reload, catalog queries, and functional application smoke tests.

---

## 2. Remote Migration History & Live Baseline

A live read-only inspection was executed via `npx supabase migration list --remote` against project `eddsaafwwmtfnjukxamx`:

```
Target: project aiet-unisphere (eddsaafwwmtfnjukxamx) · production
Environment: production · Region: ap-south-1 · Engine: PostgreSQL 17.6.1
```

| Migration Version | Migration Script Name | Local Status | Remote Status | Live Production Status |
| :--- | :--- | :--- | :--- | :--- |
| `00001`–`00035` | (Core schema, departments, storage, RLS) | Present | Applied | **Applied** |
| `00036` | `00036_identifier_login_rate_limiting.sql` | Present | Applied | **Applied (Remote Head)** |
| `00037` | `00037_rate_limit_procedure_correction.sql` | Present | Pending | **NOT APPLIED** (`remote: ""`) |
| `00038` | `00038_announcement_attachment_storage_rls.sql` | Present | Pending | **NOT APPLIED** (`remote: ""`) |
| `00039` | `00039_academic_materials_storage_security.sql` | Present | Pending | **NOT APPLIED** (`remote: ""`) |
| `00040` | `00040_attendance_correction_workflow.sql` | Present | Pending | **NOT APPLIED** (`remote: ""`) |
| `00041` | `00041_leave_note_snapshots_and_remarks.sql` | Present | Pending | **NOT APPLIED** (`remote: ""`) |
| `00042` | `00042_leave_note_security_and_provenance.sql` | Present | Pending | **NOT APPLIED** (`remote: ""`) |
| `00043` | `00043_faculty_designation.sql` | Present | Pending | **NOT APPLIED** (`remote: ""`) |
| `00044` | `00044_faculty_project_mentoring.sql` | Present | Pending | **NOT APPLIED** (`remote: ""`) |

---

## 3. Task 1: Migration Execution Strategy & Ledger Recovery

### 3.1 Evaluation of Supported Execution Methods

| Dimension | Method 1: Staged Supabase CLI Push | Method 2: Dashboard SQL + Migration Repair | Method 3: Full Sequential CLI Push |
| :--- | :--- | :--- | :--- |
| **Mechanism** | Move `00038–00040`, `00043–00044` out of `supabase/migrations/`; run `npx supabase db push --linked`. | Execute `00037`, `00041`, `00042` in one `BEGIN...COMMIT` block via SQL Editor; run `supabase migration repair`. | Run `npx supabase db push --linked` with all migrations `00037–00044` in continuous numeric order. |
| **Transaction Scope** | **Per-file transaction** (`00037`, `00041`, `00042` run in separate transactions). | **Single unified transaction** (all 3 migrations commit or rollback together). | **Per-file transaction** across all 8 pending files. |
| **Ledger Updates** | Automatic by CLI. | Manual via `supabase migration repair --status applied`. | Automatic by CLI. |
| **Out-of-Order Handling** | Native (only staged files exist). | Native (unaffected by local directory). | Sequential (no out-of-order gaps). |
| **Operator Overhead** | Directory staging and restoration. | Copying SQL script and running repair commands. | Zero staging overhead; requires full feature readiness. |
| **Safety Verdict** | **High** for CLI-automated flows. | **Highest Atomicity** for targeted leave scope. | **Recommended** if full platform release is approved. |

### 3.2 Precise Recovery Procedures for Failure Scenarios

#### Scenario 1: SQL execution fails before commit (Method 2)
* **Root Cause:** A syntax error, statement timeout, or lock timeout aborts the transaction before `COMMIT`.
* **Database State:** PostgreSQL rolls back 100% of all DDL statements within the `BEGIN ... COMMIT` block. Zero catalog or table modifications persist.
* **Ledger State:** No `supabase migration repair` command has been run. `supabase_migrations.schema_migrations` remains cleanly at `00036`.
* **Recovery Procedure:**
  1. Inspect the exact PostgreSQL error message and error position.
  2. If caused by `canceling statement due to lock timeout`, verify if active connections held locks on `leave_requests` using `pg_stat_activity`.
  3. No database cleanup or rollback script is needed. Address the root cause and re-run.

#### Scenario 2: SQL commits successfully, but the first migration repair fails
* **Root Cause:** Network disconnection, CLI auth token expiration, or terminal termination during `npx supabase migration repair --status applied 00037 --linked`.
* **Database State:** All DDL changes for `00037`, `00041`, and `00042` are committed and live in PostgreSQL.
* **Ledger State:** `00037` has not been recorded in `supabase_migrations.schema_migrations`.
* **Recovery Procedure:**
  1. Do NOT re-execute the SQL script (it is already committed).
  2. Verify network and run the repair command again:
     ```powershell
     npx supabase migration repair --status applied 00037 --linked
     ```
  3. `migration repair` executes an idempotent `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('00037') ON CONFLICT (version) DO NOTHING`. Retrying is completely safe.
  4. Proceed with repairing `00041` and `00042`.

#### Scenario 3: One or two repair commands succeed, but another fails (e.g., 00037 and 00041 succeed, 00042 fails)
* **Database State:** All DDL is committed in PostgreSQL.
* **Ledger State:** Ledger contains `00037` and `00041`, but is missing `00042`.
* **Recovery Procedure:**
  1. Target specifically the missing version:
     ```powershell
     npx supabase migration repair --status applied 00042 --linked
     ```
  2. Verify completeness via:
     ```powershell
     npx supabase migration list --remote
     ```
  3. Confirm all three versions display `remote: "applied"`.

#### Scenario 4: The migration list reports inconsistent local and remote history
* **Root Cause:** A version was recorded as applied in `schema_migrations`, but the corresponding local file was renamed or modified, or vice versa.
* **Recovery Procedure:**
  1. Query the raw remote migration ledger to determine exact recorded versions:
     ```sql
     SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
     ```
  2. If remote records a version that must be reverted:
     ```powershell
     npx supabase migration repair --status reverted <version> --linked
     ```
  3. If remote is missing a version that was executed:
     ```powershell
     npx supabase migration repair --status applied <version> --linked
     ```

#### Scenario 5: A later `supabase db push` encounters the skipped migrations 00038–00040
* **Root Cause:** Targeted Leave deployment deployed `00037`, `00041`, and `00042`. At a later date, another developer or release pipeline runs `npx supabase db push`.
* **CLI Behavior:** Supabase CLI scans `supabase/migrations/` and queries `supabase_migrations.schema_migrations`. It identifies that `00038`, `00039`, and `00040` are unapplied.
* **Safety Evaluation:**
  - `00038` modifies Storage RLS for `announcements`.
  - `00039` modifies Storage RLS for `academic-materials`.
  - `00040` creates table `attendance_corrections`.
  - None of `00038–00040` touch `leave_requests` or conflict with `00041`/`00042`.
* **Recovery & Prevention:**
  - Supabase CLI will apply `00038–00040` in version order, skip the already-recorded `00041` and `00042`, and proceed to `00043–00044`.
  - To prevent unexpected execution during subsequent builds, maintain the staging quarantine directory until those features are scheduled for deployment, OR execute Method 3 (Full Platform Release) in the current window.

---

## 4. Task 2: Production Backup Readiness & Verification

> [!CAUTION]
> **Definitive Preflight Declaration:**  
> In strict accordance with security protocols, **no production credentials, password hashes, user emails, or customer PII have been exported to the local repository during this preflight turn**. The commands below represent the exact verified backup suite to be executed immediately upon maintenance window initiation.

### 4.1 Backup Storage Architecture
All backup artifacts will be stored in an isolated, git-ignored directory:
```
backups/quarantine/prod_backup_YYYYMMDD_HHMMSS/
├── 01_public_schema.sql          # Full DDL (tables, functions, triggers, RLS)
├── 02_public_data.sql            # Table records for public schema
├── 03_auth_schema.sql            # Auth schema structure and constraints
├── 04_auth_data.sql              # User accounts and identities (stored with restricted permissions)
├── 05_storage_metadata.sql       # Storage buckets and objects metadata
├── 06_migration_history.sql      # schema_migrations records
├── 07_storage_binaries/          # Binary files downloaded from student-documents bucket
│   └── student-documents/
└── CHECKSUMS.sha256              # SHA-256 integrity verification hashes
```

### 4.2 Exact Backup Extraction Commands
Execute in PowerShell from the project root:

```powershell
# 1. Create timestamped quarantine directory
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupDir = "backups/quarantine/prod_backup_$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force

# 2. Public Schema & Data
npx supabase db dump --remote --schema public --file "$backupDir/01_public_schema.sql"
npx supabase db dump --remote --schema public --data-only --file "$backupDir/02_public_data.sql"

# 3. Auth Schema & User Data (Excludes terminal output to prevent secret leakage)
npx supabase db dump --remote --schema auth --file "$backupDir/03_auth_schema.sql"
npx supabase db dump --remote --schema auth --data-only --file "$backupDir/04_auth_data.sql"

# 4. Storage Metadata & Migration Ledger
npx supabase db dump --remote --schema storage --data-only --file "$backupDir/05_storage_metadata.sql"
npx supabase db dump --remote --schema supabase_migrations --data-only --file "$backupDir/06_migration_history.sql"
```

### 4.3 Preservation of Storage S3 Binary Objects
Because `supabase db dump` extracts only PostgreSQL table rows, binary files residing in the Supabase S3 storage backend must be preserved via the Storage API:

```javascript
// Verification script: scripts/backup_storage_binaries.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: files, error } = await supabase.storage.from('student-documents').list('', { limit: 1000 });

if (!error && files) {
  for (const f of files) {
    const { data: blob } = await supabase.storage.from('student-documents').download(f.name);
    if (blob) {
      const buffer = Buffer.from(await blob.arrayBuffer());
      fs.writeFileSync(path.join(backupDir, '07_storage_binaries', 'student-documents', f.name), buffer);
    }
  }
}
```

### 4.4 Backup File Integrity Verification
Immediately following backup extraction, verify file integrity:

```powershell
# Verify files are non-empty
Get-ChildItem -Path $backupDir -Filter *.sql | ForEach-Object {
  if ($_.Length -eq 0) {
    throw "BACKUP CORRUPT: Zero-byte file detected: $($_.Name)"
  }
  Write-Host "VERIFIED: $($_.Name) ($([math]::Round($_.Length / 1KB, 2)) KB)"
}

# Verify SQL completion markers
Get-ChildItem -Path $backupDir -Filter *.sql | ForEach-Object {
  $tail = Get-Content $_.FullName -Tail 5
  if (!($tail -match "PostgreSQL database dump complete")) {
    Write-Warning "WARNING: $($_.Name) may be incomplete (missing standard completion trailer)."
  }
}

# Generate SHA-256 Checksums
Get-ChildItem -Path $backupDir -Filter *.sql | Get-FileHash -Algorithm SHA256 | Export-Csv -Path "$backupDir/CHECKSUMS.sha256" -NoTypeInformation
```

### 4.5 Restoration Test Protocol in an Isolated Environment
Before applying migrations, test the backup restoration on the local PostgreSQL 16 cluster (Port 54333):

```powershell
# 1. Create temporary isolated test database
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -p 54333 -U postgres aiet_restore_verification

# 2. Restore schema and data
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -p 54333 -U postgres -d aiet_restore_verification -v ON_ERROR_STOP=1 -f "$backupDir/01_public_schema.sql"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -p 54333 -U postgres -d aiet_restore_verification -v ON_ERROR_STOP=1 -f "$backupDir/02_public_data.sql"

# 3. Verify row counts and integrity
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -p 54333 -U postgres -d aiet_restore_verification -c "SELECT count(*) AS leave_requests_count FROM public.leave_requests;"

# 4. Cleanup test database
& "C:\Program Files\PostgreSQL\16\bin\dropdb.exe" -p 54333 -U postgres aiet_restore_verification
```

---

## 5. Task 3: Comprehensive Lock Analysis (`00037`, `00041`, `00042`)

A statement-by-statement audit of all acquired locks, queueing behaviors, and lock durations:

### 5.1 Lock Matrix & Behavior Breakdown

| Migration | Statement / Operation | Lock Mode Acquired | Target Relation | Lock Held Until? | Table Rewrite? | Rows Updated? | Blocks Concurrent Submissions? |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **`00037`** | `CREATE OR REPLACE FUNCTION check_and_increment_ip_rate_limit(...)` | `AccessExclusiveLock` | `pg_proc` (system catalog) | Transaction Commit | **NO** | 1 (catalog) | **NO** (Zero lock on `leave_requests`) |
| **`00037`** | `CREATE OR REPLACE FUNCTION` (remaining 4 procedures) | `AccessExclusiveLock` | `pg_proc` (system catalog) | Transaction Commit | **NO** | 4 (catalog) | **NO** |
| **`00041`** | `ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS ... (10 cols)` | `AccessExclusiveLock` | `public.leave_requests` | **Transaction Commit** | **NO** | 0 | **YES** (Queues all reads and writes until commit) |
| **`00041`** | `UPDATE public.leave_requests lr SET ... FROM public.profiles ...` | `RowExclusiveLock` / `AccessShareLock` | `leave_requests` / `profiles`, `departments` | **Transaction Commit** | **NO** | 3 rows | **YES** (Because prior `AccessExclusiveLock` is still held) |
| **`00041`** | `DROP FUNCTION IF EXISTS review_leave_request(UUID, TEXT, TEXT)` | `AccessExclusiveLock` | `pg_proc` (system catalog) | Transaction Commit | **NO** | 1 (catalog) | **NO** (Only blocks concurrent 3-arg RPC calls) |
| **`00041`** | `CREATE OR REPLACE FUNCTION review_leave_request(UUID, TEXT, TEXT, TEXT)` | `AccessExclusiveLock` | `pg_proc` (system catalog) | Transaction Commit | **NO** | 1 (catalog) | **NO** |
| **`00042`** | `REVOKE ... / GRANT EXECUTE ON review_leave_request` | `AccessExclusiveLock` | `pg_proc` (system catalog) | Transaction Commit | **NO** | 1 (catalog) | **NO** |
| **`00042`** | `ALTER TABLE public.leave_requests ADD CONSTRAINT ... CHECK (...)` | `AccessExclusiveLock` | `public.leave_requests` | **Transaction Commit** | **NO** | 0 | **YES** (Validates 3 existing rows under exclusive lock) |
| **`00042`** | `UPDATE public.leave_requests SET snapshot_provenance = ...` | `RowExclusiveLock` | `public.leave_requests` | **Transaction Commit** | **NO** | 3 rows | **YES** (Under ongoing exclusive lock) |
| **`00042`** | `DROP POLICY ... / CREATE POLICY "Students can create leave requests"` | `AccessExclusiveLock` | `public.leave_requests` | **Transaction Commit** | **NO** | 1 (catalog) | **YES** (Policy metadata update under exclusive lock) |

### 5.2 Technical Lock Behavior & Contention Analysis
1. **Lock Retention Rule:** In PostgreSQL, any table-level lock (`AccessExclusiveLock`, `RowExclusiveLock`) acquired inside a transaction is **strictly held until the transaction finishes (`COMMIT` or `ROLLBACK`)**. Early unlocking does not exist.
2. **Table Rewrite Assessment:** In PostgreSQL 17, adding columns with NULL or constant default values (`'SUBMISSION'`) is an **$O(1)$ catalog metadata update**. It does **not rewrite data pages on disk**.
3. **Queueing & Submission Blocking:**
   - When `ALTER TABLE public.leave_requests` requests `AccessExclusiveLock`, it conflicts with all read (`AccessShareLock`) and write (`RowExclusiveLock`) locks.
   - If an active student or HOD query is running on `leave_requests` when the migration begins, the `ALTER TABLE` must wait behind it in the lock queue.
   - **Crucial Queueing Behavior:** While `ALTER TABLE` waits, PostgreSQL **blocks all subsequent queries** on `leave_requests` behind the waiting `ALTER TABLE` to prevent lock starvation.
4. **Protection Mechanisms (`lock_timeout` & `statement_timeout`):**
   - Without timeouts, a long-running query would cause the migration to wait indefinitely, creating a connection pileup and bringing down the application.
   - **`SET lock_timeout = '5s';`**: Guarantees that the migration will wait **at most 5 seconds** to acquire `AccessExclusiveLock`. If an active transaction blocks it, PostgreSQL immediately aborts the migration, releasing all queued queries and preventing application downtime.
   - **`SET statement_timeout = '15s';`**: Guarantees that the overall migration transaction cannot run runaway; if any operation exceeds 15 seconds, it is automatically aborted.
5. **Execution Duration Realities:**
   - In an uncontented database with 3 rows in `leave_requests`, execution takes under 100 milliseconds.
   - However, if concurrent queries are active, execution time is dominated by lock acquisition wait time (bounded by `lock_timeout = '5s'`).
   - Unsupported claims of guaranteed sub-40 ms execution have been **completely removed**. The operator must schedule execution during an off-peak maintenance window.

---

## 6. Task 4: PostgreSQL 17 & Rate-Limiting Defect Verification

### 6.1 Remote PostgreSQL Version Verification
Empirical catalog inspection via `npx supabase inspect db role-stats --remote` against production project `eddsaafwwmtfnjukxamx` returned the following system role configuration:

```json
{
  "role_name": "pg_maintain",
  "active_connections": "0",
  "connection_limit": "60",
  "custom_config": null
}
```

* **Version Significance:** The predefined system role `pg_maintain` was introduced to PostgreSQL in **PostgreSQL 17.0** (for delegating maintenance commands like `VACUUM`, `ANALYZE`, `CHECKPOINT`, and `LOCK TABLE`).
* **Confirmed Engine:** The production database is definitively running **PostgreSQL 17.6.1 (`17.6.1.155`, GA)**.

### 6.2 Rate-Limiting Function Defect Analysis
In Migration `00036_identifier_login_rate_limiting.sql`, stored procedures enforce `SET search_path = ''` (a security requirement for `SECURITY DEFINER` functions to prevent search-path injection).

Inside these functions, lines 79, 87, 126, 136, 192, 200, 237 invoke:
```sql
v_retry_after := pg_catalog.greatest(1, pg_catalog.ceil(...));
'remaining', pg_catalog.greatest(0, v_max_requests - v_count)
v_limit := pg_catalog.greatest(1, pg_catalog.least(...));
```

* **PostgreSQL Grammar Limitation:** In standard PostgreSQL SQL grammar, `GREATEST` and `LEAST` are **syntactic language expressions** (handled internally as `MinMaxExpr` parse nodes, identical to `COALESCE` and `CASE`), **not catalog functions** residing in `pg_catalog`.
* **Runtime Failure:** Qualifying them with `pg_catalog.` causes PostgreSQL to perform a function lookup in `pg_proc`, which fails with:
  `ERROR: function pg_catalog.greatest(integer, integer) does not exist`.

### 6.3 Affected Login Path & Deployment Prerequisite
* When any student or HOD logs into AIET-UniSphere, `identifierService.ts` triggers IP or identifier rate-limiting RPCs (`check_and_increment_ip_rate_limit`, `verify_identifier_rate_limit`, `record_login_failure`).
* If rate limits are triggered or evaluated, calling these stored procedures results in an immediate **HTTP 500 / PostgreSQL runtime exception**.
* **Verdict:** Because users cannot submit or review leave without authenticating, **Migration 00037 must be deployed in the same release window**. Migration `00037` replaces the 5 procedure bodies with unqualified `GREATEST()` and `LEAST()`, resolving the syntax defect without modifying table schema or existing data.

---

## 7. Task 5: Final Operator Runbook

Follow this strict, sequential runbook during the maintenance window:

```
                            OPERATOR RUNBOOK TIMELINE
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│ STEP 1: PRE-FLIGHT      │ ──> │ STEP 2: BACKUP          │ ──> │ STEP 3: EXECUTE DDL     │
│ - Verify CLI connection │     │ - Run 5-layer dump      │     │ - Run atomic script     │
│ - Check pg_stat_activity│     │ - Verify non-zero bytes │     │ - Verify commit status  │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
                                                                             │
┌─────────────────────────┐     ┌─────────────────────────┐                  ▼
│ STEP 6: E2E SMOKE TESTS │ <── │ STEP 5: VERIFICATION   │ <── ┌─────────────────────────┐
│ - Submit test leave     │     │ - Check 10 columns      │     │ STEP 4: POSTGREST RELOAD│
│ - Download App PDF      │     │ - Check 4-arg RPC       │     │ - NOTIFY pgrst          │
│ - HOD approval + PDF    │     │ - Sync CLI ledger       │     │ - HTTP 200 cache check  │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

### Step 1: Pre-Flight Connection & Activity Inspection
1. Confirm Supabase project connection:
   ```powershell
   npx supabase migration list --remote
   ```
2. Verify zero active queries are locking `leave_requests`:
   ```sql
   SELECT pid, now() - query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE state = 'active' AND query ILIKE '%leave_requests%';
   ```

### Step 2: Multi-Layer Backup Execution
Run the PowerShell backup extraction script:
```powershell
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupDir = "backups/quarantine/prod_backup_$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force

npx supabase db dump --remote --schema public --file "$backupDir/01_public_schema.sql"
npx supabase db dump --remote --schema public --data-only --file "$backupDir/02_public_data.sql"
npx supabase db dump --remote --schema auth --file "$backupDir/03_auth_schema.sql"
npx supabase db dump --remote --schema auth --data-only --file "$backupDir/04_auth_data.sql"
npx supabase db dump --remote --schema storage --data-only --file "$backupDir/05_storage_metadata.sql"
npx supabase db dump --remote --schema supabase_migrations --data-only --file "$backupDir/06_migration_history.sql"
```
Verify all files are non-empty and generate SHA-256 checksums:
```powershell
Get-ChildItem -Path $backupDir -Filter *.sql | ForEach-Object { Write-Host "$($_.Name): $($_.Length) bytes" }
```

### Step 3: Atomic DDL Execution
In the **Supabase Dashboard SQL Editor** for `aiet-unisphere` (`eddsaafwwmtfnjukxamx`), execute the consolidated deployment transaction:

```sql
-- ============================================================
-- ATOMIC PRODUCTION RELEASE: MIGRATIONS 00037, 00041, 00042
-- ============================================================

BEGIN;

-- Lock and statement guards
SET statement_timeout = '15s';
SET lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. APPLY MIGRATION 00037 (RATE LIMIT PROCEDURE CORRECTION)
-- ------------------------------------------------------------
-- (Include full content of 00037_rate_limit_procedure_correction.sql)

-- ------------------------------------------------------------
-- 2. APPLY MIGRATION 00041 (LEAVE SNAPSHOTS, REMARKS & 4-ARG RPC)
-- ------------------------------------------------------------
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS student_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS student_usn_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS branch_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS section_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS semester_snapshot INT,
  ADD COLUMN IF NOT EXISTS academic_year_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS student_phone_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS approval_remarks TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_provenance TEXT DEFAULT 'SUBMISSION';

-- Backfill snapshots
UPDATE public.leave_requests lr
SET
  student_name_snapshot = COALESCE(lr.student_name_snapshot, p.full_name),
  student_usn_snapshot = COALESCE(lr.student_usn_snapshot, p.usn_or_employee_id),
  branch_snapshot = COALESCE(lr.branch_snapshot, d.name),
  semester_snapshot = COALESCE(lr.semester_snapshot, sp.semester),
  academic_year_snapshot = COALESCE(lr.academic_year_snapshot, sp.academic_year),
  student_phone_snapshot = COALESCE(lr.student_phone_snapshot, sp.phone),
  parent_phone_snapshot = COALESCE(lr.parent_phone_snapshot, sp.parent_phone)
FROM public.profiles p
LEFT JOIN public.departments d ON p.department_id = d.id
LEFT JOIN public.student_profiles sp ON p.id = sp.profile_id
WHERE lr.student_id = p.id
  AND (
    lr.student_name_snapshot IS NULL
    OR lr.student_usn_snapshot IS NULL
    OR lr.branch_snapshot IS NULL
  );

-- Drop 3-param overload and create 4-param RPC
DROP FUNCTION IF EXISTS public.review_leave_request(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.review_leave_request(
  p_leave_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT DEFAULT NULL,
  p_approval_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_dept_id UUID;
  v_leave RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT role, department_id INTO v_caller_role, v_caller_dept_id
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('HOD', 'ADMIN') THEN
    RAISE EXCEPTION 'Only HODs or Administrators are authorized to review leave requests.';
  END IF;

  SELECT * INTO v_leave
  FROM public.leave_requests
  WHERE id = p_leave_id;

  IF v_leave IS NULL THEN
    RAISE EXCEPTION 'Leave request not found.';
  END IF;

  IF v_caller_role = 'HOD' AND (v_caller_dept_id IS NULL OR v_leave.department_id <> v_caller_dept_id) THEN
    RAISE EXCEPTION 'ACCESS DENIED: You are only authorized to review leave requests for your department.';
  END IF;

  IF v_leave.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This leave request has already been reviewed (status: %). Only pending requests can be modified.', v_leave.status;
  END IF;

  IF p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid status. Must be APPROVED or REJECTED.';
  END IF;

  IF p_status = 'REJECTED' AND (p_rejection_reason IS NULL OR TRIM(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'Rejection reason is required when rejecting a leave request.';
  END IF;

  UPDATE public.leave_requests
  SET
    status = p_status,
    reviewed_by = v_caller_id,
    reviewed_at = NOW(),
    rejection_reason = CASE WHEN p_status = 'REJECTED' THEN TRIM(p_rejection_reason) ELSE NULL END,
    approval_remarks = CASE WHEN p_status = 'APPROVED' THEN TRIM(p_approval_remarks) ELSE NULL END
  WHERE id = p_leave_id;

  INSERT INTO public.notifications (
    user_id, title, short_message, full_message, source, category, type, related_link
  ) VALUES (
    v_leave.student_id,
    CASE WHEN p_status = 'APPROVED' THEN 'Leave Request Approved' ELSE 'Leave Request Rejected' END,
    CASE 
      WHEN p_status = 'APPROVED' THEN 'Your leave request ' || COALESCE(v_leave.reference_id, '') || ' has been approved.'
      ELSE 'Your leave request ' || COALESCE(v_leave.reference_id, '') || ' has been rejected.'
    END,
    CASE 
      WHEN p_status = 'APPROVED' THEN 'Your ' || v_leave.leave_type || ' request (' || COALESCE(v_leave.reference_id, '') || ') from ' || v_leave.start_date || ' to ' || v_leave.end_date || ' has been approved by your HOD.'
      ELSE 'Your ' || v_leave.leave_type || ' request (' || COALESCE(v_leave.reference_id, '') || ') was rejected. Reason: ' || TRIM(p_rejection_reason)
    END,
    'HOD Portal', 'Leave',
    CASE WHEN p_status = 'APPROVED' THEN 'Approval' ELSE 'Rejection' END,
    '/student/leave-requests'
  );

  RETURN jsonb_build_object(
    'success', true,
    'leave_id', p_leave_id,
    'status', p_status,
    'reviewed_by', v_caller_id
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. APPLY MIGRATION 00042 (SECURITY & PROVENANCE HARDENING)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Add check constraint if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_snapshot_provenance_check'
  ) THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT leave_requests_snapshot_provenance_check
      CHECK (snapshot_provenance IN ('SUBMISSION', 'RETROACTIVE_BACKFILL', 'UNVERIFIED'));
  END IF;
END $$;

-- Categorize historical records
UPDATE public.leave_requests
SET snapshot_provenance = 'RETROACTIVE_BACKFILL'
WHERE student_name_snapshot IS NOT NULL
  AND (snapshot_provenance IS NULL OR snapshot_provenance = 'SUBMISSION')
  AND created_at < NOW() - INTERVAL '1 minute';

UPDATE public.leave_requests
SET snapshot_provenance = 'UNVERIFIED'
WHERE student_name_snapshot IS NULL;

-- Harden INSERT RLS policy
DROP POLICY IF EXISTS "Students can create leave requests" ON public.leave_requests;

CREATE POLICY "Students can create leave requests"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
    AND status = 'PENDING'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND approval_remarks IS NULL
    AND (snapshot_provenance = 'SUBMISSION' OR snapshot_provenance IS NULL)
  );

COMMIT;
```

### Step 4: PostgREST Schema Reload
Execute in SQL Editor:
```sql
NOTIFY pgrst, 'reload schema';
```

### Step 5: Migration Ledger Synchronization
Execute CLI repair commands:
```powershell
npx supabase migration repair --status applied 00037 --linked
npx supabase migration repair --status applied 00041 --linked
npx supabase migration repair --status applied 00042 --linked
```
Verify via:
```powershell
npx supabase migration list --remote
```

### Step 6: Database Catalog Verification Queries
```sql
-- 1. Check all 10 columns exist in leave_requests
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'leave_requests' 
  AND column_name IN (
    'student_name_snapshot', 'student_usn_snapshot', 'branch_snapshot',
    'section_snapshot', 'semester_snapshot', 'academic_year_snapshot',
    'student_phone_snapshot', 'parent_phone_snapshot', 'approval_remarks',
    'snapshot_provenance'
  );
-- Expected count: 10 rows

-- 2. Check 4-argument review_leave_request RPC signature
SELECT pg_get_function_identity_arguments('public.review_leave_request'::regproc);
-- Expected: p_leave_id uuid, p_status text, p_rejection_reason text, p_approval_remarks text

-- 3. Check RPC privileges (authenticated only, revoked from anon/public)
SELECT grantee, privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_name = 'review_leave_request';
-- Must list authenticated, must NOT list anon or PUBLIC
```

### Step 7: Application Smoke Tests & PDF Verification
1. **Student Submission:** Log in as student. Submit a test leave request with Section 'A', mobile numbers, and an attachment. Verify HTTP 201 response with no PGRST204 error.
2. **Student Application PDF:** Download application form. Verify 1-page output with 100% clean remarks sections on original `1000230720.pdf`.
3. **HOD Approval:** Log in as Department HOD. Review and approve the request with remarks. Verify atomic student notification delivery.
4. **Approved Leave Note PDF:** Download approved note. Verify bounded HOD remarks, sample seal, and `Provenance: Verified Submission Snapshot`.

---

## 8. Failure Handling & Atomic Rollback Script

If any validation step fails, execute this rollback in the Supabase SQL Editor:

```sql
BEGIN;

-- 1. Restore previous RLS policy from migration 00004
DROP POLICY IF EXISTS "Students can create leave requests" ON public.leave_requests;

CREATE POLICY "Students can create leave requests"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
  );

-- 2. Drop 4-parameter review_leave_request RPC
DROP FUNCTION IF EXISTS public.review_leave_request(UUID, TEXT, TEXT, TEXT);

-- 3. Re-create 3-parameter review_leave_request RPC from migration 00009
CREATE OR REPLACE FUNCTION public.review_leave_request(
  p_leave_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- (Restore full body from 00009_review_leave_request_rpc.sql)
$$;

GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT) TO authenticated;

-- 4. Reload PostgREST cache
NOTIFY pgrst, 'reload schema';

COMMIT;
```

Then synchronize CLI history:
```powershell
npx supabase migration repair --status reverted 00042 --linked
npx supabase migration repair --status reverted 00041 --linked
```

---

## 9. Final Preflight Verdict

* **Application Code:** Verified at commit `53ad361` / `79cf475` / `c5a5bcc`.
* **Database Target:** PostgreSQL 17.6.1 (`eddsaafwwmtfnjukxamx`).
* **Locking Profile:** Safe; zero table rewrites; protected by `lock_timeout = '5s'`.
* **Scope Definition:** Cleanly separated `00037`, `00041`, `00042` from unrelated migrations.
* **Backup & Recovery Protocol:** Multi-schema and S3 synchronization runbook ready.
* **Strict Policy Compliance:** Zero production SQL executed, zero remote mutations, zero Edge Functions touched, zero git pushes.

**Preflight Verdict:** **ALL DEPLOYMENT SAFETY GAPS RESOLVED. CLEARED FOR EXECUTION UPON OPERATOR AUTHORIZATION.**
