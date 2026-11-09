# MISSION 09.2 — Approved Leave Note PDF Generation Implementation & Audit Report

**Project:** AIET-UniSphere  
**Mission:** 09.2 — Approved Leave Note PDF Generation  
**Date:** 2026-11-09  
**Status:** COMPLETED — ALL QUALITY GATES PASSED (100%)  
**Engine & Tools:** Node 22, React 19, Vite 8, PostgreSQL 16.15, jsPDF  

---

## 1. Executive Summary

Mission 09.2 successfully implemented a secure, downloadable, single-page A4 PDF Leave Note generator in AIET-UniSphere based on the official physical AIET Leave Note form. When an HOD reviews and approves a student's leave request, both the student and the HOD can generate and download an authentic, printable leave note.

Key capabilities delivered:
1. **Immutable Academic Snapshots:** Captured at submission time to ensure generated leave notes remain permanently accurate even if profile data changes later.
2. **Backward-Compatible Database Schema:** Forward-only migration `00041_leave_note_snapshots_and_remarks.sql` added 9 columns and upgraded `review_leave_request` RPC with optional approval remarks.
3. **High-Fidelity Single-Page A4 PDF Generator:** Client-side vector PDF generator utilizing `jspdf`, strictly adhering to single-page boundaries ($210 \times 297\text{ mm}$), featuring institutional header, tabular grid, blank physical signature areas, HOD approval endorsement, fictional department seal, stylized demo signature, and diagonal security watermark.
4. **Defense-in-Depth Authorization:** Unapproved (Pending/Rejected) leave notes cannot be generated at either the UI or PDF service level, and PostgreSQL Row-Level Security (RLS) guarantees complete cross-student and cross-department isolation.
5. **Quality Verification:** 100% pass across all unit tests (`npm test`), all real PostgreSQL 16 suites (`npm run test:real-pg`), TypeScript typecheck (`npm run typecheck`), ESLint/oxlint (`npm run lint`), and production build (`npm run build`).

---

## 2. Database Changes (Migration 00041)

Migration file: [`supabase/migrations/00041_leave_note_snapshots_and_remarks.sql`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00041_leave_note_snapshots_and_remarks.sql)

### 2.1 Snapshot Columns Added to `public.leave_requests`

| Column Name | SQL Type | Description & Purpose |
|---|---|---|
| `student_name_snapshot` | `TEXT` | Snapshot of student's full name at application time |
| `student_usn_snapshot` | `TEXT` | Snapshot of student's USN / Roll number |
| `branch_snapshot` | `TEXT` | Snapshot of academic department / branch name |
| `section_snapshot` | `TEXT` | Student's section (e.g., "A", "B", "CSE-1") |
| `semester_snapshot` | `INT` | Snapshot of student's current semester (1-8) |
| `academic_year_snapshot` | `TEXT` | Snapshot of academic year (e.g., "2026-2027") |
| `student_phone_snapshot` | `TEXT` | Student's contact number |
| `parent_phone_snapshot` | `TEXT` | Parent / Guardian contact number |
| `approval_remarks` | `TEXT` | HOD's optional endorsement remarks printed on PDF |

### 2.2 Historical Data Backfill

A defensive backfill query was included to populate existing leave records with profile snapshots where missing:

```sql
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
```

### 2.3 RPC `review_leave_request` Upgrade

The previous 3-argument signature `(UUID, TEXT, TEXT)` was safely replaced with a 4-argument signature supporting optional approval remarks:

```sql
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
...
```

- When `p_status = 'APPROVED'`, `approval_remarks` is set to `TRIM(p_approval_remarks)`.
- When `p_status = 'REJECTED'`, `rejection_reason` is set to `TRIM(p_rejection_reason)`.
- Rejection reason remains strictly mandatory for rejection.
- Double-review is blocked: requests with `status <> 'PENDING'` throw exceptions.
- Cross-department HOD authorization checks remain enforced.

---

## 3. PDF Generator Implementation (`leaveNotePdfService.ts`)

