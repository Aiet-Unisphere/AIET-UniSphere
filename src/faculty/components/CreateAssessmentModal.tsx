import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Clock, BookOpen, HelpCircle } from 'lucide-react';
import { createAssessment, type CreateAssessmentQuestion } from '../../services/assessmentService';

interface CreateAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultCourseId?: string;
}

const emptyQuestion = (): CreateAssessmentQuestion => ({
  text: '',
  topic: '',
  options: ['', '', '', ''],
  correctOptionIndex: 0,
  marks: 1,
});

export const CreateAssessmentModal: React.FC<CreateAssessmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultCourseId = ''
}) => {
  const [subjectCode, setSubjectCode] = useState(defaultCourseId);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  
  // Date & Time states for Available From & Deadline
  const [availableFromDate, setAvailableFromDate] = useState('');
  const [availableFromTime, setAvailableFromTime] = useState('10:00');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('11:30');
  
  const [duration, setDuration] = useState<number>(60);
  const [questions, setQuestions] = useState<CreateAssessmentQuestion[]>([emptyQuestion()]);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const totalMarks = questions.reduce((total, question) => total + (Number(question.marks) || 0), 0);

  const updateQuestion = (index: number, updates: Partial<CreateAssessmentQuestion>) => {
    setQuestions(current => current.map((question, itemIndex) => itemIndex === index ? { ...question, ...updates } : question));
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) {
      setErrors(prev => ({ ...prev, questions: 'An assessment must have at least one question.' }));
      return;
    }
    setQuestions(current => current.filter((_, itemIndex) => itemIndex !== index));
  };

  useEffect(() => {
    if (!isOpen) return;
    
    // Set default dates if empty
    const today = new Date().toISOString().slice(0, 10);
    if (!availableFromDate) setAvailableFromDate(today);
    if (!deadlineDate) setDeadlineDate(today);
    if (defaultCourseId && !subjectCode) setSubjectCode(defaultCourseId);
  }, [isOpen, defaultCourseId]);

  if (!isOpen) return null;

  const validate = () => {
    const errs: { [key: string]: string } = {};
    const trimmedCode = subjectCode.trim();

    if (!trimmedCode) {
      errs.subjectCode = "Subject code is required.";
    } else if (trimmedCode.length > 30) {
      errs.subjectCode = "Subject code is too long (maximum 30 characters).";
    }

    if (!title.trim()) errs.title = "Assessment title is required.";
    if (!instructions.trim()) errs.instructions = "Instructions are required.";
    
    if (!availableFromDate || !availableFromTime) {
      errs.availableFrom = "Available From date and time are required.";
    }
    if (!deadlineDate || !deadlineTime) {
      errs.deadline = "Deadline date and time are required.";
    }

    const startDateTime = new Date(`${availableFromDate}T${availableFromTime}`);
    const endDateTime = new Date(`${deadlineDate}T${deadlineTime}`);

    if (isNaN(startDateTime.getTime())) {
      errs.availableFrom = "Invalid Available From date or time.";
    }
    if (isNaN(endDateTime.getTime())) {
      errs.deadline = "Invalid Deadline date or time.";
    }
    if (!isNaN(startDateTime.getTime()) && !isNaN(endDateTime.getTime()) && endDateTime <= startDateTime) {
      errs.deadline = "Deadline must be after Available From time.";
    }

    if (duration <= 0) errs.duration = "Duration must be greater than 0 minutes.";
    if (totalMarks <= 0) errs.totalMarks = "Total marks must be greater than 0.";
    
    if (!questions.length) {
      errs.questions = "At least one question is required.";
    } else {
      const invalidQ = questions.some(q => 
        !q.text.trim() || 
        q.options.some(opt => !opt.trim()) || 
        q.marks <= 0 ||
        q.correctOptionIndex < 0 ||
        q.correctOptionIndex > 3
      );
      if (invalidQ) {
        errs.questions = "Every question requires a prompt, 4 non-empty options, positive marks, and 1 correct option.";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const trimmedCode = subjectCode.trim();
    const availableFromISO = new Date(`${availableFromDate}T${availableFromTime}`).toISOString();
    const deadlineISO = new Date(`${deadlineDate}T${deadlineTime}`).toISOString();

    try {
      await createAssessment({
        title: title.trim(),
        subjectCode: trimmedCode,
        courseId: trimmedCode,
        courseCode: trimmedCode,
        courseName: trimmedCode,
        date: availableFromDate,
        dueDate: deadlineDate,
        availableFrom: availableFromISO,
        deadline: deadlineISO,
        time: availableFromTime,
        duration: Number(duration),
        totalMarks: Number(totalMarks),
        instructions: instructions.trim(),
        questions,
      });

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to create assessment", err);
      setErrors(current => ({ 
        ...current, 
        assessment: err instanceof Error ? err.message : 'Unable to create assessment. Please verify the subject code and try again.' 
      }));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)' }}>
      <div 
        className="modal-container" 
        style={{ maxWidth: '780px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '12px', overflow: 'hidden' }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: '#FFF' }}>
          <div>
            <span className="badge badge-active font-mono" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              CREATE ASSESSMENT
            </span>
            <h2 className="modal-title font-display" style={{ marginTop: '0.25rem', fontSize: '1.4rem', fontWeight: 800 }}>
              New Multiple Choice Test
            </h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Scrollable Body */}
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            
            {/* SECTION 1: BASIC INFORMATION */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <BookOpen size={16} /> Basic Information
              </h3>
              
              {/* Subject Code Text Input */}
              <div className="form-group">
                <label className="form-label">Subject Code *</label>
                <input 
                  type="text" 
                  className={`form-control font-mono ${errors.subjectCode ? 'is-invalid' : ''}`}
                  placeholder="e.g. CSE601"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  disabled={isSubmitting}
                  maxLength={30}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem', display: 'block' }}>
                  Enter the official subject/course code for this assessment.
                </span>
                {errors.subjectCode && <span className="form-error-msg">{errors.subjectCode}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Assessment Title *</label>
                <input 
                  type="text" 
                  className={`form-control ${errors.title ? 'is-invalid' : ''}`}
                  placeholder="e.g. DBMS Unit Test 01 — Normalization & Transactions"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.title && <span className="form-error-msg">{errors.title}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Detailed Instructions *</label>
                <textarea 
                  className={`form-control ${errors.instructions ? 'is-invalid' : ''}`}
                  rows={3}
                  placeholder="Specify guidelines, topics covered, allowed resources, and instructions for students..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.instructions && <span className="form-error-msg">{errors.instructions}</span>}
              </div>
            </div>

            {/* SECTION 2: AVAILABILITY & TIMING */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid rgba(156, 163, 175, 0.15)', paddingTop: '1.25rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <Clock size={16} /> Availability & Timing
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Available From *</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="date" 
                      className={`form-control ${errors.availableFrom ? 'is-invalid' : ''}`}
                      value={availableFromDate}
                      onChange={(e) => setAvailableFromDate(e.target.value)}
                      disabled={isSubmitting}
                    />
                    <input 
                      type="time" 
                      className={`form-control ${errors.availableFrom ? 'is-invalid' : ''}`}
                      value={availableFromTime}
                      onChange={(e) => setAvailableFromTime(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.availableFrom && <span className="form-error-msg">{errors.availableFrom}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Deadline *</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="date" 
                      className={`form-control ${errors.deadline ? 'is-invalid' : ''}`}
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                      disabled={isSubmitting}
                    />
                    <input 
                      type="time" 
                      className={`form-control ${errors.deadline ? 'is-invalid' : ''}`}
                      value={deadlineTime}
                      onChange={(e) => setDeadlineTime(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.deadline && <span className="form-error-msg">{errors.deadline}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Duration (Minutes) *</label>
                  <input 
                    type="number" 
                    min="1"
                    className={`form-control ${errors.duration ? 'is-invalid' : ''}`}
                    placeholder="60"
                    value={duration}
                    onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))}
                    disabled={isSubmitting}
                  />
                  {errors.duration && <span className="form-error-msg">{errors.duration}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Total Marks</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={totalMarks}
                    readOnly
                    disabled
                    style={{ backgroundColor: 'var(--brand-light-grey)', fontWeight: 700, color: 'var(--brand-black)' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem', display: 'block' }}>
                    Automatically calculated from questions
                  </span>
                </div>
              </div>
            </div>

            {/* SECTION 3: DYNAMIC QUESTION BUILDER */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid rgba(156, 163, 175, 0.15)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                  <HelpCircle size={16} /> Questions ({questions.length})
                </h3>
              </div>

              {errors.questions && <div className="form-error-msg" style={{ marginBottom: '0.5rem' }}>{errors.questions}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {questions.map((question, index) => (
                  <div 
                    key={index} 
                    className="dashboard-panel" 
                    style={{ 
                      padding: '1.25rem', 
                      borderRadius: '8px', 
                      backgroundColor: 'var(--brand-light-grey)',
                      border: '1px solid rgba(156, 163, 175, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem'
                    }}
                  >
                    {/* Question Header & Remove Button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Question {index + 1}
                      </span>
                      {questions.length > 1 && (
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ width: 'auto', padding: '0.3rem 0.6rem', color: '#b91c1c', border: '1px solid rgba(185, 28, 28, 0.2)' }}
                          aria-label={`Remove question ${index + 1}`} 
                          onClick={() => removeQuestion(index)}
                          disabled={isSubmitting}
                          title="Delete question"
                        >
                          <Trash2 size={14} />
                          <span style={{ fontSize: '0.75rem' }}>Remove</span>
                        </button>
                      )}
                    </div>

                    {/* Topic */}
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.775rem' }}>Topic (Optional)</label>
                      <input
                        className="form-control font-sans"
                        placeholder="e.g. Normalization / SQL / Indexes"
                        value={question.topic}
                        onChange={e => updateQuestion(index, { topic: e.target.value })}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Question Prompt */}
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.775rem' }}>Question Text *</label>
                      <textarea
                        className="form-control font-sans"
                        placeholder="Write the multiple choice question text here..."
                        value={question.text}
                        onChange={e => updateQuestion(index, { text: e.target.value })}
                        disabled={isSubmitting}
                        rows={2}
                      />
                    </div>

                    {/* Options Grid */}
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.775rem' }}>Options *</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
                        {question.options.map((option, optionIndex) => (
                          <div key={optionIndex} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="font-mono font-bold" style={{ fontSize: '0.85rem', color: 'var(--brand-blue)', width: '20px', textAlign: 'center' }}>
                              {String.fromCharCode(65 + optionIndex)}
                            </span>
                            <input
                              className="form-control font-sans"
                              placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                              value={option}
                              onChange={e => {
                                const options = [...question.options] as CreateAssessmentQuestion['options'];
                                options[optionIndex] = e.target.value;
                                updateQuestion(index, { options });
                              }}
                              disabled={isSubmitting}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Correct Option & Marks Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', alignItems: 'center', backgroundColor: '#FFF', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                      <div>
                        <span className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.775rem' }}>
                          Correct Answer *
                        </span>
                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                          {['A', 'B', 'C', 'D'].map((letter, optIndex) => (
                            <label key={letter} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                              <input
                                type="radio"
                                name={`correct-option-${index}`}
                                checked={question.correctOptionIndex === optIndex}
                                onChange={() => updateQuestion(index, { correctOptionIndex: optIndex })}
                                disabled={isSubmitting}
                              />
                              <span>{letter}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.775rem' }}>Marks *</label>
                        <input
                          className="form-control font-mono"
                          type="number"
                          min="1"
                          value={question.marks}
                          onChange={e => updateQuestion(index, { marks: Math.max(1, Number(e.target.value)) })}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>

                  </div>
                ))}
              </div>

              {/* Add Question Button */}
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ width: '100%', padding: '0.75rem', justifyContent: 'center', marginTop: '0.5rem', borderStyle: 'dashed', borderWidth: '1.5px' }} 
                onClick={() => setQuestions(current => [...current, emptyQuestion()])} 
                disabled={isSubmitting}
              >
                <Plus size={16} /> <span>Add Question</span>
              </button>
            </div>

            {/* SECTION 4: ASSESSMENT SUMMARY */}
            <div 
              style={{ 
                backgroundColor: 'rgba(37, 99, 235, 0.05)', 
                border: '1px solid rgba(37, 99, 235, 0.2)', 
                borderRadius: '8px', 
                padding: '1rem 1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--brand-blue)', letterSpacing: '0.04em' }}>
                  ASSESSMENT SUMMARY
                </span>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
                  {questions.length} Question{questions.length > 1 ? 's' : ''} • {totalMarks} Total Mark{totalMarks > 1 ? 's' : ''}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--brand-dark-grey)', letterSpacing: '0.04em' }}>
                  DURATION
                </span>
                <div className="font-mono font-bold" style={{ fontSize: '0.95rem', color: 'var(--brand-orange)' }}>
                  {duration} Minutes
                </div>
              </div>
            </div>

            {errors.assessment && <div className="form-error-msg" style={{ fontSize: '0.9rem' }}>{errors.assessment}</div>}
          </div>

          {/* Modal Footer */}
          <div className="modal-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', backgroundColor: '#FFF', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ backgroundColor: 'var(--brand-orange)' }} disabled={isSubmitting}>
              <Plus size={16} />
              <span>{isSubmitting ? 'Creating Assessment...' : 'Create Assessment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
