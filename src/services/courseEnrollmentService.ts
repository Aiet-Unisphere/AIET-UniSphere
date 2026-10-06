/**
 * Real Course Enrollment Service — backed by Supabase course_enrollments table.
 */
import { supabase } from '../lib/supabase';

const sb = supabase as any;

export interface CourseEnrollment {
  id: string;
  student_id: string;
  course_id: string;
  course_name: string;
  course_code?: string | null;
  department_id: string;
  faculty_id?: string | null;
  faculty_name?: string | null;
  semester?: number | null;
  academic_year?: string | null;
  section?: string | null;
  credits?: number | null;
  enrolled_at: string;
  status: 'Active' | 'Dropped' | 'Completed';
}

export const getStudentEnrollments = async (studentId?: string): Promise<CourseEnrollment[]> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const { data, error } = await sb
    .from('course_enrollments')
    .select('*')
    .eq('student_id', uid)
    .eq('status', 'Active')
    .order('semester', { ascending: true });

  if (error) {
    console.error('[courseEnrollmentService] getStudentEnrollments error:', error.message);
    return [];
  }
  return (data || []) as CourseEnrollment[];
};

export const getDepartmentCourses = async (
  departmentId?: string,
  semester?: number
): Promise<CourseEnrollment[]> => {
  let query = sb
    .from('course_enrollments')
    .select('course_id, course_name, course_code, faculty_id, faculty_name, semester, credits')
    .eq('status', 'Active');

  if (departmentId) query = query.eq('department_id', departmentId);
  if (semester) query = query.eq('semester', semester);

  const { data, error } = await query;
  if (error) {
    console.error('[courseEnrollmentService] getDepartmentCourses error:', error.message);
    return [];
  }

  const seen = new Set<string>();
  const unique = (data || []).filter((row: any) => {
    if (seen.has(row.course_id)) return false;
    seen.add(row.course_id);
    return true;
  });

  return unique as CourseEnrollment[];
};

export const getFacultyCourses = async (facultyId?: string): Promise<CourseEnrollment[]> => {
  let uid = facultyId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const { data, error } = await sb
    .from('course_enrollments')
    .select('course_id, course_name, course_code, semester, section, department_id, credits')
    .eq('faculty_id', uid)
    .eq('status', 'Active');

  if (error) {
    console.error('[courseEnrollmentService] getFacultyCourses error:', error.message);
    return [];
  }

  const seen = new Set<string>();
  return (data || []).filter((row: any) => {
    const key = `${row.course_id}-${row.semester}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as CourseEnrollment[];
};

export const enrollStudent = async (
  enrollment: Omit<CourseEnrollment, 'id' | 'enrolled_at'>
): Promise<CourseEnrollment> => {
  const { data, error } = await sb
    .from('course_enrollments')
    .insert(enrollment)
    .select()
    .single();

  if (error) throw new Error(`Failed to enroll student: ${error.message}`);
  return data as CourseEnrollment;
};

export const getStudentsForCourse = async (courseId: string, semester?: number): Promise<{
  studentId: string;
  studentName: string;
  usn: string;
}[]> => {
  let query = sb
    .from('course_enrollments')
    .select('student_id, profiles!student_id(full_name, usn_or_employee_id)')
    .eq('course_id', courseId)
    .eq('status', 'Active');

  if (semester) query = query.eq('semester', semester);

  const { data, error } = await query;
  if (error) {
    console.error('[courseEnrollmentService] getStudentsForCourse error:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    studentId: row.student_id,
    studentName: row.profiles?.full_name || 'Unknown Student',
    usn: row.profiles?.usn_or_employee_id || '',
  }));
};
