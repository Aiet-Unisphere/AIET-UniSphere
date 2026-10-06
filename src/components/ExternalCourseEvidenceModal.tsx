import React, { useState } from 'react';
import { X, Upload, AlertCircle, FileText, CheckCircle2, Shield } from 'lucide-react';
import type { StudentExternalLearningItem } from '../services/externalLearningService';
import { submitExternalCourseEvidence } from '../services/externalLearningService';

interface ExternalCourseEvidenceModalProps {
  item: StudentExternalLearningItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ExternalCourseEvidenceModal: React.FC<ExternalCourseEvidenceModalProps> = ({
  item,
  onClose,
  onSuccess
}) => {
  const [evidenceType, setEvidenceType] = useState<'CERTIFICATE' | 'CREDENTIAL_URL' | 'CREDENTIAL_ID' | 'OTHER'>('CERTIFICATE');
  const [credentialUrl, setCredentialUrl] = useState<string>('');
  const [credentialId, setCredentialId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!item) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setErrorMessage('Invalid file format. Please upload a PDF, JPEG, PNG, or WEBP document.');
        setSelectedFile(null);
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setErrorMessage('File size exceeds 20MB limit.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedFile && !credentialUrl.trim() && !credentialId.trim()) {
      setErrorMessage('Please provide at least one evidence source (Certificate file, Credential URL, or Credential ID).');
      return;
    }

    setIsSubmitting(true);

    try {
      await submitExternalCourseEvidence(item.enrollment.id, {
        evidence_type: evidenceType,
        credential_url: credentialUrl.trim() || null,
        credential_id: credentialId.trim() || null,
        file: selectedFile
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to submit evidence. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="modal-content" style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '540px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--brand-black)' }}>Submit Completion Evidence</h3>
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
          {/* Evidence Type */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.35rem' }}>
              Evidence Type
            </label>
            <select
              value={evidenceType}
              onChange={(e: any) => setEvidenceType(e.target.value)}
              className="filter-select"
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="CERTIFICATE">Certificate Document (PDF/Image)</option>
              <option value="CREDENTIAL_URL">Online Credential Verification URL</option>
              <option value="CREDENTIAL_ID">Credential ID / Hash Code</option>
              <option value="OTHER">Other Verification Proof</option>
            </select>
          </div>

          {/* Certificate File Upload */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.35rem' }}>
              Upload Certificate File (Private Storage)
            </label>
            <div style={{ border: '2px dashed #D1D5DB', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', backgroundColor: '#F9FAFB', cursor: 'pointer' }}>
              <input
                type="file"
                id="certificate-file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="certificate-file" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                <Upload size={24} style={{ color: '#4F46E5' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                  {selectedFile ? selectedFile.name : 'Click to select certificate file'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                  PDF, JPEG, PNG, WEBP up to 20MB (Stored in secure private storage)
                </span>
              </label>
            </div>
          </div>

          {/* Credential URL */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.35rem' }}>
              Online Credential URL (Optional)
            </label>
            <input
              type="url"
              placeholder="https://coursera.org/verify/YOUR_CREDENTIAL_ID"
              value={credentialUrl}
              onChange={(e) => setCredentialUrl(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
            />
          </div>

          {/* Credential ID */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.35rem' }}>
              Credential Verification Code / ID (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. ABC-12345-XYZ"
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', padding: '0.75rem', borderRadius: '6px', fontSize: '0.775rem', color: '#92400E', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={16} />
            <span>Submitted evidence remains <strong>Pending Verification</strong> until reviewed by your department faculty.</span>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Uploading Evidence...' : 'Submit Evidence'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
