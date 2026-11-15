import { supabase } from '../lib/supabase';
import type { LeaveRequest } from '../data/leaveRequests';
export type { LeaveRequest };
import { 
  STORAGE_BUCKETS, 
  uploadFile, 
  getSignedUrl, 
  downloadStorageFile, 
  sanitizeFileName 
} from './storageService';

const isUuid = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

/**
 * Map a raw Supabase leave_requests row into our frontend LeaveRequest shape.
 * Handles snake_case → camelCase, status normalization, and day calculation.
 */
const mapLeaveRow = (l: any): LeaveRequest => {
  const sDate = new Date(l.start_date);
  const eDate = new Date(l.end_date);
  const diffTime = Math.abs(eDate.getTime() - sDate.getTime());
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // Normalize status: DB stores PENDING/APPROVED/REJECTED, frontend uses Pending/Approved/Rejected
  const rawStatus = (l.status || 'PENDING').toString();
  const statusFormatted = (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase()) as any;

  // Resolve student name from joined profile or fallback
  const studentName = l.student_profile?.full_name || l.student_name || 'Student';
  const studentUsn = l.student_profile?.usn_or_employee_id || l.student_usn || 'N/A';
  const studentEmail = l.student_profile?.email || undefined;
  const deptName = l.student_profile?.department?.name || l.department_name || 'Department';
  const reviewerName = l.reviewer_profile?.full_name || undefined;

  const docName = l.supporting_doc_name || (l.leave_attachments && l.leave_attachments[0]?.file_name) || undefined;
  const docPath = l.supporting_doc_path || (l.leave_attachments && l.leave_attachments[0]?.storage_path) || undefined;
  const docSize = l.supporting_doc_size || (l.leave_attachments && l.leave_attachments[0]?.file_size) || undefined;
  const docType = l.supporting_doc_type || (l.leave_attachments && l.leave_attachments[0]?.mime_type) || undefined;

  return {
    id: l.reference_id || l.id,
    dbId: l.id,
    requesterId: l.student_id,
    requesterName: l.student_name_snapshot || studentName,
    requesterUsnOrEmpId: l.student_usn_snapshot || studentUsn,
    requesterRole: 'STUDENT',
    requesterEmail: studentEmail,
    departmentId: l.department_id,
    departmentName: l.branch_snapshot || deptName,
    leaveType: l.leave_type || 'General',
    startDate: l.start_date,
    endDate: l.end_date,
    days: isNaN(days) ? 1 : days,
    reason: l.reason,
    status: statusFormatted,
    submittedAt: new Date(l.created_at).toLocaleDateString(),
    reviewedBy: l.reviewed_by ? (reviewerName || 'HOD') : undefined,
    reviewerName: reviewerName || undefined,
    reviewedAt: l.reviewed_at ? new Date(l.reviewed_at).toLocaleDateString() : undefined,
    remark: l.rejection_reason || undefined,
    rejectionReason: l.rejection_reason || undefined,
    approvalRemarks: l.approval_remarks || undefined,
    supportingDocument: docName,
    supportingDocName: docName,
    supportingDocPath: docPath,
    supportingDocSize: docSize ? Number(docSize) : undefined,
    supportingDocType: docType,
    semester: l.semester_snapshot ?? null,
    cgpa: l.student_academic?.cgpa ?? null,
    studentNameSnapshot: l.student_name_snapshot || undefined,
    studentUsnSnapshot: l.student_usn_snapshot || undefined,
    branchSnapshot: l.branch_snapshot || undefined,
    sectionSnapshot: l.section_snapshot || undefined,
    semesterSnapshot: l.semester_snapshot ?? undefined,
    academicYearSnapshot: l.academic_year_snapshot || undefined,
    studentPhoneSnapshot: l.student_phone_snapshot || undefined,
    parentPhoneSnapshot: l.parent_phone_snapshot || undefined,
    snapshotProvenance: l.snapshot_provenance || (l.student_name_snapshot ? 'SUBMISSION' : 'UNVERIFIED')
  };
};

