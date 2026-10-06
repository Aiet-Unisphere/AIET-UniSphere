import { supabase } from '../lib/supabase';
import type { Assignment } from '../data/assignments';
export type { Assignment };
import { 
  STORAGE_BUCKETS, 
  uploadFile, 
  getSignedUrl, 
  downloadStorageFile, 
  sanitizeFileName 
} from './storageService';

export interface FacultyAssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  usn: string;
  submittedAt: string;
  fileName: string;
  storagePath?: string;
  fileSize?: number;
  mimeType?: string;
  status: 'Submitted' | 'Graded';
  marks?: number;
  feedback?: string;
}

export interface CreateAssignmentPayload {
  title: string;
  courseId: string;
  courseName: string;
  deadline: string;
  marks: number;
  instructions: string;
  resources?: string[];
  rubric?: string[];
  file?: File;
}

export interface ExtendedAssignment extends Assignment {
  submittedCount: number;
  totalEnrolledCount: number;
  effectiveStatus: 'Draft' | 'Active' | 'Pending' | 'Closed';
}

export const getAssignments = async (): Promise<Assignment[]> => {
  try {
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) return [];

    // Query profile for student department
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('department_id')
      .eq('id', user.id)
      .single();

    if (!profile?.department_id) return [];

    // Fetch assignments for department
    const { data: assignmentsData, error } = await (supabase as any)
      .from('assignments')
      .select('*')
      .eq('department_id', profile.department_id)
      .order('created_at', { ascending: false });

    if (error || !assignmentsData) {
      console.error('Error fetching student assignments:', error);
      return [];
    }

    // Fetch student's submissions
    const { data: submissionsData } = await (supabase as any)
      .from('assignment_submissions')
      .select('*')
      .eq('student_id', user.id);

    const submissionsMap = new Map((submissionsData || []).map((s: any) => [s.assignment_id, s]));

    return assignmentsData.map((a: any) => {
      const sub: any = submissionsMap.get(a.id);
      let status: Assignment['status'] = 'Pending';
      const isPastDeadline = new Date(a.deadline) < new Date();

      if (sub) {
        status = sub.status === 'Graded' ? 'Graded' : 'Submitted';
      } else if (isPastDeadline) {
        status = 'Overdue';
      }

      return {
        id: a.id,
        title: a.title,
        courseId: a.course_id,
        courseName: a.course_name,
        deadline: a.deadline,
        marks: Number(a.marks),
        status,
        instructions: a.instructions || a.description || '',
        resources: Array.isArray(a.resources) ? a.resources : [],
        rubric: Array.isArray(a.rubric) ? a.rubric : [],
        storagePath: a.storage_path || undefined,
        fileName: a.file_name || undefined,
        fileSize: a.file_size ? Number(a.file_size) : undefined,
        mimeType: a.mime_type || undefined,
        submittedFile: sub ? { 
          name: sub.file_name, 
          submittedAt: sub.submitted_at,
          storagePath: sub.storage_path || undefined,
          fileSize: sub.file_size ? Number(sub.file_size) : undefined,
          mimeType: sub.mime_type || undefined
        } : undefined,
        grade: sub?.status === 'Graded' ? {
          score: Number(sub.marks || 0),
          feedback: sub.feedback || '',
          gradedBy: 'Faculty Evaluator'
        } : undefined
      };
    });
  } catch (err) {
    console.error('Failed to query assignments:', err);
    return [];
  }
};

