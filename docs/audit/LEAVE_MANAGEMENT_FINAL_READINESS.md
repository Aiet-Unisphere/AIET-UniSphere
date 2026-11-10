# LEAVE MANAGEMENT FINAL ARCHITECTURE & PRODUCTION READINESS REPORT

**Document ID:** `docs/audit/LEAVE_MANAGEMENT_FINAL_READINESS.md`  
**Target Reference:** Mission — Final Leave Management Architecture Correction  
**Baseline Commit:** `d592eb0`  
**Audit Reference:** `docs/audit/LEAVE_FALLBACK_SECURITY_AND_INTEGRITY.md`  
**Execution Mode:** STRICTLY LOCAL. No remote database mutations, no Supabase migration executions, no Edge Function deployments, no GitHub push.

---

## 1. Executive Summary

This mission completely resolves the data-integrity and approval-security weaknesses identified in the preceding audit (`LEAVE_FALLBACK_SECURITY_AND_INTEGRITY.md`).

### Key Remediation Accomplished:
1. **Student Submission Hardening:** Removed the `basePayload` silent degradation fallback in `leaveService.ts`. The service now strictly mandates full academic and contact snapshot persistence (`student_name_snapshot`, `student_usn_snapshot`, `branch_snapshot`, `section_snapshot`, `semester_snapshot`, `academic_year_snapshot`, `student_phone_snapshot`, `parent_phone_snapshot`, `snapshot_provenance`). If the remote schema lacks these columns, it fails safely with a clear, actionable exception rather than silently corrupting or discarding historical data.
2. **Elimination of Historical Profile Mutation:** In `mapLeaveRow`, historical records no longer reconstruct their semester from the live `student_academic.semester` profile field (`semester: l.semester_snapshot ?? null`). Historical leave records now strictly preserve the snapshot values as captured at submission time.
3. **Authoritative HOD Approval via 4-Parameter RPC:** Removed all unsafe direct table update paths (`leave_requests.update(...)`) and legacy fallbacks. Approvals and rejections are strictly governed by the 4-parameter `review_leave_request(p_leave_id, p_status, p_rejection_reason, p_approval_remarks)` RPC running inside PostgreSQL as `SECURITY DEFINER`. This guarantees:
   - Server-side caller authentication (`auth.uid()`) and role verification (`HOD`/`ADMIN`).
   - Server-side department ownership verification (`v_leave.department_id = v_caller_dept_id`).
   - Strict database-level state machine enforcement (`v_leave.status = 'PENDING'`).
   - Server-side reviewer identity and timestamp (`reviewed_by = auth.uid()`, `reviewed_at = NOW()`).
   - Atomic audit logging and student notification dispatch inside the same database transaction.
4. **Migration Reconciliation & Provenance Ownership:** Reconciled migrations 00037 through 00044. Identified that `snapshot_provenance` must be initialized in `00041` alongside other snapshot columns, with `00042` enforcing check constraints, backfill categorization, and RLS lockdown.
5. **Exact PDF Template Preservation:** Maintained bitwise zero pixel diff on the original AIET template `1000230720.pdf`, verified dual output generation (clean Student Application PDF vs bounded Approved Leave Note PDF), and confirmed that field boundaries hold under extreme string length stress tests.

---

## 2. Exact Changed Files

