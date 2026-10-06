import React, { useState } from 'react';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import type { VerificationQueueItem } from '../../services/externalLearningService';
import { verifyOrRejectEvidence, getEvidenceSignedUrl } from '../../services/externalLearningService';

interface ExternalCourseVerificationQueueProps {
  queue: VerificationQueueItem[];
  onRefresh: () => void;
}

export const ExternalCourseVerificationQueue: React.FC<ExternalCourseVerificationQueueProps> = ({
  queue,
  onRefresh
}) => {
  const [selectedItemForAction, setSelectedItemForAction] = useState<VerificationQueueItem | null>(null);
  const [actionType, setActionType] = useState<'VERIFY' | 'REJECT'>('VERIFY');
  const [rejectionNote, setRejectionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpenActionModal = (item: VerificationQueueItem, type: 'VERIFY' | 'REJECT') => {
    setSelectedItemForAction(item);
    setActionType(type);
    setRejectionNote('');
    setActionError(null);
  };

  const handleViewEvidence = async (item: VerificationQueueItem) => {
    const ev = item.evidence;
    if (ev.certificate_storage_path) {
      try {
        const signedUrl = await getEvidenceSignedUrl(ev.certificate_storage_path);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } catch (err: any) {
        alert(err.message || 'Unable to open certificate document.');
      }
    } else if (ev.credential_url) {
      window.open(ev.credential_url, '_blank', 'noopener,noreferrer');
    } else if (ev.credential_id) {
      alert(`Credential ID / Hash: ${ev.credential_id}`);
    }
  };

  const handleConfirmAction = async () => {
    if (!selectedItemForAction) return;

    if (actionType === 'REJECT' && !rejectionNote.trim()) {
      setActionError('A rejection note explaining the reason is required.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      await verifyOrRejectEvidence(
        selectedItemForAction.evidence.id,
        actionType === 'VERIFY' ? 'VERIFIED' : 'REJECTED',
        rejectionNote.trim() || undefined
      );

      setSelectedItemForAction(null);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Verification action failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (queue.length === 0) {
    return (
      <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <CheckCircle2 size={40} style={{ color: '#10B981', margin: '0 auto 0.75rem auto' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Verification Queue Empty</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
          No pending student completion certificates require your review at this time.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
        {queue.map((item) => (
          <div key={item.evidence.id} className="dashboard-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.85rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span className="badge badge-submitted" style={{ fontSize: '0.75rem' }}>
                  Pending Verification
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                  {new Date(item.evidence.submitted_at).toLocaleDateString()}
                </span>
              </div>

              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.15rem' }}>
                {item.course.title}
              </h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
                Platform: {item.course.platform}
              </p>

              {/* Student Details */}
              <div style={{ backgroundColor: '#F9FAFB', padding: '0.625rem', borderRadius: '6px', border: '1px solid #E5E7EB', marginTop: '0.625rem' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#111827', display: 'block' }}>
                  {item.studentProfile?.full_name || 'Student'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                  USN: {item.studentProfile?.usn_or_employee_id || 'N/A'} · Email: {item.studentProfile?.email || 'N/A'}
                </span>
                {item.progress && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563EB', display: 'block', marginTop: '0.2rem' }}>
                    Reported Progress: {item.progress.progress_percent}%
                  </span>
                )}
              </div>

              {/* Evidence Summary */}
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#374151' }}>
                <strong>Evidence Source: </strong>
                {item.evidence.certificate_storage_path ? 'Certificate File' : item.evidence.credential_url ? 'Credential Link' : 'Credential ID'}
                {item.evidence.credential_id && <span style={{ display: 'block', fontSize: '0.75rem', color: '#6B7280' }}>ID: {item.evidence.credential_id}</span>}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', paddingTop: '0.75rem', borderTop: '1px solid #E5E7EB' }}>
              <button
                type="button"
                onClick={() => handleViewEvidence(item)}
                className="btn btn-secondary"
                style={{ width: '100%', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem' }}
              >
                <ExternalLink size={14} />
                View Submitted Evidence
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
                <button
                  type="button"
                  onClick={() => handleOpenActionModal(item, 'VERIFY')}
                  className="btn btn-primary"
                  style={{ backgroundColor: '#059669', borderColor: '#059669', fontSize: '0.8rem', padding: '0.35rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}
                >
                  <CheckCircle2 size={14} />
                  Approve
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenActionModal(item, 'REJECT')}
                  className="btn btn-secondary"
                  style={{ color: '#DC2626', borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', fontSize: '0.8rem', padding: '0.35rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}
                >
                  <XCircle size={14} />
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      {selectedItemForAction && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="modal-content" style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '460px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: actionType === 'VERIFY' ? '#059669' : '#DC2626', marginBottom: '0.5rem' }}>
              {actionType === 'VERIFY' ? 'Approve & Verify Certificate' : 'Reject Certificate Evidence'}
            </h3>

            <p style={{ fontSize: '0.85rem', color: '#4B5563', marginBottom: '1rem' }}>
              Student: <strong>{selectedItemForAction.studentProfile?.full_name}</strong> ({selectedItemForAction.studentProfile?.usn_or_employee_id})<br />
              Course: <strong>{selectedItemForAction.course.title}</strong>
            </p>

            {actionError && (
              <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {actionError}
              </div>
            )}

            {actionType === 'REJECT' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.35rem' }}>
                  Rejection Note / Feedback *
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why the certificate is rejected (e.g., name mismatch, unreadable image, invalid URL)..."
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
                  required
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setSelectedItemForAction(null)} className="btn btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className="btn btn-primary"
                style={{ backgroundColor: actionType === 'VERIFY' ? '#059669' : '#DC2626', borderColor: actionType === 'VERIFY' ? '#059669' : '#DC2626' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing...' : actionType === 'VERIFY' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
