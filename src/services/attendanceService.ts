import { supabase } from '../lib/supabase';
import type { AttendanceSummary, AttendanceHistoryItem, AttendanceSubject, AttendanceTrend } from '../data/attendance';

export interface FacultyAttendanceRecord {
  studentId: string;
  studentName: string;
  usn: string;
  status: 'Present' | 'Absent' | 'Late';
  remarks?: string;
  currentAttendancePercent?: number | null;
}

export interface AttendanceSessionLog {
  id: string;
  date: string;
  timeSlot: string;
  courseCode: string;
  courseName: string;
  section?: string | null;
  semester?: number | null;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  totalStudents: number;
  markedBy: string;
  createdAt: string;
}

export interface DepartmentStudent {
  id: string;
  name: string;
  usn: string;
  semester?: number | null;
  section?: string | null;
  departmentId?: string;
}

/**
 * Fetches real active students belonging to the specified department for attendance marking.
 */
export const getDepartmentStudentsForAttendance = async (departmentId?: string): Promise<DepartmentStudent[]> => {
  try {
    let targetDeptId = departmentId;

    if (!targetDeptId) {
      const { data: { user } } = await (supabase as any).auth.getUser();
      if (!user) return [];

      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('department_id')
        .eq('id', user.id)
        .maybeSingle();

      targetDeptId = profile?.department_id;
    }

    if (!targetDeptId) return [];

    // Query profiles for students in the department
    const { data: students, error } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, usn_or_employee_id, department_id')
      .eq('role', 'STUDENT')
      .eq('department_id', targetDeptId)
      .order('full_name', { ascending: true });

    if (error || !students) {
      console.error('Error fetching department students for attendance:', error);
      return [];
    }

    // Also fetch extended student_profiles to get real semester if present
    const studentIds = students.map((s: any) => s.id);
    const detailsMap = new Map<string, { semester?: number | null }>();

    if (studentIds.length > 0) {
      const { data: extData } = await (supabase as any)
        .from('student_profiles')
        .select('profile_id, semester')
        .in('profile_id', studentIds);

      if (extData) {
        extData.forEach((sp: any) => {
          detailsMap.set(sp.profile_id, {
            semester: sp.semester ?? null
          });
        });
      }
    }

    return students.map((s: any) => {
      const ext = detailsMap.get(s.id);
      return {
        id: s.id,
        name: s.full_name || 'Student',
        usn: s.usn_or_employee_id || 'N/A',
        semester: ext?.semester ?? null,
        section: null,
        departmentId: s.department_id
      };
    });
  } catch (err) {
    console.error('Failed to get department students:', err);
    return [];
  }
};

/**
 * Fetches attendance summary calculated directly from real database records for the logged-in student.
 */