// ============================================================
// STUDENT: Get own leave requests
// ============================================================
export const getStudentLeaveRequests = async (): Promise<LeaveRequest[]> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) {
    console.warn('[leaveService] No authenticated user for getStudentLeaveRequests');
    return [];
  }

  // Try with joins first
  let data: any[] | null = null;
  let error: any = null;

  const joinResult = await (supabase as any)
    .from('leave_requests')
    .select(`
      *,
      student_profile:profiles!leave_requests_student_id_fkey(full_name, usn_or_employee_id, email, role, department:departments(name, code)),
      reviewer_profile:profiles!leave_requests_reviewed_by_fkey(full_name),
      leave_attachments(id, file_name, storage_path, file_size, mime_type)
    `)
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });

  data = joinResult.data;
  error = joinResult.error;

  // If join fails, try simple query
  if (error) {
    console.warn('[leaveService] Join query failed, trying simple query:', error.message);

    const simpleResult = await (supabase as any)
      .from('leave_requests')
      .select('*, leave_attachments(id, file_name, storage_path, file_size, mime_type)')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false });

    data = simpleResult.data;
    error = simpleResult.error;
  }

  if (error) {
    console.error('[leaveService] getStudentLeaveRequests FINAL ERROR:', error);
    throw new Error(`Unable to load leave requests: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map(mapLeaveRow);
};

// ============================================================
// HOD: Get department leave requests
// ============================================================
export const getDepartmentLeaveRequests = async (): Promise<LeaveRequest[]> => {
  const { data: { user }, error: userError } = await (supabase as any).auth.getUser();
  if (userError || !user) {
    console.warn('[leaveService] No authenticated user for getDepartmentLeaveRequests:', userError?.message);
    throw new Error('Authentication session required. Please sign in to view department leave requests.');
  }

  // Get HOD's profile to find their department
  const { data: profile, error: profErr } = await (supabase as any)
    .from('profiles')
    .select('department_id, role, account_status')
    .eq('id', user.id)
    .single();

  if (profErr) {
    console.error('[leaveService] HOD profile query failed:', profErr.message);
    throw new Error(`Unable to load HOD profile: ${profErr.message}`);
  }

  if (!profile?.department_id) {
    console.warn('[leaveService] HOD profile has no department_id assigned');
    throw new Error('DEPARTMENT_NOT_ASSIGNED: Your HOD account is not assigned to an academic department. Please contact an Administrator to configure your department profile.');
  }

  // Try with joins first
  let data: any[] | null = null;
  let error: any = null;

  const joinResult = await (supabase as any)
    .from('leave_requests')
    .select(`
      *,
      student_profile:profiles!leave_requests_student_id_fkey(full_name, usn_or_employee_id, email, role, department:departments(name, code)),
      reviewer_profile:profiles!leave_requests_reviewed_by_fkey(full_name),
      leave_attachments(id, file_name, storage_path, file_size, mime_type)
    `)
    .eq('department_id', profile.department_id)
    .order('created_at', { ascending: false });

  data = joinResult.data;
  error = joinResult.error;

  // If join fails (e.g. schema cache or missing reviewer FK constraint), fallback to simple query
  if (error) {
    console.warn('[leaveService] HOD join query failed, attempting standard query with independent profile resolution:', error.message);

    const simpleResult = await (supabase as any)
      .from('leave_requests')
      .select('*, leave_attachments(id, file_name, storage_path, file_size, mime_type)')
      .eq('department_id', profile.department_id)
      .order('created_at', { ascending: false });

    data = simpleResult.data;
    error = simpleResult.error;
  }

  if (error) {
    console.error('[leaveService] getDepartmentLeaveRequests query error:', error);
    throw new Error(`Unable to load department leave requests: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Independent profile enrichment for student and reviewer details
  const needsEnrichment = data.length > 0 && (!data[0].student_profile || data.some((r: any) => r.reviewed_by && !r.reviewer_profile));
  if (needsEnrichment) {
    const studentIds = [...new Set(data.map((r: any) => r.student_id).filter(Boolean))];
    const reviewerIds = [...new Set(data.map((r: any) => r.reviewed_by).filter(Boolean))];
    const allIds = [...new Set([...studentIds, ...reviewerIds])];

    if (allIds.length > 0) {
      try {
        const { data: profiles, error: pError } = await (supabase as any)
          .from('profiles')
          .select('id, full_name, usn_or_employee_id, email, department:departments(name)')
          .in('id', allIds);

        if (!pError && profiles) {
          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

          data = data.map((row: any) => ({
            ...row,
            student_profile: row.student_profile || profileMap.get(row.student_id) || null,
            reviewer_profile: row.reviewer_profile || profileMap.get(row.reviewed_by) || null,
            student_name: row.student_profile?.full_name || (profileMap.get(row.student_id) as any)?.full_name || 'Student',
            student_usn: row.student_profile?.usn_or_employee_id || (profileMap.get(row.student_id) as any)?.usn_or_employee_id || 'N/A',
            department_name: row.student_profile?.department?.name || (profileMap.get(row.student_id) as any)?.department?.name || 'Department'
          }));
        }
      } catch (enrichErr) {
        console.warn('[leaveService] Non-fatal profile enrichment note:', enrichErr);
      }
    }
  }

  return data.map(mapLeaveRow);
};

export const getAllLeaveRequests = async (): Promise<LeaveRequest[]> => {
  return getStudentLeaveRequests();
};

// ============================================================
// Get single leave request by ID or reference_id
// ============================================================
export const getLeaveRequestById = async (idOrUuid: string): Promise<LeaveRequest | null> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  // Get caller profile for department scoping
  const { data: callerProfile } = await (supabase as any)
    .from('profiles')
    .select('id, role, department_id')
    .eq('id', user.id)
    .single();

  if (!callerProfile) throw new Error("User profile not found.");

  // Build query
  let baseQuery = (supabase as any)
    .from('leave_requests')
    .select('*, leave_attachments(id, file_name, storage_path, file_size, mime_type)');

  if (isUuid(idOrUuid)) {
    baseQuery = baseQuery.eq('id', idOrUuid);
  } else {
    baseQuery = baseQuery.eq('reference_id', idOrUuid);
  }

  const { data: l, error } = await baseQuery.single();

  if (error || !l) {
    console.error("[leaveService] getLeaveRequestById error:", error);
    return null;
  }

  // Security: HOD can only view their own department's requests
  if (callerProfile.role === 'HOD' && l.department_id !== callerProfile.department_id) {
    throw new Error("ACCESS DENIED: You are only authorized to review leave requests for your own department.");
  }

  // Enrich with student profile
  const { data: studentProf } = await (supabase as any)
    .from('profiles')
    .select('full_name, usn_or_employee_id, email, department:departments(name)')
    .eq('id', l.student_id)
    .single();

  // Enrich with reviewer profile
  let reviewerProf = null;
  if (l.reviewed_by) {
    const { data: rp } = await (supabase as any)
      .from('profiles')
      .select('full_name')
      .eq('id', l.reviewed_by)
      .single();
    reviewerProf = rp;
  }

  // Fetch academic info
  const { data: academicProf } = await (supabase as any)
    .from('student_profiles')
    .select('semester, cgpa')
    .eq('profile_id', l.student_id)
    .maybeSingle();

  return mapLeaveRow({
    ...l,
    student_profile: studentProf,
    reviewer_profile: reviewerProf,
    student_academic: academicProf
  });
};

