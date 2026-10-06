import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Plus, CheckCircle2, Clock, AlertCircle, Loader2, Upload, FileText, Download, X } from 'lucide-react';
import { getStudentLeaveRequests, submitLeaveRequest, downloadLeaveDocument } from '../services/leaveService';
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    setSelectedFile(null);
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
        endDate,
        file: selectedFile || undefined
      });
      setIsModalOpen(false);
      setSuccessMsg('Leave request submitted successfully with attachments to Supabase Storage. Pending HOD review.');
      setTimeout(() => setSuccessMsg(''), 6000);
      await loadLeaves();
    } catch (err: any) {
      console.error('[LeaveRequestsPage] Submit error:', err);
      setErrorMsg(err.message || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadDoc = async (leave: LeaveRequest) => {
    if (!leave.supportingDocPath) {
      alert("No storage document attached to this request.");
      return;
    }
    try {
      await downloadLeaveDocument(leave.supportingDocPath, leave.supportingDocName || 'supporting-document.pdf');
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
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
                  <th style={{ padding: '1rem' }}>Document</th>
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
                      {l.supportingDocPath || l.supportingDocument ? (
                        <button 
                          onClick={() => handleDownloadDoc(l)}
                          className="btn btn-secondary"
                          style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.75rem', gap: '0.3rem' }}
                          title="Download attached certificate from Storage"
                        >
                          <FileText size={12} />
                          <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.supportingDocName || l.supportingDocument || 'Document'}
                          </span>
                          <Download size={11} />
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span className={`badge ${l.status === 'Approved' ? 'badge-active' : l.status === 'Pending' ? 'badge-pending' : 'badge-overdue'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>
                      {l.reviewedBy || 'Pending Review'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leave Application Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => !submitting && setIsModalOpen(false)}>
          <div className="modal-container" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="badge badge-active font-mono">LEAVE APPLICATION</span>
                <h2 className="modal-title font-display" style={{ marginTop: '0.25rem' }}>Apply for Leave</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)} disabled={submitting}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {errorMsg && (
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 'var(--border-radius)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <AlertCircle size={16} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Leave Category *</label>
                  <select 
                    className="form-select font-sans"
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    disabled={submitting}
                    required
                  >
                    <option value="">Select Category</option>
                    <option value="Medical Leave">Medical Leave (Doctor Certificate Recommended)</option>
                    <option value="Academic Duty / Event">Academic Duty / Hackathon / Symposium</option>
                    <option value="Personal / Family Emergency">Personal / Family Emergency</option>
                    <option value="Internship / Placement Drive">Internship / Placement Drive</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Start Date *</label>
                    <input 
                      type="date"
                      className="form-input font-sans"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">End Date *</label>
                    <input 
                      type="date"
                      className="form-input font-sans"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Reason / Academic Duty Explanation *</label>
                  <textarea 
                    className="form-input font-sans"
                    rows={3}
                    placeholder="Provide justification and specific context for your department HOD..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>

                {/* Supporting Document Upload */}
                <div className="form-group">
                  <label className="form-label">Supporting Document / Certificate (Optional)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input 
                      type="file" 
                      id="leave-doc-input"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          setSelectedFile(e.target.files[0]);
                        }
                      }}
                      disabled={submitting}
                      style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <label 
                        htmlFor="leave-doc-input" 
                        className="btn btn-secondary" 
                        style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Upload size={14} /> Browse Document
                      </label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                        PDF, JPG, PNG up to 20MB (Stored in Supabase Storage)
                      </span>
                    </div>

                    {selectedFile && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--brand-light-grey)', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <FileText size={16} style={{ color: 'var(--brand-blue)' }} />
                          <span style={{ fontWeight: 600 }}>{selectedFile.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setSelectedFile(null)} 
                          style={{ border: 'none', background: 'none', color: 'var(--color-error)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Submit Leave Request</span>
                    </>
                  )}
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