Source file: [`src/services/leaveNotePdfService.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveNotePdfService.ts)

### 3.1 Strict Single-Page A4 Geometry

- **Orientation:** Portrait
- **Dimensions:** $210\text{ mm} \times 297\text{ mm}$
- **Margins:** $14\text{ mm}$ left/right, $10\text{ mm}$ top/bottom (usable width: $182\text{ mm}$, usable height: $277\text{ mm}$)
- **Constraint Verification:** `doc.getNumberOfPages()` is programmatically asserted to equal `1`.

### 3.2 Visual & Structural Layout

1. **Diagonal Security Watermark:**
   - Rotated at 36° across page center.
   - Color: Faint grey (`#E2E8F0`).
   - Text: `"SYSTEM-GENERATED SAMPLE — NOT VALID AS AN OFFICIAL SIGNED FORM"` and `"SAMPLE / DEMO APPROVED LEAVE NOTE"`.
2. **Institutional Header:**
   - "ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY"
   - Affiliation: Recognized by Govt. of Karnataka, Affiliated to VTU Belagavi & Approved by AICTE New Delhi.
   - Address: Shobhavana Campus, Mijar, Moodbidri, D.K. - 574225, Karnataka, India.
   - Contact: 08258-262725 | principalaiet08@gmail.com | www.aiet.org.in.
3. **Form Header & Reference:**
   - "STUDENT LEAVE NOTE / ON-DUTY (OD) FORM"
   - Reference No (`LV-XXX`) and Application Date.
4. **Student Particulars Grid (Tabular Layout):**
   - Row 1: Student Name & USN / Roll No.
   - Row 2: Branch / Department & Semester / Section.
   - Row 3: Academic Year & Leave Category.
   - Row 4: Student Contact & Parent Contact.
   - Row 5: Period of Leave (Start Date → End Date, Total Days).
   - Row 6: Reason / Purpose for Leave.
5. **Manual Signatories (Blank Physical Signature Areas):**
   - Student Declaration & Signature (Date & ink signature line).
   - Remarks & Signature of Mentor.
   - Class Coordinator Recommendation (Attendance % & Yes/No box).
   - Student Welfare Officer (SWO) / Warden (for hostellers).
   - Principal / Administrative Officer (AO) endorsement box.
6. **HOD Approval & Endorsement Panel:**
   - Green-highlighted badge: `STATUS: APPROVED [OFFICIAL]`.
   - Approving Authority: Head of Department (`reviewerName`).
   - Approval Date and Remarks (`approvalRemarks`).
   - **Fictional Sample HOD Signature:** Stylized italic signature with label `[SAMPLE / DEMO SIGNATURE]` and `Digitally Authorized`.
   - **Fictional Sample Department Seal:** Circular blue ink seal with red star text: `ALVA'S INST. OF ENGG & TECH - DEPARTMENT OF CSE - ★ APPROVED ★ - SAMPLE / DEMO SEAL`.
7. **Important Instructions & Regulations Footer:**
   - Note on advance application submission.
   - Note on medical certificate requirement.
   - Mandatory minimum 75% attendance VTU Belagavi regulation.

---

## 4. Frontend & Service Integration

### 4.1 Data Model & Service Layer

- [`src/data/leaveRequests.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/data/leaveRequests.ts): Added snapshot properties and `approvalRemarks` to `LeaveRequest` interface.
- [`src/services/leaveService.ts`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/src/services/leaveService.ts):
  - `mapLeaveRow`: Prioritizes snapshot columns over mutable joins with transparent fallback.
  - `getStudentLeaveProfileDefaults`: Fetches student's profile & academic data (`phone`, `parent_phone`) to prefill the application modal.
  - `submitLeaveRequest`: Accepts `section`, `studentPhone`, `parentPhone`, fetches profile details, and snapshots all attributes into `leave_requests`.
  - `approveLeaveRequest`: Accepts optional `remarks?: string` and delivers `p_approval_remarks` to `review_leave_request` RPC.
  - Re-exports `generateLeaveNotePdf` and `downloadApprovedLeaveNote`.

### 4.2 Student UI (`LeaveRequestsPage.tsx`)

- Modal extended with:
  - `Section` input (e.g., "A", "B", "CSE-1").
  - `Student Phone` input (auto-prefilled from `student_profiles.phone`).
  - `Parent Phone` input (auto-prefilled from `student_profiles.parent_phone`).
- Leave Requests Table:
  - Added **"Leave Note"** column.
  - For rows with `status === 'Approved'`, renders a green `"Download Note"` button triggering direct PDF generation.
  - For pending/rejected rows, clearly indicates `"Pending Approval"` or `"Not Available"`.

### 4.3 HOD UI (`HODLeaveDetail.tsx`)

- Approval Confirmation Modal:
  - Added optional **Approval Remarks** textarea (`"Approval Remarks (Optional — printed on student's Leave Note)"`).
- Approved Leave View:
  - Renders official approval card displaying HOD name, remarks, and a prominent `"Download Approved Leave Note PDF"` button.

---

## 5. Verification & Test Evidence

### 5.1 Automated Unit & Integration Tests

Test Suite: [`tests/leave_note_pdf_generation.test.mjs`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/tests/leave_note_pdf_generation.test.mjs) (14 tests)

```
▶ Mission 09.2 — Approved Leave Note PDF Generation & Security Audit
  ✔ 1. isLeaveApproved identifies approved statuses case-insensitively and rejects pending/rejected (0.5782ms)
  ✔ 2. generateLeaveNotePdf strictly rejects unapproved leave requests with an informative error (0.6315ms)
  ✔ 3. generateLeaveNotePdf generates valid jsPDF document for approved leave (19.8458ms)
  ✔ 4. Single-page constraint: document remains strictly 1 page even with lengthy reason and remarks (3.631ms)
  ✔ 5. Snapshot values take precedence over mutable profile fields (4.0358ms)
  ✔ 6. Fallback values are safely rendered when snapshot fields are missing (3.615ms)
  ✔ 7. Approval remarks and reviewer details are rendered accurately (2.4655ms)
  ✔ 8. Default approval remarks are rendered when approvalRemarks is omitted (2.6397ms)
  ✔ 9. Prominent fictional watermark and sample labels are present in the PDF output (1.704ms)
  ✔ 10. Blank manual signature sections exist for all required signatories (2.3959ms)
  ✔ 11. Institutional header and VTU attendance regulations are rendered (2.5093ms)
  ✔ 12. Migration 00041 schema integrity check (0.7188ms)
  ✔ 13. Service contract validation: submitLeaveRequest payload accepts snapshot parameters (0.2886ms)
  ✔ 14. UI integration: student and HOD pages contain download button and snapshot fields (0.3062ms)
✔ Mission 09.2 — Approved Leave Note PDF Generation & Security Audit (46.623ms)
ℹ tests 14 | suites 1 | pass 14 | fail 0
```

### 5.2 Real PostgreSQL 16 Security Tests

Test Suite: [`tests/real_postgres_leave_note_security.mjs`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/tests/real_postgres_leave_note_security.mjs) (8 tests on isolated PostgreSQL 16 daemon `127.0.0.1:54333`)

```
=== AIET-UniSphere MISSION 09.2: Real PostgreSQL 16 Leave Note Security ===

✔ [0/8] Connection verified to PostgreSQL 16 on port 54333.
✔ [1/8] All 9 snapshot and remarks columns verified in public.leave_requests.
✔ [2/8] Department, Profile, and Student Profile fixtures seeded.
✔ [3/8] Leave request with immutable snapshot columns inserted successfully.
✔ [4/8] Row-Level Security isolation verified: cross-student read denied.
✔ [5/8] Cross-department review authorization guard strictly enforced.
✔ [6/8] Authorized HOD approval succeeded and recorded approval_remarks.
✔ [7/8] Double-review prevention guard successfully verified.
✔ [8/8] Mandatory rejection reason requirement verified.

================================================================
All 8 Real PostgreSQL 16 Leave Note & RPC Security tests PASSED!
================================================================
```

### 5.3 Full Quality Gate Summary

| Quality Gate | Command | Result |
|---|---|---|
| **TypeScript Typecheck** | `npm run typecheck` | **PASS (0 errors)** |
| **ESLint / Oxlint** | `npm run lint` | **PASS (0 errors)** |
| **Unit Test Suite** | `npm test` | **PASS (21 suites, 100% pass)** |
| **Real PostgreSQL 16 Suite** | `npm run test:real-pg` | **PASS (6 suites, 100% pass)** |
| **Production Build** | `npm run build` | **PASS (774ms, dist assets verified)** |

---

## 6. Security Guarantees & Non-Regressions

1. **Client & Server Guarding:** Unapproved leave requests cannot generate leave notes under any circumstances.
2. **PostgreSQL Row-Level Security:** Students are constrained to rows where `student_id = auth.uid()`. Cross-student querying returns empty results even if a student knows another student's UUID or reference ID.
3. **Department Scoping:** HODs can only review and approve requests belonging to their department; cross-department RPC calls raise `ACCESS DENIED`.
4. **Historical Immutability:** Previous academic materials, attendance corrections, and student analytics views continue to operate with zero regressions.
5. **No Production Exposure:** All database operations were conducted strictly against local isolated test databases without modifying production or remote environments.
