import React, { useState, useEffect } from 'react';
import { Award, BookOpen, CalendarCheck, ClipboardList, TrendingUp, BarChart2, AlertCircle } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { StatCard } from '../components/StatCard';
import { PerformanceChart } from '../components/PerformanceChart';
import { SubjectPerformance } from '../components/SubjectPerformance';
import { InsightCard } from '../components/InsightCard';
import {
  getAcademicOverview,
  getSemesterTrends,
  getSubjectPerformances,
  getAssessmentBreakdown,
  getAssignmentCompletion,
  type AcademicOverviewStats,
  type SemesterTrendItem,
  type SubjectPerformanceItem,
  type AssessmentBreakdownItem,
  type AssignmentCompletionData,
} from '../services/analyticsService';

// Compute performance insights from real data
function computeInsights(
  overview: AcademicOverviewStats,
  subjects: SubjectPerformanceItem[],
  assignments: AssignmentCompletionData
): { strengths: string[]; gaps: string[]; recommendations: string[] } {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (overview.attendancePercent >= 85) {
    strengths.push(`Strong attendance of ${overview.attendancePercent}% — well above the 75% requirement.`);
  } else if (overview.attendancePercent < 75) {
    gaps.push(`Attendance is only ${overview.attendancePercent}%, below the mandatory 75% threshold.`);
    recommendations.push('Prioritize attending all scheduled classes to avoid attendance shortfall penalties.');
  }

  const completionRate = assignments.total > 0
    ? Math.round((assignments.submitted / assignments.total) * 100) : 0;
  if (completionRate >= 80) {
    strengths.push(`${completionRate}% assignment submission rate — consistently completing coursework.`);
  } else if (assignments.pending > 0) {
    gaps.push(`${assignments.pending} pending assignment(s) remaining.`);
    recommendations.push('Complete pending assignments before deadlines to avoid mark deductions.');
  }

  if (overview.avgAssessmentScore >= 70) {
    strengths.push(`Assessment average of ${overview.avgAssessmentScore}% shows solid concept understanding.`);
  } else if (overview.assessmentsAttempted > 0 && overview.avgAssessmentScore < 50) {
    gaps.push(`Assessment average is ${overview.avgAssessmentScore}%, indicating weak concept recall.`);
    recommendations.push('Use the AI Learning Assistant to review weak topics and practice more quizzes.');
  }

  const topSubject = subjects[0];
  const bottomSubject = subjects[subjects.length - 1];
  if (topSubject) strengths.push(`Strongest subject: ${topSubject.subject} (${topSubject.scorePercent}%).`);
  if (bottomSubject && subjects.length > 1 && bottomSubject.scorePercent < 60) {
    gaps.push(`Weakest subject: ${bottomSubject.subject} (${bottomSubject.scorePercent}%).`);
    recommendations.push(`Focus more study time on ${bottomSubject.subject} to bring scores above 60%.`);
  }

  if (strengths.length === 0) strengths.push('Keep engaging with your coursework — you are making progress!');
  if (recommendations.length === 0) recommendations.push('Continue your current study pace and maintain consistency.');

  return { strengths, gaps, recommendations };
}

