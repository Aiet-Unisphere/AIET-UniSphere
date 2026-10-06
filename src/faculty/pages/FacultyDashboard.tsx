import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  Users, 
  Clock, 
  ClipboardList, 
  AlertTriangle, 
  Plus, 
  CalendarCheck, 
  ArrowRight, 
  CheckCircle2, 
  FileText,
  AlertCircle
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { StatCard } from '../../components/StatCard';
import { getFacultyDashboardData } from '../services/facultyService';
import type { FacultyDashboardData } from '../services/facultyService';
import { CreateAssignmentModal } from '../components/CreateAssignmentModal';

import { useAuth } from '../../app/context/AuthContext';

export const FacultyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { profile: authProfile, user, refreshProfile } = useAuth();
  const [data, setData] = useState<FacultyDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await refreshProfile();
      const res = await getFacultyDashboardData();
      setData(res);
    } catch (err: any) {
      console.error('[FacultyDashboard] Load error:', err);
      setErrorMessage(err.message || 'Unable to load Faculty Dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (isLoading) {
    return (
      <FacultyAppShell>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '50vh', gap: '1rem' }}>
          <div className="skeleton-loader" style={{ width: '48px', height: '48px', borderRadius: '50%' }}></div>
          <div style={{ fontSize: '0.95rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
            Loading Faculty Dashboard...
          </div>
        </div>
      </FacultyAppShell>
    );
  }

  if (errorMessage && !data) {
    return (
      <FacultyAppShell>
        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <AlertCircle size={40} style={{ color: 'var(--color-error)' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-black)' }}>Unable to Load Faculty Dashboard</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', maxWidth: '480px' }}>{errorMessage}</p>
          <button className="btn btn-primary" style={{ width: 'auto', marginTop: '0.5rem' }} onClick={fetchDashboardData}>
            <span>Retry Loading</span>
          </button>
        </div>
      </FacultyAppShell>
    );
  }

  const { profile, stats, todaysClasses, pendingWork, studentAlerts, recentActivities } = data || {
    profile: { id: '', name: '', title: 'Faculty', department: 'Department', email: '', office: '', academicYear: '' },
    stats: { myCoursesCount: 0, studentsCount: 0, todaysClassesCount: 0, pendingEvaluationsCount: 0, activeAssignmentsCount: 0, attendanceAlertsCount: 0 },
    todaysClasses: [],
    pendingWork: [],
    studentAlerts: [],
    recentActivities: []
  };

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const facultyName = authProfile?.full_name || user?.email?.split('@')[0] || profile?.name || 'Faculty Member';
  const deptDisplayName = authProfile?.department?.name || 'Department not assigned';

  return (
    <FacultyAppShell>
      {/* Dashboard Greeting Header */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', textAlign: 'left' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--brand-black)', margin: 0 }}>
            {getGreeting()}, {facultyName} 👋
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', fontWeight: 500, margin: 0 }}>
            {deptDisplayName} · Faculty
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }} onClick={() => setIsCreateAssignmentOpen(true)}>
            <Plus size={16} />
            <span>Create Assignment</span>
          </button>
          <button className="btn btn-secondary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }} onClick={() => navigate('/faculty/attendance')}>
            <CalendarCheck size={16} />
            <span>Mark Attendance</span>
          </button>
        </div>
      </div>

      {/* 6 Key StatCards */}
      <div className="stat-cards-grid" style={{ gap: '0.85rem', marginBottom: '1.25rem' }}>
        <StatCard 
          title="My Courses" 
          value={stats.myCoursesCount.toString()} 
          icon={<BookOpen size={18} />}
        />
        <StatCard 
          title="Total Students" 
          value={stats.studentsCount.toString()} 
          icon={<Users size={18} />}
        />
        <StatCard 
          title="Today's Classes" 
          value={stats.todaysClassesCount.toString()} 
          icon={<Clock size={18} />}
        />
        <StatCard 
          title="Pending Evaluations" 
          value={stats.pendingEvaluationsCount.toString()} 
          icon={<ClipboardList size={18} />}
        />
        <StatCard 
          title="Active Assignments" 
          value={stats.activeAssignmentsCount.toString()} 
          icon={<FileText size={18} />}
        />
        <StatCard 
          title="Attendance Alerts" 
          value={stats.attendanceAlertsCount.toString()} 
          icon={<AlertTriangle size={18} />}
        />
      </div>

      {/* Main 2-Column Dashboard Grid */}
      <div className="dashboard-grid-two-col" style={{ gap: '1.25rem' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Today's Classes */}
          <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
            <div className="panel-header-row" style={{ marginBottom: '0.85rem' }}>
              <h3 className="panel-title" style={{ fontSize: '1rem', fontWeight: 800 }}>Today's Class Schedule</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
                  {todaysClasses.length} Sessions
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', width: 'auto' }}
                  onClick={() => navigate('/faculty/timetable')}
                >
                  View Full Timetable
                </button>
              </div>
            </div>

            <div className="priority-list" style={{ gap: '0.5rem' }}>
              {todaysClasses.length === 0 ? (
                <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>
                  No classes scheduled for today.
                </div>
              ) : (
                todaysClasses.map((cls) => (
                  <div 
                    key={cls.id} 
                    className={`priority-item ${cls.status === 'Current' ? 'high-priority' : ''}`}
                    style={{ padding: '0.65rem 0.85rem' }}
                  >
                    <div className="priority-details">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                        <span className="badge badge-secondary" style={{ fontSize: '0.675rem', padding: '0.1rem 0.35rem' }}>{cls.courseCode}</span>
                        <span className="priority-title" style={{ fontSize: '0.875rem' }}>{cls.courseName}</span>
                      </div>
                      <span className="priority-meta" style={{ fontSize: '0.75rem' }}>
                        {cls.time} · {cls.room} · Semester {cls.semester}
                      </span>
                    </div>

                    <span className={`badge ${
                      cls.status === 'Completed' ? 'badge-graded' :
                      cls.status === 'Current' ? 'badge-overdue' : 'badge-pending'
                    }`} style={{ fontSize: '0.7rem' }}>
                      {cls.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Action Items */}
          <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
            <div className="panel-header-row" style={{ marginBottom: '0.85rem' }}>
              <h3 className="panel-title" style={{ fontSize: '1rem', fontWeight: 800 }}>Pending Action Items</h3>
              <span className="badge badge-overdue" style={{ fontSize: '0.675rem' }}>Attention Needed</span>
            </div>

            <div className="priority-list" style={{ gap: '0.5rem' }}>
              {pendingWork.length === 0 ? (
                <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>
                  No pending evaluations or actions.
                </div>
              ) : (
                pendingWork.map((pw) => (
                  <div key={pw.id} className="priority-item" style={{ padding: '0.65rem 0.85rem' }}>
                    <div className="priority-details">
                      <span className="priority-title" style={{ fontSize: '0.875rem' }}>{pw.title}</span>
                      <span className="priority-meta" style={{ fontSize: '0.75rem' }}>
                        {pw.type === 'assignment' ? `${pw.pendingCount} submissions pending evaluation` : 'Attendance submission pending'}
                      </span>
                    </div>

                    <button 
                      className="btn btn-secondary" 
                      style={{ width: 'auto', padding: '0.25rem 0.65rem', fontSize: '0.775rem' }}
                      onClick={() => navigate(pw.link)}
                    >
                      <span>{pw.type === 'assignment' ? 'Review' : 'Mark'}</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Quick Actions Panel */}
          <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
            <div className="panel-header-row" style={{ marginBottom: '0.75rem' }}>
              <h3 className="panel-title" style={{ fontSize: '1rem', fontWeight: 800 }}>Quick Actions</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              <button className="btn btn-secondary" style={{ justifyContent: 'center', padding: '0.5rem', fontSize: '0.825rem' }} onClick={() => setIsCreateAssignmentOpen(true)}>
                <Plus size={16} />
                <span>Create Assignment</span>
              </button>
              <button className="btn btn-secondary" style={{ justifyContent: 'center', padding: '0.5rem', fontSize: '0.825rem' }} onClick={() => navigate('/faculty/attendance')}>
                <CalendarCheck size={16} />
                <span>Mark Attendance</span>
              </button>
              <button className="btn btn-secondary" style={{ justifyContent: 'center', padding: '0.5rem', fontSize: '0.825rem' }} onClick={() => navigate('/faculty/students')}>
                <Users size={16} />
                <span>View Students</span>
              </button>
              <button className="btn btn-secondary" style={{ justifyContent: 'center', padding: '0.5rem', fontSize: '0.825rem' }} onClick={() => navigate('/faculty/courses')}>
                <BookOpen size={16} />
                <span>My Courses</span>
              </button>
            </div>
          </div>

          {/* Student Academic Alerts */}
          <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
            <div className="panel-header-row" style={{ marginBottom: '0.75rem' }}>
              <h3 className="panel-title" style={{ fontSize: '1rem', fontWeight: 800 }}>Student Academic Alerts</h3>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', width: 'auto' }} onClick={() => navigate('/faculty/students')}>
                View All
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {studentAlerts.length === 0 ? (
                <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>
                  All students are maintaining good academic standing. No attendance alerts.
                </div>
              ) : (
                studentAlerts.map((alt) => (
                  <div key={alt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.65rem 0.75rem', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--brand-light-grey)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                    <AlertCircle size={16} style={{ color: alt.severity === 'high' ? 'var(--color-error)' : 'var(--brand-orange)', marginTop: '2px', flexShrink: 0 }} />
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--brand-black)' }}>{alt.studentName}</span>
                        <span style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>{alt.usn}</span>
                      </div>
                      <p style={{ fontSize: '0.775rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem', margin: 0 }}>{alt.details}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
            <div className="panel-header-row" style={{ marginBottom: '0.75rem' }}>
              <h3 className="panel-title" style={{ fontSize: '1rem', fontWeight: 800 }}>Recent Activity</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {recentActivities.length === 0 ? (
                <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>
                  No recent faculty activity logged.
                </div>
              ) : (
                recentActivities.map((act) => (
                  <div key={act.id} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                    <div style={{ 
                      width: '26px', 
                      height: '26px', 
                      borderRadius: '50%', 
                      backgroundColor: 'rgba(11, 83, 160, 0.1)', 
                      color: 'var(--brand-blue)',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0 
                    }}>
                      <CheckCircle2 size={14} />
                    </div>

                    <div>
                      <span style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--brand-dark-grey)', display: 'block' }}>
                        {act.day} · {act.timestamp}
                      </span>
                      <p style={{ fontSize: '0.825rem', color: 'var(--brand-black)', marginTop: '0.05rem', margin: 0 }}>
                        {act.description}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Assignment Modal */}
      <CreateAssignmentModal 
        isOpen={isCreateAssignmentOpen}
        onClose={() => setIsCreateAssignmentOpen(false)}
        onSuccess={fetchDashboardData}
      />
    </FacultyAppShell>
  );
};

export default FacultyDashboard;
