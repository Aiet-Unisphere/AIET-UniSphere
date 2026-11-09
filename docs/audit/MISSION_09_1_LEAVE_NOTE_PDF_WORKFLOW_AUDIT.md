# MISSION 09.1 — LEAVE NOTE PDF GENERATION: EXISTING WORKFLOW AUDIT
**Project:** AIET-UniSphere  
**Date:** November 9, 2026  
**Audit Scope:** Leave Management Architecture, Database Schemas, RLS Policies, Data Mapping, PDF Feasibility, and Security  
**Audit Mode:** STRICTLY READ-ONLY AUDIT  

---

## 1. Existing Leave Architecture

A comprehensive inspection was performed across the student portal, HOD portal, database migrations, services, and Edge Functions:

### 1.1 Student Leave Workflow (`src/pages/LeaveRequestsPage.tsx`)
- Students apply for leave through an interactive modal.
- Form inputs captured:
  - `leaveType`: Categorical selection (`Medical Leave`, `Academic Duty / Event`, `Personal / Family`, `Other`).
  - `startDate` & `endDate`: ISO format dates (`YYYY-MM-DD`).
  - `reason`: Mandatory text description.
  - `file`: Optional supporting certificate/document uploaded to private Supabase Storage (`student-documents` bucket).
- Table columns displayed: `Ref ID`, `Leave Type`, `Reason / Purpose`, `Dates`, `Document`, `Status`, `Reviewed By`.
- **Finding:** There is currently **no action or button to generate or download a prefilled physical leave note PDF** upon approval. The only document download button is for the student's *own uploaded supporting attachment*.

### 1.2 HOD Leave Portal (`src/hod/pages/HODLeaveList.tsx` & `src/hod/pages/HODLeaveDetail.tsx`)
- HODs see all leave requests belonging to their assigned department (`department_id`).
- Real-time stat cards compute counts for `Pending`, `Approved`, `Rejected`, and `Total`.
- In `HODLeaveDetail.tsx`:
  - Displays student details (Name, USN, Department, Email).
  - Displays academic profile (Semester, CGPA).
  - Displays leave duration (Start Date, End Date, Calculated Days) and Reason.
  - Allows HOD to download the student's supporting document if attached.
  - Provides "Approve Leave Request" and "Reject Leave Request" modals.
  - Rejection requires entering a mandatory rejection reason.
  - Approval does not currently capture approval remarks.

### 1.3 Leave Service Layer (`src/services/leaveService.ts`)
- `getStudentLeaveRequests()`: Fetches leave requests where `student_id = auth.uid()` ordered by `created_at DESC`.
- `getDepartmentLeaveRequests()`: Enforces that HOD has an assigned department and fetches requests matching `department_id`.
- `getLeaveRequestById(idOrUuid)`: Fetches a single request by UUID or reference ID (`LV-xxx`). Enforces department scoping if caller is an HOD.
- `submitLeaveRequest(payload)`:
  1. Resolves caller's profile and `department_id`.
  2. Resolves the active department HOD via RPC `get_department_hod` or query on `profiles`.
  3. Uploads optional supporting file to `student-documents/{student_id}/leave-requests/{leave_id}/{file_name}`.
  4. Inserts into `public.leave_requests` with `status: 'PENDING'`.
  5. Inserts metadata into `public.leave_attachments` (if a file was provided).
  6. Dispatches in-app notification to the HOD.
- `approveLeaveRequest(referenceOrId)`:
  - Invokes RPC `public.review_leave_request(p_leave_id, 'APPROVED', null)`.
  - Fallback to direct table `UPDATE` if RPC fails.
  - Dispatches approval notification to student.
- `rejectLeaveRequest(referenceOrId, _reviewedBy, remark)`:
  - Invokes RPC `public.review_leave_request(p_leave_id, 'REJECTED', cleanRemark)`.
  - Dispatches rejection notification with reason to student.

