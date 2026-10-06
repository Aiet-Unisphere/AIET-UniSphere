import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  Download, 
  Upload, 
  CheckCircle,
  FileCheck, 
  AlertCircle,
  FileText,
  Clock
} from 'lucide-react';
import { 
  getAssignmentById, 
  submitAssignment, 
  downloadAssignmentFile, 
  downloadSubmissionFile 
} from '../services/assignmentService';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const AssignmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // File Upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | null; message: string | null }>({
    type: null,
    message: null
  });

  const fetchAssignmentData = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAssignmentById(id);
      if (!data) {
        setError("Assignment not found.");
        return;
      }
      setAssignment(data);
    } catch (err) {
      setError("Unable to load assignment details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignmentData();
  }, [id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setStatusMessage({ type: null, message: null });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
      setStatusMessage({ type: null, message: null });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !id) {
      setStatusMessage({ type: 'error', message: "Please select a file to submit." });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage({ type: null, message: null });

    try {
      const updated = await submitAssignment(id, selectedFile);
      setAssignment(updated);
      setSelectedFile(null);
      setStatusMessage({ 
        type: 'success', 
        message: "Assignment submitted successfully to Supabase Storage! Ready for faculty review." 
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', message: err.message || "Failed to submit assignment. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadResource = async (res: string) => {
    setDownloading(true);
    setStatusMessage({ type: null, message: null });
    try {
      if (assignment.storagePath) {
        await downloadAssignmentFile(assignment.storagePath, assignment.fileName || res);
      } else {
        setStatusMessage({
          type: 'error',
          message: 'File is no longer available.'
        });
      }
    } catch (err: any) {
      const msg = err.message || '';
      setStatusMessage({
        type: 'error',
        message: msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no longer available') || msg.toLowerCase().includes('404')
          ? 'File is no longer available.'
          : (msg || 'Unable to download file. Please try again.')
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSubmission = async () => {
    if (!assignment?.submittedFile?.storagePath) {
      setStatusMessage({
        type: 'error',
        message: 'No storage path found for this submission.'
      });
      return;
    }
    setDownloading(true);
    try {
      await downloadSubmissionFile(
        assignment.submittedFile.storagePath, 
        assignment.submittedFile.name
      );
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        message: `Failed to download submitted file: ${err.message}`
      });
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading assignment specifications..." />
      </AppShell>
    );
  }

  if (error || !assignment) {
    return (
      <AppShell>
        <ErrorState message={error || "Failed to load assignment info"} onRetry={fetchAssignmentData} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Back button */}
      <div style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
        <button 
          onClick={() => navigate('/student/assignments')}
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.825rem', gap: '0.35rem' }}
        >
          <ArrowLeft size={14} />
          Back to Assignments
        </button>
      </div>

      <div className="dashboard-grid-two-col">
        {/* Left Column: Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
          
          {/* Assignment Header Card */}
          <div className="dashboard-panel">
            <span className="course-code-badge">{assignment.courseName}</span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: '0.5rem' }}>
              {assignment.title.split(' — ')[1] || assignment.title}
            </h1>
            
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '1rem', borderTop: '1px solid rgba(156, 163, 175, 0.1)', paddingTop: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>Deadline</span>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
                  <Calendar size={14} />
                  {new Date(assignment.deadline).toLocaleDateString()} at {new Date(assignment.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>Maximum Marks</span>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--brand-black)', marginTop: '0.15rem' }}>
                  {assignment.marks} Marks
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>Submission Status</span>
                <div style={{ marginTop: '0.15rem' }}>
                  <span className={`badge badge-${assignment.status.toLowerCase()}`}>
                    {assignment.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="dashboard-panel">
            <h3 className="panel-title">Instructions</h3>
            <p style={{ fontSize: '0.925rem', lineHeight: '1.6' }}>{assignment.instructions}</p>
          </div>

          {/* Resources & Question Paper */}
          {(assignment.resources.length > 0 || assignment.fileName) && (
            <div className="dashboard-panel">
              <h3 className="panel-title">Assignment Attachments &amp; Resources</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {assignment.fileName && (
                  <div 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '0.75rem 1rem', 
                      backgroundColor: 'var(--brand-light-grey)', 
                      borderRadius: 'var(--border-radius)',
                      border: '1px solid rgba(156, 163, 175, 0.15)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileText size={18} style={{ color: 'var(--brand-blue)' }} />
                      <div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                          {assignment.fileName}
                        </span>
                        {assignment.fileSize && (
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                            {(assignment.fileSize / 1024 / 1024).toFixed(2)} MB · Supabase Storage
                          </span>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDownloadResource(assignment.fileName)}
                      disabled={downloading}
                      className="btn btn-secondary" 
                      style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.25rem' }}
                    >
                      <Download size={12} /> {downloading ? 'Downloading...' : 'Download'}
                    </button>
                  </div>
                )}

                {assignment.resources.filter((r: string) => r !== assignment.fileName).map((res: string, idx: number) => (
                  <div 
                    key={idx} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '0.75rem 1rem', 
                      backgroundColor: 'var(--brand-light-grey)', 
                      borderRadius: 'var(--border-radius)',
                      border: '1px solid rgba(156, 163, 175, 0.15)'
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--brand-black)' }}>
                      📄 {res}
                    </span>
                    <button 
                      onClick={() => handleDownloadResource(res)}
                      disabled={downloading}
                      className="btn btn-secondary" 
                      style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.25rem' }}
                    >
                      <Download size={12} /> Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rubric */}
          {assignment.rubric.length > 0 && (
            <div className="dashboard-panel">
              <h3 className="panel-title">Grading Rubric</h3>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {assignment.rubric.map((rule: string, idx: number) => (
                  <li key={idx} style={{ color: 'var(--brand-black)' }}>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* Right Column: Submission Block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
          
          {/* Uploader Card */}
          <div className="dashboard-panel">
            <h3 className="panel-title">Your Submission</h3>
            
            {/* Status alerts */}
            {statusMessage.message && (
              <div 
                className={`form-message ${statusMessage.type === 'success' ? 'form-message-success' : 'form-message-error'}`}
                style={{ marginBottom: '1rem' }}
              >
                {statusMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                <span>{statusMessage.message}</span>
              </div>
            )}

            {/* If assignment is GRADED, show score and feedback */}
            {assignment.status === 'Graded' && assignment.grade ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div 
                  style={{ 
                    backgroundColor: 'var(--color-success-bg)', 
                    border: '1px solid rgba(16, 185, 129, 0.2)', 
                    padding: '1.25rem', 
                    borderRadius: 'var(--border-radius)',
                    textAlign: 'center'
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>Score Awarded</span>
                  <h2 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#047857', marginTop: '0.25rem' }}>
                    {assignment.grade.score} <span style={{ fontSize: '1.25rem', color: 'var(--brand-dark-grey)' }}>/ {assignment.marks}</span>
                  </h2>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem', display: 'block' }}>
                    Graded by {assignment.grade.gradedBy}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand-dark-grey)' }}>Feedback</span>
                  <p style={{ fontSize: '0.9rem', color: 'var(--brand-black)', marginTop: '0.25rem', backgroundColor: 'var(--brand-light-grey)', padding: '0.75rem', borderRadius: '4px', fontStyle: 'italic', borderLeft: '3px solid var(--brand-blue)' }}>
                    "{assignment.grade.feedback}"
                  </p>
                </div>

                <div style={{ borderTop: '1px solid rgba(156, 163, 175, 0.1)', paddingTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)' }}>Submitted Deliverable</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', margin: 0 }}>
                        📄 {assignment.submittedFile?.name}
                      </p>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)' }}>
                        Turned in on {new Date(assignment.submittedFile?.submittedAt).toLocaleString()}
                      </span>
                    </div>
                    {assignment.submittedFile?.storagePath && (
                      <button 
                        onClick={handleDownloadSubmission}
                        className="btn btn-secondary"
                        style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                      >
                        <Download size={12} /> Download
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : assignment.status === 'Submitted' ? (
              // If assignment is SUBMITTED but not graded
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div 
                  style={{ 
                    backgroundColor: 'rgba(11, 83, 160, 0.03)', 
                    border: '1px solid rgba(11, 83, 160, 0.15)', 
                    padding: '1rem', 
                    borderRadius: 'var(--border-radius)'
                  }}
                >
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <FileCheck size={18} />
                    Ready for faculty grading
                  </p>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)' }}>Submitted File</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', margin: 0 }}>
                        📄 {assignment.submittedFile?.name}
                      </p>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)' }}>
                        Uploaded to Supabase Storage on {new Date(assignment.submittedFile?.submittedAt || '').toLocaleString()}
                      </span>
                    </div>
                    {assignment.submittedFile?.storagePath && (
                      <button 
                        onClick={handleDownloadSubmission}
                        className="btn btn-secondary"
                        style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                      >
                        <Download size={12} /> Download
                      </button>
                    )}
                  </div>
                </div>

                {/* Resubmission zone */}
                <div style={{ borderTop: '1px solid rgba(156, 163, 175, 0.1)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--brand-black)', display: 'block', marginBottom: '0.5rem' }}>
                    Resubmit File (Overwrites previous Storage file)
                  </span>
                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div 
                      className="file-uploader-box"
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <Upload size={24} className="file-uploader-icon" />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Drag &amp; Drop or Click to Browse</span>
                      <input 
                        type="file" 
                        id="assignment-file-re"
                        onChange={handleFileChange}
                        disabled={isSubmitting}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="assignment-file-re" className="btn btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                        Browse Files
                      </label>
                    </div>

                    {selectedFile && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--brand-light-grey)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                          📄 {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                        <button type="button" onClick={() => setSelectedFile(null)} style={{ border: 'none', background: 'none', color: 'var(--color-error)', cursor: 'pointer', fontWeight: 600 }}>
                          Remove
                        </button>
                      </div>
                    )}

                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={!selectedFile || isSubmitting}
                      style={{ backgroundColor: 'var(--brand-orange)' }}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="spinner"></span>
                          <span>Uploading to Storage...</span>
                        </>
                      ) : 'Resubmit Assignment'}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              // If assignment is PENDING or OVERDUE
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div 
                  className="file-uploader-box"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <Upload size={28} className="file-uploader-icon" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Drag &amp; Drop file here</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Supported: PDF, DOCX, ZIP, Code files up to 20MB</span>
                  </div>
                  <input 
                    type="file" 
                    id="assignment-file-input"
                    onChange={handleFileChange}
                    disabled={isSubmitting}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="assignment-file-input" className="btn btn-secondary" style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                    Browse Files
                  </label>
                </div>

                {selectedFile && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--brand-light-grey)', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px', fontWeight: 600 }}>
                      📄 {selectedFile.name}
                    </span>
                    <button type="button" onClick={() => setSelectedFile(null)} style={{ border: 'none', background: 'none', color: 'var(--color-error)', cursor: 'pointer', fontWeight: 600 }}>
                      Remove
                    </button>
                  </div>
                )}

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!selectedFile || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner"></span>
                      <span>Uploading to Supabase Storage...</span>
                    </>
                  ) : 'Submit Assignment'}
                </button>
              </form>
            )}

          </div>

          {/* Submission Integrity Card */}
          <div className="dashboard-panel">
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--brand-black)' }}>
              Submission Guidelines &amp; Policies
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', lineHeight: '1.5' }}>
              Files uploaded are encrypted and stored in private Supabase Storage buckets. Only your assigned faculty evaluator and department head have grading authorization.
            </p>
          </div>

        </div>

      </div>
    </AppShell>
  );
};

export default AssignmentDetail;
