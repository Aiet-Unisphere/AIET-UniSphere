import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { RoleSelection } from './pages/RoleSelection';
import { StudentLogin } from './pages/StudentLogin';
import { StudentSignup } from './pages/StudentSignup';
import { FacultyLogin } from './pages/FacultyLogin';
import { AdminLogin } from './pages/AdminLogin';
import { RoleGuard } from './app/guards/RoleGuard';
import { LoadingState } from './components/LoadingState';
import { ErrorBoundary } from './components/ErrorBoundary';

// ============================================================
// LAZY LOADED ROUTE CHUNKS FOR CODE-SPLITTING & OPTIMAL BUNDLE PERFORMANCE
// ============================================================

// Student Portal Features
const StudentDashboard = React.lazy(() => import('./pages/StudentDashboard').then(m => ({ default: m.StudentDashboard })));
const CoursesList = React.lazy(() => import('./pages/CoursesList').then(m => ({ default: m.CoursesList })));
const CourseDetail = React.lazy(() => import('./pages/CourseDetail').then(m => ({ default: m.CourseDetail })));
const AssignmentsList = React.lazy(() => import('./pages/AssignmentsList').then(m => ({ default: m.AssignmentsList })));
const AssignmentDetail = React.lazy(() => import('./pages/AssignmentDetail').then(m => ({ default: m.AssignmentDetail })));
const AssessmentsList = React.lazy(() => import('./pages/AssessmentsList').then(m => ({ default: m.AssessmentsList })));
const AssessmentDetail = React.lazy(() => import('./pages/AssessmentDetail').then(m => ({ default: m.AssessmentDetail })));
const AssessmentAttempt = React.lazy(() => import('./pages/AssessmentAttempt').then(m => ({ default: m.AssessmentAttempt })));
const AttendanceDetail = React.lazy(() => import('./pages/AttendanceDetail').then(m => ({ default: m.AttendanceDetail })));

// Extended Academic & Communication Pages
const LeaveRequestsPage = React.lazy(() => import('./pages/LeaveRequestsPage').then(m => ({ default: m.LeaveRequestsPage })));
const StudentProfilePage = React.lazy(() => import('./pages/StudentProfilePage').then(m => ({ default: m.StudentProfilePage })));
const TimetablePage = React.lazy(() => import('./pages/TimetablePage').then(m => ({ default: m.TimetablePage })));
const AcademicCalendarPage = React.lazy(() => import('./pages/AcademicCalendarPage').then(m => ({ default: m.AcademicCalendarPage })));
const ResultsPage = React.lazy(() => import('./pages/ResultsPage').then(m => ({ default: m.ResultsPage })));
const AnnouncementsPage = React.lazy(() => import('./pages/AnnouncementsPage').then(m => ({ default: m.AnnouncementsPage })));

// Phase 4 Project & GitHub Feature Pages
const NotificationsPage = React.lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const ProjectsList = React.lazy(() => import('./pages/ProjectsList').then(m => ({ default: m.ProjectsList })));
const MyProjectsList = React.lazy(() => import('./pages/MyProjectsList').then(m => ({ default: m.MyProjectsList })));
const ProjectDetail = React.lazy(() => import('./pages/ProjectDetail').then(m => ({ default: m.ProjectDetail })));
const ProjectWorkspace = React.lazy(() => import('./pages/ProjectWorkspace').then(m => ({ default: m.ProjectWorkspace })));
const GitGithubPage = React.lazy(() => import('./pages/GitGithubPage').then(m => ({ default: m.GitGithubPage })));
const GitHubCallbackPage = React.lazy(() => import('./pages/GitHubCallbackPage').then(m => ({ default: m.GitHubCallbackPage })));

