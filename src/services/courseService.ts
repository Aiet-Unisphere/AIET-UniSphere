import { supabase } from '../lib/supabase';
import { 
  STORAGE_BUCKETS, 
  uploadFile, 
  getSignedUrl, 
  downloadStorageFile, 
  sanitizeFileName 
} from './storageService';

export interface Course {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester?: number;
  section?: string;
  facultyName?: string;
}

export interface CourseMaterialItem {
  id: string;
  title: string;
  courseId: string;
  moduleId: string;
  fileType: string;
  fileName: string;
  storagePath?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: string;
}

export interface FacultyCourseItem extends Course {
  studentCount: number;
  activeAssignmentsCount: number;
  upcomingAssessmentsCount: number;
  averageAttendancePercent: number | null;
  department: string;
  faculty: string;
  description?: string | null;
  modules: { id: string; title: string; materialsCount: number; assignmentsCount: number }[];
}

export const getCourses = async (): Promise<Course[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get courses from enrollments (student view) or timetable (faculty/department view)
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('course_id, course_name, course_code, semester, section, faculty_name, credits')
    .or(`student_id.eq.${user.id},faculty_id.eq.${user.id}`)
    .eq('status', 'Active');

  const seen = new Set<string>();
  return (enrollments || []).filter((e: any) => {
    if (seen.has(e.course_id)) return false;
    seen.add(e.course_id);
    return true;
  }).map((e: any) => ({
    id: e.course_id,
    code: e.course_code || e.course_id,
    name: e.course_name,
    credits: e.credits || 3,
    semester: e.semester,
    section: e.section,
    facultyName: e.faculty_name,
  }));
};

