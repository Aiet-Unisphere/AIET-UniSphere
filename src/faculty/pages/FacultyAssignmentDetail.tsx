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
  const [isEnrollmentMissing, setIsEnrollmentMissing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadMsg, setDownloadMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Detect USN identity conflicts across submissions
  const usnConflictMap = React.useMemo(() => {
    const usnToIds = new Map<string, Set<string>>();
    for (const sub of submissions) {
      const normUsn = (sub.usn || '').trim().toUpperCase();
      if (normUsn && normUsn !== 'N/A') {
        const set = usnToIds.get(normUsn) || new Set<string>();
        set.add(sub.studentId);
        usnToIds.set(normUsn, set);
      }
    }
    const map = new Map<string, boolean>();
    for (const [usn, ids] of usnToIds.entries()) {
      if (ids.size > 1) {
        map.set(usn, true);
      }
    }
    return map;
  }, [submissions]);

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

      // Query enrolled students strictly within the assignment's verified course enrollment scope
      let resolvedCount = 0;
      let missingMapping = false;

      if (assg?.courseId) {
        const { getEligibleStudentCountForCourse } = await import('../../services/studentStatisticsService');
        resolvedCount = await getEligibleStudentCountForCourse(assg.courseId);
        if (resolvedCount === 0) {
          missingMapping = true;
        }
      } else {
        missingMapping = true;
      }

      setEnrolledCount(resolvedCount);
      setIsEnrollmentMissing(missingMapping);
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

      {/* Course Enrollment Scope Missing Warning */}
      {isEnrollmentMissing && (
        <div 
          style={{
            marginBottom: '1.25rem',
            padding: '0.85rem 1.25rem',
            borderRadius: '10px',
            backgroundColor: '#FFFBEB',
            border: '1px solid #FCD34D',
            color: '#92400E',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem',
            fontSize: '0.85rem'
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#D97706' }} />
          <div>
            <strong style={{ display: 'block', fontWeight: 700 }}>Course Enrollment Scope Missing</strong>
            <span>
              No student enrollments are mapped to course <strong>{assignment.courseName} ({assignment.courseId})</strong>. Enrollment counts are strictly scoped to the assignment's course; unverified department-wide fallback is prohibited.
            </span>
          </div>
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
          <>
            <style>{`
              .submissions-desktop-view {
                display: block;
              }
              .submissions-mobile-view {
                display: none;
              }
              @media (max-width: 768px) {
                .submissions-desktop-view {
                  display: none;
                }
                .submissions-mobile-view {
                  display: flex;
                  flex-direction: column;
                  gap: 0.75rem;
                  padding: 1rem;
                }
              }
            `}</style>

            {/* Desktop Table View */}
            <div className="submissions-desktop-view table-responsive">
              <table className="table font-sans" style={{ marginBottom: 0 }}>
                <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <tr>
                    <th style={{ minWidth: '170px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Student</th>
                    <th style={{ minWidth: '110px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>USN</th>
                    <th style={{ minWidth: '135px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Submitted Date</th>
                    <th style={{ minWidth: '180px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Deliverable</th>
                    <th style={{ minWidth: '110px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Status</th>
                    <th style={{ minWidth: '95px', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Score</th>
                    <th style={{ minWidth: '180px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Feedback</th>
                    <th style={{ minWidth: '110px', textAlign: 'right', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => {
                    const subDate = new Date(sub.submittedAt);
                    const isLate = subDate > deadlineDate;

                    return (
                      <tr key={sub.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#E2E8F0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              color: '#334155',
                              flexShrink: 0
                            }}>
                              {sub.studentName.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div 
                                style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}
                                title={sub.studentName}
                              >
                                {sub.studentName}
                              </div>
                              <div style={{ fontSize: '0.725rem', color: '#64748B' }}>Student</div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span style={{
                            fontSize: '0.8rem',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: usnConflictMap.get(sub.usn.trim().toUpperCase()) ? '#991B1B' : '#334155',
                            padding: '0.15rem 0.45rem',
                            backgroundColor: usnConflictMap.get(sub.usn.trim().toUpperCase()) ? '#FEF2F2' : '#F1F5F9',
                            border: usnConflictMap.get(sub.usn.trim().toUpperCase()) ? '1px solid #FECACA' : 'none',
                            borderRadius: '4px'
                          }}>
                            {sub.usn}
                          </span>
                          {usnConflictMap.get(sub.usn.trim().toUpperCase()) && (
                            <span 
                              className="badge badge-overdue font-sans" 
                              style={{ fontSize: '0.625rem', padding: '0.1rem 0.35rem', marginLeft: '0.35rem', cursor: 'help' }}
                              title="Identity Conflict: Multiple accounts share this USN"
                            >
                              CONFLICT
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--brand-black)', fontWeight: 500 }}>
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
                                title={`Preview ${sub.fileName}`}
                                style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-blue)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600, fontSize: '0.8rem' }}
                              >
                                <FileText size={14} style={{ flexShrink: 0 }} />
                                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {sub.fileName}
                                </span>
                                <ExternalLink size={12} style={{ flexShrink: 0 }} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadSubmissionFile(sub)}
                                title="Download submission file"
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand-dark-grey)', padding: '2px', display: 'flex', alignItems: 'center' }}
                              >
                                <Download size={13} />
                              </button>
                            </div>
                          ) : sub.fileName ? (
                            <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <FileText size={14} />
                              <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.fileName}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.775rem', color: '#94A3B8', fontStyle: 'italic' }}>No file attached</span>
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

                        <td style={{ textAlign: 'center' }}>
                          {sub.marks !== undefined ? (
                            <span style={{ fontWeight: 800, color: '#0F172A', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                              {sub.marks} <span style={{ color: '#94A3B8', fontWeight: 500, fontSize: '0.775rem' }}>/ {assignment.marks}</span>
                            </span>
                          ) : (
                            <span style={{ color: '#94A3B8', fontFamily: 'monospace', fontWeight: 600 }}>—</span>
                          )}
                        </td>

                        <td>
                          {sub.feedback ? (
                            <div 
                              title={sub.feedback} 
                              style={{ 
                                fontSize: '0.775rem', 
                                color: '#475569', 
                                backgroundColor: '#F8FAFC', 
                                padding: '0.3rem 0.5rem', 
                                borderRadius: '4px', 
                                borderLeft: '3px solid #CBD5E1', 
                                display: '-webkit-box', 
                                WebkitLineClamp: 2, 
                                WebkitBoxOrient: 'vertical', 
                                overflow: 'hidden',
                                maxWidth: '200px'
                              }}
                            >
                              "{sub.feedback}"
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.775rem', color: '#94A3B8', fontStyle: 'italic' }}>No feedback</span>
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

            {/* Mobile Cards View */}
            <div className="submissions-mobile-view">
              {submissions.map((sub) => {
                const subDate = new Date(sub.submittedAt);
                const isLate = subDate > deadlineDate;

                return (
                  <div
                    key={sub.id}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#FFFFFF',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: '#E2E8F0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          color: '#334155'
                        }}>
                          {sub.studentName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.875rem' }}>{sub.studentName}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                            <span style={{
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: usnConflictMap.get(sub.usn.trim().toUpperCase()) ? '#991B1B' : '#64748B',
                              backgroundColor: usnConflictMap.get(sub.usn.trim().toUpperCase()) ? '#FEF2F2' : '#F1F5F9',
                              border: usnConflictMap.get(sub.usn.trim().toUpperCase()) ? '1px solid #FECACA' : 'none',
                              padding: '0.1rem 0.35rem',
                              borderRadius: '4px'
                            }}>
                              {sub.usn}
                            </span>
                            {usnConflictMap.get(sub.usn.trim().toUpperCase()) && (
                              <span 
                                className="badge badge-overdue font-sans" 
                                style={{ fontSize: '0.625rem', padding: '0.05rem 0.3rem' }}
                                title="Identity Conflict: Multiple accounts share this USN"
                              >
                                CONFLICT
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {sub.status === 'Graded' ? (
                        <span className="badge badge-graded" style={{ fontSize: '0.7rem' }}>Graded</span>
                      ) : isLate ? (
                        <span className="badge badge-overdue" style={{ fontSize: '0.7rem' }}>Late</span>
                      ) : (
                        <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>Submitted</span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.775rem', color: '#64748B', display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span>Submitted: {subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {subDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
                        {sub.marks !== undefined ? `${sub.marks} / ${assignment.marks}` : 'Not graded'}
                      </span>
                    </div>

                    {sub.storagePath && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', backgroundColor: '#F8FAFC', borderRadius: '6px', marginBottom: '0.65rem' }}>
                        <span style={{ fontSize: '0.775rem', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                          {sub.fileName}
                        </span>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => handleViewSubmissionFile(sub)}
                            style={{ border: 'none', background: 'none', color: 'var(--brand-blue)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSubmissionFile(sub)}
                            style={{ border: 'none', background: 'none', color: '#64748B', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    )}

                    {sub.feedback && (
                      <div style={{ fontSize: '0.75rem', color: '#475569', fontStyle: 'italic', marginBottom: '0.65rem', backgroundColor: '#F1F5F9', padding: '0.35rem 0.5rem', borderRadius: '4px' }}>
                        "{sub.feedback}"
                      </div>
                    )}

                    <button 
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '0.45rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                      onClick={() => setSelectedSubmission(sub)}
                    >
                      <Award size={14} />
                      <span>{sub.status === 'Graded' ? 'Edit Grade' : 'Grade Submission'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
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
