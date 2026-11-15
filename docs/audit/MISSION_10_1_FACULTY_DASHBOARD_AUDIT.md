# MISSION 10.1 — FACULTY DASHBOARD COMPLETE FUNCTIONAL AUDIT REPORT

**Project:** AIET-UniSphere  
**Environment:** React 18 + TypeScript + Vite + Supabase  
**Audit Phase:** Mission 10.1 — Comprehensive Read-Only Functional Audit  
**Date:** 2026-11-10  
**Audit Mode:** STRICTLY READ-ONLY (No application code modified, no migrations executed, no git push)  
**Evaluated Target:** Complete Faculty Portal (`src/faculty/`, `src/services/facultyService.ts`, Edge Functions, and Database Contracts)  
**Host Platform:** PostgreSQL 17.6.1 (`eddsaafwwmtfnjukxamx.supabase.co`, region `ap-south-1`)  
**Supabase CLI Version:** `3.1.0`

---

## 1. Executive Summary

A comprehensive, strictly read-only forensic audit of the AIET-UniSphere Faculty Dashboard and associated faculty portal workflows was conducted. The audit analyzed user interfaces, state management, Supabase database schemas, Row-Level Security (RLS) policies, Storage access, Edge Functions, mock data usage, and test coverage.

### 1.1 Core Audit Conclusions
1. **Core Academic Management is Robust:**  
   Primary teaching workflows—including course material uploads/downloads (`FacultyCourseDetail`), multi-day attendance marking and historical atomic corrections (`FacultyAttendancePage`), faculty timetable scheduling (`FacultyTimetablePage`), coursework assignment creation, deadline tracking, and grading (`FacultyAssignmentList`, `FacultyAssignmentDetail`, `GradeSubmissionModal`), and online assessment/quiz authoring and attempt evaluation (`FacultyAssessmentList`, `FacultyAssessmentDetail`)—are implemented with real Supabase database connections and department-level security guards.
2. **Critical Functional Gaps Identified:**  
   The audit confirmed the presence of four significant deficiencies highlighted by the platform owner:
   - **Gap 1: Announcement Attachment Downloads:** The Faculty Announcements page (`FacultyAnnouncementPage.tsx`) loads notices from Supabase, but completely omits attachment metadata, file icons, and download triggers from both the listing cards and the detail modal. Faculty members cannot view or download circular attachments.
   - **Gap 2: AI Assistant Course Context Disconnection:** In `FacultyAIAssistantPage.tsx`, the `courseContexts` state is permanently hardcoded to `['All Courses']` and is never populated with the faculty member's actual assigned teaching subjects. Furthermore, the backend `ai-chat` Edge Function retrieves minimal faculty context (only teaching course names and schedule) without querying pending student submissions, assignments, or low-attendance alerts.
   - **Gap 3: Static / Hardcoded Faculty Profile Designation:** There is **no `designation` column** in the PostgreSQL `public.profiles` database schema. `FacultyProfilePage.tsx` displays static hardcoded JSX text (`"Assistant / Associate Professor"`), and `facultyService.ts` attempts to read an unselected `data.designation` property that always evaluates to undefined.
   - **Gap 4: Project Mentoring Completely Absent from Faculty Portal:** While the database schema (`public.user_projects`) includes a `faculty_mentor TEXT` column and permits faculty access via RLS, **no route, navigation item, or UI view exists** in the Faculty Portal for project mentoring. Faculty members assigned as mentors have no interface to inspect, review, or evaluate mentored student projects.
   - **Gap 5: Un-wired Placeholder Header Search:** The global search bar in `FacultyAppShell.tsx` is an inert HTML `<input>` with no state bindings, event listeners, or search routing.
3. **Pending Remote Migration Prerequisite:**  
   As established in Mission 09.3, migrations `00037` through `00042` have not yet been applied to the remote Supabase production database. Consequently, live production faculty attendance corrections (`00040`) and granular storage download policies (`00038`, `00039`) will fail until remote deployment is completed.

---

## 2. Complete Faculty Feature Inventory

The Faculty Portal encompasses 15 active routes and 11 specialized modal/view components:

