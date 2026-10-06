import React, { useState } from 'react';
import { X, Plus, FolderPlus } from 'lucide-react';
import type { CreateProjectPayload } from '../services/projectService';
import { FormField } from './FormField';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateProjectPayload) => Promise<void>;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [formData, setFormData] = useState<CreateProjectPayload>({
    name: '',
    description: '',
    projectType: 'Personal',
    courseName: '',
    technology: [],
    teamMembers: '',
    deadline: '',
    facultyMentor: ''
  });

  const [techInput, setTechInput] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const validate = () => {
    const errs: { [key: string]: string } = {};
    if (!formData.name.trim()) errs.name = 'Project Name is required.';
    if (!formData.description.trim()) errs.description = 'Description is required.';
    if (!formData.deadline) errs.deadline = 'Deadline date is required.';
    if (!formData.courseName?.trim()) errs.courseName = 'Course name or subject code is required.';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const techList = techInput
        ? techInput.split(',').map(t => t.trim()).filter(Boolean)
        : ['React', 'TypeScript'];

      await onSubmit({
        ...formData,
        technology: techList
      });

      // Reset form
      setFormData({
        name: '',
        description: '',
        projectType: 'Personal',
        courseName: '',
        technology: [],
        teamMembers: '',
        deadline: '',
        facultyMentor: ''
      });
      setTechInput('');
      setErrors({});
      onClose();
    } catch (err) {
      alert('Failed to create project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="role-card-icon-wrapper" style={{ width: '40px', height: '40px' }}>
              <FolderPlus size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Create New Project</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                Initialize a personal or team engineering workspace in AIET-UniSphere
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <FormField
              id="project-name"
              label="Project Name *"
              placeholder="e.g. AI-Based Waste Classification"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={errors.name}
            />

            <div className="form-group">
              <label htmlFor="project-desc" className="form-label">Description *</label>
              <textarea
                id="project-desc"
                className={`form-input ${errors.description ? 'has-error' : ''}`}
                rows={3}
                placeholder="Briefly describe the system architecture, objectives, and scope..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
              {errors.description && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>{errors.description}</span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="project-type" className="form-label">Project Type *</label>
                <select
                  id="project-type"
                  className="form-input"
                  value={formData.projectType}
                  onChange={(e) => setFormData({ ...formData, projectType: e.target.value as CreateProjectPayload['projectType'] })}
                >
                  <option value="Personal">Personal</option>
                  <option value="Team">Team</option>
                  <option value="Mini">Mini</option>
                  <option value="Capstone">Capstone</option>
                  <option value="Research">Research</option>
                </select>
              </div>

              <FormField
                id="project-course"
                label="Course / Subject *"
                placeholder="e.g. Artificial Intelligence (CS-603)"
                value={formData.courseName || ''}
                onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
                error={errors.courseName}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField
                id="project-mentor"
                label="Faculty / Mentor"
                placeholder="e.g. Dr. Faculty Name"
                value={formData.facultyMentor || ''}
                onChange={(e) => setFormData({ ...formData, facultyMentor: e.target.value })}
              />

              <div className="form-group">
                <label htmlFor="project-deadline" className="form-label">Deadline *</label>
                <input
                  type="date"
                  id="project-deadline"
                  className={`form-input ${errors.deadline ? 'has-error' : ''}`}
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                />
                {errors.deadline && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>{errors.deadline}</span>
                )}
              </div>
            </div>

            <FormField
              id="project-tech"
              label="Technology / Stack (comma separated)"
              placeholder="e.g. Python, TensorFlow, React, OpenCV"
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
            />

            <FormField
              id="project-team"
              label="Team Members (comma separated student names)"
              placeholder="e.g. Student 2, Student 3"
              value={formData.teamMembers || ''}
              onChange={(e) => setFormData({ ...formData, teamMembers: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ width: 'auto' }} 
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: 'auto' }}
              disabled={isSubmitting}
            >
              <Plus size={16} />
              {isSubmitting ? 'Creating Project...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
