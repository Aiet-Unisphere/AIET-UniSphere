export type UserRole = 'STUDENT' | 'FACULTY' | 'HOD' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'PENDING';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Department {
  id: string;
  name: string;
  code: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  usn_or_employee_id: string | null;
  role: UserRole;
  department_id?: string | null;
  department?: Department | null;
  account_status: AccountStatus;
  avatar_path?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBAssignment {
  id: string;
  title: string;
  course_id: string;
  course_name: string;
  description: string | null;
  instructions: string | null;
  deadline: string;
  marks: number;
  department_id: string;
  created_by: string;
  status: string;
  resources?: string[];
  rubric?: string[];
  storage_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  created_at: string;
  department?: Department | null;
  creator_profile?: Profile | null;
}

export interface DBAssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  file_name: string;
  storage_path?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  submitted_at: string;
  status: 'Submitted' | 'Graded';
  marks?: number | null;
  feedback?: string | null;
  graded_by?: string | null;
  graded_at?: string | null;
  student_profile?: Profile | null;
}

export interface DBLeaveRequest {
  id: string;
  reference_id: string;
  student_id: string;
  department_id: string;
  hod_id?: string | null;
  leave_type: string;
  reason: string;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  supporting_doc_path?: string | null;
  supporting_doc_name?: string | null;
  supporting_doc_size?: number | null;
  supporting_doc_type?: string | null;
  created_at: string;
  student_profile?: Profile | null;
  department?: Department | null;
  reviewer_profile?: Profile | null;
}

export interface DBLeaveAttachment {
  id: string;
  leave_request_id?: string | null;
  student_id: string;
  file_name: string;
  storage_path: string;
  file_size?: number | null;
  mime_type?: string | null;
  created_at: string;
}

export interface DBAnnouncement {
  id: string;
  title: string;
  category: 'Academic' | 'Exam' | 'Event' | 'General';
  content: string;
  target_audience: 'Students' | 'Faculty' | 'Students + Faculty';
  created_by: string;
  department_id: string;
  status: 'DRAFT' | 'PUBLISHED';
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_type?: string | null;
  created_at: string;
  published_at?: string | null;
  profiles?: Profile | null;
  departments?: Department | null;
}

export interface DBAcademicMaterial {
  id: string;
  title: string;
  course_id: string;
  module_id?: string | null;
  file_type: string;
  storage_path: string;
  file_name: string;
  file_size?: number | null;
  mime_type?: string | null;
  department_id: string;
  uploaded_by: string;
  created_at: string;
}

export interface DBAssessment {
  id: string;
  title: string;
  course_id: string;
  course_name: string;
  course_code?: string | null;
  semester?: number | null;
  department_id: string;
  created_by: string;
  assessment_date: string;
  due_date?: string | null;
  assessment_time?: string | null;
  duration_minutes: number;
  total_marks: number;
  instructions?: string | null;
  status: 'Upcoming' | 'Active' | 'Completed' | 'Closed';
  storage_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  questions?: any;
  created_at: string;
}

