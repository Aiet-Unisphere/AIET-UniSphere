import React, { useState, useEffect, useCallback } from 'react';
import { Award, BookOpen, CalendarCheck, ClipboardList, TrendingUp, BarChart2, AlertCircle, Sparkles, RefreshCw, Info } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { StatCard } from '../components/StatCard';
import { PerformanceChart } from '../components/PerformanceChart';
import { SubjectPerformance } from '../components/SubjectPerformance';
import { InsightCard } from '../components/InsightCard';
import { localLLMProvider } from '../services/localLLMProvider';
import { getStudentAnalyticsAIContract } from '../services/analyticsAIDataService';
import type { LocalLLMAnalysisResponse } from '../types/localLLM';
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

  const [aiAnalysis, setAiAnalysis] = useState<LocalLLMAnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const handleRequestAIAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const contract = await getStudentAnalyticsAIContract();
      const result = await localLLMProvider.analyze({
        role: 'STUDENT',
        analyticsContract: contract,
        analysisType: 'ACADEMIC_OVERVIEW',
        dashboardContext: 'Student Academic Analytics Page',
        timestamp: new Date().toISOString(),
      });

      if (result.success) {
        setAiAnalysis(result);
      } else if (result.error?.code === 'LLM_UNAVAILABLE') {
        setAiNotice(result.summary || 'Local AI analysis is currently unavailable. Deterministic analytics remain active.');
      } else {
        setAiError(result.error?.message || result.summary || 'Failed to complete local AI analysis.');
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'An unexpected error occurred during AI analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

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
      <div className="page-header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
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
        <div>
          <button
            id="ai-analyze-btn"
            type="button"
            onClick={handleRequestAIAnalysis}
            disabled={isAnalyzing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: isAnalyzing ? '#9ca3af' : '#ea580c',
              color: '#ffffff',
              padding: '0.625rem 1.125rem',
              borderRadius: '0.5rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              border: 'none',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              transition: 'background-color 0.2s ease',
            }}
          >
            <Sparkles size={16} />
            {isAnalyzing ? 'Analyzing with Local AI...' : 'Analyze with Local AI'}
          </button>
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

          {/* AI Analysis Loading State */}
          {isAnalyzing && (
            <div className="card-box" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(234, 88, 12, 0.04)', border: '1px solid rgba(234, 88, 12, 0.2)' }}>
              <RefreshCw size={20} className="text-orange" style={{ animation: 'spin 1.5s linear infinite' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--brand-black)' }}>Synthesizing Academic Intelligence...</div>
                <div style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)' }}>
                  Private local Qwen3 4B is generating qualitative evaluations and study guidance from your authorized metrics.
                </div>
              </div>
            </div>
          )}

          {/* AI Analysis Notice (Offline / Unavailable) */}
          {aiNotice && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: '0.5rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <Info size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--brand-black)' }}>
                <strong>Local AI Notice: </strong>{aiNotice}
              </div>
            </div>
          )}

          {/* AI Analysis Error State */}
          {aiError && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={18} color="#ef4444" />
                <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>{aiError}</span>
              </div>
              <button
                type="button"
                onClick={handleRequestAIAnalysis}
                style={{
                  background: 'none',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* AI Academic Synthesis Card */}
          {aiAnalysis && aiAnalysis.success && (
            <div className="card-box" style={{ border: '1px solid var(--brand-border)', borderLeft: '4px solid #ea580c' }}>
              <div className="card-header-bar mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={18} className="text-orange" />
                  <h3 className="card-title font-display">AI Academic Intelligence Synthesis</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontWeight: 600,
                    background: aiAnalysis.trend === 'IMPROVING' ? 'rgba(34, 197, 94, 0.12)' : aiAnalysis.trend === 'DECLINING' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                    color: aiAnalysis.trend === 'IMPROVING' ? '#16a34a' : aiAnalysis.trend === 'DECLINING' ? '#dc2626' : '#2563eb'
                  }}>
                    Trend: {aiAnalysis.trend}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontWeight: 600,
                    background: aiAnalysis.risk_level === 'LOW' ? 'rgba(34, 197, 94, 0.12)' : aiAnalysis.risk_level === 'HIGH' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    color: aiAnalysis.risk_level === 'LOW' ? '#16a34a' : aiAnalysis.risk_level === 'HIGH' ? '#dc2626' : '#d97706'
                  }}>
                    Risk: {aiAnalysis.risk_level}
                  </span>
                  {aiAnalysis.model && (
                    <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>
                      ({aiAnalysis.model})
                    </span>
                  )}
                </div>
              </div>

              {/* Advisory Disclaimer */}
              <div style={{ fontSize: '0.78rem', color: 'var(--brand-dark-grey)', backgroundColor: 'var(--brand-light-grey, #f9fafb)', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
                * Advisory note: This synthesis is generated by the local Qwen3 4B analytics engine based on your authorized records. All attendance, grades, and requirements are governed strictly by official university records.
              </div>

              {/* Summary */}
              <p style={{ fontSize: '0.925rem', lineHeight: '1.5', color: 'var(--brand-black)', marginBottom: '1.25rem' }}>
                {aiAnalysis.summary}
              </p>

              {/* Insights and Recommendations Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {aiAnalysis.insights && aiAnalysis.insights.length > 0 && (
                  <div style={{ padding: '0.875rem', background: 'var(--brand-light-grey, #f9fafb)', borderRadius: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Award size={15} className="text-orange" />
                      Key Insights
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {aiAnalysis.insights.map((ins, i) => (
                        <li key={i} style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>{ins}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
                  <div style={{ padding: '0.875rem', background: 'var(--brand-light-grey, #f9fafb)', borderRadius: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <TrendingUp size={15} className="text-success" />
                      Recommended Actions
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {aiAnalysis.recommendations.map((rec, i) => (
                        <li key={i} style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Visualizations Directives */}
              {aiAnalysis.visualizations && aiAnalysis.visualizations.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--brand-border)', paddingTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Model Visualization Directives:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem' }}>
                    {aiAnalysis.visualizations.map((v, i) => (
                      <span key={i} style={{ fontSize: '0.75rem', background: 'var(--brand-light-grey, #f3f4f6)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', border: '1px solid var(--brand-border)' }}>
                        <strong>{v.type}</strong>: {v.title} ({v.dataset})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
