export interface StudentProfile {
  name: string;
  usn: string;
  department: string;
  semester?: number | null;
  academicYear?: string | null;
  cgpa?: number | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
}

export interface ExtendedStudent extends StudentProfile {
  id: string;
  email: string;
  phone?: string | null;
  attendancePercent?: number | null;
  assignmentsCompleted?: number | null;
  assignmentsTotal?: number | null;
  academicStatus: 'Good Standing' | 'Warning' | 'At Risk';
  isUsnConflict?: boolean;
  conflictDetails?: string;
  coursePerformance: {
    courseCode: string;
    courseName: string;
    attendance?: number | null;
    assignmentCompletion?: number | null;
    assessmentAvg?: number | null;
    grade?: string | null;
    percentage?: number | null;
  }[];
}

export const mockStudentProfile: StudentProfile | null = null;

export const mockStudentsRoster: ExtendedStudent[] = [];

