import React, { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, Users, CalendarCheck, Award, FileText, Printer, Filter, AlertTriangle, CheckCircle2, UserCheck } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { StatCard } from '../../components/StatCard';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { getDepartmentOverview, getDepartmentAttendanceMetrics } from '../../services/departmentService';
import { getDepartmentResultSummaries, type CourseResultSummary } from '../../services/resultService';
import { getSemesterPerformanceSummary } from '../../services/resultService';
import { getDepartmentDetailData } from '../../services/departmentService';
import type { DepartmentOverview, DepartmentAttendanceMetrics } from '../../services/departmentService';
import { useAuth } from '../../app/context/AuthContext';

export const HODAnalyticsPage: React.FC = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'analytics' | 'reports'>('analytics');
  const [reportType, setReportType] = useState<'Overview' | 'Attendance' | 'Performance' | 'Course'>('Overview');
  const [semFilter, setSemFilter] = useState('All');
  const [facultyRoster, setFacultyRoster] = useState<NonNullable<Awaited<ReturnType<typeof getDepartmentDetailData>>>['faculty']>([]);
  const [courseResults, setCourseResults] = useState<CourseResultSummary[]>([]);
  const [overview, setOverview] = useState<DepartmentOverview | null>(null);
  const [attendance, setAttendance] = useState<DepartmentAttendanceMetrics | null>(null);
  const [semesterPerformance, setSemesterPerformance] = useState<{ semester: number; averagePercent: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalyticsData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [overviewData, attendanceData, cResults, semesterData, departmentData] = await Promise.all([
          getDepartmentOverview(),
          getDepartmentAttendanceMetrics(),
          getDepartmentResultSummaries(profile?.department_id || undefined),
          getSemesterPerformanceSummary(profile?.department_id || undefined),
          profile?.department_id ? getDepartmentDetailData(profile.department_id) : Promise.resolve(null),
        ]);
        setOverview(overviewData);
        setAttendance(attendanceData);
        setFacultyRoster(departmentData?.faculty || []);
        setCourseResults(cResults);
        setSemesterPerformance(semesterData);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Unable to load department analytics.');
        console.error("Error loading analytics data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadAnalyticsData();
  }, [profile?.department_id]);

  const handlePrintReport = () => {
    window.print();
  };

  const filteredCourseResults = courseResults.filter(r => semFilter === 'All' || r.semester === Number(semFilter));
  const attendanceByCourse = new Map((attendance?.courseAttendance || []).map(course => [course.courseId, course]));

  if (loading) return <HODAppShell><LoadingState message="Loading department analytics..." /></HODAppShell>;
  if (loadError) return <HODAppShell><ErrorState message={loadError} onRetry={() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getDepartmentOverview(),
      getDepartmentAttendanceMetrics(),
      getDepartmentResultSummaries(profile?.department_id || undefined),
      getSemesterPerformanceSummary(profile?.department_id || undefined),
      profile?.department_id ? getDepartmentDetailData(profile.department_id) : Promise.resolve(null),
    ]).then(([overviewData, attendanceData, resultsData, semesterData, departmentData]) => {
      setOverview(overviewData);
      setAttendance(attendanceData);
      setCourseResults(resultsData);
      setSemesterPerformance(semesterData);
      setFacultyRoster(departmentData?.faculty || []);
    }).catch(error => setLoadError(error instanceof Error ? error.message : 'Unable to load department analytics.')).finally(() => setLoading(false));
  }} /></HODAppShell>;
  if (!overview || !attendance) return <HODAppShell><EmptyState title="Analytics unavailable" message="No department analytics records are available." /></HODAppShell>;

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">ACADEMIC GOVERNANCE</span>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Department Analytics & Reports
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            {overview.departmentName} academic performance and attendance
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: 'var(--brand-light-grey)', padding: '0.25rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
            >
              Analytics Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={`btn ${activeTab === 'reports' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
            >
              Generate Reports
            </button>
          </div>

          {activeTab === 'reports' && (
            <button onClick={handlePrintReport} className="btn btn-secondary font-sans">
              <Printer size={16} />
              <span>Print Report</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'analytics' ? (
        <>
          {/* Department Performance Stat Cards */}
          <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
            <StatCard
              title="AVERAGE CGPA"
              value={overview.averageCgpa ?? 'No data'}
              subtitle="Weighted from recorded results"
              icon={<Award size={22} />}
            />
            <StatCard
              title="ATTENDANCE RATE"
              value={`${attendance.overallAttendance}%`}
              subtitle="Calculated from recorded sessions"
              icon={<CalendarCheck size={22} />}
            />
            <StatCard
              title="ASSIGNMENT COMPLETION"
              value={overview.assignmentCompletionPercent == null ? 'No data' : `${overview.assignmentCompletionPercent}%`}
              subtitle="Submitted assignments / enrolled course workload"
              icon={<CheckCircle2 size={22} />}
            />
            <StatCard
              title="OVERALL PASS RATE"
              value={overview.passRatePercent == null ? 'No data' : `${overview.passRatePercent}%`}
              subtitle="Pass / fail results only"
              icon={<TrendingUp size={22} />}
            />
          </div>

          {/* Semester Performance Chart Bars & Alerts */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
            
            {/* Student Performance per Semester */}
            <div className="dashboard-panel">
              <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Semester Academic Averages</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {semesterPerformance.map((item) => (
                  <div key={item.semester}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
                      <span>Semester {item.semester}</span>
                      <span className="font-mono text-blue">{item.averagePercent}%</span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: 'var(--brand-light-grey)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${item.averagePercent}%`, backgroundColor: item.averagePercent >= 80 ? 'var(--color-success)' : 'var(--brand-blue)', borderRadius: '4px' }} />
                    </div>
                  </div>
                ))}
                {semesterPerformance.length === 0 && <EmptyState title="No semester results" message="Semester performance appears after results are recorded." />}
              </div>
            </div>

            {/* Academic Alerts Box */}
            <div className="dashboard-panel">
              <h2 className="panel-title font-display text-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <AlertTriangle size={18} />
                <span>Academic Alerts</span>
              </h2>

              {attendance.lowAttendanceStudents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                  {attendance.lowAttendanceStudents.slice(0, 6).map(student => (
                    <div key={student.studentId} style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', padding: '0.65rem', borderRadius: 'var(--border-radius)' }}>
                      <strong>{student.studentName}</strong> ({student.usn}) · {student.attendancePercent}% attendance
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No attendance alerts" message="No student with recorded sessions is below 75%." />}
            </div>

          </div>

          {/* Course Performance Table */}
          <div className="dashboard-panel" style={{ marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 className="panel-title font-display">Course Analytics Matrix</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>Attendance, Assignment & Assessment Metrics by Course</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={14} style={{ color: 'var(--brand-dark-grey)' }} />
                <select 
                  className="form-select font-sans"
                  style={{ width: '140px', padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
                  value={semFilter}
                  onChange={(e) => setSemFilter(e.target.value)}
                >
                  <option value="All">All Semesters</option>
                  <option value="4">Semester 4</option>
                  <option value="6">Semester 6</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', fontWeight: 700, color: 'var(--brand-black)', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Course Code & Name</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Faculty In-Charge</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Students</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Attendance</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Assignment %</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Exam Average</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Pass Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourseResults.map((cr) => (
                    <tr key={cr.courseId} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span className="font-mono text-blue font-bold">{cr.courseCode}</span>
                        <div style={{ fontWeight: 700, color: 'var(--brand-black)' }}>{cr.courseName}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{cr.facultyName}</td>
                      <td style={{ padding: '0.85rem 1rem' }} className="font-mono">{cr.totalStudents}</td>
                      <td style={{ padding: '0.85rem 1rem' }} className="font-mono font-bold text-blue">{attendanceByCourse.get(cr.courseId)?.attendancePercent ?? 'No sessions'}{attendanceByCourse.has(cr.courseId) ? '%' : ''}</td>
                      <td style={{ padding: '0.85rem 1rem' }} className="font-mono font-bold">Not available</td>
                      <td style={{ padding: '0.85rem 1rem' }} className="font-mono font-bold">{cr.averageMarksPercent}%</td>
                      <td style={{ padding: '0.85rem 1rem' }} className="font-mono text-success font-bold">{cr.passRatePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Faculty Activity Monitoring Table */}
          <div className="dashboard-panel">
            <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Department Faculty Activity Overview</h2>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', fontWeight: 700, color: 'var(--brand-black)', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Faculty Name</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Designation</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Assigned Courses</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {facultyRoster.map((fac) => (
                    <tr key={fac.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--brand-black)' }}>{fac.name}</td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--brand-dark-grey)' }}>{fac.designation}</td>
                      <td style={{ padding: '0.85rem 1rem' }} className="font-mono font-bold">{fac.assignedCourseCount} Courses</td>
                      <td style={{ padding: '0.85rem 1rem' }}><span className={`badge ${fac.status === 'ACTIVE' ? 'badge-active' : 'badge-pending'}`}>{fac.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Report Generation Mode */
        <div className="dashboard-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <div>
              <h2 className="panel-title font-display">Printable Department Report View</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>Select report category and preview formal academic summary</p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['Overview', 'Attendance', 'Performance', 'Course'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setReportType(r)}
                  className={`btn ${reportType === r ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  {r} Report
                </button>
              ))}
            </div>
          </div>

          {/* Printable Report Page Box */}
          <div 
            id="printable-report"
            style={{
              backgroundColor: '#FFF',
              padding: '2rem',
              border: '1px solid rgba(156, 163, 175, 0.3)',
              borderRadius: 'var(--border-radius)',
              color: 'var(--brand-black)'
            }}
          >
            {/* Formal College Header */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid var(--brand-black)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', margin: '0.25rem 0 0 0' }}>
                Department of {overview.departmentName}
              </p>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-blue)', marginTop: '0.5rem', margin: 0 }}>
                {reportType.toUpperCase()} ACADEMIC REPORT — AY {overview.academicYear}
              </h3>
            </div>

            {/* Report Metadata */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginBottom: '1.5rem' }}>
              <div>Generated By: <strong>{overview.hodName}</strong></div>
              <div>Date: <strong className="font-mono">{new Date().toLocaleDateString()}</strong></div>
              <div>Scope: <strong>{overview.departmentName}</strong></div>
            </div>

            {/* Content summary based on type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Executive Summary</h4>
                <p style={{ fontSize: '0.875rem', lineHeight: 1.5, margin: 0 }}>
                  This report summarizes currently recorded academic results, attendance sessions, assignment submissions, and departmental review workload for {overview.departmentName}. Missing source records are shown as unavailable rather than estimated.
                </p>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem', marginTop: '1rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid var(--brand-black)', fontWeight: 700 }}>
                    <th style={{ padding: '0.75rem' }}>Indicator</th>
                    <th style={{ padding: '0.75rem' }}>Current Metric</th>
                    <th style={{ padding: '0.75rem' }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>Overall Attendance</td>
                    <td style={{ padding: '0.75rem' }} className="font-mono font-bold">{attendance.overallAttendance}%</td>
                    <td style={{ padding: '0.75rem' }}>Attendance session records</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>Assignment Submissions</td>
                    <td style={{ padding: '0.75rem' }} className="font-mono font-bold">{overview.assignmentCompletionPercent == null ? 'Not available' : `${overview.assignmentCompletionPercent}%`}</td>
                    <td style={{ padding: '0.75rem' }}>Course enrollments and assignment submissions</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>Examination Pass Rate</td>
                    <td style={{ padding: '0.75rem' }} className="font-mono font-bold">{overview.passRatePercent == null ? 'Not available' : `${overview.passRatePercent}%`}</td>
                    <td style={{ padding: '0.75rem' }}>Recorded Pass/Fail results</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '2rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderBottom: '1px solid var(--brand-black)', width: '180px', marginBottom: '0.25rem' }}></div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Department Coordinator</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderBottom: '1px solid var(--brand-black)', width: '180px', marginBottom: '0.25rem' }}></div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{overview.hodName}</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </HODAppShell>
  );
};

export default HODAnalyticsPage;