export const getAttendanceSummary = async (courseFilter?: string): Promise<AttendanceSummary> => {
  try {
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) {
      return {
        overallPercentage: 0,
        subjects: [],
        history: [],
        trend: [],
        counts: { totalConducted: 0, present: 0, late: 0, absent: 0 }
      };
    }

    // 1. Fetch student's attendance records
    const { data: records, error: rErr } = await (supabase as any)
      .from('attendance_records')
      .select('*')
      .eq('student_id', user.id);

    if (rErr || !records || records.length === 0) {
      return {
        overallPercentage: 0,
        subjects: [],
        history: [],
        trend: [],
        counts: { totalConducted: 0, present: 0, late: 0, absent: 0 }
      };
    }

    // 2. Fetch corresponding sessions
    const sessionIds = Array.from(new Set(records.map((r: any) => r.session_id))).filter(Boolean);
    const sessionMap = new Map<string, any>();
    const facultyMap = new Map<string, string>();

    if (sessionIds.length > 0) {
      const { data: sessions } = await (supabase as any)
        .from('attendance_sessions')
        .select('*')
        .in('id', sessionIds);

      if (sessions) {
        sessions.forEach((s: any) => sessionMap.set(s.id, s));

        const facultyIds = Array.from(new Set(sessions.map((s: any) => s.faculty_id))).filter(Boolean);
        if (facultyIds.length > 0) {
          const { data: profs } = await (supabase as any)
            .from('profiles')
            .select('id, full_name')
            .in('id', facultyIds);

          if (profs) {
            profs.forEach((p: any) => facultyMap.set(p.id, p.full_name || 'Faculty'));
          }
        }
      }
    }

    // Filter records if courseFilter is provided
    const filteredRecords = records.filter((rec: any) => {
      const session = sessionMap.get(rec.session_id);
      if (!session) return false;
      if (courseFilter && courseFilter !== 'ALL' && session.course_id !== courseFilter) {
        return false;
      }
      return true;
    });

    const subjectMap = new Map<string, {
      code: string;
      name: string;
      held: number;
      attended: number;
      present: number;
      late: number;
      absent: number;
    }>();

    const historyItems: AttendanceHistoryItem[] = [];
    const monthMap = new Map<string, {
      month: string;
      sortKey: string;
      conducted: number;
      present: number;
      late: number;
      absent: number;
    }>();

    let totalConducted = 0;
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;

    filteredRecords.forEach((rec: any) => {
      const session = sessionMap.get(rec.session_id);
      if (!session) return;

      const courseCode = session.course_id || 'GEN';
      const courseName = session.course_name || 'General Course';
      const isAttended = rec.status === 'Present' || rec.status === 'Late';
      const facultyName = facultyMap.get(session.faculty_id) || 'Faculty Instructor';

      totalConducted += 1;
      if (rec.status === 'Present') totalPresent += 1;
      else if (rec.status === 'Late') totalLate += 1;
      else if (rec.status === 'Absent') totalAbsent += 1;

      // Subject summary aggregation
      if (!subjectMap.has(courseCode)) {
        subjectMap.set(courseCode, {
          code: courseCode,
          name: courseName,
          held: 0,
          attended: 0,
          present: 0,
          late: 0,
          absent: 0
        });
      }
      const s = subjectMap.get(courseCode)!;
      s.held += 1;
      if (isAttended) s.attended += 1;
      if (rec.status === 'Present') s.present += 1;
      else if (rec.status === 'Late') s.late += 1;
      else if (rec.status === 'Absent') s.absent += 1;

      // History item
      historyItems.push({
        date: session.session_date,
        subject: courseName,
        code: courseCode,
        status: rec.status,
        faculty: facultyName,
        session: `${session.start_time}${session.end_time ? ' - ' + session.end_time : ''}`
      });

      // Trend by month
      const d = new Date(session.session_date);
      const monthLabel = d.toLocaleString('default', { month: 'short' });
      const yearVal = d.getFullYear();
      const sortKey = `${yearVal}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const monthKey = `${monthLabel} ${yearVal}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          month: monthLabel,
          sortKey,
          conducted: 0,
          present: 0,
          late: 0,
          absent: 0
        });
      }
      const m = monthMap.get(monthKey)!;
      m.conducted += 1;
      if (rec.status === 'Present') m.present += 1;
      else if (rec.status === 'Late') m.late += 1;
      else if (rec.status === 'Absent') m.absent += 1;
    });

    const subjects: AttendanceSubject[] = Array.from(subjectMap.values()).map(s => {
      const pct = s.held > 0 ? Math.round((s.attended / s.held) * 100) : 0;
      return {
        code: s.code,
        subject: s.name,
        held: s.held,
        attended: s.attended,
        percentage: pct,
        status: pct >= 85 ? 'Good' : pct >= 75 ? 'Monitor' : 'Critical'
      };
    });

    historyItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const overallPercentage = totalConducted > 0 ? Math.round(((totalPresent + totalLate) / totalConducted) * 100) : 0;

    const trend: AttendanceTrend[] = Array.from(monthMap.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(m => {
        const pct = m.conducted > 0 ? Math.round(((m.present + m.late) / m.conducted) * 100) : 0;
        return {
          month: m.month,
          percentage: pct,
          conducted: m.conducted,
          present: m.present,
          late: m.late,
          absent: m.absent
        };
      });

    return {
      overallPercentage,
      subjects,
      history: historyItems,
      trend,
      counts: {
        totalConducted,
        present: totalPresent,
        late: totalLate,
        absent: totalAbsent
      }
    };
  } catch (err) {
    console.error('Failed to compute student attendance summary:', err);
    return {
      overallPercentage: 0,
      subjects: [],
      history: [],
      trend: [],
      counts: { totalConducted: 0, present: 0, late: 0, absent: 0 }
    };
  }
};

/**
 * Fetches attendance session logs created by or accessible to faculty.
 */
