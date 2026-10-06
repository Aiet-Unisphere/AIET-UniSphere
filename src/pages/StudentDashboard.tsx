import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GraduationCap, 
  CalendarCheck, 
  ClipboardList, 
  FileCheck2, 
  BookOpen
} from 'lucide-react';
import { getStudentProfile } from '../services/studentService';
import { getCourses } from '../services/courseService';
import { getAssignments } from '../services/assignmentService';
import { getAssessments } from '../services/assessmentService';
import { getAttendanceSummary } from '../services/attendanceService';
import { AppShell } from '../components/AppShell';
import { StatCard } from '../components/StatCard';
import { ProgressBar } from '../components/ProgressBar';
import { AIInsightCard } from '../components/AIInsightCard';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { useAuth } from '../app/context/AuthContext';

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { profile: authProfile, user, refreshProfile } = useAuth();

  // Unified loading & error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [profile, setProfile] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any>(null);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [profData, coursesData, assignData, assessData, attData] = await Promise.all([
        getStudentProfile(),
        getCourses(),
        getAssignments(),
        getAssessments(),
        getAttendanceSummary()
      ]);
      setProfile(profData);
      setCourses(coursesData);
      setAssignments(assignData);
      setAssessments(assessData);
      setAttendance(attData);
    } catch (err) {
      setError("Unable to load student dashboard information. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();
    fetchDashboardData();
  }, []);

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading your dashboard details..." />
      </AppShell>
    );
  }

  if (error || !profile) {
    return (
      <AppShell>
        <ErrorState message={error || "Failed to retrieve student profile"} onRetry={fetchDashboardData} />
      </AppShell>
    );
  }

  // Derived dashboard metrics
  const pendingAssignments = assignments.filter(a => a.status === 'Pending').length;
  const upcomingAssessments = assessments.filter(a => a.status === 'Upcoming').length;

  // Custom greeting based on time of day
  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const studentName = authProfile?.full_name || user?.email?.split('@')[0] || profile?.name || 'Student';
  const deptDisplayName = authProfile?.department?.name || 'Department not assigned';
  const usnDisplay = authProfile?.usn_or_employee_id || '';
  const isProfileIncomplete = !profile?.phone || profile?.semester == null;

  return (
    <AppShell>
      {/* Dashboard Greeting Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', margin: 0 }}>
          {getGreeting()}, {studentName} 👋
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', fontWeight: 500, marginTop: '0.1rem' }}>
          {usnDisplay ? <span className="font-mono" style={{ fontWeight: 700 }}>{usnDisplay}</span> : null}
          {usnDisplay ? ' · ' : ''}{deptDisplayName} {profile?.semester ? `· Semester ${profile.semester}` : ''}
          {profile?.cgpa != null ? ` · CGPA: ${Number(profile.cgpa).toFixed(2)}` : ''}
        </p>
      </div>

      {isProfileIncomplete && (
        <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#92400E', fontSize: '0.9rem' }}>Your student profile is incomplete</div>
            <div style={{ fontSize: '0.8rem', color: '#B45309' }}>Complete your profile details to update your semester, guardian info, and contact details.</div>
          </div>
          <button 
            className="btn btn-secondary font-sans" 
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', borderColor: '#D97706', color: '#92400E', backgroundColor: '#FFF' }}
            onClick={() => navigate('/student/profile')}
          >
            Complete Profile
          </button>
        </div>
      )}

      {/* Academic Overview stats */}
      <div className="stat-cards-grid">
        <StatCard 
          title="Attendance" 
          value={attendance?.overallPercentage != null ? `${attendance.overallPercentage}%` : "No data"} 
          icon={<CalendarCheck size={20} />} 
        />
        <StatCard 
          title="CGPA" 
          value={profile?.cgpa != null ? Number(profile.cgpa).toFixed(2) : "Not provided"} 
          icon={<GraduationCap size={20} />} 
        />
        <StatCard 
          title="Pending Assignments" 
          value={pendingAssignments} 
          icon={<ClipboardList size={20} />} 
        />
        <StatCard 
          title="Upcoming Assessments" 
          value={upcomingAssessments} 
          icon={<FileCheck2 size={20} />} 
        />
        <StatCard 
          title="Active Courses" 
          value={courses.length} 
          icon={<BookOpen size={20} />} 
        />
      </div>

      {/* Main columns */}
      <div className="dashboard-grid-two-col">
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Today's Priorities */}
          <div className="dashboard-panel">
            <div className="panel-header-row">
              <h3 className="panel-title">Today's Priorities</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Urgent Tasks</span>
            </div>
            <div className="priority-list">
              {(() => {
                const urgentAssigns = assignments.filter(a => a.status === 'Pending').slice(0, 2);
                const urgentAssess = assessments.filter(a => a.status === 'Upcoming' || a.status === 'Active').slice(0, 2);

                if (urgentAssigns.length === 0 && urgentAssess.length === 0) {
                  return (
                    <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', padding: '0.5rem 0' }}>
                      No urgent priorities for today.
                    </p>
                  );
                }

                return (
                  <>
                    {urgentAssigns.map((assign) => (
                      <div key={assign.id} className="priority-item high-priority">
                        <div className="priority-details">
                          <span className="priority-title">{assign.title}</span>
                          <span className="priority-meta">
                            {assign.dueDate ? `Due: ${new Date(assign.dueDate).toLocaleDateString()}` : 'Pending Submission'} · {assign.courseName}
                          </span>
                        </div>
                        <button 
                          onClick={() => navigate(`/student/assignments/${assign.id}`)}
                          className="btn btn-primary" 
                          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.8rem', backgroundColor: 'var(--brand-orange)' }}
                        >
                          Submit
                        </button>
                      </div>
                    ))}

                    {urgentAssess.map((assess) => (
                      <div key={assess.id} className="priority-item">
                        <div className="priority-details">
                          <span className="priority-title">{assess.title}</span>
                          <span className="priority-meta">
                            {assess.availableFrom ? `Available: ${new Date(assess.availableFrom).toLocaleDateString()}` : 'Upcoming Test'} · {assess.courseName}
                          </span>
                        </div>
                        <button 
                          onClick={() => navigate(`/student/assessments/${assess.id}`)}
                          className="btn btn-secondary" 
                          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                        >
                          Details
                        </button>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>

          {/* AI Insights Card */}
          <AIInsightCard 
            insight="Your recent assessment performance in Database Systems has improved, indicating strong comprehension of relational schemas." 
            suggestedFocus="Normalization (BCNF) and Transaction Concurrency Control" 
          />

          {/* Course Progress Breakdown */}
          <div className="dashboard-panel">
            <div className="panel-header-row">
              <h3 className="panel-title">Course Progress Overview</h3>
              <button 
                onClick={() => navigate('/student/courses')} 
                className="btn btn-secondary" 
                style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                View All Courses
              </button>
            </div>
            {courses.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', padding: '0.5rem 0' }}>
                No active enrolled courses.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                {courses.slice(0, 3).map((course) => (
                  <div key={course.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{course.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>{course.code}</span>
                    </div>
                    <ProgressBar progress={course.progress || 0} showPercentage={true} />
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Attendance Panel */}
          <div className="dashboard-panel">
            <div className="panel-header-row">
              <h3 className="panel-title">Subject Attendance</h3>
              <button 
                onClick={() => navigate('/student/attendance')}
                className="btn btn-secondary" 
                style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                View Attendance
              </button>
            </div>
            {!attendance?.subjects?.length ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', padding: '0.5rem 0' }}>
                No attendance records available.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {attendance.subjects.slice(0, 4).map((sub: any) => (
                  <div key={sub.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--brand-black)', fontWeight: 500, textAlign: 'left', flexGrow: 1, paddingRight: '0.5rem' }}>
                      {sub.subject.length > 25 ? `${sub.subject.substring(0, 25)}...` : sub.subject}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                      <span style={{ fontWeight: 600, color: sub.percentage < 80 ? 'var(--color-error)' : 'var(--brand-black)' }}>
                        {sub.percentage}%
                      </span>
                      <span 
                        className={`badge ${sub.percentage < 80 ? 'badge-overdue' : 'badge-graded'}`}
                        style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem' }}
                      >
                        {sub.percentage < 80 ? 'Monitor' : 'Good'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Assignments */}
          <div className="dashboard-panel">
            <div className="panel-header-row">
              <h3 className="panel-title">Pending Assignments</h3>
              <button 
                onClick={() => navigate('/student/assignments')}
                className="btn btn-secondary" 
                style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                View Assignments
              </button>
            </div>
            {assignments.filter(a => a.status === 'Pending').length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', padding: '0.5rem 0' }}>
                No pending assignments.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {assignments.filter(a => a.status === 'Pending').slice(0, 3).map((assign) => (
                  <div 
                    key={assign.id} 
                    onClick={() => navigate(`/student/assignments/${assign.id}`)}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.2rem', 
                      textAlign: 'left', 
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      transition: 'var(--transition-smooth)'
                    }}
                    className="priority-item-interactive"
                  >
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                      {assign.title}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                      <span>{assign.courseName}</span>
                      <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>
                        {assign.dueDate ? new Date(assign.dueDate).toLocaleDateString() : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Assessments */}
          <div className="dashboard-panel">
            <div className="panel-header-row">
              <h3 className="panel-title">Upcoming Assessments</h3>
              <button 
                onClick={() => navigate('/student/assessments')}
                className="btn btn-secondary" 
                style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                View Assessments
              </button>
            </div>
            {assessments.filter(a => a.status === 'Upcoming' || a.status === 'Active').length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', padding: '0.5rem 0' }}>
                No upcoming assessments.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {assessments.filter(a => a.status === 'Upcoming' || a.status === 'Active').slice(0, 3).map((assess) => (
                  <div 
                    key={assess.id} 
                    onClick={() => navigate(`/student/assessments/${assess.id}`)}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.2rem', 
                      textAlign: 'left', 
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '4px'
                    }}
                  >
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                      {assess.title}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                      <span>{assess.courseName}</span>
                      <span style={{ fontWeight: 600, color: 'var(--brand-orange)' }}>
                        {assess.availableFrom ? new Date(assess.availableFrom).toLocaleDateString() : 'Upcoming'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </AppShell>
  );
};
export default StudentDashboard;
