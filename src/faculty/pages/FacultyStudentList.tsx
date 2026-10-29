import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Search, 
  Filter, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  X, 
  RotateCcw,
  GraduationCap
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { getAllStudents } from '../../services/studentService';
import type { ExtendedStudent } from '../../data/students';
import { useAuth } from '../../app/context/AuthContext';

export const FacultyStudentList: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [students, setStudents] = useState<ExtendedStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [attendanceFilter, setAttendanceFilter] = useState<string>('All');
  const [semesterFilter, setSemesterFilter] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAllStudents().then((res) => {
      setStudents(res);
      setIsLoading(false);
    });
  }, []);

  const deptName = profile?.department?.name || 'Department not assigned';

  // Extract available semesters dynamically from actual student records
  const availableSemesters = useMemo(() => {
    const sems = new Set<number>();
    students.forEach((s) => {
      if (s.semester != null) {
        sems.add(s.semester);
      }
    });
    return Array.from(sems).sort((a, b) => a - b);
  }, [students]);

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'All' || attendanceFilter !== 'All' || semesterFilter !== 'All';

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setAttendanceFilter('All');
    setSemesterFilter('All');
  };

  const filteredStudents = useMemo(() => {
    return students.filter((std) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        std.name.toLowerCase().includes(q) ||
        std.usn.toLowerCase().includes(q) ||
        (std.email || '').toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'All' || std.academicStatus === statusFilter;

      const matchesAttendance = attendanceFilter === 'All' ||
        (attendanceFilter === 'unrecorded' && std.attendancePercent == null) ||
        (attendanceFilter === '<75' && std.attendancePercent != null && std.attendancePercent < 75) ||
        (attendanceFilter === '>=75' && std.attendancePercent != null && std.attendancePercent >= 75);

      const matchesSemester = semesterFilter === 'All' ||
        (std.semester != null && String(std.semester) === semesterFilter);

      return matchesSearch && matchesStatus && matchesAttendance && matchesSemester;
    });
  }, [students, searchQuery, statusFilter, attendanceFilter, semesterFilter]);

  // Semantically consistent badge renderer for Academic Status
  const renderStatusBadge = (status?: string | null) => {
    const s = status || 'Good Standing';
    if (s === 'Good Standing') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          borderRadius: '9999px',
          backgroundColor: '#ECFDF5',
          color: '#065F46',
          border: '1px solid #A7F3D0',
          whiteSpace: 'nowrap'
        }}>
          <CheckCircle2 size={12} style={{ color: '#059669' }} />
          Good Standing
        </span>
      );
    }
    if (s === 'Warning') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          borderRadius: '9999px',
          backgroundColor: '#FFFBEB',
          color: '#92400E',
          border: '1px solid #FDE68A',
          whiteSpace: 'nowrap'
        }}>
          <AlertTriangle size={12} style={{ color: '#D97706' }} />
          Warning
        </span>
      );
    }
    if (s === 'At Risk') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          borderRadius: '9999px',
          backgroundColor: '#FEF2F2',
          color: '#991B1B',
          border: '1px solid #FECACA',
          whiteSpace: 'nowrap'
        }}>
          <AlertTriangle size={12} style={{ color: '#DC2626' }} />
          At Risk
        </span>
      );
    }
    return (
      <span style={{
        padding: '0.25rem 0.65rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: '9999px',
        backgroundColor: '#F1F5F9',
        color: '#475569',
        whiteSpace: 'nowrap'
      }}>
        {s}
      </span>
    );
  };

  return (
    <FacultyAppShell>
      {/* 2.1 Header: Renamed to Student Directory with specified subtitle */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="breadcrumbs" style={{ marginBottom: '0.25rem' }}>
            <span>Faculty Portal</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Student Directory</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.15rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--brand-black)', margin: 0 }}>
              Student Directory
            </h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.2rem 0.6rem',
              borderRadius: '6px',
              backgroundColor: '#EFF6FF',
              color: 'var(--brand-blue)',
              fontSize: '0.75rem',
              fontWeight: 700,
              fontFamily: 'monospace'
            }}>
              {profile?.department?.code || 'DEPT'}
            </span>
          </div>

          <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem', marginBottom: 0 }}>
            View and manage students enrolled in your department.
          </p>
        </div>

        {/* Quick Student Total Pill */}
        <div style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <Users size={16} style={{ color: 'var(--brand-blue)' }} />
          <span style={{ fontSize: '0.825rem', color: '#64748B', fontWeight: 600 }}>Enrolled:</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
            {students.length} Students
          </span>
        </div>
      </div>

      {/* 2.2 Search and Filters Toolbar */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1.15rem', border: '1px solid rgba(226, 232, 240, 0.9)' }}>
        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Search by Name, USN, or Email */}
          <div style={{ position: 'relative', flex: '1', minWidth: '260px', maxWidth: '420px' }}>
            <input 
              type="text" 
              placeholder="Search by student name, USN, or email..."
              className="form-input font-sans"
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                fontSize: '0.85rem',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF'
              }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filters Cluster */}
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            
            {/* Academic Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.775rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Status:</span>
              <select 
                className="form-input font-sans"
                style={{ padding: '0.45rem 0.75rem', fontSize: '0.825rem', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer', fontWeight: 500 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Good Standing">Good Standing</option>
                <option value="Warning">Warning</option>
                <option value="At Risk">At Risk</option>
              </select>
            </div>

            {/* Attendance Level Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.775rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Attendance:</span>
              <select 
                className="form-input font-sans"
                style={{ padding: '0.45rem 0.75rem', fontSize: '0.825rem', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer', fontWeight: 500 }}
                value={attendanceFilter}
                onChange={(e) => setAttendanceFilter(e.target.value)}
              >
                <option value="All">All Levels</option>
                <option value=">=75">75% &amp; Above (&ge;75%)</option>
                <option value="<75">Below 75% (&lt;75%)</option>
                <option value="unrecorded">Not available / Unrecorded</option>
              </select>
            </div>

            {/* Semester Filter (Dynamic) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.775rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Semester:</span>
              <select 
                className="form-input font-sans"
                style={{ padding: '0.45rem 0.75rem', fontSize: '0.825rem', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer', fontWeight: 500 }}
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value)}
              >
                <option value="All">All Semesters</option>
                {availableSemesters.length > 0 ? (
                  availableSemesters.map((sem) => (
                    <option key={sem} value={String(sem)}>Sem {sem}</option>
                  ))
                ) : (
                  [1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                    <option key={sem} value={String(sem)}>Sem {sem}</option>
                  ))
                )}
              </select>
            </div>

            {/* Clear Filters Action */}
            {hasActiveFilters && (
              <button 
                type="button"
                className="btn btn-secondary font-sans"
                onClick={handleClearFilters}
                style={{
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  color: '#B91C1C',
                  borderColor: '#FECACA',
                  backgroundColor: '#FEF2F2',
                  fontWeight: 600
                }}
                title="Reset all search queries and filters"
              >
                <RotateCcw size={13} />
                <span>Clear Filters</span>
              </button>
            )}

          </div>
        </div>

        {/* Filter Results Summary */}
        <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#64748B' }}>
          <span>
            Showing <strong style={{ color: '#0F172A' }}>{filteredStudents.length}</strong> of <strong style={{ color: '#0F172A' }}>{students.length}</strong> department students
          </span>
          {hasActiveFilters && (
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-orange)', fontWeight: 600 }}>
              • Filters applied
            </span>
          )}
        </div>
      </div>

      {/* 2.3 Student Directory Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
          Loading department student directory...
        </div>
      ) : students.length === 0 ? (
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--brand-dark-grey)' }}>
          <Users size={48} style={{ margin: '0 auto 0.75rem', opacity: 0.35, color: 'var(--brand-black)' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--brand-black)' }}>No Enrolled Students Registered</h3>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', maxWidth: '440px', marginInline: 'auto' }}>
            There are currently no active student accounts associated with {deptName} in Supabase.
          </p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px dashed #CBD5E1' }}>
          <Search size={32} style={{ margin: '0 auto 0.5rem', color: '#94A3B8' }} />
          <h4 style={{ fontWeight: 700, color: '#334155', fontSize: '1rem', margin: 0 }}>No matching student records</h4>
          <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '0.25rem', marginBottom: '0.85rem' }}>
            No students match your active search and filter combination.
          </p>
          <button 
            type="button" 
            onClick={handleClearFilters}
            className="btn btn-secondary font-sans" 
            style={{ fontSize: '0.825rem', padding: '0.4rem 0.9rem' }}
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
          <div className="table-responsive" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table font-sans" style={{ margin: 0, width: '100%', minWidth: '1020px', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center', fontSize: '0.75rem', color: '#64748B', padding: '0.85rem 0.75rem' }}>#</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', minWidth: '220px', padding: '0.85rem 0.75rem' }}>Student</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', minWidth: '130px', padding: '0.85rem 0.75rem' }}>USN</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', minWidth: '150px', padding: '0.85rem 0.75rem' }}>Department</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', width: '90px', padding: '0.85rem 0.75rem' }}>Semester</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', minWidth: '110px', padding: '0.85rem 0.75rem' }}>Attendance</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', width: '85px', padding: '0.85rem 0.75rem' }}>CGPA</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', minWidth: '110px', padding: '0.85rem 0.75rem' }}>Assignments</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', minWidth: '130px', padding: '0.85rem 0.75rem' }}>Academic Status</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'right', minWidth: '130px', padding: '0.85rem 1rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((std, idx) => (
                  <tr 
                    key={std.id}
                    style={{ 
                      borderBottom: '1px solid #F1F5F9',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {/* Index */}
                    <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600, padding: '0.85rem 0.75rem' }}>
                      {idx + 1}
                    </td>

                    {/* Column 1: Student (Full Name + Email visually grouped) */}
                    <td style={{ padding: '0.85rem 0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          backgroundColor: '#E2E8F0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          color: '#334155',
                          flexShrink: 0
                        }}>
                          {std.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => navigate(`/faculty/students/${std.id}`)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              padding: 0, 
                              margin: 0, 
                              textAlign: 'left', 
                              cursor: 'pointer',
                              fontWeight: 600, 
                              color: 'var(--brand-black)', 
                              fontSize: '0.875rem', 
                              lineHeight: 1.25,
                              display: 'block'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--brand-orange)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--brand-black)'}
                            title={`View profile for ${std.name}`}
                          >
                            {std.name}
                          </button>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.15rem', wordBreak: 'break-all' }}>
                            {std.email || 'No email registered'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: USN */}
                    <td style={{ padding: '0.85rem 0.75rem' }}>
                      <span style={{ 
                        fontSize: '0.825rem', 
                        fontFamily: 'monospace', 
                        fontWeight: 600, 
                        color: '#0F172A',
                        padding: '0.2rem 0.45rem',
                        backgroundColor: '#F1F5F9',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        {std.usn}
                      </span>
                    </td>

                    {/* Column 3: Department */}
                    <td style={{ padding: '0.85rem 0.75rem', fontSize: '0.825rem', color: '#334155', fontWeight: 500 }}>
                      {std.department}
                    </td>

                    {/* Column 4: Semester */}
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                      <span style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: 600, 
                        color: std.semester != null ? '#0F172A' : '#94A3B8'
                      }}>
                        {std.semester != null ? `Sem ${std.semester}` : 'N/A'}
                      </span>
                    </td>

                    {/* Column 5: Attendance */}
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                      {std.attendancePercent != null ? (
                        <span style={{ 
                          fontWeight: 700, 
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          color: std.attendancePercent < 75 ? '#DC2626' : '#059669',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: std.attendancePercent < 75 ? '#FEF2F2' : '#F0FDF4'
                        }}>
                          {std.attendancePercent}%
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.775rem', color: '#94A3B8', fontStyle: 'italic' }}>
                          Not available
                        </span>
                      )}
                    </td>

                    {/* Column 6: CGPA */}
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                      {std.cgpa != null ? (
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: '#0F172A' }}>
                          {Number(std.cgpa).toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.775rem', color: '#94A3B8' }}>
                          N/A
                        </span>
                      )}
                    </td>

                    {/* Column 7: Assignments */}
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                      {std.assignmentsCompleted != null ? (
                        <span style={{ fontSize: '0.825rem', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                          {std.assignmentsCompleted} / {std.assignmentsTotal || 0}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.775rem', color: '#94A3B8' }}>
                          N/A
                        </span>
                      )}
                    </td>

                    {/* Column 8: Academic Status */}
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                      {renderStatusBadge(std.academicStatus)}
                    </td>

                    {/* Column 9: Action */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button 
                        type="button"
                        className="btn btn-secondary font-sans"
                        style={{ 
                          width: 'auto', 
                          padding: '0.4rem 0.85rem', 
                          fontSize: '0.785rem', 
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          marginLeft: 'auto',
                          color: '#0F172A',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          cursor: 'pointer'
                        }}
                        onClick={() => navigate(`/faculty/students/${std.id}`)}
                        title={`View profile for ${std.name}`}
                      >
                        <span>View Profile</span>
                        <ExternalLink size={13} style={{ color: 'var(--brand-orange)' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </FacultyAppShell>
  );
};

export default FacultyStudentList;