export const getFacultyAttendanceLogs = async (): Promise<AttendanceSessionLog[]> => {
  try {
    const { data: { user }, error: authError } = await (supabase as any).auth.getUser();
    if (authError || !user) throw new Error('Authenticated faculty session required.');

    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('department_id, role, account_status')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || profile?.account_status !== 'ACTIVE') throw new Error('Active faculty profile required.');

    let sessionsQuery = (supabase as any)
      .from('attendance_sessions')
      .select('*')
      .order('created_at', { ascending: false });
    if (profile.role === 'FACULTY') sessionsQuery = sessionsQuery.eq('faculty_id', user.id);
    else if (profile.role === 'HOD') {
      if (!profile.department_id) throw new Error('HOD profile has no assigned department.');
      sessionsQuery = sessionsQuery.eq('department_id', profile.department_id);
    } else if (profile.role !== 'ADMIN') {
      throw new Error('Faculty, HOD, or Admin role required.');
    }
    const { data: sessions, error } = await sessionsQuery;

    if (error || !sessions) {
      throw new Error(`Unable to load attendance session logs: ${error?.message || 'No session data returned.'}`);
    }

    if (sessions.length === 0) return [];

    // Extract unique faculty IDs
    const facultyIds = Array.from(new Set(sessions.map((s: any) => s.faculty_id))).filter(Boolean);
    const facultyMap = new Map<string, string>();

    if (facultyIds.length > 0) {
      const { data: profs } = await (supabase as any)
        .from('profiles')
        .select('id, full_name')
        .in('id', facultyIds);

      if (profs) {
        profs.forEach((p: any) => facultyMap.set(p.id, p.full_name || 'Faculty'));
      }
    }

    return sessions.map((s: any) => ({
      id: s.id,
      date: s.session_date,
      timeSlot: `${s.start_time}${s.end_time ? ' - ' + s.end_time : ''}`,
      courseCode: s.course_id,
      courseName: s.course_name,
      section: s.section || null,
      semester: s.semester || null,
      presentCount: s.present_count || 0,
      absentCount: s.absent_count || 0,
      lateCount: s.late_count || 0,
      totalStudents: s.total_students || 0,
      markedBy: facultyMap.get(s.faculty_id) || 'Faculty',
      createdAt: s.created_at
    }));
  } catch (err) {
    console.error('Failed to query faculty attendance logs:', err);
    throw err;
  }
};

/**
 * Records an attendance session atomically using PostgreSQL RPC.
 * Rolls back automatically if any single record fails.
 */
export const markAttendanceSession = async (
  courseCode: string,
  courseName: string,
  date: string,
  sessionTime: string,
  records: FacultyAttendanceRecord[],
  section?: string | null,
  semester?: number | null
): Promise<AttendanceSessionLog> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('department_id, full_name, role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    throw new Error("User profile not found.");
  }

  if (profile.role === 'STUDENT') {
    throw new Error("Students are not authorized to create attendance sessions.");
  }

  if (!profile.department_id && profile.role !== 'ADMIN') {
    throw new Error("No active department assigned to your profile.");
  }

  const times = sessionTime.split(' - ');
  const startTime = times[0]?.trim() || '09:00 AM';
  const endTime = times[1]?.trim() || '10:00 AM';

  const payloadRecords = records.map(r => ({
    student_id: r.studentId,
    status: r.status,
    remarks: r.remarks || null
  }));

  // Atomic PostgreSQL RPC function execution
  const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
    'record_attendance_session_atomic',
    {
      p_course_id: courseCode.trim(),
      p_course_name: courseName.trim(),
      p_session_date: date,
      p_start_time: startTime,
      p_end_time: endTime,
      p_section: section && section.trim() !== '' ? section.trim() : null,
      p_semester: semester ?? null,
      p_remarks: null,
      p_records: payloadRecords,
      p_department_id: profile.department_id || null
    }
  );

  if (rpcError) {
    console.error('RPC record_attendance_session_atomic error:', rpcError);
    throw new Error(rpcError.message || "Failed to record attendance session atomically.");
  }

  if (!rpcResult) {
    throw new Error("No result returned from attendance session recording.");
  }

  return {
    id: rpcResult.id,
    date: rpcResult.session_date,
    timeSlot: `${rpcResult.start_time}${rpcResult.end_time ? ' - ' + rpcResult.end_time : ''}`,
    courseCode: rpcResult.course_id,
    courseName: rpcResult.course_name,
    section: rpcResult.section,
    semester: rpcResult.semester,
    presentCount: rpcResult.present_count,
    absentCount: rpcResult.absent_count,
    lateCount: rpcResult.late_count,
    totalStudents: rpcResult.total_students,
    markedBy: profile.full_name || 'Faculty',
    createdAt: rpcResult.created_at
  };
};

/**
 * Subscribes to Realtime postgres_changes on attendance_records for the current student.
 */
export const subscribeToStudentAttendance = (onUpdate: () => void): (() => void) => {
  try {
    const channel = (supabase as any)
      .channel('public:attendance_records_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      (supabase as any).removeChannel(channel);
    };
  } catch (err) {
    console.error('Failed to setup attendance realtime subscription:', err);
    return () => {};
  }
};
