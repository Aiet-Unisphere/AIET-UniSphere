import { supabase } from '../lib/supabase';
import type {
  DBExternalLearningCourse,
  DBExternalCourseAssignment,
  DBExternalCourseEnrollment,
  DBExternalCourseProgress,
  DBExternalCourseEvidence
} from '../types/database.types';

export interface StudentExternalLearningItem {
  enrollment: DBExternalCourseEnrollment;
  assignment: DBExternalCourseAssignment;
  course: DBExternalLearningCourse;
  progress: DBExternalCourseProgress | null;
  evidence: DBExternalCourseEvidence[];
  latestEvidence: DBExternalCourseEvidence | null;
}

export interface FacultyAssignmentSummaryItem {
  assignment: DBExternalCourseAssignment;
  course: DBExternalLearningCourse;
  enrolledStudentsCount: number;
  completedCount: number;
  inProgressCount: number;
  pendingVerificationCount: number;
  enrollments: {
    enrollment: DBExternalCourseEnrollment;
    studentProfile?: {
      id: string;
      full_name: string;
      usn_or_employee_id: string;
      email: string;
    } | null;
    progress: DBExternalCourseProgress | null;
    evidence: DBExternalCourseEvidence[];
    latestEvidence: DBExternalCourseEvidence | null;
  }[];
}

export interface VerificationQueueItem {
  evidence: DBExternalCourseEvidence;
  enrollment: DBExternalCourseEnrollment;
  assignment: DBExternalCourseAssignment;
  course: DBExternalLearningCourse;
  studentProfile?: {
    id: string;
    full_name: string;
    usn_or_employee_id: string;
    email: string;
  } | null;
  progress: DBExternalCourseProgress | null;
}

export interface FacultyExternalDashboardData {
  metrics: {
    assignedCoursesCount: number;
    activeAssignmentsCount: number;
    totalStudentsAssigned: number;
    pendingVerificationCount: number;
    completionRatePercent: number;
  };
  courses: DBExternalLearningCourse[];
  assignmentSummaries: FacultyAssignmentSummaryItem[];
  verificationQueue: VerificationQueueItem[];
}

export interface HODStudentMatrixItem {
  enrollment: DBExternalCourseEnrollment;
  assignment: DBExternalCourseAssignment;
  course: DBExternalLearningCourse;
  studentProfile?: {
    id: string;
    full_name: string;
    usn_or_employee_id: string;
    email: string;
    semester?: number;
    section?: string;
  } | null;
  progress: DBExternalCourseProgress | null;
  latestEvidence: DBExternalCourseEvidence | null;
  isOverdue: boolean;
}

export interface HODExternalDashboardData {
  departmentId: string;
  departmentName: string;
  metrics: {
    activeAssignmentsCount: number;
    totalStudentsAssigned: number;
    inProgressCount: number;
    completedCount: number;
    pendingVerificationCount: number;
    overdueCount: number;
    completionRatePercent: number;
  };
  courses: DBExternalLearningCourse[];
  assignmentSummaries: FacultyAssignmentSummaryItem[];
  studentMatrix: HODStudentMatrixItem[];
  verificationQueue: VerificationQueueItem[];
}

/**
 * AIET-UniSphere External Learning Service Foundation (Student, Faculty & HOD)
 *
 * Operates strictly via the authenticated Supabase client, enforcing database RLS.
 */

// --- STUDENT METHODS ---

export const getExternalLearningCourses = async (): Promise<DBExternalLearningCourse[]> => {
  const { data, error } = await (supabase as any)
    .from('external_learning_courses')
    .select('*')
    .eq('is_active', true)
    .order('title', { ascending: true });

  if (error) throw new Error(`Unable to fetch external courses: ${error.message}`);
  return data || [];
};

