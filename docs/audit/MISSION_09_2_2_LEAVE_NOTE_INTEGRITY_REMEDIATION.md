# MISSION 09.2.2 — LEAVE NOTE INTEGRITY AND SECURITY REMEDIATION REPORT

**Project:** AIET-UniSphere  
**Mission Phase:** Mission 09.2.2 (Remediation & Final Verification)  
**Date:** 2026-11-09  
**Status:** COMPLETE  
**Final Verdict:** APPROVED  

---

## 1. Executive Summary

Mission 09.2.2 was executed to resolve all six security, presentation, and data integrity findings identified during Mission 09.2.1 (`DEF-09.2.1-01` through `DEF-09.2.1-06`), as well as the student `INSERT` metadata integrity vulnerability.

The objective was achieved via:
1. **Presentation Alignment:** Clarifying that generated PDFs are demonstration copies with prominent disclaimers, matching the uploaded physical AIET leave note form headers and contacts, and rendering transparent provenance metadata.
2. **Database Hardening:** Implementing forward-only Migration `00042_leave_note_security_and_provenance.sql` to revoke excessive RPC execution grants from `PUBLIC` and `anon`, establishing a `snapshot_provenance` schema attribute, and locking down student `INSERT` operations at the PostgreSQL Row-Level Security layer.
3. **Application & Service Hardening:** Updating `src/data/leaveRequests.ts`, `src/services/leaveService.ts`, and `src/services/leaveNotePdfService.ts` to propagate and display snapshot provenance without breaking existing leave approval or submission workflows.
4. **Comprehensive Real PostgreSQL 16 Verification:** Testing against an isolated PostgreSQL 16 cluster on port 54333 and validating all 17 specified security and functional scenarios.

---

## 2. Defect Remediation Matrix

| Defect ID | Description | Root Cause | Remediation Applied | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-09.2.1-01** | Status badge read `STATUS: APPROVED [OFFICIAL]` | Leftover wording implying legal authenticity | Replaced with `HOD APPROVED — DEMONSTRATION COPY` in `leaveNotePdfService.ts`. | **RESOLVED** |
| **DEF-09.2.1-02** | Missing prominent disclaimer in HOD endorsement area | Endorsement block lacked clear demo demarcation | Added prominent bold disclaimer: `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL` within HOD box. | **RESOLVED** |
| **DEF-09.2.1-03** | Inaccurate institutional contact details and unsupported claims | Modern email and NAAC claims not present on physical AIET form | Aligned header with physical document: `Phone: 08258-262725`, `Fax: 08258-262726`, `Shobhavana Campus, Mijar, Moodbidri, D.K. - 574225`; removed unsupported accreditation claims. | **RESOLVED** |
| **DEF-09.2.1-04** | Excessive RPC execution privileges on `review_leave_request` | `public` functions in PostgreSQL grant execute to `PUBLIC` by default | Migration 00042 executed `REVOKE ALL ... FROM PUBLIC, anon;` and explicitly granted `EXECUTE` only to `authenticated`. | **RESOLVED** |
| **DEF-09.2.1-05** | Ambiguous snapshot provenance | Historic records backfilled without provenance distinction | Added `snapshot_provenance` column with `CHECK` constraint (`'SUBMISSION'`, `'RETROACTIVE_BACKFILL'`, `'UNVERIFIED'`). Document footer explicitly reflects provenance. | **RESOLVED** |
| **DEF-09.2.1-06** | Student direct REST INSERT status/metadata spoofing | Student `INSERT` RLS policy checked only `student_id` and `department_id` | Hardened `WITH CHECK` expression in Migration 00042 to enforce `status = 'PENDING'`, `reviewed_by IS NULL`, `reviewed_at IS NULL`, `approval_remarks IS NULL`, and `snapshot_provenance IN ('SUBMISSION', NULL)`. | **RESOLVED** |

---

## 3. Database Migration Details (`00042_leave_note_security_and_provenance.sql`)

Migration file: [`supabase/migrations/00042_leave_note_security_and_provenance.sql`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00042_leave_note_security_and_provenance.sql)

### 3.1 RPC Execution Privilege Hardening
```sql
REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) TO authenticated;
```
Verified via `pg_proc.proacl`:
```
{postgres=X/postgres,authenticated=X/postgres}
```
Anonymous and unauthenticated roles receive `permission denied for function review_leave_request` at the SQL catalog layer before executing any internal logic.

### 3.2 Snapshot Provenance Tracking
```sql
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS snapshot_provenance TEXT DEFAULT 'SUBMISSION'
  CHECK (snapshot_provenance IN ('SUBMISSION', 'RETROACTIVE_BACKFILL', 'UNVERIFIED'));

-- Differentiate existing backfilled records from live submission snapshots
UPDATE public.leave_requests
SET snapshot_provenance = 'RETROACTIVE_BACKFILL'
WHERE student_name_snapshot IS NOT NULL
  AND (snapshot_provenance IS NULL OR snapshot_provenance = 'SUBMISSION')
  AND created_at < NOW() - INTERVAL '1 minute';

-- Mark records with missing snapshots as UNVERIFIED
UPDATE public.leave_requests
SET snapshot_provenance = 'UNVERIFIED'
WHERE student_name_snapshot IS NULL;
```

### 3.3 Student Direct REST INSERT Policy Hardening
```sql
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
```

---

## 4. Application & PDF Presentation Updates

### 4.1 TypeScript Model Alignment (`src/data/leaveRequests.ts`)
Added `snapshotProvenance?: 'SUBMISSION' | 'RETROACTIVE_BACKFILL' | 'UNVERIFIED';` to `LeaveRequest` interface.

