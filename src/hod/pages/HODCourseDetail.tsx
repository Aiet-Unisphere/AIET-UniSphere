import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Users, CalendarCheck, FileText, UserCheck } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { getFacultyCourseById } from '../../services/courseService';
import type { FacultyCourseItem } from '../../services/courseService';
import { getAllStudents } from '../../services/studentService';
import type { ExtendedStudent } from '../../data/students';

export const HODCourseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<FacultyCourseItem | null>(null);
  const [students, setStudents] = useState<ExtendedStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDetail = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [c, stdList] = await Promise.all([
          getFacultyCourseById(id),
          getAllStudents()
        ]);
        setCourse(c || null);
        setStudents(stdList);
      } catch (err) {
        console.error("Error loading course detail:", err);
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
          Loading Course Details...
        </div>
      </HODAppShell>
    );
  }

  if (!course) {
    return (
      <HODAppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2>Course Record Not Found</h2>
          <button onClick={() => navigate('/hod/courses')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Back to Courses Catalog
          </button>
        </div>
      </HODAppShell>
    );
  }

  return (
    <HODAppShell>
      {/* Back Link & Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button 
          onClick={() => navigate('/hod/courses')}
          className="btn-link font-sans"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.75rem', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--brand-blue)' }}
        >
          <ArrowLeft size={16} />
          <span>Back to Department Courses</span>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-active font-mono">{course.code}</span>
              <span className="badge badge-graded font-mono">SEMESTER {course.semester}</span>
            </div>
            <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
              {course.name}
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
              {course.department} · Faculty Lead: <strong>{course.faculty}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
        
        {/* Course Overview Card */}
        <div className="dashboard-panel">
          <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Course Info</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>DESCRIPTION</span>
              <p style={{ color: 'var(--brand-dark-grey)', marginTop: '0.25rem', lineHeight: 1.5 }}>
                {course.description}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>ASSIGNED FACULTY</span>
              <div style={{ fontWeight: 700, color: 'var(--brand-black)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <UserCheck size={16} className="text-blue" />
                <span>{course.faculty}</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>CURRENT ACTIVE MODULE</span>
              <div style={{ fontWeight: 600, color: 'var(--brand-orange)', marginTop: '0.2rem' }}>
                No upcoming activity
              </div>
            </div>
          </div>
        </div>

        {/* Enrolled Students Table */}
        <div className="dashboard-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className="panel-title font-display">Enrolled Students ({course.studentCount})</h2>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', fontWeight: 700, color: 'var(--brand-black)' }}>
                  <th style={{ padding: '0.75rem' }}>USN</th>
                  <th style={{ padding: '0.75rem' }}>Student Name</th>
                  <th style={{ padding: '0.75rem' }}>Attendance</th>
                  <th style={{ padding: '0.75rem' }}>Academic Status</th>
                </tr>
              </thead>
              <tbody>
                {students.slice(0, 6).map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <td style={{ padding: '0.75rem' }} className="font-mono text-blue font-bold">{s.usn}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--brand-black)' }}>{s.name}</td>
                    <td style={{ padding: '0.75rem' }} className="font-mono">
                      <span style={{ fontWeight: 700, color: s.attendancePercent && s.attendancePercent < 75 ? 'var(--color-error)' : 'var(--brand-black)' }}>
                        {s.attendancePercent != null ? `${s.attendancePercent}%` : 'Not provided'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span className={`badge ${s.academicStatus === 'Good Standing' ? 'badge-active' : s.academicStatus === 'Warning' ? 'badge-pending' : 'badge-overdue'}`}>
                        {s.academicStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </HODAppShell>
  );
};

export default HODCourseDetail;