// ============================================================
// Student Profile Defaults for Leave Application
// ============================================================
export const getStudentLeaveProfileDefaults = async () => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) return null;

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, usn_or_employee_id, email, department:departments(name)')
    .eq('id', user.id)
    .maybeSingle();

  const { data: studentAcademic } = await (supabase as any)
    .from('student_profiles')
    .select('semester, academic_year, phone, parent_phone')
    .eq('profile_id', user.id)
    .maybeSingle();

  return {
    fullName: profile?.full_name || '',
    usn: profile?.usn_or_employee_id || '',
    departmentName: profile?.department?.name || '',
    semester: studentAcademic?.semester || '',
    academicYear: studentAcademic?.academic_year || '2024-2025',
    studentPhone: studentAcademic?.phone || '',
    parentPhone: studentAcademic?.parent_phone || ''
  };
};

// ============================================================
// Submit a new leave request
// ============================================================
export const submitLeaveRequest = async (payload: {
  leaveType: string;
  reason: string;
  startDate: string;
  endDate: string;
  section?: string;
  studentPhone?: string;
  parentPhone?: string;
  file?: File;
}): Promise<LeaveRequest> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  // Validate
  if (!payload.leaveType?.trim()) throw new Error("Leave type is required.");
  if (!payload.reason?.trim()) throw new Error("Reason is required.");
  if (!payload.startDate || !payload.endDate) throw new Error("Start date and end date are required.");
  if (new Date(payload.endDate) < new Date(payload.startDate)) throw new Error("End date cannot be before start date.");

  // Resolve student profile and department
  const { data: studentProfile, error: profErr } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, usn_or_employee_id, department_id, department:departments(name)')
    .eq('id', user.id)
    .single();

  if (profErr || !studentProfile?.department_id) {
    console.error('[leaveService] Student profile/department error:', profErr);
    throw new Error("No department is assigned to your profile. Please contact administration.");
  }

  // Fetch academic profile for immutable snapshots
  const { data: studentAcademic } = await (supabase as any)
    .from('student_profiles')
    .select('semester, academic_year, phone, parent_phone')
    .eq('profile_id', user.id)
    .maybeSingle();

  // Find HOD for the department
  let hodProfile: { id: string; full_name: string } | null = null;

  try {
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_department_hod', {
      p_department_id: studentProfile.department_id
    });

    if (!rpcError && rpcData && rpcData.length > 0) {
      hodProfile = rpcData[0];
    }
  } catch (e) {
    console.warn('[leaveService] RPC get_department_hod failed:', e);
  }

  if (!hodProfile) {
    const { data: directHod } = await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'HOD')
      .eq('department_id', studentProfile.department_id)
      .eq('account_status', 'ACTIVE')
      .limit(1)
      .maybeSingle();

    if (directHod) {
      hodProfile = directHod;
    }
  }

  if (!hodProfile) {
    throw new Error("No active HOD is assigned to your department. Please contact the administration.");
  }

  const tempLeaveId = crypto.randomUUID ? crypto.randomUUID() : `lv-${Date.now()}`;
  let storagePath: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;

  if (payload.file) {
    fileName = payload.file.name;
    fileSize = payload.file.size;
    mimeType = payload.file.type || 'application/pdf';
    const safeName = sanitizeFileName(payload.file.name);

    // Predictable path: student-documents/{student_id}/leave-requests/{leave_id}/{file_name}
    storagePath = `${user.id}/leave-requests/${tempLeaveId}/${safeName}`;

    await uploadFile({
      bucket: STORAGE_BUCKETS.STUDENT_DOCUMENTS,
      path: storagePath,
      file: payload.file,
      upsert: true
    });
  }

  // INSERT leave request with full snapshot attributes (authoritative contract)
  const fullSnapshotPayload = {
    id: tempLeaveId,
    student_id: user.id,
    department_id: studentProfile.department_id,
    hod_id: hodProfile.id,
    leave_type: payload.leaveType.trim(),
    reason: payload.reason.trim(),
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: 'PENDING',
    supporting_doc_path: storagePath,
    supporting_doc_name: fileName,
    supporting_doc_size: fileSize,
    supporting_doc_type: mimeType,
    student_name_snapshot: studentProfile.full_name || 'Student',
    student_usn_snapshot: studentProfile.usn_or_employee_id || 'N/A',
    branch_snapshot: studentProfile.department?.name || 'Department',
    section_snapshot: payload.section?.trim() || null,
    semester_snapshot: studentAcademic?.semester || null,
    academic_year_snapshot: studentAcademic?.academic_year || null,
    student_phone_snapshot: payload.studentPhone?.trim() || studentAcademic?.phone || null,
    parent_phone_snapshot: payload.parentPhone?.trim() || studentAcademic?.parent_phone || null,
    snapshot_provenance: 'SUBMISSION'
  };

  // Authoritative insert: preserves all required academic snapshots and provenance.
  // Fails safely if required database schema or snapshot columns are missing to prevent data loss.
  const { data, error: insertError } = await (supabase as any)
    .from('leave_requests')
    .insert(fullSnapshotPayload)
    .select('*')
    .single();

  if (insertError || !data) {
    if (
      insertError?.code === 'PGRST204' ||
      (insertError?.message?.includes('schema cache') &&
        (insertError?.message?.includes('snapshot') ||
         insertError?.message?.includes('academic_year_snapshot') ||
         insertError?.message?.includes('column')))
    ) {
      console.error("[leaveService] Schema error: snapshot columns missing in 'leave_requests':", insertError);
      throw new Error(
        "Database schema error: Required academic snapshot columns are missing from 'leave_requests' (Migration 00041 pending). Submission aborted to prevent data loss. Please contact your system administrator."
      );
    }
    console.error("[leaveService] INSERT leave_requests error:", insertError);
    throw new Error(insertError?.message || "Failed to submit leave request.");
  }

  // Insert into leave_attachments table if file was attached
  if (storagePath && fileName) {
    try {
      await (supabase as any)
        .from('leave_attachments')
        .insert({
          leave_request_id: data.id,
          student_id: user.id,
          file_name: fileName,
          storage_path: storagePath,
          file_size: fileSize,
          mime_type: mimeType
        });
    } catch (attErr) {
      console.warn('[leaveService] leave_attachments record insert note:', attErr);
    }
  }

  // Notifications are handled server-authoritatively by database trigger trg_notify_on_leave_submission
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('notifications_updated'));
  }

  return mapLeaveRow({ ...data, student_profile: studentProfile });
};

