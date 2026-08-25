import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, FileCheck, CheckCircle2, Clock, XCircle, Eye, User, GraduationCap, RefreshCw, AlertCircle } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { StatCard } from '../../components/StatCard';
import { getDepartmentLeaveRequests } from '../../services/leaveService';
import type { LeaveRequest } from '../../data/leaveRequests';

export const HODLeaveList: React.FC = () => {
  const navigate = useNavigate();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getDepartmentLeaveRequests();
      setLeaves(data);
    } catch (err: any) {
      console.error("[HODLeaveList] Error loading leave requests:", err);
      setLoadError(err.message || "Unable to load department leave requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  const pendingCount = leaves.filter(l => l.status === 'Pending').length;
  const approvedCount = leaves.filter(l => l.status === 'Approved').length;
  const rejectedCount = leaves.filter(l => l.status === 'Rejected').length;

  const filteredLeaves = leaves.filter((l) => {
    const matchesSearch = 
      l.requesterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.requesterUsnOrEmpId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.leaveType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || l.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">ACADEMIC GOVERNANCE</span>
          <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Leave & Approval Management
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            Department Student & Faculty Academic Leave Applications
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadLeaves} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'auto' }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Overview Stat Cards — computed from real data */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          title="PENDING REQUESTS"
          value={pendingCount}
          subtitle="Awaiting HOD Review"
          icon={<Clock size={22} />}
        />
        <StatCard
          title="APPROVED"
          value={approvedCount}
          subtitle="Granted Approvals"
          icon={<CheckCircle2 size={22} />}
        />
        <StatCard
          title="REJECTED"
          value={rejectedCount}
          subtitle="Declined Applications"
          icon={<XCircle size={22} />}
        />
        <StatCard
          title="TOTAL REQUESTS"
          value={leaves.length}
          subtitle="All Department Logs"
          icon={<FileCheck size={22} />}
        />
      </div>

      {/* Filter & Search Bar */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search */}
          <div className="header-search" style={{ width: '300px', position: 'relative' }}>
            <Search size={16} className="header-search-icon" />
            <input 
              type="text" 
              placeholder="Search requester, ID, type or reason..."
              className="header-search-input font-sans"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
              <Filter size={14} />
              <span>Filters:</span>
            </div>

            <select 
              className="form-select font-sans"
              style={{ width: '140px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Leave Requests Table */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <Clock size={28} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: 'var(--brand-blue)' }} />
            <p style={{ fontWeight: 600 }}>Loading Department Leave Requests...</p>
          </div>
        ) : loadError ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <AlertCircle size={36} style={{ margin: '0 auto 0.75rem', color: '#EF4444' }} />
            <p style={{ fontWeight: 600, fontSize: '1rem', color: '#991B1B' }}>{loadError}</p>
            <button className="btn btn-secondary" style={{ marginTop: '0.75rem' }} onClick={loadLeaves}>Try Again</button>
          </div>
        ) : filteredLeaves.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <FileCheck size={36} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
            <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)' }}>
              {leaves.length === 0 ? 'No leave requests in your department' : 'No leave requests match the current filter criteria'}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>
              {leaves.length === 0 ? 'Leave requests from students will appear here once submitted.' : 'Try adjusting the search or status filter.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '1rem 1.25rem' }}>Requester</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Ref ID & Type</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Date Range</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Days</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Submitted</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeaves.map((l) => (
                  <tr key={l.dbId || l.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'var(--brand-light-grey)', border: '1px solid rgba(156, 163, 175, 0.3)', color: 'var(--brand-black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                          <GraduationCap size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.9rem' }}>{l.requesterName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                            <span className="font-mono">{l.requesterUsnOrEmpId}</span> · {l.requesterRole}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div className="font-mono text-blue font-bold" style={{ fontSize: '0.825rem' }}>{l.id}</div>
                      <div style={{ fontWeight: 600, color: 'var(--brand-black)', fontSize: '0.825rem', marginTop: '0.1rem' }}>{l.leaveType}</div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono" style={{ fontSize: '0.825rem', color: 'var(--brand-black)', fontWeight: 600 }}>
                        {l.startDate} → {l.endDate}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span style={{ fontWeight: 700 }}>{l.days} Days</span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>{l.submittedAt}</span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className={`badge ${l.status === 'Approved' ? 'badge-active' : l.status === 'Pending' ? 'badge-pending' : 'badge-overdue'}`}>
                        {l.status}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                      <button 
                        onClick={() => navigate(`/hod/leave/${l.dbId || l.id}`)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                      >
                        <Eye size={14} />
                        <span>Review</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </HODAppShell>
  );
};

export default HODLeaveList;