export const getFacultyCourses = async (): Promise<FacultyCourseItem[]> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify faculty session: ${authError.message}`);
  if (!user) return [];

  const [enrollmentResult, profileResult] = await Promise.all([
    (supabase as any).from('course_enrollments')
      .select('course_id, course_name, course_code, semester, section, faculty_name, credits, student_id, department_id')
      .eq('faculty_id', user.id)
      .eq('status', 'Active'),
    (supabase as any).from('profiles')
      .select('full_name, department:departments(name)')
      .eq('id', user.id)
      .single(),
  ]);
  if (enrollmentResult.error) throw new Error(`Unable to load assigned course enrollments: ${enrollmentResult.error.message}`);
  if (profileResult.error) throw new Error(`Unable to load faculty profile: ${profileResult.error.message}`);
  const enrollments = enrollmentResult.data || [];
  const courseIds = [...new Set<string>(enrollments.map((row: any) => String(row.course_id)))];
  if (!courseIds.length) return [];

  const [assignmentsResult, assessmentsResult, sessionsResult] = await Promise.all([
    (supabase as any).from('assignments').select('id, course_id, status').eq('created_by', user.id).in('course_id', courseIds),
    (supabase as any).from('assessments').select('id, course_id, status').eq('created_by', user.id).in('course_id', courseIds),
    (supabase as any).from('attendance_sessions').select('course_id, total_students, present_count, late_count').eq('faculty_id', user.id).in('course_id', courseIds),
  ]);
  for (const result of [assignmentsResult, assessmentsResult, sessionsResult]) {
    if (result.error) throw new Error(`Unable to load faculty course metrics: ${result.error.message}`);
  }

  return courseIds.map((courseId) => {
    const rows = enrollments.filter((row: any) => row.course_id === courseId);
    const sample = rows[0];
    const sessions = (sessionsResult.data || []).filter((row: any) => row.course_id === courseId);
    const totalStudentsInSessions = sessions.reduce((total: number, row: any) => total + Number(row.total_students || 0), 0);
    const attended = sessions.reduce((total: number, row: any) => total + Number(row.present_count || 0) + Number(row.late_count || 0), 0);
    const uniqueStudents = new Set(rows.map((row: any) => row.student_id));
    return {
      id: courseId,
      code: sample.course_code || courseId,
      name: sample.course_name,
      credits: Number(sample.credits || 3),
      semester: sample.semester == null ? undefined : Number(sample.semester),
      section: sample.section || undefined,
      facultyName: sample.faculty_name || profileResult.data?.full_name || undefined,
      studentCount: uniqueStudents.size,
      activeAssignmentsCount: (assignmentsResult.data || []).filter((row: any) => row.course_id === courseId && !['Closed', 'Completed'].includes(row.status)).length,
      upcomingAssessmentsCount: (assessmentsResult.data || []).filter((row: any) => row.course_id === courseId && ['Draft', 'Upcoming', 'Active'].includes(row.status)).length,
      averageAttendancePercent: totalStudentsInSessions ? Math.round((attended / totalStudentsInSessions) * 100) : null,
      department: profileResult.data?.department?.name || 'Department not assigned',
      faculty: sample.faculty_name || profileResult.data?.full_name || 'Not assigned',
      modules: [],
    };
  });
};

export const getDepartmentCourses = async (): Promise<FacultyCourseItem[]> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated department session required.');
  const { data: profile, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('role, department_id, account_status, department:departments(name)')
    .eq('id', user.id)
    .single();
  if (profileError || profile?.account_status !== 'ACTIVE' || !['HOD', 'ADMIN'].includes(profile.role)) {
    throw new Error('An active HOD or Admin account is required to review department courses.');
  }
  if (profile.role === 'HOD' && !profile.department_id) throw new Error('HOD account is not assigned to a department.');

  let enrollmentQuery = (supabase as any).from('course_enrollments')
    .select('course_id, course_name, course_code, semester, section, faculty_id, faculty_name, credits, student_id')
    .eq('status', 'Active');
  if (profile.department_id) enrollmentQuery = enrollmentQuery.eq('department_id', profile.department_id);
  const { data: enrollmentRows, error: enrollmentError } = await enrollmentQuery;
  if (enrollmentError) throw new Error(`Unable to load department enrollments: ${enrollmentError.message}`);
  const enrollments = enrollmentRows || [];
  const courseIds = [...new Set<string>(enrollments.map((row: any) => String(row.course_id)))];
  if (!courseIds.length) return [];

  const [assignmentsResult, assessmentsResult, sessionsResult] = await Promise.all([
    (supabase as any).from('assignments').select('id, course_id, status').in('course_id', courseIds),
    (supabase as any).from('assessments').select('id, course_id, status').in('course_id', courseIds),
    (supabase as any).from('attendance_sessions').select('course_id, total_students, present_count, late_count').in('course_id', courseIds),
  ]);
  for (const result of [assignmentsResult, assessmentsResult, sessionsResult]) {
    if (result.error) throw new Error(`Unable to load department course metrics: ${result.error.message}`);
  }

  return courseIds.map(courseId => {
    const rows = enrollments.filter((row: any) => String(row.course_id) === courseId);
    const sample = rows[0];
    const sessions = (sessionsResult.data || []).filter((row: any) => String(row.course_id) === courseId);
    const sessionTotal = sessions.reduce((sum: number, row: any) => sum + Number(row.total_students || 0), 0);
    const attended = sessions.reduce((sum: number, row: any) => sum + Number(row.present_count || 0) + Number(row.late_count || 0), 0);
    return {
      id: courseId,
      code: sample.course_code || courseId,
      name: sample.course_name,
      credits: Number(sample.credits || 3),
      semester: sample.semester == null ? undefined : Number(sample.semester),
      section: sample.section || undefined,
      facultyName: sample.faculty_name || 'Not assigned',
      studentCount: new Set(rows.map((row: any) => row.student_id)).size,
      activeAssignmentsCount: (assignmentsResult.data || []).filter((row: any) => String(row.course_id) === courseId && !['Closed', 'Completed'].includes(row.status)).length,
      upcomingAssessmentsCount: (assessmentsResult.data || []).filter((row: any) => String(row.course_id) === courseId && ['Draft', 'Upcoming', 'Active'].includes(row.status)).length,
      averageAttendancePercent: sessionTotal ? Math.round((attended / sessionTotal) * 100) : null,
      department: profile.department?.name || 'Department not assigned',
      faculty: sample.faculty_name || 'Not assigned',
      modules: [],
    };
  });
};

export const getCourseById = async (id: string): Promise<Course | undefined> => {
  const courses = await getCourses();
  return courses.find(c => c.id === id || c.code.toLowerCase() === id.toLowerCase());
};

export const getFacultyCourseById = async (id: string): Promise<FacultyCourseItem | undefined> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;
  const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', user.id).single();
  const courses = ['HOD', 'ADMIN'].includes(profile?.role) ? await getDepartmentCourses() : await getFacultyCourses();
  return courses.find(c => c.id === id || c.code.toLowerCase() === id.toLowerCase());
};

export const getCourseMaterials = async (courseId: string): Promise<CourseMaterialItem[]> => {
  try {
    const { data, error } = await (supabase as any)
      .from('academic_materials')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data.map((m: any) => ({
        id: m.id,
        title: m.title,
        courseId: m.course_id,
        moduleId: m.module_id || 'General',
        fileType: m.file_type || 'PDF',
        fileName: m.file_name,
        storagePath: m.storage_path,
        fileSize: m.file_size ? Number(m.file_size) : undefined,
        mimeType: m.mime_type,
        createdAt: m.created_at
      }));
    }
  } catch {}

  return [];
};

export const uploadCourseMaterial = async ({
  title,
  courseId,
  moduleId = 'General',
  file
}: {
  title: string;
  courseId: string;
  moduleId?: string;
  file: File;
}): Promise<CourseMaterialItem> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('department_id')
    .eq('id', user.id)
    .single();

  if (!profile?.department_id) {
    throw new Error("No active department found on profile.");
  }

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${profile.department_id}/${courseId}/${moduleId}/${safeName}`;

  await uploadFile({
    bucket: STORAGE_BUCKETS.ACADEMIC_MATERIALS,
    path: storagePath,
    file,
    upsert: true
  });

  const { data, error } = await (supabase as any)
    .from('academic_materials')
    .insert({
      title,
      course_id: courseId,
      module_id: moduleId,
      file_type: file.name.split('.').pop()?.toUpperCase() || 'PDF',
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      department_id: profile.department_id,
      uploaded_by: user.id
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to save course material metadata.");
  }

  return {
    id: data.id,
    title: data.title,
    courseId: data.course_id,
    moduleId: data.module_id,
    fileType: data.file_type,
    fileName: data.file_name,
    storagePath: data.storage_path,
    fileSize: Number(data.file_size),
    mimeType: data.mime_type,
    createdAt: data.created_at
  };
};

