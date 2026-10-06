import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  FileText, 
  CheckCircle2, 
  XCircle,
  HelpCircle,
  Filter,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { 
  getAssessmentById, 
  getStudentAttemptReview, 
  type StudentAttemptReview,
  type QuestionReviewItem
} from '../services/assessmentService';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const AssessmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reviewData, setReviewData] = useState<StudentAttemptReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'correct' | 'incorrect' | 'unanswered'>('all');

  const fetchAssessmentData = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAssessmentById(id);
      if (!data) {
        setError("Assessment not found.");
        return;
      }
      setAssessment(data);

      const isAttemptSubmitted = data.studentAttempt?.id && ['Submitted', 'Graded'].includes(data.studentAttempt.status);
      if (isAttemptSubmitted || data.status === 'Completed') {
        const attemptId = data.studentAttempt?.id;
        if (attemptId) {
          setReviewLoading(true);
          try {
            const rev = await getStudentAttemptReview(attemptId);
            setReviewData(rev);
          } catch (revErr) {
            console.warn("[AssessmentDetail] Unable to fetch student attempt review:", revErr);
          } finally {
            setReviewLoading(false);
          }
        }
      }
    } catch (err) {
      setError("Unable to load assessment details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessmentData();
  }, [id]);

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading assessment data..." />
      </AppShell>
    );
  }

  if (error || !assessment) {
    return (
      <AppShell>
        <ErrorState message={error || "Failed to load assessment details"} onRetry={fetchAssessmentData} />
      </AppShell>
    );
  }

  const isCompleted = assessment.status === 'Completed' || ['Submitted', 'Graded'].includes(assessment.studentAttempt?.status);
  const now = new Date();
  const isOpen = assessment.status === 'Active' || (
    assessment.status === 'Upcoming' &&
    (!assessment.availableFrom || new Date(assessment.availableFrom) <= now) &&
    (!assessment.deadline || new Date(assessment.deadline) >= now)
  );

  const getOptionText = (options: string[], letter: string | null) => {
    if (!letter) return 'Not Answered';
    const idx = letter.charCodeAt(0) - 65;
    const text = options && options[idx] ? options[idx] : '';
    return text ? `${letter}. ${text}` : letter;
  };

  const filteredQuestions = (reviewData?.questions || []).filter(q => {
    if (reviewFilter === 'correct') return q.isCorrect;
    if (reviewFilter === 'incorrect') return !q.isCorrect && q.selectedOption !== null;
    if (reviewFilter === 'unanswered') return q.selectedOption === null;
    return true;
  });

  const correctCount = reviewData?.questions.filter(q => q.isCorrect).length ?? assessment.result?.correctCount ?? 0;
  const incorrectCount = reviewData?.questions.filter(q => !q.isCorrect && q.selectedOption !== null).length ?? assessment.result?.incorrectCount ?? 0;
  const unansweredCount = reviewData?.questions.filter(q => q.selectedOption === null).length ?? 0;
  const totalQuestions = reviewData?.questions.length ?? assessment.questionsCount ?? 0;

  return (
    <AppShell>
      {/* Back button */}
      <div style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
        <button 
          onClick={() => navigate('/student/assessments')}
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.825rem', gap: '0.35rem' }}
        >
          <ArrowLeft size={14} />
          Back to Assessments
        </button>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'left' }}>
        
        {/* COMPLETED ASSESSMENT RESULT VIEW */}
        {isCompleted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <span className="course-code-badge">{assessment.courseName}</span>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: '0.5rem' }}>
                    {assessment.title} — Submission Result
                  </h1>
                  <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
                    {assessment.date ? `Completed on ${new Date(assessment.date).toLocaleDateString()}` : 'Submitted'}
                  </p>
                </div>
                <span className="badge badge-success" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
                  ✓ Assessment Submitted
                </span>
              </div>
            </div>

            {/* Scores summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              
              <div className="stat-card" style={{ textAlign: 'center', justifyContent: 'center' }}>
                <span className="stat-card-title" style={{ display: 'block', margin: '0 auto' }}>Your Score</span>
                <span className="stat-card-value" style={{ color: 'var(--brand-blue)', fontSize: '2rem' }}>
                  {reviewData ? reviewData.score : assessment.result?.score ?? 0} 
                  <span style={{ fontSize: '1rem', color: 'var(--brand-dark-grey)' }}> / {reviewData ? reviewData.maxScore : totalQuestions}</span>
                </span>
              </div>

              <div className="stat-card" style={{ textAlign: 'center', justifyContent: 'center' }}>
                <span className="stat-card-title" style={{ display: 'block', margin: '0 auto' }}>Percentage</span>
                <span className="stat-card-value" style={{ color: 'var(--brand-orange)', fontSize: '2rem' }}>
                  {reviewData ? reviewData.percentage : assessment.result?.percentage ?? 0}%
                </span>
              </div>

              <div className="stat-card" style={{ textAlign: 'center', justifyContent: 'center' }}>
                <span className="stat-card-title" style={{ display: 'block', margin: '0 auto' }}>Breakdown</span>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.825rem', color: '#047857', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <CheckCircle2 size={14} /> {correctCount} Correct
                  </span>
                  <span style={{ fontSize: '0.825rem', color: '#b91c1c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <XCircle size={14} /> {incorrectCount} Incorrect
                  </span>
                  {unansweredCount > 0 && (
                    <span style={{ fontSize: '0.825rem', color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <HelpCircle size={14} /> {unansweredCount} Skipped
                    </span>
                  )}
                </div>
              </div>

            </div>

            {/* Topic breakdowns if available */}
            {assessment.result?.topicPerformance && assessment.result.topicPerformance.length > 0 && (
              <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
                <h3 className="panel-title" style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Performance by Syllabus Topic</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {assessment.result.topicPerformance.map((topic: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 600 }}>{topic.topic}</span>
                        <span style={{ color: 'var(--brand-blue)', fontWeight: 700 }}>{topic.score}% Mastery</span>
                      </div>
                      <div className="progress-bar-bg">
                        <div 
                          className="progress-bar-fill" 
                          style={{ 
                            width: `${topic.score}%`, 
                            backgroundColor: topic.score >= 80 ? 'var(--color-success)' : 'var(--brand-orange)' 
                          }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STUDENT ANSWER REVIEW SECTION */}
            <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
                <div>
                  <h3 className="panel-title" style={{ margin: 0, fontSize: '1.1rem' }}>Question-by-Question Answer Review</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>
                    Review your selected choices against the correct answers
                  </p>
                </div>

                {/* Filter buttons */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setReviewFilter('all')}
                    className={`btn ${reviewFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.775rem' }}
                  >
                    All ({totalQuestions})
                  </button>
                  <button
                    onClick={() => setReviewFilter('correct')}
                    className={`btn ${reviewFilter === 'correct' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.775rem' }}
                  >
                    Correct ({correctCount})
                  </button>
                  <button
                    onClick={() => setReviewFilter('incorrect')}
                    className={`btn ${reviewFilter === 'incorrect' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.775rem' }}
                  >
                    Incorrect ({incorrectCount})
                  </button>
                  <button
                    onClick={() => setReviewFilter('unanswered')}
                    className={`btn ${reviewFilter === 'unanswered' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.775rem' }}
                  >
                    Unanswered ({unansweredCount})
                  </button>
                </div>
              </div>

              {reviewLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
                  Loading detailed answer review...
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--brand-dark-grey)', backgroundColor: 'var(--brand-light-grey)', borderRadius: '6px' }}>
                  No questions match the selected filter criteria ({reviewFilter}).
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {filteredQuestions.map((q: QuestionReviewItem, idx: number) => {
                    const letters = ['A', 'B', 'C', 'D'];
                    const isSkipped = q.selectedOption === null;

                    return (
                      <div 
                        key={q.questionId}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          padding: '1.1rem',
                          backgroundColor: q.isCorrect 
                            ? 'rgba(4, 120, 87, 0.02)' 
                            : isSkipped 
                              ? 'rgba(217, 119, 6, 0.02)' 
                              : 'rgba(185, 28, 28, 0.02)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem'
                        }}
                      >
                        {/* Question title & header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--brand-black)', lineHeight: '1.45' }}>
                            Q{q.questionOrder || idx + 1}. {q.questionText}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                            {q.isCorrect ? (
                              <span className="badge badge-success" style={{ fontSize: '0.75rem', gap: '0.25rem' }}>
                                <Check size={12} /> Correct
                              </span>
                            ) : isSkipped ? (
                              <span className="badge badge-warning" style={{ fontSize: '0.75rem', gap: '0.25rem' }}>
                                <AlertCircle size={12} /> Not Answered
                              </span>
                            ) : (
                              <span className="badge badge-danger" style={{ fontSize: '0.75rem', gap: '0.25rem' }}>
                                <X size={12} /> Incorrect
                              </span>
                            )}
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-dark-grey)', whiteSpace: 'nowrap' }}>
                              {q.marksEarned} / {q.maxMarks} mark{q.maxMarks > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>

                        {/* MCQ options list */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem' }}>
                          {letters.map((letter, optIdx) => {
                            const optionText = q.options[optIdx] || '';
                            const isUserSelected = q.selectedOption === letter;
                            const isCorrectOption = q.correctOption === letter;

                            let optBg = '#ffffff';
                            let optBorder = 'var(--border-color)';
                            let optTextColor = 'var(--brand-black)';
                            let badgeLabel = null;

                            if (isUserSelected && isCorrectOption) {
                              optBg = 'rgba(4, 120, 87, 0.1)';
                              optBorder = '#047857';
                              optTextColor = '#047857';
                              badgeLabel = '✓ Your Choice (Correct)';
                            } else if (isUserSelected && !isCorrectOption) {
                              optBg = 'rgba(185, 28, 28, 0.1)';
                              optBorder = '#b91c1c';
                              optTextColor = '#b91c1c';
                              badgeLabel = '✕ Your Choice';
                            } else if (isCorrectOption) {
                              optBg = 'rgba(4, 120, 87, 0.05)';
                              optBorder = '#047857';
                              optTextColor = '#047857';
                              badgeLabel = '✓ Correct Answer';
                            }

                            return (
                              <div
                                key={letter}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: '6px',
                                  border: `1.5px solid ${optBorder}`,
                                  backgroundColor: optBg,
                                  fontSize: '0.85rem',
                                  color: optTextColor,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '0.5rem'
                                }}
                              >
                                <span><strong>{letter}.</strong> {optionText}</span>
                                {badgeLabel && (
                                  <span style={{ fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    {badgeLabel}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Review summary line */}
                        <div style={{ 
                          fontSize: '0.825rem', 
                          display: 'flex', 
                          gap: '1.5rem', 
                          flexWrap: 'wrap',
                          backgroundColor: 'rgba(0,0,0,0.02)', 
                          padding: '0.5rem 0.75rem', 
                          borderRadius: '6px',
                          borderTop: '1px solid rgba(0,0,0,0.05)'
                        }}>
                          <div>
                            <span style={{ color: 'var(--brand-dark-grey)' }}>Your Answer: </span>
                            <strong style={{ color: isSkipped ? '#b45309' : q.isCorrect ? '#047857' : '#b91c1c' }}>
                              {getOptionText(q.options, q.selectedOption)}
                            </strong>
                          </div>
                          <div>
                            <span style={{ color: 'var(--brand-dark-grey)' }}>Correct Answer: </span>
                            <strong style={{ color: '#047857' }}>
                              {getOptionText(q.options, q.correctOption)}
                            </strong>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </div>

            <button 
              onClick={() => navigate('/student/assessments')}
              className="btn btn-secondary"
            >
              Return to Assessments
            </button>
          </div>
        ) : (
          
          /* UPCOMING ASSESSMENT DETAILS VIEW */
          <div className="dashboard-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <span className="course-code-badge">{assessment.courseName}</span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: '0.5rem' }}>
                {assessment.title}
              </h1>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', borderTop: '1px solid rgba(156, 163, 175, 0.1)', borderBottom: '1px solid rgba(156, 163, 175, 0.1)', padding: '1.25rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={20} style={{ color: 'var(--brand-blue)' }} />
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Date & Time</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{assessment.date} at {assessment.time}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={20} style={{ color: 'var(--brand-blue)' }} />
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Duration</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{assessment.duration} Minutes</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={20} style={{ color: 'var(--brand-blue)' }} />
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Questions</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{assessment.questionsCount} MCQs</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="panel-title" style={{ marginBottom: '0.5rem' }}>Instructions</h3>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--brand-dark-grey)' }}>
                {assessment.instructions}
              </p>
            </div>

            <div 
              style={{ 
                backgroundColor: 'rgba(255, 79, 24, 0.02)', 
                border: '1px solid rgba(255, 79, 24, 0.15)', 
                padding: '1rem', 
                borderRadius: 'var(--border-radius)',
                fontSize: '0.85rem',
                color: 'var(--brand-black)'
              }}
            >
              ⚠️ <strong>Important Note:</strong> Once you click "Start Assessment", the timer will begin. Closing the tab or navigating away will not pause the timer. Make sure you are in a quiet environment.
            </div>

            <button 
              onClick={() => navigate(`/student/assessments/${assessment.id}/attempt`)}
              className="btn btn-primary"
              style={{ backgroundColor: 'var(--brand-orange)', marginTop: '0.5rem' }}
              disabled={!isOpen}
            >
              {isOpen ? 'Start Assessment' : assessment.status === 'Upcoming' ? 'Assessment not open yet' : 'Assessment is closed'}
            </button>
          </div>
        )}

      </div>
    </AppShell>
  );
};

export default AssessmentDetail;
