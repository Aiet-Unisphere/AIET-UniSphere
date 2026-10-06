import { supabase } from '../lib/supabase';
import type { ServiceTypeItem, ServiceRequestItem, CreateServiceRequestPayload } from '../data/studentServices';
import type { StudentProfile, ExtendedStudent } from '../data/students';
import { 
  STORAGE_BUCKETS, 
  uploadFile, 
  getSignedUrl, 
  downloadStorageFile, 
  sanitizeFileName 
} from './storageService';

const mapProfileToStudent = (profile: any, studentProf?: any): ExtendedStudent => {
  const deptName = profile.department?.name || (profile.department_id ? 'Loading Department...' : 'Department not assigned');

  return {
    id: profile.id,
    name: profile.full_name || profile.email.split('@')[0],
    usn: profile.usn_or_employee_id || 'N/A',
    email: profile.email,
    phone: studentProf?.phone || null,
    department: deptName,
    semester: studentProf?.semester != null ? Number(studentProf.semester) : null,
    academicYear: studentProf?.academic_year || null,
    cgpa: studentProf?.cgpa != null ? Number(studentProf.cgpa) : null,
    dateOfBirth: studentProf?.date_of_birth || null,
    gender: studentProf?.gender || null,
    address: studentProf?.address || null,
    city: studentProf?.city || null,
    state: studentProf?.state || null,
    pincode: studentProf?.pincode || null,
    parentName: studentProf?.parent_name || null,
    parentPhone: studentProf?.parent_phone || null,
    attendancePercent: null,
    assignmentsCompleted: null,
    assignmentsTotal: null,
    academicStatus: 'Good Standing',
    coursePerformance: []
  };
};

export const getStudentProfile = async (): Promise<StudentProfile | null> => {
  try {
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) return null;

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select(`
        *,
        department:departments (
          id,
          name,
          code
        )
      `)
      .eq('id', user.id)
      .single();

    if (!profile) return null;

    const { data: studentProf } = await (supabase as any)
      .from('student_profiles')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle();

    return {
      name: profile.full_name || profile.email.split('@')[0],
      usn: profile.usn_or_employee_id || 'N/A',
      department: profile.department?.name || (profile.department_id ? 'Loading...' : 'Department not assigned'),
      semester: studentProf?.semester != null ? Number(studentProf.semester) : null,
      academicYear: studentProf?.academic_year || null,
      cgpa: studentProf?.cgpa != null ? Number(studentProf.cgpa) : null,
      phone: studentProf?.phone || null,
      dateOfBirth: studentProf?.date_of_birth || null,
      gender: studentProf?.gender || null,
      address: studentProf?.address || null,
      city: studentProf?.city || null,
      state: studentProf?.state || null,
      pincode: studentProf?.pincode || null,
      parentName: studentProf?.parent_name || null,
      parentPhone: studentProf?.parent_phone || null
    };
  } catch {
    return null;
  }
};

export const getStudentFullProfile = async (targetId?: string): Promise<{ profile: any; studentProfile: any } | null> => {
  try {
    let uid = targetId;
    if (!uid) {
      const { data: { user }, error: userErr } = await (supabase as any).auth.getUser();
      if (userErr) console.error("Error getting auth user:", userErr);
      if (!user) return null;
      uid = user.id;
    }

    const { data: profile, error } = await (supabase as any)
      .from('profiles')
      .select(`
        *,
        department:departments (
          id,
          name,
          code
        )
      `)
      .or(`id.eq.${uid},usn_or_employee_id.eq.${uid}`)
      .single();

    if (error) {
      console.error("Error fetching profile from DB:", error);
      return null;
    }
    if (!profile) return null;

    const { data: studentProf, error: spErr } = await (supabase as any)
      .from('student_profiles')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (spErr) {
      console.error("Error fetching student_profiles from DB:", spErr);
    }

    return {
      profile,
      studentProfile: studentProf || null
    };
  } catch (err) {
    console.error("Unexpected error in getStudentFullProfile:", err);
    return null;
  }
};

import { uploadAvatar, getUserAvatarUrl } from './avatarService';

/**
 * Uploads a profile avatar photo to Supabase Storage avatars bucket and syncs metadata.
 */
export const uploadUserAvatar = async (file: File): Promise<{ storagePath: string; signedUrl: string | null }> => {
  return await uploadAvatar(file);
};

/**
 * Gets a signed URL for a user's avatar.
 */
export const getUserAvatarSignedUrl = async (avatarPath?: string | null): Promise<string | null> => {
  return await getUserAvatarUrl(avatarPath);
};

