import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, AlertTriangle, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { getAssessmentById, startAssessmentAttempt, saveAssessmentAnswer, submitAssessmentAnswers } from '../services/assessmentService';
import type { Assessment } from '../data/assessments';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const AssessmentAttempt: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quiz attempt states
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [questionId: string]: number }>({});
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingAnswer, setIsSavingAnswer] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  const timerRef = useRef<any>(null);

  const fetchAssessmentQuestions = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const summary = await getAssessmentById(id);
      if (!summary) {
        setError("Assessment not found.");
        return;
      }
      if (summary.status === 'Completed') {
        // If already completed, redirect to results
        navigate(`/student/assessments/${id}`);
        return;
      }
      if (summary.status === 'Closed' || summary.status === 'Draft') {
        setError('This assessment is not currently open for attempts.');
        return;
      }
      const attempt = await startAssessmentAttempt(id);
      const data = await getAssessmentById(id);
      if (!data?.questions?.length) {
        setError('No active assessment questions were returned.');
        return;
      }
      setAssessment(data);
      setAnswers(data.studentAnswers || {});
      const elapsedSeconds = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
      setTimeLeft(Math.max(0, attempt.durationMinutes * 60 - elapsedSeconds));
    } catch (err) {
      console.error("Assessment attempt initialization error:", err);
      setError(err instanceof Error ? err.message : "Unable to load assessment questions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessmentQuestions();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  // Timer countdown hook
  useEffect(() => {
    if (timeLeft > 0 && !isLoading && !error && assessment) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft, isLoading, error, assessment]);

  const handleSelectOption = async (questionId: string, optionIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex
    }));
    setIsSavingAnswer(true);
    setSubmissionError(null);
    try {
      await saveAssessmentAnswer(id!, questionId, optionIndex);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Unable to save this answer.');
    } finally {
      setIsSavingAnswer(false);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNext = () => {
    if (assessment && currentQuestionIndex < (assessment.questions?.length || 0) - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleAutoSubmit = async () => {
    if (!id) return;
    setIsSubmitting(true);
    try {
      await submitAssessmentAnswers(id, answers);
      alert("Time limit exceeded! Your quiz has been auto-submitted.");
      navigate(`/student/assessments/${id}`);
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : 'Failed to submit assessment answers.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!id) return;
    setIsSubmitting(true);
    setShowConfirmSubmit(false);
    try {
      await submitAssessmentAnswers(id, answers);
      navigate(`/student/assessments/${id}`);
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : 'Failed to submit assessment answers.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format time (mm:ss)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Initializing online testing environment..." />
      </AppShell>
    );
  }

  if (error || !assessment || !assessment.questions) {
    return (
      <AppShell>
        <ErrorState message={error || "Failed to initialize test questions"} onRetry={fetchAssessmentQuestions} />
      </AppShell>
    );
  }

  const currentQuestion = assessment.questions[currentQuestionIndex];
  const isAnswered = (qId: string) => answers[qId] !== undefined;

  return (
    <AppShell>
      {/* Quiz Attempt Layout Container */}
      <div className="assessment-attempt-container" style={{ textAlign: 'left' }}>
        
        {/* Test Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="course-code-badge">{assessment.courseName}</span>
            <h2 style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>{assessment.title}</h2>
          </div>

          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              backgroundColor: timeLeft < 300 ? 'var(--color-error-bg)' : 'var(--brand-light-grey)', 
              color: timeLeft < 300 ? '#b91c1c' : 'var(--brand-black)',
              padding: '0.5rem 1rem', 
              borderRadius: 'var(--border-radius)',
              fontWeight: 700,
              fontSize: '1.1rem'
            }}
          >
            <Clock size={18} />
            <span>{formatTime(timeLeft)}</span>
          </div>
        </div>

        {submissionError && <div className="form-error-msg" role="alert" style={{ marginTop: '0.75rem' }}>{submissionError}</div>}

        {/* Question Index Grid */}
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand-dark-grey)', display: 'block', marginBottom: '0.5rem' }}>
            Question Navigator
          </span>
          <div className="assessment-questions-nav">
            {assessment.questions.map((q: any, idx: number) => (
              <button
                key={q.id}
                onClick={() => setCurrentQuestionIndex(idx)}
                disabled={isSavingAnswer || isSubmitting}
                className={`question-nav-btn ${currentQuestionIndex === idx ? 'active' : ''} ${isAnswered(q.id) ? 'answered' : ''}`}
                aria-label={`Go to question ${idx + 1}`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Current Question panel */}
        <div style={{ borderTop: '1px solid rgba(156, 163, 175, 0.1)', paddingTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--brand-dark-grey)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <span>Question {currentQuestionIndex + 1} of {assessment.questions.length}</span>
            <span>{currentQuestion.marks} Mark(s)</span>
          </div>
          
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--brand-black)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            {currentQuestion.text}
          </h3>

          {/* Options grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {currentQuestion.options.map((option: string, optIdx: number) => (
              <button
                type="button"
                key={optIdx}
                onClick={() => void handleSelectOption(currentQuestion.id, optIdx)}
                className={`option-choice-item ${answers[currentQuestion.id] === optIdx ? 'selected' : ''}`}
                aria-pressed={answers[currentQuestion.id] === optIdx}
                disabled={isSavingAnswer || isSubmitting}
              >
                <div className="option-letter-badge">
                  {String.fromCharCode(65 + optIdx)}
                </div>
                <span style={{ fontSize: '0.925rem', color: 'var(--brand-black)' }}>
                  {option}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation bottom row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(156, 163, 175, 0.1)', paddingTop: '1.5rem', marginTop: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              onClick={handlePrev} 
              disabled={currentQuestionIndex === 0 || isSavingAnswer || isSubmitting} 
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <button 
              onClick={handleNext} 
              disabled={currentQuestionIndex === assessment.questions.length - 1 || isSavingAnswer || isSubmitting} 
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>

          <button 
            onClick={() => setShowConfirmSubmit(true)} 
            className="btn btn-primary"
            style={{ width: 'auto', padding: '0.5rem 1.5rem', backgroundColor: 'var(--brand-orange)', gap: '0.35rem' }}
            disabled={isSavingAnswer || isSubmitting}
          >
            <Check size={16} /> Submit Test
          </button>
        </div>

      </div>

      {/* Confirmation Dialog Modal overlay */}
      {showConfirmSubmit && (
        <div className="sidebar-overlay open" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="auth-card" style={{ maxWidth: '420px', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--brand-orange)' }}>
              <AlertTriangle size={24} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Submit Assessment?</h3>
            </div>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', textAlign: 'left' }}>
              Are you sure you want to submit your answers? You have answered{' '}
              <strong>{Object.keys(answers).length}</strong> out of{' '}
              <strong>{assessment.questions.length}</strong> questions.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button 
                onClick={() => setShowConfirmSubmit(false)} 
                className="btn btn-secondary"
                disabled={isSubmitting}
              >
                Back to Test
              </button>
              <button 
                onClick={handleManualSubmit} 
                className="btn btn-primary" 
                style={{ backgroundColor: 'var(--brand-orange)' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Yes, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};
export default AssessmentAttempt;
