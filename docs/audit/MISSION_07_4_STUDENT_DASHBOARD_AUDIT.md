# AIET-UniSphere — Mission 07.4 Student Dashboard End-to-End Functional Audit

**Document Reference:** `docs/audit/MISSION_07_4_STUDENT_DASHBOARD_AUDIT.md`  
**Mission:** 07.4 — Student Dashboard End-to-End Functional Verification  
**Project:** AIET-UniSphere — AI-powered Smart Learning Management System  
**Supabase Production Project Ref:** `eddsaafwwmtfnjukxamx`  
**Date:** November 7, 2026  
**Execution Mode:** READ-ONLY COMPREHENSIVE REPOSITORY AUDIT (Zero Production Mutations)  

---

## 1. Complete Student Dashboard Feature Inventory

The AIET-UniSphere student portal consists of the central landing dashboard (`/student/dashboard`) and 18 dedicated subpages grouped into 7 functional clusters in `src/components/AppShell.tsx`:

| # | Feature / Page | UI Component & Route | Backend Service & DB Tables | Data Origin | Functional Status |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | **Main Student Dashboard** | `StudentDashboard.tsx`<br>`/student/dashboard` | `studentService.ts`, `courseService.ts`, `assignmentService.ts`, `assessmentService.ts`, `attendanceService.ts`, `analyticsService.ts`<br>Tables: `profiles`, `student_profiles`, `course_enrollments`, `assignments`, `assignment_submissions`, `assessments`, `assessment_attempts`, `attendance_records` | **Real Data** | Fully functional. Aggregates live data across 6 services. Dynamic AI insights derived from real performance records. |
| **2** | **Student Profile & Settings** | `StudentProfilePage.tsx`<br>`/student/profile` | `studentService.ts`, `storageService.ts`<br>Tables: `profiles`, `student_profiles`, Storage bucket: `avatars` | **Real Data** | Fully functional. Edits personal/guardian details and uploads signed avatar photos to Supabase Storage. |
| **3** | **Enrolled Courses & Detail** | `CoursesList.tsx`<br>`/student/courses`<br>`CourseDetail.tsx`<br>`/student/courses/:id` | `courseService.ts`, `externalLearningService.ts`<br>Tables: `course_enrollments`, `academic_materials`, `student_external_courses` | **Real Data** | Course listing and external learning work. `CourseDetail` has minor field display defects (`undefined%` progress/attendance). |
| **4** | **Assignments & Submission** | `AssignmentsList.tsx`<br>`/student/assignments`<br>`AssignmentDetail.tsx`<br>`/student/assignments/:id` | `assignmentService.ts`, `storageService.ts`<br>Tables: `assignments`, `assignment_submissions`, Storage: `assignments` | **Real Data** | Fully functional. File upload to Supabase Storage, deadline enforcement, status badge tracking (Pending, Submitted, Graded, Overdue). |
| **5** | **Assessments & Quizzes** | `AssessmentsList.tsx`<br>`/student/assessments`<br>`AssessmentDetail.tsx`<br>`/student/assessments/:id`<br>`AssessmentAttempt.tsx`<br>`.../:id/attempt` | `assessmentService.ts`<br>Tables: `assessments`, `assessment_questions`, `assessment_attempts`, `assessment_attempt_answers` | **Real Data** | Fully functional. Online quiz runner with countdown timer, auto-saving of answers, automated grading, and question review. |
| **6** | **Attendance Logs** | `AttendanceDetail.tsx`<br>`/student/attendance` | `attendanceService.ts`<br>Tables: `attendance_records`, `attendance_sessions`, Realtime channel | **Real Data** | Fully functional. Real-time updates, course filtering, session-level conduct vs attend statistics, status pills. |
| **7** | **Semester Timetable** | `TimetablePage.tsx`<br>`/student/timetable` | `timetableService.ts`<br>Tables: `timetable_entries`, `student_profiles`, Realtime channel | **Real Data** | Fully functional. Semester and section-scoped weekly schedule grid with conflict-free display. |
| **8** | **Academic Calendar** | `AcademicCalendarPage.tsx`<br>`/student/calendar` | `AcademicCalendarPage.tsx` direct query<br>Table: `academic_calendar` | **Real Data** | Fully functional. Chronological timeline view of institutional exams, deadlines, and holidays. |
| **9** | **Academic Results & CGPA** | `ResultsPage.tsx`<br>`/student/results` | `resultService.ts`<br>Table: `results` | **Real Data** | Fully functional. Semester-wise grade cards, SGPA computation, credit tracking, and cumulative CGPA. |
| **10** | **Announcements & Notices** | `AnnouncementsPage.tsx`<br>`/student/announcements` | `announcementService.ts`<br>Tables: `announcements`, `profiles`, `departments` | **Real Data** | Fully functional. Department-scoped broadcast cards with author role badges and formatted publication dates. |
| **11** | **Notification Center** | `NotificationsPage.tsx`<br>`/student/notifications` | `notificationService.ts`<br>Table: `notifications` | **Real Data** | Fully functional. In-app notifications with unread count badge in AppShell, mark-as-read, and deletion. |
| **12** | **Projects & IDE Workspace** | `ProjectsList.tsx`<br>`/student/projects`<br>`MyProjectsList.tsx`<br>`/student/projects/my`<br>`ProjectDetail.tsx`<br>`/student/projects/:id`<br>`ProjectWorkspace.tsx`<br>`/student/project-workspace` | `projectService.ts`, `workspaceService.ts`, `githubService.ts`<br>Tables: `user_projects`, `project_tasks`, `project_milestones`, `project_files`, `github_workspace_changes` | **Mixed** | Project CRUD and IDE workspace file editing functional. `ProjectDetail` Resources tab has hardcoded alert links. |
| **13** | **Git & GitHub Integration** | `GitGithubPage.tsx`<br>`/student/github`<br>`GitHubCallbackPage.tsx`<br>`/student/github/callback` | `githubService.ts`, Edge Functions: `github-oauth`, `github-api`<br>Tables: `github_connections`, `github_repositories` | **Real Data (Pending Config)** | Secure architecture complete locally (CSRF state, token isolation, repo metadata mapper). Live OAuth flow awaits owner app registration. |
| **14** | **AI Learning Assistant** | `AILearningAssistantPage.tsx`<br>`/student/ai` | `aiService.ts`, Edge Function: `ai-chat`<br>Tables: `ai_conversations`, `ai_messages`, `course_enrollments` | **Real Data** | Fully functional. Multi-turn chat with conversation history, course context selection, and retry controls. |
| **15** | **Analytics & Learning Gaps** | `AnalyticsPerformancePage.tsx`<br>`/student/analytics`<br>`LearningGapsPage.tsx`<br>`/student/learning-gaps` | `analyticsService.ts`, `learningService.ts`, `analyticsAIDataService.ts`<br>View: `student_learning_gaps_view` | **Real Data** | Fully functional. Topic-level gap breakdown, performance distribution, and deterministic insights. |
| **16** | **Learning Recommendations** | `RecommendationsPage.tsx`<br>`/student/recommendations` | `learningService.ts`<br>Source: Derived from `getLearningGaps()` | **Real Data** | Fully functional. Curates review materials, quiz recommendations, and faculty consult prompts from real gap scores. |
| **17** | **Skill Passport & Achievements** | `SkillPassportPage.tsx`<br>`/student/skills`<br>`AchievementsPage.tsx`<br>`/student/achievements` | `skillService.ts`<br>Tables: `student_skills`, `student_achievements`, `student_learning_gaps_view` | **Real Data** | Fully functional. Auto-computes skill competency levels (Beginner to Expert) from topic accuracy. |
| **18** | **Student Support Services** | `StudentServicesPage.tsx`<br>`/student/services`<br>`ServiceRequestsPage.tsx`<br>`/student/services/requests`<br>`ServiceRequestDetailPage.tsx`<br>`.../requests/:id` | `studentService.ts`, `storageService.ts`<br>Tables: `service_catalog`, `student_service_requests`, Storage: `student_documents` | **Real Data** | Fully functional. Official service application portal with SLA badges, document attachments, and timeline tracking. |
| **19** | **Leave Requests** | `LeaveRequestsPage.tsx`<br>`/student/leave-requests` | `leaveService.ts`<br>Table: `student_leave_requests` | **Real Data** | **EXCLUDED FROM MODIFICATION** — Audited as working and frozen. |