export const downloadCourseMaterial = async (storagePath: string, fileName?: string): Promise<void> => {
  await downloadStorageFile(STORAGE_BUCKETS.ACADEMIC_MATERIALS, storagePath, fileName);
};

export const getCourseMaterialUrl = async (storagePath: string): Promise<string | null> => {
  return await getSignedUrl(STORAGE_BUCKETS.ACADEMIC_MATERIALS, storagePath, 3600);
};

/**
 * Fetches real distinct courses created in assignments or assessments for the current user's department.
 */
export const getAvailableDepartmentCourses = async (): Promise<{ code: string; name: string }[]> => {
  try {
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) return [];

    const { data: prof } = await (supabase as any)
      .from('profiles')
      .select('department_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!prof?.department_id) return [];

    const [assgRes, assessRes] = await Promise.all([
      (supabase as any).from('assignments').select('course_id, course_name').eq('department_id', prof.department_id),
      (supabase as any).from('assessments').select('course_id, course_name, course_code').eq('department_id', prof.department_id)
    ]);

    const courseMap = new Map<string, string>();
    (assgRes.data || []).forEach((a: any) => {
      if (a.course_id && a.course_name) courseMap.set(a.course_id.toUpperCase(), a.course_name);
    });
    (assessRes.data || []).forEach((a: any) => {
      const code = (a.course_code || a.course_id || '').toUpperCase();
      if (code && a.course_name) courseMap.set(code, a.course_name);
    });

    return Array.from(courseMap.entries()).map(([code, name]) => ({ code, name }));
  } catch (err) {
    return [];
  }
};

