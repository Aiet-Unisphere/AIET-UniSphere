import React, { useState, useEffect } from 'react';
import { X, Plus, Calendar, FileText, Upload, AlertCircle, Paperclip, Trash2, CheckCircle2, Shield } from 'lucide-react';
import { createAssignment } from '../../services/assignmentService';
import { useAuth } from '../../app/context/AuthContext';

interface CreateAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultCourseId?: string;
  defaultCourseName?: string;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.zip', '.ppt', '.pptx'];

/**
 * Safely derives course_name and course_id from user input text.
 */
function normalizeCourse(input: string): { courseId: string; courseName: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { courseId: 'general', courseName: 'General Course' };
  }

  // Extract code if present inside parentheses e.g. "DBMS (CS501)" -> "cs501"
  const parenMatch = trimmed.match(/\(([^)]+)\)/);
  let slug = '';
  if (parenMatch && parenMatch[1]) {
    slug = parenMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  if (!slug) {
    slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  return {
    courseId: slug || 'general',
    courseName: trimmed
  };
}

export const CreateAssignmentModal: React.FC<CreateAssignmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultCourseId,
  defaultCourseName
}) => {
  const { profile } = useAuth();

  // Calculate default deadline: 7 days from now at 23:59
  const getDefaultDeadline = () => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    d.setHours(23, 59, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const [courseInput, setCourseInput] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [deadline, setDeadline] = useState(getDefaultDeadline());
  const [totalMarks, setTotalMarks] = useState<number | string>(20);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset course input when modal opens
  useEffect(() => {
    if (isOpen) {
      setCourseInput(defaultCourseName || defaultCourseId || '');
      setTitle('');
      setInstructions('');
      setDeadline(getDefaultDeadline());
      setTotalMarks(20);
      setSelectedFile(null);
      setFieldErrors({});
      setGeneralError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, defaultCourseId, defaultCourseName]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!courseInput.trim()) {
      errs.course = 'Course name / code is required.';
    }

    if (!title.trim()) {
      errs.title = 'Assignment title is required.';
    }

    if (!deadline) {
      errs.deadline = 'Due date and time are required.';
    } else {
      const d = new Date(deadline);
      if (isNaN(d.getTime())) {
        errs.deadline = 'Please provide a valid date and time.';
      }
    }

    const marksNum = Number(totalMarks);
    if (!totalMarks || isNaN(marksNum) || marksNum < 1) {
      errs.totalMarks = 'Total marks must be at least 1.';
    } else if (marksNum > 1000) {
      errs.totalMarks = 'Total marks cannot exceed 1000.';
    }

    if (!instructions.trim()) {
      errs.instructions = 'Detailed instructions are required.';
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

      // Validate size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFieldErrors(prev => ({
          ...prev,
          file: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of 20 MB.`
        }));
        return;
      }

      // Validate extension
      const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setFieldErrors(prev => ({
          ...prev,
          file: `Unsupported format. Allowed formats: PDF, DOCX, DOC, ZIP, PPT, PPTX.`
        }));
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next.file;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    const { courseId, courseName } = normalizeCourse(courseInput);

    try {
      await createAssignment({
        title: title.trim(),
        courseId,
        courseName,
        deadline: new Date(deadline).toISOString(),
        marks: Number(totalMarks),
        instructions: instructions.trim(),
        file: selectedFile || undefined
      });

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[CreateAssignmentModal] Submission error:', err);
      setGeneralError('Unable to create the assignment. Please try again.');
      setIsSubmitting(false);
    }
  };

  const departmentDisplay = profile?.department?.name
    ? `${profile.department.code ? profile.department.code + ' — ' : ''}${profile.department.name}`
    : 'Department not assigned';

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
          maxWidth: '640px',
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
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#FAFAFA',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem'
          }}
        >
          <div>
            <span
              className="badge font-mono"
              style={{
                backgroundColor: 'rgba(11, 83, 160, 0.08)',
                color: 'var(--brand-blue)',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                padding: '0.2rem 0.55rem',
                borderRadius: '4px',
                display: 'inline-block',
                marginBottom: '0.35rem'
              }}
            >
              NEW ASSIGNMENT
            </span>
            <h2
              className="font-display"
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: 'var(--brand-black)',
                margin: 0,
                lineHeight: 1.2
              }}
            >
              Create Assignment
            </h2>
            <p
              style={{
                fontSize: '0.825rem',
                color: 'var(--brand-dark-grey)',
                margin: '0.25rem 0 0 0'
              }}
            >
              Create and publish an assignment for your students.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: '#64748B',
              padding: '0.35rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s ease'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* General Error Alert */}
        {generalError && (
          <div
            style={{
              margin: '1rem 1.75rem 0',
              padding: '0.75rem 1rem',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#991B1B',
              fontSize: '0.85rem'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ display: 'block', fontWeight: 700 }}>Something went wrong</strong>
              <span>{generalError}</span>
            </div>
          </div>
        )}

        {/* Scrollable Modal Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              padding: '1.5rem 1.75rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
          >
            {/* Section Header */}
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--brand-blue)',
                paddingBottom: '0.35rem',
                borderBottom: '1px solid #E2E8F0'
              }}
            >
              Assignment Details
            </div>

            {/* Course Name / Course Code */}
            <div>
              <label
                htmlFor="assignment-course"
                style={{
                  display: 'block',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  color: 'var(--brand-black)',
                  marginBottom: '0.35rem'
                }}
              >
                Course Name / Course Code <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                id="assignment-course"
                className="form-input font-sans"
                placeholder="e.g. DBMS (CS501)"
                value={courseInput}
                onChange={(e) => {
                  setCourseInput(e.target.value);
                  if (fieldErrors.course) {
                    setFieldErrors(prev => {
                      const next = { ...prev };
                      delete next.course;
                      return next;
                    });
                  }
                }}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  fontSize: '0.9rem',
                  borderRadius: '6px',
                  border: fieldErrors.course ? '1px solid #EF4444' : '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF'
                }}
              />
              {fieldErrors.course && (
                <div style={{ color: '#DC2626', fontSize: '0.775rem', marginTop: '0.3rem', fontWeight: 500 }}>
                  {fieldErrors.course}
                </div>
              )}
            </div>

            {/* Department (Read-only derived field) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label
                  style={{
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    color: 'var(--brand-black)'
                  }}
                >
                  Department
                </label>
                <span style={{ fontSize: '0.725rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Shield size={12} /> Derived from your profile
                </span>
              </div>
              <input
                type="text"
                value={departmentDisplay}
                disabled
                readOnly
                className="form-input font-sans"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#F8FAFC',
                  color: '#334155',
                  cursor: 'not-allowed',
                  fontWeight: 600
                }}
              />
            </div>

            {/* Assignment Title */}
            <div>
              <label
                htmlFor="assignment-title"
                style={{
                  display: 'block',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  color: 'var(--brand-black)',
                  marginBottom: '0.35rem'
                }}
              >
                Assignment Title <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                id="assignment-title"
                className="form-input font-sans"
                placeholder="e.g. DBMS Assignment 1 — Relational Algebra & SQL"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (fieldErrors.title) {
                    setFieldErrors(prev => {
                      const next = { ...prev };
                      delete next.title;
                      return next;
                    });
                  }
                }}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  fontSize: '0.9rem',
                  borderRadius: '6px',
                  border: fieldErrors.title ? '1px solid #EF4444' : '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF'
                }}
              />
              {fieldErrors.title && (
                <div style={{ color: '#DC2626', fontSize: '0.775rem', marginTop: '0.3rem', fontWeight: 500 }}>
                  {fieldErrors.title}
                </div>
              )}
            </div>

            {/* Due Date & Total Marks Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {/* Due Date & Time */}
              <div>
                <label
                  htmlFor="assignment-deadline"
                  style={{
                    display: 'block',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    color: 'var(--brand-black)',
                    marginBottom: '0.35rem'
                  }}
                >
                  Due Date &amp; Time <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="datetime-local"
                  id="assignment-deadline"
                  className="form-input font-sans"
                  value={deadline}
                  onChange={(e) => {
                    setDeadline(e.target.value);
                    if (fieldErrors.deadline) {
                      setFieldErrors(prev => {
                        const next = { ...prev };
                        delete next.deadline;
                        return next;
                      });
                    }
                  }}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '6px',
                    border: fieldErrors.deadline ? '1px solid #EF4444' : '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF'
                  }}
                />
                {fieldErrors.deadline && (
                  <div style={{ color: '#DC2626', fontSize: '0.775rem', marginTop: '0.3rem', fontWeight: 500 }}>
                    {fieldErrors.deadline}
                  </div>
                )}
              </div>

              {/* Total Marks */}
              <div>
                <label
                  htmlFor="assignment-marks"
                  style={{
                    display: 'block',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    color: 'var(--brand-black)',
                    marginBottom: '0.35rem'
                  }}
                >
                  Total Marks <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="number"
                  id="assignment-marks"
                  className="form-input font-sans"
                  placeholder="20"
                  min="1"
                  max="1000"
                  value={totalMarks}
                  onChange={(e) => {
                    setTotalMarks(e.target.value);
                    if (fieldErrors.totalMarks) {
                      setFieldErrors(prev => {
                        const next = { ...prev };
                        delete next.totalMarks;
                        return next;
                      });
                    }
                  }}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '6px',
                    border: fieldErrors.totalMarks ? '1px solid #EF4444' : '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF'
                  }}
                />
                {fieldErrors.totalMarks && (
                  <div style={{ color: '#DC2626', fontSize: '0.775rem', marginTop: '0.3rem', fontWeight: 500 }}>
                    {fieldErrors.totalMarks}
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Instructions */}
            <div>
              <label
                htmlFor="assignment-instructions"
                style={{
                  display: 'block',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  color: 'var(--brand-black)',
                  marginBottom: '0.35rem'
                }}
              >
                Detailed Instructions <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                id="assignment-instructions"
                className="form-input font-sans"
                rows={4}
                placeholder="Specify assignment requirements, questions to solve, expected deliverable formats, and submission guidelines..."
                value={instructions}
                onChange={(e) => {
                  setInstructions(e.target.value);
                  if (fieldErrors.instructions) {
                    setFieldErrors(prev => {
                      const next = { ...prev };
                      delete next.instructions;
                      return next;
                    });
                  }
                }}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '6px',
                  border: fieldErrors.instructions ? '1px solid #EF4444' : '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  lineHeight: 1.5,
                  resize: 'vertical'
                }}
              />
              {fieldErrors.instructions && (
                <div style={{ color: '#DC2626', fontSize: '0.775rem', marginTop: '0.3rem', fontWeight: 500 }}>
                  {fieldErrors.instructions}
                </div>
              )}
            </div>

            {/* Question Paper / Specification Attachment (Optional) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label
                  style={{
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    color: 'var(--brand-black)'
                  }}
                >
                  Question Paper / Specification
                </label>
                <span style={{ fontSize: '0.725rem', color: '#64748B', fontWeight: 600 }}>
                  Optional
                </span>
              </div>

              <input
                type="file"
                id="faculty-question-paper-file"
                accept=".pdf,.docx,.doc,.zip,.ppt,.pptx"
                onChange={handleFileChange}
                disabled={isSubmitting}
                style={{ display: 'none' }}
              />

              {!selectedFile ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    border: '1px dashed #CBD5E1',
                    borderRadius: '8px',
                    backgroundColor: '#F8FAFC'
                  }}
                >
                  <label
                    htmlFor="faculty-question-paper-file"
                    className="btn btn-secondary font-sans"
                    style={{
                      width: 'auto',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.825rem',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontWeight: 600,
                      color: 'var(--brand-blue)',
                      borderColor: '#CBD5E1',
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    <Paperclip size={15} />
                    <span>Upload File</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    PDF, DOCX, ZIP • Maximum 20 MB
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
                    <FileText size={18} style={{ color: 'var(--brand-blue)', flexShrink: 0 }} />
                    <div style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          color: '#0369A1',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {selectedFile.name}
                      </div>
                      <div style={{ fontSize: '0.725rem', color: '#64748B', marginTop: '0.1rem' }}>
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    disabled={isSubmitting}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#DC2626',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px'
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Remove</span>
                  </button>
                </div>
              )}

              {fieldErrors.file && (
                <div style={{ color: '#DC2626', fontSize: '0.775rem', marginTop: '0.35rem', fontWeight: 500 }}>
                  {fieldErrors.file}
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer / Actions */}
          <div
            style={{
              padding: '1rem 1.75rem',
              borderTop: '1px solid #E2E8F0',
              backgroundColor: '#FAFAFA',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            <button
              type="button"
              className="btn btn-secondary font-sans"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '0.55rem 1.15rem',
                fontSize: '0.875rem',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary font-sans"
              disabled={isSubmitting}
              style={{
                padding: '0.55rem 1.35rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                minWidth: '160px',
                justifyContent: 'center'
              }}
            >
              {isSubmitting ? (
                <>
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid #FFFFFF',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }}
                  />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>Create Assignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAssignmentModal;

