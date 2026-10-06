import { supabase } from '../lib/supabase';
import type { Department } from '../types/database.types';

export const getActiveDepartments = async (): Promise<Department[]> => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name, code, status, created_at')
      .eq('status', 'ACTIVE')
      .order('name', { ascending: true });

    if (error || !data) {
      console.error('Error fetching active departments:', error);
      return [];
    }

    return data as Department[];
  } catch (err) {
    console.error('Failed to query active departments:', err);
    return [];
  }
};

export const getAllDepartments = async (): Promise<Department[]> => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name, code, status, created_at')
      .order('name', { ascending: true });

    if (error || !data) {
      console.error('Error fetching all departments:', error);
      return [];
    }

    return data as Department[];
  } catch (err) {
    console.error('Failed to query all departments:', err);
    return [];
  }
};

export const createDepartment = async (payload: { name: string; code: string; status?: 'ACTIVE' | 'INACTIVE' }): Promise<Department> => {
  const { data, error } = await (supabase as any)
    .from('departments')
    .insert({
      name: payload.name,
      code: payload.code.toUpperCase(),
      status: payload.status || 'ACTIVE'
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Department;
};

export const updateDepartment = async (id: string, payload: { name?: string; code?: string; status?: 'ACTIVE' | 'INACTIVE' }): Promise<Department> => {
  const updates: Record<string, any> = {};
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.code !== undefined) updates.code = payload.code.toUpperCase();
  if (payload.status !== undefined) updates.status = payload.status;

  const { data, error } = await (supabase as any)
    .from('departments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Department;
};

export interface DepartmentSummary extends Department {
  hodName: string;
  facultyCount: number;
  activeFacultyCount: number;
  studentCount: number;
  activeStudentCount: number;
}

export interface DepartmentDetailData extends DepartmentSummary {
  faculty: {
    id: string;
    name: string;
    email: string;
    designation: string;
    status: string;
    assignedCourseCount: number;
  }[];
  sections: { semester: number; section: string; studentCount: number }[];
}

export const getDepartmentSummaries = async (): Promise<DepartmentSummary[]> => {
  const { data: departments, error: departmentError } = await (supabase as any)
    .from('departments')
    .select('id, name, code, status, created_at')
    .order('name', { ascending: true });
  if (departmentError) throw new Error(`Unable to load departments: ${departmentError.message}`);

  return Promise.all((departments || []).map(async (department: Department) => {
    const countFor = async (role: 'STUDENT' | 'FACULTY', status?: string) => {
      let query = (supabase as any)
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', department.id)
        .eq('role', role);
      if (status) query = query.eq('account_status', status);
      const result = await query;
      if (result.error) throw new Error(`Unable to count ${role.toLowerCase()} profiles: ${result.error.message}`);
      return result.count || 0;
    };
    const [facultyCount, activeFacultyCount, studentCount, activeStudentCount, hodResult] = await Promise.all([
      countFor('FACULTY'),
      countFor('FACULTY', 'ACTIVE'),
      countFor('STUDENT'),
      countFor('STUDENT', 'ACTIVE'),
      (supabase as any).from('profiles').select('full_name').eq('department_id', department.id).eq('role', 'HOD').eq('account_status', 'ACTIVE').limit(1).maybeSingle(),
    ]);
    if (hodResult.error) throw new Error(`Unable to load department HOD: ${hodResult.error.message}`);
    return {
      ...department,
      hodName: hodResult.data?.full_name || 'Not assigned',
      facultyCount,
      activeFacultyCount,
      studentCount,
      activeStudentCount,
    };
  }));
};

export const getDepartmentDetailData = async (departmentId: string): Promise<DepartmentDetailData | null> => {
  const summaries = await getDepartmentSummaries();
  const department = summaries.find(item => item.id === departmentId || item.code?.toLowerCase() === departmentId.toLowerCase());
  if (!department) return null;

  const [facultyResult, enrollmentsResult] = await Promise.all([
    (supabase as any).from('profiles')
      .select('id, full_name, email, role, account_status')
      .eq('department_id', department.id)
      .in('role', ['FACULTY', 'HOD'])
      .order('full_name', { ascending: true }),
    (supabase as any).from('course_enrollments')
      .select('faculty_id, course_id, semester, section, student_id')
      .eq('department_id', department.id)
      .eq('status', 'Active'),
  ]);
  if (facultyResult.error) throw new Error(`Unable to load department faculty: ${facultyResult.error.message}`);
  if (enrollmentsResult.error) throw new Error(`Unable to load department enrollments: ${enrollmentsResult.error.message}`);

  const enrollments = enrollmentsResult.data || [];
  const coursesByFaculty = new Map<string, Set<string>>();
  const studentsBySection = new Map<string, Set<string>>();
  for (const enrollment of enrollments) {
    if (enrollment.faculty_id) {
      const courses = coursesByFaculty.get(enrollment.faculty_id) || new Set<string>();
      courses.add(enrollment.course_id);
      coursesByFaculty.set(enrollment.faculty_id, courses);
    }
    if (enrollment.semester != null && enrollment.section) {
      const key = `${enrollment.semester}:${enrollment.section}`;
      const students = studentsBySection.get(key) || new Set<string>();
      students.add(enrollment.student_id);
      studentsBySection.set(key, students);
    }
  }

  return {
    ...department,
    faculty: (facultyResult.data || []).map((member: any) => ({
      id: member.id,
      name: member.full_name || member.email,
      email: member.email,
      designation: member.designation || (member.role === 'HOD' ? 'Head of Department' : 'Faculty'),
      status: member.account_status,
      assignedCourseCount: coursesByFaculty.get(member.id)?.size || 0,
    })),
    sections: [...studentsBySection.entries()].map(([key, students]) => {
      const [semester, section] = key.split(':');
      return { semester: Number(semester), section, studentCount: students.size };
    }).sort((a, b) => a.semester - b.semester || a.section.localeCompare(b.section)),
  };
};

export interface DepartmentOverview {
  departmentName: string;
  departmentCode: string;
  hodName: string;
  academicYear: string;
  totalFaculty: number;
  activeFacultyCount: number;
  activeFacultyToday: number;
  totalStudents: number;
  activeStudents: number;
  activeCourses: number;
  overallAttendancePercent: number;
  averageCgpa: number | null;
  passRatePercent: number | null;
  assignmentCompletionPercent: number | null;
  academicAlertsCount: number;
  pendingReviewsCount: number;
}

export interface DepartmentAttendanceMetrics {
  overallAttendance: number;
  presentRate: number;
  absentRate: number;
  lateRate: number;
  semesterBreakdown: { semester: number; attendancePercent: number }[];
  courseAttendance: {
    courseId: string;
    courseCode: string;
    courseName: string;
    facultyName: string;
    studentCount: number;
    attendancePercent: number;
    status: 'Healthy' | 'Needs Attention' | 'Critical';
  }[];
  lowAttendanceStudents: {
    studentId: string;
    studentName: string;
    usn: string;
    semester: number;
    courseCode: string;
    attendancePercent: number;
  }[];
}

interface DepartmentScope {
  userId: string;
  role: string;
  departmentId: string | null;
  departmentName: string;
  departmentCode: string;
  hodName: string;
}

const getDepartmentScope = async (): Promise<DepartmentScope> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated HOD session required.');
  const { data: profile, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('role, department_id, full_name, account_status')
    .eq('id', user.id)
    .single();
  if (profileError || profile?.account_status !== 'ACTIVE' || !['HOD', 'ADMIN'].includes(profile.role)) {
    throw new Error('An active HOD or Admin account is required for department analytics.');
  }
  if (profile.role === 'HOD' && !profile.department_id) throw new Error('HOD account is not assigned to a department.');
  if (!profile.department_id) {
    return { userId: user.id, role: profile.role, departmentId: null, departmentName: 'Institution-wide', departmentCode: 'ALL', hodName: profile.full_name || 'Admin' };
  }
  const { data: department, error: departmentError } = await (supabase as any)
    .from('departments')
    .select('name, code')
    .eq('id', profile.department_id)
    .maybeSingle();
  if (departmentError || !department) throw new Error(`Unable to load department: ${departmentError?.message || 'Department not found.'}`);
  return {
    userId: user.id,
    role: profile.role,
    departmentId: profile.department_id,
    departmentName: department.name,
    departmentCode: department.code || '',
    hodName: profile.role === 'HOD' ? profile.full_name || 'HOD' : 'Not assigned',
  };
};

const departmentFilter = (query: any, departmentId: string | null, column = 'department_id') =>
  departmentId ? query.eq(column, departmentId) : query;

export const getDepartmentOverview = async (): Promise<DepartmentOverview> => {
  const scope = await getDepartmentScope();
  const countProfiles = async (role: string, activeOnly = false) => {
    let query = (supabase as any).from('profiles').select('id', { count: 'exact', head: true }).eq('role', role);
    query = departmentFilter(query, scope.departmentId);
    if (activeOnly) query = query.eq('account_status', 'ACTIVE');
    const { count, error } = await query;
    if (error) throw new Error(`Unable to count ${role.toLowerCase()} profiles: ${error.message}`);
    return count || 0;
  };

  let enrollmentQuery = (supabase as any).from('course_enrollments').select('course_id, student_id, academic_year').eq('status', 'Active');
  enrollmentQuery = departmentFilter(enrollmentQuery, scope.departmentId);
  let sessionQuery = (supabase as any).from('attendance_sessions').select('total_students, present_count, late_count').not('department_id', 'is', null);
  sessionQuery = departmentFilter(sessionQuery, scope.departmentId);
  let analyticsQuery = (supabase as any).from('student_analytics_view').select('student_id, attendance_percentage, total_sessions');
  if (scope.departmentId) analyticsQuery = analyticsQuery.eq('department_id', scope.departmentId);
  let assignmentsQuery = (supabase as any).from('assignments').select('id, course_id');
  assignmentsQuery = departmentFilter(assignmentsQuery, scope.departmentId);
  let resultsQuery = (supabase as any).from('results').select('grade_points, credits, status');
  resultsQuery = departmentFilter(resultsQuery, scope.departmentId);
  const today = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
  let timetableQuery = (supabase as any).from('timetable_entries').select('faculty_id').eq('day_of_week', today);
  timetableQuery = departmentFilter(timetableQuery, scope.departmentId);

  const [facultyCount, activeFacultyCount, studentCount, activeStudentCount, enrollmentResult, sessionsResult, analyticsResult, assignmentsResult, resultsResult, timetableResult] = await Promise.all([
    countProfiles('FACULTY'),
    countProfiles('FACULTY', true),
    countProfiles('STUDENT'),
    countProfiles('STUDENT', true),
    enrollmentQuery,
    sessionQuery,
    analyticsQuery,
    assignmentsQuery,
    resultsQuery,
    timetableQuery,
  ]);
  for (const result of [enrollmentResult, sessionsResult, analyticsResult, assignmentsResult, resultsResult, timetableResult]) {
    if (result.error) throw new Error(`Unable to load department analytics: ${result.error.message}`);
  }

  const enrollments = enrollmentResult.data || [];
  const courseCount = new Set(enrollments.map((row: any) => row.course_id)).size;
  const academicYear = enrollments.map((row: any) => row.academic_year).filter(Boolean).sort().at(-1) || 'Not set';
  const sessions = sessionsResult.data || [];
  const totalStudents = sessions.reduce((total: number, row: any) => total + Number(row.total_students || 0), 0);
  const presentStudents = sessions.reduce((total: number, row: any) => total + Number(row.present_count || 0) + Number(row.late_count || 0), 0);
  const overallAttendancePercent = totalStudents ? Math.round((presentStudents / totalStudents) * 100) : 0;
  const lowAttendanceCount = (analyticsResult.data || []).filter((row: any) => Number(row.attendance_percentage) < 75 && Number(row.total_sessions) > 0).length;
  const assignments = assignmentsResult.data || [];
  const assignmentIds = assignments.map((row: any) => row.id);
  let pendingSubmissionCount = 0;
  let assignmentCompletionPercent: number | null = null;
  if (assignmentIds.length) {
    const { data: submissions, error } = await (supabase as any)
      .from('assignment_submissions')
      .select('assignment_id, student_id, status')
      .in('assignment_id', assignmentIds)
      .in('status', ['Submitted', 'Graded']);
    if (error) throw new Error(`Unable to count pending assignment evaluations: ${error.message}`);
    pendingSubmissionCount = (submissions || []).filter((submission: any) => submission.status === 'Submitted').length;
    const enrollmentRows = enrollments || [];
    const expectedSubmissions = assignments.reduce((total: number, assignment: any) =>
      total + enrollmentRows.filter((enrollment: any) => enrollment.course_id === assignment.course_id).length, 0);
    const submittedPairs = new Set((submissions || []).map((submission: any) => `${submission.assignment_id}:${submission.student_id}`)).size;
    assignmentCompletionPercent = expectedSubmissions > 0 ? Math.round((submittedPairs / expectedSubmissions) * 100) : null;
  }
  let leaveQuery = (supabase as any).from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'PENDING');
  leaveQuery = departmentFilter(leaveQuery, scope.departmentId);
  const { count: pendingLeaveCount, error: leaveError } = await leaveQuery;
  if (leaveError) throw new Error(`Unable to count pending leave requests: ${leaveError.message}`);

  const resultRows = resultsResult.data || [];
  const gradeRows = resultRows.filter((row: any) => row.grade_points != null && row.credits != null);
  const gradeCredits = gradeRows.reduce((total: number, row: any) => total + Number(row.credits), 0);
  const averageCgpa = gradeCredits > 0
    ? Math.round((gradeRows.reduce((total: number, row: any) => total + Number(row.grade_points) * Number(row.credits), 0) / gradeCredits) * 100) / 100
    : null;
  const passRows = resultRows.filter((row: any) => row.status === 'Pass' || row.status === 'Fail');
  const passRatePercent = passRows.length
    ? Math.round((passRows.filter((row: any) => row.status === 'Pass').length / passRows.length) * 100)
    : null;

  return {
    departmentName: scope.departmentName,
    departmentCode: scope.departmentCode,
    hodName: scope.hodName,
    academicYear,
    totalFaculty: facultyCount,
    activeFacultyCount,
    activeFacultyToday: new Set((timetableResult.data || []).map((row: any) => row.faculty_id).filter(Boolean)).size,
    totalStudents: studentCount,
    activeStudents: activeStudentCount,
    activeCourses: courseCount,
    overallAttendancePercent,
    averageCgpa,
    passRatePercent,
    assignmentCompletionPercent,
    academicAlertsCount: lowAttendanceCount + passRows.filter((row: any) => row.status === 'Fail').length,
    pendingReviewsCount: pendingSubmissionCount + (pendingLeaveCount || 0),
  };
};

export const getDepartmentAttendanceMetrics = async (): Promise<DepartmentAttendanceMetrics> => {
  const scope = await getDepartmentScope();
  const sessions: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = (supabase as any)
      .from('attendance_sessions')
      .select('id, course_id, course_name, faculty_id, semester, total_students, present_count, absent_count, late_count')
      .order('session_date', { ascending: false })
      .range(offset, offset + 999);
    query = departmentFilter(query, scope.departmentId);
    const { data, error } = await query;
    if (error) throw new Error(`Unable to load department attendance sessions: ${error.message}`);
    sessions.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  let enrollmentsQuery = (supabase as any)
    .from('course_enrollments')
    .select('student_id, faculty_id, course_id, course_code, semester')
    .eq('status', 'Active');
  enrollmentsQuery = departmentFilter(enrollmentsQuery, scope.departmentId);
  const { data: enrollments, error: enrollmentsError } = await enrollmentsQuery;
  if (enrollmentsError) throw new Error(`Unable to load department enrollments: ${enrollmentsError.message}`);

  let lowAttendanceQuery = (supabase as any)
    .from('student_analytics_view')
    .select('student_id, full_name, attendance_percentage, total_sessions')
    .lt('attendance_percentage', 75)
    .gt('total_sessions', 0)
    .order('attendance_percentage', { ascending: true });
  if (scope.departmentId) lowAttendanceQuery = lowAttendanceQuery.eq('department_id', scope.departmentId);
  const { data: lowRows, error: lowError } = await lowAttendanceQuery;
  if (lowError) throw new Error(`Unable to load low-attendance records: ${lowError.message}`);

  const lowIds = (lowRows || []).map((row: any) => row.student_id);
  const [profilesResult, studentProfilesResult] = lowIds.length ? await Promise.all([
    (supabase as any).from('profiles').select('id, full_name, usn_or_employee_id').in('id', lowIds),
    (supabase as any).from('student_profiles').select('profile_id, semester').in('profile_id', lowIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (profilesResult.error) throw new Error(`Unable to load at-risk student profiles: ${profilesResult.error.message}`);
  if (studentProfilesResult.error) throw new Error(`Unable to load student semester data: ${studentProfilesResult.error.message}`);

  const profileById = new Map<string, { full_name: string | null; usn_or_employee_id: string | null }>(
    (profilesResult.data || []).map((profile: any) => [profile.id, profile])
  );
  const semesterByStudent = new Map((studentProfilesResult.data || []).map((profile: any) => [profile.profile_id, Number(profile.semester || 0)]));
  const enrollmentsByStudent = new Map<string, any[]>();
  for (const enrollment of enrollments || []) {
    const list = enrollmentsByStudent.get(enrollment.student_id) || [];
    list.push(enrollment);
    enrollmentsByStudent.set(enrollment.student_id, list);
  }
  const lowAttendanceStudents = (lowRows || []).map((row: any) => {
    const profile = profileById.get(row.student_id);
    const enrollment = enrollmentsByStudent.get(row.student_id)?.[0];
    return {
      studentId: row.student_id,
      studentName: profile?.full_name || row.full_name || 'Student',
      usn: profile?.usn_or_employee_id || 'Not recorded',
      semester: semesterByStudent.get(row.student_id) || Number(enrollment?.semester || 0),
      courseCode: enrollment?.course_code || enrollment?.course_id || '—',
      attendancePercent: Number(row.attendance_percentage),
    };
  });

  const total = sessions.reduce((sum, session) => sum + Number(session.total_students || 0), 0);
  const present = sessions.reduce((sum, session) => sum + Number(session.present_count || 0), 0);
  const absent = sessions.reduce((sum, session) => sum + Number(session.absent_count || 0), 0);
  const late = sessions.reduce((sum, session) => sum + Number(session.late_count || 0), 0);
  const percentage = (value: number) => total > 0 ? Math.round((value / total) * 100) : 0;

  const bySemester = new Map<number, { total: number; attended: number }>();
  const byCourse = new Map<string, { name: string; facultyId: string | null; facultyName: string; students: Set<string>; total: number; attended: number }>();
  for (const session of sessions) {
    if (session.semester != null) {
      const semester = Number(session.semester);
      const value = bySemester.get(semester) || { total: 0, attended: 0 };
      value.total += Number(session.total_students || 0);
      value.attended += Number(session.present_count || 0) + Number(session.late_count || 0);
      bySemester.set(semester, value);
    }
    const courseId = String(session.course_id);
    const value = byCourse.get(courseId) || {
      name: session.course_name,
      facultyId: session.faculty_id,
      facultyName: session.faculty_name || '',
      students: new Set<string>(),
      total: 0,
      attended: 0,
    };
    value.total += Number(session.total_students || 0);
    value.attended += Number(session.present_count || 0) + Number(session.late_count || 0);
    byCourse.set(courseId, value);
  }
  for (const enrollment of enrollments || []) {
    const course = byCourse.get(String(enrollment.course_id));
    if (course) course.students.add(enrollment.student_id);
  }
  const facultyIds = [...new Set([...byCourse.values()].map(course => course.facultyId).filter(Boolean))];
  const facultyNames = new Map<string, string>();
  if (facultyIds.length) {
    const { data, error } = await (supabase as any).from('profiles').select('id, full_name').in('id', facultyIds);
    if (error) throw new Error(`Unable to load course faculty names: ${error.message}`);
    (data || []).forEach((profile: any) => facultyNames.set(profile.id, profile.full_name || 'Faculty'));
  }

  const courseAttendance = [...byCourse.entries()].map(([courseId, course]) => {
    const attendancePercent = course.total ? Math.round((course.attended / course.total) * 100) : 0;
    return {
      courseId,
      courseCode: (enrollments || []).find((enrollment: any) => enrollment.course_id === courseId)?.course_code || courseId,
      courseName: course.name,
      facultyName: course.facultyName || (course.facultyId ? facultyNames.get(course.facultyId) : undefined) || 'Not assigned',
      studentCount: course.students.size,
      attendancePercent,
      status: (attendancePercent >= 80 ? 'Healthy' : attendancePercent >= 75 ? 'Needs Attention' : 'Critical') as 'Healthy' | 'Needs Attention' | 'Critical',
    };
  });

  return {
    overallAttendance: percentage(present + late),
    presentRate: percentage(present),
    absentRate: percentage(absent),
    lateRate: percentage(late),
    semesterBreakdown: [...bySemester.entries()].map(([semester, value]) => ({
      semester,
      attendancePercent: value.total ? Math.round((value.attended / value.total) * 100) : 0,
    })).sort((a, b) => a.semester - b.semester),
    courseAttendance,
    lowAttendanceStudents,
  };
};

export const getDepartmentActivityLogs = async () => {
  return [];
};
