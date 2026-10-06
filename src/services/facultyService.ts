import { supabase } from '../lib/supabase';
import type { FacultyMember } from '../data/faculty';

const mapProfileToFaculty = (
  profile: any,
  assignedCourses: FacultyMember['assignedCourses'],
  totalStudents: number,
  assignmentsCreatedCount: number,
  attendanceLogCount: number
): FacultyMember => {
  const deptName = profile.department?.name || (profile.department_id ? 'Loading...' : 'Department not assigned');

  return {
    id: profile.id,
    employeeId: profile.usn_or_employee_id || 'N/A',
    name: profile.full_name || profile.email.split('@')[0],
    department: deptName,
    departmentId: profile.department_id || profile.department?.id || '',
    email: profile.email,
    phone: profile.phone || 'Not recorded',
    designation: profile.designation || (profile.role === 'HOD' ? 'Head of Department' : 'Faculty'),
    status: profile.account_status === 'ACTIVE' ? 'Active' : profile.account_status === 'LOCKED' ? 'Locked' : profile.account_status === 'PENDING' ? 'Pending' : 'Inactive',
    assignedCourses,
    totalStudents,
    totalStudentsTaught: totalStudents,
    assignmentsCreatedCount,
    attendanceLogCount,
    attendanceLoggedCount: attendanceLogCount,
    allocatedCoursesCount: assignedCourses.length,
  };
};

export const getAllFaculty = async (): Promise<FacultyMember[]> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated session required to load faculty.');
  const { data: callerProfile, error: callerError } = await (supabase as any)
    .from('profiles')
    .select('role, department_id, account_status')
    .eq('id', user.id)
    .single();
  if (callerError || callerProfile?.account_status !== 'ACTIVE' || !['FACULTY', 'HOD', 'ADMIN'].includes(callerProfile.role)) {
    throw new Error('An active faculty, HOD, or Admin account is required.');
  }

  let query = (supabase as any)
    .from('profiles')
    .select('id, email, full_name, usn_or_employee_id, department_id, role, account_status, department:departments(id,name,code)')
    .in('role', ['FACULTY', 'HOD']);

  if (callerProfile.role === 'HOD' && callerProfile.department_id) {
    query = query.eq('department_id', callerProfile.department_id);
  }

  query = query.order('full_name', { ascending: true });

  const { data: facultyData, error } = await query;
  if (error) throw new Error(`Unable to load faculty: ${error.message}`);
  if (!facultyData?.length) return [];

  const facultyIds = facultyData.map((profile: any) => profile.id);
  let enrollmentData: any[] = [];
  let assignmentData: any[] = [];
  let attendanceData: any[] = [];

  if (facultyIds.length > 0) {
    try {
      const [enrollmentRes, assignmentRes, attendanceRes] = await Promise.all([
        (supabase as any).from('course_enrollments')
          .select('faculty_id, course_id, course_code, course_name, semester, student_id')
          .in('faculty_id', facultyIds)
          .eq('status', 'Active'),
        (supabase as any).from('assignments').select('id, created_by').in('created_by', facultyIds),
        (supabase as any).from('attendance_sessions').select('id, faculty_id').in('faculty_id', facultyIds),
      ]);
      enrollmentData = enrollmentRes.data || [];
      assignmentData = assignmentRes.data || [];
      attendanceData = attendanceRes.data || [];
    } catch (err) {
      console.warn('[facultyService] Non-fatal error loading faculty activity metrics:', err);
    }
  }

  const coursesByFaculty = new Map<string, Map<string, { courseId: string; courseCode: string; courseName: string; semester: number; students: Set<string> }>>();
  for (const row of enrollmentData) {
    if (!row.faculty_id) continue;
    const courses = coursesByFaculty.get(row.faculty_id) || new Map();
    const course = courses.get(row.course_id) || {
      courseId: row.course_id,
      courseCode: row.course_code || row.course_id,
      courseName: row.course_name,
      semester: Number(row.semester || 0),
      students: new Set<string>(),
    };
    course.students.add(row.student_id);
    courses.set(row.course_id, course);
    coursesByFaculty.set(row.faculty_id, courses);
  }
  const assignmentsByFaculty = new Map<string, number>();
  assignmentData.forEach((row: any) => assignmentsByFaculty.set(row.created_by, (assignmentsByFaculty.get(row.created_by) || 0) + 1));
  const attendanceByFaculty = new Map<string, number>();
  attendanceData.forEach((row: any) => attendanceByFaculty.set(row.faculty_id, (attendanceByFaculty.get(row.faculty_id) || 0) + 1));

  return facultyData.map((profile: any) => {
    const courses = [...(coursesByFaculty.get(profile.id)?.values() || [])];
    const assignedCourses = courses.map(({ students, ...course }) => ({ ...course, studentCount: students.size }));
    const studentIds = new Set(courses.flatMap(course => [...course.students]));
    return mapProfileToFaculty(
      profile,
      assignedCourses,
      studentIds.size,
      assignmentsByFaculty.get(profile.id) || 0,
      attendanceByFaculty.get(profile.id) || 0
    );
  });
};

export const getFacultyRoster = getAllFaculty;

export const getFacultyById = async (id: string): Promise<FacultyMember | null> => {
  const faculty = await getAllFaculty();
  return faculty.find(member => member.id === id || member.employeeId.toLowerCase() === id.toLowerCase()) || null;
};

export const getFacultyByDepartment = async (departmentId: string): Promise<FacultyMember[]> => {
  return (await getAllFaculty()).filter(member => member.departmentId === departmentId);
};
