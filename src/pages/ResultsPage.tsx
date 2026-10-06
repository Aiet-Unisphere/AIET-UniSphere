import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { Award, TrendingUp, BookOpen, AlertCircle } from 'lucide-react';
import {
  getStudentResults,
  computeSemesterSummaries,
  type CourseResult,
  type SemesterResultSummary,
} from '../services/resultService';

const getGradeColor = (grade: string): string => {
  switch (grade?.toUpperCase()) {
    case 'S': case 'O': return 'var(--color-success)';
    case 'A': case 'A+': return 'var(--brand-blue)';
    case 'B': case 'B+': return 'var(--brand-orange)';
    case 'C': return '#f59e0b';
    case 'D': return '#f97316';
    case 'F': return 'var(--brand-danger)';
    default: return 'var(--brand-dark-grey)';
  }
};

const getStatusBadgeClass = (status: string): string => {
  switch (status) {
    case 'Pass': return 'badge badge-active';
    case 'Fail': return 'badge badge-danger';
    case 'Absent': return 'badge badge-pending';
    default: return 'badge';
  }
};

export const ResultsPage: React.FC = () => {
  const [results, setResults] = useState<CourseResult[]>([]);
  const [summaries, setSummaries] = useState<SemesterResultSummary[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadResults = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getStudentResults();
        setResults(data);
        const sums = computeSemesterSummaries(data);
        setSummaries(sums);
        if (sums.length > 0) {
          setSelectedSemester(sums[sums.length - 1].semester);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load results.';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    };
    loadResults();
  }, []);

  const currentSummary = summaries.find(s => s.semester === selectedSemester) || null;
  const latestSummary = summaries.length > 0 ? summaries[summaries.length - 1] : null;

  // Overall CGPA from latest result
  const cgpa = latestSummary?.cgpa;

  return (
    <AppShell>
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Academics</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Results</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Academic Performance & Results</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Semester-wise grade cards, SGPA, and cumulative CGPA score breakdown
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Loading your results..." />
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={16} color="var(--brand-danger)" />
          <span style={{ fontSize: '0.875rem', color: 'var(--brand-danger)' }}>{error}</span>
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No Results Available"
          description="Your academic results will appear here once they are published by the examination department."
        />
      ) : (
        <>
          {/* Summary Stats */}
          <div className="stat-cards-grid">
            <div className="stat-card">
              <div className="stat-label-row">
                <span className="stat-card-title">Cumulative CGPA</span>
                <Award size={18} className="stat-card-icon" />
              </div>
              <span className="stat-card-value">{cgpa !== null ? cgpa?.toFixed(2) : '—'}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Overall Academic Score</span>
            </div>

            {latestSummary && (
              <div className="stat-card">
                <div className="stat-label-row">
                  <span className="stat-card-title">Semester {latestSummary.semester} SGPA</span>
                  <TrendingUp size={18} style={{ color: 'var(--color-success)' }} />
                </div>
                <span className="stat-card-value">{latestSummary.sgpa?.toFixed(2) || '—'}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                  {latestSummary.passCount} Pass, {latestSummary.failCount} Fail
                </span>
              </div>
            )}

            <div className="stat-card">
              <div className="stat-label-row">
                <span className="stat-card-title">Subjects</span>
                <BookOpen size={18} className="stat-card-icon" />
              </div>
              <span className="stat-card-value">{results.length}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Total Subjects</span>
            </div>
          </div>

          {/* Semester Selector */}
          {summaries.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              {summaries.map(s => (
                <button
                  key={s.semester}
                  className={`btn ${selectedSemester === s.semester ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={() => setSelectedSemester(s.semester)}
                >
                  Semester {s.semester}
                </button>
              ))}
            </div>
          )}

          {/* Grade Card Table */}
          {currentSummary && (
            <div className="card-box" style={{ padding: '0', marginTop: '1.5rem' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(156,163,175,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Semester {currentSummary.semester} Detailed Grade Card</span>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                  <span>SGPA: <strong>{currentSummary.sgpa?.toFixed(2) || '—'}</strong></span>
                  <span>Credits Earned: <strong>{currentSummary.earnedCredits}/{currentSummary.totalCredits}</strong></span>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--brand-light-grey)', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--brand-dark-grey)' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Course Code</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Course Name</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Internal</th>
                      <th style={{ padding: '0.75rem 1rem' }}>External</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Total</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Grade</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Grade Points</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentSummary.courses.map((r: CourseResult) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid rgba(156,163,175,0.15)', fontSize: '0.9rem' }}>
                        <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }} className="font-mono">
                          {r.course_code || r.course_id}
                        </td>
                        <td style={{ padding: '0.875rem 1rem' }}>{r.course_name}</td>
                        <td style={{ padding: '0.875rem 1rem' }} className="font-mono">
                          {r.internal_marks !== null && r.internal_marks !== undefined ? r.internal_marks : '—'}
                        </td>
                        <td style={{ padding: '0.875rem 1rem' }} className="font-mono">
                          {r.external_marks !== null && r.external_marks !== undefined ? r.external_marks : '—'}
                        </td>
                        <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }} className="font-mono">
                          {r.total_marks !== null && r.total_marks !== undefined
                            ? `${r.total_marks}/${r.max_marks || 100}`
                            : '—'}
                        </td>
                        <td style={{ padding: '0.875rem 1rem' }}>
                          {r.grade ? (
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '1rem',
                                color: getGradeColor(r.grade),
                              }}
                            >
                              {r.grade}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>
                          {r.grade_points !== null && r.grade_points !== undefined ? `${r.grade_points} / 10` : '—'}
                        </td>
                        <td style={{ padding: '0.875rem 1rem' }}>
                          <span className={getStatusBadgeClass(r.status)}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
};

export default ResultsPage;