| # | Route Path | Component | Purpose & Scope |
| :-: | :--- | :--- | :--- |
| **1** | `/faculty/dashboard` | `FacultyDashboard.tsx` | Main landing hub: 6 KPI stat cards, today's class schedule, pending evaluation action items, student academic alerts, quick actions, and recent activity log. |
| **2** | `/faculty/courses` | `FacultyCoursesList.tsx` | Dual-tab directory: Academic curriculum subjects and External Learning MOOC certification assignments/rosters. |
| **3** | `/faculty/courses/:id` | `FacultyCourseDetail.tsx` | Multi-tab course manager: Overview metrics, learning materials/modules, student roster, assignments, and attendance logs. |
| **4** | `/faculty/students` | `FacultyStudentList.tsx` | Department student directory with multi-criteria filters (Search, Semester, Academic Status, Attendance threshold). |
| **5** | `/faculty/students/:id` | `FacultyStudentDetail.tsx` | Student academic profile: Personal info, overall attendance, course performance grid, academic warning status. |
| **6** | `/faculty/attendance` | `FacultyAttendancePage.tsx` | Daily attendance session marking, batch student status toggle, and session correction ledger with reason tracking. |
| **7** | `/faculty/timetable` | `FacultyTimetablePage.tsx` | Interactive weekly timetable grid displaying assigned lecture slots, rooms, and laboratory sessions. |
| **8** | `/faculty/assignments` | `FacultyAssignmentList.tsx` | Coursework assignment management with status filtering (`All`, `Active`, `Pending`, `Closed`, `Draft`). |
| **9** | `/faculty/assignments/:id` | `FacultyAssignmentDetail.tsx` | Assignment details, file attachments preview/download, and student submission evaluation grid. |
| **10** | `/faculty/assessments` | `FacultyAssessmentList.tsx` | Internal examination and quiz list with status filters (`Upcoming`, `Active`, `Completed`, `Graded`). |
| **11** | `/faculty/assessments/:id` | `FacultyAssessmentDetail.tsx` | Assessment management: Question authoring, quiz status toggling, and individual student attempt scoring review. |
| **12** | `/faculty/announcements` | `FacultyAnnouncementPage.tsx` | Department and campus circulars viewer with category and read/unread status filtering. |
| **13** | `/faculty/ai-assistant` | `FacultyAIAssistantPage.tsx` | Faculty academic assistant chat interface with intent classification, conversation history, and course context filter. |
| **14** | `/faculty/profile` | `FacultyProfilePage.tsx` | Faculty identity card, profile avatar photo upload, and employee credential display. |
| **15** | `/faculty/notifications` | `FacultyNotificationsPage.tsx` | Real-time alerts, system messages, notification filtering, mark as read, and bulk deletion. |
| **16** | *None* (Missing) | *None* (`FacultyProjectsPage.tsx`) | **MISSING:** Project mentoring, student capstone tracking, repository inspection, and milestone reviews. |

---

## 3. Feature-by-Feature Status & Deep-Dive Audit

### 3.1 Faculty Dashboard (`/faculty/dashboard`)
- **UI & Connectivity:** Real Supabase connection via `getFacultyDashboardData()`. Displays 6 `StatCard` widgets (`My Courses`, `Total Students`, `Today's Classes`, `Pending Evaluations`, `Active Assignments`, `Attendance Alerts`).
- **Data Integrity:** Dynamically aggregates active assignments, today's timetable sessions from `timetable_entries`, student enrollments from `course_enrollments`, and low attendance alerts from `student_analytics_view`.
- **States:** Comprehensive loading skeleton (`skeleton-loader`) and error banner with retry trigger.
- **Defects / Findings:**
  - `stats.attendanceAlertsCount` correctly filters students with conducted sessions (> 0) and attendance < 75%.
  - Dashboard greeting subtitle displays `{deptDisplayName} · Faculty`. The role designation is hardcoded to `'Faculty'` rather than reading a specific title.

### 3.2 Academic Courses & Course Detail (`/faculty/courses`, `/faculty/courses/:id`)
- **UI & Connectivity:** Fully connected via `getFacultyCourses()`, `getFacultyCourseById()`, and `getCourseMaterials()`.
- **Material Management:** Supports PDF/document uploads to `academic-materials` bucket with module categorization, edit title/module, download signed URL generation, and delete.
- **Security:** RLS enforces that faculty can only manage course materials for courses they are actively assigned to teach.
- **States:** Loading spinner, error messages, and empty states for courses and materials.

