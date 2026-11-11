# AIET-UNISPHERE: LEAVE MANAGEMENT PRODUCTION DEPLOYMENT RUNBOOK

**Document ID:** `docs/audit/LEAVE_MANAGEMENT_PRODUCTION_RUNBOOK.md`  
**Target Environment:** Remote Supabase Production (`eddsaafwwmtfnjukxamx` · `ap-south-1`)  
**Database Engine:** PostgreSQL 17.6.1 (`17.6.1.155`, GA)  
**Supabase CLI Version:** Native Go Runner v3.1.0  
**Baseline Git Checkpoint:** `8c9f5c0`  
**Execution Mode:** **STRICTLY READ-ONLY PREPARATION.** Zero production mutations, zero remote migrations executed, zero GitHub pushes.

---

## 1. Scope & Isolation Boundary

The Leave Management release strictly requires **two migrations**:
1. [`supabase/migrations/00041_leave_note_snapshots_and_remarks.sql`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00041_leave_note_snapshots_and_remarks.sql) (`SHA-256: 1ff86110b4efa6e7572fe5145d93a2e2a9593b899546c8b5176fc3b999319ae1`)
2. [`supabase/migrations/00042_leave_note_security_and_provenance.sql`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00042_leave_note_security_and_provenance.sql) (`SHA-256: b18db26d6292146b0749046ab771170d7d1a659ce2c3e789205691efb4910021`)

> [!IMPORTANT]
> **Zero Bundling Policy:** Migrations `00037`–`00040` (rate limit syntax, announcement storage, academic materials storage, attendance ledger) and `00043`–`00044` (faculty designation, project mentoring) are **strictly excluded** from this release. They represent independent feature branches and must not be bundled.

---

## 2. Phase 1: Pre-Deployment Verification

Execute before beginning the maintenance window. **STOP immediately if any check fails.**

