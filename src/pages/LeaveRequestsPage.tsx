import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Plus, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { getStudentLeaveRequests, submitLeaveRequest } from '../services/leaveService';
import type { LeaveRequest } from '../data/leaveRequests';

export const LeaveRequestsPage: React.FC = () => {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Form state
  const [leaveType, setLeaveType] = useState('');
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadLeaves = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getStudentLeaveRequests();
      setLeaves(data);
    } catch (err: any) {
      console.error('[LeaveRequestsPage] Load error:', err);
      setLoadError(err.message || 'Unable to load leave requests. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const handleOpenModal = () => {
    setLeaveType('');
    setReason('');
    setStartDate('');
    setEndDate('');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!leaveType.trim()) {
      setErrorMsg('Leave type is required.');
      return;
    }
    if (!startDate || !endDate) {
      setErrorMsg('Both start date and end date are required.');
      return;
    }
    if (!reason.trim()) {
      setErrorMsg('Reason / purpose cannot be empty.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setErrorMsg('End date cannot be before start date.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await submitLeaveRequest({
        leaveType: leaveType.trim(),
        reason: reason.trim(),
        startDate,
        endDate
      });
      setIsModalOpen(false);
      setSuccessMsg('Leave request submitted successfully and is pending HOD review.');
      setTimeout(() => setSuccessMsg(''), 6000);
      await loadLeaves();
    } catch (err: any) {
      console.error('[LeaveRequestsPage] Submit error:', err);
      setErrorMsg(err.message || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="page-header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div className="breadcrumbs">
            <span>Academics</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Leave Requests</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0 }}>Leave Requests</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Apply for academic duty leaves or medical leaves routed to your Department Head (HOD).
          </p>
        </div>

        <button className="btn btn-primary" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={handleOpenModal}>
          <Plus size={16} /> Apply for Leave
        </button>
      </div>

      {successMsg && (
        <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="card-box" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: 'var(--brand-blue)' }} />
            <p>Loading leave requests...</p>
          </div>
        ) : loadError ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <AlertCircle size={36} style={{ margin: '0 auto 0.75rem', color: '#EF4444' }} />
            <p style={{ fontWeight: 600, fontSize: '1rem', color: '#991B1B' }}>{loadError}</p>
            <button className="btn btn-secondary" style={{ marginTop: '0.75rem' }} onClick={loadLeaves}>Try Again</button>
          </div>
        ) : leaves.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <Clock size={36} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
            <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)' }}>No leave requests found.</p>
            <p style={{ fontSize: '0.85rem' }}>Click "+ Apply for Leave" above to request an academic or medical leave.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156,163,175,0.2)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--brand-dark-grey)', fontWeight: 700 }}>
                  <th style={{ padding: '1rem' }}>Ref ID</th>
                  <th style={{ padding: '1rem' }}>Leave Type</th>
                  <th style={{ padding: '1rem' }}>Reason / Purpose</th>
                  <th style={{ padding: '1rem' }}>Dates</th>
                  <th style={{ padding: '1rem' }}>Status</th>
                  <th style={{ padding: '1rem' }}>Reviewed By</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => (
                  <tr key={l.dbId || l.id} style={{ borderBottom: '1px solid rgba(156,163,175,0.15)', fontSize: '0.9rem' }}>
                    <td style={{ padding: '1rem', fontWeight: 700 }} className="font-mono text-blue">{l.id}</td>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{l.leaveType}</td>
                    <td style={{ padding: '1rem', maxWidth: '250px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason}</div>
                    </td>
                    <td style={{ padding: '1rem' }} className="font-mono">{l.startDate} → {l.endDate} ({l.days} days)</td>
                    <td style={{ padding: '1rem' }}>
                      <span className={`badge ${l.status === 'Approved' ? 'badge-active' : l.status === 'Pending' ? 'badge-pending' : 'badge-overdue'}`}>
                        {l.status}
                      </span>
                      {l.status === 'Rejected' && l.remark && (
                        <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '0.25rem', fontWeight: 600 }}>
                          Reason: {l.remark}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>
                      {l.status === 'Approved' ? `Approved by: ${l.reviewedBy || 'HOD'}` : l.status === 'Rejected' ? `Rejected by: ${l.reviewedBy || 'HOD'}` : 'Pending HOD Review'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* APPLY FOR LEAVE MODAL                       */}
      {/* ═══════════════════════════════════════════ */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '520px', backgroundColor: 'var(--brand-white)', borderRadius: 'var(--border-radius)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>STUDENT APPLICATION</span>
                <h2 className="font-display" style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0.2rem 0 0 0', color: 'var(--brand-black)' }}>
                  Apply for Academic Leave
                </h2>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--brand-dark-grey)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '0.75rem', borderRadius: 'var(--border-radius)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Leave Type — TEXT INPUT */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
                  Leave Type *
                </label>
                <input
                  type="text"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  placeholder="Enter leave type (e.g. Medical Leave, Duty Leave, Personal Leave)"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.4)', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.4)', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.4)', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
                  Reason / Purpose *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe your leave reason (e.g. Participation in Tech Fest / Medical rest / Personal emergency)..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.4)', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem' }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="animate-spin" size={14} />}
                  <span>{submitting ? 'Submitting...' : 'Submit Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default LeaveRequestsPage;
