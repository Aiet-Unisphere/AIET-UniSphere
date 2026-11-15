import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GraduationCap, Eye, Filter, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { getAllStudents } from '../../services/studentService';
import type { ExtendedStudent } from '../../data/students';

import { useAuth } from '../../app/context/AuthContext';

export const HODStudentList: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [students, setStudents] = useState<ExtendedStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStudents = async () => {
      setLoading(true);
      try {
        const data = await getAllStudents();
        setStudents(data);
      } catch (err) {
        console.error("Error loading students list:", err);
      } finally {
        setLoading(false);
      }
    };
    loadStudents();
  }, []);

  const deptName = profile?.department?.name || 'Department Enrolled';

  const filteredStudents = students.filter((s) => {
    const matchesSearch = 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.usn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSemester = semesterFilter === 'All' || (s.semester != null ? s.semester.toString() : '') === semesterFilter;
    const matchesStatus = statusFilter === 'All' || s.academicStatus === statusFilter;

    return matchesSearch && matchesSemester && matchesStatus;
  });

  const atRiskCount = students.filter(s => s.academicStatus === 'At Risk' || (s.attendancePercent ?? 100) < 75).length;

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">DEPARTMENT MANAGEMENT</span>
          <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Student Directory
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            {deptName} Enrolled Students &amp; Academic Status
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ backgroundColor: '#F8FAFC', padding: '0.5rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid #E2E8F0', fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <GraduationCap size={16} style={{ color: 'var(--brand-blue)' }} />
            <span>{searchQuery || semesterFilter !== 'All' || statusFilter !== 'All' ? `Showing ${filteredStudents.length} of ${students.length}` : `${students.length} Total Enrolled`}</span>
          </div>
          <div style={{ backgroundColor: '#FEF2F2', padding: '0.5rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid #FCA5A5', fontSize: '0.85rem', fontWeight: 700, color: '#991B1B', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={16} />
            <span>Students Requiring Attention: {atRiskCount}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Input */}
          <div className="header-search" style={{ width: '320px', position: 'relative' }}>
            <Search size={16} className="header-search-icon" />
            <input 
              type="text" 
              placeholder="Search student by name or USN..."
              className="header-search-input font-sans"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
              <Filter size={14} />
              <span>Semester:</span>
            </div>
            <select 
              className="form-select font-sans" 
              style={{ width: '140px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
            >
              <option value="All">All Semesters</option>
              <option value="3">Semester 3</option>
              <option value="4">Semester 4</option>
              <option value="5">Semester 5</option>
              <option value="6">Semester 6</option>
            </select>

            <select 
              className="form-select font-sans" 
              style={{ width: '160px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Academic Status</option>
              <option value="Good Standing">Good Standing</option>
              <option value="Warning">Warning</option>
              <option value="At Risk">At Risk</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Student Roster Table Container */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            Loading Student Directory...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <GraduationCap size={36} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
            <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)' }}>No students match your query</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>Try adjusting your filters or search keywords.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '1rem 1.25rem' }}>Student</th>
                  <th style={{ padding: '1rem 1.25rem' }}>USN</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Semester</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Attendance</th>
                  <th style={{ padding: '1rem 1.25rem' }}>CGPA</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Academic Status</th>
                  <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--brand-light-grey)', border: '1px solid rgba(156, 163, 175, 0.3)', color: 'var(--brand-black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.825rem' }}>
                          {s.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.9rem' }}>{s.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>{s.email}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono text-blue font-bold" style={{ fontSize: '0.825rem' }}>
                        {s.usn}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      {s.semester ? (
                        <span style={{ fontWeight: 600 }}>Semester {s.semester}</span>
                      ) : (
                        <span className="badge badge-pending font-mono" style={{ fontSize: '0.7rem' }}>
                          Incomplete Profile
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono" style={{ fontWeight: 700, color: s.attendancePercent && s.attendancePercent < 75 ? 'var(--color-error)' : 'var(--brand-black)' }}>
                        {s.attendancePercent != null ? `${s.attendancePercent}%` : 'Not provided'}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono" style={{ fontWeight: 700, color: 'var(--brand-black)' }}>
                        {s.cgpa != null ? Number(s.cgpa).toFixed(2) : 'N/A'}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className={`badge ${s.academicStatus === 'Good Standing' ? 'badge-active' : s.academicStatus === 'Warning' ? 'badge-pending' : 'badge-overdue'}`}>
                        {s.academicStatus}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                      <button 
                        onClick={() => navigate(`/hod/students/${s.id}`)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                      >
                        <Eye size={14} />
                        <span>View Profile</span>
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

export default HODStudentList;
