import React, { useState } from 'react';
import { X, AlertCircle, RefreshCw } from 'lucide-react';
import type { FacultyAssignmentSummaryItem } from '../../services/externalLearningService';
import { updateFacultyStudentProgress } from '../../services/externalLearningService';

interface ExternalCourseStudentProgressModalProps {
  summaryItem: FacultyAssignmentSummaryItem | null;
  onClose: () => void;
  onRefresh: () => void;
}

export const ExternalCourseStudentProgressModal: React.FC<ExternalCourseStudentProgressModalProps> = ({
  summaryItem,
  onClose,
  onRefresh
}) => {
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [editProgressPercent, setEditProgressPercent] = useState<number>(0);
  const [editCompletedModules, setEditCompletedModules] = useState<string>('');
  const [editTotalModules, setEditTotalModules] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!summaryItem) return null;

  const { assignment, course, enrollments } = summaryItem;

  const handleStartEdit = (eItem: any) => {
    setSelectedEnrollmentId(eItem.enrollment.id);
    setEditProgressPercent(eItem.progress?.progress_percent ? Number(eItem.progress.progress_percent) : 0);
    setEditCompletedModules(eItem.progress?.completed_modules != null ? String(eItem.progress.completed_modules) : '');
    setEditTotalModules(eItem.progress?.total_modules != null ? String(eItem.progress.total_modules) : '');
    setErrorMessage(null);
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollmentId) return;

    if (editProgressPercent < 0 || editProgressPercent > 100) {
      return setErrorMessage('Progress percentage must be between 0 and 100.');
    }

    const cMod = editCompletedModules.trim() !== '' ? parseInt(editCompletedModules, 10) : null;
    const tMod = editTotalModules.trim() !== '' ? parseInt(editTotalModules, 10) : null;

    if (cMod != null && tMod != null && cMod > tMod) {
      return setErrorMessage('Completed modules cannot exceed total modules.');
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await updateFacultyStudentProgress(selectedEnrollmentId, {
        progress_percent: editProgressPercent,
        completed_modules: cMod,
        total_modules: tMod
      });

      setSelectedEnrollmentId(null);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update student progress.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="modal-content" style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-black)' }}>Student Roster & Progress Tracking</h3>
            <p style={{ fontSize: '0.8rem', color: '#6B7280' }}>{course.title} ({course.platform}) · Semester {assignment.semester || 'All'}</p>
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

        {/* Student Table */}
        {enrollments.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#6B7280', fontStyle: 'italic', padding: '1.5rem 0', textAlign: 'center' }}>
            No students currently enrolled in this assignment.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>
                  <th style={{ padding: '0.625rem' }}>Student</th>
                  <th style={{ padding: '0.625rem' }}>USN</th>
                  <th style={{ padding: '0.625rem' }}>Status</th>
                  <th style={{ padding: '0.625rem' }}>Progress</th>
                  <th style={{ padding: '0.625rem' }}>Evidence</th>
                  <th style={{ padding: '0.625rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((eItem) => (
                  <tr key={eItem.enrollment.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '0.625rem', fontWeight: 600 }}>{eItem.studentProfile?.full_name || 'Student'}</td>
                    <td style={{ padding: '0.625rem', color: '#6B7280' }}>{eItem.studentProfile?.usn_or_employee_id || 'N/A'}</td>
                    <td style={{ padding: '0.625rem' }}>
                      <span className={`badge ${eItem.enrollment.status === 'COMPLETED' ? 'badge-graded' : eItem.enrollment.status === 'IN_PROGRESS' ? 'badge-submitted' : 'badge-active'}`}>
                        {eItem.enrollment.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.625rem', fontWeight: 700 }}>
                      {eItem.progress ? `${eItem.progress.progress_percent}%` : '0%'}
                      {eItem.progress?.source && (
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#9CA3AF', fontWeight: 400 }}>
                          {eItem.progress.source === 'FACULTY_UPDATED' ? 'Faculty Updated' : 'Self Reported'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.625rem' }}>
                      {eItem.latestEvidence ? (
                        <span className={`badge ${eItem.latestEvidence.verification_status === 'VERIFIED' ? 'badge-graded' : eItem.latestEvidence.verification_status === 'REJECTED' ? 'badge-overdue' : 'badge-submitted'}`}>
                          {eItem.latestEvidence.verification_status}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>No Evidence</span>
                      )}
                    </td>
                    <td style={{ padding: '0.625rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(eItem)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        <RefreshCw size={12} />
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Inline Edit Form */}
        {selectedEnrollmentId && (
          <form onSubmit={handleSaveProgress} style={{ backgroundColor: '#EFF6FF', padding: '1rem', borderRadius: '8px', border: '1px solid #BFDBFE', marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1E40AF', marginBottom: '0.5rem' }}>
              Override Student Progress (Faculty Action)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#1E3A8A' }}>Progress % *</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editProgressPercent}
                  onChange={(e) => setEditProgressPercent(parseInt(e.target.value, 10) || 0)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #93C5FD', fontSize: '0.85rem' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#1E3A8A' }}>Completed Modules</label>
                <input
                  type="number"
                  min="0"
                  value={editCompletedModules}
                  onChange={(e) => setEditCompletedModules(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #93C5FD', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#1E3A8A' }}>Total Modules</label>
                <input
                  type="number"
                  min="0"
                  value={editTotalModules}
                  onChange={(e) => setEditTotalModules(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #93C5FD', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setSelectedEnrollmentId(null)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Faculty Progress'}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