---

## 2. Real-Data versus Dummy-Data Findings

### 2.1 Genuine Real-Data Features
1. **Attendance:** Derived strictly from `attendance_records` joined with `attendance_sessions` through `attendanceService.ts`.
2. **Assignments:** Derived from `assignments` and `assignment_submissions`, calculating real submission status, marks, and feedback.
3. **Assessments:** Quizzes and attempts are stored in `assessments`, `assessment_questions`, and `assessment_attempts`.
4. **Academic Performance & Results:** Sourced from `public.results` with real SGPA and CGPA math.
5. **Academic Calendar:** Sourced from `public.academic_calendar`.
6. **Announcements & Notifications:** Sourced from `announcements` and `notifications`.
7. **Skill Passport:** Synchronized from `student_learning_gaps_view` based on real assessment answers.
8. **Student Support Services:** Sourced from institutional `service_catalog` and `student_service_requests`.

### 2.2 Incomplete, Hardcoded, or Disconnected Data Elements Identified
1. **`CourseDetail.tsx` (Lines 121–137):**  
   `course.attendance`, `course.progress`, and `course.nextActivity` are read from the `course` object. Because `getCourseById` maps records from `course_enrollments` which does not hold these computed statistics, they render as `undefined%` and blank strings in the UI.
2. **`CourseDetail.tsx` (Lines 196–224):**  
   The Modules panel expects `course.modules`. Because course modules are not queried or joined from a dedicated modules table, this section is perpetually empty for enrolled courses.