// ============================================================
// Approve leave request
// ============================================================
export const approveLeaveRequest = async (referenceOrId: string, remarks?: string): Promise<boolean> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  let leaveReqQuery = (supabase as any)
    .from('leave_requests')
    .select('id, reference_id, student_id, leave_type, department_id, status');

  if (isUuid(referenceOrId)) {
    leaveReqQuery = leaveReqQuery.eq('id', referenceOrId);
  } else {
    leaveReqQuery = leaveReqQuery.eq('reference_id', referenceOrId);
  }
  const { data: leaveReq, error: fetchErr } = await leaveReqQuery.single();

  if (fetchErr || !leaveReq) {
    console.error('[leaveService] approve — leave not found:', fetchErr);
    throw new Error("Leave request record not found.");
  }

  const { data: callerProfile } = await (supabase as any)
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();

  if (!callerProfile || (callerProfile.role === 'HOD' && callerProfile.department_id !== leaveReq.department_id)) {
    throw new Error("ACCESS DENIED: You are only authorized to review leave requests for your own department.");
  }

  if (leaveReq.status !== 'PENDING') {
    throw new Error(`This leave request is already ${leaveReq.status.toLowerCase()} and cannot be modified.`);
  }

  const cleanRemarks = remarks?.trim() || null;

  // Authoritative approval mechanism: invoke 4-parameter review_leave_request RPC
  // All authorization (authenticated HOD role, department ownership, PENDING-only transition,
  // server timestamp, server caller identity, atomic notification) is strictly enforced in PostgreSQL.
  const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)('review_leave_request', {
    p_leave_id: leaveReq.id,
    p_status: 'APPROVED',
    p_rejection_reason: null,
    p_approval_remarks: cleanRemarks
  });

  if (rpcErr) {
    console.error('[leaveService] Authoritative review_leave_request RPC failed:', rpcErr);
    if (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('review_leave_request')) {
      throw new Error(
        "Database migration pending: Authoritative 4-parameter 'review_leave_request' RPC is not registered (Migration 00041 required). Approval aborted to preserve audit integrity."
      );
    }
    throw new Error(rpcErr.message || "Failed to approve leave request.");
  }

  return rpcData?.success ?? true;
};