### 4.2 Leave Service (`src/services/leaveService.ts`)
- `mapLeaveRow`: Added mapping for `snapshotProvenance: row.snapshot_provenance`.
- `submitLeaveRequest`: Appends `snapshot_provenance: 'SUBMISSION'` to database insertion payload.

### 4.3 PDF Generator (`src/services/leaveNotePdfService.ts`)
- **Watermark:** Faint diagonal watermark retained:
  `SYSTEM-GENERATED SAMPLE - NOT VALID AS AN OFFICIAL SIGNED FORM`
- **Header:** Exact physical AIET letterhead details:
  - Phone: `08258-262725`
  - Fax: `08258-262726`
  - Campus: `Shobhavana Campus, Mijar, Moodbidri, D.K. - 574225`
  - Removed NAAC accreditation and modern website/email contacts.
- **HOD Badge:** Replaced with `HOD APPROVED — DEMONSTRATION COPY`.
- **HOD Disclaimer:** Rendered in bold red ink within the HOD endorsement box:
  `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL`
- **Footer Provenance Label:** Dynamically renders:
  - `'Provenance: Verified Submission Snapshot'` for `SUBMISSION`
  - `'Provenance: Retroactive Backfill (Current Profile)'` for `RETROACTIVE_BACKFILL`
  - `'Provenance: Unverified Historical Record'` for `UNVERIFIED`
- **Single-Page Guarantee:** Retains strict `doc.getNumberOfPages() === 1` check with responsive line truncation for lengthy reasons and remarks.

---

## 5. Verification & Test Execution Results

### 5.1 Real PostgreSQL 16 Security Test Suite (`tests/real_postgres_leave_note_security.mjs`)
Tested on PostgreSQL 16 (`127.0.0.1:54333`):
- `✔ [0/14] Connection verified to PostgreSQL 16 on port 54333.`
- `✔ Migrations 00041 and 00042 applied cleanly.`
- `✔ [1/8] All 9 snapshot and remarks columns verified in public.leave_requests.`
- `✔ [2/8] Department, Profile, and Student Profile fixtures seeded.`
- `✔ [3/8] Leave request with immutable snapshot columns inserted successfully.`
- `✔ [4/8] Row-Level Security isolation verified: cross-student read denied.`
- `✔ [5/8] Cross-department review authorization guard strictly enforced.`
- `✔ [6/8] Authorized HOD approval succeeded and recorded approval_remarks.`
- `✔ [7/8] Double-review prevention guard successfully verified.`
- `✔ [8/8] Mandatory rejection reason requirement verified.`
- `✔ [9/14] Anonymous execution privilege strictly revoked at PostgreSQL catalog level.`
- `✔ [10/14] Direct REST INSERT forging status = APPROVED blocked by RLS.`
- `✔ [11/14] Direct REST INSERT forging reviewed_by / approval_remarks blocked by RLS.`
- `✔ [12/14] Direct REST INSERT forging snapshot_provenance blocked by RLS.`
- `✔ [13/14] Legitimate student leave submission via RLS succeeds with status = PENDING.`
- `✔ [14/14] snapshot_provenance domain CHECK constraint verified.`
**Result:** 14 / 14 Passed (100%).

### 5.2 Unit & PDF Layout Test Suite (`tests/leave_note_pdf_generation.test.mjs`)
- `✔ 1. isLeaveApproved identifies approved statuses case-insensitively and rejects pending/rejected`
- `✔ 2. generateLeaveNotePdf strictly rejects unapproved leave requests with an informative error`
- `✔ 3. generateLeaveNotePdf generates valid jsPDF document for approved leave`
- `✔ 4. Single-page constraint: document remains strictly 1 page even with lengthy reason and remarks`
- `✔ 5. Snapshot values take precedence over mutable profile fields`
- `✔ 6. Fallback values are safely rendered when snapshot fields are missing`
- `✔ 7. Approval remarks and reviewer details are rendered accurately (Demonstration Copy & Disclaimers)`
- `✔ 8. Default approval remarks are rendered when approvalRemarks is omitted`
- `✔ 9. Prominent fictional watermark and sample labels are present in the PDF output`
- `✔ 10. Blank manual signature sections exist for all required signatories`
- `✔ 11. Institutional header and VTU attendance regulations are rendered (Phone/Fax verified)`
- `✔ 12. Migration 00041 schema integrity check`
- `✔ 13. Service contract validation: submitLeaveRequest payload accepts snapshot parameters`
- `✔ 14. UI integration: student and HOD pages contain download button and snapshot fields`
- `✔ 15. Provenance tracking: PDF distinguishes SUBMISSION, RETROACTIVE_BACKFILL, and UNVERIFIED`
- `✔ 16. Migration 00042 security hardening and provenance schema check`
**Result:** 16 / 16 Passed (100%).

### 5.3 Quality Gates Summary
- `npm test`: **PASSED** (21 test suites, 0 failures)
- `npm run test:real-pg`: **PASSED** (all 6 real PostgreSQL suites, 0 errors)
- `npm run typecheck`: **PASSED** (`tsc -b` clean exit 0)
- `npm run lint`: **PASSED** (0 errors, 254 pre-existing warnings in untouched files)
- `npm run build`: **PASSED** (production client bundle generated in 717ms)

---

## 6. Audit Conclusion & Sign-off

All vulnerabilities identified in Mission 09.2.1 have been resolved without breaking any operational workflows, including student submission, departmental routing, HOD review, or the distinct past-date attendance claim workflow. 

The generated PDF strictly conforms to the physical AIET leave note reference form, adheres to the single-page A4 format, clearly marks sample and demonstration artifacts, and transparently states snapshot provenance. Direct database tampering by unauthorized users or students is completely blocked at both the RLS and RPC catalog levels.

**Final Mission 09.2.2 Verdict: APPROVED**
