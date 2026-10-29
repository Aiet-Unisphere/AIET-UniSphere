import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  CalendarCheck, 
  ClipboardList, 
  Award, 
  Mail, 
  Phone, 
  GraduationCap, 
  User as UserIcon, 
  CheckCircle2, 
  AlertTriangle, 
  BookOpen, 
  Calendar
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { supabase } from '../../lib/supabase';
import { getStudentFullProfile } from '../../services/studentService';
import { getUserAvatarSignedUrl } from '../../services/avatarService';
import { getStudentEnrollments, type CourseEnrollment } from '../../services/courseEnrollmentService';
import { StatCard } from '../../components/StatCard';
import { useAuth } from '../../app/context/AuthContext';

interface StudentDetailedProfile {
  id: string;
  name: string;
  usn: string;
  email: string;
  phone: string | null;
  department: string;
  departmentId: string | null;
  semester: number | null;
  academicYear: string | null;
  cgpa: number | null;
  avatarStoragePath: string | null;
  avatarUrl: string | null;
  academicStatus: 'Good Standing' | 'Academic Warning' | 'At Risk';
}

interface CoursePerformanceRow {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number | null;
  attendanceRate: number | null;
  assignmentCompletion: string | null;
  assessmentAverage: number | null;
}

export const FacultyStudentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile: callerProfile } = useAuth();

  const [student, setStudent] = useState<StudentDetailedProfile | null>(null);
  const [courses, setCourses] = useState<CoursePerformanceRow[]>([]);
  const [overallAttendance, setOverallAttendance] = useState<number | null>(null);
  const [assignmentsCompleted, setAssignmentsCompleted] = useState<number | null>(null);
  const [assignmentsTotal, setAssignmentsTotal] = useState<number | null>(null);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadStudentData = async () => {
      if (!id) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setUnauthorized(false);
      setNotFound(false);
      setErrorMessage(null);

      try {
        // 1. Fetch Student Core & Extended Profile from Supabase
        const fullProf = await getStudentFullProfile(id);
        if (!fullProf || !fullProf.profile) {
          if (isMounted) {
            setNotFound(true);
            setIsLoading(false);
          }
          return;
        }

        const prof = fullProf.profile;
        const sp = fullProf.studentProfile;

        // 2. Department-level Authorization Verification for Faculty
        if (callerProfile?.role === 'FACULTY') {
          if (callerProfile.department_id && prof.department_id && callerProfile.department_id !== prof.department_id) {
            if (isMounted) {
              setUnauthorized(true);
              setIsLoading(false);
            }
            return;
          }
        }

        // 3. Resolve Avatar Photo
        const avatarPath = sp?.avatar_storage_path || prof.avatar_url;
        if (avatarPath) {
          getUserAvatarSignedUrl(avatarPath).then((url) => {
            if (isMounted && url) setAvatarSignedUrl(url);
          }).catch((e) => console.warn('Could not load avatar signed URL:', e));
        }

        // 4. Fetch Overview Analytics from student_analytics_view (RLS enforces faculty department boundary)
        const { data: analyticsData } = await (supabase as any)
          .from('student_analytics_view')
          .select('attendance_percentage, total_assignments, submitted_assignments, total_sessions')
          .eq('student_id', prof.id)
          .maybeSingle();

        let attPct: number | null = null;
        if (analyticsData && analyticsData.total_sessions > 0) {
          attPct = Number(analyticsData.attendance_percentage);
        }

        let asgnDone: number | null = null;
        let asgnTotal: number | null = null;
        if (analyticsData && analyticsData.total_assignments > 0) {
          asgnDone = Number(analyticsData.submitted_assignments || 0);
          asgnTotal = Number(analyticsData.total_assignments || 0);
        }

        if (isMounted) {
          setOverallAttendance(attPct);
          setAssignmentsCompleted(asgnDone);
          setAssignmentsTotal(asgnTotal);
        }

        // 5. Determine Academic Standing based on CGPA and Attendance
        const studentCgpa = sp?.cgpa != null ? Number(sp.cgpa) : null;
        let standing: 'Good Standing' | 'Academic Warning' | 'At Risk' = 'Good Standing';
        if (attPct != null && attPct < 65) {
          standing = 'At Risk';
        } else if (attPct != null && attPct < 75) {
          standing = 'Academic Warning';
        } else if (studentCgpa != null && studentCgpa < 5.0) {
          standing = 'At Risk';
        } else if (studentCgpa != null && studentCgpa < 6.5) {
          standing = 'Academic Warning';
        }

        const deptName = prof.department?.name || 'Department not assigned';

        const detailed: StudentDetailedProfile = {
          id: prof.id,
          name: prof.full_name || prof.email.split('@')[0],
          usn: prof.usn_or_employee_id || 'N/A',
          email: prof.email,
          phone: sp?.phone || null,
          department: deptName,
          departmentId: prof.department_id || null,
          semester: sp?.semester != null ? Number(sp.semester) : null,
          academicYear: sp?.academic_year || null,
          cgpa: studentCgpa,
          avatarStoragePath: sp?.avatar_storage_path || null,
          avatarUrl: prof.avatar_url || null,
          academicStatus: standing
        };

        if (isMounted) {
          setStudent(detailed);
        }

        // 6. Fetch Student's Course Enrollments
        const enrollments: CourseEnrollment[] = await getStudentEnrollments(prof.id);

        if (!enrollments || enrollments.length === 0) {
          if (isMounted) {
            setCourses([]);
            setIsLoading(false);
          }
          return;
        }

        const courseIds = enrollments.map((e) => e.course_id);

        // 7. Parallel fetch Course Attendance, Assignments, and Assessment Attempts for this student
        const [attSessionsRes, attRecordsRes, assignmentsRes, submissionsRes, assessmentsRes, attemptsRes] = await Promise.all([
          // Attendance Sessions for student's courses
          (supabase as any)
            .from('attendance_sessions')
            .select('id, course_id')
            .in('course_id', courseIds),
          // Student's Attendance Records
          (supabase as any)
            .from('attendance_records')
            .select('session_id, status')
            .eq('student_id', prof.id),
          // Assignments for student's courses
          (supabase as any)
            .from('assignments')
            .select('id, course_id')
            .in('course_id', courseIds),
          // Student's Submissions
          (supabase as any)
            .from('assignment_submissions')
            .select('assignment_id, status')
            .eq('student_id', prof.id),
          // Assessments for student's courses
          (supabase as any)
            .from('assessments')
            .select('id, course_id')
            .in('course_id', courseIds),
          // Student's Assessment Attempts
          (supabase as any)
            .from('assessment_attempts')
            .select('assessment_id, percentage, status')
            .eq('student_id', prof.id)
            .in('status', ['Submitted', 'Graded'])
        ]);

        // Map Sessions to Courses
        const sessionsByCourse = new Map<string, string[]>();
        (attSessionsRes.data || []).forEach((s: any) => {
          const list = sessionsByCourse.get(s.course_id) || [];
          list.push(s.id);
          sessionsByCourse.set(s.course_id, list);
        });

        const studentAttendedSessionIds = new Set<string>();
        (attRecordsRes.data || []).forEach((r: any) => {
          if (r.status === 'Present' || r.status === 'Late') {
            studentAttendedSessionIds.add(r.session_id);
          }
        });

        // Map Assignments to Courses
        const assignmentsByCourse = new Map<string, string[]>();
        (assignmentsRes.data || []).forEach((a: any) => {
          const list = assignmentsByCourse.get(a.course_id) || [];
          list.push(a.id);
          assignmentsByCourse.set(a.course_id, list);
        });

        const submittedAssignmentIds = new Set<string>();
        (submissionsRes.data || []).forEach((sub: any) => {
          submittedAssignmentIds.add(sub.assignment_id);
        });

        // Map Assessments to Courses
        const assessmentsByCourse = new Map<string, string[]>();
        (assessmentsRes.data || []).forEach((asmt: any) => {
          const list = assessmentsByCourse.get(asmt.course_id) || [];
          list.push(asmt.id);
          assessmentsByCourse.set(asmt.course_id, list);
        });

        const attemptScoresByAssessment = new Map<string, number>();
        (attemptsRes.data || []).forEach((att: any) => {
          if (att.percentage != null) {
            attemptScoresByAssessment.set(att.assessment_id, Number(att.percentage));
          }
        });

        // Compute Course-Level Performance
        const coursePerfList: CoursePerformanceRow[] = enrollments.map((enr) => {
          // Attendance Rate
          const totalSessions = sessionsByCourse.get(enr.course_id) || [];
          let courseAttRate: number | null = null;
          if (totalSessions.length > 0) {
            let presentCount = 0;
            totalSessions.forEach((sId) => {
              if (studentAttendedSessionIds.has(sId)) presentCount++;
            });
            courseAttRate = Math.round((presentCount / totalSessions.length) * 100);
          }

          // Assignment Completion
          const courseAssignments = assignmentsByCourse.get(enr.course_id) || [];
          let asgnRatioStr: string | null = null;
          if (courseAssignments.length > 0) {
            let done = 0;
            courseAssignments.forEach((aId) => {
              if (submittedAssignmentIds.has(aId)) done++;
            });
            asgnRatioStr = `${done} / ${courseAssignments.length} (${Math.round((done / courseAssignments.length) * 100)}%)`;
          }

          // Assessment Average
          const courseAssessments = assessmentsByCourse.get(enr.course_id) || [];
          let asmtAvg: number | null = null;
          if (courseAssessments.length > 0) {
            const scores: number[] = [];
            courseAssessments.forEach((aId) => {
              const sc = attemptScoresByAssessment.get(aId);
              if (sc != null) scores.push(sc);
            });
            if (scores.length > 0) {
              const sum = scores.reduce((acc, curr) => acc + curr, 0);
              asmtAvg = Math.round(sum / scores.length);
            }
          }

          return {
            courseId: enr.course_id,
            courseCode: enr.course_code || 'N/A',
            courseName: enr.course_name,
            credits: enr.credits ?? null,
            attendanceRate: courseAttRate,
            assignmentCompletion: asgnRatioStr,
            assessmentAverage: asmtAvg
          };
        });

        if (isMounted) {
          setCourses(coursePerfList);
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('Error fetching student academic profile details:', err);
        if (isMounted) {
          setErrorMessage(err?.message || 'Unable to load student academic profile.');
          setIsLoading(false);
        }
      }
    };

    loadStudentData();

    return () => {
      isMounted = false;
    };
  }, [id, callerProfile?.department_id, callerProfile?.role]);

  // Loading State
  if (isLoading) {
    return (
      <FacultyAppShell>
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
          <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
          Loading student academic profile...
        </div>
      </FacultyAppShell>
    );
  }

  // Unauthorized State
  if (unauthorized) {
    return (
      <FacultyAppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', maxWidth: '600px', margin: '2rem auto' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#FEE2E2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem auto'
          }}>
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
            Access Restricted
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            You are only authorized to view academic profiles for students in your assigned department.
          </p>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => navigate('/faculty/students')}
          >
            <ArrowLeft size={16} />
            <span>Return to Student Directory</span>
          </button>
        </div>
      </FacultyAppShell>
    );
  }

  // Not Found State
  if (notFound || !student) {
    return (
      <FacultyAppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', maxWidth: '600px', margin: '2rem auto' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#F1F5F9',
            color: '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem auto'
          }}>
            <UserIcon size={28} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
            Student Profile Not Found
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            The requested student record could not be found or has been deactivated.
          </p>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => navigate('/faculty/students')}
          >
            <ArrowLeft size={16} />
            <span>Back to Student Directory</span>
          </button>
        </div>
      </FacultyAppShell>
    );
  }

  // Semantic Status Badge Renderer
  const renderStandingBadge = (status: string) => {
    if (status === 'Good Standing') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.35rem 0.85rem',
          fontSize: '0.825rem',
          fontWeight: 700,
          borderRadius: '9999px',
          backgroundColor: '#ECFDF5',
          color: '#065F46',
          border: '1px solid #A7F3D0'
        }}>
          <CheckCircle2 size={14} style={{ color: '#059669' }} />
          Good Standing
        </span>
      );
    }
    if (status === 'Academic Warning') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.35rem 0.85rem',
          fontSize: '0.825rem',
          fontWeight: 700,
          borderRadius: '9999px',
          backgroundColor: '#FFFBEB',
          color: '#92400E',
          border: '1px solid #FDE68A'
        }}>
          <AlertTriangle size={14} style={{ color: '#D97706' }} />
          Academic Warning
        </span>
      );
    }
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.35rem 0.85rem',
        fontSize: '0.825rem',
        fontWeight: 700,
        borderRadius: '9999px',
        backgroundColor: '#FEF2F2',
        color: '#991B1B',
        border: '1px solid #FECACA'
      }}>
        <AlertTriangle size={14} style={{ color: '#DC2626' }} />
        At Risk
      </span>
    );
  };

  return (
    <FacultyAppShell>
      {/* Back Button & Header Area */}
      <div style={{ marginBottom: '1.75rem' }}>
        <button 
          type="button"
          className="btn btn-secondary" 
          style={{ 
            width: 'auto', 
            padding: '0.4rem 0.85rem', 
            fontSize: '0.8rem', 
            fontWeight: 600,
            marginBottom: '1rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            color: '#334155',
            cursor: 'pointer'
          }}
          onClick={() => navigate('/faculty/students')}
          title="Back to Student Directory"
        >
          <ArrowLeft size={14} />
          <span>Back to Student Directory</span>
        </button>

        {errorMessage && (
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            color: '#991B1B',
            fontSize: '0.85rem',
            marginBottom: '1rem'
          }}>
            {errorMessage}
          </div>
        )}

        {/* Student Profile Header Banner */}
        <div className="dashboard-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              {/* Profile Avatar */}
              <div style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: '#E2E8F0',
                border: '3px solid var(--brand-orange)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
              }}>
                {avatarSignedUrl ? (
                  <img 
                    src={avatarSignedUrl} 
                    alt={student.name} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                ) : (
                  <div style={{
                    fontWeight: 800,
                    fontSize: '1.65rem',
                    color: '#334155',
                    fontFamily: 'var(--font-display)'
                  }}>
                    {student.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Student Identification */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                  <span className="badge badge-graded" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    {student.department}
                  </span>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    color: '#475569', 
                    fontWeight: 600,
                    backgroundColor: '#F1F5F9',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px'
                  }}>
                    {student.semester ? `Semester ${student.semester}` : 'Semester Not provided'}
                  </span>
                </div>

                <h1 style={{ 
                  fontSize: '1.85rem', 
                  fontWeight: 800, 
                  fontFamily: 'var(--font-display)', 
                  color: 'var(--brand-black)',
                  margin: '0 0 0.25rem 0',
                  lineHeight: 1.2
                }}>
                  {student.name}
                </h1>

                <div style={{ fontSize: '0.85rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span>USN: <strong style={{ fontFamily: 'monospace', color: '#0F172A' }}>{student.usn}</strong></span>
                  <span>•</span>
                  <span>Academic Year: <strong style={{ color: '#0F172A' }}>{student.academicYear || 'Not assigned'}</strong></span>
                </div>
              </div>
            </div>

            {/* Academic Standing Badge */}
            <div>
              {renderStandingBadge(student.academicStatus)}
            </div>

          </div>
        </div>
      </div>

      {/* SECTION 3: ACADEMIC SUMMARY CARDS */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.5rem' }}>
        {/* Card 1: Overall CGPA */}
        <StatCard 
          title="Overall CGPA" 
          value={student.cgpa != null ? Number(student.cgpa).toFixed(2) : 'Not provided'} 
          icon={<Award size={22} />}
        />

        {/* Card 2: Overall Attendance */}
        <StatCard 
          title="Overall Attendance" 
          value={overallAttendance != null ? `${overallAttendance}%` : 'Not provided'} 
          icon={<CalendarCheck size={22} />}
        />

        {/* Card 3: Assignments Done */}
        <StatCard 
          title="Assignments Done" 
          value={assignmentsCompleted != null ? `${assignmentsCompleted} / ${assignmentsTotal || 0}` : 'Not tracked'} 
          icon={<ClipboardList size={22} />}
        />
      </div>

      {/* SECTION 4: STUDENT PROFILE INFORMATION CARD */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h3 className="panel-title" style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserIcon size={18} style={{ color: 'var(--brand-orange)' }} />
          <span>Student Profile Information</span>
        </h3>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
          gap: '1.25rem', 
          fontSize: '0.875rem' 
        }}>
          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Full Name
            </span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)', marginTop: '0.2rem', display: 'block' }}>
              {student.name}
            </span>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              USN
            </span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)', fontFamily: 'monospace', marginTop: '0.2rem', display: 'block' }}>
              {student.usn}
            </span>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Email Address
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
              <Mail size={14} style={{ color: '#64748B', flexShrink: 0 }} />
              <span style={{ fontWeight: 500, color: '#0F172A', wordBreak: 'break-all' }}>
                {student.email}
              </span>
            </div>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Phone
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
              <Phone size={14} style={{ color: '#64748B', flexShrink: 0 }} />
              <span style={{ fontWeight: 500, color: '#0F172A', fontFamily: student.phone ? 'monospace' : 'inherit' }}>
                {student.phone || 'Not provided'}
              </span>
            </div>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Department
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
              <GraduationCap size={14} style={{ color: '#64748B', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: '#0F172A' }}>
                {student.department}
              </span>
            </div>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Semester
            </span>
            <span style={{ fontWeight: 600, color: '#0F172A', marginTop: '0.2rem', display: 'block' }}>
              {student.semester ? `Semester ${student.semester}` : 'Not provided'}
            </span>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Academic Year
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
              <Calendar size={14} style={{ color: '#64748B', flexShrink: 0 }} />
              <span style={{ fontWeight: 500, color: '#0F172A' }}>
                {student.academicYear || 'Not assigned'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 5: ENROLLED COURSE PERFORMANCE */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
          <h3 className="panel-title" style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={18} style={{ color: 'var(--brand-blue)' }} />
            <span>Enrolled Course Performance</span>
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
            Academic progress and breakdown across currently enrolled courses.
          </p>
        </div>

        {courses.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748B' }}>
            <p style={{ fontSize: '0.9rem', margin: 0 }}>No active course enrollments found for this student.</p>
          </div>
        ) : (
          <div className="table-responsive" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table font-sans" style={{ margin: 0, width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <tr>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', width: '130px', padding: '0.85rem 1.25rem' }}>Course Code</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', minWidth: '220px', padding: '0.85rem 1.25rem' }}>Course Name</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', width: '150px', padding: '0.85rem 1rem' }}>Attendance Rate</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', width: '190px', padding: '0.85rem 1rem' }}>Assignment Completion</th>
                  <th style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', textAlign: 'center', width: '160px', padding: '0.85rem 1.25rem' }}>Assessment Average</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((cp) => (
                  <tr 
                    key={cp.courseId}
                    style={{ borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {/* Course Code */}
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      <span style={{ 
                        fontSize: '0.825rem', 
                        fontWeight: 600, 
                        fontFamily: 'monospace',
                        color: '#0F172A',
                        backgroundColor: '#F1F5F9',
                        padding: '0.2rem 0.45rem',
                        borderRadius: '4px'
                      }}>
                        {cp.courseCode}
                      </span>
                    </td>

                    {/* Course Name */}
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--brand-black)', fontSize: '0.875rem' }}>
                        {cp.courseName}
                      </div>
                      {cp.credits != null && (
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.1rem' }}>
                          {cp.credits} Credits
                        </div>
                      )}
                    </td>

                    {/* Attendance Rate */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      {cp.attendanceRate != null ? (
                        <span style={{ 
                          fontWeight: 700, 
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          color: cp.attendanceRate < 75 ? '#DC2626' : '#059669',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: cp.attendanceRate < 75 ? '#FEF2F2' : '#F0FDF4'
                        }}>
                          {cp.attendanceRate}%
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.775rem', color: '#94A3B8', fontStyle: 'italic' }}>
                          Not recorded
                        </span>
                      )}
                    </td>

                    {/* Assignment Completion */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      {cp.assignmentCompletion ? (
                        <span style={{ fontSize: '0.825rem', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                          {cp.assignmentCompletion}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.775rem', color: '#94A3B8', fontStyle: 'italic' }}>
                          No assignments
                        </span>
                      )}
                    </td>

                    {/* Assessment Average */}
                    <td style={{ padding: '0.85rem 1.25rem', textAlign: 'center' }}>
                      {cp.assessmentAverage != null ? (
                        <span style={{ 
                          fontSize: '0.85rem', 
                          fontWeight: 700, 
                          fontFamily: 'monospace',
                          color: cp.assessmentAverage < 50 ? '#DC2626' : '#0F172A'
                        }}>
                          {cp.assessmentAverage}%
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.775rem', color: '#94A3B8', fontStyle: 'italic' }}>
                          N/A
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </FacultyAppShell>
  );
};

export default FacultyStudentDetail;