### 3.3 Student Directory & Student Academic Profile (`/faculty/students`, `/faculty/students/:id`)
- **UI & Connectivity:** Connected via `getAllStudents()` and `getStudentFullProfile(id)`.
- **Department Boundary Guard:** In `FacultyStudentDetail.tsx:98-106`, an explicit client-side authorization check ensures faculty cannot inspect students from outside their assigned department:
  ```ts
  if (callerProfile?.role === 'FACULTY') {
    if (callerProfile.department_id && prof.department_id && callerProfile.department_id !== prof.department_id) {
      setUnauthorized(true);
      return;
    }
  }
  ```
- **Performance Grid:** Calculates attendance rate, assignment completion count, and assessment averages per course for the selected student.

### 3.4 Attendance Marking & Correction Ledger (`/faculty/attendance`)
- **UI & Connectivity:** Fully integrated with `attendance_sessions` and `attendance_records`.
- **Atomic Correction Integration:** Implements the `correctStudentAttendance` method which calls PostgreSQL RPC `correct_attendance_record_atomic(p_record_id, p_new_status, p_reason)`.
- **Audit History:** Reads from `attendance_corrections` table, joins with `profiles` to resolve the faculty corrector name, and renders an immutable audit trail.
- **Dependency Note:** Requires remote migration `00040` to be applied to remote production database.

### 3.5 Assignment Management & Grading (`/faculty/assignments`, `/faculty/assignments/:id`)
- **UI & Connectivity:** Connected via `getFacultyAssignments()` and `getSubmissionsForAssignment()`.
- **Evaluation Workflow:** Opening `GradeSubmissionModal.tsx` allows entering marks, maximum marks validation, constructive feedback, and updates `assignment_submissions` status to `'Graded'`.
- **File Handling:** Correctly implements `getAssignmentFileUrl`, `downloadAssignmentFile`, `getSubmissionFileUrl`, and `downloadSubmissionFile`.

### 3.6 Assessment Management & Quiz Builder (`/faculty/assessments`, `/faculty/assessments/:id`)
- **UI & Connectivity:** Connected to `assessments`, `assessment_questions`, and `assessment_attempts`.
- **Question Authoring:** Faculty can create/edit multiple choice questions, set options (A-D), specify topics, and set correct answer keys.
- **Lifecycle Management:** Supports publishing, unpublishing, opening, and closing assessments.
- **Attempt Review:** Modal reviews student quiz answers, highlighting correct/incorrect choices and calculating percentage scores.

### 3.7 Faculty Announcements (`/faculty/announcements`) — *DEFECT IDENTIFIED*
- **Current Behavior:** Calls `getDepartmentAnnouncements(profile.department_id)` and filters for announcements targeted to `'Faculty'` or `'Students + Faculty'`.
- **CRITICAL DEFECT — Missing Attachment UI:**
  - In `FacultyAnnouncementPage.tsx:185-246`, the announcement card renders `title`, `category`, `content`, `createdBy`, `targetAudience`, and `publishedAt`. It **does not display** any attachment pill or paperclip icon even when `anc.attachmentPath` is present.
  - In `FacultyAnnouncementPage.tsx:252-295`, the Announcement Detail Modal renders text content and author information. It **completely lacks** any download button, file name display, file size badge, or trigger for `downloadAnnouncementAttachment()`.
  - Contrast with Student Portal: In `src/pages/AnnouncementsPage.tsx` and `src/pages/AnnouncementDetail.tsx`, attachments are prominently displayed with file size and an interactive `downloadAnnouncementAttachment` button.
  - **Verdict:** Faculty members are blocked from accessing files attached to official departmental and administrative circulars.

