import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { createExternalLearningCourse } from '../../services/externalLearningService';

interface CreateExternalCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCourse?: any) => void;
}

export const CreateExternalCourseModal: React.FC<CreateExternalCourseModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('Coursera');
  const [providerName, setProviderName] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [description, setDescription] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [category, setCategory] = useState('Computer Science');
  const [difficulty, setDifficulty] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>('BEGINNER');
  const [estimatedHours, setEstimatedHours] = useState<string>('20');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) return setErrorMessage('Course title is required.');
    if (!platform.trim()) return setErrorMessage('Platform name is required.');
    if (!externalUrl.trim()) return setErrorMessage('External course URL is required.');

    if (!/^https?:\/\/.+/i.test(externalUrl.trim())) {
      return setErrorMessage('External URL must be a valid http:// or https:// link.');
    }

    const hours = estimatedHours.trim() !== '' ? parseFloat(estimatedHours) : undefined;
    if (hours != null && (isNaN(hours) || hours < 0)) {
      return setErrorMessage('Estimated hours must be greater than or equal to 0.');
    }

    setIsSubmitting(true);

    try {
      const newCourse = await createExternalLearningCourse({
        title: title.trim(),
        platform: platform.trim(),
        provider_name: providerName.trim() || undefined,
        external_url: externalUrl.trim(),
        description: description.trim() || undefined,
        course_code: courseCode.trim() || undefined,
        category: category.trim() || undefined,
        difficulty,
        estimated_hours: hours
      });

      onSuccess(newCourse);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create external course definition.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="modal-content" style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-black)' }}>Create External Course Definition</h3>
            <p style={{ fontSize: '0.8rem', color: '#6B7280' }}>Define a Coursera, NPTEL, edX, or MOOC course template</p>
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
          {/* Title */}
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
              Course Title *
            </label>
            <input
              type="text"
              placeholder="e.g. Google Cloud Engineering Professional Certificate"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.875rem' }}
            />
          </div>

          {/* Platform & Provider */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.875rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Platform *
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.875rem' }}
              >
                <option value="Coursera">Coursera</option>
                <option value="NPTEL">NPTEL</option>
                <option value="SWAYAM">SWAYAM</option>
                <option value="edX">edX</option>
                <option value="Udemy">Udemy</option>
                <option value="Other">Other Platform</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Provider / Institution (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Google / IIT Madras"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.875rem' }}
              />
            </div>
          </div>

          {/* External URL */}
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
              External Course URL *
            </label>
            <input
              type="url"
              placeholder="https://coursera.org/professional-certificates/google-cloud-engineering"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.875rem' }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
              Description (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="Brief course objectives and topics covered..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem', resize: 'vertical' }}
            />
          </div>

          {/* Category, Difficulty & Hours */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e: any) => setDifficulty(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              >
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Est. Hours
              </label>
              <input
                type="number"
                min="0"
                placeholder="20"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Course Code (Opt)
              </label>
              <input
                type="text"
                placeholder="GCP-101"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid #E5E7EB', paddingTop: '1rem' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Course Definition'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
