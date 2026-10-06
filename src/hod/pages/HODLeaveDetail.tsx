import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  User, 
  GraduationCap, 
  Calendar, 
  Clock, 
  FileText, 
  AlertCircle,
  Mail,
  Building2,
  BookOpen,
  Award,
  BarChart2,
  Paperclip,
  Download
} from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { getLeaveRequestById, approveLeaveRequest, rejectLeaveRequest, downloadLeaveDocument } from '../../services/leaveService';
import type { LeaveRequest } from '../../data/leaveRequests';

export const HODLeaveDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [leave, setLeave] = useState<LeaveRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Action execution state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadLeaveDetail = async () => {
    if (!id) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const item = await getLeaveRequestById(id);
      setLeave(item);
    } catch (err: any) {
      console.error("Error loading leave detail:", err);
      setErrorMessage(err.message || "Failed to load leave request details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaveDetail();
  }, [id]);

  const handleConfirmApprove = async () => {
    if (!id || !leave) return;
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await approveLeaveRequest(leave.dbId || id);
      setActionSuccess('Leave Request Approved successfully. Database updated.');
      setShowApproveModal(false);
      await loadLeaveDetail();
    } catch (err: any) {
      console.error("Approval error:", err);
      setErrorMessage(err.message || "Failed to approve leave request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!id || !leave) return;
    const cleanReason = rejectionReasonInput.trim();
    if (!cleanReason) {
      setRejectionError("Reason for rejection is required.");
      return;
    }

    setActionLoading(true);
    setRejectionError(null);
    setErrorMessage(null);
    try {
      await rejectLeaveRequest(leave.dbId || id, undefined, cleanReason);
      setActionSuccess('Leave Request Rejected successfully. Rejection reason recorded.');
      setShowRejectModal(false);
      setRejectionReasonInput('');
      await loadLeaveDetail();
    } catch (err: any) {
      console.error("Rejection error:", err);
      setErrorMessage(err.message || "Failed to reject leave request.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <HODAppShell>
        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
          <Clock size={32} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--brand-blue)' }} />
          <p style={{ fontWeight: 600, fontSize: '1rem' }}>Loading Leave Request Details...</p>
        </div>
      </HODAppShell>
    );
  }

  if (errorMessage && !leave) {
    return (
      <HODAppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '600px', margin: '2rem auto' }}>
          <AlertCircle size={48} style={{ color: '#EF4444', margin: '0 auto 1rem' }} />
          <h2 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)' }}>
            {errorMessage.includes('ACCESS DENIED') ? 'Access Denied' : 'Leave Record Error'}
          </h2>
          <p style={{ color: 'var(--brand-dark-grey)', marginTop: '0.5rem', fontSize: '0.95rem' }}>
            {errorMessage}
          </p>
          <button 
            onClick={() => navigate('/hod/leave')} 
            className="btn btn-primary font-sans" 
            style={{ marginTop: '1.5rem' }}
          >
            <ArrowLeft size={16} />
            <span>Back to Leave Management</span>
          </button>
        </div>
      </HODAppShell>
    );
  }

  if (!leave) {
    return (
      <HODAppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '600px', margin: '2rem auto' }}>
          <FileText size={48} style={{ color: '#94A3B8', margin: '0 auto 1rem' }} />
          <h2 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)' }}>
            Leave Request Not Found
          </h2>
          <p style={{ color: 'var(--brand-dark-grey)', marginTop: '0.5rem', fontSize: '0.95rem' }}>
            The leave application record could not be found or has been removed.
          </p>
          <button 
            onClick={() => navigate('/hod/leave')} 
            className="btn btn-primary font-sans" 
            style={{ marginTop: '1.5rem' }}
          >
            <ArrowLeft size={16} />
            <span>Back to Leave Management</span>
          </button>
        </div>
      </HODAppShell>
    );
  }

  const isPending = leave.status === 'Pending';
  const isApproved = leave.status === 'Approved';
  const isRejected = leave.status === 'Rejected';

  return (
    <HODAppShell>
      {/* Back Link */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button 
          onClick={() => navigate('/hod/leave')}
          className="btn-link font-sans"
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '0.4rem', 
            fontSize: '0.875rem', 
            cursor: 'pointer', 
            border: 'none', 
            background: 'none', 
            color: 'var(--brand-blue)',
            fontWeight: 600
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Leave Management</span>
        </button>
      </div>

      {/* Header Banner */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1.5rem 1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem' }}>
              <span className="badge badge-active font-mono" style={{ fontSize: '0.85rem' }}>{leave.id}</span>
              <span className={`badge ${isApproved ? 'badge-active' : isPending ? 'badge-pending' : 'badge-overdue'}`} style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                {leave.status}
              </span>
            </div>
            <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
              LEAVE REQUEST REVIEW
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
              Submitted on {leave.submittedAt}
            </p>
          </div>

          {/* Top Quick Status Badge */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              CURRENT STATUS
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isApproved ? '#16A34A' : isRejected ? '#DC2626' : '#D97706', marginTop: '0.1rem' }}>
              {leave.status.toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccess && (
        <div className="dashboard-panel" style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CheckCircle2 size={20} style={{ color: '#16A34A', flexShrink: 0 }} />
          <div style={{ color: '#15803D', fontWeight: 600, fontSize: '0.9rem' }}>{actionSuccess}</div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="dashboard-panel" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle size={20} style={{ color: '#DC2626', flexShrink: 0 }} />
          <div style={{ color: '#991B1B', fontWeight: 600, fontSize: '0.9rem' }}>{errorMessage}</div>
        </div>
      )}

      {/* Grid: 3 Main Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        
        {/* Section 1: Student Information */}
        <div className="dashboard-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <User size={20} style={{ color: 'var(--brand-blue)' }} />
            <h2 className="panel-title font-display" style={{ margin: 0, fontSize: '1.1rem' }}>Student Information</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>STUDENT NAME</span>
              <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '1.05rem', marginTop: '0.15rem' }}>
                {leave.requesterName}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>USN / ID</span>
                <div className="font-mono" style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.15rem' }}>
                  {leave.requesterUsnOrEmpId}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>DEPARTMENT</span>
                <div style={{ fontWeight: 600, color: 'var(--brand-black)', marginTop: '0.15rem' }}>
                  {leave.departmentName || 'Artificial Intelligence & Machine Learning'}
                </div>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>STUDENT EMAIL</span>
              <div style={{ fontWeight: 600, color: 'var(--brand-blue)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Mail size={14} />
                <span>{leave.requesterEmail || 'Not provided'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Academic Information */}
        <div className="dashboard-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <GraduationCap size={20} style={{ color: 'var(--brand-orange)' }} />
            <h2 className="panel-title font-display" style={{ margin: 0, fontSize: '1.1rem' }}>Academic Information</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
            
            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
              <BookOpen size={20} style={{ margin: '0 auto 0.4rem', color: 'var(--brand-dark-grey)' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', display: 'block' }}>SEMESTER</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
                {leave.semester != null ? `Sem ${leave.semester}` : 'Not provided'}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
              <Award size={20} style={{ margin: '0 auto 0.4rem', color: 'var(--brand-dark-grey)' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', display: 'block' }}>CGPA</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
                {leave.cgpa != null ? leave.cgpa : 'Not provided'}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
              <BarChart2 size={20} style={{ margin: '0 auto 0.4rem', color: 'var(--brand-dark-grey)' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', display: 'block' }}>ATTENDANCE</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
                {leave.attendancePercent != null ? `${leave.attendancePercent}%` : 'Not provided'}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Section 3: Leave Application & Reason Details */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
          <FileText size={20} style={{ color: 'var(--brand-blue)' }} />
          <h2 className="panel-title font-display" style={{ margin: 0, fontSize: '1.1rem' }}>Leave Application Details</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem', backgroundColor: 'var(--brand-light-grey)', padding: '1rem 1.25rem', borderRadius: 'var(--border-radius)' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>REFERENCE ID</span>
            <div className="font-mono" style={{ fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>{leave.id}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>LEAVE TYPE</span>
            <div style={{ fontWeight: 700, color: 'var(--brand-blue)', marginTop: '0.2rem' }}>{leave.leaveType}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>DATE RANGE</span>
            <div className="font-mono" style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem', fontSize: '0.85rem' }}>
              {leave.startDate} → {leave.endDate}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>DURATION</span>
            <div style={{ fontWeight: 800, color: 'var(--brand-orange)', marginTop: '0.2rem' }}>{leave.days} Days</div>
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
            REASON / PURPOSE (FULL TEXT)
          </span>
          <div style={{ 
            padding: '1.25rem', 
            backgroundColor: '#F8FAFC', 
            borderRadius: 'var(--border-radius)', 
            border: '1px solid rgba(156, 163, 175, 0.25)', 
            fontSize: '0.95rem', 
            color: 'var(--brand-black)', 
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap'
          }}>
            {leave.reason}
          </div>
        </div>

        {/* Supporting Document Card */}
        <div style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
            SUPPORTING DOCUMENT / MEDICAL CERTIFICATE
          </span>
          {leave.supportingDocPath ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '1rem 1.25rem', 
              backgroundColor: '#EFF6FF', 
              borderRadius: 'var(--border-radius)', 
              border: '1px solid #BFDBFE' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Paperclip size={20} style={{ color: '#2563EB' }} />
                <div>
                  <div style={{ fontWeight: 700, color: '#1E3A8A', fontSize: '0.95rem' }}>
                    {leave.supportingDocName || 'Supporting_Document.pdf'}
                  </div>
                  {leave.supportingDocSize && (
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.1rem' }}>
                      {(leave.supportingDocSize / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await downloadLeaveDocument(leave.supportingDocPath!, leave.supportingDocName || 'Leave_Supporting_Document.pdf');
                  } catch (err: any) {
                    alert('Error downloading document: ' + (err.message || 'Unknown error'));
                  }
                }}
                className="btn btn-secondary font-sans"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <Download size={15} />
                <span>Download Attachment</span>
              </button>
            </div>
          ) : (
            <div style={{ padding: '0.85rem 1rem', backgroundColor: '#F8FAFC', borderRadius: 'var(--border-radius)', border: '1px dashed #CBD5E1', color: '#64748B', fontSize: '0.85rem' }}>
              No supporting document attached with this leave request.
            </div>
          )}
        </div>

        {/* If Rejected, display Rejection Reason */}
        {isRejected && leave.remark && (
          <div style={{ marginTop: '1.25rem', padding: '1rem 1.25rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--border-radius)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
              REJECTION REASON RECORDED BY HOD
            </span>
            <div style={{ fontSize: '0.95rem', color: '#7F1D1D', fontWeight: 600 }}>
              {leave.remark}
            </div>
          </div>
        )}

        {/* If Approved, display Approver Info */}
        {isApproved && leave.reviewedBy && (
          <div style={{ marginTop: '1.25rem', padding: '1rem 1.25rem', backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 'var(--border-radius)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
              APPROVAL DETAILS
            </span>
            <div style={{ fontSize: '0.95rem', color: '#14532D', fontWeight: 600 }}>
              Approved by: {leave.reviewedBy}
            </div>
          </div>
        )}
      </div>

      {/* Decision Action Bar */}
      <div className="dashboard-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.75rem' }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)' }}>
            HOD Decision & Governance
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
            {isPending ? 'Review application details before approving or rejecting.' : `This leave request is already ${leave.status.toLowerCase()}.`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={() => {
              setRejectionReasonInput('');
              setRejectionError(null);
              setShowRejectModal(true);
            }}
            disabled={actionLoading || !isPending}
            className="btn font-sans"
            style={{ 
              backgroundColor: isPending ? '#FEF2F2' : '#F1F5F9',
              color: isPending ? '#DC2626' : '#94A3B8',
              border: isPending ? '1px solid #FCA5A5' : '1px solid #CBD5E1',
              padding: '0.65rem 1.25rem',
              fontWeight: 700,
              cursor: isPending ? 'pointer' : 'not-allowed'
            }}
          >
            <XCircle size={18} />
            <span>Reject Leave</span>
          </button>

          <button
            onClick={() => setShowApproveModal(true)}
            disabled={actionLoading || !isPending}
            className="btn font-sans"
            style={{ 
              backgroundColor: isPending ? '#16A34A' : '#F1F5F9',
              color: isPending ? '#FFFFFF' : '#94A3B8',
              border: isPending ? '1px solid #16A34A' : '1px solid #CBD5E1',
              padding: '0.65rem 1.5rem',
              fontWeight: 700,
              cursor: isPending ? 'pointer' : 'not-allowed'
            }}
          >
            <CheckCircle2 size={18} />
            <span>Approve Leave</span>
          </button>
        </div>
      </div>

      {/* APPROVE CONFIRMATION MODAL */}
      {showApproveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem' }}>
            <h2 className="font-display" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: 0, marginBottom: '1rem' }}>
              Approve Leave Request?
            </h2>

            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', marginBottom: '1.25rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div><strong>Student:</strong> {leave.requesterName} ({leave.requesterUsnOrEmpId})</div>
              <div><strong>Leave:</strong> {leave.leaveType}</div>
              <div><strong>Dates:</strong> {leave.startDate} → {leave.endDate} ({leave.days} Days)</div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginBottom: '1.5rem' }}>
              Are you sure you want to approve this leave request? This action will update the student's leave record in the database.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                onClick={() => setShowApproveModal(false)}
                disabled={actionLoading}
                className="btn btn-secondary font-sans"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmApprove}
                disabled={actionLoading}
                className="btn font-sans"
                style={{ backgroundColor: '#16A34A', color: '#FFF', border: '1px solid #16A34A', fontWeight: 700 }}
              >
                {actionLoading ? 'Approving...' : 'Approve Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT CONFIRMATION MODAL */}
      {showRejectModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '520px', padding: '1.75rem' }}>
            <h2 className="font-display" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#DC2626', marginTop: 0, marginBottom: '1rem' }}>
              Reject Leave Request
            </h2>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-black)', display: 'block', marginBottom: '0.4rem' }}>
                Reason for rejection *
              </label>
              <textarea 
                className="form-input font-sans"
                style={{ 
                  width: '100%', 
                  height: '100px', 
                  padding: '0.65rem', 
                  fontSize: '0.9rem', 
                  resize: 'vertical',
                  borderColor: rejectionError ? '#EF4444' : undefined
                }}
                placeholder="Explain why this leave request is being rejected..."
                value={rejectionReasonInput}
                onChange={(e) => {
                  setRejectionReasonInput(e.target.value);
                  if (rejectionError) setRejectionError(null);
                }}
                disabled={actionLoading}
              />
              {rejectionError && (
                <div style={{ fontSize: '0.8rem', color: '#DC2626', fontWeight: 600, marginTop: '0.35rem' }}>
                  {rejectionError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                onClick={() => setShowRejectModal(false)}
                disabled={actionLoading}
                className="btn btn-secondary font-sans"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmReject}
                disabled={actionLoading}
                className="btn font-sans"
                style={{ backgroundColor: '#DC2626', color: '#FFF', border: '1px solid #DC2626', fontWeight: 700 }}
              >
                {actionLoading ? 'Rejecting...' : 'Reject Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

    </HODAppShell>
  );
};

export default HODLeaveDetail;