### 3.8 Faculty AI Assistant (`/faculty/ai-assistant`) — *DEFECT IDENTIFIED*
- **Current Behavior:** Connects to `ai-chat` Supabase Edge Function via `sendMessage()` in `aiService.ts`. Manages conversation history in `ai_conversations` and messages in `ai_messages`.
- **CRITICAL DEFECT — Static Course Context Selector:**
  - In `FacultyAIAssistantPage.tsx:36`:
    ```tsx
    const [courseContexts, setCourseContexts] = useState<string[]>(['All Courses']);
    ```
    The `setCourseContexts` updater is **never called anywhere in the component**.
  - The component never queries `getFacultyCourses()` or `course_enrollments` to fetch the courses taught by the faculty member.
  - As a result, the `CourseContextSelector` dropdown displays only `'All Courses'`. Faculty members cannot narrow the assistant's context to a specific course (e.g. "Database Management Systems").
- **Backend Edge Function Limitations (`_shared/ai/context.ts`):**
  - In `buildUserAcademicContext`, when `role === 'FACULTY'`, the function queries only:
    1. Distinct `course_name` from `course_enrollments` where `faculty_id = user.id`.
    2. Teaching schedule from `timetable_entries`.
  - It **fails to query**:
    - Faculty assignments and deadlines (`assignments`).
    - Pending student submissions count (`assignment_submissions`).
    - Low-attendance student lists or alerts for the faculty member's classes.
    - Conducted attendance statistics.
  - Result: Faculty AI responses cannot accurately answer quick-action prompts such as *"Show assignments and assessments pending evaluation in my courses"* or *"Show attendance overview for my teaching courses and identify students with attendance shortages"*.

### 3.9 Faculty Profile (`/faculty/profile`) — *DEFECT IDENTIFIED*
- **Current Behavior:** Displays faculty name, official email, employee ID, department, account status, and member since date. Supports profile photo upload to the `avatars` bucket via `uploadAvatar()`.
- **CRITICAL DEFECT — Hardcoded Designation & Missing Database Column:**
  - In `FacultyProfilePage.tsx:288-294`:
    ```tsx
    <label>Academic Designation</label>
    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
      Assistant / Associate Professor
    </div>
    ```
    The designation is hardcoded static JSX text.
  - In `src/faculty/services/facultyService.ts:31-55`:
    ```ts
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, department:departments(name)')
      .eq('id', user.id)
      .single();
    ...
    title: data.designation || 'Faculty Member'
    ```
    `designation` is not included in the `.select()` query string.
  - In PostgreSQL Database Schema: Forensic inspection across all 42 migration files confirmed that **no `designation` column exists** on `public.profiles`, and no `faculty_profiles` table exists.
  - **Verdict:** Dynamic faculty designation cannot function until a database schema migration adds the column and the application services and UI are updated to bind to it.

### 3.10 Project Mentoring — *FEATURE COMPLETELY ABSENT*
- **Database Baseline:**
  - `public.user_projects` contains `faculty_mentor TEXT` (stored as plain text entered during project creation in `CreateProjectModal.tsx`).
  - Table RLS policy allows `public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')` to view all projects.
- **CRITICAL DEFECT — Zero UI Representation in Faculty Portal:**
  - `FacultyAppShell.tsx`: No "Projects" or "Mentoring" link in navigation.
  - `src/App.tsx`: No `/faculty/projects` route defined.
  - `src/faculty/pages/`: No `FacultyProjectsPage.tsx` or mentoring component exists.
  - `FacultyStudentDetail.tsx`: Does not display projects belonging to the student.
  - `FacultyDashboard.tsx`: Does not track mentored project counts or pending milestone approvals.
  - **Verdict:** Faculty members assigned as mentors have no portal capabilities to mentor students, review project milestones, or inspect connected GitHub repositories.

### 3.11 Global Header Search Bar — *PLACEHOLDER DEFECT*
- In `FacultyAppShell.tsx:306-312`:
  ```tsx
  <input 
    type="text" 
    className="header-search-input" 
    placeholder="Search courses, students..." 
    aria-label="Global search input"
  />
  ```
  The header search bar has no `value`, no `onChange`, and no `onKeyDown` handler. It is purely decorative.

---

## 4. Backend and Database Dependencies

