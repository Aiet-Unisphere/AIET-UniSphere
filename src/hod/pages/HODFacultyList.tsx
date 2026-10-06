import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserCheck, Eye, Filter, Mail, BookOpen, Users } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { getAllFaculty } from '../../services/facultyService';
import type { FacultyMember } from '../../data/faculty';

import { useAuth } from '../../app/context/AuthContext';

export const HODFacultyList: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [designationFilter, setDesignationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFaculty = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllFaculty();
      setFacultyList(data);
    } catch (err: any) {
      console.error("Error loading faculty list:", err);
      setError(err?.message || "Unable to load department faculty members.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFaculty();
  }, []);

  const deptName = profile?.department?.name || 'Department';

  const filteredFaculty = facultyList.filter((fac) => {
    const matchesSearch = 
      fac.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fac.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fac.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDesignation = designationFilter === 'All' || fac.designation === designationFilter;
    const matchesStatus = statusFilter === 'All' || fac.status === statusFilter;

    return matchesSearch && matchesDesignation && matchesStatus;
  });

  if (loading) {
    return (
      <HODAppShell>
        <LoadingState message="Loading department faculty roster..." />
      </HODAppShell>
    );
  }

  if (error) {
    return (
      <HODAppShell>
        <ErrorState message={error} onRetry={loadFaculty} />
      </HODAppShell>
    );
  }

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">DEPARTMENT MANAGEMENT</span>
          <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Faculty Roster
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            {deptName} Academic Staff &amp; Course Allocations
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ backgroundColor: 'var(--brand-white)', padding: '0.5rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)' }}>
            Total Faculty: <span style={{ color: 'var(--brand-orange)', fontWeight: 800 }}>{facultyList.length}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar Container */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Input */}
          <div className="header-search" style={{ width: '320px', position: 'relative' }}>
            <Search size={16} className="header-search-icon" />
            <input 
              type="text" 
              placeholder="Search faculty by name or ID..."
              className="header-search-input font-sans"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
              <Filter size={14} />
              <span>Designation:</span>
            </div>
            <select 
              className="form-select font-sans" 
              style={{ width: '190px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
            >
              <option value="All">All Designations</option>
              <option value="Professor & HOD">Professor & HOD</option>
              <option value="Professor">Professor</option>
              <option value="Associate Professor">Associate Professor</option>
              <option value="Assistant Professor">Assistant Professor</option>
              <option value="Faculty">Faculty</option>
            </select>

            <select 
              className="form-select font-sans" 
              style={{ width: '130px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Faculty Table Container */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredFaculty.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No faculty members found"
            description={
              searchQuery || designationFilter !== 'All' || statusFilter !== 'All'
                ? "Try adjusting your search query or filter selection."
                : "No faculty members exist for your department in the database."
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '1rem 1.25rem' }}>Faculty Member</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Emp ID</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Designation</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Assigned Courses</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Students</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Attendance Logs</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFaculty.map((fac) => (
                  <tr key={fac.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: 'var(--brand-blue)', color: 'var(--brand-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                          {fac.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.9rem' }}>{fac.name}</div>
                          <div style={{ fontSize: '0.775rem', color: 'var(--brand-dark-grey)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.1rem' }}>
                            <Mail size={12} />
                            <span>{fac.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono" style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                        {fac.employeeId}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{fac.designation}</span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <BookOpen size={14} className="text-blue" />
                        <span style={{ fontWeight: 700 }}>{fac.assignedCourses.length} Courses</span>
                      </div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Users size={14} className="text-dark-grey" />
                        <span style={{ fontWeight: 600 }}>{fac.totalStudents}</span>
                      </div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{fac.attendanceLogCount} Sessions</span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className={`badge ${fac.status === 'Active' ? 'badge-active' : 'badge-pending'}`}>
                        {fac.status}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                      <button 
                        onClick={() => navigate(`/hod/faculty/${fac.id}`)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                      >
                        <Eye size={14} />
                        <span>View Faculty</span>
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

export default HODFacultyList;