// Phase 5 AI & Student Services Pages
const AILearningAssistantPage = React.lazy(() => import('./pages/AILearningAssistantPage').then(m => ({ default: m.AILearningAssistantPage })));
const AnalyticsPerformancePage = React.lazy(() => import('./pages/AnalyticsPerformancePage').then(m => ({ default: m.AnalyticsPerformancePage })));
const LearningGapsPage = React.lazy(() => import('./pages/LearningGapsPage').then(m => ({ default: m.LearningGapsPage })));
const RecommendationsPage = React.lazy(() => import('./pages/RecommendationsPage').then(m => ({ default: m.RecommendationsPage })));
const SkillPassportPage = React.lazy(() => import('./pages/SkillPassportPage').then(m => ({ default: m.SkillPassportPage })));
const AchievementsPage = React.lazy(() => import('./pages/AchievementsPage').then(m => ({ default: m.AchievementsPage })));
const StudentServicesPage = React.lazy(() => import('./pages/StudentServicesPage').then(m => ({ default: m.StudentServicesPage })));
const ServiceRequestsPage = React.lazy(() => import('./pages/ServiceRequestsPage').then(m => ({ default: m.ServiceRequestsPage })));
const ServiceRequestDetailPage = React.lazy(() => import('./pages/ServiceRequestDetailPage').then(m => ({ default: m.ServiceRequestDetailPage })));

// Phase 6 Faculty Feature Pages
const FacultyDashboard = React.lazy(() => import('./faculty/pages/FacultyDashboard').then(m => ({ default: m.FacultyDashboard })));
const FacultyCoursesList = React.lazy(() => import('./faculty/pages/FacultyCoursesList').then(m => ({ default: m.FacultyCoursesList })));
const FacultyCourseDetail = React.lazy(() => import('./faculty/pages/FacultyCourseDetail').then(m => ({ default: m.FacultyCourseDetail })));
const FacultyStudentList = React.lazy(() => import('./faculty/pages/FacultyStudentList').then(m => ({ default: m.FacultyStudentList })));
const FacultyStudentDetail = React.lazy(() => import('./faculty/pages/FacultyStudentDetail').then(m => ({ default: m.FacultyStudentDetail })));
const FacultyAttendancePage = React.lazy(() => import('./faculty/pages/FacultyAttendancePage').then(m => ({ default: m.FacultyAttendancePage })));
const FacultyAssignmentList = React.lazy(() => import('./faculty/pages/FacultyAssignmentList').then(m => ({ default: m.FacultyAssignmentList })));
const FacultyAssignmentDetail = React.lazy(() => import('./faculty/pages/FacultyAssignmentDetail').then(m => ({ default: m.FacultyAssignmentDetail })));
const FacultyAssessmentList = React.lazy(() => import('./faculty/pages/FacultyAssessmentList').then(m => ({ default: m.FacultyAssessmentList })));
const FacultyAssessmentDetail = React.lazy(() => import('./faculty/pages/FacultyAssessmentDetail').then(m => ({ default: m.FacultyAssessmentDetail })));
const FacultyAnnouncementPage = React.lazy(() => import('./faculty/pages/FacultyAnnouncementPage').then(m => ({ default: m.FacultyAnnouncementPage })));
const FacultyAIAssistantPage = React.lazy(() => import('./faculty/pages/FacultyAIAssistantPage').then(m => ({ default: m.FacultyAIAssistantPage })));
const FacultyTimetablePage = React.lazy(() => import('./faculty/pages/FacultyTimetablePage').then(m => ({ default: m.FacultyTimetablePage })));
const FacultyProfilePage = React.lazy(() => import('./faculty/pages/FacultyProfilePage').then(m => ({ default: m.FacultyProfilePage })));
const FacultyNotificationsPage = React.lazy(() => import('./faculty/pages/FacultyNotificationsPage').then(m => ({ default: m.FacultyNotificationsPage })));