### 4.1 Database Tables & Views Utilized by Faculty Portal
| Database Object | Mode | RLS Enforcement | Primary Accessing File |
| :--- | :---: | :--- | :--- |
| `public.profiles` | READ | Users view own profile; faculty view department profiles | `facultyService.ts`, `FacultyProfilePage.tsx` |
| `public.departments` | READ | Authenticated read | `facultyService.ts` |
| `public.course_enrollments` | READ | Scoped to `faculty_id = auth.uid()` | `courseService.ts`, `facultyService.ts` |
| `public.attendance_sessions` | READ/WRITE | Scoped to `faculty_id = auth.uid()` | `attendanceService.ts` |
| `public.attendance_records` | READ/WRITE | Session faculty access | `attendanceService.ts` |
| `public.attendance_corrections` | READ/WRITE | RPC-backed insertion; faculty viewable | `attendanceService.ts` |
| `public.timetable_entries` | READ | Scoped to `faculty_id = auth.uid()` | `timetableService.ts` |
| `public.assignments` | READ/WRITE | Scoped to `created_by = auth.uid()` | `assignmentService.ts` |
| `public.assignment_submissions` | READ/WRITE | Evaluated by assignment creator | `assignmentService.ts` |
| `public.assessments` | READ/WRITE | Scoped to `created_by = auth.uid()` | `assessmentService.ts` |
| `public.assessment_questions` | READ/WRITE | Assessment creator access | `assessmentService.ts` |
| `public.assessment_attempts` | READ | Assessment creator access | `assessmentService.ts` |
| `public.announcements` | READ | Department and campus audience check | `announcementService.ts` |
| `public.announcement_reads` | READ/WRITE | Scoped to `user_id = auth.uid()` | `announcementService.ts` |
| `public.academic_materials` | READ/WRITE | Assigned teaching faculty access | `courseService.ts` |
| `public.external_learning_courses` | READ/WRITE | Department faculty access | `externalLearningService.ts` |
| `public.external_course_assignments` | READ/WRITE | Scoped to `assigned_by = auth.uid()` | `externalLearningService.ts` |
| `public.external_course_evidence` | READ/WRITE | Verification queue reviewer | `externalLearningService.ts` |
| `public.ai_conversations` | READ/WRITE | Scoped to `user_id = auth.uid()` | `aiService.ts` |
| `public.ai_messages` | READ/WRITE | Scoped to `user_id = auth.uid()` | `aiService.ts` |
| `public.notifications` | READ/WRITE | Scoped to `user_id = auth.uid()` | `notificationService.ts` |
| `public.student_analytics_view` | READ | Filtered by department / course students | `facultyService.ts` |
| `public.user_projects` | **UNCONNECTED** | Permitted by RLS, but unused in faculty UI | *None* |

### 4.2 Storage Buckets Utilized
| Bucket | Operations | RLS Status | Verified Status |
| :--- | :--- | :--- | :--- |
| `avatars` | Upload, Read Signed URL | Allowed for own avatar (`auth.uid()`) | Operational |
| `academic-materials` | Upload, Read, Delete | Assigned course instructor check (`00039`) | Codebase ready, pending remote migration |
| `assignments` | Upload, Read, Download | Assignment creator / enrolled student | Operational |
| `submissions` | Read, Download | Assignment creator access | Operational |
| `announcements` | Read Signed URL | Published notice audience check (`00038`) | **Blocked in UI** (missing button) |

---

## 5. Security & Authorization Findings

1. **Strict Department Scoping Enforced in Student Inspection:**  
   In `FacultyStudentDetail.tsx`, faculty members cannot access student profiles belonging to other departments.
2. **Teaching Scope Enforced in Materials & Attendance:**  
   Materials upload (`UploadCourseMaterialModal.tsx`) and attendance session creation (`FacultyAttendancePage.tsx`) strictly filter by courses assigned to `auth.uid()`.
3. **Pending Remote Storage Security (Migration 00038 & 00039):**  
   Until migrations `00038` and `00039` are applied to the remote database, announcement attachments and course materials rely on broad department-level storage policies from `00013`. Applying `00038` and `00039` will harden storage access to verified published announcements and instructor assignments.
