import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Users, 
  Clock, 
  Award, 
  FileText, 
  Download,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { StatCard } from '../../components/StatCard';
import { 
  getAssignmentById, 
  getSubmissionsForAssignment,
  downloadSubmissionFile,
  downloadAssignmentFile,
  getAssignmentFileUrl,
  getSubmissionFileUrl
} from '../../services/assignmentService';
import type { FacultyAssignmentSubmission } from '../../services/assignmentService';
import type { Assignment } from '../../data/assignments';
import { GradeSubmissionModal } from '../components/GradeSubmissionModal';
import { supabase } from '../../lib/supabase';

export const FacultyAssignmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<FacultyAssignmentSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<FacultyAssignmentSubmission | null>(null);
  const [enrolledCount, setEnrolledCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadMsg, setDownloadMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const loadData = async () => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    try {
      const [assg, subs] = await Promise.all([
        getAssignmentById(id),
        getSubmissionsForAssignment(id)
      ]);

      setAssignment(assg || null);
      setSubmissions(subs);

      // Query enrolled students in the department for total count
      if (assg?.courseId) {
        const { count } = await (supabase as any)
          .from('course_enrollments')
          .select('student_id', { count: 'exact', head: true })
          .eq('course_id', assg.courseId)
          .eq('status', 'Active');
        setEnrolledCount(count || subs.length);
      } else {
        const { count } = await (supabase as any)
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'STUDENT');
        setEnrolledCount(count || subs.length);
      }
    } catch (err) {
      console.error('Failed to load assignment details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleViewAssignmentAttachment = async () => {
    if (!assignment?.storagePath) return;
    try {
      const url = await getAssignmentFileUrl(assignment.storagePath);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setDownloadMsg({ text: 'File preview URL unavailable.', error: true });
      }
    } catch (err: any) {
      setDownloadMsg({ text: err.message || 'Failed to preview file.', error: true });
    }
  };

  const handleDownloadAssignmentAttachment = async () => {
    if (!assignment?.storagePath) {
      setDownloadMsg({ text: 'File is no longer available.', error: true });
      return;
    }

    try {
      setDownloadMsg({ text: `Downloading ${assignment.fileName || 'attachment'}...` });
      await downloadAssignmentFile(assignment.storagePath, assignment.fileName || 'attachment');
      setDownloadMsg({ text: `Downloaded successfully.` });
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err: any) {
      const msg = err.message || '';
      setDownloadMsg({ 
        text: msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('404')
          ? 'File is no longer available.'
          : (msg || 'Unable to download file.'), 
        error: true 
      });
    }
  };

  const handleViewSubmissionFile = async (sub: FacultyAssignmentSubmission) => {
    if (!sub.storagePath) return;
    try {
      const url = await getSubmissionFileUrl(sub.storagePath);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setDownloadMsg({ text: 'File preview URL unavailable.', error: true });
      }
    } catch (err: any) {
      setDownloadMsg({ text: err.message || 'Failed to preview submission file.', error: true });
    }
  };

  const handleDownloadSubmissionFile = async (sub: FacultyAssignmentSubmission) => {
    setDownloadMsg(null);
    if (!sub.storagePath) {
      setDownloadMsg({ text: 'File is no longer available.', error: true });
      return;
    }

    try {
      setDownloadMsg({ text: `Downloading ${sub.fileName}...` });
      await downloadSubmissionFile(sub.storagePath, sub.fileName);
      setDownloadMsg({ text: `Downloaded ${sub.fileName} successfully.` });
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err: any) {
      const msg = err.message || '';
      setDownloadMsg({ 
        text: msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('404')
          ? 'File is no longer available.'
          : (msg || 'Unable to download file.'), 
        error: true 
      });
    }
  };

  if (isLoading) {
    return (
      <FacultyAppShell>
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
          Loading assignment details...
        </div>
      </FacultyAppShell>
    );
  }

  if (!assignment) {
    return (
      <FacultyAppShell>
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--brand-black)' }}>Assignment Not Found</h3>
          <p style={{ fontSize: '0.85rem' }}>The requested assignment does not exist or you do not have permission to view it.</p>
          <button 
            className="btn btn-secondary" 
            style={{ width: 'auto', marginTop: '1rem' }}
            onClick={() => navigate('/faculty/assignments')}
          >
            Back to Assignments
          </button>
        </div>
      </FacultyAppShell>
    );
  }

  const deadlineDate = new Date(assignment.deadline);
  const isPastDeadline = new Date() > deadlineDate;

  const evaluatedCount = submissions.filter(s => s.status === 'Graded').length;
  const pendingEvaluationCount = submissions.filter(s => s.status === 'Submitted').length;

  return (
    <FacultyAppShell>
      {/* Back Navigation Button */}
      <div style={{ marginBottom: '1rem' }}>
        <button 
          className="btn btn-secondary" 
          style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          onClick={() => navigate('/faculty/assignments')}
        >
          <ArrowLeft size={14} />
          <span>Back to Assignments</span>
        </button>
      </div>

      {/* Assignment Header Card */}
      <div className="dashboard-panel" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <span className="badge badge-graded font-mono" style={{ fontSize: '0.7rem' }}>{assignment.courseId.toUpperCase()}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>{assignment.courseName}</span>
              {isPastDeadline ? (
                <span className="badge badge-overdue font-mono" style={{ fontSize: '0.675rem' }}>CLOSED</span>
              ) : (
                <span className="badge badge-active font-mono" style={{ fontSize: '0.675rem' }}>ACTIVE</span>
              )}
            </div>

            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--brand-black)', margin: 0 }}>
              {assignment.title}
            </h1>

            <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem', margin: 0 }}>
              Deadline: <span className="font-mono" style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{deadlineDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span> · Max Marks: <span className="font-mono" style={{ fontWeight: 700, color: 'var(--brand-black)' }}>{assignment.marks}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Download Alert Toast */}
      {downloadMsg && (
        <div 
          className={`alert-banner ${downloadMsg.error ? 'error' : 'success'}`}
          style={{ marginBottom: '1.25rem', padding: '0.65rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {downloadMsg.error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{downloadMsg.text}</span>
        </div>
      )}

      {/* Submission Statistics Cards */}
      <div className="stat-cards-grid" style={{ gap: '0.85rem', marginBottom: '1.25rem' }}>
        <StatCard 
          title="Total Enrolled" 
          value={enrolledCount.toString()} 
          icon={<Users size={18} />}
        />
        <StatCard 
          title="Submissions Received" 
          value={submissions.length.toString()} 
          icon={<FileText size={18} />}
        />
        <StatCard 
          title="Pending Evaluation" 
          value={pendingEvaluationCount.toString()} 
          icon={<Clock size={18} />}
        />
        <StatCard 
          title="Evaluated & Graded" 
          value={evaluatedCount.toString()} 
          icon={<Award size={18} />}
        />
      </div>

      {/* Instructions & Resources Card */}
      <div className="dashboard-panel" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
        <h3 className="panel-title" style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Instructions &amp; Requirements</h3>
        <p style={{ lineHeight: '1.5', fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
          {assignment.instructions}
        </p>

        {/* Resources & Attachments */}
        {(assignment.fileName || (assignment.resources && assignment.resources.length > 0)) && (
          <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '0.75rem 1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
              ATTACHED QUESTION PAPER &amp; RESOURCES
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {assignment.fileName && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--brand-black)', fontWeight: 600 }}>
                    <FileText size={16} className="text-orange" />
                    <span>{assignment.fileName}</span>
                    {assignment.fileSize && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 400 }}>
                        ({(assignment.fileSize / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button 
                      onClick={handleViewAssignmentAttachment}
                      className="btn btn-secondary" 
                      style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', gap: '0.25rem' }}
                    >
                      <Eye size={13} /> View
                    </button>
                    <button 
                      onClick={handleDownloadAssignmentAttachment}
                      className="btn btn-secondary" 
                      style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem', gap: '0.25rem' }}
                    >
                      <Download size={13} /> Download
                    </button>
                  </div>
                </div>
              )}

              {assignment.resources?.filter(r => r !== assignment.fileName).map((res, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: 'var(--brand-dark-grey)' }}>
                  <FileText size={14} />
                  <span>{res}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Student Submissions Review Table */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem 0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
          <h3 className="panel-title" style={{ fontSize: '1rem', fontWeight: 800 }}>Student Submissions</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
            {submissions.length} Received
          </span>
        </div>

        {submissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--brand-dark-grey)' }}>
            <FileText size={36} style={{ margin: '0 auto 0.5rem', color: 'var(--brand-dark-grey)' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--brand-black)' }}>No Student Submissions Yet</h4>
            <p style={{ fontSize: '0.825rem', marginTop: '0.2rem' }}>Submissions turned in by enrolled students will appear here for grading.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table font-sans" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: '160px' }}>Student Name</th>
                  <th style={{ minWidth: '110px' }}>USN</th>
                  <th style={{ minWidth: '140px' }}>Submitted Date</th>
                  <th style={{ minWidth: '180px' }}>Deliverable</th>
                  <th style={{ minWidth: '110px' }}>Status</th>
                  <th style={{ minWidth: '100px', textAlign: 'center' }}>Score</th>
                  <th style={{ minWidth: '180px' }}>Feedback</th>
                  <th style={{ minWidth: '110px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => {
                  const subDate = new Date(sub.submittedAt);
                  const isLate = subDate > deadlineDate;

                  return (
                    <tr key={sub.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.85rem' }}>{sub.studentName}</div>
                      </td>

                      <td style={{ fontSize: '0.825rem' }} className="font-mono">
                        {sub.usn}
                      </td>

                      <td>
                        <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--brand-black)' }}>
                          {subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="font-mono" style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)' }}>
                          {subDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td>
                        {sub.storagePath ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <button
                              type="button"
                              onClick={() => handleViewSubmissionFile(sub)}
                              title="Preview submission file"
                              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-blue)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600, fontSize: '0.8rem' }}
                            >
                              <FileText size={14} />
                              <span style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sub.fileName}
                              </span>
                              <ExternalLink size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSubmissionFile(sub)}
                              title="Download submission file"
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand-dark-grey)', padding: '2px' }}
                            >
                              <Download size={13} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>{sub.fileName}</span>
                        )}
                      </td>

                      <td>
                        {sub.status === 'Graded' ? (
                          <span className="badge badge-graded" style={{ fontSize: '0.7rem' }}>
                            Graded
                          </span>
                        ) : isLate ? (
                          <span className="badge badge-overdue" style={{ fontSize: '0.7rem' }}>
                            Submitted (Late)
                          </span>
                        ) : (
                          <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>
                            Submitted
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: 'center', fontSize: '0.875rem', fontWeight: 700 }} className="font-mono">
                        {sub.marks !== undefined ? `${sub.marks} / ${assignment.marks}` : '—'}
                      </td>

                      <td style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                        {sub.feedback ? (
                          <span title={sub.feedback} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {sub.feedback}
                          </span>
                        ) : (
                          <span style={{ fontStyle: 'italic', opacity: 0.7 }}>No feedback provided</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-primary"
                          style={{ width: 'auto', padding: '0.3rem 0.65rem', fontSize: '0.775rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          onClick={() => setSelectedSubmission(sub)}
                        >
                          <Award size={13} />
                          <span>{sub.status === 'Graded' ? 'Edit Grade' : 'Grade'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grade Submission Modal */}
      {selectedSubmission && (
        <GradeSubmissionModal 
          submission={selectedSubmission}
          totalMarks={assignment.marks}
          onClose={() => setSelectedSubmission(null)}
          onSuccess={() => {
            loadData();
          }}
        />
      )}
    </FacultyAppShell>
  );
};

export default FacultyAssignmentDetail;