### 1.4 Database Schema & Migrations
- `public.leave_requests` (created in `00004_academic_workflows.sql`, altered in `00008`, `00009`, `00013`):
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `reference_id TEXT NOT NULL UNIQUE DEFAULT ('LV-' || LPAD(nextval('leave_ref_seq')::text, 3, '0'))`
  - `student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`
  - `department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE`
  - `hod_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`
  - `leave_type TEXT NOT NULL`
  - `reason TEXT NOT NULL`
  - `start_date DATE NOT NULL`
  - `end_date DATE NOT NULL`
  - `status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))`
  - `reviewed_by UUID REFERENCES auth.users(id)`
  - `reviewed_at TIMESTAMPTZ`
  - `rejection_reason TEXT`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `supporting_doc_path TEXT`
  - `supporting_doc_name TEXT`
  - `supporting_doc_size BIGINT`
  - `supporting_doc_type TEXT`
- `public.student_profiles` (`00006_student_profiles_and_department_rls.sql`):
  - `profile_id UUID NOT NULL REFERENCES public.profiles(id)`
  - `phone TEXT`, `date_of_birth DATE`, `gender TEXT`
  - `address TEXT`, `city TEXT`, `state TEXT`, `pincode TEXT`
  - `parent_name TEXT`, `parent_phone TEXT`
  - `semester INT`, `academic_year TEXT`, `cgpa NUMERIC`
- `public.departments` (`00003_departments.sql`): `id`, `name`, `code`, `status`.
- `public.notifications` (`00004_academic_workflows.sql`): In-app notification queue.

### 1.5 Edge Functions & Existing PDF Capabilities
- Checked `supabase/functions/`: Existing functions are `admin-provision-user`, `ai-chat`, `github-api`, `github-oauth`, `identifier-login`, `ingest-document`, and `local-llm-analyze`.
- **Finding:** No leave-related or PDF generation Edge Function currently exists.
- Checked `package.json`: No client-side PDF generation library (such as `jspdf`, `pdf-lib`, `@react-pdf/renderer`) is currently installed.

---

## 2. Exact Field-to-Database Mapping

The supplied physical AIET leave note format is a standardized one-page institutional document. The table below maps every field in the physical leave note to its corresponding AIET-UniSphere data source:

| Physical Leave Form Field | Existing In `leave_requests`? | Existing In Student Profile / Related Table? | Dynamic vs. Submission Snapshot | Status / Finding |
|---|:---:|---|:---:|---|
| **1. Student Name** | No (only `student_id`) | Yes: `public.profiles.full_name` | **Dynamic** (joined via `student_id`) | Exists dynamically; changes to profile retroactively alter past leaves. |
| **2. Branch (Department)** | `department_id` stored | Yes: `public.departments.name` | **Hybrid** (`department_id` snapshotted, `name` joined dynamically) | Exists; department ID is pinned to the request. |
| **3. USN** | No | Yes: `public.profiles.usn_or_employee_id` | **Dynamic** (joined via `student_id`) | Exists dynamically in profile. |
| **4. Year / Semester** | No | Yes: `student_profiles.academic_year` & `student_profiles.semester` | **Dynamic** (queried from `student_profiles`) | Exists dynamically, but if student progresses from Sem 3 to Sem 4, past leave notes will display updated semester unless snapshotted. |
| **5. Section** | **No** | **No** (not in `profiles` or `student_profiles`) | **MISSING** | **Defect / Schema Gap**: `section` exists in timetable and course enrollments, but is NOT stored in `student_profiles` or `leave_requests`. |
| **6. Student Mobile Number** | No | Yes: `public.student_profiles.phone` | **Dynamic** (queried from `student_profiles`) | Exists dynamically (optional/nullable in student profile). |
| **7. Parent Mobile Number** | No | Yes: `public.student_profiles.parent_phone` | **Dynamic** (queried from `student_profiles`) | Exists dynamically (optional/nullable in student profile). |
| **8. Leave From & To Dates** | **Yes**: `start_date`, `end_date` | N/A | **Snapshot** (stored directly on `leave_requests`) | Fully intact. |
| **9. Number of Days** | No (computed) | N/A | **Dynamic Calculation** (`end_date - start_date + 1`) | Calculated dynamically; consistent across frontend and services. |
| **10. Reason** | **Yes**: `reason` | N/A | **Snapshot** (stored directly on `leave_requests`) | Fully intact. |
| **11. Application Date** | **Yes**: `created_at` | N/A | **Snapshot** (`TIMESTAMPTZ`) | Fully intact. |
| **12. Student Signature** | No | No | Physical document element | **Intentionally Blank** for manual physical signing. |
| **13. Mentor Remarks & Signature** | No | No | Physical document element | **Intentionally Blank** (no mentor system in AIET-UniSphere). |
| **14. Class Coordinator Remarks & Sign** | No | No | Physical document element | **Intentionally Blank** (physical review section). |
| **15. HOD Remarks & Signature** | Partial (`rejection_reason` only) | No | N/A | **Schema Gap**: An approved request has NO `approval_remarks` or `hod_remarks` column; `review_leave_request` sets remarks to NULL on approval. |
| **16. Principal / AO Remarks & Sign** | No | No | Physical document element | **Intentionally Blank** (physical administrative signing). |
| **17. SWO / Warden Remarks & Sign** | No | No | Physical document element | **Intentionally Blank** (physical hostel signing). |