export const AnalyticsPerformancePage: React.FC = () => {
  const [overview, setOverview] = useState<AcademicOverviewStats | null>(null);
  const [trends, setTrends] = useState<SemesterTrendItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectPerformanceItem[]>([]);
  const [assessments, setAssessments] = useState<AssessmentBreakdownItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentCompletionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [ov, tr, sub, ass, asg] = await Promise.all([
          getAcademicOverview(),
          getSemesterTrends(),
          getSubjectPerformances(),
          getAssessmentBreakdown(),
          getAssignmentCompletion(),
        ]);
        setOverview(ov);
        setTrends(tr);
        setSubjects(sub);
        setAssessments(ass);
        setAssignments(asg);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics data.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const insights = overview && assignments ? computeInsights(overview, subjects, assignments) : null;
  const completionRate = assignments && assignments.total > 0
    ? Math.round((assignments.submitted / assignments.total) * 100) : 0;

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Intelligence</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Analytics & Performance</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Student Academic Analytics</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Real-time performance insights across attendance, assessments, assignments, and subject-level analysis.
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Loading academic performance metrics..." />
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={16} color="var(--brand-danger)" />
          <span style={{ fontSize: '0.875rem', color: 'var(--brand-danger)' }}>{error}</span>
        </div>
      ) : !overview ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Performance Stat Cards Row */}
          <div className="stats-grid">
            <StatCard
              title="Overall Attendance"
              value={`${overview.attendancePercent}%`}
              icon={<CalendarCheck size={20} className="text-orange" />}
              accentColor="orange"
            />
            <StatCard
              title="Assignment Completion"
              value={`${completionRate}%`}
              icon={<ClipboardList size={20} className="text-blue" />}
              accentColor="blue"
            />
            <StatCard
              title="Assessment Average"
              value={`${overview.avgAssessmentScore}%`}
              icon={<BookOpen size={20} className="text-orange" />}
              accentColor="orange"
            />
            <StatCard
              title="Assessments Taken"
              value={`${overview.assessmentsAttempted}`}
              icon={<BarChart2 size={20} className="text-blue" />}
              accentColor="blue"
            />
          </div>

          {/* Performance Insights */}
          {insights && (
            <InsightCard insights={{
              strengths: insights.strengths,
              gaps: insights.gaps,
              recommendations: insights.recommendations,
            }} />
          )}

          {/* Academic Performance Trend Chart */}
          {trends.length > 0 && <PerformanceChart trends={trends} />}

          {/* Subject Level Performance */}
          {subjects.length > 0 && <SubjectPerformance subjects={subjects} />}

          {/* Assessment & Assignment Performance Split Grid */}
          <div className="analytics-split-grid">
            {/* Assessment Performance Breakdown */}
            <div className="card-box">
              <div className="card-header-bar mb-3">
                <h3 className="card-title font-display">Assessment Performance Breakdown</h3>
                <span className="font-mono text-dark-grey" style={{ fontSize: '0.8rem' }}>
                  {assessments.length} attempts
                </span>
              </div>

              {assessments.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--brand-dark-grey)', padding: '2rem', fontSize: '0.875rem' }}>
                  No assessments attempted yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {assessments.map((ass, idx) => (
                    <div key={idx} className="assessment-stat-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{ass.assessmentTitle}</span>
                        <span className="font-mono font-bold text-orange" style={{ fontSize: '0.85rem' }}>
                          {ass.score} / {ass.maxScore} ({ass.percentage}%)
                        </span>
                      </div>
                      <div className="progress-bar-bg" style={{ height: '6px' }}>
                        <div className="progress-bar-fill orange-bg" style={{ width: `${ass.percentage}%` }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem', fontSize: '0.75rem' }} className="font-mono text-dark-grey">
                        <span>
                          {ass.submittedAt
                            ? `Submitted: ${new Date(ass.submittedAt).toLocaleDateString()}`
                            : 'In Progress'}
                        </span>
                        <span className={ass.percentage >= 60 ? 'text-success font-bold' : 'text-error font-bold'}>
                          {ass.percentage >= 60 ? 'Pass' : 'Below Pass'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assignment Status Overview */}
            {assignments && (
              <div className="card-box">
                <div className="card-header-bar mb-3">
                  <h3 className="card-title font-display">Assignment Status Overview</h3>
                  <span className="font-mono text-dark-grey" style={{ fontSize: '0.8rem' }}>
                    Rate: {completionRate}%
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ padding: '0.85rem', background: 'var(--brand-light-grey)', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
                    <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Submitted</span>
                    <div className="font-mono font-bold text-blue" style={{ fontSize: '1.5rem', marginTop: '0.2rem' }}>
                      {assignments.submitted}
                    </div>
                  </div>

                  <div style={{ padding: '0.85rem', background: 'var(--brand-light-grey)', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
                    <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Total</span>
                    <div className="font-mono font-bold text-success" style={{ fontSize: '1.5rem', marginTop: '0.2rem' }}>
                      {assignments.total}
                    </div>
                  </div>

                  <div style={{ padding: '0.85rem', background: 'var(--brand-light-grey)', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
                    <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Pending</span>
                    <div className="font-mono font-bold text-orange" style={{ fontSize: '1.5rem', marginTop: '0.2rem' }}>
                      {assignments.pending}
                    </div>
                  </div>

                  <div style={{ padding: '0.85rem', background: 'var(--brand-light-grey)', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
                    <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Late</span>
                    <div className="font-mono font-bold text-error" style={{ fontSize: '1.5rem', marginTop: '0.2rem' }}>
                      {assignments.late}
                    </div>
                  </div>
                </div>

                <div className="font-mono text-dark-grey" style={{ fontSize: '0.8rem', borderTop: '1px solid var(--brand-border)', paddingTop: '0.75rem' }}>
                  {assignments.submitted} of {assignments.total} assignments submitted with a {completionRate}% completion rate.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default AnalyticsPerformancePage;
