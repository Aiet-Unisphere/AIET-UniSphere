import React, { useState, useEffect } from 'react';
import { 
  CalendarCheck, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Save, 
  Search, 
  BookOpen, 
  Info, 
  Users,
  Check
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { ClockTimePicker } from '../components/ClockTimePicker';
import { 
  getDepartmentStudentsForAttendance, 
  getFacultyAttendanceLogs, 
  markAttendanceSession 
} from '../../services/attendanceService';
import type { DepartmentStudent, AttendanceSessionLog } from '../../services/attendanceService';
import { getAvailableDepartmentCourses } from '../../services/courseService';
import { useAuth } from '../../app/context/AuthContext';

export const FacultyAttendancePage: React.FC = () => {
  const { profile } = useAuth();

  // Course input and suggestions
  const [courseInput, setCourseInput] = useState<string>('');
  const [availableCourses, setAvailableCourses] = useState<{ code: string; name: string }[]>([]);
  const [showCourseSuggestions, setShowCourseSuggestions] = useState<boolean>(false);

  // Session details
  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [sessionTime, setSessionTime] = useState<string>('09:00 AM - 10:00 AM');
  const [section, setSection] = useState<string>('');
  const [semester, setSemester] = useState<number | ''>('');

  // Students and attendance states
  const [students, setStudents] = useState<DepartmentStudent[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<{ [studentId: string]: 'Present' | 'Absent' | 'Late' }>({});
  const [historyLogs, setHistoryLogs] = useState<AttendanceSessionLog[]>([]);

  // Search filter
  const [studentSearch, setStudentSearch] = useState<string>('');

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'mark' | 'history'>('mark');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error' | 'warning', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 6000);
  };

  const loadData = async () => {
    setIsLoading(true);
    setSchemaWarning(null);
    try {
      const [stds, logs, courses] = await Promise.all([
        getDepartmentStudentsForAttendance(profile?.department_id || undefined),
        getFacultyAttendanceLogs(),
        getAvailableDepartmentCourses()
      ]);

      setStudents(stds);
      setHistoryLogs(logs);
      setAvailableCourses(courses);

      // Default course if available
      if (courses.length > 0 && !courseInput) {
        setCourseInput(`${courses[0].name} (${courses[0].code})`);
      }

      // Detect semester from students if available
      if (stds.length > 0 && stds[0].semester) {
        setSemester(stds[0].semester);
      }

      // Default all students to 'Present'
      const initialMap: { [studentId: string]: 'Present' | 'Absent' | 'Late' } = {};
      stds.forEach(s => { initialMap[s.id] = 'Present'; });
      setAttendanceMap(initialMap);
    } catch (err: any) {
      console.error('Failed to load attendance initial data:', err);
      if (err?.message?.includes('schema cache') || err?.message?.includes('attendance_sessions')) {
        setSchemaWarning('The attendance database tables are not yet synced. Please run migration 00014_attendance_sessions_and_records.sql in the Supabase SQL Editor.');
      } else {
        showToast('error', 'Unable to load attendance records. Please refresh.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.department_id]);

  const handleMarkAllPresent = () => {
    const updated: typeof attendanceMap = {};
    students.forEach(s => { updated[s.id] = 'Present'; });
    setAttendanceMap(updated);
  };

  const handleStatusToggle = (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleSaveAttendance = async () => {
    if (!courseInput.trim()) {
      showToast('error', 'Please enter a course name or code.');
      return;
    }

    if (students.length === 0) {
      showToast('error', 'No students registered in this department to record attendance for.');
      return;
    }

    setIsSaving(true);
    setToastMessage(null);

    // Derive code and name safely
    const trimmedCourse = courseInput.trim();
    const parenMatch = trimmedCourse.match(/\(([^)]+)\)/);
    const courseCode = parenMatch && parenMatch[1] ? parenMatch[1].trim() : (trimmedCourse.split(' ')[0] || 'COURSE');
    const courseName = trimmedCourse;

    const records = students.map(s => ({
      studentId: s.id,
      studentName: s.name,
      usn: s.usn,
      status: attendanceMap[s.id] || 'Present'
    }));

    try {
      await markAttendanceSession(
        courseCode,
        courseName,
        sessionDate,
        sessionTime,
        records,
        section ? section.trim() : null,
        semester !== '' ? Number(semester) : null
      );

      setIsSaving(false);
      showToast('success', `Attendance recorded successfully for ${courseCode} (${records.length} students marked).`);

      // Refresh logs
      const updatedLogs = await getFacultyAttendanceLogs();
      setHistoryLogs(updatedLogs);
    } catch (err: any) {
      console.error('Failed to save attendance session:', err);
      setIsSaving(false);
      const msg = err?.message || '';
      if (msg.includes('schema cache') || msg.includes('attendance_sessions')) {
        showToast('error', 'Database tables not yet created. Please run migration 00014 in Supabase SQL Editor.');
      } else {
        showToast('error', msg || 'Unable to save attendance session. Please try again.');
      }
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.usn.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const presentCount = Object.values(attendanceMap).filter(v => v === 'Present').length;
  const absentCount = Object.values(attendanceMap).filter(v => v === 'Absent').length;
  const lateCount = Object.values(attendanceMap).filter(v => v === 'Late').length;

  return (
    <FacultyAppShell>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            marginBottom: '1rem',
            borderRadius: '8px',
            backgroundColor: toastMessage.type === 'success' ? '#ECFDF5' : toastMessage.type === 'warning' ? '#FFFBEB' : '#FEF2F2',
            border: `1px solid ${toastMessage.type === 'success' ? '#6EE7B7' : toastMessage.type === 'warning' ? '#FCD34D' : '#FCA5A5'}`,
            color: toastMessage.type === 'success' ? '#065F46' : toastMessage.type === 'warning' ? '#92400E' : '#991B1B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            fontWeight: 600
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {toastMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Schema Cache Alert if tables are pending */}
      {schemaWarning && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            borderRadius: '8px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            color: '#1E40AF',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem',
            fontSize: '0.85rem'
          }}
        >
          <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ display: 'block', fontWeight: 700 }}>Database Migration Required</strong>
            <span>{schemaWarning}</span>
          </div>
        </div>
      )}

      {/* Page Title Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--brand-black)' }}>
          Attendance Management
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
          Record class attendance sessions with the interactive clock time selector, inspect recorded session logs, and sync student check-ins.
        </p>
      </div>

      {/* Course & Session Selector Bar */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          
          {/* Course Selector / Searchable Input */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Course Name / Code *
            </label>
            <input
              type="text"
              className="form-input font-sans"
              placeholder="Search or enter course (e.g. CS501)..."
              value={courseInput}
              onFocus={() => setShowCourseSuggestions(true)}
              onChange={(e) => {
                setCourseInput(e.target.value);
                setShowCourseSuggestions(true);
              }}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF'
              }}
            />

            {/* Course Suggestions Dropdown */}
            {showCourseSuggestions && availableCourses.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  zIndex: 200,
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #E2E8F0',
                  maxHeight: '180px',
                  overflowY: 'auto'
                }}
              >
                {availableCourses.map((c) => (
                  <div
                    key={c.code}
                    onClick={() => {
                      setCourseInput(`${c.name} (${c.code})`);
                      setShowCourseSuggestions(false);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid #F1F5F9',
                      fontSize: '0.825rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{c.name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'monospace' }}>{c.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session Date */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Date *
            </label>
            <input 
              type="date" 
              className="form-input font-sans"
              style={{ width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.875rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </div>

          {/* Session Time — Clock / Dial Time Picker */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Session Time Slot * (Clock Selector)
            </label>
            <ClockTimePicker 
              value={sessionTime}
              onChange={(val) => setSessionTime(val)}
            />
          </div>

          {/* Section & Semester */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                Section (Optional)
              </label>
              <input
                type="text"
                className="form-input font-sans"
                placeholder="e.g. A, B"
                style={{ width: '100%', padding: '0.6rem 0.5rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
                value={section}
                onChange={(e) => setSection(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                Semester (Optional)
              </label>
              <select 
                className="form-input font-sans"
                style={{ width: '100%', padding: '0.6rem 0.5rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
                value={semester}
                onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">None</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                  <option key={s} value={s}>Sem {s}</option>
                ))}
              </select>
            </div>
          </div>

        </div>
      </div>

      {/* Tabs Bar */}
      <div className="dashboard-panel" style={{ padding: '0.5rem 0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button 
            className={`btn ${activeTab === 'mark' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('mark')}
            style={{ width: 'auto', fontSize: '0.85rem' }}
          >
            <CalendarCheck size={16} />
            <span>Mark Attendance Grid ({students.length})</span>
          </button>

          <button 
            className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('history')}
            style={{ width: 'auto', fontSize: '0.85rem' }}
          >
            <Clock size={16} />
            <span>Faculty Session Logs ({historyLogs.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MARK ATTENDANCE GRID */}
      {activeTab === 'mark' && (
        <div className="dashboard-panel">
          <div className="panel-header-row" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 className="panel-title" style={{ fontSize: '1.1rem' }}>
                Attendance Roster {courseInput ? `— ${courseInput}` : ''} ({students.length} Department Students)
              </h3>
              <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                Session Date: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{sessionDate}</span> | Time: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{sessionTime}</span>{section ? ` | ${section}` : ''}{semester ? ` | Sem ${semester}` : ''}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Summary Counter Pill */}
              <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.775rem', fontWeight: 700 }}>
                <span style={{ padding: '0.2rem 0.5rem', backgroundColor: '#ECFDF5', color: '#047857', borderRadius: '4px' }}>
                  {presentCount} Present
                </span>
                <span style={{ padding: '0.2rem 0.5rem', backgroundColor: '#FEF2F2', color: '#DC2626', borderRadius: '4px' }}>
                  {absentCount} Absent
                </span>
                <span style={{ padding: '0.2rem 0.5rem', backgroundColor: '#FFFBEB', color: '#D97706', borderRadius: '4px' }}>
                  {lateCount} Late
                </span>
              </div>

              <button className="btn btn-secondary" onClick={handleMarkAllPresent} style={{ width: 'auto', fontSize: '0.825rem' }}>
                <CheckCircle2 size={15} />
                <span>Mark All Present</span>
              </button>

              <button 
                className="btn btn-primary" 
                onClick={handleSaveAttendance} 
                disabled={isSaving || students.length === 0} 
                style={{ width: 'auto', fontSize: '0.825rem', minWidth: '180px', justifyContent: 'center' }}
              >
                <Save size={15} />
                <span>{isSaving ? 'Saving to Database...' : 'Save Attendance Session'}</span>
              </button>
            </div>
          </div>

          {/* Student Filter Search */}
          {students.length > 0 && (
            <div style={{ marginBottom: '1rem', position: 'relative', maxWidth: '320px' }}>
              <input
                type="text"
                placeholder="Search by student name or USN..."
                className="form-input font-sans"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', fontSize: '0.825rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            </div>
          )}

          {students.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--brand-dark-grey)' }}>
              <Users size={44} style={{ margin: '0 auto 0.75rem', opacity: 0.35, color: 'var(--brand-black)' }} />
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-black)' }}>No Department Students Found</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', maxWidth: '420px', marginInline: 'auto' }}>
                There are currently no students registered under your department in the database.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table font-sans">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>USN</th>
                    <th>Section</th>
                    <th>Attendance Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((std) => {
                    const currentStatus = attendanceMap[std.id] || 'Present';
                    return (
                      <tr key={std.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{std.name}</div>
                        </td>
                        <td style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{std.usn}</td>
                        <td style={{ fontSize: '0.825rem', color: '#64748B' }}>{std.section || '-'}</td>
                        <td>
                          <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(std.id, 'Present')}
                              style={{
                                padding: '4px 14px',
                                fontSize: '0.775rem',
                                fontWeight: currentStatus === 'Present' ? 700 : 500,
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: currentStatus === 'Present' ? 'var(--brand-blue)' : 'transparent',
                                color: currentStatus === 'Present' ? '#FFFFFF' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(std.id, 'Absent')}
                              style={{
                                padding: '4px 14px',
                                fontSize: '0.775rem',
                                fontWeight: currentStatus === 'Absent' ? 700 : 500,
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: currentStatus === 'Absent' ? '#DC2626' : 'transparent',
                                color: currentStatus === 'Absent' ? '#FFFFFF' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              Absent
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(std.id, 'Late')}
                              style={{
                                padding: '4px 14px',
                                fontSize: '0.775rem',
                                fontWeight: currentStatus === 'Late' ? 700 : 500,
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: currentStatus === 'Late' ? '#D97706' : 'transparent',
                                color: currentStatus === 'Late' ? '#FFFFFF' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              Late
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FACULTY SESSION HISTORY LOGS */}
      {activeTab === 'history' && (
        <div className="dashboard-panel">
          <div className="panel-header-row" style={{ marginBottom: '1rem' }}>
            <h3 className="panel-title" style={{ fontSize: '1.1rem' }}>Recorded Attendance Sessions</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
              {historyLogs.length} Sessions Saved
            </span>
          </div>

          {historyLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--brand-dark-grey)' }}>
              <Clock size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.35, color: 'var(--brand-black)' }} />
              <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-black)' }}>No attendance sessions recorded yet.</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Use the Mark Attendance Grid to record and publish class attendance sessions.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table font-sans">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time Slot</th>
                    <th>Course Code &amp; Name</th>
                    <th>Section</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Late</th>
                    <th>Total Marked</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{log.date}</td>
                      <td style={{ fontSize: '0.8rem', color: '#475569' }}>{log.timeSlot}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--brand-black)' }}>
                          {log.courseCode} — {log.courseName}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.825rem' }}>{log.section || 'A'}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#047857' }}>{log.presentCount}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#DC2626' }}>{log.absentCount}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#D97706' }}>{log.lateCount}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{log.totalStudents}</td>
                      <td style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)' }}>{log.markedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </FacultyAppShell>
  );
};

export default FacultyAttendancePage;