// Phase 7 & 8 HOD Portal Pages
const HODDashboard = React.lazy(() => import('./hod/pages/HODDashboard').then(m => ({ default: m.HODDashboard })));
const HODFacultyList = React.lazy(() => import('./hod/pages/HODFacultyList').then(m => ({ default: m.HODFacultyList })));
const HODFacultyDetail = React.lazy(() => import('./hod/pages/HODFacultyDetail').then(m => ({ default: m.HODFacultyDetail })));
const HODStudentList = React.lazy(() => import('./hod/pages/HODStudentList').then(m => ({ default: m.HODStudentList })));
const HODStudentDetail = React.lazy(() => import('./hod/pages/HODStudentDetail').then(m => ({ default: m.HODStudentDetail })));
const HODCourseList = React.lazy(() => import('./hod/pages/HODCourseList').then(m => ({ default: m.HODCourseList })));
const HODCourseDetail = React.lazy(() => import('./hod/pages/HODCourseDetail').then(m => ({ default: m.HODCourseDetail })));
const HODAttendancePage = React.lazy(() => import('./hod/pages/HODAttendancePage').then(m => ({ default: m.HODAttendancePage })));
const HODLeaveList = React.lazy(() => import('./hod/pages/HODLeaveList').then(m => ({ default: m.HODLeaveList })));
const HODLeaveDetail = React.lazy(() => import('./hod/pages/HODLeaveDetail').then(m => ({ default: m.HODLeaveDetail })));
const HODAssessmentList = React.lazy(() => import('./hod/pages/HODAssessmentList').then(m => ({ default: m.HODAssessmentList })));
const HODAssessmentDetail = React.lazy(() => import('./hod/pages/HODAssessmentDetail').then(m => ({ default: m.HODAssessmentDetail })));
const HODResultsPage = React.lazy(() => import('./hod/pages/HODResultsPage').then(m => ({ default: m.HODResultsPage })));
const HODTimetablePage = React.lazy(() => import('./hod/pages/HODTimetablePage').then(m => ({ default: m.HODTimetablePage })));
const HODAnnouncementPage = React.lazy(() => import('./hod/pages/HODAnnouncementPage').then(m => ({ default: m.HODAnnouncementPage })));
const HODAnalyticsPage = React.lazy(() => import('./hod/pages/HODAnalyticsPage').then(m => ({ default: m.HODAnalyticsPage })));
const HODAIAssistantPage = React.lazy(() => import('./hod/pages/HODAIAssistantPage').then(m => ({ default: m.HODAIAssistantPage })));
const HODNotificationsPage = React.lazy(() => import('./hod/pages/HODNotificationsPage').then(m => ({ default: m.HODNotificationsPage })));
const HODProfilePage = React.lazy(() => import('./hod/pages/HODProfilePage').then(m => ({ default: m.HODProfilePage })));

