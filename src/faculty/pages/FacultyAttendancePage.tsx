import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarCheck, 
  CheckCircle2, 
  XCircle,
  Clock, 
  AlertTriangle, 
  Save, 
  Search, 
  BookOpen, 
  Info, 
  Users,
  RotateCcw,
  Calendar,
  Layers,
  Edit3,
  History,
  X,
  Check
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { ClockTimePicker } from '../components/ClockTimePicker';
import { 
  getDepartmentStudentsForAttendance, 
  getFacultyAttendanceLogs, 
  markAttendanceSession,
  getSessionAttendanceDetails,
  correctStudentAttendance
} from '../../services/attendanceService';
import type { 
  DepartmentStudent, 
  AttendanceSessionLog,
  SessionRosterStudent,
  AttendanceCorrectionLogEntry
} from '../../services/attendanceService';
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
  const [initialAttendanceMap, setInitialAttendanceMap] = useState<{ [studentId: string]: 'Present' | 'Absent' | 'Late' }>({});
  const [historyLogs, setHistoryLogs] = useState<AttendanceSessionLog[]>([]);

  // Search & filter
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Present' | 'Absent' | 'Late'>('ALL');

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

  // Session detail & correction modal state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<{
    session: AttendanceSessionLog;
    roster: SessionRosterStudent[];
    corrections: AttendanceCorrectionLogEntry[];
  } | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [modalTab, setModalTab] = useState<'roster' | 'corrections'>('roster');
  const [modalSearch, setModalSearch] = useState('');
  const [modalStatusFilter, setModalStatusFilter] = useState<'ALL' | 'Present' | 'Absent' | 'Late'>('ALL');

  // Active student correction dialog
  const [correctionStudent, setCorrectionStudent] = useState<SessionRosterStudent | null>(null);
  const [targetStatus, setTargetStatus] = useState<'Present' | 'Absent' | 'Late' | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [correctionDialogError, setCorrectionDialogError] = useState<string | null>(null);

  const handleOpenSessionModal = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setIsLoadingDetail(true);
    setCorrectionStudent(null);
    setTargetStatus(null);
    setCorrectionReason('');
    setCorrectionDialogError(null);
    setModalTab('roster');
    setModalSearch('');
    setModalStatusFilter('ALL');

    try {
      const detail = await getSessionAttendanceDetails(sessionId);
      setSessionDetail(detail);
    } catch (err: any) {
      console.error('Failed to load session details:', err);
      showToast('error', err?.message || 'Unable to load session details.');
      setSelectedSessionId(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCloseSessionModal = () => {
    setSelectedSessionId(null);
    setSessionDetail(null);
    setCorrectionStudent(null);
    setTargetStatus(null);
    setCorrectionReason('');
    setCorrectionDialogError(null);
  };

  const handleStartCorrection = (student: SessionRosterStudent, newStatus: 'Present' | 'Absent' | 'Late') => {
    if (student.status === newStatus) return;
    setCorrectionStudent(student);
    setTargetStatus(newStatus);
    setCorrectionReason('');
    setCorrectionDialogError(null);
  };

  const handleConfirmCorrection = async () => {
    if (!correctionStudent || !targetStatus || !selectedSessionId) return;
    const cleanReason = correctionReason.trim();
    if (cleanReason.length < 5) {
      setCorrectionDialogError('Correction reason must be at least 5 characters long.');
      return;
    }

    setIsSubmittingCorrection(true);
    setCorrectionDialogError(null);

    try {
      const result = await correctStudentAttendance(correctionStudent.recordId, targetStatus, cleanReason);
      
      showToast('success', `Attendance for ${correctionStudent.studentName} updated to ${result.newStatus}.`);

      // Refresh session detail and counters
      const updatedDetail = await getSessionAttendanceDetails(selectedSessionId);
      setSessionDetail(updatedDetail);

      // Synchronize parent history logs table
      setHistoryLogs(prev => prev.map(log => {
        if (log.id === selectedSessionId) {
          return {
            ...log,
            presentCount: result.presentCount,
            absentCount: result.absentCount,
            lateCount: result.lateCount,
            totalStudents: result.totalStudents
          };
        }
        return log;
      }));

      // Close dialog
      setCorrectionStudent(null);
      setTargetStatus(null);
      setCorrectionReason('');
    } catch (err: any) {
      console.error('Failed to correct attendance:', err);
      setCorrectionDialogError(err?.message || 'Failed to apply attendance correction.');
    } finally {
      setIsSubmittingCorrection(false);
    }
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
      setInitialAttendanceMap(initialMap);
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

  // Bulk actions
  const handleMarkAllPresent = () => {
    const updated: typeof attendanceMap = {};
    students.forEach(s => { updated[s.id] = 'Present'; });
    setAttendanceMap(updated);
  };

  const handleMarkAllAbsent = () => {
    const updated: typeof attendanceMap = {};
    students.forEach(s => { updated[s.id] = 'Absent'; });
    setAttendanceMap(updated);
  };

  const handleResetAttendance = () => {
    setAttendanceMap({ ...initialAttendanceMap });
  };

  const handleStatusToggle = (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    for (const s of students) {
      if (attendanceMap[s.id] !== initialAttendanceMap[s.id]) {
        return true;
      }
    }
    return false;
  }, [students, attendanceMap, initialAttendanceMap]);

  const handleSaveAttendance = async () => {
    if (!courseInput.trim()) {
      showToast('error', 'Please enter or select a course name or code.');
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

    // IMPORTANT: Include ALL authorized students in submission regardless of search or status filter
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
      // Synchronize initial baseline map to current so unsaved flag clears
      setInitialAttendanceMap({ ...attendanceMap });
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

  // Filtering: Search by Name/USN and optionally filter by Status
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchesSearch = 
        s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.usn.toLowerCase().includes(studentSearch.toLowerCase());
      
      const currentStatus = attendanceMap[s.id] || 'Present';
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [students, studentSearch, statusFilter, attendanceMap]);

  // Filtering for session correction modal
  const filteredModalRoster = useMemo(() => {
    if (!sessionDetail) return [];
    return sessionDetail.roster.filter(s => {
      const matchesSearch = 
        s.studentName.toLowerCase().includes(modalSearch.toLowerCase()) ||
        s.usn.toLowerCase().includes(modalSearch.toLowerCase());
      const matchesStatus = modalStatusFilter === 'ALL' || s.status === modalStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sessionDetail, modalSearch, modalStatusFilter]);

  // Aggregate counts
  const totalStudentsCount = students.length;
  const presentCount = useMemo(() => Object.values(attendanceMap).filter(v => v === 'Present').length, [attendanceMap]);
  const absentCount = useMemo(() => Object.values(attendanceMap).filter(v => v === 'Absent').length, [attendanceMap]);
  const lateCount = useMemo(() => Object.values(attendanceMap).filter(v => v === 'Late').length, [attendanceMap]);
  const unmarkedCount = totalStudentsCount - (presentCount + absentCount + lateCount);

  // Selected course details preview
  const parsedCourseCode = useMemo(() => {
    const paren = courseInput.match(/\(([^)]+)\)/);
    return paren ? paren[1].trim() : courseInput.trim().split(' ')[0] || 'COURSE';
  }, [courseInput]);

  return (
    <FacultyAppShell>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            borderRadius: '10px',
            backgroundColor: toastMessage.type === 'success' ? '#ECFDF5' : toastMessage.type === 'warning' ? '#FFFBEB' : '#FEF2F2',
            border: `1px solid ${toastMessage.type === 'success' ? '#6EE7B7' : toastMessage.type === 'warning' ? '#FCD34D' : '#FCA5A5'}`,
            color: toastMessage.type === 'success' ? '#065F46' : toastMessage.type === 'warning' ? '#92400E' : '#991B1B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            fontWeight: 600,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {toastMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', padding: '0 0.25rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Schema Cache Alert */}
      {schemaWarning && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            borderRadius: '10px',
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

      {/* SECTION 1: HEADER & ACTIVE CLASS CONTEXT */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="breadcrumbs" style={{ marginBottom: '0.25rem' }}>
            <span>Faculty Portal</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Attendance Management</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--brand-black)', margin: 0 }}>
            Attendance Management
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem', marginBottom: 0 }}>
            Quick, intuitive class attendance marking with instant roster summaries, session logs, and bulk actions.
          </p>
        </div>

        {/* Unsaved changes indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {hasUnsavedChanges && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              backgroundColor: '#FFFBEB',
              border: '1px solid #FCD34D',
              color: '#B45309',
              fontSize: '0.75rem',
              fontWeight: 700
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D97706' }} />
              Unsaved Changes
            </span>
          )}

          <button 
            className="btn btn-primary" 
            onClick={handleSaveAttendance} 
            disabled={isSaving || students.length === 0} 
            style={{ 
              fontSize: '0.875rem', 
              padding: '0.6rem 1.25rem', 
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving Attendance...' : `Save Attendance (${totalStudentsCount})`}</span>
          </button>
        </div>
      </div>

      {/* SECTION 2: CLASS & SESSION SELECTION PANEL */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1.25rem', border: '1px solid rgba(226, 232, 240, 0.9)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.65rem' }}>
          <Layers size={18} style={{ color: 'var(--brand-orange)' }} />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--brand-black)' }}>
            Class & Session Parameters
          </h2>
          {courseInput && (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
              Active Course: <strong style={{ color: 'var(--brand-blue)' }}>{parsedCourseCode}</strong>
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.15rem', alignItems: 'flex-end' }}>
          
          {/* Course Selector / Searchable Input */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.03em' }}>
              Course / Subject *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input font-sans"
                placeholder="Search or select course (e.g. CS501)..."
                value={courseInput}
                onFocus={() => setShowCourseSuggestions(true)}
                onChange={(e) => {
                  setCourseInput(e.target.value);
                  setShowCourseSuggestions(true);
                }}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem 0.6rem 2.2rem',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  fontWeight: 500
                }}
              />
              <BookOpen size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            </div>

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
                  boxShadow: '0 12px 24px -4px rgba(0, 0, 0, 0.15)',
                  border: '1px solid #E2E8F0',
                  maxHeight: '220px',
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
                      padding: '0.65rem 0.85rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid #F1F5F9',
                      fontSize: '0.825rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.1s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{c.name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'monospace', padding: '0.15rem 0.4rem', backgroundColor: '#F1F5F9', borderRadius: '4px' }}>
                      {c.code}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session Date */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.03em' }}>
              Attendance Date *
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type="date" 
                className="form-input font-sans"
                style={{ width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.2rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontWeight: 500 }}
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
              <Calendar size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            </div>
          </div>

          {/* Session Time Slot */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.03em' }}>
              Class Time Slot *
            </label>
            <ClockTimePicker 
              value={sessionTime}
              onChange={(val) => setSessionTime(val)}
            />
          </div>

          {/* Section & Semester Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.03em' }}>
                Section
              </label>
              <input
                type="text"
                className="form-input font-sans"
                placeholder="e.g. A, B"
                style={{ width: '100%', padding: '0.6rem 0.6rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
                value={section}
                onChange={(e) => setSection(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.03em' }}>
                Semester
              </label>
              <select 
                className="form-input font-sans"
                style={{ width: '100%', padding: '0.6rem 0.5rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
                value={semester}
                onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">All Semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                  <option key={s} value={s}>Sem {s}</option>
                ))}
              </select>
            </div>
          </div>

        </div>
      </div>

      {/* SECTION 3: ATTENDANCE SUMMARY STATS CARDS */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
        gap: '0.85rem', 
        marginBottom: '1.5rem' 
      }}>
        {/* Total Students */}
        <div 
          onClick={() => setStatusFilter('ALL')}
          style={{
            padding: '1rem 1.15rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '10px',
            border: statusFilter === 'ALL' ? '2px solid var(--brand-blue)' : '1px solid #E2E8F0',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Students
            </span>
            <Users size={18} style={{ color: 'var(--brand-blue)' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', fontFamily: 'var(--font-display)' }}>
            {totalStudentsCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.15rem' }}>
            {statusFilter === 'ALL' ? '● Currently viewing all' : 'Click to show all'}
          </div>
        </div>

        {/* Present Card */}
        <div 
          onClick={() => setStatusFilter('Present')}
          style={{
            padding: '1rem 1.15rem',
            backgroundColor: '#F0FDF4',
            borderRadius: '10px',
            border: statusFilter === 'Present' ? '2px solid #059669' : '1px solid #BBF7D0',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Present
            </span>
            <CheckCircle2 size={18} style={{ color: '#059669' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#065F46', fontFamily: 'var(--font-display)' }}>
            {presentCount}
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#047857', marginLeft: '0.4rem' }}>
              ({totalStudentsCount ? Math.round((presentCount / totalStudentsCount) * 100) : 0}%)
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.15rem' }}>
            {statusFilter === 'Present' ? '● Filtering Present' : 'Click to filter'}
          </div>
        </div>

        {/* Absent Card */}
        <div 
          onClick={() => setStatusFilter('Absent')}
          style={{
            padding: '1rem 1.15rem',
            backgroundColor: '#FEF2F2',
            borderRadius: '10px',
            border: statusFilter === 'Absent' ? '2px solid #DC2626' : '1px solid #FECACA',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Absent
            </span>
            <XCircle size={18} style={{ color: '#DC2626' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#991B1B', fontFamily: 'var(--font-display)' }}>
            {absentCount}
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#B91C1C', marginLeft: '0.4rem' }}>
              ({totalStudentsCount ? Math.round((absentCount / totalStudentsCount) * 100) : 0}%)
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '0.15rem' }}>
            {statusFilter === 'Absent' ? '● Filtering Absent' : 'Click to filter'}
          </div>
        </div>

        {/* Late Card */}
        <div 
          onClick={() => setStatusFilter('Late')}
          style={{
            padding: '1rem 1.15rem',
            backgroundColor: '#FFFBEB',
            borderRadius: '10px',
            border: statusFilter === 'Late' ? '2px solid #D97706' : '1px solid #FDE68A',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Late Arrival
            </span>
            <Clock size={18} style={{ color: '#D97706' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#92400E', fontFamily: 'var(--font-display)' }}>
            {lateCount}
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#B45309', marginLeft: '0.4rem' }}>
              ({totalStudentsCount ? Math.round((lateCount / totalStudentsCount) * 100) : 0}%)
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#D97706', marginTop: '0.15rem' }}>
            {statusFilter === 'Late' ? '● Filtering Late' : 'Click to filter'}
          </div>
        </div>

        {/* Unmarked Card */}
        <div style={{
          padding: '1rem 1.15rem',
          backgroundColor: '#F8FAFC',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Unmarked
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748B' }}>0</span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#475569', fontFamily: 'var(--font-display)' }}>
            {unmarkedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.15rem', fontWeight: 600 }}>
            ✓ Complete roster marked
          </div>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="dashboard-panel" style={{ padding: '0.5rem 0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button 
            className={`btn ${activeTab === 'mark' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('mark')}
            style={{ width: 'auto', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
          >
            <CalendarCheck size={16} />
            <span>Mark Attendance ({totalStudentsCount} Students)</span>
          </button>

          <button 
            className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('history')}
            style={{ width: 'auto', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
          >
            <Clock size={16} />
            <span>Session History Logs ({historyLogs.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MARK ATTENDANCE ROSTER */}
      {activeTab === 'mark' && (
        <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
          
          {/* Action Toolbar Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '1rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid #F1F5F9',
            marginBottom: '1rem'
          }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--brand-black)' }}>
                Student Attendance Roster
              </h3>
              <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem', marginBottom: 0 }}>
                {courseInput ? `${courseInput} — ` : ''}Date: <strong style={{ fontFamily: 'monospace' }}>{sessionDate}</strong> ({sessionTime})
                {statusFilter !== 'ALL' && <span style={{ color: 'var(--brand-orange)', marginLeft: '0.5rem', fontWeight: 700 }}>[Filtered: {statusFilter}]</span>}
              </p>
            </div>

            {/* Quick Bulk Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button 
                type="button"
                className="btn btn-secondary font-sans" 
                onClick={handleMarkAllPresent}
                style={{ 
                  fontSize: '0.8rem', 
                  padding: '0.45rem 0.85rem',
                  backgroundColor: '#ECFDF5',
                  borderColor: '#A7F3D0',
                  color: '#065F46',
                  fontWeight: 600
                }}
                title="Set all students to Present"
              >
                <CheckCircle2 size={15} style={{ color: '#059669' }} />
                <span>Mark All Present</span>
              </button>

              <button 
                type="button"
                className="btn btn-secondary font-sans" 
                onClick={handleMarkAllAbsent}
                style={{ 
                  fontSize: '0.8rem', 
                  padding: '0.45rem 0.85rem',
                  backgroundColor: '#FEF2F2',
                  borderColor: '#FECACA',
                  color: '#991B1B',
                  fontWeight: 600
                }}
                title="Set all students to Absent"
              >
                <XCircle size={15} style={{ color: '#DC2626' }} />
                <span>Mark All Absent</span>
              </button>

              <button 
                type="button"
                className="btn btn-secondary font-sans" 
                onClick={handleResetAttendance}
                style={{ 
                  fontSize: '0.8rem', 
                  padding: '0.45rem 0.85rem',
                  color: '#475569',
                  fontWeight: 600
                }}
                title="Reset to default initial status"
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Search and Filter Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ position: 'relative', minWidth: '280px', flex: '1', maxWidth: '400px' }}>
              <input
                type="text"
                placeholder="Search by student name or USN..."
                className="form-input font-sans"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.55rem 0.75rem 0.55rem 2.2rem', 
                  fontSize: '0.85rem', 
                  borderRadius: '8px', 
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF'
                }}
              />
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              {studentSearch && (
                <button
                  type="button"
                  onClick={() => setStudentSearch('')}
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

            {/* Quick Filter Status Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600 }}>
              <span style={{ color: '#64748B', marginRight: '0.25rem' }}>Filter Status:</span>
              {(['ALL', 'Present', 'Absent', 'Late'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  style={{
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.775rem',
                    borderRadius: '6px',
                    border: statusFilter === tab ? '1px solid var(--brand-blue)' : '1px solid #E2E8F0',
                    backgroundColor: statusFilter === tab ? '#EFF6FF' : '#FFFFFF',
                    color: statusFilter === tab ? 'var(--brand-blue)' : '#475569',
                    fontWeight: statusFilter === tab ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab === 'ALL' ? 'All' : tab}
                </button>
              ))}
            </div>
          </div>

          {/* Table / Student Grid */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--brand-dark-grey)' }}>
              Loading student roster...
            </div>
          ) : students.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--brand-dark-grey)' }}>
              <Users size={48} style={{ margin: '0 auto 0.75rem', opacity: 0.35, color: 'var(--brand-black)' }} />
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-black)' }}>No Department Students Found</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', maxWidth: '420px', marginInline: 'auto' }}>
                There are currently no active students registered under your assigned department in the database.
              </p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
              <Search size={32} style={{ margin: '0 auto 0.5rem', color: '#94A3B8' }} />
              <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.95rem' }}>No matching students found</div>
              <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>
                Try adjusting your search query or reset the status filter.
              </div>
              <button 
                type="button" 
                onClick={() => { setStudentSearch(''); setStatusFilter('ALL'); }}
                className="btn btn-secondary font-sans" 
                style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="table-responsive" style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <table className="table font-sans" style={{ margin: 0 }}>
                <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <tr>
                    <th style={{ width: '45px', textAlign: 'center', fontSize: '0.75rem', color: '#64748B' }}>#</th>
                    <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Student Name</th>
                    <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>USN</th>
                    <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Section / Sem</th>
                    <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', minWidth: '320px' }}>
                      Attendance Status Selection
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((std, idx) => {
                    const currentStatus = attendanceMap[std.id] || 'Present';
                    return (
                      <tr 
                        key={std.id}
                        style={{ 
                          borderBottom: '1px solid #F1F5F9',
                          backgroundColor: currentStatus === 'Absent' ? 'rgba(254, 242, 242, 0.4)' : currentStatus === 'Late' ? 'rgba(255, 251, 235, 0.4)' : '#FFFFFF',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600 }}>
                          {idx + 1}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#E2E8F0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              color: '#334155'
                            }}>
                              {std.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--brand-black)', fontSize: '0.875rem' }}>{std.name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Student</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                          {std.usn}
                        </td>
                        <td style={{ fontSize: '0.825rem', color: '#64748B' }}>
                          <span style={{ padding: '0.15rem 0.5rem', backgroundColor: '#F1F5F9', borderRadius: '4px', fontWeight: 600 }}>
                            {std.section || section || 'Sec A'}
                          </span>
                          {std.semester ? ` • Sem ${std.semester}` : semester ? ` • Sem ${semester}` : ''}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {/* Prominent, Accessible Status Controls */}
                          <div style={{ 
                            display: 'inline-flex', 
                            gap: '0.4rem', 
                            padding: '4px', 
                            backgroundColor: '#F8FAFC', 
                            borderRadius: '8px', 
                            border: '1px solid #E2E8F0' 
                          }}>
                            {/* Present Button */}
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(std.id, 'Present')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '6px 16px',
                                fontSize: '0.825rem',
                                fontWeight: currentStatus === 'Present' ? 700 : 500,
                                borderRadius: '6px',
                                border: currentStatus === 'Present' ? '1px solid #059669' : '1px solid transparent',
                                backgroundColor: currentStatus === 'Present' ? '#10B981' : '#FFFFFF',
                                color: currentStatus === 'Present' ? '#FFFFFF' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: currentStatus === 'Present' ? '0 2px 4px rgba(16, 185, 129, 0.25)' : 'none'
                              }}
                            >
                              <CheckCircle2 size={15} style={{ color: currentStatus === 'Present' ? '#FFFFFF' : '#059669' }} />
                              <span>Present</span>
                            </button>

                            {/* Absent Button */}
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(std.id, 'Absent')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '6px 16px',
                                fontSize: '0.825rem',
                                fontWeight: currentStatus === 'Absent' ? 700 : 500,
                                borderRadius: '6px',
                                border: currentStatus === 'Absent' ? '1px solid #DC2626' : '1px solid transparent',
                                backgroundColor: currentStatus === 'Absent' ? '#EF4444' : '#FFFFFF',
                                color: currentStatus === 'Absent' ? '#FFFFFF' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: currentStatus === 'Absent' ? '0 2px 4px rgba(239, 68, 68, 0.25)' : 'none'
                              }}
                            >
                              <XCircle size={15} style={{ color: currentStatus === 'Absent' ? '#FFFFFF' : '#DC2626' }} />
                              <span>Absent</span>
                            </button>

                            {/* Late Button */}
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(std.id, 'Late')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '6px 16px',
                                fontSize: '0.825rem',
                                fontWeight: currentStatus === 'Late' ? 700 : 500,
                                borderRadius: '6px',
                                border: currentStatus === 'Late' ? '1px solid #D97706' : '1px solid transparent',
                                backgroundColor: currentStatus === 'Late' ? '#F59E0B' : '#FFFFFF',
                                color: currentStatus === 'Late' ? '#FFFFFF' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: currentStatus === 'Late' ? '0 2px 4px rgba(245, 158, 11, 0.25)' : 'none'
                              }}
                            >
                              <Clock size={15} style={{ color: currentStatus === 'Late' ? '#FFFFFF' : '#D97706' }} />
                              <span>Late</span>
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

          {/* Footer Save Summary Bar */}
          {students.length > 0 && (
            <div style={{ 
              marginTop: '1.25rem', 
              padding: '1rem 1.25rem', 
              backgroundColor: '#F8FAFC', 
              borderRadius: '8px', 
              border: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                Showing <strong style={{ color: '#0F172A' }}>{filteredStudents.length}</strong> of <strong style={{ color: '#0F172A' }}>{totalStudentsCount}</strong> students registered in department.
                {hasUnsavedChanges && <span style={{ color: '#B45309', marginLeft: '0.5rem', fontWeight: 600 }}>• Unsaved modifications detected</span>}
              </div>

              <button 
                type="button"
                className="btn btn-primary" 
                onClick={handleSaveAttendance} 
                disabled={isSaving || students.length === 0} 
                style={{ 
                  fontSize: '0.875rem', 
                  padding: '0.6rem 1.5rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Save size={16} />
                <span>{isSaving ? 'Saving to Database...' : `Save Attendance (${totalStudentsCount} Students)`}</span>
              </button>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: FACULTY SESSION HISTORY LOGS */}
      {activeTab === 'history' && (
        <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
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
                    <th style={{ textAlign: 'center' }}>Action</th>
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
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-secondary font-sans"
                          onClick={() => handleOpenSessionModal(log.id)}
                          style={{
                            fontSize: '0.78rem',
                            padding: '0.35rem 0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            color: 'var(--brand-blue)',
                            borderColor: '#BFDBFE',
                            backgroundColor: '#EFF6FF',
                            fontWeight: 600
                          }}
                        >
                          <Edit3 size={13} />
                          <span>View / Correct</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: SESSION DETAIL & CORRECTION MODAL */}
      {selectedSessionId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingCorrection) handleCloseSessionModal();
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                backgroundColor: '#F8FAFC',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <Edit3 size={18} style={{ color: 'var(--brand-blue)' }} />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--brand-black)', fontFamily: 'var(--font-display)' }}>
                    Session Attendance &amp; Correction
                  </h3>
                </div>
                {sessionDetail && (
                  <p style={{ fontSize: '0.825rem', color: '#64748B', margin: 0 }}>
                    <strong style={{ color: '#0F172A' }}>{sessionDetail.session.courseName}</strong> ({sessionDetail.session.courseCode}) • Date: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sessionDetail.session.date}</span> ({sessionDetail.session.timeSlot})
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleCloseSessionModal}
                disabled={isSubmittingCorrection}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem' }}>
              {isLoadingDetail ? (
                <div style={{ textAlign: 'center', padding: '3.5rem', color: '#64748B' }}>
                  Loading session details and student roster...
                </div>
              ) : !sessionDetail ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#EF4444' }}>
                  Unable to load session details.
                </div>
              ) : (
                <>
                  {/* Summary Metric Strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Total Enrolled</span>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>{sessionDetail.session.totalStudents}</div>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#065F46', textTransform: 'uppercase' }}>Present</span>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#065F46' }}>{sessionDetail.session.presentCount}</div>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>Absent</span>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#991B1B' }}>{sessionDetail.session.absentCount}</div>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase' }}>Late</span>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#92400E' }}>{sessionDetail.session.lateCount}</div>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Recorded By</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginTop: '0.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sessionDetail.session.markedBy}
                      </div>
                    </div>
                  </div>

                  {/* Active Student Correction Dialog / Drawer */}
                  {correctionStudent && targetStatus && (
                    <div
                      style={{
                        padding: '1.25rem',
                        marginBottom: '1.25rem',
                        borderRadius: '10px',
                        backgroundColor: '#FEF3C7',
                        border: '2px solid #F59E0B',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <strong style={{ display: 'block', fontSize: '0.95rem', color: '#92400E', fontWeight: 800 }}>
                            Confirm Attendance Status Correction
                          </strong>
                          <span style={{ fontSize: '0.825rem', color: '#78350F' }}>
                            Changing status for <strong>{correctionStudent.studentName}</strong> ({correctionStudent.usn}) from{' '}
                            <span style={{ fontWeight: 700, textDecoration: 'line-through' }}>{correctionStudent.status}</span> to{' '}
                            <span style={{ fontWeight: 800, color: targetStatus === 'Present' ? '#047857' : targetStatus === 'Absent' ? '#B91C1C' : '#B45309' }}>
                              {targetStatus}
                            </span>.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setCorrectionStudent(null); setTargetStatus(null); setCorrectionReason(''); setCorrectionDialogError(null); }}
                          disabled={isSubmittingCorrection}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E' }}
                        >
                          ✕
                        </button>
                      </div>

                      {correctionDialogError && (
                        <div style={{ padding: '0.5rem 0.75rem', marginBottom: '0.75rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                          {correctionDialogError}
                        </div>
                      )}

                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#78350F', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                          Correction Reason (Required, min 5 chars) *
                        </label>
                        <textarea
                          className="form-input font-sans"
                          rows={2}
                          placeholder="e.g. On-duty attendance sanctioned for college sports tournament, medical leave approved by HOD..."
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          disabled={isSubmittingCorrection}
                          style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #D97706', backgroundColor: '#FFFFFF' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary font-sans"
                          onClick={() => { setCorrectionStudent(null); setTargetStatus(null); setCorrectionReason(''); setCorrectionDialogError(null); }}
                          disabled={isSubmittingCorrection}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary font-sans"
                          onClick={handleConfirmCorrection}
                          disabled={isSubmittingCorrection || correctionReason.trim().length < 5}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 1.1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#D97706', borderColor: '#B45309' }}
                        >
                          {isSubmittingCorrection ? <Clock size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>{isSubmittingCorrection ? 'Applying Correction...' : 'Confirm & Save Correction'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tabs: Roster vs Corrections History */}
                  <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.65rem', marginBottom: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => setModalTab('roster')}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.825rem',
                        fontWeight: modalTab === 'roster' ? 700 : 500,
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: modalTab === 'roster' ? '#EFF6FF' : 'transparent',
                        color: modalTab === 'roster' ? 'var(--brand-blue)' : '#64748B',
                        cursor: 'pointer'
                      }}
                    >
                      Enrolled Roster ({sessionDetail.roster.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalTab('corrections')}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.825rem',
                        fontWeight: modalTab === 'corrections' ? 700 : 500,
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: modalTab === 'corrections' ? '#EFF6FF' : 'transparent',
                        color: modalTab === 'corrections' ? 'var(--brand-blue)' : '#64748B',
                        cursor: 'pointer'
                      }}
                    >
                      Correction Audit History ({sessionDetail.corrections.length})
                    </button>
                  </div>

                  {/* TAB A: ROSTER & CORRECTION CONTROLS */}
                  {modalTab === 'roster' && (
                    <>
                      {/* Search & Filter Toolbar inside Modal */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '1rem' }}>
                        <div style={{ position: 'relative', width: '260px' }}>
                          <input
                            type="text"
                            placeholder="Search student or USN..."
                            className="form-input font-sans"
                            value={modalSearch}
                            onChange={(e) => setModalSearch(e.target.value)}
                            style={{ width: '100%', padding: '0.45rem 0.65rem 0.45rem 2rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                          />
                          <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                          {modalSearch && (
                            <button
                              type="button"
                              onClick={() => setModalSearch('')}
                              style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          {(['ALL', 'Present', 'Absent', 'Late'] as const).map(tab => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setModalStatusFilter(tab)}
                              style={{
                                padding: '0.3rem 0.65rem',
                                fontSize: '0.75rem',
                                borderRadius: '6px',
                                border: modalStatusFilter === tab ? '1px solid var(--brand-blue)' : '1px solid #E2E8F0',
                                backgroundColor: modalStatusFilter === tab ? '#EFF6FF' : '#FFFFFF',
                                color: modalStatusFilter === tab ? 'var(--brand-blue)' : '#64748B',
                                fontWeight: modalStatusFilter === tab ? 700 : 500,
                                cursor: 'pointer'
                              }}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Roster Table */}
                      <div className="table-responsive" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                        <table className="table font-sans" style={{ margin: 0 }}>
                          <thead style={{ backgroundColor: '#F8FAFC' }}>
                            <tr>
                              <th style={{ width: '40px', textAlign: 'center', fontSize: '0.75rem' }}>#</th>
                              <th style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Student Name</th>
                              <th style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>USN</th>
                              <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Current Status</th>
                              <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center', minWidth: '240px' }}>
                                Correct Status Action
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredModalRoster.length === 0 ? (
                              <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                                  No students match your filter criteria.
                                </td>
                              </tr>
                            ) : (
                              filteredModalRoster.map((s, idx) => (
                                <tr key={s.recordId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94A3B8' }}>{idx + 1}</td>
                                  <td>
                                    <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.85rem' }}>{s.studentName}</div>
                                  </td>
                                  <td style={{ fontSize: '0.825rem', fontFamily: 'monospace', color: '#475569' }}>{s.usn}</td>
                                  <td style={{ textAlign: 'center' }}>
                                    <span
                                      className={`badge ${
                                        s.status === 'Present' ? 'badge-graded' : s.status === 'Late' ? 'badge-pending' : 'badge-overdue'
                                      }`}
                                      style={{ minWidth: '65px', justifyContent: 'center' }}
                                    >
                                      {s.status}
                                    </span>
                                    {s.isCorrected && (
                                      <div style={{ marginTop: '0.2rem' }}>
                                        <span
                                          style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            backgroundColor: '#FEF3C7',
                                            border: '1px solid #FCD34D',
                                            color: '#92400E',
                                            padding: '0.05rem 0.3rem',
                                            borderRadius: '4px'
                                          }}
                                          title={s.correctionReason ? `Sanction: ${s.correctionReason}` : 'Amended post-submission'}
                                        >
                                          Amended
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                      {(['Present', 'Absent', 'Late'] as const).map(st => {
                                        const isCurrent = s.status === st;
                                        return (
                                          <button
                                            key={st}
                                            type="button"
                                            disabled={isCurrent || isSubmittingCorrection}
                                            onClick={() => handleStartCorrection(s, st)}
                                            style={{
                                              padding: '0.25rem 0.65rem',
                                              fontSize: '0.75rem',
                                              fontWeight: isCurrent ? 700 : 500,
                                              borderRadius: '5px',
                                              border: isCurrent ? '1px solid transparent' : '1px solid #CBD5E1',
                                              backgroundColor: isCurrent ? (st === 'Present' ? '#10B981' : st === 'Absent' ? '#EF4444' : '#F59E0B') : '#FFFFFF',
                                              color: isCurrent ? '#FFFFFF' : '#475569',
                                              cursor: isCurrent ? 'default' : 'pointer',
                                              opacity: isCurrent ? 1 : 0.85
                                            }}
                                            title={isCurrent ? `Currently ${st}` : `Correct status to ${st}`}
                                          >
                                            {st}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {/* TAB B: CORRECTIONS AUDIT LOG */}
                  {modalTab === 'corrections' && (
                    <div className="table-responsive" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                      <table className="table font-sans" style={{ margin: 0 }}>
                        <thead style={{ backgroundColor: '#F8FAFC' }}>
                          <tr>
                            <th style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Student Name</th>
                            <th style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>USN</th>
                            <th style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Status Transition</th>
                            <th style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Sanctioned Reason</th>
                            <th style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Corrected By</th>
                            <th style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessionDetail.corrections.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                                No attendance corrections have been recorded for this session.
                              </td>
                            </tr>
                          ) : (
                            sessionDetail.corrections.map((c) => (
                              <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.85rem' }}>{c.studentName}</td>
                                <td style={{ fontSize: '0.825rem', fontFamily: 'monospace', color: '#475569' }}>{c.usn}</td>
                                <td>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700 }}>
                                    <span style={{ color: c.previousStatus === 'Present' ? '#047857' : c.previousStatus === 'Absent' ? '#DC2626' : '#D97706', textDecoration: 'line-through' }}>
                                      {c.previousStatus}
                                    </span>
                                    <span>→</span>
                                    <span style={{ color: c.newStatus === 'Present' ? '#047857' : c.newStatus === 'Absent' ? '#DC2626' : '#D97706' }}>
                                      {c.newStatus}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '240px' }}>
                                  {c.correctionReason}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: '#64748B' }}>{c.correctedBy}</td>
                                <td style={{ fontSize: '0.78rem', color: '#64748B', fontFamily: 'monospace' }}>
                                  {new Date(c.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                display: 'flex',
                justifyContent: 'flex-end',
                borderBottomLeftRadius: '12px',
                borderBottomRightRadius: '12px'
              }}
            >
              <button
                type="button"
                className="btn btn-secondary font-sans"
                onClick={handleCloseSessionModal}
                disabled={isSubmittingCorrection}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </FacultyAppShell>
  );
};

export default FacultyAttendancePage;
