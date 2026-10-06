import React from 'react';
import { X, ExternalLink, Calendar, Clock, BookOpen, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import type { StudentExternalLearningItem } from '../services/externalLearningService';

interface ExternalCourseDetailModalProps {
  item: StudentExternalLearningItem | null;
  onClose: () => void;
  onOpenProgressModal: (item: StudentExternalLearningItem) => void;
  onOpenEvidenceModal: (item: StudentExternalLearningItem) => void;
}

export const ExternalCourseDetailModal: React.FC<ExternalCourseDetailModalProps> = ({
  item,
  onClose,
  onOpenProgressModal,
  onOpenEvidenceModal
}) => {
  if (!item) return null;

  const { enrollment, assignment, course, progress, evidence, latestEvidence } = item;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="modal-content" style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #E5E7EB', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="course-code-badge">{course.platform || 'MOOC'}</span>
              {assignment?.academic_course_id && (
                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#F3F4F6', color: '#374151', fontWeight: 500 }}>
                  Linked Subject: {assignment.academic_course_id}
                </span>
              )}
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--brand-black)' }}>{course.title}</h2>
            {course.provider_name && (
              <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>
                Provider: {course.provider_name}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#6B7280' }} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Course Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Difficulty</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{course.difficulty || 'N/A'}</span>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Est. Duration</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{course.estimated_hours ? `${course.estimated_hours} Hours` : 'Flexible'}</span>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Assigned Date</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{new Date(assignment?.assigned_date || enrollment.assigned_at).toLocaleDateString()}</span>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Deadline</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: assignment?.deadline && new Date(assignment.deadline) < new Date() ? '#DC2626' : '#111827' }}>
              {assignment?.deadline ? new Date(assignment.deadline).toLocaleDateString() : 'No deadline'}
            </span>
          </div>
        </div>

        {/* Description & Instructions */}
        {course.description && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>Course Overview</h4>
            <p style={{ fontSize: '0.875rem', color: '#374151', lineHeight: '1.5', whiteSpace: 'pre-line' }}>{course.description}</p>
          </div>
        )}

        {assignment?.instructions && (
          <div style={{ marginBottom: '1.25rem', backgroundColor: '#EFF6FF', padding: '0.875rem', borderRadius: '8px', borderLeft: '4px solid #3B82F6' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1E40AF', marginBottom: '0.25rem' }}>Faculty Instructions</h4>
            <p style={{ fontSize: '0.85rem', color: '#1E3A8A', lineHeight: '1.4' }}>{assignment.instructions}</p>
          </div>
        )}

        {/* Progress Breakdown */}
        <div style={{ marginBottom: '1.25rem', padding: '1rem', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)' }}>Current Reported Progress</h4>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#2563EB' }}>{progress ? `${progress.progress_percent}%` : '0%'}</span>
          </div>
          {progress && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.8rem', textAlign: 'center' }}>
              <div style={{ backgroundColor: '#F3F4F6', padding: '0.5rem', borderRadius: '6px' }}>
                <span style={{ color: '#6B7280', display: 'block' }}>Modules</span>
                <strong>{progress.completed_modules != null ? `${progress.completed_modules} / ${progress.total_modules || '?'}` : 'N/A'}</strong>
              </div>
              <div style={{ backgroundColor: '#F3F4F6', padding: '0.5rem', borderRadius: '6px' }}>
                <span style={{ color: '#6B7280', display: 'block' }}>Quizzes</span>
                <strong>{progress.completed_quizzes != null ? `${progress.completed_quizzes} / ${progress.total_quizzes || '?'}` : 'N/A'}</strong>
              </div>
              <div style={{ backgroundColor: '#F3F4F6', padding: '0.5rem', borderRadius: '6px' }}>
                <span style={{ color: '#6B7280', display: 'block' }}>Assignments</span>
                <strong>{progress.completed_assignments != null ? `${progress.completed_assignments} / ${progress.total_assignments || '?'}` : 'N/A'}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Evidence Timeline */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.5rem' }}>Submitted Evidence</h4>
          {evidence.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#6B7280', fontStyle: 'italic' }}>No verification evidence submitted yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {evidence.map((ev) => (
                <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '0.825rem' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#111827' }}>Type: {ev.evidence_type}</span>
                    <span style={{ color: '#6B7280', display: 'block', fontSize: '0.75rem' }}>
                      Submitted: {new Date(ev.submitted_at).toLocaleDateString()}
                    </span>
                    {ev.verification_notes && (
                      <span style={{ color: ev.verification_status === 'REJECTED' ? '#DC2626' : '#4B5563', fontSize: '0.775rem', marginTop: '0.2rem', display: 'block' }}>
                        Note: {ev.verification_notes}
                      </span>
                    )}
                  </div>
                  <span className={`badge ${ev.verification_status === 'VERIFIED' ? 'badge-graded' : ev.verification_status === 'REJECTED' ? 'badge-overdue' : 'badge-submitted'}`}>
                    {ev.verification_status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid #E5E7EB', paddingTop: '1rem' }}>
          <button
            type="button"
            onClick={() => window.open(course.external_url, '_blank', 'noopener,noreferrer')}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <ExternalLink size={15} />
            Go to Platform
          </button>
          <button
            type="button"
            onClick={() => { onClose(); onOpenProgressModal(item); }}
            className="btn btn-secondary"
          >
            Update Progress
          </button>
          <button
            type="button"
            onClick={() => { onClose(); onOpenEvidenceModal(item); }}
            className="btn btn-secondary"
          >
            Submit Evidence
          </button>
        </div>

      </div>
    </div>
  );
};
