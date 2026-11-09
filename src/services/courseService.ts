import { supabase } from '../lib/supabase';
import { 
  STORAGE_BUCKETS, 
  uploadFile, 
  getSignedUrl, 
  downloadStorageFile, 
  deleteStorageFile,
  validateFile,
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
  faculty?: string;
  description?: string | null;
  attendance?: number | null;
  attendanceDisplay?: string;
  progress?: number | null;
  progressDisplay?: string;
  nextActivity?: string;
  modules?: CourseModuleItem[];
}

export interface CourseModuleItem {
  id: string;
  title: string;
  materialsCount: number;
  assignmentsCount: number;
  completion?: number;
  materials?: CourseMaterialItem[];
}

export interface CourseProgressMetrics {
  percentage: number | null;
  display: string;
  totalCoursework: number;
  completedCoursework: number;
  hasCoursework: boolean;
}

export const calculateStudentCourseProgress = (
  course: { id: string; code?: string; name?: string },
  assignments: any[] = [],
  assessments: any[] = []
): CourseProgressMetrics => {
  if (!course || !course.id) {
    return {
      percentage: null,
      display: 'N/A',
      totalCoursework: 0,
      completedCoursework: 0,
      hasCoursework: false
    };
  }

  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeAssessments = Array.isArray(assessments) ? assessments : [];

  const courseAssignments = safeAssignments.filter(a => 
    a && (
      a.courseId === course.id || 
      (course.code && a.courseId === course.code) ||
      (a.courseName && course.name && a.courseName.toLowerCase() === course.name.toLowerCase())
    )
  );

  const courseAssessments = safeAssessments.filter(a => 
    a && (
      a.courseId === course.id || 
      (course.code && (a.courseCode === course.code || a.courseId === course.code)) ||
      (a.courseName && course.name && a.courseName.toLowerCase() === course.name.toLowerCase())
    )
  );

  const completedAssignments = courseAssignments.filter(a => a.status === 'Submitted' || a.status === 'Graded').length;
  const completedAssessments = courseAssessments.filter(a => 
    a.studentAttempt && (a.studentAttempt.status === 'Submitted' || a.studentAttempt.status === 'Graded')
  ).length;

  const totalCoursework = courseAssignments.length + courseAssessments.length;
  const completedCoursework = completedAssignments + completedAssessments;

  if (totalCoursework === 0) {
    return {
      percentage: null,
      display: 'N/A',
      totalCoursework: 0,
      completedCoursework: 0,
      hasCoursework: false
    };
  }

  const percentage = Math.round((completedCoursework / totalCoursework) * 100);
  return {
    percentage,
    display: `${percentage}%`,
    totalCoursework,
    completedCoursework,
    hasCoursework: true
  };
};

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
  uploadedBy?: string;
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
  const found = courses.find(c => c.id === id || c.code.toLowerCase() === id.toLowerCase());
  if (found) {
    const materials = await getCourseMaterials(found.id, found.code);
    found.modules = deriveCourseModules(materials);
  }
  return found;
};

export const deriveCourseModules = (
  materials: CourseMaterialItem[], 
  courseAssignments: any[] = []
): CourseModuleItem[] => {
  if (!materials || materials.length === 0) {
    return [];
  }

  const moduleMap = new Map<string, {
    id: string;
    title: string;
    materials: CourseMaterialItem[];
  }>();

  materials.forEach((m) => {
    const modKey = (m.moduleId && m.moduleId.trim()) || 'General';
    if (!moduleMap.has(modKey)) {
      let title = modKey;
      if (/^\d+$/.test(modKey)) {
        title = `Module ${modKey}`;
      } else if (modKey.toLowerCase() === 'general') {
        title = 'General Resources';
      } else if (!modKey.toLowerCase().startsWith('module')) {
        title = `Module: ${modKey}`;
      }
      moduleMap.set(modKey, {
        id: modKey,
        title,
        materials: []
      });
    }
    moduleMap.get(modKey)!.materials.push(m);
  });

  return Array.from(moduleMap.values()).map(mod => {
    // Correlate assignments mentioning this module if present
    const modSearchKey = mod.id.toLowerCase().startsWith('module') 
      ? mod.id.toLowerCase() 
      : `module ${mod.id}`.toLowerCase();
    const matchingAssignments = courseAssignments.filter(a => 
      (a.title && a.title.toLowerCase().includes(modSearchKey)) ||
      (a.instructions && a.instructions.toLowerCase().includes(modSearchKey))
    );

    const assignmentsCount = matchingAssignments.length;
    const completedAssignments = matchingAssignments.filter(a => a.status === 'Submitted' || a.status === 'Graded').length;
    const completion = assignmentsCount > 0 
      ? Math.round((completedAssignments / assignmentsCount) * 100) 
      : 0;

    return {
      id: mod.id,
      title: mod.title,
      materialsCount: mod.materials.length,
      assignmentsCount,
      completion,
      materials: mod.materials
    };
  });
};

