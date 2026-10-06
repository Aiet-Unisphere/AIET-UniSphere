import React, { useEffect, useState } from 'react';
import { Award, Filter, TrendingUp, Users, CheckCircle2, AlertTriangle, Eye, X, BookOpen } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { StatCard } from '../../components/StatCard';
import {
  getDepartmentResultSummaries,
  getStudentResultSummary,
  getSemesterPerformanceSummary,
  type CourseResultSummary,
  type StudentResultSummary,
} from '../../services/resultService';
import { useAuth } from '../../app/context/AuthContext';

export const HODResultsPage: React.FC = () => {
  const { profile } = useAuth();
  const [results, setResults] = useState<CourseResultSummary[]>([]);
  const [semPerformance, setSemPerformance] = useState<{ semester: number; averagePercent: number }[]>([]);
  const [semFilter, setSemFilter] = useState('All');
  const [selectedStudent, setSelectedStudent] = useState<StudentResultSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [cResults, sPerf] = await Promise.all([
          getDepartmentResultSummaries(profile?.department_id || undefined),
          getSemesterPerformanceSummary(profile?.department_id || undefined)
        ]);
        setResults(cResults);
        setSemPerformance(sPerf);
      } catch (err) {
        console.error("Error loading results data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [profile?.department_id]);

  const handleOpenStudentResult = async (studentId: string) => {
    const data = await getStudentResultSummary(studentId);
    setSelectedStudent(data);
    setIsModalOpen(true);
  };

  const filteredResults = results.filter(r => semFilter === 'All' || r.semester === Number(semFilter));

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">ACADEMIC GOVERNANCE</span>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Department Academic Results Overview
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            {profile?.department?.name || 'Department'} examination results and semester performance
          </p>
        </div>

      </div>

      {/* Semester Performance Cards */}
      <div className="dashboard-panel" style={{ marginBottom: '1.75rem' }}>
        <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Semester Performance Summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {semPerformance.map((sp) => (
            <div key={sp.semester} style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem 1.25rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>SEMESTER {sp.semester}</span>
                <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: sp.averagePercent >= 80 ? 'var(--color-success)' : 'var(--brand-blue)' }}>
                  {sp.averagePercent}%
                </span>
              </div>
              <div style={{ height: '6px', backgroundColor: 'rgba(156, 163, 175, 0.2)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${sp.averagePercent}%`, backgroundColor: sp.averagePercent >= 80 ? 'var(--color-success)' : 'var(--brand-blue)', borderRadius: '3px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 className="panel-title font-display" style={{ margin: 0 }}>Course Result Metrics</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Filter size={14} style={{ color: 'var(--brand-dark-grey)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-dark-grey)' }}>Semester:</span>
            <select 
              className="form-select font-sans"
              style={{ width: '150px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
              value={semFilter}
              onChange={(e) => setSemFilter(e.target.value)}
            >
              <option value="All">All Semesters</option>
              <option value="3">Semester 3</option>
              <option value="4">Semester 4</option>
              <option value="5">Semester 5</option>
              <option value="6">Semester 6</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Results Table */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            Loading Department Results...
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '1rem 1.25rem' }}>Course Code & Title</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Faculty In-Charge</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Students</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Class Avg</th>
                  <th style={{ padding: '1rem 1.25rem' }}>High / Low</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Pass Rate</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r) => (
                  <tr key={r.courseId} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono text-blue font-bold" style={{ fontSize: '0.825rem' }}>{r.courseCode}</span>
                      <div style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.1rem', fontSize: '0.9rem' }}>{r.courseName}</div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                      {r.facultyName}
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }} className="font-mono font-bold">
                      {r.totalStudents}
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono" style={{ fontWeight: 800, color: r.averageMarksPercent >= 80 ? 'var(--color-success)' : 'var(--brand-orange)' }}>
                        {r.averageMarksPercent}%
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono" style={{ fontSize: '0.825rem', color: 'var(--brand-black)' }}>
                        <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{r.highestMarksPercent}%</span> / <span style={{ color: 'var(--color-error)', fontWeight: 700 }}>{r.lowestMarksPercent}%</span>
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono" style={{ fontWeight: 800, color: r.passRatePercent >= 95 ? 'var(--color-success)' : 'var(--brand-orange)' }}>
                        {r.passRatePercent}%
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className={`badge ${r.status === 'Healthy' ? 'badge-active' : 'badge-pending'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student Result Detail Modal */}
      {isModalOpen && selectedStudent && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#FFF', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow-lg)', padding: '1.75rem' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <div>
                <span className="badge badge-active font-mono">STUDENT MARKS CARD SUMMARY</span>
                <h2 className="font-display" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem', margin: 0 }}>
                  {selectedStudent.studentName}
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', margin: 0 }}>
                  USN: <strong className="font-mono text-blue">{selectedStudent.usn}</strong> · Semester {selectedStudent.semester}
                </p>
              </div>

              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-dark-grey)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>SEMESTER GPA</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-orange)' }} className="font-mono">{selectedStudent.sgpa ?? 'Not available'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>TOTAL CREDITS</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)' }} className="font-mono">{selectedStudent.totalCredits}</div>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Course Breakdown</h3>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', fontWeight: 700, color: 'var(--brand-black)' }}>
                  <th style={{ padding: '0.65rem' }}>Course</th>
                  <th style={{ padding: '0.65rem' }}>Internal</th>
                  <th style={{ padding: '0.65rem' }}>External</th>
                  <th style={{ padding: '0.65rem' }}>Total</th>
                  <th style={{ padding: '0.65rem' }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {selectedStudent.results.map((result) => (
                  <tr key={result.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                      <span className="font-mono text-blue">{result.course_code || result.course_id}</span> {result.course_name}
                    </td>
                    <td style={{ padding: '0.65rem' }} className="font-mono">{result.internal_marks ?? '—'}</td>
                    <td style={{ padding: '0.65rem' }} className="font-mono">{result.external_marks ?? '—'}</td>
                    <td style={{ padding: '0.65rem', fontWeight: 700 }} className="font-mono">{result.total_marks ?? '—'}</td>
                    <td style={{ padding: '0.65rem' }}>
                      <span className="badge badge-active font-mono font-bold">{result.grade || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button onClick={() => setIsModalOpen(false)} className="btn btn-secondary font-sans">
                Close Summary
              </button>
            </div>

          </div>
        </div>
      )}
    </HODAppShell>
  );
};

export default HODResultsPage;
