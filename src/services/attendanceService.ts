import { supabase } from '../lib/supabase';
import type { AttendanceSummary, AttendanceHistoryItem, AttendanceSubject, AttendanceTrend } from '../data/attendance';
import { getEligibleStudentRoster, resolveSubjectOwnershipAndCohort } from './studentRosterService';

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
  isUsnConflict?: boolean;
  conflictDetails?: string;
}

/**
 * Fetches real active students belonging to the specified department or enrolled in the given course for attendance marking.
 * Enforces ACTIVE account status, canonical deduplication, USN normalization, and conflict flagging.
 * Prohibits silent department-wide fallback when a specific course enrollment roster is missing.
 */
export const getDepartmentStudentsForAttendance = async (
  departmentId?: string,
  courseId?: string,
  section?: string | null,
  semester?: number | null
): Promise<DepartmentStudent[]> => {
  try {
    // If a course/subject is requested, use the authoritative student roster resolver
    // which derives student eligibility from the subject's academic allocation and owning department,
    // rather than restricting the roster to the faculty member's institutional department.
    if (courseId && courseId.trim() !== '') {
      return await getEligibleStudentRoster({
        courseCode: courseId,
        semester,
        section,
        departmentId
      });
    }

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

    let students: any[] = [];

    if (targetDeptId) {
      // General department directory query ONLY when no specific course scope is requested
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, usn_or_employee_id, department_id')
        .eq('role', 'STUDENT')
        .eq('department_id', targetDeptId)
        .eq('account_status', 'ACTIVE')
        .order('full_name', { ascending: true });

      if (error) {
        console.error('Error fetching department students for attendance:', error);
        return [];
      }
      if (data) students = data;
    } else {
      return [];
    }

    if (students.length === 0) return [];

    // Canonical deduplication and USN conflict flagging:
    // 1. Deduplicate repeated references to the same UUID
    const seenIds = new Set<string>();
    const uniqueByUuid: any[] = [];
    for (const s of students) {
      if (!s || !s.id || seenIds.has(s.id)) continue;
      seenIds.add(s.id);
      uniqueByUuid.push(s);
    }

    // 2. Map normalized USNs to set of distinct UUIDs claiming that USN
    const usnToIds = new Map<string, Set<string>>();
    for (const s of uniqueByUuid) {
      const rawUsn = s.usn_or_employee_id || '';
      const normUsn = rawUsn.trim().toUpperCase();
      if (normUsn && normUsn !== 'N/A' && normUsn !== 'NOT RECORDED') {
        const set = usnToIds.get(normUsn) || new Set<string>();
        set.add(s.id);
        usnToIds.set(normUsn, set);
      }
    }

    // 3. Flag conflicts for distinct UUIDs sharing the same USN without merging or discarding them
    const deduplicatedStudents = uniqueByUuid.map((s) => {
      const rawUsn = s.usn_or_employee_id || '';
      const normUsn = rawUsn.trim().toUpperCase();
      const sharingIds = (normUsn && normUsn !== 'N/A' && normUsn !== 'NOT RECORDED')
        ? usnToIds.get(normUsn)
        : undefined;

      const isConflict = Boolean(sharingIds && sharingIds.size > 1);
      return {
        ...s,
        usn_or_employee_id: normUsn || s.usn_or_employee_id || 'N/A',
        isUsnConflict: isConflict,
        conflictDetails: isConflict
          ? `Identity conflict: Normalized USN "${normUsn}" is shared by ${sharingIds!.size} distinct student accounts. Records kept separate to preserve audit history.`
          : undefined
      };
    });

    // Also fetch extended student_profiles to get real semester if present
    const studentIds = deduplicatedStudents.map((s: any) => s.id);
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

    return deduplicatedStudents.map((s: any) => {
      const ext = detailsMap.get(s.id);
      return {
        id: s.id,
        name: s.full_name || 'Student',
        usn: s.usn_or_employee_id || 'N/A',
        semester: ext?.semester ?? null,
        section: null,
        departmentId: s.department_id,
        isUsnConflict: s.isUsnConflict,
        conflictDetails: s.conflictDetails
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
        session: `${session.start_time}${session.end_time ? ' - ' + session.end_time : ''}`,
        isCorrected: rec.is_corrected ?? false,
        correctionReason: rec.correction_reason ?? null
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

export interface AttendanceVerificationResult {
  id: string;
  courseId: string;
  sessionDate: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  actualRecordCount: number;
  actualPresentCount: number;
  actualAbsentCount: number;
  actualLateCount: number;
  isRecordsVerified: boolean;
  discrepancyDetails?: string;
}

/**
 * Deep verification of a saved session:
 * 1. Confirms the attendance_sessions header row exists and captures server-side aggregates.
 * 2. Confirms that matching attendance_records rows exist for this session.
 * 3. Verifies that the individual record count and status breakdown match the submitted counts.
 * 4. Flags any integrity mismatch or missing records as an error.
 */
export const verifySavedAttendanceSession = async (
  sessionId: string,
  expectedCounts?: { total: number; present: number; absent: number; late: number },
  timeoutMs: number = 8000
): Promise<AttendanceVerificationResult> => {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Saved session verification timed out.')), timeoutMs);
  });

  const verificationExecution = async (): Promise<AttendanceVerificationResult> => {
    // 1. Fetch session header
    const { data: sessionData, error: sessionErr } = await (supabase as any)
      .from('attendance_sessions')
      .select('id, course_id, session_date, total_students, present_count, absent_count, late_count')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr || !sessionData) {
      throw new Error(`Saved session verification failed: ${sessionErr?.message || 'Session not found in database.'}`);
    }

    // 2. Fetch actual attendance_records rows for this session to verify physical persistence
    const { data: recordsData, error: recordsErr } = await (supabase as any)
      .from('attendance_records')
      .select('id, status')
      .eq('session_id', sessionId);

    if (recordsErr) {
      throw new Error(`Failed to verify attendance records: ${recordsErr.message}`);
    }

    const actualRecords = recordsData || [];
    let actPresent = 0;
    let actAbsent = 0;
    let actLate = 0;

    for (const r of actualRecords) {
      if (r.status === 'Present') actPresent++;
      else if (r.status === 'Absent') actAbsent++;
      else if (r.status === 'Late') actLate++;
    }

    const actualCount = actualRecords.length;

    // 3. Compare actual records count with session header and expected counts
    let isRecordsVerified = true;
    const discrepancies: string[] = [];

    if (actualCount !== sessionData.total_students) {
      isRecordsVerified = false;
      discrepancies.push(`Header records ${sessionData.total_students} students, but only ${actualCount} records exist in attendance_records.`);
    }

    if (actPresent !== sessionData.present_count || actAbsent !== sessionData.absent_count || actLate !== sessionData.late_count) {
      isRecordsVerified = false;
      discrepancies.push(`Record status counts (P:${actPresent}, A:${actAbsent}, L:${actLate}) differ from session counts (P:${sessionData.present_count}, A:${sessionData.absent_count}, L:${sessionData.late_count}).`);
    }

    if (expectedCounts) {
      if (actualCount !== expectedCounts.total) {
        isRecordsVerified = false;
        discrepancies.push(`Submitted ${expectedCounts.total} students, but verified ${actualCount} records in database.`);
      }
      if (actPresent !== expectedCounts.present || actAbsent !== expectedCounts.absent || actLate !== expectedCounts.late) {
        isRecordsVerified = false;
        discrepancies.push(`Submitted status counts (P:${expectedCounts.present}, A:${expectedCounts.absent}, L:${expectedCounts.late}) differ from verified records (P:${actPresent}, A:${actAbsent}, L:${actLate}).`);
      }
    }

    if (!isRecordsVerified) {
      const details = discrepancies.join(' ');
      throw new Error(`Database integrity verification failed: ${details}`);
    }

    return {
      id: sessionData.id,
      courseId: sessionData.course_id,
      sessionDate: sessionData.session_date,
      totalStudents: sessionData.total_students,
      presentCount: sessionData.present_count,
      absentCount: sessionData.absent_count,
      lateCount: sessionData.late_count,
      actualRecordCount: actualCount,
      actualPresentCount: actPresent,
      actualAbsentCount: actAbsent,
      actualLateCount: actLate,
      isRecordsVerified: true
    };
  };

  try {
    return await Promise.race([
      verificationExecution().then(res => {
        clearTimeout(timeoutId);
        return res;
      }),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Checks if a session with matching course, date, time slot, and section already exists in the database.
 * Used for disambiguating network dropouts / uncertain transaction states.
 */
export const checkExistingSessionIdentity = async (
  courseCode: string,
  sessionDate: string,
  startTime: string,
  section?: string | null,
  timeoutMs: number = 6000
): Promise<AttendanceSessionLog | null> => {
  let query = (supabase as any)
    .from('attendance_sessions')
    .select('*')
    .eq('course_id', courseCode.trim())
    .eq('session_date', sessionDate)
    .eq('start_time', startTime.trim());

  if (section && section.trim() !== '') {
    query = query.eq('section', section.trim());
  }

  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Existing session lookup timed out.')), timeoutMs);
  });

  try {
    const { data, error } = await Promise.race([
      query.maybeSingle().then((res: any) => {
        clearTimeout(timeoutId);
        return res;
      }),
      timeoutPromise
    ]);

    if (error || !data) return null;

    return {
      id: data.id,
      date: data.session_date,
      timeSlot: `${data.start_time}${data.end_time ? ' - ' + data.end_time : ''}`,
      courseCode: data.course_id,
      courseName: data.course_name,
      section: data.section || null,
      semester: data.semester || null,
      presentCount: data.present_count || 0,
      absentCount: data.absent_count || 0,
      lateCount: data.late_count || 0,
      totalStudents: data.total_students || 0,
      markedBy: 'Faculty',
      createdAt: data.created_at
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
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
  semester?: number | null,
  cachedProfile?: { id?: string; department_id?: string | null; full_name?: string | null; role?: string } | null,
  timeoutMs: number = 15000
): Promise<AttendanceSessionLog> => {
  // Use caller-provided profile or fetch user if missing
  let profile = cachedProfile;
  if (!profile || !profile.id) {
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) throw new Error("Authenticated session required.");

    const { data: fetchedProfile } = await (supabase as any)
      .from('profiles')
      .select('id, department_id, full_name, role')
      .eq('id', user.id)
      .single();

    profile = fetchedProfile;
  }

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

  // Resolve subject-owning department if cross-department teaching
  let sessionDeptId = profile.department_id || null;
  try {
    const meta = await resolveSubjectOwnershipAndCohort(courseCode, section, semester);
    if (meta.departmentId) {
      sessionDeptId = meta.departmentId;
    }
  } catch (err: any) {
    console.warn('[markAttendanceSession] resolveSubjectOwnership warning:', err?.message);
  }

  // Atomic PostgreSQL RPC function execution with timeout race
  const rpcCall = (supabase as any).rpc(
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
      p_department_id: sessionDeptId
    }
  );

  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutErr: any = new Error(`Request timed out after ${timeoutMs / 1000} seconds. Attendance persistence is in an uncertain state.`);
      timeoutErr.isTimeout = true;
      reject(timeoutErr);
    }, timeoutMs);
  });

  let rpcResult: any;
  let rpcError: any;

  try {
    const res: any = await Promise.race([
      rpcCall.then((r: any) => {
        clearTimeout(timeoutId);
        return r;
      }),
      timeoutPromise
    ]);
    rpcResult = res.data;
    rpcError = res.error;
  } finally {
    clearTimeout(timeoutId);
  }

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

export interface AttendanceCorrectionResult {
  recordId: string;
  sessionId: string;
  studentId: string;
  previousStatus: 'Present' | 'Absent' | 'Late';
  newStatus: 'Present' | 'Absent' | 'Late';
  presentCount: number;
  absentCount: number;
  lateCount: number;
  totalStudents: number;
  correctedAt: string;
  isIdempotent?: boolean;
}

export interface SessionRosterStudent {
  recordId: string;
  studentId: string;
  studentName: string;
  usn: string;
  status: 'Present' | 'Absent' | 'Late';
  remarks?: string | null;
  isCorrected: boolean;
  correctionReason?: string | null;
  updatedAt?: string | null;
}

export interface AttendanceCorrectionLogEntry {
  id: string;
  recordId: string;
  studentId: string;
  studentName: string;
  usn: string;
  previousStatus: 'Present' | 'Absent' | 'Late';
  newStatus: 'Present' | 'Absent' | 'Late';
  correctedBy: string;
  correctionReason: string;
  createdAt: string;
}

export interface SessionAttendanceDetailPayload {
  session: AttendanceSessionLog;
  roster: SessionRosterStudent[];
  corrections: AttendanceCorrectionLogEntry[];
}

/**
 * Executes an atomic correction of a student's attendance record using the PostgreSQL RPC function.
 * Recalculates parent session counters and inserts an immutable audit log entry.
 */
export const correctStudentAttendance = async (
  recordId: string,
  newStatus: 'Present' | 'Absent' | 'Late',
  reason: string
): Promise<AttendanceCorrectionResult> => {
  const cleanReason = (reason || '').trim();
  if (cleanReason.length < 5) {
    throw new Error('A correction reason of at least 5 characters is required.');
  }

  const { data, error } = await (supabase as any).rpc('correct_attendance_record_atomic', {
    p_record_id: recordId,
    p_new_status: newStatus,
    p_reason: cleanReason
  });

  if (error) {
    console.error('RPC correct_attendance_record_atomic failed:', error);
    throw new Error(error.message || 'Failed to correct attendance record.');
  }

  if (!data) {
    throw new Error('No data returned from attendance correction.');
  }

  // Notifications are handled server-authoritatively by database triggers trg_notify_on_attendance_correction / trg_notify_on_attendance_status_update
  if (!data.is_idempotent && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('notifications_updated'));
  }

  return {
    recordId: data.record_id,
    sessionId: data.session_id,
    studentId: data.student_id,
    previousStatus: data.previous_status,
    newStatus: data.new_status,
    presentCount: data.present_count,
    absentCount: data.absent_count,
    lateCount: data.late_count,
    totalStudents: data.total_students,
    correctedAt: data.corrected_at,
    isIdempotent: data.is_idempotent
  };
};

