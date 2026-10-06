import React, { useState } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import type { StudentExternalLearningItem } from '../services/externalLearningService';
import { updateMyExternalCourseProgress } from '../services/externalLearningService';

interface ExternalCourseProgressModalProps {
  item: StudentExternalLearningItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ExternalCourseProgressModal: React.FC<ExternalCourseProgressModalProps> = ({
  item,
  onClose,
  onSuccess
}) => {
  const currentProgress = item?.progress;

  const [progressPercent, setProgressPercent] = useState<number>(currentProgress?.progress_percent ? Number(currentProgress.progress_percent) : 0);
  const [completedModules, setCompletedModules] = useState<string>(currentProgress?.completed_modules != null ? String(currentProgress.completed_modules) : '');
  const [totalModules, setTotalModules] = useState<string>(currentProgress?.total_modules != null ? String(currentProgress.total_modules) : '');
  const [completedQuizzes, setCompletedQuizzes] = useState<string>(currentProgress?.completed_quizzes != null ? String(currentProgress.completed_quizzes) : '');
  const [totalQuizzes, setTotalQuizzes] = useState<string>(currentProgress?.total_quizzes != null ? String(currentProgress.total_quizzes) : '');
  const [completedAssignments, setCompletedAssignments] = useState<string>(currentProgress?.completed_assignments != null ? String(currentProgress.completed_assignments) : '');
  const [totalAssignments, setTotalAssignments] = useState<string>(currentProgress?.total_assignments != null ? String(currentProgress.total_assignments) : '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validations
    if (progressPercent < 0 || progressPercent > 100) {
      setErrorMessage('Progress percentage must be between 0 and 100.');
      return;
    }

    const cMod = completedModules.trim() !== '' ? parseInt(completedModules, 10) : null;
    const tMod = totalModules.trim() !== '' ? parseInt(totalModules, 10) : null;
    const cQuiz = completedQuizzes.trim() !== '' ? parseInt(completedQuizzes, 10) : null;
    const tQuiz = totalQuizzes.trim() !== '' ? parseInt(totalQuizzes, 10) : null;
    const cAss = completedAssignments.trim() !== '' ? parseInt(completedAssignments, 10) : null;
    const tAss = totalAssignments.trim() !== '' ? parseInt(totalAssignments, 10) : null;

    if (cMod != null && cMod < 0) return setErrorMessage('Completed modules cannot be negative.');
    if (tMod != null && tMod < 0) return setErrorMessage('Total modules cannot be negative.');
    if (cMod != null && tMod != null && cMod > tMod) {
      return setErrorMessage('Completed modules cannot exceed total modules.');
    }

    if (cQuiz != null && cQuiz < 0) return setErrorMessage('Completed quizzes cannot be negative.');
    if (tQuiz != null && tQuiz < 0) return setErrorMessage('Total quizzes cannot be negative.');
    if (cQuiz != null && tQuiz != null && cQuiz > tQuiz) {
      return setErrorMessage('Completed quizzes cannot exceed total quizzes.');
    }

    if (cAss != null && cAss < 0) return setErrorMessage('Completed assignments cannot be negative.');
    if (tAss != null && tAss < 0) return setErrorMessage('Total assignments cannot be negative.');
    if (cAss != null && tAss != null && cAss > tAss) {
      return setErrorMessage('Completed assignments cannot exceed total assignments.');
    }

    setIsSubmitting(true);

    try {
      await updateMyExternalCourseProgress(item.enrollment.id, {
        progress_percent: progressPercent,
        completed_modules: cMod,
        total_modules: tMod,
        completed_quizzes: cQuiz,
        total_quizzes: tQuiz,
        completed_assignments: cAss,
        total_assignments: tAss
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to update progress. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="modal-content" style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '500px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--brand-black)' }}>Report Course Progress</h3>
            <p style={{ fontSize: '0.8rem', color: '#6B7280' }}>{item.course.title}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>
            <X size={20} />
          </button>
        </div>

        {errorMessage && (
          <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Progress Slider / Percent */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
              <span>Completion Percentage *</span>
              <span style={{ color: '#2563EB', fontWeight: 700 }}>{progressPercent}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={progressPercent}
              onChange={(e) => setProgressPercent(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: '#2563EB', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.15rem' }}>
              <span>0% (Not Started)</span>
              <span>50% (Halfway)</span>
              <span>100% (Completed)</span>
            </div>
          </div>

          {/* Module Breakdown (Optional) */}
          <div style={{ marginBottom: '1rem', backgroundColor: '#F9FAFB', padding: '0.875rem', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-dark-grey)', display: 'block', marginBottom: '0.5rem' }}>
              Detailed Module & Activity Breakdown (Optional)
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#374151' }}>Completed Modules</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 18"
                  value={completedModules}
                  onChange={(e) => setCompletedModules(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#374151' }}>Total Modules</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 25"
                  value={totalModules}
                  onChange={(e) => setTotalModules(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#374151' }}>Completed Quizzes</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 4"
                  value={completedQuizzes}
                  onChange={(e) => setCompletedQuizzes(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#374151' }}>Total Quizzes</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 5"
                  value={totalQuizzes}
                  onChange={(e) => setTotalQuizzes(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#374151' }}>Completed Projects</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 2"
                  value={completedAssignments}
                  onChange={(e) => setCompletedAssignments(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#374151' }}>Total Projects</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 2"
                  value={totalAssignments}
                  onChange={(e) => setTotalAssignments(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
                />
              </div>
            </div>
          </div>

          {/* Note */}
          <p style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '1.25rem' }}>
            Note: Updated progress will be recorded as <strong>Self-Reported</strong>. Verified status is established upon certificate verification by faculty.
          </p>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Save Progress'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
