import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { uploadCourseMaterial } from '../../services/courseService';

interface UploadCourseMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  courseId: string;
  courseName: string;
  existingModules?: string[];
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.zip', '.ppt', '.pptx'];

export const UploadCourseMaterialModal: React.FC<UploadCourseMaterialModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  courseId,
  courseName,
  existingModules = []
}) => {
  const [title, setTitle] = useState('');
  const [moduleSelection, setModuleSelection] = useState<string>('General');
  const [customModule, setCustomModule] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setModuleSelection(existingModules.length > 0 ? existingModules[0] : 'General');
      setCustomModule('');
      setSelectedFile(null);
      setFieldErrors({});
      setGeneralError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, existingModules]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!title.trim()) {
      errs.title = 'Material title is required.';
    }

    if (moduleSelection === '__custom__' && !customModule.trim()) {
      errs.module = 'Please specify the module name or number.';
    }

    if (!selectedFile) {
      errs.file = 'Please select a file to upload.';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next.file;
      return next;
    });

    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFieldErrors(prev => ({
          ...prev,
          file: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of 50 MB.`
        }));
        return;
      }

      const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setFieldErrors(prev => ({
          ...prev,
          file: `Unsupported format. Allowed formats: PDF, PPT, PPTX, DOC, DOCX, ZIP.`
        }));
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate() || !selectedFile) return;

    setIsSubmitting(true);
    const resolvedModule = moduleSelection === '__custom__' ? customModule.trim() : moduleSelection;

    try {
      await uploadCourseMaterial({
        title: title.trim(),
        courseId,
        moduleId: resolvedModule || 'General',
        file: selectedFile
      });

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[UploadCourseMaterialModal] Upload error:', err);
      setGeneralError(err.message || 'Unable to upload the course material. Please try again.');
      setIsSubmitting(false);
    }
  };

  const moduleOptions = Array.from(new Set(['General', ...existingModules]));

  return (
    <div
      className="modal-backdrop"
      onClick={() => !isSubmitting && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem'
      }}
    >
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid rgba(226, 232, 240, 0.9)'
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>ACADEMIC MATERIALS</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-black)', margin: '0.2rem 0 0' }}>
              Upload Course Material
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', margin: '0.15rem 0 0' }}>
              Publish readings, lecture notes, or slides for <strong>{courseName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '0.25rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {generalError && (
            <div className="alert-banner error" style={{ padding: '0.65rem 0.85rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>{generalError}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
              MATERIAL TITLE *
            </label>
            <input
              type="text"
              className={`form-input ${fieldErrors.title ? 'is-invalid' : ''}`}
              placeholder="e.g. Chapter 3: Relational Algebra & Normalization Slides"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              style={{ width: '100%', fontSize: '0.875rem' }}
            />
            {fieldErrors.title && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>{fieldErrors.title}</span>}
          </div>

          {/* Module Association */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
              SYLLABUS MODULE ASSOCIATION
            </label>
            <select
              className="form-select"
              value={moduleSelection}
              onChange={(e) => setModuleSelection(e.target.value)}
              disabled={isSubmitting}
              style={{ width: '100%', fontSize: '0.875rem', marginBottom: moduleSelection === '__custom__' ? '0.5rem' : '0' }}
            >
              {moduleOptions.map(mod => (
                <option key={mod} value={mod}>{mod}</option>
              ))}
              <option value="__custom__">+ Create New Module / Topic...</option>
            </select>

            {moduleSelection === '__custom__' && (
              <input
                type="text"
                className={`form-input ${fieldErrors.module ? 'is-invalid' : ''}`}
                placeholder="Enter module name or number (e.g. Module 3, Unit 2, or Lab Reference)"
                value={customModule}
                onChange={(e) => setCustomModule(e.target.value)}
                disabled={isSubmitting}
                style={{ width: '100%', fontSize: '0.875rem', marginTop: '0.4rem' }}
              />
            )}
            {fieldErrors.module && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>{fieldErrors.module}</span>}
          </div>

          {/* File Upload Area */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
              SELECT MATERIAL FILE *
            </label>
            <div
              style={{
                border: '2px dashed #CBD5E1',
                borderRadius: '8px',
                padding: '1.25rem',
                textAlign: 'center',
                backgroundColor: selectedFile ? '#F8FAFC' : '#FFFFFF',
                cursor: 'pointer'
              }}
              onClick={() => document.getElementById('faculty-material-file-input')?.click()}
            >
              <input
                id="faculty-material-file-input"
                type="file"
                style={{ display: 'none' }}
                accept=".pdf,.docx,.doc,.zip,.ppt,.pptx"
                onChange={handleFileChange}
                disabled={isSubmitting}
              />
              <Upload size={28} style={{ color: '#64748B', margin: '0 auto 0.5rem' }} />
              {selectedFile ? (
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-black)', margin: 0 }}>
                    {selectedFile.name}
                  </p>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Click to change file
                  </span>
                </div>
              ) : (
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--brand-black)', margin: 0 }}>
                    Click to browse or drag file here
                  </p>
                  <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                    Supported: PDF, PPT, PPTX, DOC, DOCX, ZIP (Max 50 MB)
                  </span>
                </div>
              )}
            </div>
            {fieldErrors.file && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{fieldErrors.file}</span>}
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
            >
              <Upload size={16} />
              <span>{isSubmitting ? 'Uploading & Saving...' : 'Upload Material'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