---

## 3. HOD Approval & Authorization Analysis

### 3.1 Approval Execution & State Recording
- Executed via RPC [`public.review_leave_request`](file:///c:/Users/Mahesh%20M/Projects/AIET-UniSphere/supabase/migrations/00009_review_leave_request_rpc.sql#L5-L100).
- Sets `status = 'APPROVED'`, `reviewed_by = auth.uid()`, and `reviewed_at = NOW()`.
- Idempotency guard: If `status <> 'PENDING'`, rejects modification (`'This leave request has already been reviewed'`).

### 3.2 Department Routing & Cross-Department Security
- **Student Department Identification:** When submitting, `studentProfile.department_id` is queried from `public.profiles`. The request is bound to `leave_requests.department_id`.
- **HOD Verification:** The RPC explicitly enforces:
  ```sql
  IF v_caller_role = 'HOD' AND (v_caller_dept_id IS NULL OR v_leave.department_id <> v_caller_dept_id) THEN
    RAISE EXCEPTION 'ACCESS DENIED: You are only authorized to review leave requests for your department.';
  END IF;
  ```
- **RLS Boundary:** `public.leave_requests` RLS `UPDATE` policy enforces that HODs can only update requests matching their own department.
- **Cross-Department HOD Access:** Strictly blocked at both the RLS and RPC layers.

### 3.3 Download Authorization Rules
When the leave note PDF download is introduced, the system must enforce:
1. **Status Barrier:** The PDF can **ONLY** be downloaded if `status === 'APPROVED'`. Pending and Rejected requests must not allow PDF generation.
2. **Student Identity Isolation:** A student can **ONLY** download their own approved leave note (`student_id === auth.uid()`). Cross-student downloads must be blocked.
3. **Staff Scope:** The student's department HOD and system Administrators may also generate/view the approved leave note. Unassigned faculty and cross-department HODs are blocked.

---

## 4. PDF Design Feasibility & Institutional Layout

### 4.1 Recommended PDF Engine: Client-Side Vector Generation
- **Recommendation:** Integrate `jspdf` (or lightweight vector PDF generator).
- **Justification:**
  - Zero server overhead or Chromium execution costs.
  - Native client-side download triggered instantly in the browser.
  - Deterministic vector typography, lines, tables, and borders matching standard A4 dimensions ($210 \times 297\text{ mm}$).
  - Fully compatible with React 19, Vite, and existing bundle configurations.

### 4.2 Reproduction of the Physical Form (One-Page Strict Layout)
The generated PDF will reproduce the exact visual structure of the original AIET Leave Application Form:
1. **Institutional Header Block:**
   - College Title: **ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY**
   - Sub-header: *Recognized by AICTE, Affiliated to VTU Belagavi*
   - Location: *Shobhavana Campus, Mijar, Moodbidri, D.K. - 574225*
   - Document Title Banner: **APPLICATION FOR LEAVE (STUDENT)**
2. **Reference & Date Sub-header:**
   - Left: Reference ID (e.g., `LV-104`).
   - Right: Application Date & Approval Date.
3. **Student & Academic Detail Boxed Grid:**
   - Row 1: Name of the Student | USN | Branch
   - Row 2: Academic Year & Semester | Section | Student Mobile
   - Row 3: Parent Mobile No. | Category / Nature of Leave
   - Row 4: Period of Leave (From Date $\to$ To Date) | Total Number of Days
   - Row 5: Purpose / Reason for Leave (full narrative block)
4. **Physical Review & Signatures Section (3-Column Layout):**
   - **Column 1: Student & Mentor:**
     - Student Signature (Blank line for physical signing)
     - Mentor Remarks & Signature (Blank box with date line)
   - **Column 2: Class Coordinator & Warden:**
     - Class Coordinator Remarks & Signature (Blank box with date line)
     - SWO / Hostel Warden Remarks & Signature (Blank box with date line)
   - **Column 3: Head of the Department (HOD) Digital Endorsement:**
     - Department Name & Approval Status (`APPROVED`)
     - Reviewing HOD Full Name & Employee ID / Profile ID
     - Timestamp of Digital Approval
     - **Demonstration Graphics:**
       - Fictional sample HOD digital signature illustration.
       - Fictional circular department endorsement stamp.
       - Prominent watermarked text across stamp:  
         `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL`
   - **Bottom Box: Principal / Administrative Officer:**
     - Final Sanction / Principal Remarks & Signature (Blank box for physical institutional submission)
5. **Footer Notes & Instructions:**
   - Notes explaining VTU attendance regulations (85% minimum attendance rule).
   - Instruction to submit the approved physical copy to the department office upon return.

---

## 5. Security & Data Integrity Risks

### 5.1 Historical Data Drift (Lack of Submission-Time Snapshot)
- **Current Vulnerability:** If a student applies for leave during Semester 3, and later updates their profile in Semester 4, generating the leave note dynamically for the Semester 3 request would fetch Semester 4 from `student_profiles`.
- **Similarly:** If the student changes their contact number or parent phone number, the historical document reflects the new number rather than the number at the time of leave application.
- **Risk Mitigation:**
  - Introduce submission-time snapshot columns on `public.leave_requests` (or a `snapshot_data JSONB` column).
  - Snapshot at submission: `student_name`, `usn`, `department_name`, `semester`, `section`, `student_phone`, `parent_phone`.
  - Snapshot at approval: `reviewer_name`, `reviewed_at`, `hod_remarks`.

### 5.2 Missing Section Information
- **Current Vulnerability:** As confirmed in Task 2, `section` is not stored in `student_profiles` or `leave_requests`.
- **Risk Mitigation:**
  - Allow the student to specify their current section (`A`, `B`, `C`, etc.) on the leave application form modal.
  - Store this section directly on `leave_requests` as part of the submission snapshot.

### 5.3 Missing HOD Approval Remarks
- **Current Vulnerability:** Migration 00009 only stores `rejection_reason` on `REJECTED`. For `APPROVED`, any remarks entered by HOD are lost because `review_leave_request` does not accept approval remarks.
- **Risk Mitigation:**
  - Add an optional `approval_remarks` (or general `remarks`) column on `leave_requests`.
  - Update `review_leave_request` RPC to record `p_remarks`.

### 5.4 Document Forgery & Digital Stamp Controls
- **Requirement:** As explicitly instructed by the owner, digital signature graphics and department seals must be **clearly fictional demonstrations** carrying explicit `SAMPLE / DEMO` markings and `NOT AN OFFICIAL SIGNATURE OR SEAL` watermarks to prevent counterfeit official credentials.

---

## 6. Comprehensive Test Plan

A dedicated test suite (`tests/leave_note_pdf_generation.test.mjs`) must verify:

| Test Case | Scenario / Assertion | Expected Result |
|---|---|---|
| **1. Approved Request Generation** | Student requests PDF for `status === 'APPROVED'`. | Successfully generates valid one-page PDF blob. |
| **2. Pending Request Denial** | Student or caller requests PDF for `status === 'PENDING'`. | **BLOCKED**: Throws error `Leave note PDF is only available for approved requests.` |
| **3. Rejected Request Denial** | Student requests PDF for `status === 'REJECTED'`. | **BLOCKED**: Throws error `Leave note PDF is only available for approved requests.` |
| **4. Cross-Student Access Denial** | Student A attempts to download leave note for Student B's approved leave. | **BLOCKED**: Denied by RLS and client authorization guard. |
| **5. Cross-Department HOD Denial** | HOD from Department X attempts to view or download leave note for Department Y. | **BLOCKED**: Denied by RLS and department scoping checks. |
| **6. Number-of-Days Calculation** | Test single day (`2026-11-10` to `2026-11-10`) and multi-day (`2026-11-10` to `2026-11-12`). | Accurately returns 1 day and 3 days (inclusive). |
| **7. Missing Optional Fields Fallback** | Student profile lacks phone or parent phone; section is null. | Renders clean dash/blank (`—`) without `undefined`, `NaN`, or document crash. |
| **8. One-Page Layout Bounds** | Generates PDF with maximum character reason narrative. | Text wraps cleanly inside boxed area; strictly stays on Page 1 ($297\text{ mm}$ height). |
| **9. Watermark & Demo Markings** | Inspects PDF structure and visual elements. | Contains mandatory `SAMPLE / DEMO` and `NOT AN OFFICIAL SIGNATURE OR SEAL` watermarks. |

---

## 7. Recommended Implementation Sequence (Mission 09.2)

1. **Phase 1: Database Migration (`00041_leave_note_snapshots_and_remarks.sql`)**
   - Add columns to `public.leave_requests`:
     - `section TEXT DEFAULT NULL`
     - `student_phone TEXT DEFAULT NULL`
     - `parent_phone TEXT DEFAULT NULL`
     - `semester INT DEFAULT NULL`
     - `approval_remarks TEXT DEFAULT NULL`
   - Update `review_leave_request` RPC to accept optional `p_approval_remarks` and persist it.
2. **Phase 2: Leave Service Enhancement (`src/services/leaveService.ts`)**
   - Update `submitLeaveRequest` to accept `section`, `studentPhone`, and `parentPhone` and snapshot them during `INSERT`.
   - Update `approveLeaveRequest` to accept optional `remarks`.
3. **Phase 3: PDF Generation Engine (`src/utils/leaveNotePdfGenerator.ts`)**
   - Add `jspdf` dependency.
   - Implement `generateLeaveNotePdf(leaveData)` conforming to the exact physical AIET form layout, one-page bounding box, and sample stamp markings.
4. **Phase 4: UI Integration**
   - In `src/pages/LeaveRequestsPage.tsx`:
     - Add `Section`, `Student Phone`, and `Parent Phone` fields to the "Apply for Leave" modal (prefilled from profile where available).
     - Add a "Download Leave Note" button with a PDF icon on approved leave rows.
   - In `src/hod/pages/HODLeaveDetail.tsx`:
     - Add optional remarks field to the "Approve Leave Request" modal.
     - Add a "Download Leave Note PDF" button for approved requests.
5. **Phase 5: Automated Verification & Quality Gates**
   - Run unit tests, real PostgreSQL tests, TypeScript typecheck, linter, and build.

---

## 8. Final Verdict

CONDITIONALLY READY.

**Justification:**  
The existing leave request workflow, database relations, HOD routing, and RLS policies are fully functional and secure. However, implementation of the physical AIET leave note PDF requires resolving three prerequisite gaps:
1. Capturing and snapshotting missing fields (`section`, `student_phone`, `parent_phone`, and `semester`) at submission time to prevent data loss and historical drift.
2. Adding an `approval_remarks` column to retain HOD remarks upon approval.
3. Installing a lightweight client-side PDF generation library (e.g. `jspdf`).

Once these prerequisites are addressed in the planned implementation mission (Mission 09.2), the system will be 100% ready for physical leave note generation.