### 2.1 Verify Backup Readiness
Verify that the verified production backup exists outside the git repository and matches all checksums:
- **Location:** `C:\Users\Mahesh M\AIET-UniSphere-Backups\backup_20261111_101500\`
- **Contents:**
  - `database/schema.sql` (290,198 bytes, SHA-256: `20bf5af2f7...`)
  - 45 base tables in `database/data/*.csv`
  - `auth/auth_users.csv` (38 users), `auth/auth_identities.csv` (38 rows)
  - `storage/buckets.csv` (11 buckets), `storage/objects.csv` (13 objects)
  - 13 binary storage files in `storage/objects/` (7,654,332 bytes)
- **Manifest:** `manifest.json` and `BACKUP_MANIFEST.md`

### 2.2 Verify Remote Database Engine & Ledger Baseline
Execute read-only SQL via SQL Editor or psql:
```sql
-- 1. Confirm PostgreSQL version
SHOW server_version;
-- Expected: 17.6

-- 2. Confirm remote migration ledger
SELECT version, name 
FROM supabase_migrations.schema_migrations 
ORDER BY version DESC 
LIMIT 5;
-- Expected: '00036' is the latest applied migration.
-- Versions '00041' and '00042' MUST NOT be present.
```

### 2.3 Verify Lock State on `public.leave_requests`
```sql
SELECT pid, usename, state, query, age(clock_timestamp(), query_start) as duration
FROM pg_stat_activity
WHERE query ILIKE '%leave_requests%' AND pid <> pg_backend_pid();
-- Expected: 0 long-running transactions holding locks.
```

> [!CAUTION]
> **STOP CONDITION:** If `00041` or `00042` already exist in `schema_migrations`, or if long-running active locks exist on `leave_requests`, abort the maintenance window immediately.

---

## 3. Phase 2: Migration Execution (Exact Complete SQL)

Migrations `00041` and `00042` must be executed within a **single unified transaction** with explicit lock and statement timeouts.

> [!WARNING]
> Do NOT use abbreviated, reconstructed, or inline summaries. Execute the **complete, unabbreviated contents** of both files in order:

```sql
BEGIN;

-- Lock guards: abort immediately if blocked to prevent queueing behind web traffic
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ============================================================
-- 1. EXECUTE EXACT FILE: supabase/migrations/00041_leave_note_snapshots_and_remarks.sql
-- ============================================================
-- 1. ADD SNAPSHOT AND REMARKS COLUMNS TO LEAVE REQUESTS
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

-- 2. BACKFILL HISTORICAL SNAPSHOTS FROM EXISTING PROFILES WHERE MISSING
-- All existing records populated from current profiles are marked RETROACTIVE_BACKFILL.
UPDATE public.leave_requests lr
SET
  student_name_snapshot = COALESCE(lr.student_name_snapshot, p.full_name),
  student_usn_snapshot = COALESCE(lr.student_usn_snapshot, p.usn_or_employee_id),
  branch_snapshot = COALESCE(lr.branch_snapshot, d.name),
  semester_snapshot = COALESCE(lr.semester_snapshot, sp.semester),
  academic_year_snapshot = COALESCE(lr.academic_year_snapshot, sp.academic_year),
  student_phone_snapshot = COALESCE(lr.student_phone_snapshot, sp.phone),
  parent_phone_snapshot = COALESCE(lr.parent_phone_snapshot, sp.parent_phone),
  snapshot_provenance = 'RETROACTIVE_BACKFILL'
FROM public.profiles p
LEFT JOIN public.departments d ON p.department_id = d.id
LEFT JOIN public.student_profiles sp ON p.id = sp.profile_id
WHERE lr.student_id = p.id;

-- Records without trustworthy snapshot information are marked UNVERIFIED
UPDATE public.leave_requests
SET snapshot_provenance = 'UNVERIFIED'
WHERE student_name_snapshot IS NULL
   OR student_usn_snapshot IS NULL
   OR branch_snapshot IS NULL;

-- 3. DROP PREVIOUS 3-ARGUMENT review_leave_request FUNCTION IF EXISTS
DROP FUNCTION IF EXISTS public.review_leave_request(UUID, TEXT, TEXT);

-- 4. RECREATE review_leave_request WITH ROW-LEVEL LOCKING & ATOMIC CONDITIONAL TRANSITION
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

  -- Acquire explicit row-level lock on the leave request to prevent concurrent approval/rejection race conditions
  SELECT * INTO v_leave
  FROM public.leave_requests
  WHERE id = p_leave_id
  FOR UPDATE;

  IF v_leave IS NULL THEN
    RAISE EXCEPTION 'Leave request not found.';
  END IF;

  -- Security check: HOD can only review requests for their own department (ADMIN can review any)
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

  -- Conditional atomic update: guarantees exactly one transaction can update the status
  UPDATE public.leave_requests
  SET
    status = p_status,
    reviewed_by = v_caller_id,
    reviewed_at = NOW(),
    rejection_reason = CASE WHEN p_status = 'REJECTED' THEN TRIM(p_rejection_reason) ELSE NULL END,
    approval_remarks = CASE WHEN p_status = 'APPROVED' THEN TRIM(p_approval_remarks) ELSE NULL END
  WHERE id = p_leave_id AND status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conflict: This leave request has already been reviewed or modified by another concurrent transaction.';
  END IF;

  -- Create Notification for the student
  INSERT INTO public.notifications (
    user_id,
    title,
    short_message,
    full_message,
    source,
    category,
    type,
    related_link
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
    'HOD Portal',
    'Leave',
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

GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 2. EXECUTE EXACT FILE: supabase/migrations/00042_leave_note_security_and_provenance.sql
-- ============================================================
REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Hardened provenance constraint
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS snapshot_provenance TEXT DEFAULT 'SUBMISSION';

ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_snapshot_provenance_check;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_snapshot_provenance_check
  CHECK (snapshot_provenance IN ('SUBMISSION', 'RETROACTIVE_BACKFILL', 'UNVERIFIED'));

-- Deterministic provenance classification (no time-based heuristics)
UPDATE public.leave_requests
SET snapshot_provenance = 'UNVERIFIED'
WHERE student_name_snapshot IS NULL
   OR student_usn_snapshot IS NULL
   OR branch_snapshot IS NULL;

UPDATE public.leave_requests
SET snapshot_provenance = 'RETROACTIVE_BACKFILL'
WHERE snapshot_provenance IS NULL
   OR snapshot_provenance NOT IN ('SUBMISSION', 'RETROACTIVE_BACKFILL', 'UNVERIFIED');

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

---

## 4. Phase 3: Migration-History Reconciliation

Reconcile the migration ledger using the official Supabase CLI v3 command. This step is **strictly separate from SQL execution**.

### 4.1 Execute Migration Repair
Run in PowerShell:
```powershell
npx supabase migration repair --status applied 00041 00042 --remote
```

### 4.2 CLI Repair Mechanics
- **Mechanism:** The CLI reads local migration files `00041` and `00042`, parses the filename version (`00041`, `00042`) and name (`leave_note_snapshots_and_remarks`, `leave_note_security_and_provenance`), extracts all SQL statements into `statements text[]`, and executes an idempotent upsert on `supabase_migrations.schema_migrations`.
- **Idempotency:** Because `version` is the primary key with `ON CONFLICT (version) DO UPDATE`, running this command repeatedly is 100% safe and cannot create duplicate ledger rows.
- **Why Manual SQL Insertion is Excluded:** Manual `INSERT INTO schema_migrations` leaves `statements` null and risks schema drift. The official CLI tool populates complete metadata.

### 4.3 Verify Ledger State
```powershell
npx supabase migration list --remote
```
Verify output shows `00041` and `00042` with remote status `applied`.

---

## 5. Phase 4: Post-Deployment Validation

Execute immediately after Phase 3. **STOP if any validation query fails.**

### 5.1 PostgREST Schema Cache Reload
Execute in SQL Editor:
```sql
NOTIFY pgrst, 'reload schema';
```

### 5.2 SQL Catalog Verification Queries
```sql
-- 1. Verify all 10 snapshot columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'leave_requests'
  AND column_name IN (
    'student_name_snapshot', 'student_usn_snapshot', 'branch_snapshot',
    'section_snapshot', 'semester_snapshot', 'academic_year_snapshot',
    'student_phone_snapshot', 'parent_phone_snapshot', 'approval_remarks',
    'snapshot_provenance'
  );
-- MUST return exactly 10 rows.

-- 2. Verify 4-argument review_leave_request signature
SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args, proacl
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE n.nspname = 'public' AND p.proname = 'review_leave_request';
-- Output MUST show: review_leave_request(p_leave_id uuid, p_status text, p_rejection_reason text, p_approval_remarks text)
-- proacl MUST list authenticated; anon and PUBLIC must NOT appear.

-- 3. Verify deterministic historical categorization
SELECT snapshot_provenance, COUNT(*)
FROM public.leave_requests
GROUP BY snapshot_provenance;
-- MUST return only RETROACTIVE_BACKFILL and/or UNVERIFIED. Zero rows with NULL. Zero historical rows with SUBMISSION.
```

---

## 6. Phase 5: Application Release & End-to-End Smoke Tests

Deploy the frontend client build (commit `8c9f5c0`). Execute the smoke test protocol:

| Test Case | Actor | Action | Expected Result |
|---|---|---|---|
| **ST-01: Student Submission** | Student | Submit new leave with Section, phone numbers, and attachment | Request saved with `snapshot_provenance = 'SUBMISSION'`, status `PENDING`, HTTP 201 |
| **ST-02: Pending UI Verification** | Student | View pending request in `/student/leave-requests` | Status shows "Pending"; **no download button is visible** |
| **ST-03: HOD Routing & Review** | HOD | Open Department Leave list | Request appears; click Review; enter remark "Approved for hackathon"; click Approve |
| **ST-04: Approval Execution** | HOD | Confirm approval | Status transitions to `APPROVED`; `approval_remarks` persisted; student notification delivered |
| **ST-05: Single Green Button** | Student | Refresh `/student/leave-requests` | Row shows exactly ONE green button: **"Download Note"** |
| **ST-06: PDF Authenticity** | Student | Click "Download Note" | Generates authentic 1-page leave note PDF with student snapshot, HOD reviewer name, remarks, and zero demo watermarks |
| **ST-07: Double Review Prevention** | HOD | Re-submit review on approved request | Rejected by RPC: `"This leave request has already been reviewed"` |

---

## 7. Phase 6: Recovery and Rollback Procedures

### 7.1 Critical Rollback Constraints
- **NEVER DROP SNAPSHOT COLUMNS:** Under no circumstances should `student_name_snapshot`, `approval_remarks`, or any snapshot columns be dropped during rollback. Dropping columns permanently destroys newly submitted leave data.
- **NEVER DELETE MIGRATION LEDGER ENTRIES:** Applied migration rows in `supabase_migrations.schema_migrations` must NOT be deleted as a routine rollback. Deleting ledger rows causes future `supabase db push` commands to attempt re-executing skipped migrations.

### 7.2 Application-First Rollback (Zero Database Downtime)
If an application defect is discovered in the frontend UI or PDF rendering:
1. **Revert Frontend Code:** Revert the frontend deployment to the previous Git release.
2. **Empirically Proven Compatibility:**
   - In PostgreSQL, the 4-parameter `review_leave_request(UUID, TEXT, TEXT, TEXT)` declares `DEFAULT NULL` for both `p_rejection_reason` and `p_approval_remarks`.
   - PostgREST uses named-parameter dispatch. An older client calling the 3-argument signature `{ p_leave_id, p_status, p_rejection_reason }` resolves directly to the 4-parameter function without ambiguity.
   - Older clients submitting leave without snapshot fields succeed because all snapshot columns are nullable and `snapshot_provenance` defaults to `'SUBMISSION'`.
3. **Outcome:** Application functionality is fully restored; newly submitted leave requests and approval records remain safely preserved in the database.

### 7.3 Catastrophic Disaster Recovery (Full Database Restoration)
If catastrophic database corruption occurs unrelated to the schema migration:
1. Restore public schema and table data from `C:\Users\Mahesh M\AIET-UniSphere-Backups\backup_20261111_101500\database\data\`.
2. Restore storage objects metadata and synchronize binaries from `storage/objects/`.
3. The database returns to the exact pre-deployment baseline recorded in `BACKUP_MANIFEST.md`.

---

## 8. Status & Authorization

- **Runbook Review Status:** **CORRECTED & AUDITED**
- **Production Execution Status:** **NOT EXECUTED — AWAITING EXPLICIT OPERATOR AUTHORIZATION**