4. **Project Mentoring Data Model Weakness:**  
   In `user_projects`, `faculty_mentor` is a freeform `TEXT` column (e.g. `"Dr. Sneha Reddy"`) rather than a foreign key `UUID` referencing `public.profiles(id)`. This makes reliable query filtering (e.g. `WHERE faculty_mentor_id = auth.uid()`) brittle and prone to name mismatches.

---

## 6. Dummy Data, Hardcoded Values, and Placeholder Findings

| File | Line(s) | Finding | Severity |
| :--- | :---: | :--- | :---: |
| `src/faculty/components/FacultyAppShell.tsx` | 306–312 | Global search bar `<input placeholder="Search courses, students..." />` is an un-wired, inert placeholder. | Medium |
| `src/faculty/pages/FacultyProfilePage.tsx` | 288–294 | Academic Designation is hardcoded static JSX: `"Assistant / Associate Professor"`. | High |
| `src/faculty/pages/FacultyAIAssistantPage.tsx` | 36 | `courseContexts` initialized to `['All Courses']` and never updated with real courses. | High |
| `src/faculty/pages/FacultyAnnouncementPage.tsx` | 200–295 | Cards and Detail Modal completely omit attachment rendering and download actions. | High |
| `src/faculty/services/facultyService.ts` | 43–44, 53–54 | Hardcoded fallback defaults: `office: 'Not recorded'`, `academicYear: 'Not set'`. | Low |
| `src/faculty/data/mock/facultyDataMock.ts` | 1–51 | Unused mock file containing dummy classes, alerts, and pending work. | Low |
| `src/data/mock/facultyMock.ts` | 1–43 | Unused mock roster with dummy designations ("Professor & HOD", "Associate Professor"). | Low |

---

## 7. Missing Functionality Analysis (Deep Dive)

### 7.1 Announcement Attachment Downloads
- **Root Cause:** `FacultyAnnouncementPage.tsx` was built as a text-only notice reader. It imports `getDepartmentAnnouncements` but never imports `downloadAnnouncementAttachment` or `getAnnouncementAttachmentUrl` from `announcementService.ts`.
- **Required Solution:**
  1. Add attachment indicator (paperclip icon + file size pill) to announcement cards when `anc.attachmentPath` exists.
  2. In the detail modal, render an "Attached Documents" section showing the file name, file size, and an interactive "Download Attachment" button calling `downloadAnnouncementAttachment(selectedAnnouncement.attachmentPath, selectedAnnouncement.attachmentName, selectedAnnouncement.id)`.

### 7.2 AI Assistant Real Course Context
- **Root Cause:** `FacultyAIAssistantPage.tsx` loads conversations and quick actions, but fails to call `getFacultyCourses()` on mount.
- **Required Solution:**
  1. In `loadData()`, fetch `getFacultyCourses()`.
  2. Populate `courseContexts` with `['All Courses', ...courses.map(c => c.name)]`.
  3. In `supabase/functions/_shared/ai/context.ts`, enhance the `role === 'FACULTY'` branch to query:
     - Assignments created by this faculty (`assignments`).
     - Pending submissions count for those assignments (`assignment_submissions`).
     - Low-attendance alerts from `student_analytics_view`.

### 7.3 Dynamic Faculty Profile Designation
- **Root Cause:** PostgreSQL `public.profiles` has no `designation` column.
- **Required Solution:**
  1. Author a forward-only database migration:
     ```sql
     ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS designation TEXT DEFAULT 'Faculty Member';
     ```
  2. Update `getFacultyProfile` in `src/faculty/services/facultyService.ts` to include `designation` in `.select('id, full_name, email, designation, department:departments(name)')`.
  3. Update `FacultyProfilePage.tsx` to bind Academic Designation to `authProfile?.designation || 'Faculty Member'`.
  4. Update `FacultyDashboard.tsx` and `FacultyAppShell.tsx` to display the dynamic designation.

### 7.4 Project Mentoring Functionality
- **Root Cause:** The feature was never scoped into the Phase 6 Faculty Portal implementation, despite student project creation allowing mentor designation.
- **Required Solution:**
  1. Add a new route `/faculty/projects` in `src/App.tsx`.
  2. Add "Project Mentoring" entry under "Academic Management" in `FacultyAppShell.tsx`.
  3. Implement `FacultyProjectsPage.tsx`:
     - Display projects where `faculty_mentor` matches the faculty member's name or ID.
     - View team members, project type (`Capstone`, `Mini`, `Research`), milestone progress bar, and GitHub repo links.
     - Provide mentor review capabilities (leave mentor remarks, approve milestones).
  4. Add a "Projects" tab to `FacultyStudentDetail.tsx` displaying the student's personal and capstone projects.

