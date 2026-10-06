import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Award, 
  Clock, 
  Calendar, 
  FileText, 
  AlertCircle, 
  Plus, 
  Pencil, 
  Trash2,
  Users,
  CheckCircle2,
  XCircle,
  Search,
  Eye,
  X,
  HelpCircle,
  Percent,
  TrendingUp,
  BarChart3,
  Check,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { StatCard } from '../../components/StatCard';
import {
  getAssessmentById,
  getFacultyAssessmentSubmissions,
  getFacultyAttemptReview,
  getAssessmentPerformanceSummary,
  saveAssessmentQuestion,
  deleteAssessmentQuestion,
  publishAssessment,
  unpublishAssessment,
  openAssessment,
  closeAssessment,
  type CreateAssessmentQuestion,
  type FacultySubmissionRow,
  type FacultyAttemptReview,
  type AssessmentPerformanceSummary
} from '../../services/assessmentService';
import type { Assessment } from '../../data/assessments';

export const FacultyAssessmentDetail: React.FC = () => {
  const params = useParams<{ id: string; attemptId?: string; studentId?: string }>();
  const id = params.id;
  const targetId = params.attemptId || params.studentId;
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [submissions, setSubmissions] = useState<FacultySubmissionRow[]>([]);
  const [summary, setSummary] = useState<AssessmentPerformanceSummary | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Submissions section state
  const [activeFilter, setActiveFilter] = useState<'All' | 'Submitted' | 'Pending' | 'In Progress' | 'Abandoned'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'time' | 'status'>('name');

  // Question editing state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState<CreateAssessmentQuestion | null>(null);

  // Attempt Review Modal state
  const [reviewModalAttemptId, setReviewModalAttemptId] = useState<string | null>(null);
  const [attemptReview, setAttemptReview] = useState<FacultyAttemptReview | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'All' | 'Correct' | 'Incorrect' | 'Unanswered'>('All');

  const handleOpenReviewModal = async (attemptId: string, sId?: string) => {
    setReviewModalAttemptId(attemptId);
    setIsLoadingReview(true);
    setAttemptReview(null);
    setReviewFilter('All');
    
    if (id && (attemptId || sId)) {
      const routeParam = attemptId || sId;
      navigate(`/faculty/assessments/${id}/results/${routeParam}`, { replace: false });
    }

    try {
      const review = await getFacultyAttemptReview(attemptId);
      setAttemptReview(review);
    } catch (err: any) {
      console.error('Failed to load attempt review:', err);
      setActionError(err.message || 'Unable to load student attempt review.');
    } finally {
      setIsLoadingReview(false);
    }
  };

  const loadAssessment = useCallback(async () => {
    if (!id) {
      setPageError('Assessment identifier is missing.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setPageError(null);
    try {
      const [assg, subsData, summaryData] = await Promise.all([
        getAssessmentById(id),
        getFacultyAssessmentSubmissions(id).catch(err => {
          console.warn('Submissions fetch warning:', err);
          return [] as FacultySubmissionRow[];
        }),
        getAssessmentPerformanceSummary(id).catch(err => {
          console.warn('Summary fetch warning:', err);
          return null;
        })
      ]);

      if (!assg) {
        setPageError('Assessment not found or access is not permitted.');
      }
      setAssessment(assg || null);
      setSubmissions(subsData);
      setSummary(summaryData);

      // Deep-link student result if targetId (attemptId or studentId) is present in route
      if (targetId) {
        const targetStudent = subsData.find(s => s.studentId === targetId || s.attemptId === targetId);
        const attemptToOpen = targetStudent?.attemptId || targetId;
        void handleOpenReviewModal(attemptToOpen, targetStudent?.studentId);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load assessment details.');
    } finally {
      setIsLoading(false);
    }
  }, [id, targetId]);

  useEffect(() => { 
    void loadAssessment(); 
  }, [loadAssessment]);

  const getInitials = (name: string) => {
    if (!name) return 'ST';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const runStatusAction = async (action: () => Promise<void>) => {
    setIsSaving(true);
    setActionError(null);
    try {
      await action();
      await loadAssessment();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Assessment update failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseReviewModal = () => {
    setReviewModalAttemptId(null);
    setAttemptReview(null);
    if (id) {
      navigate(`/faculty/assessments/${id}`, { replace: false });
    }
  };

  const handleSaveQuestion = async () => {
    if (!id || !questionDraft) return;
    setIsSaving(true);
    setActionError(null);
    try {
      await saveAssessmentQuestion(id, questionDraft, editingQuestionId || undefined);
      setQuestionDraft(null);
      setEditingQuestionId(null);
      await loadAssessment();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Question could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!id || !confirm('Delete this draft question?')) return;
    await runStatusAction(() => deleteAssessmentQuestion(id, questionId));
  };

  if (isLoading) {
    return (
      <FacultyAppShell>
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--brand-dark-grey)' }}>
          <div className="skeleton-loader" style={{ width: '48px', height: '48px', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loading assessment &amp; submission metrics...</span>
        </div>
      </FacultyAppShell>
    );
  }

  if (!assessment || pageError) {
    return (
      <FacultyAppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <AlertCircle size={40} style={{ color: 'var(--brand-orange)', margin: '0 auto 0.75rem auto' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Assessment Not Found</h3>
          <p style={{ color: 'var(--brand-dark-grey)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            {pageError || 'The requested test assessment does not exist or has been moved.'}
          </p>
          <button 
            className="btn btn-secondary" 
            style={{ marginTop: '1.25rem', width: 'auto', marginInline: 'auto' }}
            onClick={pageError ? loadAssessment : () => navigate('/faculty/assessments')}
          >
            <ArrowLeft size={16} />
            <span>Back to Assessments</span>
          </button>
        </div>
      </FacultyAppShell>
    );
  }

  // Calculate submission filter counts
  const filterCounts = {
    All: submissions.length,
    Submitted: submissions.filter(s => ['Submitted', 'Graded'].includes(s.status)).length,
    Pending: submissions.filter(s => s.status === 'Pending').length,
    'In Progress': submissions.filter(s => s.status === 'In Progress').length,
    Abandoned: submissions.filter(s => s.status === 'Abandoned').length,
  };

  // Filter and sort student submissions
  const filteredSubmissions = submissions
    .filter(s => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || s.studentName.toLowerCase().includes(q) || s.usn.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (activeFilter === 'All') return true;
      if (activeFilter === 'Submitted') return ['Submitted', 'Graded'].includes(s.status);
      return s.status === activeFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
      if (sortBy === 'time') return (b.submittedAt || b.startedAt || '').localeCompare(a.submittedAt || a.startedAt || '');
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      return a.studentName.localeCompare(b.studentName);
    });

  const hasSubmissions = (summary?.submittedAttempts || 0) > 0;

  return (
    <FacultyAppShell>
      {/* Back Button & Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button 
          onClick={() => navigate('/faculty/assessments')} 
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginBottom: '0.85rem' }}
        >
          <ArrowLeft size={14} />
          <span>Back to Assessment List</span>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
              <span className="badge badge-graded font-mono" style={{ fontSize: '0.675rem' }}>{assessment.courseCode || assessment.courseId}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>{assessment.courseName}</span>
            </div>
            <h1 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
              {assessment.title}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem', margin: 0 }}>
              Date: <span className="font-mono" style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{assessment.date}</span> · Time: <span className="font-mono" style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{assessment.time}</span> · Duration: {assessment.duration || assessment.durationMinutes} mins · Max Marks: {assessment.totalMarks || 50}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge ${assessment.status === 'Graded' || assessment.status === 'Completed' ? 'badge-active' : assessment.status === 'Active' ? 'badge-pending' : 'badge-overdue'}`} style={{ fontSize: '0.75rem' }}>
              {assessment.status}
            </span>
            {assessment.status === 'Draft' && (
              <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} disabled={isSaving || assessment.questionsCount === 0} onClick={() => id && runStatusAction(() => publishAssessment(id))}>
                Publish
              </button>
            )}
            {assessment.status === 'Upcoming' && (
              <>
                <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} disabled={isSaving || new Date(assessment.date) > new Date()} onClick={() => id && runStatusAction(() => openAssessment(id))}>
                  Open Attempts
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} disabled={isSaving} onClick={() => id && runStatusAction(() => unpublishAssessment(id))}>
                  Unpublish
                </button>
              </>
            )}
            {assessment.status === 'Active' && (
              <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} disabled={isSaving} onClick={() => id && runStatusAction(() => closeAssessment(id))}>
                Close Assessment
              </button>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="alert-banner error" style={{ marginBottom: '1.25rem', padding: '0.65rem 1rem', fontSize: '0.85rem' }}>
          <span>{actionError}</span>
        </div>
      )}

      {/* Executive Performance KPI Cards */}
      <div className="stat-cards-grid" style={{ gap: '0.85rem', marginBottom: '1.25rem' }}>
        <StatCard
          title="TOTAL ENROLLED"
          value={summary?.enrolledStudents.toString() || '0'}
          subtitle="Eligible Students"
          icon={<Users size={18} />}
        />
        <StatCard
          title="SUBMITTED"
          value={summary?.submittedAttempts.toString() || '0'}
          subtitle="Evaluated Attempts"
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          title="PENDING"
          value={summary?.pendingStudents.toString() || '0'}
          subtitle="Not Yet Attempted"
          icon={<Clock size={18} />}
        />
        <StatCard
          title="IN PROGRESS"
          value={summary?.inProgressAttempts.toString() || '0'}
          subtitle="Active Live Testing"
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          title="SUBMISSION RATE"
          value={`${summary?.submissionRate || 0}%`}
          subtitle="Completion Ratio"
          icon={<Percent size={18} />}
        />
        <StatCard
          title="AVG SCORE"
          value={hasSubmissions && summary?.averagePercentage != null ? `${summary.averagePercentage}%` : '—'}
          subtitle={hasSubmissions ? "Cohort Mean Percentage" : "No submissions yet"}
          icon={<BarChart3 size={18} />}
        />
        <StatCard
          title="HIGHEST SCORE"
          value={hasSubmissions && summary?.highestScore != null ? `${summary.highestScore} / ${assessment.totalMarks || 50}` : '—'}
          subtitle={hasSubmissions ? "Top Score Achieved" : "No submissions yet"}
          icon={<Award size={18} />}
        />
        <StatCard
          title="LOWEST SCORE"
          value={hasSubmissions && summary?.lowestScore != null ? `${summary.lowestScore} / ${assessment.totalMarks || 50}` : '—'}
          subtitle={hasSubmissions ? "Minimum Score Logged" : "No submissions yet"}
          icon={<AlertCircle size={18} />}
        />
      </div>

      {/* STUDENT SUBMISSIONS TABLE SECTION */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
        <div style={{ padding: '1rem 1.25rem 0.75rem 1.25rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 className="panel-title font-display" style={{ fontSize: '1.05rem', margin: 0 }}>
                Student Submissions &amp; Result Roster
              </h2>
              <span className="badge badge-secondary font-mono" style={{ fontSize: '0.7rem' }}>
                {filterCounts.All} Students
              </span>
            </div>
            <p style={{ fontSize: '0.775rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem', margin: 0 }}>
              Real-time submission tracking and question-by-question result breakdown
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {/* Filter Pill Tabs */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {(['All', 'Submitted', 'Pending', 'In Progress', 'Abandoned'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  className={`btn ${activeFilter === tab ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', fontWeight: activeFilter === tab ? 700 : 500 }}
                  onClick={() => setActiveFilter(tab)}
                >
                  {tab} ({filterCounts[tab]})
                </button>
              ))}
            </div>

            {/* Sort Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ArrowUpDown size={14} style={{ color: 'var(--brand-dark-grey)' }} />
              <select
                className="form-control"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', width: 'auto', height: 'auto' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="name">Sort by Name</option>
                <option value="score">Sort by Score</option>
                <option value="time">Sort by Time</option>
                <option value="status">Sort by Status</option>
              </select>
            </div>

            {/* Search input */}
            <div className="header-search" style={{ minWidth: '180px', width: 'auto', margin: 0 }}>
              <Search size={14} className="header-search-icon" />
              <input 
                type="text" 
                placeholder="Search student or USN..."
                className="header-search-input"
                style={{ width: '100%', fontSize: '0.8rem', padding: '0.3rem 0.5rem 0.3rem 1.8rem' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {filteredSubmissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--brand-dark-grey)' }}>
            <Users size={40} style={{ margin: '0 auto 0.75rem', color: 'var(--brand-dark-grey)', opacity: 0.5 }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--brand-black)' }}>
              {searchQuery ? `No students found matching "${searchQuery}"` : filterCounts.All === 0 ? 'No Enrolled Students Found' : `No students in "${activeFilter}" status`}
            </h4>
            <p style={{ fontSize: '0.825rem', marginTop: '0.3rem', color: 'var(--brand-dark-grey)' }}>
              {filterCounts.All === 0 
                ? 'Students enrolled in this course will appear in the assessment submission roster.' 
                : 'Students who submit this assessment will appear here with their detailed scores.'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table font-sans" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: '180px' }}>STUDENT</th>
                  <th style={{ minWidth: '110px' }}>USN</th>
                  <th style={{ minWidth: '110px' }}>STATUS</th>
                  <th style={{ minWidth: '110px' }}>STARTED</th>
                  <th style={{ minWidth: '110px' }}>SUBMITTED</th>
                  <th style={{ minWidth: '110px', textAlign: 'center' }}>SCORE</th>
                  <th style={{ minWidth: '120px', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((sub) => {
                  const isSubmitted = ['Submitted', 'Graded'].includes(sub.status);
                  const isPending = sub.status === 'Pending';
                  const isInProgress = sub.status === 'In Progress';

                  const startedText = sub.startedAt 
                    ? new Date(sub.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—';
                  const submittedText = sub.submittedAt 
                    ? new Date(sub.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—';

                  return (
                    <tr 
                      key={sub.studentId}
                      style={{
                        transition: 'background-color 0.15s ease',
                        backgroundColor: isSubmitted ? 'rgba(4, 120, 87, 0.01)' : undefined
                      }}
                    >
                      {/* STUDENT COLUMN WITH INITIALS AVATAR */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: isSubmitted ? 'var(--brand-blue)' : 'var(--brand-dark-grey)',
                            color: '#ffffff',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {getInitials(sub.studentName)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.85rem', lineHeight: '1.2' }}>
                              {sub.studentName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }} className="font-mono">
                              {sub.usn}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* USN COLUMN */}
                      <td style={{ fontSize: '0.825rem', verticalAlign: 'middle' }} className="font-mono">
                        {sub.usn}
                      </td>

                      {/* STATUS BADGE */}
                      <td style={{ verticalAlign: 'middle' }}>
                        {isSubmitted ? (
                          <span className="badge badge-active" style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem', gap: '0.2rem' }}>
                            <Check size={12} /> Submitted
                          </span>
                        ) : isInProgress ? (
                          <span className="badge badge-pending" style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}>
                            In Progress
                          </span>
                        ) : isPending ? (
                          <span className="badge badge-secondary" style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}>
                            Pending
                          </span>
                        ) : (
                          <span className="badge badge-overdue" style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}>
                            Abandoned
                          </span>
                        )}
                      </td>

                      {/* TIMESTAMPS */}
                      <td style={{ fontSize: '0.8rem', verticalAlign: 'middle' }} className="font-mono">
                        {startedText}
                      </td>

                      <td style={{ fontSize: '0.8rem', verticalAlign: 'middle' }} className="font-mono">
                        {submittedText}
                      </td>

                      {/* SCORE & PERCENTAGE */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        {isSubmitted && sub.score != null ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span className="font-mono" style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--brand-blue)' }}>
                              {sub.score} / {sub.maxScore || assessment.totalMarks}
                            </span>
                            {sub.percentage != null && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--brand-orange)', fontWeight: 700 }}>
                                {sub.percentage}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>

                      {/* ACTION BUTTON */}
                      <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                        {isSubmitted && sub.attemptId ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ 
                              width: 'auto', 
                              padding: '0.3rem 0.65rem', 
                              fontSize: '0.775rem', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.3rem',
                              fontWeight: 600
                            }}
                            onClick={() => handleOpenReviewModal(sub.attemptId!, sub.studentId)}
                          >
                            <Eye size={13} />
                            <span>View Result</span>
                          </button>
                        ) : isInProgress ? (
                          <span className="badge badge-pending" style={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
                            Testing Active
                          </span>
                        ) : (
                          <span className="badge badge-secondary" style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', opacity: 0.7 }}>
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Instructions & Guidelines Panel */}
      <div className="dashboard-panel" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
        <h3 className="panel-title font-display" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Instructions &amp; Guidelines</h3>
        <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '0.85rem 1rem', borderRadius: 'var(--border-radius)', fontSize: '0.85rem', color: 'var(--brand-black)', lineHeight: 1.5 }}>
          {assessment.instructions || "No specific instructions specified for this assessment."}
        </div>
      </div>

      {/* Test Questions Preview Panel */}
      <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <h2 className="panel-title font-display" style={{ fontSize: '1.05rem', margin: 0 }}>Test Questions Preview</h2>
          {assessment.status === 'Draft' && (
            <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => {
              setEditingQuestionId(null);
              setQuestionDraft({ text: '', topic: '', options: ['', '', '', ''], correctOptionIndex: 0, marks: 1 });
            }}>
              <Plus size={14} /> Add Question
            </button>
          )}
        </div>

        {assessment.questions && assessment.questions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {assessment.questions.map((q, idx) => (
              <div 
                key={q.id} 
                style={{ 
                  padding: '1rem', 
                  backgroundColor: 'var(--brand-light-grey)', 
                  borderRadius: 'var(--border-radius)',
                  border: '1px solid rgba(156, 163, 175, 0.2)' 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.875rem' }}>
                  <span>Q{idx + 1}. {q.text}<small style={{ display: 'block', fontWeight: 400, marginTop: '0.15rem', color: 'var(--brand-dark-grey)', fontSize: '0.75rem' }}>Topic: {q.topic || 'General'}</small></span>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                    <span className="badge badge-graded font-mono" style={{ fontSize: '0.675rem' }}>{q.marks} Marks</span>
                    {assessment.status === 'Draft' && (
                      <>
                        <button className="ide-btn-icon" aria-label={`Edit question ${idx + 1}`} onClick={() => {
                          setEditingQuestionId(q.id);
                          setQuestionDraft({ text: q.text, topic: q.topic || '', options: [...q.options] as CreateAssessmentQuestion['options'], correctOptionIndex: q.correctOptionIndex ?? 0, marks: q.marks });
                        }}><Pencil size={14} /></button>
                        <button className="ide-btn-icon" aria-label={`Delete question ${idx + 1}`} onClick={() => void handleDeleteQuestion(q.id)}><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {q.options.map((opt, oIdx) => (
                    <div 
                      key={oIdx} 
                      style={{ 
                        padding: '0.45rem 0.65rem', 
                        borderRadius: '4px',
                        backgroundColor: oIdx === q.correctOptionIndex ? 'rgba(34, 197, 94, 0.12)' : '#FFF',
                        border: oIdx === q.correctOptionIndex ? '1px solid var(--color-success)' : '1px solid rgba(156, 163, 175, 0.2)',
                        fontSize: '0.8rem',
                        fontWeight: oIdx === q.correctOptionIndex ? 600 : 400
                      }}
                    >
                      {String.fromCharCode(65 + oIdx)}. {opt} {oIdx === q.correctOptionIndex && '(Correct)'}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--brand-dark-grey)', backgroundColor: 'var(--brand-light-grey)', borderRadius: 'var(--border-radius)' }}>
            <FileText size={32} style={{ margin: '0 auto 0.5rem', color: '#94A3B8' }} />
            <p style={{ fontWeight: 600, margin: 0, fontSize: '0.875rem' }}>{assessment.status === 'Draft' ? 'Add at least one question before publishing.' : 'No question records are available.'}</p>
          </div>
        )}

        {questionDraft && assessment.status === 'Draft' && (
          <div className="dashboard-panel" style={{ marginTop: '1rem', padding: '1.25rem' }}>
            <h3 className="panel-title">{editingQuestionId ? 'Edit Question' : 'Add Question'}</h3>
            <input className="form-control" value={questionDraft.topic} placeholder="Topic" aria-label="Question topic" onChange={event => setQuestionDraft({ ...questionDraft, topic: event.target.value })} />
            <textarea className="form-control" value={questionDraft.text} placeholder="Question prompt" aria-label="Question prompt" rows={2} onChange={event => setQuestionDraft({ ...questionDraft, text: event.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
              {questionDraft.options.map((option, optionIndex) => <input key={optionIndex} className="form-control" aria-label={`Option ${String.fromCharCode(65 + optionIndex)}`} placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`} value={option} onChange={event => {
                const options = [...questionDraft.options] as CreateAssessmentQuestion['options'];
                options[optionIndex] = event.target.value;
                setQuestionDraft({ ...questionDraft, options });
              }} />)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
              <label className="form-group"><span className="form-label">Correct option</span><select className="form-control" value={questionDraft.correctOptionIndex} onChange={event => setQuestionDraft({ ...questionDraft, correctOptionIndex: Number(event.target.value) })}>{questionDraft.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>{String.fromCharCode(65 + optionIndex)}</option>)}</select></label>
              <label className="form-group"><span className="form-label">Marks</span><input className="form-control" type="number" min="1" value={questionDraft.marks} onChange={event => setQuestionDraft({ ...questionDraft, marks: Number(event.target.value) })} /></label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setQuestionDraft(null)} disabled={isSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void handleSaveQuestion()} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Question'}</button>
            </div>
          </div>
        )}
      </div>

      {/* FACULTY VIEW STUDENT RESULT MODAL */}
      {reviewModalAttemptId && (
        <div className="modal-overlay" onClick={handleCloseReviewModal}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()} 
            style={{ maxWidth: '820px', width: '94%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', backgroundColor: '#FAFAFA', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--brand-blue)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {getInitials(attemptReview?.studentName || '')}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="badge badge-graded font-mono" style={{ fontSize: '0.675rem' }}>STUDENT ATTEMPT RESULT</span>
                    <span className="badge badge-active" style={{ fontSize: '0.675rem' }}>Submitted</span>
                  </div>
                  <h3 className="font-display" style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--brand-black)', margin: '0.15rem 0 0 0' }}>
                    {attemptReview?.studentName || 'Student Result'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem', margin: 0 }}>
                    USN: <span className="font-mono" style={{ fontWeight: 600 }}>{attemptReview?.usn || 'N/A'}</span> · Assessment: {assessment.title} ({assessment.courseName})
                  </p>
                </div>
              </div>

              <button 
                type="button" 
                onClick={handleCloseReviewModal}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand-dark-grey)', padding: '0.2rem' }}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {isLoadingReview ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)' }}>
                  <div className="skeleton-loader" style={{ width: '40px', height: '40px', borderRadius: '50%', margin: '0 auto 0.75rem' }}></div>
                  <span>Loading question-by-question student result...</span>
                </div>
              ) : !attemptReview ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--brand-dark-grey)' }}>
                  <AlertCircle size={32} style={{ margin: '0 auto 0.5rem', color: 'var(--color-error)' }} />
                  <p>Unable to load student attempt details.</p>
                </div>
              ) : (
                <>
                  {/* Summary Bar Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', backgroundColor: 'var(--brand-light-grey)', padding: '0.85rem 1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Score</span>
                      <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--brand-blue)' }}>
                        {attemptReview.score} / {attemptReview.maxScore}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Percentage</span>
                      <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--brand-orange)' }}>
                        {attemptReview.percentage}%
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Correct</span>
                      <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#047857' }}>
                        {attemptReview.questions.filter(q => q.isCorrect).length}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Wrong</span>
                      <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#b91c1c' }}>
                        {attemptReview.questions.filter(q => !q.isCorrect && q.selectedOption !== null).length}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Unanswered</span>
                      <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#b45309' }}>
                        {attemptReview.questions.filter(q => q.selectedOption === null).length}
                      </div>
                    </div>
                  </div>

                  {/* Question Review Section Header & Filters */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--brand-black)' }}>
                        Question-wise Student Result
                      </h4>

                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {(['All', 'Correct', 'Incorrect', 'Unanswered'] as const).map(f => (
                          <button
                            key={f}
                            type="button"
                            className={`btn ${reviewFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.725rem' }}
                            onClick={() => setReviewFilter(f)}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Question List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {attemptReview.questions
                        .filter(q => {
                          if (reviewFilter === 'Correct') return q.isCorrect;
                          if (reviewFilter === 'Incorrect') return !q.isCorrect && q.selectedOption !== null;
                          if (reviewFilter === 'Unanswered') return q.selectedOption === null;
                          return true;
                        })
                        .map((q, idx) => {
                          const isUnanswered = q.selectedOption === null;
                          const selectedOptionText = q.selectedOption ? `${q.selectedOption}. ${q.options[q.selectedOption.charCodeAt(0) - 65] || ''}` : 'Not Answered';
                          const correctOptionText = `${q.correctOption}. ${q.options[q.correctOption.charCodeAt(0) - 65] || ''}`;

                          return (
                            <div 
                              key={q.questionId}
                              style={{ 
                                padding: '0.9rem 1rem', 
                                borderRadius: 'var(--border-radius)',
                                border: `1.5px solid ${q.isCorrect ? '#86EFAC' : isUnanswered ? '#FDE047' : '#FCA5A5'}`,
                                backgroundColor: q.isCorrect ? '#F0FDF4' : isUnanswered ? '#FEFCE8' : '#FEF2F2'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.65rem' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--brand-black)' }}>
                                  Q{q.questionOrder || idx + 1}. {q.questionText}
                                </span>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                  {q.isCorrect ? (
                                    <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem', backgroundColor: '#DCFCE7', color: '#15803D' }}>
                                      ✓ Correct ({q.marksEarned} / {q.maxMarks})
                                    </span>
                                  ) : isUnanswered ? (
                                    <span className="badge badge-pending font-mono" style={{ fontSize: '0.7rem', backgroundColor: '#FEF9C3', color: '#A16207' }}>
                                      ✕ Not Answered (0 / {q.maxMarks})
                                    </span>
                                  ) : (
                                    <span className="badge badge-overdue font-mono" style={{ fontSize: '0.7rem', backgroundColor: '#FEE2E2', color: '#B91C1C' }}>
                                      ✕ Incorrect (0 / {q.maxMarks})
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Options breakdown */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.35rem', marginBottom: '0.65rem' }}>
                                {q.options.map((opt, oIdx) => {
                                  const optionLetter = String.fromCharCode(65 + oIdx);
                                  const isSelected = q.selectedOption === optionLetter;
                                  const isCorrectOption = q.correctOption === optionLetter;

                                  let bg = '#FFFFFF';
                                  let border = 'rgba(156, 163, 175, 0.2)';
                                  let color = 'var(--brand-black)';

                                  if (isCorrectOption) {
                                    bg = '#DCFCE7';
                                    border = '#16A34A';
                                    color = '#15803D';
                                  } else if (isSelected && !q.isCorrect) {
                                    bg = '#FEE2E2';
                                    border = '#DC2626';
                                    color = '#B91C1C';
                                  }

                                  return (
                                    <div
                                      key={oIdx}
                                      style={{
                                        padding: '0.4rem 0.6rem',
                                        borderRadius: '4px',
                                        backgroundColor: bg,
                                        border: `1px solid ${border}`,
                                        color: color,
                                        fontSize: '0.775rem',
                                        fontWeight: isSelected || isCorrectOption ? 700 : 400
                                      }}
                                    >
                                      {optionLetter}. {opt}
                                      {isCorrectOption && ' ✓ (Correct)'}
                                      {isSelected && !isCorrectOption && ' ✕ (Student Choice)'}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Summary Answer Line */}
                              <div style={{ 
                                fontSize: '0.8rem', 
                                display: 'flex', 
                                gap: '1.25rem', 
                                flexWrap: 'wrap',
                                backgroundColor: 'rgba(255,255,255,0.7)', 
                                padding: '0.4rem 0.6rem', 
                                borderRadius: '4px',
                                border: '1px solid rgba(0,0,0,0.05)'
                              }}>
                                <div>
                                  <span style={{ color: 'var(--brand-dark-grey)' }}>Student Answer: </span>
                                  <strong style={{ color: isUnanswered ? '#A16207' : q.isCorrect ? '#15803D' : '#B91C1C' }}>
                                    {selectedOptionText}
                                  </strong>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--brand-dark-grey)' }}>Correct Answer: </span>
                                  <strong style={{ color: '#15803D' }}>
                                    {correctOptionText}
                                  </strong>
                                </div>
                              </div>

                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid rgba(156, 163, 175, 0.2)', backgroundColor: '#FAFAFA', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.825rem', padding: '0.4rem 0.85rem' }}
                onClick={handleCloseReviewModal}
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}
    </FacultyAppShell>
  );
};

export default FacultyAssessmentDetail;
