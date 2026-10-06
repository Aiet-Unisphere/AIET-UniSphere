import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileCheck2,
  FileEdit
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { getFacultyAssignments } from '../../services/assignmentService';
import type { ExtendedAssignment } from '../../services/assignmentService';
import { CreateAssignmentModal } from '../components/CreateAssignmentModal';

export const FacultyAssignmentList: React.FC = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<ExtendedAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<'All' | 'Active' | 'Pending' | 'Closed' | 'Draft'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchAssignments = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await getFacultyAssignments();
      setAssignments(res);
    } catch (err: any) {
      console.error('[FacultyAssignmentList] Load error:', err);
      setErrorMsg('Unable to load assignments. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  // Compute real status counts
  const counts = {
    All: assignments.length,
    Active: assignments.filter(a => a.effectiveStatus === 'Active').length,
    Pending: assignments.filter(a => a.effectiveStatus === 'Pending').length,
    Closed: assignments.filter(a => a.effectiveStatus === 'Closed').length,
    Draft: assignments.filter(a => a.effectiveStatus === 'Draft').length,
  };

  // Filter assignments
  const filteredAssignments = assignments.filter(assg => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      assg.title.toLowerCase().includes(q) || 
      assg.courseId.toLowerCase().includes(q) || 
      assg.courseName.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (activeTab === 'All') return true;
    return assg.effectiveStatus === activeTab;
  });

  return (
    <FacultyAppShell>
      {/* Page Header */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--brand-black)', margin: 0 }}>
            Assignment Management
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', fontWeight: 500, marginTop: '0.2rem', margin: 0 }}>
            Manage coursework, deadlines, submissions, evaluations and grades.
          </p>
        </div>

        <button 
          className="btn btn-primary" 
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', width: 'auto' }}
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Plus size={16} />
          <span>Create Assignment</span>
        </button>
      </div>

      {/* Filter Tabs & Search Control Bar */}
      <div className="dashboard-panel" style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          
          {/* Segmented Status Filters with Real Counts */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {(['All', 'Active', 'Pending', 'Closed', 'Draft'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'Active' && <Clock size={14} />}
                {tab === 'Pending' && <ClipboardList size={14} />}
                {tab === 'Closed' && <CheckCircle2 size={14} />}
                {tab === 'Draft' && <FileEdit size={14} />}
                <span>{tab} ({counts[tab]})</span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="header-search" style={{ minWidth: '220px', width: 'auto', margin: 0 }}>
            <Search size={15} className="header-search-icon" />
            <input 
              type="text" 
              placeholder="Search by title or course..."
              className="header-search-input"
              style={{ width: '100%', fontSize: '0.825rem' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Assignments Table / State Containers */}
      {isLoading ? (
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--brand-dark-grey)' }}>
          <div className="skeleton-loader" style={{ width: '40px', height: '40px', borderRadius: '50%', margin: '0 auto 0.75rem' }}></div>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Loading course assignments...</span>
        </div>
      ) : errorMsg ? (
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <AlertCircle size={36} style={{ color: 'var(--color-error)', margin: '0 auto 0.5rem' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--brand-black)' }}>Unable to Load Assignments</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>{errorMsg}</p>
          <button className="btn btn-primary" style={{ width: 'auto', margin: '0.75rem auto 0' }} onClick={fetchAssignments}>
            Retry
          </button>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <FileCheck2 size={40} style={{ color: 'var(--brand-dark-grey)', margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0 }}>
            {activeTab === 'All' ? 'No Assignments Found' : `No ${activeTab} Assignments`}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.35rem', maxWidth: '440px', margin: '0.35rem auto 1rem' }}>
            {searchQuery 
              ? `No assignments match your search "${searchQuery}".`
              : activeTab === 'All' 
                ? 'No coursework assignments have been posted for your department courses yet.' 
                : `There are currently no assignments in the "${activeTab}" state.`
            }
          </p>
          <button 
            className="btn btn-primary" 
            style={{ width: 'auto', padding: '0.45rem 1rem', fontSize: '0.85rem', margin: '0 auto' }}
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} />
            <span>Create Assignment</span>
          </button>
        </div>
      ) : (
        <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="table font-sans" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '28%', minWidth: '220px' }}>Assignment Title</th>
                  <th style={{ width: '20%', minWidth: '160px' }}>Course</th>
                  <th style={{ width: '18%', minWidth: '150px' }}>Deadline</th>
                  <th style={{ width: '10%', minWidth: '80px', textAlign: 'center' }}>Max Marks</th>
                  <th style={{ width: '12%', minWidth: '100px', textAlign: 'center' }}>Submissions</th>
                  <th style={{ width: '12%', minWidth: '110px' }}>Status</th>
                  <th style={{ width: '10%', minWidth: '110px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((assg) => {
                  const deadlineDate = new Date(assg.deadline);
                  const isPastDeadline = new Date() > deadlineDate;

                  return (
                    <tr key={assg.id}>
                      <td>
                        <div 
                          style={{ 
                            fontWeight: 700, 
                            color: 'var(--brand-black)', 
                            fontSize: '0.875rem',
                            lineHeight: 1.3,
                            marginBottom: '0.2rem'
                          }}
                          title={assg.title}
                        >
                          {assg.title}
                        </div>
                        {assg.instructions && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                            {assg.instructions}
                          </div>
                        )}
                      </td>

                      <td>
                        <span className="badge badge-secondary font-mono" style={{ fontSize: '0.675rem', padding: '0.1rem 0.35rem' }}>
                          {assg.courseId.toUpperCase()}
                        </span>
                        <div style={{ fontSize: '0.825rem', fontWeight: 600, marginTop: '0.15rem', color: 'var(--brand-black)' }}>
                          {assg.courseName}
                        </div>
                      </td>

                      <td>
                        <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--brand-black)', fontWeight: 600 }}>
                          {deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="font-mono" style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                          {deadlineDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td style={{ textAlign: 'center', fontSize: '0.875rem', fontWeight: 700 }} className="font-mono">
                        {assg.marks}
                      </td>

                      <td style={{ textAlign: 'center', fontSize: '0.825rem' }} className="font-mono">
                        <span style={{ fontWeight: 700, color: 'var(--brand-black)' }}>{assg.submittedCount}</span>
                        <span style={{ color: 'var(--brand-dark-grey)' }}> / {assg.totalEnrolledCount}</span>
                      </td>

                      <td>
                        {assg.effectiveStatus === 'Closed' ? (
                          <span className="badge badge-overdue" style={{ fontSize: '0.7rem' }}>
                            Closed
                          </span>
                        ) : assg.effectiveStatus === 'Pending' ? (
                          <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>
                            Pending Evaluation
                          </span>
                        ) : assg.effectiveStatus === 'Draft' ? (
                          <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                            Draft
                          </span>
                        ) : (
                          <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>
                            Active
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-primary"
                          style={{ width: 'auto', padding: '0.3rem 0.65rem', fontSize: '0.775rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          onClick={() => navigate(`/faculty/assignments/${assg.id}`)}
                        >
                          <span>Open &amp; Grade</span>
                          <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Assignment Modal */}
      <CreateAssignmentModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          fetchAssignments();
        }}
      />
    </FacultyAppShell>
  );
};

export default FacultyAssignmentList;
