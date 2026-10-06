import React, { useState } from 'react';
import { X, ExternalLink, AlertCircle } from 'lucide-react';
import type { FacultyAssignmentSummaryItem } from '../../services/externalLearningService';
import { getEvidenceSignedUrl } from '../../services/externalLearningService';

interface HODAssignmentDetailModalProps {
  summaryItem: FacultyAssignmentSummaryItem | null;
  onClose: () => void;
}

export const HODAssignmentDetailModal: React.FC<HODAssignmentDetailModalProps> = ({ summaryItem, onClose }) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'roster'>('analytics');

  if (!summaryItem) return null;

  const { assignment, course, enrollments } = summaryItem;
  const totalAssigned = enrollments.length;
  const activeEnrollments = enrollments.filter(e => e.enrollment.status !== 'CANCELLED');
  const activeCount = activeEnrollments.length;

  let notStartedCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let overdueCount = 0;
  let pendingVerifCount = 0;
  let verifiedVerifCount = 0;
  let rejectedVerifCount = 0;
  let count100Reported = 0;

  // Distribution buckets
  let bucket0 = 0;
  let bucket1_25 = 0;
  let bucket26_50 = 0;
  let bucket51_75 = 0;
  let bucket76_99 = 0;
  let bucket100 = 0;

  const deadlineDate = assignment.deadline ? new Date(assignment.deadline) : null;
  const now = new Date();

  enrollments.forEach(item => {
    const st = item.enrollment.status;
    const prog = item.progress?.progress_percent || 0;
    const evStatus = item.latestEvidence?.verification_status;

    if (st === 'CANCELLED') {
      cancelledCount++;
    } else {
      if (st === 'COMPLETED') completedCount++;
      else if (st === 'IN_PROGRESS') inProgressCount++;
      else if (st === 'ASSIGNED') notStartedCount++;

      const isOverdue = Boolean(deadlineDate && deadlineDate < now && st !== 'COMPLETED');
      if (isOverdue) overdueCount++;
    }

    if (prog === 0) bucket0++;
    else if (prog <= 25) bucket1_25++;
    else if (prog <= 50) bucket26_50++;
    else if (prog <= 75) bucket51_75++;
    else if (prog <= 99) bucket76_99++;
    else if (prog >= 100) {
      bucket100++;
      if (st !== 'COMPLETED') count100Reported++;
    }

    if (evStatus === 'PENDING') pendingVerifCount++;
    else if (evStatus === 'VERIFIED') verifiedVerifCount++;
    else if (evStatus === 'REJECTED') rejectedVerifCount++;
  });

  const completionRatePercent = activeCount ? Math.round((completedCount / activeCount) * 100) : 0;

  const handleOpenEvidence = async (path?: string | null, url?: string | null, id?: string | null) => {
    if (path) {
      try {
        const signedUrl = await getEvidenceSignedUrl(path);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } catch (err: any) {
        alert(err.message || 'Unable to open certificate document.');
      }
    } else if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (id) {
      alert(`Credential ID: ${id}`);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="modal-content" style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-graded">{course.platform}</span>
              <span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>
                Sem {assignment.semester || 'All'} {assignment.section ? `(${assignment.section})` : ''} · {assignment.academic_year || '2026–27'}
              </span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
              {course.title}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>
            <X size={22} />
          </button>
        </div>

        {/* Tab Switcher inside modal */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid #E5E7EB' }}>
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: activeTab === 'analytics' ? 'var(--brand-blue)' : '#6B7280',
              borderBottom: activeTab === 'analytics' ? '3px solid var(--brand-blue)' : '3px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Assignment Analytics
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: activeTab === 'roster' ? 'var(--brand-blue)' : '#6B7280',
              borderBottom: activeTab === 'roster' ? '3px solid var(--brand-blue)' : '3px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Student Roster ({totalAssigned})
          </button>
        </div>

        {activeTab === 'analytics' && (
          <div>
            {/* Top Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ backgroundColor: '#F9FAFB', padding: '0.75rem', borderRadius: '8px', textAlign: 'center', border: '1px solid #E5E7EB' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', display: 'block' }}>{totalAssigned}</span>
                <span style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600 }}>Total Assigned</span>
              </div>
              <div style={{ backgroundColor: '#F9FAFB', padding: '0.75rem', borderRadius: '8px', textAlign: 'center', border: '1px solid #E5E7EB' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#6B7280', display: 'block' }}>{notStartedCount}</span>
                <span style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600 }}>Not Started</span>
              </div>
              <div style={{ backgroundColor: '#EFF6FF', padding: '0.75rem', borderRadius: '8px', textAlign: 'center', border: '1px solid #BFDBFE' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563EB', display: 'block' }}>{inProgressCount}</span>
                <span style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: 600 }}>In Progress</span>
              </div>
              <div style={{ backgroundColor: '#ECFDF5', padding: '0.75rem', borderRadius: '8px', textAlign: 'center', border: '1px solid #A7F3D0' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', display: 'block' }}>{completedCount}</span>
                <span style={{ fontSize: '0.7rem', color: '#065F46', fontWeight: 600 }}>Completed</span>
              </div>
              <div style={{ backgroundColor: overdueCount ? '#FEF2F2' : '#F9FAFB', padding: '0.75rem', borderRadius: '8px', textAlign: 'center', border: overdueCount ? '1px solid #FCA5A5' : '1px solid #E5E7EB' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: overdueCount ? '#DC2626' : '#6B7280', display: 'block' }}>{overdueCount}</span>
                <span style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600 }}>Overdue</span>
              </div>
              <div style={{ backgroundColor: pendingVerifCount ? '#FEF3C7' : '#F9FAFB', padding: '0.75rem', borderRadius: '8px', textAlign: 'center', border: pendingVerifCount ? '1px solid #FCD34D' : '1px solid #E5E7EB' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: pendingVerifCount ? '#D97706' : '#6B7280', display: 'block' }}>{pendingVerifCount}</span>
                <span style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600 }}>Pending Ev.</span>
              </div>
            </div>

            {/* Completion Rate Banner */}
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Department Completion Rate</span>
                <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                  Calculated as (COMPLETED enrollments / active enrollments × 100). Excludes CANCELLED enrollments ({cancelledCount}).
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669' }}>{completionRatePercent}%</span>
              </div>
            </div>

            {/* Progress Distribution Buckets */}
            <div className="dashboard-panel" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
              <h4 style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.75rem' }}>
                Department Progress Distribution
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ backgroundColor: '#F3F4F6', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, display: 'block' }}>{bucket0}</span>
                  <span style={{ fontSize: '0.675rem', color: '#6B7280' }}>Not Started</span>
                </div>
                <div style={{ backgroundColor: '#EFF6FF', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#2563EB', display: 'block' }}>{bucket1_25}</span>
                  <span style={{ fontSize: '0.675rem', color: '#6B7280' }}>1–25%</span>
                </div>
                <div style={{ backgroundColor: '#EFF6FF', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#2563EB', display: 'block' }}>{bucket26_50}</span>
                  <span style={{ fontSize: '0.675rem', color: '#6B7280' }}>26–50%</span>
                </div>
                <div style={{ backgroundColor: '#EFF6FF', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#2563EB', display: 'block' }}>{bucket51_75}</span>
                  <span style={{ fontSize: '0.675rem', color: '#6B7280' }}>51–75%</span>
                </div>
                <div style={{ backgroundColor: '#EFF6FF', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#2563EB', display: 'block' }}>{bucket76_99}</span>
                  <span style={{ fontSize: '0.675rem', color: '#6B7280' }}>76–99%</span>
                </div>
                <div style={{ backgroundColor: '#ECFDF5', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#059669', display: 'block' }}>{bucket100}</span>
                  <span style={{ fontSize: '0.675rem', color: '#065F46' }}>100%</span>
                </div>
              </div>

              {count100Reported > 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.775rem', color: '#D97706', backgroundColor: '#FEF3C7', padding: '0.5rem 0.75rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={14} />
                  <span>
                    <strong>Note:</strong> {count100Reported} student(s) have self-reported 100% progress, but are pending faculty/HOD verification before being marked as Verified Completion.
                  </span>
                </div>
              )}
            </div>

            {/* Verification Analytics */}
            <div className="dashboard-panel" style={{ padding: '1rem' }}>
              <h4 style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.75rem' }}>
                Evidence Verification Breakdown
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
                <div style={{ border: '1px solid #FCD34D', backgroundColor: '#FEF3C7', padding: '0.75rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#92400E', display: 'block' }}>{pendingVerifCount}</span>
                  <span style={{ fontSize: '0.725rem', fontWeight: 600, color: '#92400E' }}>Pending Verification</span>
                </div>
                <div style={{ border: '1px solid #A7F3D0', backgroundColor: '#ECFDF5', padding: '0.75rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#065F46', display: 'block' }}>{verifiedVerifCount}</span>
                  <span style={{ fontSize: '0.725rem', fontWeight: 600, color: '#065F46' }}>Verified</span>
                </div>
                <div style={{ border: '1px solid #FCA5A5', backgroundColor: '#FEF2F2', padding: '0.75rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#991B1B', display: 'block' }}>{rejectedVerifCount}</span>
                  <span style={{ fontSize: '0.725rem', fontWeight: 600, color: '#991B1B' }}>Rejected</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'roster' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#374151', fontWeight: 700 }}>
                  <th style={{ padding: '0.75rem' }}>Student Name & USN</th>
                  <th style={{ padding: '0.75rem' }}>Progress</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Verification</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map(item => {
                  const percent = item.progress?.progress_percent || 0;
                  const vStatus = item.latestEvidence ? item.latestEvidence.verification_status : 'NONE';
                  return (
                    <tr key={item.enrollment.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{item.studentProfile?.full_name || 'Student'}</div>
                        <div style={{ fontSize: '0.725rem', color: '#6B7280' }}>{item.studentProfile?.usn_or_employee_id || 'N/A'}</div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontWeight: 700, color: percent === 100 ? '#059669' : '#2563EB' }}>{percent}%</span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`badge ${
                          item.enrollment.status === 'COMPLETED' ? 'badge-active' :
                          item.enrollment.status === 'IN_PROGRESS' ? 'badge-graded' :
                          item.enrollment.status === 'CANCELLED' ? 'badge-cancelled' : 'badge-submitted'
                        }`} style={{ fontSize: '0.675rem' }}>
                          {item.enrollment.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          backgroundColor:
                            vStatus === 'VERIFIED' ? '#D1FAE5' :
                            vStatus === 'PENDING' ? '#FEF3C7' :
                            vStatus === 'REJECTED' ? '#FEE2E2' : '#F3F4F6',
                          color:
                            vStatus === 'VERIFIED' ? '#065F46' :
                            vStatus === 'PENDING' ? '#92400E' :
                            vStatus === 'REJECTED' ? '#991B1B' : '#4B5563'
                        }}>
                          {vStatus === 'NONE' ? 'NO EVIDENCE' : vStatus}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {item.latestEvidence ? (
                          <button
                            type="button"
                            onClick={() => handleOpenEvidence(
                              item.latestEvidence?.certificate_storage_path,
                              item.latestEvidence?.credential_url,
                              item.latestEvidence?.credential_id
                            )}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.725rem', padding: '0.2rem 0.45rem' }}
                          >
                            <ExternalLink size={12} />
                            Evidence
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};
