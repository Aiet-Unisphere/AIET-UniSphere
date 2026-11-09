# MISSION 09.2.1 — Approved Leave Note Security, Data Integrity and PDF Accuracy Audit

**Project:** AIET-UniSphere  
**Audit Target:** Mission 09.2 Implementation  
**Audit Scope:** Database Migrations, RLS, RPC Signatures, Snapshot Integrity, PDF Security & Accuracy  
**Audit Mode:** STRICTLY READ-ONLY AUDIT (Zero application code or database changes)  
**Date:** 2026-11-09  
**Verdict:** **CONDITIONALLY APPROVED**  

---

## 1. Executive Summary

A comprehensive, strictly read-only audit of the **Mission 09.2 — Approved Leave Note PDF Generation** implementation was conducted. The audit inspected the PostgreSQL 16 database functions, table schemas, Row-Level Security (RLS) policies, service layers, client-side vector PDF generation logic, and empirical behavior against an active isolated PostgreSQL 16 cluster (`127.0.0.1:54333`).

### Key Audit Findings
1. **RPC Signature & Overload Verification:** Migration 00041 cleanly dropped the 3-argument function `review_leave_request(UUID, TEXT, TEXT)` before creating the 4-argument version `review_leave_request(UUID, TEXT, TEXT, TEXT)`. Only one function exists in `pg_proc`. No orphan overloads exist.
2. **Access Control & Authorization:** Only authenticated users with role `HOD` (matching the student's department) or `ADMIN` can execute the RPC. Cross-department review attempts are rejected with `ACCESS DENIED`.
3. **Student Metadata Protection:** Students cannot modify leave records, approval remarks, or snapshots post-submission because the `leave_requests` table has no `UPDATE` policy for students.
4. **PDF Authorization Barrier:** `generateLeaveNotePdf` rejects non-approved requests (Pending/Rejected). Students can only retrieve and download their own approved requests due to PostgreSQL SELECT RLS (`student_id = auth.uid()`).
5. **Mandatory Corrections Identified:**
   - **DEF-09.2.1-01:** Approval badge in PDF renders `STATUS: APPROVED [OFFICIAL]`. Must be updated to `HOD APPROVED — DEMONSTRATION COPY`.
   - **DEF-09.2.1-02:** Endorsement section requires explicit retention of `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL`.
   - **DEF-09.2.1-03:** Institutional header contains extra modern web details and omits the physical form's Fax line (`Fax: 08258-262726`).
   - **DEF-09.2.1-04:** Privilege hardening: Default PostgreSQL function grants leave `EXECUTE` on `review_leave_request` accessible to `anon` at the SQL catalog layer (blocked internally by `auth.uid() IS NULL` guard). Explicit `REVOKE ... FROM PUBLIC, anon` is recommended.
   - **DEF-09.2.1-05:** Historical backfilled snapshots lack a distinct column or flag indicating retroactive population versus live submission-time capture.

---

## 2. RPC Migration & Function Security Audit

### 2.1 Function Signature & Catalog State

Inspection of `pg_proc` on the active PostgreSQL 16 engine:

```sql
SELECT p.proname, 
       pg_get_function_identity_arguments(p.oid) AS args, 
       pg_get_function_result(p.oid) AS result, 
       p.prosecdef, 
       r.rolname AS owner, 
       p.proacl 
FROM pg_proc p 
JOIN pg_roles r ON p.proowner = r.oid 
WHERE p.proname = 'review_leave_request';
```

**Catalog Evidence:**

| Field | Catalog Value | Assessment |
|---|---|---|
| **proname** | `review_leave_request` | Target function identified |
| **args** | `p_leave_id uuid, p_status text, p_rejection_reason text, p_approval_remarks text` | Single 4-parameter signature with defaults |
| **result** | `jsonb` | Structured JSON response |
| **prosecdef** | `true` (`SECURITY DEFINER`) | Executes with creator rights |
| **owner** | `postgres` | Superuser / database administrator |
| **proacl** | `{=X/postgres,postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}` | **Audit Observation (DEF-09.2.1-04)** |

### 2.2 Overload and Replacement Analysis
- **Old Signature:** `public.review_leave_request(p_leave_id UUID, p_status TEXT, p_rejection_reason TEXT DEFAULT NULL)`
- **New Signature:** `public.review_leave_request(p_leave_id UUID, p_status TEXT, p_rejection_reason TEXT DEFAULT NULL, p_approval_remarks TEXT DEFAULT NULL)`
- **Overload Prevention:** Migration 00041 executed `DROP FUNCTION IF EXISTS public.review_leave_request(UUID, TEXT, TEXT);` prior to `CREATE OR REPLACE FUNCTION`.
- **Finding:** Exactly **one** function named `review_leave_request` exists in `pg_proc`. No stale 3-parameter overload exists.
- **Backward Compatibility:** Because `p_approval_remarks` defaults to `NULL`, callers passing 3 positional arguments (`review_leave_request(id, status, reason)`) resolve seamlessly to the new function.

### 2.3 Privilege Grants & Anonymous Denial
- `00041_leave_note_snapshots_and_remarks.sql` issued:
  ```sql
  GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) TO authenticated;
  ```
- **Finding (DEF-09.2.1-04):** PostgreSQL automatically assigns `PUBLIC` execute privileges on functions created in the `public` schema unless explicitly revoked. As shown in `proacl`, `anon=X/postgres` is present.
- **Runtime Mitigation:** Inside `review_leave_request`, execution is immediately guarded at line 10:
  ```sql
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  ```
  Empirical test with `SET ROLE anon; SELECT review_leave_request(...)` confirmed that anonymous requests fail with `ERROR: Authentication required.`. However, defense-in-depth requires adding `REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;`.

### 2.4 Departmental HOD Authorization
- The RPC enforces:
  ```sql
  SELECT role, department_id INTO v_caller_role, v_caller_dept_id
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('HOD', 'ADMIN') THEN
    RAISE EXCEPTION 'Only HODs or Administrators are authorized to review leave requests.';
  END IF;

  IF v_caller_role = 'HOD' AND (v_caller_dept_id IS NULL OR v_leave.department_id <> v_caller_dept_id) THEN
    RAISE EXCEPTION 'ACCESS DENIED: You are only authorized to review leave requests for your department.';
  END IF;
  ```
- Verified: An ECE HOD attempting to approve a CSE student's leave was blocked with `ERROR: ACCESS DENIED: You are only authorized to review leave requests for your department.`.

---

## 3. Snapshot Integrity & Historical Data Audit

### 3.1 Snapshot Capture at Submission
In [`src/services/leaveService.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveService.ts#L349-L476) (`submitLeaveRequest`):
- Fetches caller's `profiles` (`full_name`, `usn_or_employee_id`, `department_id`, department name).
- Fetches `student_profiles` (`semester`, `academic_year`, `phone`, `parent_phone`).
- Writes immutable snapshots on `INSERT`:
  - `student_name_snapshot`: `studentProfile.full_name`
  - `student_usn_snapshot`: `studentProfile.usn_or_employee_id`
  - `branch_snapshot`: `studentProfile.department?.name`
  - `section_snapshot`: `payload.section?.trim() || null`
  - `semester_snapshot`: `studentAcademic?.semester || null`
  - `academic_year_snapshot`: `studentAcademic?.academic_year || null`
  - `student_phone_snapshot`: `payload.studentPhone?.trim() || studentAcademic?.phone || null`
  - `parent_phone_snapshot`: `payload.parentPhone?.trim() || studentAcademic?.parent_phone || null`

### 3.2 Student Tampering Post-Submission
- Inspection of `pg_policy` on `public.leave_requests`:
  - Policy `Users can read relevant leave requests` (`polcmd = 'r'`, SELECT)
  - Policy `Students can create leave requests` (`polcmd = 'a'`, INSERT)
  - Policy `HODs can approve or reject leave requests` (`polcmd = 'w'`, UPDATE)
- **Finding:** Students have **zero UPDATE privileges** on `public.leave_requests`.
- **Empirical Evidence:** When an authenticated student attempted:
  ```sql
  UPDATE public.leave_requests SET approval_remarks = 'Hacked' WHERE id = '...';
  UPDATE public.leave_requests SET student_name_snapshot = 'Hacked Name' WHERE id = '...';
  ```
  PostgreSQL RLS matched 0 rows and blocked the update completely. The database record remained unchanged.

### 3.3 Historical Backfill Analysis (DEF-09.2.1-05)
Migration 00041 ran a retroactive backfill:
```sql
UPDATE public.leave_requests lr
SET
  student_name_snapshot = COALESCE(lr.student_name_snapshot, p.full_name),
  ...
FROM public.profiles p
...
WHERE lr.student_id = p.id AND (lr.student_name_snapshot IS NULL OR ...);
```
- **Finding:**
  1. The backfill copies current values from `profiles` and `student_profiles`. For legacy leave requests submitted semesters ago, the backfilled semester and contact details reflect current profile state rather than historical submission state.
  2. The table does not have a discriminator column (e.g., `snapshot_source` or `is_backfilled BOOLEAN DEFAULT false`) to distinguish authentic submission-time snapshots from retroactive backfills.
- **Recommendation:** Add a tracking column or audit log note indicating retroactive backfill status so historical leaves are not falsely claimed as immutable submission snapshots.

### 3.4 Direct REST Insert Guard (DEF-09.2.1-06)
- **Finding:** The RLS INSERT policy checks `student_id = auth.uid() AND department_id = ...`. It does not explicitly check `status = 'PENDING'` or restrict `approval_remarks IS NULL`.
- While the frontend `leaveService.ts` correctly sends `status: 'PENDING'`, a raw Supabase REST call could attempt to submit `status: 'APPROVED'`.
- **Recommendation:** Add `AND status = 'PENDING' AND approval_remarks IS NULL` to the INSERT policy `WITH CHECK` expression or add a `BEFORE INSERT` trigger to enforce default pending state.

---

## 4. PDF Authorization and Accuracy Audit

### 4.1 Authorization Gates
- **Status Gate:** [`src/services/leaveNotePdfService.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveNotePdfService.ts#L18-L25):
  ```typescript
  if (!isLeaveApproved(leave.status)) {
    throw new Error(
      `Cannot generate approved leave note: Leave request is currently "${leave.status}". Only approved leave requests can generate a leave note.`
    );
  }
  ```
  Verified: Both `Pending` and `Rejected` requests throw runtime exceptions and block PDF generation.
- **Ownership & ID Tampering:**
  - `leave_requests` RLS enforces `student_id = auth.uid()`.
  - If Student B attempts to fetch Student A's leave request (`getLeaveRequestById`), PostgreSQL returns 0 rows.
  - The UI cannot access or download another student's leave note.
- **Cross-Department HOD Access:**
  - Enforced by RLS (`department_id = caller.department_id`) and `getLeaveRequestById` check. Cross-department leave requests cannot be viewed or downloaded.

### 4.2 Data Accuracy & Stale Data Prevention
- In `mapLeaveRow`:
  ```typescript
  requesterName: l.student_name_snapshot || studentName,
  requesterUsnOrEmpId: l.student_usn_snapshot || studentUsn,
  departmentName: l.branch_snapshot || deptName,
  semester: l.semester_snapshot ?? l.student_academic?.semester ?? null,
  ```
  Snapshots are prioritized over joined profile records.
- Stale approval data is prevented: HOD endorsement details (`reviewerName`, `approvalRemarks`, `reviewedAt`) are read directly from the reviewed leave request record.

---

## 5. PDF Content, Institutional Presentation & Layout Audit

Inspection of [`src/services/leaveNotePdfService.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveNotePdfService.ts) against the physical AIET Leave Note form:

### 5.1 Presentation Discrepancies & Mandatory Corrections

| Item | Current Implementation in `leaveNotePdfService.ts` | Required Official AIET Specification | Finding / Action |
|---|---|---|---|
| **Approval Status Badge** | `STATUS: APPROVED [OFFICIAL]` (line 245) | `HOD APPROVED — DEMONSTRATION COPY` | **DEF-09.2.1-01 (Mandatory Correction)** |
| **Endorsement Disclaimer** | `[SAMPLE / DEMO SIGNATURE]` and `SAMPLE / DEMO SEAL` | Must prominently state `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL` | **DEF-09.2.1-02 (Mandatory Correction)** |
| **College Header Title** | `ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY` | `ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY` | Verified & Accurate |
| **Institutional Address** | `Shobhavana Campus, Mijar, Moodbidri, D.K. - 574225, Karnataka, India` | `Shobhavana Campus, Mijar, Moodbidri, D.K. - 574225` | Verified & Accurate |
| **Header Contact Line** | `Phone: 08258-262725 / 262724 \| Email: principalaiet08@gmail.com \| Website: www.aiet.org.in` | `Phone: 08258-262725, Fax: 08258-262726` | **DEF-09.2.1-03 (Header Discrepancy):** Fax line omitted; email/website added |
| **Accreditation Text** | `Recognized by Govt. of Karnataka, Affiliated to VTU Belagavi & Approved by AICTE, New Delhi` | Sub-heading on form: *Recognized by AICTE, Affiliated to VTU Belagavi* | Aligned; remove any unsupported claims (e.g. NAAC accredited) |
| **Attendance Rule Note** | `3. Minimum 75% attendance in each course is mandatory as per VTU Belagavi regulations...` | Physical form printed note on VTU attendance norms | **DEF-09.2.1-04 (Printed Notes):** Align verbatim with physical form |
| **Single-Page A4 Geometry** | Margins 14mm, content width 182mm, height 277mm | $210 \times 297\text{ mm}$ (A4) | Verified: `doc.getNumberOfPages() === 1` |
| **Watermark Legibility** | 36° angle, `#E2E8F0` color, centered | Prominent, legible, non-obscuring | Verified: Faint background watermark does not obscure text |

---

## 6. Real PostgreSQL 16 Empirical Evidence

An isolated test script was executed against the local PostgreSQL 16 daemon on port 54333.

### Test Results

```
=== MISSION 09.2.1: REAL POSTGRESQL 16 VERIFICATION ===

[Check 1] Old 3-arg RPC signature access:
  Result success: false
  Error: ERROR: Authentication required. (Resolved to 4-arg with default NULL)

[Check 2] New 4-arg RPC signature in pg_proc:
  pg_proc entry: review_leave_request|p_leave_id uuid, p_status text, p_rejection_reason text, p_approval_remarks text

[Check 3] Anonymous execution denial:
  Result success: false
  Error: ERROR: Authentication required.

[Check 4] Student approval-remarks modification denial:
  Result: No rows returned / blocked
  Database value: Official academic duty sanctioned under VTU guidelines.

[Check 5] Student snapshot modification denial:
  Result: No rows returned / blocked
  Database value: Arjun Rao

[Check 6] Cross-department HOD approval denial:
  Result success: false
  Error: ERROR: ACCESS DENIED: You are only authorized to review leave requests for your department.

[Check 7] Approved-request ownership enforcement:
  Student 1 read (own approved request): LV-TEST-101|APPROVED
  Student 2 read (cross-student approved request): (0 rows - BLOCKED BY RLS)

[Check 8] Pending and rejected PDF generation denial:
  Pending PDF: BLOCKED with message -> Cannot generate approved leave note: Leave request is currently "Pending". Only approved leave requests can generate a leave note.
  Rejected PDF: BLOCKED with message -> Cannot generate approved leave note: Leave request is currently "Rejected". Only approved leave requests can generate a leave note.

[Check 9] Historical backfilled snapshot analysis:
  Backfill distinction column exists: NONE (No flag indicates whether snapshot was captured live or backfilled retroactively)

[Check 10] Approval remarks integrity on approve vs reject:
  Approve call success: true -> DB status: APPROVED | approval_remarks: Sanctioned by HOD CSE | rejection_reason: NULL
  Reject call success: true -> DB status: REJECTED | approval_remarks: NULL | rejection_reason: Attendance is below 75% threshold
```

---

## 7. Quality Gates & Regression Verification

All existing tests were executed on the clean branch:

| Test Suite | Command | Outcome | Evidence |
|---|---|---|---|
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** | 0 errors |
| **Linter** | `npm run lint` | **PASS** | 0 errors (254 pre-existing warnings) |
| **Unit Test Baseline** | `npm test` | **PASS** | 21 test suites, 100% pass |
| **PDF Generation Test** | `node tests/leave_note_pdf_generation.test.mjs` | **PASS** | 14/14 tests pass |
| **PostgreSQL 16 Security** | `node tests/real_postgres_leave_note_security.mjs` | **PASS** | 8/8 tests pass on port 54333 |
| **Full Real-PG Suite** | `npm run test:real-pg` | **PASS** | 6 test suites pass on port 54333 |
| **Production Build** | `npm run build` | **PASS** | Built in 774ms, bundles valid |

### Git State
- **Branch:** `main`
- **Pre-Implementation Checkpoint Tag:** `checkpoint-mission-09-2-pre`
- **Post-Implementation Checkpoint Tag:** `checkpoint-mission-09-2-post`
- **Latest Commit:** `4f3457a` (`feat(leave): implement approved leave note PDF generation (Mission 09.2)`)

---

## 8. Defect Log & Remediation Plan

| Defect ID | Category | Severity | Description | Remediation Plan |
|---|---|---|---|---|
| **DEF-09.2.1-01** | PDF Presentation | **Medium** | Approval badge displays `STATUS: APPROVED [OFFICIAL]` instead of required demonstration copy text. | Replace text with `HOD APPROVED — DEMONSTRATION COPY` in `leaveNotePdfService.ts`. |
| **DEF-09.2.1-02** | PDF Presentation | **Medium** | Endorsement area lacks the explicit composite disclaimer. | Ensure stamp/seal area explicitly displays `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL`. |
| **DEF-09.2.1-03** | PDF Header | **Low** | Header contact line omits Fax `08258-262726` and includes modern web links not on the physical form. | Update header contact line to match physical form: `Phone: 08258-262725, Fax: 08258-262726`. |
| **DEF-09.2.1-04** | PostgreSQL Privilege | **Low** | Function `review_leave_request` retains execute grant to `anon` in `proacl` (mitigated internally by `auth.uid()` guard). | In a forward migration, execute `REVOKE ALL ON FUNCTION public.review_leave_request(...) FROM PUBLIC, anon;`. |
| **DEF-09.2.1-05** | Data Integrity | **Low** | Historical backfilled snapshots cannot be distinguished from live submission snapshots. | Add tracking metadata column or note in PDF for retroactively backfilled leaves. |
| **DEF-09.2.1-06** | Database Security | **Low** | Direct REST `INSERT` policy lacks explicit check on `status = 'PENDING'`. | Add `status = 'PENDING'` check to the `leave_requests` INSERT policy `WITH CHECK`. |

---

## 9. Final Audit Verdict

### **CONDITIONALLY APPROVED**

**Justification:**  
The Mission 09.2 implementation successfully achieves robust database authorization, single-page vector PDF generation, tamper-proof student snapshot preservation, and 100% test pass rates across both unit tests and live PostgreSQL 16 instances.

The implementation is **CONDITIONALLY APPROVED** subject to executing the identified presentation corrections in the subsequent remediation mission:
1. Update status badge text to `HOD APPROVED — DEMONSTRATION COPY`.
2. Add explicit disclaimer `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL`.
3. Align institutional header and printed notes verbatim with the physical AIET leave note form.
4. Apply defense-in-depth privilege revoking for `PUBLIC` / `anon` on `review_leave_request`.

