import React, { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, Users, HelpCircle, CheckSquare, Filter, BarChart3 } from 'lucide-react';
import { getAttendanceSummary, subscribeToStudentAttendance } from '../services/attendanceService';
import type { AttendanceSummary } from '../data/attendance';
import { AppShell } from '../components/AppShell';
import { StatCard } from '../components/StatCard';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const AttendanceDetail: React.FC = () => {
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async (courseFilter?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAttendanceSummary(courseFilter);
      setAttendance(data);
    } catch (err) {
      setError("Unable to load attendance details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance(selectedCourse);
  }, [fetchAttendance, selectedCourse]);

  // Real-time subscription to student attendance record changes
  useEffect(() => {
    const unsubscribe = subscribeToStudentAttendance(() => {
      fetchAttendance(selectedCourse);
    });
    return () => {
      unsubscribe();
    };
  }, [fetchAttendance, selectedCourse]);

  if (isLoading && !attendance) {
    return (
      <AppShell>
        <LoadingState message="Loading attendance analytics..." />
      </AppShell>
    );
  }

  if (error || !attendance) {
    return (
      <AppShell>
        <ErrorState message={error || "Failed to load attendance summary"} onRetry={() => fetchAttendance(selectedCourse)} />
      </AppShell>
    );
  }

  const counts = attendance.counts || {
    totalConducted: attendance.subjects.reduce((sum, s) => sum + s.held, 0),
    present: attendance.subjects.reduce((sum, s) => sum + s.attended, 0),
    late: 0,
    absent: attendance.subjects.reduce((sum, s) => sum + (s.held - s.attended), 0),
  };

  const totalConducted = counts.totalConducted;
  const sessionsAttended = counts.present + counts.late;

  const presentPct = totalConducted > 0 ? Math.round((counts.present / totalConducted) * 100) : 0;
  const latePct = totalConducted > 0 ? Math.round((counts.late / totalConducted) * 100) : 0;
  const absentPct = totalConducted > 0 ? Math.round((counts.absent / totalConducted) * 100) : 0;

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'Good': return 'badge-graded';
      case 'Monitor': return 'badge-pending';
      case 'Critical': return 'badge-overdue';
      default: return 'badge-upcoming';
    }
  };

  const getAttendanceBadgeClass = (status: string) => {
    switch (status) {
      case 'Present': return 'badge-graded';
      case 'Late': return 'badge-pending';
      case 'Absent': return 'badge-overdue';
      default: return 'badge-upcoming';
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container" style={{ marginBottom: '1.25rem' }}>
        <div style={{ textAlign: 'left' }}>
          <div className="breadcrumbs">
            <span>Academics</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Attendance</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>Attendance Analytics</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Monitor your course attendance metrics, monthly trends, and session logs in real time.
          </p>
        </div>

        {/* Course Filter Dropdown */}
        {attendance.subjects.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={16} style={{ color: 'var(--brand-dark-grey)' }} />
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="form-input font-sans"
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--brand-border)',
                backgroundColor: 'var(--brand-white)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              <option value="ALL">All Courses ({attendance.subjects.length})</option>
              {attendance.subjects.map(s => (
                <option key={s.code} value={s.code}>{s.code} - {s.subject}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="stat-cards-grid">
        <StatCard 
          title="Overall Attendance" 
          value={`${attendance.overallPercentage}%`} 
          icon={<CalendarCheck size={20} />} 
        />
        <StatCard 
          title="Sessions Attended" 
          value={sessionsAttended} 
          icon={<CheckSquare size={20} />} 
        />
        <StatCard 
          title="Total Classes Conducted" 
          value={totalConducted} 
          icon={<Users size={20} />} 
        />
        <StatCard 
          title="Minimum Required" 
          value="75%" 
          icon={<HelpCircle size={20} />} 
        />
      </div>

      {/* Layout Grid */}
      {totalConducted === 0 ? (
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--brand-dark-grey)' }}>
          <CalendarCheck size={48} style={{ margin: '0 auto 1rem', opacity: 0.35, color: 'var(--brand-blue)' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-black)' }}>No attendance records yet.</h3>
          <p style={{ fontSize: '0.875rem', marginTop: '0.35rem', maxWidth: '420px', marginInline: 'auto' }}>
            Your class attendance sessions and subject breakdown will appear here once your faculty instructors record session logs.
          </p>
        </div>
      ) : (
        <div className="dashboard-grid-two-col">
          {/* Left Column: Analytics, Charts & Subject Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
            
            {/* Horizontal Bar Chart: Attendance Status Distribution */}
            <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart3 size={18} style={{ color: 'var(--brand-blue)' }} />
                  <h3 className="panel-title" style={{ margin: 0 }}>Attendance Status Distribution</h3>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)' }}>
                  {totalConducted} Total Sessions
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Present Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10B981' }}></span>
                      Present
                    </span>
                    <span style={{ fontWeight: 700, color: '#065F46' }}>
                      {counts.present} sessions ({presentPct}%)
                    </span>
                  </div>
                  <div style={{ height: '10px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${presentPct}%`,
                        backgroundColor: '#10B981',
                        borderRadius: '5px',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>

                {/* Late Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#F59E0B' }}></span>
                      Late
                    </span>
                    <span style={{ fontWeight: 700, color: '#92400E' }}>
                      {counts.late} sessions ({latePct}%)
                    </span>
                  </div>
                  <div style={{ height: '10px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${latePct}%`,
                        backgroundColor: '#F59E0B',
                        borderRadius: '5px',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>

                {/* Absent Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#EF4444' }}></span>
                      Absent
                    </span>
                    <span style={{ fontWeight: 700, color: '#991B1B' }}>
                      {counts.absent} sessions ({absentPct}%)
                    </span>
                  </div>
                  <div style={{ height: '10px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${absentPct}%`,
                        backgroundColor: '#EF4444',
                        borderRadius: '5px',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Subject Breakdown */}
            <div className="dashboard-panel">
              <h3 className="panel-title">Subject Wise Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {attendance.subjects.map((sub) => (
                  <div key={sub.code} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--brand-black)' }}>{sub.subject}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginLeft: '0.5rem' }}>({sub.code})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                          {sub.attended} / {sub.held} Lectures
                        </span>
                        <span className={`badge ${getStatusClass(sub.status)}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                          {sub.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className="progress-bar-bg">
                      <div 
                        className="progress-bar-fill" 
                        style={{ 
                          width: `${sub.percentage}%`,
                          backgroundColor: sub.percentage >= 85 ? 'var(--color-success, #10B981)' : sub.percentage >= 75 ? 'var(--brand-orange, #F59E0B)' : 'var(--color-error, #EF4444)'
                        }}
                      ></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textAlign: 'right' }}>
                      {sub.percentage}% Attended
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Attendance Analytics (Stacked Bar Chart) */}
            {attendance.trend.length > 0 && (
              <div className="chart-container-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 className="panel-title" style={{ margin: 0 }}>Attendance Monthly Trend</h3>
                  
                  {/* Legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#10B981' }}></span> Present
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#F59E0B' }}></span> Late
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#EF4444' }}></span> Absent
                    </span>
                  </div>
                </div>

                {/* Stacked Bar Visual */}
                <div className="bar-chart-visual" style={{ minHeight: '180px', display: 'flex', alignItems: 'flex-end', gap: '1.25rem', paddingTop: '1rem' }}>
                  {attendance.trend.map((t, idx) => {
                    const monthConducted = t.conducted || 1;
                    const mPresentPct = Math.round(((t.present || 0) / monthConducted) * 100);
                    const mLatePct = Math.round(((t.late || 0) / monthConducted) * 100);
                    const mAbsentPct = Math.max(0, 100 - (mPresentPct + mLatePct));

                    return (
                      <div key={idx} className="bar-chart-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div className="bar-chart-bar-wrapper" style={{ width: '100%', maxWidth: '36px', height: '140px', backgroundColor: '#F1F5F9', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', position: 'relative' }}>
                          <div title={`Present: ${t.present || 0}`} style={{ height: `${mPresentPct}%`, backgroundColor: '#10B981', transition: 'height 0.3s ease' }} />
                          <div title={`Late: ${t.late || 0}`} style={{ height: `${mLatePct}%`, backgroundColor: '#F59E0B', transition: 'height 0.3s ease' }} />
                          <div title={`Absent: ${t.absent || 0}`} style={{ height: `${mAbsentPct}%`, backgroundColor: '#EF4444', transition: 'height 0.3s ease' }} />
                        </div>
                        <span className="bar-chart-label" style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '0.5rem', color: 'var(--brand-dark-grey)' }}>
                          {t.month}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-black)' }}>
                          {t.percentage}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Compact Status Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
                  <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Present</span>
                    <strong style={{ fontSize: '1.1rem', color: '#065F46' }}>{counts.present}</strong>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#047857' }}>{presentPct}%</span>
                  </div>

                  <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '6px', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#B45309', textTransform: 'uppercase' }}>Late</span>
                    <strong style={{ fontSize: '1.1rem', color: '#92400E' }}>{counts.late}</strong>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#B45309' }}>{latePct}%</span>
                  </div>

                  <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase' }}>Absent</span>
                    <strong style={{ fontSize: '1.1rem', color: '#991B1B' }}>{counts.absent}</strong>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#B91C1C' }}>{absentPct}%</span>
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Right Column: Session History Logs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
            
            <div className="dashboard-panel">
              <div className="panel-header-row">
                <h3 className="panel-title">Session History Logs</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
                  {attendance.history.length} Sessions
                </span>
              </div>

              <div className="attendance-history-list">
                {attendance.history.map((log, idx) => (
                  <div key={idx} className="attendance-history-card">
                    <div className="attendance-history-left">
                      <span className="attendance-history-date">
                        {new Date(log.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="attendance-history-subject">{log.subject}</span>
                      <span className="attendance-history-meta">
                        ⏱️ {log.session} · Instructor: {log.faculty}
                      </span>
                    </div>
                    
                    <div className="attendance-history-right">
                      <span className={`badge ${getAttendanceBadgeClass(log.status)}`} style={{ minWidth: '70px', justifyContent: 'center' }}>
                        {log.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </AppShell>
  );
};
export default AttendanceDetail;
