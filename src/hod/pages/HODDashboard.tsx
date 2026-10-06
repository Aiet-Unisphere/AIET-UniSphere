import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  UserCheck, 
  GraduationCap, 
  BookOpen, 
  CalendarCheck, 
  AlertTriangle, 
  Clock, 
  ArrowRight,
  TrendingUp,
  FileCheck,
  CheckCircle2
} from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { StatCard } from '../../components/StatCard';
import { EmptyState } from '../../components/EmptyState';
import { 
  getDepartmentOverview, 
  getDepartmentActivityLogs, 
  getDepartmentAttendanceMetrics
} from '../../services/departmentService';
import type { DepartmentOverview, DepartmentAttendanceMetrics } from '../../services/departmentService';

import { useAuth } from '../../app/context/AuthContext';

export const HODDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { profile: authProfile, user, refreshProfile } = useAuth();
  const [overview, setOverview] = useState<DepartmentOverview | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshProfile();
    const loadData = async () => {
      setLoading(true);
      try {
        const [ov, act, att] = await Promise.all([
          getDepartmentOverview(),
          getDepartmentActivityLogs(),
          getDepartmentAttendanceMetrics()
        ]);
        setOverview(ov);
        setActivities(act);
        setAttendanceData(att);
      } catch (err) {
        console.error("Error loading HOD dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading || !overview) {
    return (
      <HODAppShell>
        <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(255, 79, 24, 0.2)', borderTopColor: 'var(--brand-orange)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--brand-dark-grey)', fontSize: '0.9rem', fontWeight: 500 }}>Loading Department Analytics...</p>
        </div>
      </HODAppShell>
    );
  }

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const hodName = authProfile?.full_name || user?.email?.split('@')[0] || overview.hodName || 'Head of Department';
  const deptDisplayName = authProfile?.department?.name || 'Department not assigned';
  const lowAttendanceStudents: DepartmentAttendanceMetrics['lowAttendanceStudents'] = attendanceData?.lowAttendanceStudents || [];

  return (
    <HODAppShell>
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span className="badge badge-active font-mono">DEPARTMENT HEAD DASHBOARD</span>
          <span className="badge badge-graded font-mono">AY {overview.academicYear}</span>
        </div>
        <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
          {getGreeting()}, {hodName} 👋
        </h1>
        <p style={{ fontSize: '0.925rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
          {deptDisplayName} — Academic Operations & Governance
        </p>
      </div>

      {/* Quick Action Navigation Grid (2x2) */}
      <div className="hod-quick-actions-grid">
        <button 
          onClick={() => navigate('/hod/faculty')} 
          className="hod-quick-action-card"
        >
          <UserCheck size={21} style={{ flexShrink: 0 }} />
          <span>View Faculty</span>
        </button>

        <button 
          onClick={() => navigate('/hod/students')} 
          className="hod-quick-action-card"
        >
          <GraduationCap size={21} style={{ flexShrink: 0 }} />
          <span>View Students</span>
        </button>

        <button 
          onClick={() => navigate('/hod/courses')} 
          className="hod-quick-action-card"
        >
          <BookOpen size={21} style={{ flexShrink: 0 }} />
          <span>View Courses</span>
        </button>

        <button 
          onClick={() => navigate('/hod/attendance')} 
          className="hod-quick-action-card primary"
        >
          <CalendarCheck size={21} style={{ flexShrink: 0 }} />
          <span>View Attendance</span>
        </button>
      </div>

      {/* 6 Key Department Overview Stat Cards */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          title="TOTAL FACULTY"
          value={overview.totalFaculty}
          subtitle={`${overview.activeFacultyCount} active accounts`}
          icon={<UserCheck size={22} />}
        />
        <StatCard
          title="TOTAL STUDENTS"
          value={overview.totalStudents}
          subtitle={`${overview.activeStudents} active accounts`}
          icon={<GraduationCap size={22} />}
        />
        <StatCard
          title="ACTIVE COURSES"
          value={overview.activeCourses}
          subtitle="Department Course Catalog"
          icon={<BookOpen size={22} />}
        />
        <StatCard
          title="DEPT ATTENDANCE"
          value={`${overview.overallAttendancePercent}%`}
          subtitle="Calculated from recorded sessions"
          icon={<CalendarCheck size={22} />}
        />
        <StatCard
          title="ACADEMIC ALERTS"
          value={overview.academicAlertsCount}
          subtitle="Requiring Attention"
          icon={<AlertTriangle size={22} />}
        />
        <StatCard
          title="PENDING REVIEWS"
          value={overview.pendingReviewsCount}
          subtitle="Approvals & Evaluation Logs"
          icon={<FileCheck size={22} />}
        />
      </div>

      {/* Main Grid — Faculty & Student Overview Blocks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        
        {/* Faculty Overview Panel */}
        <div className="dashboard-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 className="panel-title font-display">Faculty Overview</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                Department Academic Staff & Activity Status
              </p>
            </div>
            <button onClick={() => navigate('/hod/faculty')} className="btn-link font-sans" style={{ fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>Faculty Roster</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1.25rem' }}>
            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <span className="text-dark-grey" style={{ fontSize: '0.75rem', fontWeight: 600 }}>SCHEDULED TODAY</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>{overview.activeFacultyToday}</div>
              <span style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Faculty with a timetable entry today</span>
            </div>

            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <span className="text-dark-grey" style={{ fontSize: '0.75rem', fontWeight: 600 }}>PENDING REVIEWS</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>{overview.pendingReviewsCount}</div>
              <span style={{ fontSize: '0.725rem', color: 'var(--brand-orange)', fontWeight: 600 }}>Submitted work and leave requests</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(attendanceData?.courseAttendance || []).slice(0, 4).map((course: DepartmentAttendanceMetrics['courseAttendance'][number]) => (
              <div key={course.courseId} style={{ padding: '0.75rem 0.9rem', borderRadius: 'var(--border-radius)', borderLeft: '4px solid var(--brand-blue)', backgroundColor: 'var(--brand-white)', boxShadow: 'var(--box-shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-black)' }}>{course.courseName}</span>
                  <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>{course.courseCode}</span>
                </div>
                <p style={{ fontSize: '0.775rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
                  {course.facultyName} · {course.studentCount} enrolled · {course.attendancePercent}% attendance
                </p>
              </div>
            ))}
            {(attendanceData?.courseAttendance || []).length === 0 && <EmptyState title="No course attendance recorded" message="Course summaries appear after attendance sessions are recorded." />}
          </div>
        </div>

        {/* Student Overview Panel */}
        <div className="dashboard-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 className="panel-title font-display">Student Performance Overview</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                Department Student Metrics & At-Risk Summary
              </p>
            </div>
            <button onClick={() => navigate('/hod/students')} className="btn-link font-sans" style={{ fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>Student Directory</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '0.85rem', borderRadius: 'var(--border-radius)', textAlign: 'center', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-dark-grey)' }}>STUDENTS</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.15rem' }}>{overview.activeStudents}</div>
            </div>

            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '0.85rem', borderRadius: 'var(--border-radius)', textAlign: 'center', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-dark-grey)' }}>AVG CGPA</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.15rem' }}>{overview.averageCgpa ?? 'No results'}</div>
            </div>

            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '0.85rem', borderRadius: 'var(--border-radius)', textAlign: 'center', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-error)' }}>AT RISK</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-error)', marginTop: '0.15rem' }}>{lowAttendanceStudents.length}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0.9rem', backgroundColor: '#FEF2F2', borderRadius: 'var(--border-radius)', border: '1px solid #FCA5A5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <AlertTriangle size={18} className="text-error" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#991B1B' }}>Attendance Alert (&lt; 75%)</div>
                  <div style={{ fontSize: '0.75rem', color: '#B91C1C' }}>{lowAttendanceStudents.length} students below the 75% threshold</div>
                </div>
              </div>
              <button onClick={() => navigate('/hod/attendance')} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                Review List
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0.9rem', backgroundColor: '#FFFBEB', borderRadius: 'var(--border-radius)', border: '1px solid #FCD34D' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Clock size={18} style={{ color: '#D97706' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#92400E' }}>Pending Reviews</div>
                  <div style={{ fontSize: '0.75rem', color: '#B45309' }}>{overview.pendingReviewsCount} submitted work items or leave requests awaiting review</div>
                </div>
              </div>
              <button onClick={() => navigate('/hod/students')} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                Inspect
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid — Department Alerts & Recent Shared Activity Stream */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        
        {/* Department Alerts Panel */}
        <div className="dashboard-panel">
          <div style={{ marginBottom: '1rem' }}>
            <h2 className="panel-title font-display">Department Academic Alerts</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
              Flags & Exceptions Across Courses and Faculty
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {lowAttendanceStudents.slice(0, 5).map(student => (
              <div key={student.studentId} style={{ padding: '0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)', backgroundColor: 'var(--brand-white)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{student.studentName}</strong><span className="font-mono">{student.attendancePercent}%</span>
                </div>
                <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>{student.usn} · {student.courseCode}</span>
              </div>
            ))}
            {lowAttendanceStudents.length === 0 && <EmptyState title="No attendance alerts" message="No student with recorded sessions is currently below 75%." />}
          </div>
        </div>

        {/* Shared Recent Department Activity Stream */}
        <div className="dashboard-panel">
          <div style={{ marginBottom: '1rem' }}>
            <h2 className="panel-title font-display">Recent Department Activity</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
              Department activity records
            </p>
          </div>

          {activities.length === 0 ? <EmptyState title="No department activity recorded" message="The database does not currently provide a department-wide activity feed." /> : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {activities.map((act) => (
              <div key={act.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)', backgroundColor: 'var(--brand-white)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255, 79, 24, 0.1)', color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <TrendingUp size={16} />
                </div>
                <div style={{ flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-blue)' }}>{act.type}</span>
                    <span style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)' }}>{act.timestamp}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--brand-black)', marginTop: '0.15rem' }}>{act.title}</div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>
                    By <strong>{act.by}</strong> · {act.details}
                  </p>
                </div>
              </div>
            ))}
          </div>}
        </div>

      </div>
    </HODAppShell>
  );
};

export default HODDashboard;
