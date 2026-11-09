import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { updateCourseMaterial, type CourseMaterialItem } from '../../services/courseService';

interface EditCourseMaterialModalProps {
  material: CourseMaterialItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingModules?: string[];
}

export const EditCourseMaterialModal: React.FC<EditCourseMaterialModalProps> = ({
  material,
  isOpen,
  onClose,
  onSuccess,
  existingModules = []
}) => {
  const [title, setTitle] = useState('');
  const [moduleSelection, setModuleSelection] = useState('General');
  const [customModule, setCustomModule] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (material && isOpen) {
      setTitle(material.title || '');
      const mod = material.moduleId || 'General';
      if (existingModules.includes(mod) || mod === 'General') {
        setModuleSelection(mod);
        setCustomModule('');
      } else {
        setModuleSelection('__custom__');
        setCustomModule(mod);
      }
      setError(null);
      setIsSubmitting(false);
    }
  }, [material, isOpen, existingModules]);

  if (!isOpen || !material) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Material title is required.');
      return;
    }

    const resolvedModule = moduleSelection === '__custom__' ? customModule.trim() : moduleSelection;
    if (moduleSelection === '__custom__' && !resolvedModule) {
      setError('Please specify the module name.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateCourseMaterial(material.id, {
        title: title.trim(),
        moduleId: resolvedModule || 'General'
      });
      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[EditCourseMaterialModal] Update error:', err);
      setError(err.message || 'Unable to update material metadata.');
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
          maxWidth: '500px',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid rgba(226, 232, 240, 0.9)'
        }}
      >
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>METADATA EDIT</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-black)', margin: '0.2rem 0 0' }}>
              Edit Material Details
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div className="alert-banner error" style={{ padding: '0.65rem 0.85rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
              MATERIAL TITLE *
            </label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              style={{ width: '100%', fontSize: '0.875rem' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
              MODULE ASSOCIATION
            </label>
            <select
              className="form-select"
              value={moduleSelection}
              onChange={(e) => setModuleSelection(e.target.value)}
              disabled={isSubmitting}
              style={{ width: '100%', fontSize: '0.875rem' }}
            >
              {moduleOptions.map(mod => (
                <option key={mod} value={mod}>{mod}</option>
              ))}
              <option value="__custom__">+ Custom Module Name...</option>
            </select>

            {moduleSelection === '__custom__' && (
              <input
                type="text"
                className="form-input"
                placeholder="Enter custom module name"
                value={customModule}
                onChange={(e) => setCustomModule(e.target.value)}
                disabled={isSubmitting}
                style={{ width: '100%', fontSize: '0.875rem', marginTop: '0.4rem' }}
              />
            )}
          </div>

          <div style={{ backgroundColor: '#F8FAFC', padding: '0.75rem', borderRadius: '6px', fontSize: '0.775rem', color: '#64748B' }}>
            Attached File: <strong style={{ color: 'var(--brand-black)' }}>{material.fileName}</strong> ({material.fileType})
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
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
              <Save size={16} />
              <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