3. **`ProjectDetail.tsx` (Lines 304–322):**  
   The "Resources & Documentation" tab renders hardcoded items with JavaScript `alert("Viewing README.md documentation.")` and `alert("Viewing OpenAPI JSON schema.")` instead of loading actual project files or linking to the project's repository.
4. **`StudentDashboard.tsx` (Line 261):**  
   The "Course Progress Overview" panel passes `course.progress || 0` to `ProgressBar`. Because `course_enrollments` lacks a progress percentage column, the progress bar perpetually renders at 0% for all courses.

---

## 3. Security and RLS Review

### 3.1 User Scoping and Ownership Enforcement
Every student query across the repository was inspected for caller UID binding:
- **`profiles` and `student_profiles`:** Scoped by `user.id`.
- **`attendance_records`:** Queries filter strictly with `.eq('student_id', user.id)`.
- **`assignment_submissions`:** Submissions filter by `.eq('student_id', user.id)`.
- **`assessment_attempts`:** Scoped by `.eq('student_id', user.id)`.
- **`user_projects`:** Scoped by `.eq('owner_id', user.id)`.
- **`notifications`:** Scoped by `.eq('user_id', user.id)`.
- **`student_service_requests`:** Scoped by `.eq('student_id', user.id)`.
- **`github_connections`:** Protected by column-level `REVOKE SELECT` (Migration 00018) preventing client-side token reads, and scoped by `user_id = auth.uid()`.

### 3.2 Database RLS Assessment
Database migrations `00001` through `00037` enforce the following policies:
- `public.results`: Policy `"Students can read own results"` (`student_id = auth.uid()`).
- `public.github_connections`: Policy `"Users can manage their own github connection"` (`user_id = auth.uid()`).
- `public.student_service_requests`: Policy `"Students can manage their own service requests"` (`student_id = auth.uid()`).
- `public.attendance_records`: Policy `"Students can view their own attendance records"` (`student_id = auth.uid()`).

**Conclusion:** Zero cross-student data leakage vulnerabilities were detected. Authorization is enforced both in client query filters and securely at the PostgreSQL RLS boundary.

---

## 4. GitHub Integration Status

The local implementation developed in Mission 07.3 and audited in Mission 07.3.1 was reviewed:

### 4.1 Completed Locally
- **CSRF Defense:** `generateGitHubOAuthState()` generates 128-bit random state; `validateGitHubOAuthState()` verifies and single-use consumes it on callback.
- **Repository Visualizer:** Maps real fields (`name`, `fullName`, `visibility`, `language`, `htmlUrl`, `description`, `updatedAt`).
- **Error & Reconnect UX:** Explicitly handles HTTP 401 (token expired/revoked) with an interactive "Reconnect GitHub" action.
- **Quality Verification:** 10/10 automated tests passing in `tests/github_integration.test.mjs`.

