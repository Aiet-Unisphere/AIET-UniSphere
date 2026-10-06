import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, AlertTriangle, Eye, CheckCircle2, TrendingUp, BarChart3, Users } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { StatCard } from '../../components/StatCard';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { getDepartmentAttendanceMetrics } from '../../services/departmentService';
import type { DepartmentAttendanceMetrics } from '../../services/departmentService';
import { useAuth } from '../../app/context/AuthContext';

export const HODAttendancePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<DepartmentAttendanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDepartmentAttendanceMetrics();
      setMetrics(data);
    } catch (err: any) {
      console.error("Error loading department attendance metrics:", err);
      setError(err?.message || "Unable to load department attendance metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (loading) {
    return (
      <HODAppShell>
        <LoadingState message="Loading Department Attendance Metrics..." />
      </HODAppShell>
    );
  }

  if (error) {
    return (
      <HODAppShell>
        <ErrorState message={error} onRetry={loadMetrics} />
      </HODAppShell>
    );
  }

  const isEmpty = !metrics || (metrics.overallAttendance === 0 && metrics.courseAttendance.length === 0);

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">DEPARTMENT MANAGEMENT</span>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Department Attendance & Academic Overview
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            {profile?.department?.name || 'Department'} attendance records and compliance
          </p>
        </div>

        {metrics && !isEmpty && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ backgroundColor: 'var(--brand-white)', padding: '0.55rem 1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--brand-black)' }}>
              Overall Rate: <span style={{ color: 'var(--color-success)', fontWeight: 800 }}>{metrics.overallAttendance}%</span>
            </div>
          </div>
        )}
      </div>

      {isEmpty ? (
        <EmptyState
          icon={CalendarCheck}
          title="No attendance records available for your department."
          description="Faculty instructors have not recorded session attendance logs for department courses yet."
        />
      ) : metrics ? (
        <>
          {/* 4 Attendance KPI Stat Cards */}
          <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
            <StatCard
              title="OVERALL ATTENDANCE"
              value={`${metrics.overallAttendance}%`}
              subtitle="Department Target ≥80%"
              icon={<CalendarCheck size={22} />}
            />
            <StatCard
              title="PRESENT RATE"
              value={`${metrics.presentRate}%`}
              subtitle="Enrolled Student Presence"
              icon={<CheckCircle2 size={22} />}
            />
            <StatCard
              title="ABSENT RATE"
              value={`${metrics.absentRate}%`}
              subtitle="Unexcused Absences"
              icon={<AlertTriangle size={22} />}
            />
            <StatCard
              title="LATE RATE"
              value={`${metrics.lateRate}%`}
              subtitle="Session Late Arrivals"
              icon={<TrendingUp size={22} />}
            />
          </div>

          {/* Department Attendance Overview Horizontal Bar Chart */}
          <div className="dashboard-panel" style={{ marginBottom: '1.75rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 size={18} style={{ color: 'var(--brand-blue)' }} />
                <h2 className="panel-title font-display" style={{ margin: 0 }}>Department Attendance Status Breakdown</h2>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-dark-grey)' }}>
                Overall Distribution
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Present Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10B981' }}></span>
                    Present Rate
                  </span>
                  <span style={{ fontWeight: 700, color: '#065F46' }}>
                    {metrics.presentRate}%
                  </span>
                </div>
                <div style={{ height: '10px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${metrics.presentRate}%`,
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
                    Late Rate
                  </span>
                  <span style={{ fontWeight: 700, color: '#92400E' }}>
                    {metrics.lateRate}%
                  </span>
                </div>
                <div style={{ height: '10px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${metrics.lateRate}%`,
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
                    Absent Rate
                  </span>
                  <span style={{ fontWeight: 700, color: '#991B1B' }}>
                    {metrics.absentRate}%
                  </span>
                </div>
                <div style={{ height: '10px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${metrics.absentRate}%`,
                      backgroundColor: '#EF4444',
                      borderRadius: '5px',
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Semester Breakdown Grid */}
          {metrics.semesterBreakdown.length > 0 && (
            <div className="dashboard-panel" style={{ marginBottom: '1.75rem' }}>
              <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Semester Attendance Breakdown</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {metrics.semesterBreakdown.map((sb) => (
                  <div key={sb.semester} style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem 1.25rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>SEMESTER {sb.semester}</span>
                      <span className="font-mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: sb.attendancePercent >= 84 ? 'var(--color-success)' : 'var(--brand-orange)' }}>
                        {sb.attendancePercent}%
                      </span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'rgba(156, 163, 175, 0.2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${sb.attendancePercent}%`, backgroundColor: sb.attendancePercent >= 84 ? 'var(--color-success)' : 'var(--brand-orange)', borderRadius: '3px' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Course Attendance Table */}
          {metrics.courseAttendance.length > 0 && (
            <div className="dashboard-panel" style={{ marginBottom: '1.75rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h2 className="panel-title font-display">Course Attendance Performance</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                  Average Attendance Percentage Across All Department Courses
                </p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', fontWeight: 700, color: 'var(--brand-black)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                      <th style={{ padding: '0.85rem 1rem' }}>Course Code & Name</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Faculty In-Charge</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Enrolled Students</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Avg Attendance</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.courseAttendance.map((ca) => (
                      <tr key={ca.courseId} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className="font-mono text-blue font-bold" style={{ fontSize: '0.825rem' }}>{ca.courseCode}</span>
                          <div style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.1rem' }}>{ca.courseName}</div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                          {ca.facultyName}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                          {ca.studentCount} Students
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className="font-mono" style={{ fontWeight: 800, color: ca.attendancePercent >= 80 ? 'var(--color-success)' : 'var(--brand-orange)' }}>
                            {ca.attendancePercent}%
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className={`badge ${ca.status === 'Healthy' ? 'badge-active' : 'badge-pending'}`}>
                            {ca.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Low Attendance Students Table */}
          {metrics.lowAttendanceStudents.length > 0 && (
            <div className="dashboard-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h2 className="panel-title font-display text-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={18} />
                    <span>Students Below Mandatory Threshold (&lt; 75%)</span>
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                    Immediate HOD Governance & Faculty Intervention List
                  </p>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#FEF2F2', borderBottom: '1px solid #FCA5A5', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                      <th style={{ padding: '0.85rem 1rem' }}>Student Name</th>
                      <th style={{ padding: '0.85rem 1rem' }}>USN</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Semester</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Course</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Attendance Rate</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.lowAttendanceStudents.map((las) => (
                      <tr key={las.studentId} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--brand-black)' }}>
                          {las.studentName}
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className="font-mono text-blue font-bold">{las.usn}</span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                          Semester {las.semester}
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className="badge badge-active">{las.courseCode}</span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className="font-mono text-error font-bold" style={{ fontSize: '0.9rem' }}>
                            {las.attendancePercent}%
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <button 
                            onClick={() => navigate(`/hod/students/${las.studentId}`)}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          >
                            <Eye size={14} />
                            <span>Inspect Student</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </HODAppShell>
  );
};

export default HODAttendancePage;
