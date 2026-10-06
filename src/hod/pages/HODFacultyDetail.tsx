import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, BookOpen, Users, CalendarCheck, FileText, CheckCircle2, Shield } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { EmptyState } from '../../components/EmptyState';
import { getFacultyById } from '../../services/facultyService';
import type { FacultyMember } from '../../data/faculty';

export const HODFacultyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState<FacultyMember | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDetail = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const fac = await getFacultyById(id);
        setFaculty(fac);
      } catch (err) {
        console.error("Error loading faculty detail:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDetail();
  }, [id]);

  if (loading) {
    return (
      <HODAppShell>
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
          Loading Faculty Profile...
        </div>
      </HODAppShell>
    );
  }

  if (!faculty) {
    return (
      <HODAppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2>Faculty Member Not Found</h2>
          <p style={{ color: 'var(--brand-dark-grey)', marginTop: '0.5rem' }}>The requested faculty member profile could not be retrieved.</p>
          <button onClick={() => navigate('/hod/faculty')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Back to Faculty Roster
          </button>
        </div>
      </HODAppShell>
    );
  }

  return (
    <HODAppShell>
      {/* Back Button & Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button 
          onClick={() => navigate('/hod/faculty')}
          className="btn-link font-sans"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.75rem', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--brand-blue)' }}
        >
          <ArrowLeft size={16} />
          <span>Back to Faculty Roster</span>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-active font-mono">{faculty.employeeId}</span>
              <span className="badge badge-graded font-mono">{faculty.designation}</span>
            </div>
            <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
              {faculty.name}
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
              {faculty.department} Department Academic Profile
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className={`badge ${faculty.status === 'Active' ? 'badge-active' : 'badge-pending'}`} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              Status: {faculty.status}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid — Profile Card & Academic Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
        
        {/* Faculty Contact & Details Panel */}
        <div className="dashboard-panel">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', marginBottom: '1.25rem' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: 'var(--brand-blue)', color: 'var(--brand-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.75rem', marginBottom: '0.75rem' }}>
              {faculty.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
            </div>
            <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0 }}>
              {faculty.name}
            </h2>
            <span style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
              {faculty.designation}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>EMPLOYEE ID</span>
              <div className="font-mono" style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.15rem' }}>{faculty.employeeId}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>EMAIL ADDRESS</span>
              <div style={{ color: 'var(--brand-blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                <Mail size={14} />
                <span>{faculty.email}</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>PHONE CONTACT</span>
              <div style={{ color: 'var(--brand-black)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                <Phone size={14} />
                <span>{faculty.phone}</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>DEPARTMENT</span>
              <div style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.15rem' }}>{faculty.department}</div>
            </div>
          </div>
        </div>

        {/* Academic Performance & Activity Statistics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="dashboard-panel">
            <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Academic Responsibilities</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', textAlign: 'center', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)' }}>COURSES ASSIGNED</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>{faculty.assignedCourses.length}</div>
              </div>

              <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', textAlign: 'center', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)' }}>TOTAL STUDENTS</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>{faculty.totalStudents}</div>
              </div>

              <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', textAlign: 'center', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)' }}>ATTENDANCE LOGS</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem' }}>{faculty.attendanceLogCount}</div>
              </div>
            </div>

            {/* Course Table */}
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.75rem' }}>Allocated Department Courses</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', fontWeight: 700, color: 'var(--brand-black)' }}>
                    <th style={{ padding: '0.75rem' }}>Code</th>
                    <th style={{ padding: '0.75rem' }}>Course Name</th>
                    <th style={{ padding: '0.75rem' }}>Semester</th>
                    <th style={{ padding: '0.75rem' }}>Students</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.assignedCourses.map((c) => (
                    <tr key={c.courseId} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                      <td style={{ padding: '0.75rem' }} className="font-mono text-blue font-bold">{c.courseCode}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--brand-black)' }}>{c.courseName}</td>
                      <td style={{ padding: '0.75rem' }}>Semester {c.semester}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{c.studentCount}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button onClick={() => navigate(`/hod/courses/${c.courseId}`)} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                          View Course
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Log Panel */}
          <div className="dashboard-panel">
            <h2 className="panel-title font-display" style={{ marginBottom: '0.75rem' }}>Recent Academic Activity</h2>
            <EmptyState title="Activity feed unavailable" message={`Recorded responsibilities: ${faculty.assignmentsCreatedCount} assignments and ${faculty.attendanceLogCount} attendance sessions.`} />
          </div>
        </div>

      </div>
    </HODAppShell>
  );
};

export default HODFacultyDetail;