export const getExternalCourseAssignments = async (departmentId?: string): Promise<DBExternalCourseAssignment[]> => {
  let query = (supabase as any)
    .from('external_course_assignments')
    .select('*, external_course:external_learning_courses(*)')
    .order('created_at', { ascending: false });

  if (departmentId) {
    query = query.eq('department_id', departmentId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Unable to fetch external course assignments: ${error.message}`);
  return data || [];
};

export const getMyExternalCourseEnrollments = async (): Promise<DBExternalCourseEnrollment[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await (supabase as any)
    .from('external_course_enrollments')
    .select('*, assignment:external_course_assignments(*, external_course:external_learning_courses(*))')
    .eq('student_id', user.id)
    .order('assigned_at', { ascending: false });

  if (error) throw new Error(`Unable to fetch enrollments: ${error.message}`);
  return data || [];
};

export const getMyExternalLearningItems = async (): Promise<StudentExternalLearningItem[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: enrollments, error: enrollError } = await (supabase as any)
    .from('external_course_enrollments')
    .select(`
      *,
      assignment:external_course_assignments(
        *,
        course:external_learning_courses(*)
      )
    `)
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });

  if (enrollError) throw new Error(`Unable to fetch external learning enrollments: ${enrollError.message}`);
  if (!enrollments || !enrollments.length) return [];

  const enrollmentIds = enrollments.map((e: any) => e.id);

  const [progressRes, evidenceRes] = await Promise.all([
    (supabase as any).from('external_course_progress').select('*').in('enrollment_id', enrollmentIds),
    (supabase as any).from('external_course_evidence').select('*').in('enrollment_id', enrollmentIds).order('submitted_at', { ascending: false })
  ]);

  if (progressRes.error) throw new Error(`Unable to fetch progress data: ${progressRes.error.message}`);
  if (evidenceRes.error) throw new Error(`Unable to fetch evidence data: ${evidenceRes.error.message}`);

  const progressMap = new Map<string, DBExternalCourseProgress>();
  (progressRes.data || []).forEach((p: DBExternalCourseProgress) => progressMap.set(p.enrollment_id, p));

  const evidenceMap = new Map<string, DBExternalCourseEvidence[]>();
  (evidenceRes.data || []).forEach((ev: DBExternalCourseEvidence) => {
    const list = evidenceMap.get(ev.enrollment_id) || [];
    list.push(ev);
    evidenceMap.set(ev.enrollment_id, list);
  });

  return enrollments.map((e: any) => {
    const evList = evidenceMap.get(e.id) || [];
    const courseObj = e.assignment?.course || e.assignment?.external_course || {
      title: 'External Learning Course',
      platform: 'External Platform',
      external_url: '#'
    };
    return {
      enrollment: {
        id: e.id,
        assignment_id: e.assignment_id,
        student_id: e.student_id,
        status: e.status,
        assigned_at: e.assigned_at,
        started_at: e.started_at,
        completed_at: e.completed_at,
        created_at: e.created_at,
        updated_at: e.updated_at
      },
      assignment: e.assignment,
      course: courseObj,
      progress: progressMap.get(e.id) || null,
      evidence: evList,
      latestEvidence: evList[0] || null
    };
  });
};

export const updateMyExternalCourseProgress = async (
  enrollmentId: string,
  progressData: {
    progress_percent: number;
    completed_modules?: number | null;
    total_modules?: number | null;
    completed_quizzes?: number | null;
    total_quizzes?: number | null;
    completed_assignments?: number | null;
    total_assignments?: number | null;
  }
): Promise<DBExternalCourseProgress> => {
  if (progressData.progress_percent < 0 || progressData.progress_percent > 100) {
    throw new Error('Progress percentage must be between 0 and 100.');
  }
  if (progressData.completed_modules != null && progressData.total_modules != null) {
    if (progressData.completed_modules > progressData.total_modules) {
      throw new Error('Completed modules cannot exceed total modules.');
    }
  }

  const payload = {
    enrollment_id: enrollmentId,
    progress_percent: progressData.progress_percent,
    completed_modules: progressData.completed_modules ?? null,
    total_modules: progressData.total_modules ?? null,
    completed_quizzes: progressData.completed_quizzes ?? null,
    total_quizzes: progressData.total_quizzes ?? null,
    completed_assignments: progressData.completed_assignments ?? null,
    total_assignments: progressData.total_assignments ?? null,
    last_activity_at: new Date().toISOString(),
    source: 'SELF_REPORTED'
  };

  const { data, error } = await (supabase as any)
    .from('external_course_progress')
    .upsert(payload, { onConflict: 'enrollment_id' })
    .select()
    .single();

  if (error) throw new Error(`Unable to update progress: ${error.message}`);

  if (progressData.progress_percent > 0) {
    const { data: enrollment } = await (supabase as any)
      .from('external_course_enrollments')
      .select('status')
      .eq('id', enrollmentId)
      .single();

    if (enrollment && enrollment.status === 'ASSIGNED') {
      await (supabase as any)
        .from('external_course_enrollments')
        .update({
          status: 'IN_PROGRESS',
          started_at: new Date().toISOString()
        })
        .eq('id', enrollmentId);
    }
  }

  return data;
};

export const submitExternalCourseEvidence = async (
  enrollmentId: string,
  evidenceInput: {
    evidence_type: 'CERTIFICATE' | 'CREDENTIAL_URL' | 'CREDENTIAL_ID' | 'OTHER';
    credential_url?: string | null;
    credential_id?: string | null;
    file?: File | null;
  }
): Promise<DBExternalCourseEvidence> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authenticated student session required.');

  if (!evidenceInput.credential_url && !evidenceInput.credential_id && !evidenceInput.file) {
    throw new Error('Please provide at least one evidence source (Certificate file, Credential URL, or Credential ID).');
  }

  let storagePath: string | null = null;

  if (evidenceInput.file) {
    const file = evidenceInput.file;
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Only PDF, JPEG, PNG, and WEBP formats are allowed.');
    }
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error('File size exceeds the maximum limit of 20MB.');
    }

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    storagePath = `external-learning/${user.id}/${enrollmentId}/${Date.now()}_${cleanFileName}`;

    const { error: uploadErr } = await supabase.storage
      .from('external-learning-evidence')
      .upload(storagePath, file, { upsert: true });

    if (uploadErr) {
      throw new Error(`Certificate upload failed: ${uploadErr.message}`);
    }
  }

  const payload = {
    enrollment_id: enrollmentId,
    evidence_type: evidenceInput.evidence_type,
    certificate_storage_path: storagePath,
    credential_url: evidenceInput.credential_url || null,
    credential_id: evidenceInput.credential_id || null,
    submitted_at: new Date().toISOString(),
    verification_status: 'PENDING'
  };

  const { data, error } = await (supabase as any)
    .from('external_course_evidence')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(`Unable to submit evidence: ${error.message}`);
  return data;
};

export const getEvidenceSignedUrl = async (storagePath: string): Promise<string> => {
  if (!storagePath) throw new Error('Storage path is required.');

  // Pre-authorization check: query external_course_evidence with caller session
  const { data: evidenceRecord, error: authCheckError } = await (supabase as any)
    .from('external_course_evidence')
    .select('id, certificate_storage_path')
    .eq('certificate_storage_path', storagePath)
    .maybeSingle();

  if (authCheckError || !evidenceRecord) {
    throw new Error('403 Forbidden: You are not authorized to access this evidence certificate link.');
  }

  const { data, error } = await supabase.storage
    .from('external-learning-evidence')
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(`Unable to generate private certificate link: ${error?.message || 'Signed URL creation failed'}`);
  }
  return data.signedUrl;
};

// --- FACULTY & HOD METHODS ---

export const getFacultyExternalLearningData = async (): Promise<FacultyExternalDashboardData> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authenticated faculty session required.');

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['FACULTY', 'HOD', 'ADMIN'].includes(profile.role)) {
    throw new Error('Only faculty, HOD, or admin accounts can access faculty external learning.');
  }

  const { data: courses, error: coursesError } = await (supabase as any)
    .from('external_learning_courses')
    .select('*')
    .order('created_at', { ascending: false });

  if (coursesError) throw new Error(`Unable to load course definitions: ${coursesError.message}`);

  let assignmentsQuery = (supabase as any)
    .from('external_course_assignments')
    .select('*, course:external_learning_courses(*)')
    .order('created_at', { ascending: false });

  if (profile.role !== 'ADMIN' && profile.department_id) {
    assignmentsQuery = assignmentsQuery.or(`assigned_by.eq.${user.id},department_id.eq.${profile.department_id}`);
  }

  const { data: assignments, error: assignError } = await assignmentsQuery;
  if (assignError) throw new Error(`Unable to load assignments: ${assignError.message}`);

  const assignmentIds = (assignments || []).map((a: any) => a.id);

  if (!assignmentIds.length) {
    return {
      metrics: {
        assignedCoursesCount: (courses || []).length,
        activeAssignmentsCount: 0,
        totalStudentsAssigned: 0,
        pendingVerificationCount: 0,
        completionRatePercent: 0
      },
      courses: courses || [],
      assignmentSummaries: [],
      verificationQueue: []
    };
  }

  const { data: enrollments, error: enrollError } = await (supabase as any)
    .from('external_course_enrollments')
    .select('*')
    .in('assignment_id', assignmentIds);

  if (enrollError) throw new Error(`Unable to load enrollments: ${enrollError.message}`);

  const enrollmentIds = (enrollments || []).map((e: any) => e.id);
  const studentIds = [...new Set<string>((enrollments || []).map((e: any) => e.student_id))];

  const [profilesRes, progressRes, evidenceRes] = await Promise.all([
    studentIds.length ? (supabase as any).from('profiles').select('id, full_name, usn_or_employee_id, email').in('id', studentIds) : Promise.resolve({ data: [] }),
    enrollmentIds.length ? (supabase as any).from('external_course_progress').select('*').in('enrollment_id', enrollmentIds) : Promise.resolve({ data: [] }),
    enrollmentIds.length ? (supabase as any).from('external_course_evidence').select('*').in('enrollment_id', enrollmentIds).order('submitted_at', { ascending: false }) : Promise.resolve({ data: [] })
  ]);

  const studentProfileMap = new Map<string, any>();
  (profilesRes.data || []).forEach((p: any) => studentProfileMap.set(p.id, p));

  const progressMap = new Map<string, DBExternalCourseProgress>();
  (progressRes.data || []).forEach((p: DBExternalCourseProgress) => progressMap.set(p.enrollment_id, p));

  const evidenceMap = new Map<string, DBExternalCourseEvidence[]>();
  (evidenceRes.data || []).forEach((ev: DBExternalCourseEvidence) => {
    const list = evidenceMap.get(ev.enrollment_id) || [];
    list.push(ev);
    evidenceMap.set(ev.enrollment_id, list);
  });

  const assignmentSummaries: FacultyAssignmentSummaryItem[] = [];
  const verificationQueue: VerificationQueueItem[] = [];

  let totalCompleted = 0;
  let totalPendingVerification = 0;

  (assignments || []).forEach((assign: any) => {
    const assignEnrollments = (enrollments || []).filter((e: any) => e.assignment_id === assign.id);
    let completedCount = 0;
    let inProgressCount = 0;
    let pendingCount = 0;

    const mappedEnrollments = assignEnrollments.map((e: any) => {
      const studentP = studentProfileMap.get(e.student_id) || null;
      const prog = progressMap.get(e.id) || null;
      const evList = evidenceMap.get(e.id) || [];
      const latestEv = evList[0] || null;

      if (e.status === 'COMPLETED') completedCount++;
      if (e.status === 'IN_PROGRESS') inProgressCount++;

      if (latestEv && latestEv.verification_status === 'PENDING') {
        pendingCount++;
        totalPendingVerification++;

        verificationQueue.push({
          evidence: latestEv,
          enrollment: e,
          assignment: assign,
          course: assign.course || assign.external_course,
          studentProfile: studentP,
          progress: prog
        });
      }

      return {
        enrollment: e,
        studentProfile: studentP,
        progress: prog,
        evidence: evList,
        latestEvidence: latestEv
      };
    });

    totalCompleted += completedCount;

    assignmentSummaries.push({
      assignment: assign,
      course: assign.course || assign.external_course || { title: 'External Course', platform: 'MOOC' },
      enrolledStudentsCount: assignEnrollments.length,
      completedCount,
      inProgressCount,
      pendingVerificationCount: pendingCount,
      enrollments: mappedEnrollments
    });
  });

  const totalAssigned = enrollments ? enrollments.length : 0;
  const completionRatePercent = totalAssigned ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

  return {
    metrics: {
      assignedCoursesCount: (courses || []).length,
      activeAssignmentsCount: (assignments || []).filter((a: any) => a.status === 'ACTIVE').length,
      totalStudentsAssigned: totalAssigned,
      pendingVerificationCount: totalPendingVerification,
      completionRatePercent
    },
    courses: courses || [],
    assignmentSummaries,
    verificationQueue
  };
};

export const getHODExternalLearningOverview = async (): Promise<HODExternalDashboardData> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authenticated HOD session required.');

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, department_id, department:departments(name)')
    .eq('id', user.id)
    .single();

  if (!profile || !['HOD', 'ADMIN'].includes(profile.role)) {
    throw new Error('An active HOD or Admin account is required for department overview.');
  }

  const deptId = profile.department_id;
  const deptName = profile.department?.name || 'Department';

  // 1. Fetch Department Assignments strictly via department_id RLS boundary
  let assignmentsQuery = (supabase as any)
    .from('external_course_assignments')
    .select('*, course:external_learning_courses(*)')
    .order('created_at', { ascending: false });

  if (deptId && profile.role !== 'ADMIN') {
    assignmentsQuery = assignmentsQuery.eq('department_id', deptId);
  }

  const { data: assignments, error: assignError } = await assignmentsQuery;
  if (assignError) throw new Error(`Unable to load department assignments: ${assignError.message}`);

  // Fetch all accessible courses
  const { data: courses } = await (supabase as any).from('external_learning_courses').select('*');

  const assignmentIds = (assignments || []).map((a: any) => a.id);

  if (!assignmentIds.length) {
    return {
      departmentId: deptId || '',
      departmentName: deptName,
      metrics: {
        activeAssignmentsCount: 0,
        totalStudentsAssigned: 0,
        inProgressCount: 0,
        completedCount: 0,
        pendingVerificationCount: 0,
        overdueCount: 0,
        completionRatePercent: 0
      },
      courses: courses || [],
      assignmentSummaries: [],
      studentMatrix: [],
      verificationQueue: []
    };
  }

  // 2. Fetch Enrollments
  const { data: enrollments, error: enrollError } = await (supabase as any)
    .from('external_course_enrollments')
    .select('*')
    .in('assignment_id', assignmentIds);

  if (enrollError) throw new Error(`Unable to load department enrollments: ${enrollError.message}`);

  const enrollmentIds = (enrollments || []).map((e: any) => e.id);
  const studentIds = [...new Set<string>((enrollments || []).map((e: any) => e.student_id))];

  // 3. Batch fetch profiles, progress, evidence
  const [profilesRes, progressRes, evidenceRes] = await Promise.all([
    studentIds.length ? (supabase as any).from('profiles').select('id, full_name, usn_or_employee_id, email, department_id').in('id', studentIds) : Promise.resolve({ data: [] }),
    enrollmentIds.length ? (supabase as any).from('external_course_progress').select('*').in('enrollment_id', enrollmentIds) : Promise.resolve({ data: [] }),
    enrollmentIds.length ? (supabase as any).from('external_course_evidence').select('*').in('enrollment_id', enrollmentIds).order('submitted_at', { ascending: false }) : Promise.resolve({ data: [] })
  ]);

  const studentProfileMap = new Map<string, any>();
  (profilesRes.data || []).forEach((p: any) => studentProfileMap.set(p.id, p));

  const progressMap = new Map<string, DBExternalCourseProgress>();
  (progressRes.data || []).forEach((p: DBExternalCourseProgress) => progressMap.set(p.enrollment_id, p));

  const evidenceMap = new Map<string, DBExternalCourseEvidence[]>();
  (evidenceRes.data || []).forEach((ev: DBExternalCourseEvidence) => {
    const list = evidenceMap.get(ev.enrollment_id) || [];
    list.push(ev);
    evidenceMap.set(ev.enrollment_id, list);
  });

  // Calculate Metrics & Matrices
  const assignmentSummaries: FacultyAssignmentSummaryItem[] = [];
  const studentMatrix: HODStudentMatrixItem[] = [];
  const verificationQueue: VerificationQueueItem[] = [];

  let totalStudentsAssigned = 0;
  let totalInProgress = 0;
  let totalCompleted = 0;
  let totalPendingVerification = 0;
  let totalOverdue = 0;

  const now = new Date();

  (assignments || []).forEach((assign: any) => {
    const assignEnrollments = (enrollments || []).filter((e: any) => e.assignment_id === assign.id);
    let completedCount = 0;
    let inProgressCount = 0;
    let pendingCount = 0;

    const deadlineDate = assign.deadline ? new Date(assign.deadline) : null;

    const mappedEnrollments = assignEnrollments.map((e: any) => {
      totalStudentsAssigned++;
      const studentP = studentProfileMap.get(e.student_id) || null;
      const prog = progressMap.get(e.id) || null;
      const evList = evidenceMap.get(e.id) || [];
      const latestEv = evList[0] || null;

      const isOverdue = Boolean(deadlineDate && deadlineDate < now && e.status !== 'COMPLETED' && e.status !== 'CANCELLED');

      if (e.status === 'COMPLETED') {
        completedCount++;
        totalCompleted++;
      } else if (e.status === 'IN_PROGRESS') {
        inProgressCount++;
        totalInProgress++;
      }

      if (isOverdue) totalOverdue++;

      if (latestEv && latestEv.verification_status === 'PENDING') {
        pendingCount++;
        totalPendingVerification++;

        verificationQueue.push({
          evidence: latestEv,
          enrollment: e,
          assignment: assign,
          course: assign.course || assign.external_course,
          studentProfile: studentP,
          progress: prog
        });
      }

      studentMatrix.push({
        enrollment: e,
        assignment: assign,
        course: assign.course || assign.external_course,
        studentProfile: studentP,
        progress: prog,
        latestEvidence: latestEv,
        isOverdue
      });

      return {
        enrollment: e,
        studentProfile: studentP,
        progress: prog,
        evidence: evList,
        latestEvidence: latestEv
      };
    });

    assignmentSummaries.push({
      assignment: assign,
      course: assign.course || assign.external_course || { title: 'External Course', platform: 'MOOC' },
      enrolledStudentsCount: assignEnrollments.length,
      completedCount,
      inProgressCount,
      pendingVerificationCount: pendingCount,
      enrollments: mappedEnrollments
    });
  });

  // Calculate completion rate excluding CANCELLED enrollments
  const activeEnrollmentsCount = (enrollments || []).filter((e: any) => e.status !== 'CANCELLED').length;
  const completionRatePercent = activeEnrollmentsCount ? Math.round((totalCompleted / activeEnrollmentsCount) * 100) : 0;

  return {
    departmentId: deptId || '',
    departmentName: deptName,
    metrics: {
      activeAssignmentsCount: (assignments || []).filter((a: any) => a.status === 'ACTIVE').length,
      totalStudentsAssigned,
      inProgressCount: totalInProgress,
      completedCount: totalCompleted,
      pendingVerificationCount: totalPendingVerification,
      overdueCount: totalOverdue,
      completionRatePercent
    },
    courses: courses || [],
    assignmentSummaries,
    studentMatrix,
    verificationQueue
  };
};

export const createExternalLearningCourse = async (courseData: {
  title: string;
  platform: string;
  provider_name?: string;
  external_url: string;
  description?: string;
  course_code?: string;
  category?: string;
  difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  estimated_hours?: number;
}): Promise<DBExternalLearningCourse> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authenticated faculty session required.');

  if (!courseData.title?.trim()) throw new Error('Course title is required.');
  if (!courseData.platform?.trim()) throw new Error('Course platform is required.');
  if (!courseData.external_url?.trim()) throw new Error('External course URL is required.');

  if (!/^https?:\/\/.+/i.test(courseData.external_url.trim())) {
    throw new Error('External URL must start with http:// or https://');
  }

  if (courseData.estimated_hours != null && courseData.estimated_hours < 0) {
    throw new Error('Estimated hours must be greater than or equal to 0.');
  }

  const payload = {
    title: courseData.title.trim(),
    platform: courseData.platform.trim(),
    provider_name: courseData.provider_name?.trim() || null,
    external_url: courseData.external_url.trim(),
    description: courseData.description?.trim() || null,
    course_code: courseData.course_code?.trim() || null,
    category: courseData.category?.trim() || null,
    difficulty: courseData.difficulty || 'BEGINNER',
    estimated_hours: courseData.estimated_hours ?? null,
    created_by: user.id,
    is_active: true
  };

  const { data, error } = await (supabase as any)
    .from('external_learning_courses')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(`Unable to create external course: ${error.message}`);
  return data;
};

export const createExternalCourseAssignment = async (assignmentData: {
  external_course_id: string;
  department_id: string;
  academic_course_id?: string;
  semester?: number;
  section?: string;
  academic_year?: string;
  required?: boolean;
  assigned_date?: string;
  deadline?: string;
  instructions?: string;
}): Promise<DBExternalCourseAssignment> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authenticated faculty session required.');

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['FACULTY', 'HOD', 'ADMIN'].includes(profile.role)) {
    throw new Error('Only faculty, HOD, or admin accounts can create assignments.');
  }

  if (profile.role !== 'ADMIN' && profile.department_id && profile.department_id !== assignmentData.department_id) {
    throw new Error('You are not authorized to create assignments outside your designated department.');
  }

  // Invoke secure SECURITY DEFINER RPC for server-authoritative assignment creation and cohort auto-enrollment
  const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc(
    'create_external_course_assignment_with_enrollment',
    {
      p_external_course_id: assignmentData.external_course_id,
      p_department_id: assignmentData.department_id,
      p_academic_course_id: assignmentData.academic_course_id?.trim() || null,
      p_semester: assignmentData.semester ?? null,
      p_section: assignmentData.section?.trim() || null,
      p_academic_year: assignmentData.academic_year?.trim() || null,
      p_required: assignmentData.required ?? false,
      p_assigned_date: assignmentData.assigned_date || new Date().toISOString().split('T')[0],
      p_deadline: assignmentData.deadline ? new Date(assignmentData.deadline).toISOString() : null,
      p_instructions: assignmentData.instructions?.trim() || null
    }
  );

  if (rpcErr) {
    throw new Error(`Unable to create assignment: ${rpcErr.message}`);
  }

  return rpcRes.assignment;
};

export const updateFacultyStudentProgress = async (
  enrollmentId: string,
  progressData: {
    progress_percent: number;
    completed_modules?: number | null;
    total_modules?: number | null;
    completed_quizzes?: number | null;
    total_quizzes?: number | null;
    completed_assignments?: number | null;
    total_assignments?: number | null;
  }
): Promise<DBExternalCourseProgress> => {
  if (progressData.progress_percent < 0 || progressData.progress_percent > 100) {
    throw new Error('Progress percentage must be between 0 and 100.');
  }

  const payload = {
    enrollment_id: enrollmentId,
    progress_percent: progressData.progress_percent,
    completed_modules: progressData.completed_modules ?? null,
    total_modules: progressData.total_modules ?? null,
    completed_quizzes: progressData.completed_quizzes ?? null,
    total_quizzes: progressData.total_quizzes ?? null,
    completed_assignments: progressData.completed_assignments ?? null,
    total_assignments: progressData.total_assignments ?? null,
    last_activity_at: new Date().toISOString(),
    source: 'FACULTY_UPDATED'
  };

  const { data, error } = await (supabase as any)
    .from('external_course_progress')
    .upsert(payload, { onConflict: 'enrollment_id' })
    .select()
    .single();

  if (error) throw new Error(`Unable to update student progress: ${error.message}`);

  if (progressData.progress_percent > 0) {
    const { data: enrollment } = await (supabase as any)
      .from('external_course_enrollments')
      .select('status')
      .eq('id', enrollmentId)
      .single();

    if (enrollment && enrollment.status === 'ASSIGNED') {
      await (supabase as any)
        .from('external_course_enrollments')
        .update({
          status: 'IN_PROGRESS',
          started_at: new Date().toISOString()
        })
        .eq('id', enrollmentId);
    }
  }

  return data;
};

export const verifyOrRejectEvidence = async (
  evidenceId: string,
  status: 'VERIFIED' | 'REJECTED',
  notes?: string
): Promise<{ success: boolean; status: string }> => {
  if (status === 'REJECTED' && !notes?.trim()) {
    throw new Error('A verification note explaining the rejection reason is required.');
  }

  const { data, error } = await (supabase as any).rpc('verify_external_course_evidence', {
    p_evidence_id: evidenceId,
    p_status: status,
    p_notes: notes?.trim() || null
  });

  if (error) throw new Error(`Verification action failed: ${error.message}`);
  return data;
};

export const getMyExternalCourseProgress = async (enrollmentId: string): Promise<DBExternalCourseProgress | null> => {
  const { data, error } = await (supabase as any)
    .from('external_course_progress')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .maybeSingle();

  if (error) throw new Error(`Unable to fetch progress: ${error.message}`);
  return data;
};

export const getMyExternalCourseEvidence = async (enrollmentId: string): Promise<DBExternalCourseEvidence[]> => {
  const { data, error } = await (supabase as any)
    .from('external_course_evidence')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .order('submitted_at', { ascending: false });

  if (error) throw new Error(`Unable to fetch evidence: ${error.message}`);
  return data || [];
};

export const verifyExternalCourseEvidence = async (
  evidenceId: string,
  status: 'VERIFIED' | 'REJECTED',
  notes?: string
): Promise<{ success: boolean; status: string }> => {
  return verifyOrRejectEvidence(evidenceId, status, notes);
};