export const updateStudentProfile = async (payload: {
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  parent_name?: string;
  parent_phone?: string;
  semester?: number;
  academic_year?: string;
  cgpa?: number;
  avatarFile?: File;
}): Promise<any> => {
  const { data: { user }, error: userErr } = await (supabase as any).auth.getUser();
  if (userErr || !user) {
    console.error("Authentication error before profile update:", userErr);
    throw new Error("Authenticated user session required.");
  }

  let avatarPath: string | undefined;
  if (payload.avatarFile) {
    const { storagePath } = await uploadUserAvatar(payload.avatarFile);
    avatarPath = storagePath;
  }

  const updateData: any = {
    profile_id: user.id,
    phone: payload.phone?.trim() || null,
    date_of_birth: payload.date_of_birth || null,
    gender: payload.gender || null,
    address: payload.address?.trim() || null,
    city: payload.city?.trim() || null,
    state: payload.state?.trim() || null,
    pincode: payload.pincode?.trim() || null,
    parent_name: payload.parent_name?.trim() || null,
    parent_phone: payload.parent_phone?.trim() || null,
    semester: payload.semester != null ? payload.semester : null,
    academic_year: payload.academic_year?.trim() || null,
    cgpa: payload.cgpa != null ? payload.cgpa : null,
    updated_at: new Date().toISOString()
  };

  if (avatarPath) {
    updateData.avatar_storage_path = avatarPath;
  }

  const { data: savedRecord, error: upsertErr } = await (supabase as any)
    .from('student_profiles')
    .upsert(updateData, { onConflict: 'profile_id' })
    .select('*')
    .single();

  if (upsertErr) {
    console.error('Student profile save failed in Supabase:', upsertErr);
    throw new Error(upsertErr.message || 'Failed to save student profile in database.');
  }

  return savedRecord;
};

export const getAllStudents = async (): Promise<ExtendedStudent[]> => {
  try {
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) return [];

    const { data: callerProfile } = await (supabase as any)
      .from('profiles')
      .select('role, department_id')
      .eq('id', user.id)
      .single();

    if (!callerProfile) return [];

    let query = (supabase as any)
      .from('profiles')
      .select(`
        *,
        department:departments (
          id,
          name,
          code
        )
      `)
      .eq('role', 'STUDENT')
      .eq('account_status', 'ACTIVE');

    if (callerProfile.role === 'FACULTY' || callerProfile.role === 'HOD') {
      if (!callerProfile.department_id) {
        return [];
      }
      query = query.eq('department_id', callerProfile.department_id);
    }

    const { data: studentsData, error } = await query;
    if (error || !studentsData || studentsData.length === 0) {
      return [];
    }

    const studentIds = studentsData.map((s: any) => s.id);
    const { data: extendedProfiles } = await (supabase as any)
      .from('student_profiles')
      .select('*')
      .in('profile_id', studentIds);

    const extMap = new Map((extendedProfiles || []).map((ep: any) => [ep.profile_id, ep]));

    return studentsData.map((s: any) => mapProfileToStudent(s, extMap.get(s.id)));
  } catch (err) {
    console.error("Failed to load students:", err);
    return [];
  }
};

export const getStudentById = async (id: string): Promise<ExtendedStudent | null> => {
  try {
    const fullProf = await getStudentFullProfile(id);
    if (!fullProf || !fullProf.profile) return null;
    return mapProfileToStudent(fullProf.profile, fullProf.studentProfile);
  } catch {
    return null;
  }
};

export const getStudentsByCourse = async (courseId: string): Promise<ExtendedStudent[]> => {
  if (!courseId) return [];
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated faculty session required.');
  const { data: enrollments, error: enrollmentError } = await (supabase as any)
    .from('course_enrollments')
    .select('student_id')
    .eq('course_id', courseId)
    .eq('status', 'Active');
  if (enrollmentError) throw new Error(`Unable to load course enrollments: ${enrollmentError.message}`);
  const studentIds = [...new Set((enrollments || []).map((row: any) => row.student_id))];
  if (!studentIds.length) return [];

  const [profilesResult, studentProfilesResult] = await Promise.all([
    (supabase as any).from('profiles')
      .select('*, department:departments(id,name,code)')
      .in('id', studentIds)
      .eq('role', 'STUDENT')
      .eq('account_status', 'ACTIVE'),
    (supabase as any).from('student_profiles').select('*').in('profile_id', studentIds),
  ]);
  if (profilesResult.error) throw new Error(`Unable to load enrolled students: ${profilesResult.error.message}`);
  if (studentProfilesResult.error) throw new Error(`Unable to load student details: ${studentProfilesResult.error.message}`);
  const studentProfileById = new Map<string, any>((studentProfilesResult.data || []).map((row: any) => [row.profile_id, row]));
  return (profilesResult.data || []).map((profile: any) => mapProfileToStudent(profile, studentProfileById.get(profile.id)));
};

export const getAvailableServices = async (): Promise<ServiceTypeItem[]> => {
  const { data, error } = await (supabase as any)
    .from('service_catalog')
    .select('id, name, description, category, icon, sla_hours, requires_attachment')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(`Unable to load student services: ${error.message}`);
  return (data || []).map((service: any) => ({
    id: String(service.id),
    title: service.name,
    description: service.description || '',
    iconName: service.icon || 'FileText',
    estimatedTime: formatServiceSla(Number(service.sla_hours || 72)),
    requiredDocs: Boolean(service.requires_attachment),
    category: service.category,
  }));
};