export interface DBStudentServiceRequest {
  id: string;
  student_id: string;
  department_id: string;
  service_type_id: string;
  request_type: string;
  subject: string;
  description: string;
  status: 'Pending' | 'In Review' | 'Resolved' | 'Rejected';
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_type?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBNotification {
  id: string;
  user_id: string;
  title: string;
  short_message: string;
  full_message?: string | null;
  source?: string | null;
  category?: string | null;
  type?: string | null;
  related_link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface DBStudentProfile {
  id: string;
  profile_id: string;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  semester?: number | null;
  academic_year?: string | null;
  cgpa?: number | null;
  profile_photo_url?: string | null;
  avatar_storage_path?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBAttendanceSession {
  id: string;
  department_id?: string | null;
  faculty_id?: string | null;
  course_id: string;
  course_name: string;
  session_date: string;
  start_time: string;
  end_time?: string | null;
  section?: string | null;
  semester?: number | null;
  total_students: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  remarks?: string | null;
  created_at: string;
}

export interface DBAttendanceRecord {
  id: string;
  session_id: string;
  student_id?: string | null;
  status: 'Present' | 'Absent' | 'Late';
  remarks?: string | null;
  created_at: string;
}

export interface DBExternalLearningCourse {
  id: string;
  title: string;
  platform: string;
  provider_name?: string | null;
  external_url: string;
  description?: string | null;
  course_code?: string | null;
  category?: string | null;
  difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null;
  estimated_hours?: number | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DBExternalCourseAssignment {
  id: string;
  external_course_id: string;
  assigned_by: string;
  department_id: string;
  academic_course_id?: string | null;
  semester?: number | null;
  section?: string | null;
  academic_year?: string | null;
  required: boolean;
  assigned_date: string;
  deadline?: string | null;
  instructions?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
  external_course?: DBExternalLearningCourse | null;
}

export interface DBExternalCourseEnrollment {
  id: string;
  assignment_id: string;
  student_id: string;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
  assigned_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  assignment?: DBExternalCourseAssignment | null;
}

export interface DBExternalCourseProgress {
  id: string;
  enrollment_id: string;
  progress_percent: number;
  completed_modules?: number | null;
  total_modules?: number | null;
  completed_quizzes?: number | null;
  total_quizzes?: number | null;
  completed_assignments?: number | null;
  total_assignments?: number | null;
  last_activity_at?: string | null;
  source: 'SELF_REPORTED' | 'FACULTY_UPDATED' | 'VERIFIED' | 'EXTERNAL_API';
  created_at: string;
  updated_at: string;
}

export interface DBExternalCourseEvidence {
  id: string;
  enrollment_id: string;
  evidence_type: 'CERTIFICATE' | 'CREDENTIAL_URL' | 'CREDENTIAL_ID' | 'OTHER';
  certificate_storage_path?: string | null;
  credential_url?: string | null;
  credential_id?: string | null;
  submitted_at: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verified_by?: string | null;
  verified_at?: string | null;
  verification_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, 'id'>>;
      };
      student_profiles: {
        Row: DBStudentProfile;
        Insert: Omit<DBStudentProfile, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DBStudentProfile, 'id'>>;
      };
      departments: {
        Row: Department;
        Insert: Omit<Department, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Department, 'id'>>;
      };
      assignments: {
        Row: DBAssignment;
        Insert: Omit<DBAssignment, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBAssignment, 'id'>>;
      };
      assignment_submissions: {
        Row: DBAssignmentSubmission;
        Insert: Omit<DBAssignmentSubmission, 'id' | 'submitted_at'> & {
          id?: string;
          submitted_at?: string;
        };
        Update: Partial<Omit<DBAssignmentSubmission, 'id'>>;
      };
      leave_requests: {
        Row: DBLeaveRequest;
        Insert: Omit<DBLeaveRequest, 'id' | 'reference_id' | 'created_at'> & {
          id?: string;
          reference_id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBLeaveRequest, 'id'>>;
      };
      leave_attachments: {
        Row: DBLeaveAttachment;
        Insert: Omit<DBLeaveAttachment, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBLeaveAttachment, 'id'>>;
      };
      announcements: {
        Row: DBAnnouncement;
        Insert: Omit<DBAnnouncement, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBAnnouncement, 'id'>>;
      };
      academic_materials: {
        Row: DBAcademicMaterial;
        Insert: Omit<DBAcademicMaterial, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBAcademicMaterial, 'id'>>;
      };
      assessments: {
        Row: DBAssessment;
        Insert: Omit<DBAssessment, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBAssessment, 'id'>>;
      };
      student_service_requests: {
        Row: DBStudentServiceRequest;
        Insert: Omit<DBStudentServiceRequest, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DBStudentServiceRequest, 'id'>>;
      };
      notifications: {
        Row: DBNotification;
        Insert: Omit<DBNotification, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBNotification, 'id'>>;
      };
      attendance_sessions: {
        Row: DBAttendanceSession;
        Insert: Omit<DBAttendanceSession, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBAttendanceSession, 'id'>>;
      };
      attendance_records: {
        Row: DBAttendanceRecord;
        Insert: Omit<DBAttendanceRecord, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DBAttendanceRecord, 'id'>>;
      };
      external_learning_courses: {
        Row: DBExternalLearningCourse;
        Insert: Omit<DBExternalLearningCourse, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DBExternalLearningCourse, 'id'>>;
      };
      external_course_assignments: {
        Row: DBExternalCourseAssignment;
        Insert: Omit<DBExternalCourseAssignment, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DBExternalCourseAssignment, 'id'>>;
      };
      external_course_enrollments: {
        Row: DBExternalCourseEnrollment;
        Insert: Omit<DBExternalCourseEnrollment, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DBExternalCourseEnrollment, 'id'>>;
      };
      external_course_progress: {
        Row: DBExternalCourseProgress;
        Insert: Omit<DBExternalCourseProgress, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DBExternalCourseProgress, 'id'>>;
      };
      external_course_evidence: {
        Row: DBExternalCourseEvidence;
        Insert: Omit<DBExternalCourseEvidence, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DBExternalCourseEvidence, 'id'>>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_attendance_session_atomic: {
        Args: {
          p_course_id: string;
          p_course_name: string;
          p_session_date: string;
          p_start_time: string;
          p_end_time?: string;
          p_section?: string;
          p_semester?: number;
          p_remarks?: string;
          p_records: any;
        };
        Returns: DBAttendanceSession;
      };
      verify_external_course_evidence: {
        Args: {
          p_evidence_id: string;
          p_status: 'VERIFIED' | 'REJECTED';
          p_notes?: string;
        };
        Returns: { success: boolean; status: string };
      };
      create_external_course_assignment_with_enrollment: {
        Args: {
          p_external_course_id: string;
          p_department_id: string;
          p_academic_course_id?: string;
          p_semester?: number;
          p_section?: string;
          p_academic_year?: string;
          p_required?: boolean;
          p_assigned_date?: string;
          p_deadline?: string;
          p_instructions?: string;
        };
        Returns: { success: boolean; assignment: DBExternalCourseAssignment; enrolled_count: number };
      };
    };
    Enums: Record<string, never>;
  };
}