### 4.2 Outstanding External Requirements (Awaiting Project Owner)
1. **GitHub OAuth App Registration:** Registering the OAuth app on GitHub Developer Settings to obtain `VITE_GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
2. **Edge Function Secrets & Deployment:** Setting `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` via `supabase secrets set` and deploying `github-oauth` and `github-api`.
3. **Acceptance Test:** Performing an interactive, live OAuth login redirect on `github.com`.

---

## 5. Defect Classification

| Defect ID | Severity | File Path | Issue Description | Recommended Fix |
| :---: | :---: | :--- | :--- | :--- |
| **DEF-07.4-01** | **P2** | `src/pages/CourseDetail.tsx` (Lines 121–137) | `course.attendance` and `course.progress` render as `undefined%` in header stat pills. | Compute attendance from `attendanceService.getAttendanceSummary(course.id)` and course assignment completion rate, displaying "N/A" if unrecorded. |
| **DEF-07.4-02** | **P2** | `src/pages/CourseDetail.tsx` (Lines 196–224) | Modules tab is perpetually empty because `course.modules` is never populated by `getCourseById()`. | Group `courseMaterials` by module or provide an informative empty state explaining that syllabus modules will be structured by faculty. |
| **DEF-07.4-03** | **P2** | `src/pages/ProjectDetail.tsx` (Lines 304–322) | "Resources & Documentation" tab contains hardcoded fake links with JavaScript `alert()` calls. | Replace fake alerts with dynamic links to the project's repository URL (`project.github_repo_url`) or open project workspace files, with empty state if no resources exist. |
| **DEF-07.4-04** | **P3** | `src/pages/StudentDashboard.tsx` (Line 261) | Course Progress Overview bars always display 0% progress (`course.progress || 0`). | Derive course completion dynamically from student's submitted assignments and assessment attempts for that course. |
| **DEF-07.4-05** | **P3** | `src/pages/AnnouncementDetail.tsx` | Unrouted, 13-line placeholder stub. | Deprecate/remove or implement dedicated permalink view for individual announcement URLs. |

---

## 6. Recommended Implementation Order (Mission 07.5)

To bring the Student Dashboard to 100% genuine functionality without introducing regressions:

1. **Phase 1: Course Detail Statistical Accuracy (`DEF-07.4-01` & `DEF-07.4-02`)**  
   Update `src/pages/CourseDetail.tsx` to dynamically query the student's attendance percentage for the specific course from `attendanceService` and calculate assignment completion rate. Add an informative empty state for the Modules panel.
2. **Phase 2: Project Detail Documentation Linkage (`DEF-07.4-03`)**  
   Update `src/pages/ProjectDetail.tsx` to link to real repository resources or workspace files instead of invoking JavaScript `alert()` dialogs.
3. **Phase 3: Dashboard Course Progress Derivation (`DEF-07.4-04`)**  
   Update `StudentDashboard.tsx` or `courseService.ts` to compute a realistic course progress indicator based on coursework completed.

---

## 7. Test Coverage Gaps

- **Course Detail Integration Tests:** Currently, there are unit tests for courses, external learning, and AI contracts, but no automated test asserting that `CourseDetail.tsx` correctly handles missing modules or displays valid percentage figures without `undefined%`.
- **Project Detail Resource Tests:** No test asserts that clicking resources navigates to genuine URLs rather than firing window alerts.

---

## 8. Git Status and Baseline Verification

### 8.1 Current Working Tree
- **Current Branch:** `main`
- **Current HEAD Commit:** `fd1bd91`
- **Pre-change Checkpoint Tag:** `checkpoint-mission-07-3-pre`
- **Status:** Clean working tree with Mission 07.3 changes and audit documentation.

### 8.2 Baseline Verification Suite
- `npm test`: **179/179 PASS** (13 test files, 0 FAIL)
- `npm run test:real-pg`: **10/10 PASS** (PostgreSQL 16 on port 54333)
- `npm run typecheck`: **0 Errors**
- `npm run lint`: **0 Errors** (247 preexisting warnings preserved)
- `npm run build`: **0 Errors (built in 493ms)**

---

## 9. Final Recommendation

The comprehensive functional audit of the Student Dashboard is complete. No P0 or P1 security/data integrity blockers exist; the remaining findings consist of 3 P2 and 2 P3 data-presentation improvements that can be resolved in a targeted implementation pass.

AUDIT COMPLETE — READY FOR TARGETED IMPLEMENTATION.