// ============================================================
// Reject leave request
// ============================================================
export const rejectLeaveRequest = async (referenceOrId: string, _reviewedBy?: string, remark?: string): Promise<boolean> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  const cleanRemark = remark?.trim();
  if (!cleanRemark) {
    throw new Error("Rejection reason is required when rejecting a leave request.");
  }

  let leaveReqQuery = (supabase as any)
    .from('leave_requests')
    .select('id, reference_id, student_id, leave_type, department_id, status');

  if (isUuid(referenceOrId)) {
    leaveReqQuery = leaveReqQuery.eq('id', referenceOrId);
  } else {
    leaveReqQuery = leaveReqQuery.eq('reference_id', referenceOrId);
  }
  const { data: leaveReq, error: fetchErr } = await leaveReqQuery.single();

  if (fetchErr || !leaveReq) {
    console.error('[leaveService] reject — leave not found:', fetchErr);
    throw new Error("Leave request record not found.");
  }

  const { data: callerProfile } = await (supabase as any)
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();

  if (!callerProfile || (callerProfile.role === 'HOD' && callerProfile.department_id !== leaveReq.department_id)) {
    throw new Error("ACCESS DENIED: You are only authorized to review leave requests for your own department.");
  }

  if (leaveReq.status !== 'PENDING') {
    throw new Error(`This leave request is already ${leaveReq.status.toLowerCase()} and cannot be modified.`);
  }

  // Authoritative rejection mechanism: invoke 4-parameter review_leave_request RPC
  const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)('review_leave_request', {
    p_leave_id: leaveReq.id,
    p_status: 'REJECTED',
    p_rejection_reason: cleanRemark,
    p_approval_remarks: null
  });

  if (rpcErr) {
    console.error('[leaveService] Authoritative review_leave_request rejection failed:', rpcErr);
    if (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('review_leave_request')) {
      throw new Error(
        "Database migration pending: Authoritative 4-parameter 'review_leave_request' RPC is not registered (Migration 00041 required). Rejection aborted to preserve audit integrity."
      );
    }
    throw new Error(rpcErr.message || "Failed to reject leave request.");
  }

  return rpcData?.success ?? true;
};

/**
 * Helper to download a leave request supporting document from Supabase Storage.
 */
export const downloadLeaveDocument = async (storagePath: string, fileName?: string): Promise<void> => {
  await downloadStorageFile(STORAGE_BUCKETS.STUDENT_DOCUMENTS, storagePath, fileName);
};

/**
 * Get signed URL for leave supporting document
 */
export const getLeaveDocumentUrl = async (storagePath: string): Promise<string | null> => {
  return await getSignedUrl(STORAGE_BUCKETS.STUDENT_DOCUMENTS, storagePath, 3600);
};

// Re-export PDF generation functions
export { 
  generateLeaveNotePdf, 
  generateStudentApplicationPdf, 
  generateLeavePdf,
  generateLeaveNoteDocument,
  downloadApprovedLeaveNote, 
  downloadStudentApplicationPdf,
  downloadLeavePdf,
  isLeaveApproved 
} from './leaveNotePdfService';