export const getServiceRequests = async (): Promise<ServiceRequestItem[]> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify session: ${authError.message}`);
  if (!user) throw new Error('Sign in to view your service requests.');
  const { data, error } = await (supabase as any)
    .from('student_service_requests')
    .select('*')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Unable to load service requests: ${error.message}`);
  return (data || []).map(mapServiceRequest);
};

export const getServiceRequestById = async (id: string): Promise<ServiceRequestItem | null> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify session: ${authError.message}`);
  if (!user) throw new Error('Sign in to view this service request.');
  const { data, error } = await (supabase as any)
    .from('student_service_requests')
    .select('*')
    .eq('id', id)
    .eq('student_id', user.id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load service request: ${error.message}`);
  return data ? mapServiceRequest(data) : null;
};

export const createServiceRequest = async (payload: CreateServiceRequestPayload): Promise<ServiceRequestItem> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated student session required.');

  const { data: profile, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('department_id, role, account_status')
    .eq('id', user.id)
    .single();
  if (profileError || !profile?.department_id || profile.role !== 'STUDENT' || profile.account_status !== 'ACTIVE') {
    throw new Error('An active student profile with a department is required to submit a request.');
  }

  const { data: service, error: serviceError } = await (supabase as any)
    .from('service_catalog')
    .select('id, name, requires_attachment')
    .eq('id', payload.serviceTypeId)
    .eq('is_active', true)
    .maybeSingle();
  if (serviceError || !service) throw new Error('This service is no longer available. Refresh and select an active service.');
  if (service.requires_attachment && !payload.file) throw new Error('This service requires a supporting attachment.');
  if (!payload.subject.trim() || !payload.description.trim()) throw new Error('Subject and description are required.');

  const requestId = crypto.randomUUID();
  const fileName = payload.file?.name;
  const storagePath = payload.file
    ? `${user.id}/services/${requestId}/${sanitizeFileName(payload.file.name)}`
    : undefined;
  if (payload.file && storagePath) {
    await uploadFile({ bucket: STORAGE_BUCKETS.STUDENT_DOCUMENTS, path: storagePath, file: payload.file, upsert: false });
  }

  const { data, error } = await (supabase as any)
    .from('student_service_requests')
    .insert({
      id: requestId,
      student_id: user.id,
      department_id: profile.department_id,
      service_type_id: String(service.id),
      request_type: service.name,
      subject: payload.subject.trim(),
      description: payload.description.trim(),
      attachment_name: fileName || null,
      attachment_path: storagePath || null,
      attachment_size: payload.file?.size || null,
      attachment_type: payload.file?.type || null,
      status: 'Pending',
    })
    .select('*')
    .single();
  if (error || !data) {
    if (storagePath) await supabase.storage.from(STORAGE_BUCKETS.STUDENT_DOCUMENTS).remove([storagePath]);
    throw new Error(`Failed to submit service request: ${error?.message || 'No request record returned.'}`);
  }
  return mapServiceRequest(data);
};

const formatServiceSla = (hours: number): string => hours < 24
  ? `Within ${hours} hours`
  : `${Math.ceil(hours / 24)} working day${Math.ceil(hours / 24) === 1 ? '' : 's'}`;

const mapServiceRequest = (row: any): ServiceRequestItem => {
  const submittedDate = new Date(row.created_at).toLocaleDateString('en-GB');
  const status = row.status as ServiceRequestItem['status'];
  const actionStatus = status === 'In Review' ? 'current' : ['Resolved', 'Rejected'].includes(status) ? 'completed' : 'upcoming';
  return {
    id: row.id,
    requestType: row.request_type,
    serviceTypeId: String(row.service_type_id),
    subject: row.subject,
    description: row.description,
    submittedDate,
    lastUpdatedDate: new Date(row.updated_at).toLocaleDateString('en-GB'),
    status,
    attachmentName: row.attachment_name || undefined,
    attachmentPath: row.attachment_path || undefined,
    attachmentSize: row.attachment_size == null ? undefined : Number(row.attachment_size),
    remarks: row.admin_notes || undefined,
    timeline: [
      { step: 'Submitted', status: 'completed', date: submittedDate, note: 'Request submitted.' },
      { step: 'Under Review', status: status === 'Pending' ? 'current' : 'completed' },
      { step: 'Action Taken', status: actionStatus },
      { step: 'Completed', status: status === 'Resolved' ? 'completed' : 'upcoming' },
    ],
  };
};

/**
 * Helper to download student service request document from Supabase Storage.
 */
export const downloadServiceRequestAttachment = async (storagePath: string, fileName?: string): Promise<void> => {
  await downloadStorageFile(STORAGE_BUCKETS.STUDENT_DOCUMENTS, storagePath, fileName);
};