/**
 * Fetches the student roster and historical corrections for a specific attendance session.
 */
export const getSessionAttendanceDetails = async (
  sessionId: string
): Promise<SessionAttendanceDetailPayload> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Authenticated session required.');

  // 1. Fetch session header
  const { data: sessionData, error: sessionErr } = await (supabase as any)
    .from('attendance_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionErr || !sessionData) {
    throw new Error(`Attendance session not found: ${sessionErr?.message || 'Invalid session ID'}`);
  }

  // 2. Fetch session creator profile
  let markedBy = 'Faculty';
  if (sessionData.faculty_id) {
    const { data: creatorProf } = await (supabase as any)
      .from('profiles')
      .select('full_name')
      .eq('id', sessionData.faculty_id)
      .maybeSingle();
    if (creatorProf?.full_name) markedBy = creatorProf.full_name;
  }

  const sessionLog: AttendanceSessionLog = {
    id: sessionData.id,
    date: sessionData.session_date,
    timeSlot: `${sessionData.start_time}${sessionData.end_time ? ' - ' + sessionData.end_time : ''}`,
    courseCode: sessionData.course_id,
    courseName: sessionData.course_name,
    section: sessionData.section || null,
    semester: sessionData.semester || null,
    presentCount: sessionData.present_count || 0,
    absentCount: sessionData.absent_count || 0,
    lateCount: sessionData.late_count || 0,
    totalStudents: sessionData.total_students || 0,
    markedBy,
    createdAt: sessionData.created_at
  };

  // 3. Fetch attendance records for this session
  const { data: records, error: recErr } = await (supabase as any)
    .from('attendance_records')
    .select('*')
    .eq('session_id', sessionId);

  if (recErr) {
    throw new Error(`Failed to load attendance records: ${recErr.message}`);
  }

  // 4. Fetch profiles for students
  const studentIds = (records || []).map((r: any) => r.student_id).filter(Boolean);
  const studentProfileMap = new Map<string, { name: string; usn: string }>();

  if (studentIds.length > 0) {
    const { data: profiles } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, usn_or_employee_id')
      .in('id', studentIds);

    if (profiles) {
      profiles.forEach((p: any) => {
        studentProfileMap.set(p.id, {
          name: p.full_name || 'Student',
          usn: p.usn_or_employee_id || 'N/A'
        });
      });
    }
  }

  const roster: SessionRosterStudent[] = (records || []).map((r: any) => {
    const p = studentProfileMap.get(r.student_id);
    return {
      recordId: r.id,
      studentId: r.student_id,
      studentName: p?.name || 'Student',
      usn: p?.usn || 'N/A',
      status: r.status,
      remarks: r.remarks || null,
      isCorrected: r.is_corrected ?? false,
      correctionReason: r.correction_reason ?? null,
      updatedAt: r.updated_at ?? null
    };
  });

  // Sort roster alphabetically by name
  roster.sort((a, b) => a.studentName.localeCompare(b.studentName));

  // 5. Fetch correction history from attendance_corrections
  const { data: corrData } = await (supabase as any)
    .from('attendance_corrections')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  let corrections: AttendanceCorrectionLogEntry[] = [];

  if (corrData && corrData.length > 0) {
    const correctorIds = Array.from(new Set(corrData.map((c: any) => c.corrected_by))).filter(Boolean);
    const correctorMap = new Map<string, string>();

    if (correctorIds.length > 0) {
      const { data: profs } = await (supabase as any)
        .from('profiles')
        .select('id, full_name')
        .in('id', correctorIds);

      if (profs) {
        profs.forEach((p: any) => correctorMap.set(p.id, p.full_name || 'Faculty'));
      }
    }

    corrections = corrData.map((c: any) => {
      const sp = studentProfileMap.get(c.student_id);
      return {
        id: c.id,
        recordId: c.record_id,
        studentId: c.student_id,
        studentName: sp?.name || 'Student',
        usn: sp?.usn || 'N/A',
        previousStatus: c.previous_status,
        newStatus: c.new_status,
        correctedBy: correctorMap.get(c.corrected_by) || 'Faculty',
        correctionReason: c.correction_reason,
        createdAt: c.created_at
      };
    });
  }

  return {
    session: sessionLog,
    roster,
    corrections
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
