import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  Users, 
  ClipboardList, 
  CalendarCheck, 
  ArrowLeft, 
  Plus, 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { getFacultyCourseById } from '../../services/courseService';
import type { FacultyCourseItem } from '../../services/courseService';
import { getStudentsByCourse } from '../../services/studentService';
import type { ExtendedStudent } from '../../data/students';
import { getAssignments } from '../../services/assignmentService';
import type { Assignment } from '../../data/assignments';
import { CreateAssignmentModal } from '../components/CreateAssignmentModal';
import { getFacultyAttendanceLogs } from '../../services/attendanceService';
import type { AttendanceSessionLog } from '../../services/attendanceService';

export const FacultyCourseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<FacultyCourseItem | null>(null);
  const [students, setStudents] = useState<ExtendedStudent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSessionLog[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'assignments' | 'attendance'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoadError('Course identifier is missing.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      getFacultyCourseById(id),
      getStudentsByCourse(id),
      getAssignments(),
      getFacultyAttendanceLogs(),
    ]).then(([crs, stds, assgs, sessions]) => {
      setCourse(crs || null);
      setStudents(stds);
      setAssignments(assgs.filter(a => a.courseId === (crs?.id || id)));
      setAttendanceSessions(sessions.filter(session => session.courseCode === (crs?.id || id) || session.courseCode === crs?.code));
      setIsLoading(false);
    }).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : 'Unable to load course details.');
      setIsLoading(false);
    });
  }, [id]);

  if (isLoading) {
    return (
      <FacultyAppShell>
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
          Loading course details...
        </div>
      </FacultyAppShell>
    );
  }

  if (loadError || !course) {
    return <FacultyAppShell><div className="dashboard-panel" role="alert">{loadError || 'Course not found.'}</div></FacultyAppShell>;
  }

  return (
    <FacultyAppShell>
      {/* Back Button & Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button 
          className="btn btn-secondary" 
          style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginBottom: '1rem' }}
          onClick={() => navigate('/faculty/courses')}
        >
          <ArrowLeft size={14} />
          <span>Back to Courses</span>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className="badge badge-graded">{course.code}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
                {course.department} · Semester {course.semester}
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--brand-black)' }}>
              {course.name}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={() => setIsCreateAssignmentOpen(true)}>
              <Plus size={16} />
              <span>Create Assignment</span>
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/faculty/attendance')}>
              <CalendarCheck size={16} />
              <span>Mark Attendance</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="dashboard-panel" style={{ padding: '0.5rem 0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'overview', label: 'Overview', icon: <BookOpen size={16} /> },
            { id: 'students', label: `Enrolled Students (${students.length})`, icon: <Users size={16} /> },
            { id: 'assignments', label: `Assignments (${assignments.length})`, icon: <ClipboardList size={16} /> },
            { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={16} /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto', padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Course Description</h3>
            <p style={{ lineHeight: '1.6', fontSize: '0.9rem', color: 'var(--brand-dark-grey)' }}>
              {course.description || 'No course description is available.'}
            </p>
          </div>

          {/* Module Syllabus Breakdown */}
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Syllabus Modules</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {course.modules.map((mod) => (
                <div key={mod.id} style={{ padding: '0.85rem 1rem', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--brand-light-grey)', border: '1px solid rgba(156, 163, 175, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-orange)', marginRight: '0.5rem', fontFamily: 'monospace' }}>Module {mod.id}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--brand-black)' }}>{mod.title}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
                    <span>{mod.materialsCount} Materials</span>
                    <span>{mod.assignmentsCount} Assignments</span>
                  </div>
                </div>
              ))}
              {course.modules.length === 0 && <p style={{ color: 'var(--brand-dark-grey)' }}>No module metadata is available for this course.</p>}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STUDENTS */}
      {activeTab === 'students' && (
        <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="table font-sans">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>USN</th>
                  <th>Attendance</th>
                  <th>Assignment Status</th>
                  <th>Academic Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((std) => (
                  <tr key={std.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{std.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>{std.email}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{std.usn}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: std.attendancePercent && std.attendancePercent < 75 ? 'var(--color-error)' : 'var(--brand-blue)' }}>
                        {std.attendancePercent != null ? `${std.attendancePercent}%` : 'Not provided'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {std.assignmentsCompleted != null ? `${std.assignmentsCompleted} / ${std.assignmentsTotal || 0} Done` : 'Not tracked'}
                    </td>
                    <td>
                      <span className={`badge ${
                        std.academicStatus === 'Good Standing' ? 'badge-graded' :
                        std.academicStatus === 'Warning' ? 'badge-overdue' : 'badge-pending'
                      }`} style={{ fontSize: '0.75rem' }}>
                        {std.academicStatus}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="btn btn-secondary" 
                        style={{ width: 'auto', padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                        onClick={() => navigate(`/faculty/students/${std.id}`)}
                      >
                        <span>View Detail</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <div className="dashboard-panel">
          <div className="panel-header-row" style={{ marginBottom: '1rem' }}>
            <h3 className="panel-title" style={{ fontSize: '1.1rem' }}>Course Assignments</h3>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setIsCreateAssignmentOpen(true)}>
              <Plus size={15} />
              <span>Create Assignment</span>
            </button>
          </div>

          {assignments.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--brand-dark-grey)' }}>
              No assignments posted for this course yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {assignments.map((assg) => (
                <div key={assg.id} style={{ padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)', backgroundColor: 'var(--brand-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--brand-black)' }}>{assg.title}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
                      Due Date: {new Date(assg.deadline).toLocaleString()} · Total Marks: {assg.marks}
                    </p>
                  </div>
                  <button 
                    className="btn btn-secondary" 
                    style={{ width: 'auto', fontSize: '0.8rem' }}
                    onClick={() => navigate(`/faculty/assignments/${assg.id}`)}
                  >
                    <span>Open Submissions</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="dashboard-panel">
          <div className="panel-header-row" style={{ marginBottom: '1rem' }}>
            <div>
              <h3 className="panel-title" style={{ fontSize: '1.1rem' }}>Attendance Overview</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>Average Course Attendance: <strong>{course.averageAttendancePercent == null ? 'No sessions recorded' : `${course.averageAttendancePercent}%`}</strong></p>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => navigate('/faculty/attendance')}>
              <CalendarCheck size={16} />
              <span>Mark Today's Attendance</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Students Below 75% Threshold</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {students.filter(s => s.attendancePercent != null && s.attendancePercent < 75).map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span>{s.name} ({s.usn})</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-error)' }}>{s.attendancePercent}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recent Class Sessions</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>
                {attendanceSessions.slice(0, 5).map(session => (
                  <div key={session.id}>{new Date(session.date).toLocaleDateString()} {session.timeSlot} — {session.presentCount} Present, {session.absentCount} Absent, {session.lateCount} Late</div>
                ))}
                {attendanceSessions.length === 0 && <p>No attendance sessions have been recorded for this course.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Assignment Modal */}
      <CreateAssignmentModal 
        isOpen={isCreateAssignmentOpen}
        defaultCourseId={course.id}
        onClose={() => setIsCreateAssignmentOpen(false)}
        onSuccess={() => {
          getAssignments().then(assgs => setAssignments(assgs.filter(a => a.courseId === course.id))).catch((error: unknown) => {
            setLoadError(error instanceof Error ? error.message : 'Unable to refresh course assignments.');
          });
        }}
      />
    </FacultyAppShell>
  );
};

export default FacultyCourseDetail;