---

## 8. Recommended Implementation Sequence

To resolve all audit findings without disrupting existing working features, the following phased sequence is recommended:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Dynamic Faculty Designation & Schema Extension                │
│  - Create migration 00043: ADD COLUMN designation to public.profiles   │
│  - Update facultyService.ts and bind FacultyProfilePage.tsx            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 2: Announcement Attachment Download Integration                  │
│  - Wire downloadAnnouncementAttachment into FacultyAnnouncementPage    │
│  - Add attachment pills to notice cards and detail modal               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 3: AI Assistant Course Context & Backend Context Enhancement     │
│  - Fetch getFacultyCourses() in FacultyAIAssistantPage.tsx             │
│  - Populate courseContexts dropdown dynamically                        │
│  - Enhance _shared/ai/context.ts for faculty academic queries          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 4: Project Mentoring Module Implementation                       │
│  - Add /faculty/projects route and FacultyProjectsPage.tsx             │
│  - Add "Project Mentoring" to FacultyAppShell navigation               │
│  - Display mentored projects, milestones, and student project cards    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 5: Header Search Wiring & Clean-up                               │
│  - Wire header search bar to navigate or open quick-jump palette       │
│  - Deprecate dead mock files in src/faculty/data/mock/                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Testing Requirements

### 9.1 Existing Test Coverage
Currently, the codebase contains only **4 faculty-specific test suites**:
- `tests/external_learning_faculty.test.mjs` (Verification queue and external course assignment)
- `tests/faculty_attendance_alert_integrity.test.mjs` (Low attendance alert calculation logic)
- `tests/faculty_attendance_correction.test.mjs` (Mock tests for correction RPC arguments)
- `tests/faculty_course_materials.test.mjs` (Uploading, listing, and downloading course materials)

### 9.2 Required Missing Test Coverage
Before and during remediation, the following new automated tests must be constructed:
1. `tests/faculty_announcement_attachments.test.mjs`:
   - Verify announcement card renders attachment badge when `attachmentPath` is present.
   - Verify modal download button triggers `downloadAnnouncementAttachment` with correct arguments.
   - Verify unauthenticated or cross-department download attempts are blocked.
2. `tests/faculty_ai_course_context.test.mjs`:
   - Verify `FacultyAIAssistantPage` loads assigned courses into `courseContexts`.
   - Verify selecting a course filters `sendMessage` payload with `courseContext`.
   - Verify backend intent builder attaches teaching assignments and low-attendance alerts.
3. `tests/faculty_profile_designation.test.mjs`:
   - Verify `getFacultyProfile` queries `designation` from `public.profiles`.
   - Verify `FacultyProfilePage` renders dynamic designation with fallback to `'Faculty Member'`.
4. `tests/faculty_project_mentoring.test.mjs`:
   - Verify faculty can list projects where they are assigned as mentor.
   - Verify faculty cannot alter non-mentored projects outside department permissions.
   - Verify student detail page displays student project cards.

---

## 10. Final GO / NO-GO Recommendation

### Audit Verdict: `NO-GO for Production Release as Fully Complete` / `GO for Remediation Implementation`

- **Explanation:**  
  While core grading, attendance, and course material systems are fully functional, the Faculty Portal **cannot be declared 100% complete** due to:
  1. The complete absence of announcement attachment downloading for faculty.
  2. The hardcoded, disconnected course context in the Faculty AI Assistant.
  3. The static, hardcoded faculty profile designation lacking database schema backing.
  4. The complete absence of the Project Mentoring feature in the faculty navigation and interface.
  5. The decorative, un-wired global search input in the shell header.

Remediation should proceed strictly according to the 5-phase implementation plan outlined in Section 8.

*(Audit completed in strict read-only mode. No application code, database records, or migrations were modified.)*

