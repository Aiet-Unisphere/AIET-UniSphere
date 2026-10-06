import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { DBExternalLearningCourse } from '../../types/database.types';
import { createExternalCourseAssignment } from '../../services/externalLearningService';

interface AssignExternalCourseModalProps {
  isOpen: boolean;
  courses: DBExternalLearningCourse[];
  departmentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AssignExternalCourseModal: React.FC<AssignExternalCourseModalProps> = ({
  isOpen,
  courses,
  departmentId,
  onClose,
  onSuccess
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const [semester, setSemester] = useState<string>('7');
  const [section, setSection] = useState<string>('');
  const [academicYear, setAcademicYear] = useState<string>('2026–27');
  const [required, setRequired] = useState<boolean>(true);
  const [deadline, setDeadline] = useState<string>('');
  const [academicCourseId, setAcademicCourseId] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const courseIdToAssign = selectedCourseId || (courses[0]?.id || '');
    if (!courseIdToAssign) {
      return setErrorMessage('Please select an external course definition.');
    }

    if (!departmentId) {
      return setErrorMessage('Department assignment scope is required.');
    }

    setIsSubmitting(true);

    try {
      await createExternalCourseAssignment({
        external_course_id: courseIdToAssign,
        department_id: departmentId,
        academic_course_id: academicCourseId.trim() || undefined,
        semester: semester ? parseInt(semester, 10) : undefined,
        section: section.trim() || undefined,
        academic_year: academicYear.trim() || undefined,
        required,
        deadline: deadline || undefined,
        instructions: instructions.trim() || undefined
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to assign external course to cohort.');
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
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-black)' }}>Assign External Course to Cohort</h3>
            <p style={{ fontSize: '0.8rem', color: '#6B7280' }}>Target department students will be enrolled automatically</p>
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
          {/* Select Course */}
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
              Select External Course *
            </label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.875rem' }}
            >
              {courses.length === 0 && <option value="">No course definitions available</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.platform})
                </option>
              ))}
            </select>
          </div>

          {/* Academic Subject Code Linkage (Optional) */}
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
              Link to Academic Subject Code (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. 22CSD71 (VTU Subject Code)"
              value={academicCourseId}
              onChange={(e) => setAcademicCourseId(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
            />
            <span style={{ fontSize: '0.725rem', color: '#6B7280' }}>Links this MOOC assignment as supplementary study for an internal subject.</span>
          </div>

          {/* Cohort Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.875rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Semester
              </label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              >
                <option value="7">Semester 7</option>
                <option value="6">Semester 6</option>
                <option value="5">Semester 5</option>
                <option value="4">Semester 4</option>
                <option value="3">Semester 3</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Section (Optional)
              </label>
              <input
                type="text"
                placeholder="A / B / All"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Academic Year
              </label>
              <input
                type="text"
                placeholder="2026–27"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Deadline & Required status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.875rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Completion Deadline
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
                Requirement Type
              </label>
              <select
                value={required ? 'true' : 'false'}
                onChange={(e) => setRequired(e.target.value === 'true')}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              >
                <option value="true">Mandatory Required</option>
                <option value="false">Optional Supplemental</option>
              </select>
            </div>
          </div>

          {/* Instructions */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.25rem' }}>
              Faculty Assignment Instructions
            </label>
            <textarea
              rows={3}
              placeholder="Provide guidance on completing modules, expected progress milestones, and certificate submission..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem', resize: 'vertical' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid #E5E7EB', paddingTop: '1rem' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || courses.length === 0}>
              {isSubmitting ? 'Assigning...' : 'Assign to Cohort'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