| File | Change Type | Purpose |
|---|---|---|
| [`src/services/leaveService.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveService.ts) | Modified | 1. Removed `basePayload` silent fallback; added safe schema failure.<br/>2. Fixed `mapLeaveRow` to prevent live profile reconstruction (`semester: l.semester_snapshot ?? null`).<br/>3. Enforced 4-parameter `review_leave_request` RPC as exclusive approval/rejection mechanism.<br/>4. Eliminated direct table updates and non-atomic client-side notifications. |
| [`supabase/migrations/00041_leave_note_snapshots_and_remarks.sql`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00041_leave_note_snapshots_and_remarks.sql) | Modified | Added `snapshot_provenance TEXT DEFAULT 'SUBMISSION'` to Section 1 so that 00041 provides all 10 columns required by the application contract. |
| [`tests/leave_note_pdf_generation.test.mjs`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/tests/leave_note_pdf_generation.test.mjs) | Modified | Updated test 20 to assert authoritative snapshot persistence, safe schema failure, and exclusive RPC review requirements. |
| [`tests/leave_architecture_authoritative.test.mjs`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/tests/leave_architecture_authoritative.test.mjs) | Created | Comprehensive 10-test suite verifying snapshot persistence, duplicate prevention, HOD authorization, PENDING-only transition, atomic notifications, and PDF fidelity on real PostgreSQL 16. |
| [`package.json`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/package.json) | Modified | Added `tests/leave_architecture_authoritative.test.mjs` to standard `npm test` script. |

---

## 3. Migration Reconciliation & Ordering Analysis

### 3.1 Production Status vs Pending Migrations
* **Remote Production Head:** `00036_identifier_login_rate_limiting.sql`.
* **Pending Migrations (00037 – 00044):**

```
00036 (Applied)
  │
  ├── 00037_rate_limit_procedure_correction.sql (Syntax fix for rate limit procedures)
  ├── 00038_announcement_attachment_storage_rls.sql (Fine-grained announcements storage RLS)
  ├── 00039_academic_materials_storage_security.sql (Course-scoped academic materials storage RLS)
  ├── 00040_attendance_correction_workflow.sql (Attendance corrections ledger table & triggers)
  ├── 00041_leave_note_snapshots_and_remarks.sql (Leave snapshots, remarks, 4-arg RPC)
  ├── 00042_leave_note_security_and_provenance.sql (Provenance check, RLS hardening, RPC grants)
  ├── 00043_faculty_designation.sql (Dynamic designation on public.profiles)
  └── 00044_faculty_project_mentoring.sql (Project mentoring RLS for user_projects & milestones)
```

### 3.2 Dependency Analysis & Provenance Ownership
1. **Ownership of `snapshot_provenance`:**
   - Originally, `snapshot_provenance` was defined only in `00042`.
   - Because the application payload writes `snapshot_provenance: 'SUBMISSION'`, applying `00041` without `00042` previously caused PostgREST to fail with `PGRST204` on `snapshot_provenance`.
   - **Resolution:** `00041` now defines `ADD COLUMN IF NOT EXISTS snapshot_provenance TEXT DEFAULT 'SUBMISSION'`.
   - `00042` now safely reinforces `snapshot_provenance` with a `CHECK` constraint:
     `CHECK (snapshot_provenance IN ('SUBMISSION', 'RETROACTIVE_BACKFILL', 'UNVERIFIED'))`.
2. **Coupling between 00041 and 00042:**
   - `00041` and `00042` represent an **atomic pair**.
   - `00041` adds snapshot columns, backfills historical profiles, and deploys the 4-parameter `review_leave_request` RPC.
   - `00042` locks down RPC permissions (revoking PUBLIC/anon), categorizes provenance (`RETROACTIVE_BACKFILL` vs `UNVERIFIED`), and hardens `INSERT` RLS policy to prevent student status/remarks forgery.
   - **Deployment Recommendation:** Execute `00041` and `00042` consecutively in the same transaction block.
3. **Cross-Feature Independence:**
   - `00041` and `00042` depend solely on `leave_requests`, `profiles`, `departments`, and `student_profiles` (established in migrations 00001–00013).
   - They have **zero schema dependency** on `00037` (rate limits), `00038` (announcements), `00039` (materials), or `00040` (attendance).

### 3.3 Historical Backfill Behavior
1. **Phase 1 (Migration 00041):**
   Executes an atomic backfill populating `student_name_snapshot`, `student_usn_snapshot`, `branch_snapshot`, `semester_snapshot`, `academic_year_snapshot`, `student_phone_snapshot`, `parent_phone_snapshot` from joined `profiles` and `student_profiles` for any existing record where snapshot columns are `NULL`.
2. **Phase 2 (Migration 00042):**
   - Historical records that received backfilled snapshots are explicitly updated to `snapshot_provenance = 'RETROACTIVE_BACKFILL'`.
   - Records with no resolvable profile data are updated to `snapshot_provenance = 'UNVERIFIED'`.
   - Live submissions default to `snapshot_provenance = 'SUBMISSION'`.
3. **PDF Provenance Indicator:**
   The PDF footer dynamically and transparently reflects this provenance:
   - `Provenance: Verified Submission Snapshot` (Live verified submissions).
   - `Provenance: Retroactive Backfill (Current Profile)` (Pre-migration backfilled records).
   - `Provenance: Unverified Historical Record` (Historical records with missing snapshots).

### 3.4 Complete Rollback and Recovery Strategy

If an unexpected condition arises during production deployment of `00041` and `00042`:

```sql
-- ============================================================
-- REVERSIBLE ROLLBACK SCRIPT: MIGRATIONS 00041 & 00042
-- ============================================================

BEGIN;

-- 1. Restore previous INSERT RLS policy on leave_requests (from 00004)
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

-- 3. Restore 3-parameter review_leave_request RPC (from 00009)
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
    rejection_reason = CASE WHEN p_status = 'REJECTED' THEN TRIM(p_rejection_reason) ELSE NULL END
  WHERE id = p_leave_id;

  INSERT INTO public.notifications (
    user_id, title, short_message, full_message, source, category, type, related_link
  ) VALUES (
    v_leave.student_id,
    CASE WHEN p_status = 'APPROVED' THEN 'Leave Request Approved' ELSE 'Leave Request Rejected' END,
    CASE WHEN p_status = 'APPROVED' THEN 'Your leave request has been approved.' ELSE 'Your leave request has been rejected.' END,
    CASE WHEN p_status = 'APPROVED' THEN 'Approved by HOD.' ELSE 'Rejected: ' || TRIM(p_rejection_reason) END,
    'HOD Portal', 'Leave',
    CASE WHEN p_status = 'APPROVED' THEN 'Approval' ELSE 'Rejection' END,
    '/student/leave-requests'
  );

  RETURN jsonb_build_object('success', true, 'leave_id', p_leave_id, 'status', p_status, 'reviewed_by', v_caller_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
```

---

## 4. Authoritative PDF Verification

* **Source Template:** `public/templates/1000230720.pdf` (595.0 x 842.0 pt, SHA-256 `0568d81fdf0fa2457f29ab0d88132b5c918b9661dca325d67082cf68afa582de`).
* **Visual Inspection & Forensic Diff Results:**
  - Institutional Header & Emblem: **0 pixel diff** (Bitwise identical).
  - Original Printed Notes 1–4 (Mess reduction): **0 pixel diff** (Bitwise identical).
  - Student Application Form remarks areas: **100% clean and blank** (Mentor, Coordinator, HOD, Principal, SWO).
  - Approved Leave Note HOD endorsement: Strictly bounded within designated HOD bounding box ($x \in [88.0, 528.0]$, $y \in [262, 301]$ pt).
  - Single-Page Guarantee: Document remains strictly 1 page under all stress scenarios.

---

## 5. Test Suite Verification Summary

```bash
# 1. Authoritative Architecture Test Suite (PostgreSQL 16 Engine)
$ node tests/leave_architecture_authoritative.test.mjs
▶ Mission 10.6 — Final Leave Management Authoritative Architecture Test Suite
  ✔ 1. Service Contract: submitLeaveRequest enforces immutable snapshots and fails safely (1.22ms)
  ✔ 2. Service Contract: mapLeaveRow does NOT reconstruct snapshots from current live profiles (0.48ms)
  ✔ 3. Service Contract: HOD approval and rejection strictly require authoritative RPC (0.28ms)
  ✔ 4. Real PostgreSQL 16: Snapshot Persistence & Provenance Verification (303.46ms)
  ✔ 5. Real PostgreSQL 16: Duplicate Submission Prevention via Primary Key Uniqueness (202.60ms)
  ✔ 6. Real PostgreSQL 16: HOD Authorization — Non-HOD and Wrong Department Denied (401.88ms)
  ✔ 7. Real PostgreSQL 16: Authoritative RPC Approval with Atomic Notification & Audit (780.27ms)
  ✔ 8. Real PostgreSQL 16: Enforce PENDING-Only Transition Guard (206.13ms)
  ✔ 9. PDF Fidelity: Student Application PDF leaves remarks sections 100% clean and preserves original template (33.38ms)
  ✔ 10. PDF Fidelity: Approved Leave Note renders official template with bounded HOD remarks & watermark (4.63ms)
✔ All 10 tests passed (1935ms)

# 2. Leave Note PDF Generation & Contract Suite
$ node tests/leave_note_pdf_generation.test.mjs
✔ All 20 tests passed (83ms)

# 3. Full Project Test Suite
$ npm test
✔ All 26 test suites passed cleanly with 0 failures

# 4. TypeScript Typecheck
$ npm run typecheck
✔ tsc -b passed with 0 errors

# 5. Linter
$ npm run lint
✔ oxlint passed with 0 errors (255 informational warnings)

# 6. Production Build
$ npm run build
✓ built in 524ms (dist/ generated cleanly)
```

---

## 6. Remaining Deployment Requirements

1. **Remote Production Migrations:**
   During the scheduled production release window, execute pending migrations in sequence:
   - `00037` $\rightarrow$ `00038` $\rightarrow$ `00039` $\rightarrow$ `00040` $\rightarrow$ `00041` $\rightarrow$ `00042` $\rightarrow$ `00043` $\rightarrow$ `00044`.
2. **PostgREST Schema Cache Reload:**
   Upon applying `00041` and `00042`, execute `NOTIFY pgrst, 'reload schema';` or restart PostgREST so the remote API immediately recognizes the snapshot columns and 4-parameter RPC.
3. **Strict Policy Compliance Maintained:**
   No remote mutations were made, no Edge Functions were deployed, and no code was pushed to remote git repositories. All changes remain fully verified and isolated in the local repository.
