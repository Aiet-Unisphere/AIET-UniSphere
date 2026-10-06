import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { RoleSelection } from './pages/RoleSelection';
import { StudentLogin } from './pages/StudentLogin';
import { StudentSignup } from './pages/StudentSignup';
import { FacultyLogin } from './pages/FacultyLogin';
import { AdminLogin } from './pages/AdminLogin';

// Existing Student Portal Features
import { StudentDashboard } from './pages/StudentDashboard';
import { CoursesList } from './pages/CoursesList';
import { CourseDetail } from './pages/CourseDetail';
import { AssignmentsList } from './pages/AssignmentsList';
import { AssignmentDetail } from './pages/AssignmentDetail';
import { AssessmentsList } from './pages/AssessmentsList';
import { AssessmentDetail } from './pages/AssessmentDetail';
import { AssessmentAttempt } from './pages/AssessmentAttempt';
import { AttendanceDetail } from './pages/AttendanceDetail';

// Extended Academic & Communication Pages
import { LeaveRequestsPage } from './pages/LeaveRequestsPage';
import { StudentProfilePage } from './pages/StudentProfilePage';
import { TimetablePage } from './pages/TimetablePage';
import { AcademicCalendarPage } from './pages/AcademicCalendarPage';
import { ResultsPage } from './pages/ResultsPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';

// Phase 4 Feature Pages
import { NotificationsPage } from './pages/NotificationsPage';
import { ProjectsList } from './pages/ProjectsList';
import { MyProjectsList } from './pages/MyProjectsList';
import { ProjectDetail } from './pages/ProjectDetail';
import { ProjectWorkspace } from './pages/ProjectWorkspace';
import { GitGithubPage } from './pages/GitGithubPage';
import { GitHubCallbackPage } from './pages/GitHubCallbackPage';

// Phase 5 Feature Pages
import { AILearningAssistantPage } from './pages/AILearningAssistantPage';
import { AnalyticsPerformancePage } from './pages/AnalyticsPerformancePage';
import { LearningGapsPage } from './pages/LearningGapsPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { SkillPassportPage } from './pages/SkillPassportPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { StudentServicesPage } from './pages/StudentServicesPage';
import { ServiceRequestsPage } from './pages/ServiceRequestsPage';
import { ServiceRequestDetailPage } from './pages/ServiceRequestDetailPage';

// Phase 6 Faculty Feature Pages
import { FacultyDashboard } from './faculty/pages/FacultyDashboard';
import { FacultyCoursesList } from './faculty/pages/FacultyCoursesList';
import { FacultyCourseDetail } from './faculty/pages/FacultyCourseDetail';
import { FacultyStudentList } from './faculty/pages/FacultyStudentList';
import { FacultyStudentDetail } from './faculty/pages/FacultyStudentDetail';
import { FacultyAttendancePage } from './faculty/pages/FacultyAttendancePage';
import { FacultyAssignmentList } from './faculty/pages/FacultyAssignmentList';
import { FacultyAssignmentDetail } from './faculty/pages/FacultyAssignmentDetail';
import { FacultyAssessmentList } from './faculty/pages/FacultyAssessmentList';
import { FacultyAssessmentDetail } from './faculty/pages/FacultyAssessmentDetail';
import { FacultyAnnouncementPage } from './faculty/pages/FacultyAnnouncementPage';
import { FacultyAIAssistantPage } from './faculty/pages/FacultyAIAssistantPage';
import { FacultyTimetablePage } from './faculty/pages/FacultyTimetablePage';
import { FacultyProfilePage } from './faculty/pages/FacultyProfilePage';
import { FacultyNotificationsPage } from './faculty/pages/FacultyNotificationsPage';

// Phase 7 & 8 HOD Portal Pages & Role Guard
import { RoleGuard } from './app/guards/RoleGuard';
import { HODDashboard } from './hod/pages/HODDashboard';
import { HODFacultyList } from './hod/pages/HODFacultyList';
import { HODFacultyDetail } from './hod/pages/HODFacultyDetail';
import { HODStudentList } from './hod/pages/HODStudentList';
import { HODStudentDetail } from './hod/pages/HODStudentDetail';
import { HODCourseList } from './hod/pages/HODCourseList';
import { HODCourseDetail } from './hod/pages/HODCourseDetail';
import { HODAttendancePage } from './hod/pages/HODAttendancePage';

// Phase 8 HOD Portal Batch 2 Pages
import { HODLeaveList } from './hod/pages/HODLeaveList';
import { HODLeaveDetail } from './hod/pages/HODLeaveDetail';
import { HODAssessmentList } from './hod/pages/HODAssessmentList';
import { HODAssessmentDetail } from './hod/pages/HODAssessmentDetail';
import { HODResultsPage } from './hod/pages/HODResultsPage';
import { HODTimetablePage } from './hod/pages/HODTimetablePage';
import { HODAnnouncementPage } from './hod/pages/HODAnnouncementPage';
import { HODAnalyticsPage } from './hod/pages/HODAnalyticsPage';
import { HODAIAssistantPage } from './hod/pages/HODAIAssistantPage';
import { HODNotificationsPage } from './hod/pages/HODNotificationsPage';
import { HODProfilePage } from './hod/pages/HODProfilePage';

// Phase 9 Admin Portal Batch 1 Pages
import { AdminDashboard } from './admin/pages/AdminDashboard';
import { UserList } from './admin/pages/UserList';
import { UserDetail } from './admin/pages/UserDetail';
import { UserForm } from './admin/pages/UserForm';
import { OrganizationPage } from './admin/pages/OrganizationPage';
import { DepartmentDetail } from './admin/pages/DepartmentDetail';
import { SecurityPage } from './admin/pages/SecurityPage';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Entry / Role Selection Page */}
        <Route path="/" element={<RoleSelection />} />

        {/* Auth Student Routes */}
        <Route path="/login/student" element={<StudentLogin />} />
        <Route path="/signup/student" element={<StudentSignup />} />

        {/* Auth Faculty & Admin Routes */}
        <Route path="/login/faculty" element={<FacultyLogin />} />
        <Route path="/login/admin" element={<AdminLogin />} />

        {/* Existing Academic Routes */}
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

        {/* Phase 4 Required Feature Routes */}
        <Route path="/student/notifications" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><NotificationsPage /></RoleGuard>} />
        <Route path="/student/projects" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ProjectsList /></RoleGuard>} />
        <Route path="/student/projects/my" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><MyProjectsList /></RoleGuard>} />
        <Route path="/student/projects/:id" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ProjectDetail /></RoleGuard>} />
        <Route path="/student/projects/:id/workspace" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ProjectWorkspace /></RoleGuard>} />
        <Route path="/student/project-workspace" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><ProjectWorkspace /></RoleGuard>} />
        <Route path="/student/github" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><GitGithubPage /></RoleGuard>} />
        <Route path="/student/github/callback" element={<RoleGuard allowedRoles={['STUDENT', 'ADMIN']}><GitHubCallbackPage /></RoleGuard>} />

        {/* Phase 5 Required Feature Routes */}
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
    </Router>
  );
};

export default App;