export const getCourseMaterials = async (courseId: string, courseCode?: string): Promise<CourseMaterialItem[]> => {
  try {
    let query = (supabase as any)
      .from('academic_materials')
      .select('*');

    if (courseCode && courseCode !== courseId) {
      query = query.or(`course_id.eq.${courseId},course_id.eq.${courseCode}`);
    } else {
      query = query.eq('course_id', courseId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

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
        createdAt: m.created_at,
        uploadedBy: m.uploaded_by
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

  if (!title || !title.trim()) {
    throw new Error("Material title is required.");
  }

  if (!file) {
    throw new Error("A file must be selected for upload.");
  }

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();

  if (!profile?.department_id) {
    throw new Error("No active department found on profile.");
  }

  // 1. Validate file against bucket rules (max 50MB, allowed types)
  const validation = validateFile(file, STORAGE_BUCKETS.ACADEMIC_MATERIALS);
  if (!validation.valid) {
    throw new Error(validation.error || "File validation failed.");
  }

  // 2. Authorization check: verify faculty teaches this course (unless Admin or HOD)
  const isAdmin = profile.role === 'ADMIN';
  const isHOD = profile.role === 'HOD';

  if (!isAdmin && !isHOD) {
    const [enrollmentCheck, timetableCheck] = await Promise.all([
      (supabase as any)
        .from('course_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('faculty_id', user.id)
        .or(`course_id.eq.${courseId},course_code.eq.${courseId}`),
      (supabase as any)
        .from('timetable_entries')
        .select('id', { count: 'exact', head: true })
        .eq('faculty_id', user.id)
        .or(`course_id.eq.${courseId},course_code.eq.${courseId}`)
    ]);

    const isAssigned = (enrollmentCheck.count || 0) > 0 || (timetableCheck.count || 0) > 0;
    if (!isAssigned) {
      throw new Error("You are not authorized to upload materials for a course you do not teach.");
    }
  }

  const cleanModuleId = moduleId.trim() || 'General';
  const safeName = sanitizeFileName(file.name);
  const storagePath = `${profile.department_id}/${courseId}/${cleanModuleId}/${safeName}`;

  // 3. Upload file to Supabase Storage
  await uploadFile({
    bucket: STORAGE_BUCKETS.ACADEMIC_MATERIALS,
    path: storagePath,
    file,
    upsert: true
  });

  // 4. Insert metadata record in academic_materials
  try {
    const { data, error } = await (supabase as any)
      .from('academic_materials')
      .insert({
        title: title.trim(),
        course_id: courseId,
        module_id: cleanModuleId,
        file_type: file.name.split('.').pop()?.toUpperCase() || 'PDF',
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/pdf',
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
      createdAt: data.created_at,
      uploadedBy: data.uploaded_by
    };
  } catch (dbErr: any) {
    // Roll back storage file if database insert failed to prevent orphaned storage objects
    await deleteStorageFile(STORAGE_BUCKETS.ACADEMIC_MATERIALS, storagePath).catch(() => {});
    throw dbErr;
  }
};

export const updateCourseMaterial = async (
  materialId: string,
  updates: { title?: string; moduleId?: string }
): Promise<CourseMaterialItem> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  const { data: material, error: fetchErr } = await (supabase as any)
    .from('academic_materials')
    .select('*')
    .eq('id', materialId)
    .single();

  if (fetchErr || !material) {
    throw new Error("Course material not found.");
  }

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'ADMIN';
  const isHOD = profile?.role === 'HOD' && profile.department_id === material.department_id;
  const isOwner = material.uploaded_by === user.id;

  if (!isAdmin && !isHOD && !isOwner) {
    const { count } = await (supabase as any)
      .from('course_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('faculty_id', user.id)
      .eq('course_id', material.course_id);

    if (!count) {
      throw new Error("You are not authorized to update this course material.");
    }
  }

  const newTitle = updates.title !== undefined ? updates.title.trim() : material.title;
  if (!newTitle) throw new Error("Material title cannot be empty.");
  const newModuleId = updates.moduleId !== undefined ? (updates.moduleId.trim() || 'General') : material.module_id;

  const { data: updated, error: updateErr } = await (supabase as any)
    .from('academic_materials')
    .update({
      title: newTitle,
      module_id: newModuleId
    })
    .eq('id', materialId)
    .select()
    .single();

  if (updateErr || !updated) {
    throw new Error(updateErr?.message || "Failed to update course material.");
  }

  return {
    id: updated.id,
    title: updated.title,
    courseId: updated.course_id,
    moduleId: updated.module_id || 'General',
    fileType: updated.file_type || 'PDF',
    fileName: updated.file_name,
    storagePath: updated.storage_path,
    fileSize: updated.file_size ? Number(updated.file_size) : undefined,
    mimeType: updated.mime_type,
    createdAt: updated.created_at,
    uploadedBy: updated.uploaded_by
  };
};

export const deleteCourseMaterial = async (materialId: string, storagePath?: string): Promise<boolean> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  // 1. Fetch material to check ownership & existence
  const { data: material, error: fetchErr } = await (supabase as any)
    .from('academic_materials')
    .select('id, course_id, department_id, uploaded_by, storage_path')
    .eq('id', materialId)
    .single();

  if (fetchErr || !material) {
    throw new Error("Course material not found or already deleted.");
  }

  // 2. Authorization check
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'ADMIN';
  const isHOD = profile?.role === 'HOD' && profile.department_id === material.department_id;
  const isOwner = material.uploaded_by === user.id;

  if (!isAdmin && !isHOD && !isOwner) {
    const { count } = await (supabase as any)
      .from('course_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('faculty_id', user.id)
      .eq('course_id', material.course_id);

    if (!count) {
      throw new Error("You are not authorized to delete this course material.");
    }
  }

  // 3. Delete from database
  const { error: deleteErr } = await (supabase as any)
    .from('academic_materials')
    .delete()
    .eq('id', materialId);

  if (deleteErr) {
    throw new Error(deleteErr.message || "Failed to delete course material record.");
  }

  // 4. Delete storage file if path exists
  const fileStoragePath = storagePath || material.storage_path;
  if (fileStoragePath) {
    await deleteStorageFile(STORAGE_BUCKETS.ACADEMIC_MATERIALS, fileStoragePath);
  }

  return true;
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