export const getFacultyAssignments = async (): Promise<ExtendedAssignment[]> => {
  try {
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) return [];

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('department_id')
      .eq('id', user.id)
      .single();

    if (!profile?.department_id) return [];

    const { data: assignmentsData, error } = await (supabase as any)
      .from('assignments')
      .select('*')
      .or(`department_id.eq.${profile.department_id},created_by.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error || !assignmentsData || assignmentsData.length === 0) return [];

    const assignmentIds = assignmentsData.map((a: any) => a.id);

    // Fetch real submission counts for all assignments
    const { data: subsData } = await (supabase as any)
      .from('assignment_submissions')
      .select('assignment_id, status')
      .in('assignment_id', assignmentIds);

    const submissionCountMap = new Map<string, number>();
    const pendingCountMap = new Map<string, number>();

    (subsData || []).forEach((s: any) => {
      submissionCountMap.set(s.assignment_id, (submissionCountMap.get(s.assignment_id) || 0) + 1);
      if (s.status === 'Submitted') {
        pendingCountMap.set(s.assignment_id, (pendingCountMap.get(s.assignment_id) || 0) + 1);
      }
    });

    // Fetch department student count for enrollment totals
    const { count: deptStudentCount } = await (supabase as any)
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', profile.department_id)
      .eq('role', 'STUDENT');

    const now = new Date();

    return assignmentsData.map((a: any) => {
      const subCount = submissionCountMap.get(a.id) || 0;
      const pendingCount = pendingCountMap.get(a.id) || 0;
      const deadlineDate = new Date(a.deadline);
      const isPastDeadline = now > deadlineDate;

      let effectiveStatus: 'Draft' | 'Active' | 'Pending' | 'Closed';
      if (a.status === 'Draft') {
        effectiveStatus = 'Draft';
      } else if (isPastDeadline) {
        effectiveStatus = 'Closed';
      } else if (pendingCount > 0) {
        effectiveStatus = 'Pending';
      } else {
        effectiveStatus = 'Active';
      }

      return {
        id: a.id,
        title: a.title,
        courseId: a.course_id,
        courseName: a.course_name,
        deadline: a.deadline,
        marks: Number(a.marks),
        status: effectiveStatus === 'Closed' ? 'Overdue' : effectiveStatus === 'Pending' ? 'Submitted' : 'Active',
        instructions: a.instructions || a.description || '',
        resources: Array.isArray(a.resources) ? a.resources : [],
        rubric: Array.isArray(a.rubric) ? a.rubric : [],
        storagePath: a.storage_path || undefined,
        fileName: a.file_name || undefined,
        fileSize: a.file_size ? Number(a.file_size) : undefined,
        mimeType: a.mime_type || undefined,
        submittedCount: subCount,
        totalEnrolledCount: deptStudentCount || 0,
        effectiveStatus
      };
    });
  } catch (err) {
    console.error('Failed to query faculty assignments:', err);
    return [];
  }
};

export const getAssignmentById = async (id: string): Promise<Assignment | undefined> => {
  try {
    const { data: a, error } = await (supabase as any)
      .from('assignments')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !a) return undefined;

    const { data: { user } } = await (supabase as any).auth.getUser();
    let sub: any = null;
    if (user) {
      const { data } = await (supabase as any)
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', id)
        .eq('student_id', user.id)
        .maybeSingle();
      sub = data;
    }

    let status: Assignment['status'] = 'Pending';
    if (sub) {
      status = sub.status === 'Graded' ? 'Graded' : 'Submitted';
    } else if (new Date(a.deadline) < new Date()) {
      status = 'Overdue';
    }

    return {
      id: a.id,
      title: a.title,
      courseId: a.course_id,
      courseName: a.course_name,
      deadline: a.deadline,
      marks: Number(a.marks),
      status,
      instructions: a.instructions || '',
      resources: Array.isArray(a.resources) ? a.resources : [],
      rubric: Array.isArray(a.rubric) ? a.rubric : [],
      storagePath: a.storage_path || undefined,
      fileName: a.file_name || undefined,
      fileSize: a.file_size ? Number(a.file_size) : undefined,
      mimeType: a.mime_type || undefined,
      submittedFile: sub ? { 
        name: sub.file_name, 
        submittedAt: sub.submitted_at,
        storagePath: sub.storage_path || undefined,
        fileSize: sub.file_size ? Number(sub.file_size) : undefined,
        mimeType: sub.mime_type || undefined
      } : undefined,
      grade: sub?.status === 'Graded' ? {
        score: Number(sub.marks || 0),
        feedback: sub.feedback || '',
        gradedBy: 'Faculty Evaluator'
      } : undefined
    };
  } catch (err) {
    console.error('Failed to query assignment by id:', err);
    return undefined;
  }
};

/**
 * Submits an assignment with real Supabase Storage upload.
 */
export const submitAssignment = async (
  assignmentId: string, 
  fileOrName: File | string
): Promise<Assignment> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  // 1. Fetch assignment to derive department_id, course_id, and deadline
  const { data: assignment, error: aErr } = await (supabase as any)
    .from('assignments')
    .select('id, course_id, department_id, deadline')
    .eq('id', assignmentId)
    .single();

  if (aErr || !assignment) {
    throw new Error("Assignment not found or inaccessible.");
  }

  // Enforce server-side deadline restriction
  if (assignment.deadline && new Date() > new Date(assignment.deadline)) {
    throw new Error("Submission deadline has passed. This assignment is closed for new submissions.");
  }

  let fileName: string;
  let storagePath: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;

  if (typeof fileOrName === 'object' && fileOrName instanceof File) {
    const file = fileOrName;
    fileName = file.name;
    fileSize = file.size;
    mimeType = file.type || 'application/octet-stream';
    const safeName = sanitizeFileName(file.name);

    // Predictable path: submissions/{department_id}/{course_id}/{assignment_id}/{student_id}/{file_name}
    storagePath = `${assignment.department_id}/${assignment.course_id}/${assignmentId}/${user.id}/${safeName}`;

    // Upload to Supabase Storage
    await uploadFile({
      bucket: STORAGE_BUCKETS.SUBMISSIONS,
      path: storagePath,
      file,
      upsert: true
    });
  } else {
    fileName = fileOrName;
  }

  const { data: existing } = await (supabase as any)
    .from('assignment_submissions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle();

  const submissionPayload = {
    file_name: fileName,
    storage_path: storagePath,
    file_size: fileSize,
    mime_type: mimeType,
    submitted_at: new Date().toISOString(),
    status: 'Submitted'
  };

  if (existing) {
    const { error: upErr } = await (supabase as any)
      .from('assignment_submissions')
      .update(submissionPayload)
      .eq('id', existing.id);

    if (upErr) throw new Error(upErr.message || "Failed to update submission record.");
  } else {
    const { error: inErr } = await (supabase as any)
      .from('assignment_submissions')
      .insert({
        assignment_id: assignmentId,
        student_id: user.id,
        ...submissionPayload
      });

    if (inErr) throw new Error(inErr.message || "Failed to create submission record.");
  }

  const updated = await getAssignmentById(assignmentId);
  if (!updated) throw new Error("Assignment submission completed but reload failed.");
  return updated;
};

/**
 * Creates an assignment with optional file upload (question paper/specifications) to Supabase Storage.
 */
export const createAssignment = async (payload: CreateAssignmentPayload): Promise<Assignment> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  // Get current user's profile to resolve department_id
  const { data: profile, error: profErr } = await (supabase as any)
    .from('profiles')
    .select('department_id')
    .eq('id', user.id)
    .single();

  if (profErr || !profile?.department_id) {
    throw new Error("No active department assigned to your profile. Cannot create assignment.");
  }

  // Generate UUID for assignment
  const tempAssignmentId = crypto.randomUUID ? crypto.randomUUID() : `assg-${Date.now()}`;

  let storagePath: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;

  if (payload.file) {
    fileName = payload.file.name;
    fileSize = payload.file.size;
    mimeType = payload.file.type || 'application/pdf';
    const safeName = sanitizeFileName(payload.file.name);

    // Predictable path: assignments/{department_id}/{course_id}/{assignment_id}/{file_name}
    storagePath = `${profile.department_id}/${payload.courseId}/${tempAssignmentId}/${safeName}`;

    await uploadFile({
      bucket: STORAGE_BUCKETS.ASSIGNMENTS,
      path: storagePath,
      file: payload.file,
      upsert: true
    });
  }

  const resourcesList = payload.resources ? [...payload.resources] : [];
  if (fileName && !resourcesList.includes(fileName)) {
    resourcesList.push(fileName);
  }

  const { data, error } = await (supabase as any)
    .from('assignments')
    .insert({
      id: tempAssignmentId,
      title: payload.title,
      course_id: payload.courseId,
      course_name: payload.courseName,
      instructions: payload.instructions,
      deadline: payload.deadline,
      marks: payload.marks,
      department_id: profile.department_id,
      created_by: user.id,
      status: 'Active',
      storage_path: storagePath,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      resources: resourcesList,
      rubric: payload.rubric || [
        "Technical Accuracy & Completeness (10 Marks)",
        "Code/Document Formatting & Structure (5 Marks)",
        "Timely Submission (5 Marks)"
      ]
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create assignment.");
  }

  return {
    id: data.id,
    title: data.title,
    courseId: data.course_id,
    courseName: data.course_name,
    deadline: data.deadline,
    marks: Number(data.marks),
    status: 'Pending',
    instructions: data.instructions || '',
    storagePath: data.storage_path || undefined,
    fileName: data.file_name || undefined,
    fileSize: data.file_size ? Number(data.file_size) : undefined,
    mimeType: data.mime_type || undefined,
    resources: Array.isArray(data.resources) ? data.resources : [],
    rubric: Array.isArray(data.rubric) ? data.rubric : []
  };
};

export const getSubmissionsForAssignment = async (assignmentId: string): Promise<FacultyAssignmentSubmission[]> => {
  try {
    const { data: subsData, error: subsError } = await (supabase as any)
      .from('assignment_submissions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('submitted_at', { ascending: false });

    if (subsError || !subsData) {
      console.error('Error fetching submissions:', subsError);
      return [];
    }

    if (subsData.length === 0) return [];

    // Extract unique student IDs
    const studentIds = Array.from(new Set(subsData.map((s: any) => s.student_id))).filter(Boolean);
    const profileMap = new Map<string, { full_name: string | null; usn_or_employee_id: string | null }>();

    if (studentIds.length > 0) {
      const { data: profilesData } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, usn_or_employee_id')
        .in('id', studentIds);

      if (profilesData) {
        profilesData.forEach((p: any) => {
          profileMap.set(p.id, {
            full_name: p.full_name,
            usn_or_employee_id: p.usn_or_employee_id
          });
        });
      }
    }

    return subsData.map((s: any) => {
      const studentProfile = profileMap.get(s.student_id);
      return {
        id: s.id,
        assignmentId: s.assignment_id,
        studentId: s.student_id,
        studentName: studentProfile?.full_name || 'Student',
        usn: studentProfile?.usn_or_employee_id || 'N/A',
        submittedAt: s.submitted_at,
        fileName: s.file_name,
        storagePath: s.storage_path || undefined,
        fileSize: s.file_size ? Number(s.file_size) : undefined,
        mimeType: s.mime_type || undefined,
        status: s.status,
        marks: s.marks ? Number(s.marks) : undefined,
        feedback: s.feedback || undefined
      };
    });
  } catch (err) {
    console.error('Error fetching submissions:', err);
    return [];
  }
};

export const gradeSubmission = async (
  assignmentId: string,
  submissionId: string,
  marks: number,
  feedback: string,
  gradedBy: string = "Faculty Evaluator"
): Promise<FacultyAssignmentSubmission> => {
  const { data: { user } } = await (supabase as any).auth.getUser();

  const { data: updatedSub, error } = await (supabase as any)
    .from('assignment_submissions')
    .update({
      status: 'Graded',
      marks,
      feedback,
      graded_by: user?.id || null,
      graded_at: new Date().toISOString()
    })
    .eq('id', submissionId)
    .select('*')
    .single();

  if (error || !updatedSub) throw new Error(error?.message || "Failed to grade submission.");

  // Fetch student profile info
  let studentName = 'Student';
  let usn = 'N/A';
  if (updatedSub.student_id) {
    const { data: prof } = await (supabase as any)
      .from('profiles')
      .select('full_name, usn_or_employee_id')
      .eq('id', updatedSub.student_id)
      .maybeSingle();

    if (prof) {
      studentName = prof.full_name || 'Student';
      usn = prof.usn_or_employee_id || 'N/A';
    }
  }

  return {
    id: updatedSub.id,
    assignmentId: updatedSub.assignment_id,
    studentId: updatedSub.student_id,
    studentName,
    usn,
    submittedAt: updatedSub.submitted_at,
    fileName: updatedSub.file_name,
    storagePath: updatedSub.storage_path || undefined,
    fileSize: updatedSub.file_size ? Number(updatedSub.file_size) : undefined,
    mimeType: updatedSub.mime_type || undefined,
    status: updatedSub.status,
    marks: Number(updatedSub.marks),
    feedback: updatedSub.feedback || undefined
  };
};

/**
 * Helper to download an assignment question paper / attachment via Supabase Storage.
 */
export const downloadAssignmentFile = async (storagePath: string, fileName?: string): Promise<void> => {
  await downloadStorageFile(STORAGE_BUCKETS.ASSIGNMENTS, storagePath, fileName);
};

/**
 * Helper to download a student submission via Supabase Storage.
 */
export const downloadSubmissionFile = async (storagePath: string, fileName?: string): Promise<void> => {
  await downloadStorageFile(STORAGE_BUCKETS.SUBMISSIONS, storagePath, fileName);
};

/**
 * Get signed URL for assignment file
 */
export const getAssignmentFileUrl = async (storagePath: string): Promise<string | null> => {
  return await getSignedUrl(STORAGE_BUCKETS.ASSIGNMENTS, storagePath, 3600);
};

/**
 * Get signed URL for submission file
 */
export const getSubmissionFileUrl = async (storagePath: string): Promise<string | null> => {
  return await getSignedUrl(STORAGE_BUCKETS.SUBMISSIONS, storagePath, 3600);
};