// Phase 9 Admin Portal Pages
const AdminDashboard = React.lazy(() => import('./admin/pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const UserList = React.lazy(() => import('./admin/pages/UserList').then(m => ({ default: m.UserList })));
const UserDetail = React.lazy(() => import('./admin/pages/UserDetail').then(m => ({ default: m.UserDetail })));
const UserForm = React.lazy(() => import('./admin/pages/UserForm').then(m => ({ default: m.UserForm })));
const OrganizationPage = React.lazy(() => import('./admin/pages/OrganizationPage').then(m => ({ default: m.OrganizationPage })));
const DepartmentDetail = React.lazy(() => import('./admin/pages/DepartmentDetail').then(m => ({ default: m.DepartmentDetail })));
const SecurityPage = React.lazy(() => import('./admin/pages/SecurityPage').then(m => ({ default: m.SecurityPage })));

const App: React.FC = () => {
  return (
    <Router>
      <ErrorBoundary>
        <Suspense fallback={<LoadingState message="Loading campus portal module..." />}>
          <Routes>
            {/* Entry / Role Selection Page (Eager) */}
            <Route path="/" element={<RoleSelection />} />

            {/* Auth Student Routes (Eager) */}
            <Route path="/login/student" element={<StudentLogin />} />
            <Route path="/signup/student" element={<StudentSignup />} />

            {/* Auth Faculty & Admin Routes (Eager) */}
            <Route path="/login/faculty" element={<FacultyLogin />} />
            <Route path="/login/admin" element={<AdminLogin />} />

            {/* Student Academic Routes (Lazy) */}
            <Route path="/student/dashboard" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><StudentDashboard /></RoleGuard>} />
            <Route path="/student/profile" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><StudentProfilePage /></RoleGuard>} />
            <Route path="/student/courses" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><CoursesList /></RoleGuard>} />
            <Route path="/student/courses/:id" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><CourseDetail /></RoleGuard>} />
            <Route path="/student/assignments" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AssignmentsList /></RoleGuard>} />
            <Route path="/student/assignments/:id" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AssignmentDetail /></RoleGuard>} />
            <Route path="/student/assessments" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AssessmentsList /></RoleGuard>} />
            <Route path="/student/assessments/:id" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AssessmentDetail /></RoleGuard>} />
            <Route path="/student/assessments/:id/attempt" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AssessmentAttempt /></RoleGuard>} />
            <Route path="/student/attendance" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AttendanceDetail /></RoleGuard>} />

            {/* Extended Academic & Communication Routes */}
            <Route path="/student/leave-requests" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><LeaveRequestsPage /></RoleGuard>} />
            <Route path="/student/timetable" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><TimetablePage /></RoleGuard>} />
            <Route path="/student/calendar" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AcademicCalendarPage /></RoleGuard>} />
            <Route path="/student/results" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ResultsPage /></RoleGuard>} />
            <Route path="/student/announcements" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AnnouncementsPage /></RoleGuard>} />

            {/* Phase 4 Project & GitHub Feature Routes */}
            <Route path="/student/notifications" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><NotificationsPage /></RoleGuard>} />
            <Route path="/student/projects" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ProjectsList /></RoleGuard>} />
            <Route path="/student/projects/my" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><MyProjectsList /></RoleGuard>} />
            <Route path="/student/projects/:id" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ProjectDetail /></RoleGuard>} />
            <Route path="/student/projects/:id/workspace" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ProjectWorkspace /></RoleGuard>} />
            <Route path="/student/project-workspace" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ProjectWorkspace /></RoleGuard>} />
            <Route path="/student/github" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><GitGithubPage /></RoleGuard>} />
            <Route path="/student/github/callback" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><GitHubCallbackPage /></RoleGuard>} />

            {/* Phase 5 AI & Student Services Routes */}
            <Route path="/student/ai" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AILearningAssistantPage /></RoleGuard>} />
            <Route path="/student/analytics" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AnalyticsPerformancePage /></RoleGuard>} />
            <Route path="/student/learning-gaps" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><LearningGapsPage /></RoleGuard>} />
            <Route path="/student/recommendations" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><RecommendationsPage /></RoleGuard>} />
            <Route path="/student/skills" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><SkillPassportPage /></RoleGuard>} />
            <Route path="/student/achievements" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><AchievementsPage /></RoleGuard>} />
            <Route path="/student/services" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><StudentServicesPage /></RoleGuard>} />
            <Route path="/student/services/requests" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ServiceRequestsPage /></RoleGuard>} />
            <Route path="/student/services/requests/:id" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ServiceRequestDetailPage /></RoleGuard>} />

            {/* Phase 6 Faculty Portal Routes */}
            <Route path="/faculty/dashboard" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyDashboard /></RoleGuard>} />
            <Route path="/faculty/courses" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyCoursesList /></RoleGuard>} />
            <Route path="/faculty/courses/:id" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyCourseDetail /></RoleGuard>} />
            <Route path="/faculty/students" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyStudentList /></RoleGuard>} />
            <Route path="/faculty/students/:id" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyStudentDetail /></RoleGuard>} />
            <Route path="/faculty/attendance" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyAttendancePage /></RoleGuard>} />
            <Route path="/faculty/timetable" element={<RoleGuard allowedRoles={['FACULTY', 'HOD', 'ADMIN']}><FacultyTimetablePage /></RoleGuard>} />
            <Route path="/faculty/assignments" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyAssignmentList /></RoleGuard>} />
            <Route path="/faculty/assignments/:id" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyAssignmentDetail /></RoleGuard>} />
            <Route path="/faculty/assessments" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyAssessmentList /></RoleGuard>} />
            <Route path="/faculty/assessments/:id" element={<RoleGuard allowedRoles={['FACULTY', 'HOD', 'ADMIN']}><FacultyAssessmentDetail /></RoleGuard>} />
            <Route path="/faculty/assessments/:id/results/:attemptId" element={<RoleGuard allowedRoles={['FACULTY', 'HOD', 'ADMIN']}><FacultyAssessmentDetail /></RoleGuard>} />
            <Route path="/faculty/announcements" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyAnnouncementPage /></RoleGuard>} />
            <Route path="/faculty/ai-assistant" element={<RoleGuard allowedRoles={['FACULTY', 'HOD', 'ADMIN']}><FacultyAIAssistantPage /></RoleGuard>} />
            <Route path="/faculty/profile" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyProfilePage /></RoleGuard>} />
            <Route path="/faculty/notifications" element={<RoleGuard allowedRoles={['FACULTY', 'ADMIN']}><FacultyNotificationsPage /></RoleGuard>} />

            {/* Phase 7 HOD Portal Routes */}
            <Route path="/hod/dashboard" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODDashboard /></RoleGuard>} />
            <Route path="/hod/faculty" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODFacultyList /></RoleGuard>} />
            <Route path="/hod/faculty/:id" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODFacultyDetail /></RoleGuard>} />
            <Route path="/hod/students" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODStudentList /></RoleGuard>} />
            <Route path="/hod/students/:id" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODStudentDetail /></RoleGuard>} />
            <Route path="/hod/courses" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODCourseList /></RoleGuard>} />
            <Route path="/hod/courses/:id" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODCourseDetail /></RoleGuard>} />
            <Route path="/hod/attendance" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODAttendancePage /></RoleGuard>} />

            {/* Phase 8 HOD Portal Batch 2 Routes */}
            <Route path="/hod/leave" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODLeaveList /></RoleGuard>} />
            <Route path="/hod/leave/:id" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODLeaveDetail /></RoleGuard>} />
            <Route path="/hod/assessments" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODAssessmentList /></RoleGuard>} />
            <Route path="/hod/assessments/:id" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODAssessmentDetail /></RoleGuard>} />
            <Route path="/hod/results" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODResultsPage /></RoleGuard>} />
            <Route path="/hod/timetable" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODTimetablePage /></RoleGuard>} />
            <Route path="/hod/announcements" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODAnnouncementPage /></RoleGuard>} />
            <Route path="/hod/analytics" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODAnalyticsPage /></RoleGuard>} />
            <Route path="/hod/ai-assistant" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODAIAssistantPage /></RoleGuard>} />
            <Route path="/hod/notifications" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODNotificationsPage /></RoleGuard>} />
            <Route path="/hod/profile" element={<RoleGuard allowedRoles={['HOD', 'ADMIN']}><HODProfilePage /></RoleGuard>} />

            {/* Phase 9 Admin Portal Batch 1 Routes */}
            <Route path="/admin/dashboard" element={<RoleGuard allowedRoles={['ADMIN']}><AdminDashboard /></RoleGuard>} />
            <Route path="/admin/users" element={<RoleGuard allowedRoles={['ADMIN']}><UserList /></RoleGuard>} />
            <Route path="/admin/users/create" element={<RoleGuard allowedRoles={['ADMIN']}><UserForm /></RoleGuard>} />
            <Route path="/admin/users/:id" element={<RoleGuard allowedRoles={['ADMIN']}><UserDetail /></RoleGuard>} />
            <Route path="/admin/users/:id/edit" element={<RoleGuard allowedRoles={['ADMIN']}><UserForm /></RoleGuard>} />
            <Route path="/admin/organization" element={<RoleGuard allowedRoles={['ADMIN']}><OrganizationPage /></RoleGuard>} />
            <Route path="/admin/organization/departments/:id" element={<RoleGuard allowedRoles={['ADMIN']}><DepartmentDetail /></RoleGuard>} />
            <Route path="/admin/security" element={<RoleGuard allowedRoles={['ADMIN']}><SecurityPage /></RoleGuard>} />

            {/* Fallback to Role Selection */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
};

export default App;
