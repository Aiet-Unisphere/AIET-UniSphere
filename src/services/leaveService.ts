import { supabase } from '../lib/supabase';
import type { LeaveRequest } from '../data/leaveRequests';
export type { LeaveRequest };

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

  return {
    id: l.reference_id || l.id,
    dbId: l.id,
    requesterId: l.student_id,
    requesterName: studentName,
    requesterUsnOrEmpId: studentUsn,
    requesterRole: 'STUDENT',
    requesterEmail: studentEmail,
    departmentId: l.department_id,
    departmentName: deptName,
    leaveType: l.leave_type || 'General',
    startDate: l.start_date,
    endDate: l.end_date,
    days: isNaN(days) ? 1 : days,
    reason: l.reason,
    status: statusFormatted,
    submittedAt: new Date(l.created_at).toLocaleDateString(),
    reviewedBy: l.reviewed_by ? (reviewerName || 'HOD') : undefined,
    reviewerName: reviewerName || undefined,
    remark: l.rejection_reason || undefined,
    semester: l.student_academic?.semester ?? null,
    cgpa: l.student_academic?.cgpa ?? null
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
      reviewer_profile:profiles!leave_requests_reviewed_by_fkey(full_name)
    `)
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });

  data = joinResult.data;
  error = joinResult.error;

  // If join fails (foreign key name mismatch), try without joins
  if (error) {
    console.warn('[leaveService] Join query failed, trying simple query:', error.message);

    const simpleResult = await (supabase as any)
      .from('leave_requests')
      .select('*')
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
    console.log('[leaveService] No leave requests found for student', user.id);
    return [];
  }

  return data.map(mapLeaveRow);
};

// ============================================================
// HOD: Get department leave requests
// ============================================================
export const getDepartmentLeaveRequests = async (): Promise<LeaveRequest[]> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) {
    console.warn('[leaveService] No authenticated user for getDepartmentLeaveRequests');
    return [];
  }

  // Get HOD's profile to find their department
  const { data: profile, error: profErr } = await (supabase as any)
    .from('profiles')
    .select('department_id, role')
    .eq('id', user.id)
    .single();

  if (profErr || !profile?.department_id) {
    console.warn('[leaveService] HOD profile/department not found:', profErr?.message);
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
      reviewer_profile:profiles!leave_requests_reviewed_by_fkey(full_name)
    `)
    .eq('department_id', profile.department_id)
    .order('created_at', { ascending: false });

  data = joinResult.data;
  error = joinResult.error;

  // If join fails, try simple query
  if (error) {
    console.warn('[leaveService] HOD join query failed, trying simple:', error.message);

    const simpleResult = await (supabase as any)
      .from('leave_requests')
      .select('*')
      .eq('department_id', profile.department_id)
      .order('created_at', { ascending: false });

    data = simpleResult.data;
    error = simpleResult.error;

    // If still failing, try fetching by hod_id instead of department_id
    if (error || !data) {
      console.warn('[leaveService] department_id query failed, trying hod_id:', error?.message);

      const hodResult = await (supabase as any)
        .from('leave_requests')
        .select('*')
        .eq('hod_id', user.id)
        .order('created_at', { ascending: false });

      data = hodResult.data;
      error = hodResult.error;
    }
  }

  if (error) {
    console.error('[leaveService] getDepartmentLeaveRequests FINAL ERROR:', error);
    throw new Error(`Unable to load department leave requests: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Enrich rows: fetch student profile names if join didn't work
  const needsEnrichment = data.length > 0 && !data[0].student_profile;
  if (needsEnrichment) {
    const studentIds = [...new Set(data.map((r: any) => r.student_id).filter(Boolean))];
    const reviewerIds = [...new Set(data.map((r: any) => r.reviewed_by).filter(Boolean))];
    const allIds = [...new Set([...studentIds, ...reviewerIds])];

    if (allIds.length > 0) {
      const { data: profiles } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, usn_or_employee_id, email, department:departments(name)')
        .in('id', allIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      data = data.map((row: any) => ({
        ...row,
        student_profile: profileMap.get(row.student_id) || null,
        reviewer_profile: profileMap.get(row.reviewed_by) || null,
        student_name: profileMap.get(row.student_id)?.full_name || 'Student',
        student_usn: profileMap.get(row.student_id)?.usn_or_employee_id || 'N/A',
        department_name: profileMap.get(row.student_id)?.department?.name || 'Department'
      }));
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
    .select('*');

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
// Submit a new leave request
// ============================================================
export const submitLeaveRequest = async (payload: {
  leaveType: string;
  reason: string;
  startDate: string;
  endDate: string;
}): Promise<LeaveRequest> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  // Validate
  if (!payload.leaveType?.trim()) throw new Error("Leave type is required.");
  if (!payload.reason?.trim()) throw new Error("Reason is required.");
  if (!payload.startDate || !payload.endDate) throw new Error("Start date and end date are required.");
  if (new Date(payload.endDate) < new Date(payload.startDate)) throw new Error("End date cannot be before start date.");

  // Resolve student profile
  const { data: studentProfile, error: profErr } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, department_id')
    .eq('id', user.id)
    .single();

  if (profErr || !studentProfile?.department_id) {
    console.error('[leaveService] Student profile/department error:', profErr);
    throw new Error("No department is assigned to your profile. Please contact administration.");
  }

  // Find HOD for the department
  let hodProfile: { id: string; full_name: string } | null = null;

  // Try RPC first
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

  // Fallback: direct query
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

  // INSERT leave request
  const { data, error } = await (supabase as any)
    .from('leave_requests')
    .insert({
      student_id: user.id,
      department_id: studentProfile.department_id,
      hod_id: hodProfile.id,
      leave_type: payload.leaveType.trim(),
      reason: payload.reason.trim(),
      start_date: payload.startDate,
      end_date: payload.endDate,
      status: 'PENDING'
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error("[leaveService] INSERT leave_requests error:", error);
    throw new Error(error?.message || "Failed to submit leave request.");
  }

  console.log('[leaveService] Leave request created successfully:', data.id, data.reference_id);

  // Send notifications (non-blocking — don't let notification failures break the submit)
  try {
    await (supabase as any).from('notifications').insert({
      user_id: hodProfile.id,
      title: 'New Leave Request Received',
      short_message: `Leave request from ${studentProfile.full_name || 'Student'} (${data.reference_id || data.id})`,
      full_message: `${studentProfile.full_name} submitted a ${payload.leaveType} request from ${payload.startDate} to ${payload.endDate}.\nReason: ${payload.reason}`,
      source: 'Student Portal',
      category: 'Leave',
      type: 'Request'
    });
  } catch (e) { console.warn('[leaveService] HOD notification failed:', e); }

  try {
    await (supabase as any).from('notifications').insert({
      user_id: user.id,
      title: 'Leave Request Submitted',
      short_message: `Your ${payload.leaveType} request (${data.reference_id || data.id}) has been submitted and is pending HOD review.`,
      full_message: `Leave submitted.\nType: ${payload.leaveType}\nDates: ${payload.startDate} to ${payload.endDate}\nStatus: PENDING`,
      source: 'Student Portal',
      category: 'Leave',
      type: 'Request',
      related_link: '/student/leave-requests'
    });
  } catch (e) { console.warn('[leaveService] Student notification failed:', e); }

  return mapLeaveRow({ ...data, student_profile: studentProfile });
};

// ============================================================
// Approve leave request
// ============================================================
export const approveLeaveRequest = async (referenceOrId: string): Promise<boolean> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  // Find the leave request
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

  // Security check
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

  // Try RPC first
  let updated = false;
  try {
    const { error: rpcErr } = await (supabase.rpc as any)('review_leave_request', {
      p_leave_id: leaveReq.id,
      p_status: 'APPROVED',
      p_rejection_reason: null
    });
    if (!rpcErr) updated = true;
    else console.warn('[leaveService] RPC approve failed:', rpcErr.message);
  } catch (e) {
    console.warn('[leaveService] RPC approve exception:', e);
  }

  // Direct update fallback
  if (!updated) {
    const { error: directErr } = await (supabase as any)
      .from('leave_requests')
      .update({
        status: 'APPROVED',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', leaveReq.id);

    if (directErr) {
      console.error("[leaveService] Direct approve update failed:", directErr);
      throw new Error(directErr.message || "Failed to approve leave request.");
    }
  }

  // Notify student (non-blocking)
  try {
    await (supabase as any).from('notifications').insert({
      user_id: leaveReq.student_id,
      title: `Leave Request ${leaveReq.reference_id || ''} Approved`,
      short_message: `Your ${leaveReq.leave_type} request has been approved by your HOD.`,
      source: 'HOD Portal',
      category: 'Leave',
      type: 'Approval',
      related_link: '/student/leave-requests'
    });
  } catch (e) { console.warn('[leaveService] Approval notification failed:', e); }

  return true;
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

  // Find the leave request
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

  // Security check
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

  // Try RPC first
  let updated = false;
  try {
    const { error: rpcErr } = await (supabase.rpc as any)('review_leave_request', {
      p_leave_id: leaveReq.id,
      p_status: 'REJECTED',
      p_rejection_reason: cleanRemark
    });
    if (!rpcErr) updated = true;
    else console.warn('[leaveService] RPC reject failed:', rpcErr.message);
  } catch (e) {
    console.warn('[leaveService] RPC reject exception:', e);
  }

  // Direct update fallback
  if (!updated) {
    const { error: directErr } = await (supabase as any)
      .from('leave_requests')
      .update({
        status: 'REJECTED',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: cleanRemark
      })
      .eq('id', leaveReq.id);

    if (directErr) {
      console.error("[leaveService] Direct reject update failed:", directErr);
      throw new Error(directErr.message || "Failed to reject leave request.");
    }
  }

  // Notify student (non-blocking)
  try {
    await (supabase as any).from('notifications').insert({
      user_id: leaveReq.student_id,
      title: `Leave Request ${leaveReq.reference_id || ''} Rejected`,
      short_message: `Your ${leaveReq.leave_type} request was rejected. Reason: ${cleanRemark}`,
      source: 'HOD Portal',
      category: 'Leave',
      type: 'Rejection',
      related_link: '/student/leave-requests'
    });
  } catch (e) { console.warn('[leaveService] Rejection notification failed:', e); }

  return true;
};
