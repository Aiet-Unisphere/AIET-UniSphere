/**
 * AIET-UniSphere - Analytics AI Data Contracts & Security Boundary
 * 
 * SECURITY BOUNDARY RULE:
 * Analytics Data Layer ---> Future Local LLM
 * This is a ONE-WAY data boundary.
 * 
 * The future Local LLM will receive ONLY structured, authorized, deterministic data.
 * The LLM MUST NOT:
 *  - Directly query Supabase or PostgreSQL
 *  - Generate or execute arbitrary SQL
 *  - Make authorization or access control decisions
 *  - Calculate source-of-truth metrics (all metrics are calculated authoritatively prior to LLM payload construction)
 *  - Receive raw credentials, JWTs, service role keys, passwords, or secrets.
 */

export type AnalyticsRole = 'STUDENT' | 'FACULTY' | 'HOD';

// -------------------------------------------------------------
// STUDENT ANALYTICS AI CONTRACT
// -------------------------------------------------------------
export interface StudentAnalyticsAIContract {
  role: 'STUDENT';
  timestamp: string; // ISO 8601 string
  studentContext: {
    fullName: string;
    departmentName?: string;
    semester?: number;
    cgpa?: number | null;
  };
  overview: {
    attendancePercent: number;
    assignmentsSubmitted: number;
    totalAssignments: number;
    assignmentCompletionRate: number; // Percentage (0 - 100)
    assessmentsAttempted: number;
    avgAssessmentScore: number;
  };
  subjectPerformance: Array<{
    subject: string;
    courseId: string;
    scorePercent: number;
    totalQuestions: number;
    correctAnswers: number;
    topicsAnalyzed: number;
  }>;
  learningGaps: Array<{
    topic: string;
    courseName: string;
    scorePercent: number;
    correctAnswers: number;
    totalQuestions: number;
    wrongAnswers: number;
  }>;
  assessmentBreakdown: Array<{
    assessmentTitle: string;
    score: number;
    maxScore: number;
    percentage: number;
    submittedAt: string | null;
    status: string;
  }>;
  assignmentCompletion: {
    submitted: number;
    pending: number;
    late: number;
    total: number;
  };
  semesterTrends: Array<{
    semester: number;
    averagePercent: number;
  }>;
}

// -------------------------------------------------------------
// FACULTY ANALYTICS AI CONTRACT
// -------------------------------------------------------------
export interface FacultyAnalyticsAIContract {
  role: 'FACULTY';
  timestamp: string;
  facultyContext: {
    fullName: string;
    departmentName: string;
    designation: string;
  };
  summaryStats: {
    assignedCoursesCount: number;
    totalStudentsTaught: number;
    todaysClassesCount: number;
    pendingEvaluationsCount: number;
    activeAssignmentsCount: number;
    attendanceAlertsCount: number;
  };
  todaySchedule: Array<{
    courseCode: string;
    courseName: string;
    semester: number;
    time: string;
    room: string;
    status: string;
  }>;
  pendingEvaluations: Array<{
    assignmentTitle: string;
    courseName: string;
    pendingCount: number;
  }>;
  atRiskStudents: Array<{
    studentName: string;
    usn: string;
    attendancePercent: number;
    severity: 'high' | 'medium';
    details: string;
  }>;
  assignedCourses: Array<{
    courseId: string;
    courseCode: string;
    courseName: string;
    semester: number;
    studentCount: number;
  }>;
}

// -------------------------------------------------------------
// HOD ANALYTICS AI CONTRACT
// -------------------------------------------------------------
export interface HODAnalyticsAIContract {
  role: 'HOD';
  timestamp: string;
  departmentContext: {
    departmentName: string;
    departmentCode: string;
    hodName: string;
    academicYear: string;
  };
  overviewStats: {
    totalFaculty: number;
    activeFacultyCount: number;
    activeFacultyToday: number;
    totalStudents: number;
    activeStudents: number;
    activeCourses: number;
    overallAttendancePercent: number;
    averageCgpa: number | null;
    passRatePercent: number | null;
    assignmentCompletionPercent: number | null;
    academicAlertsCount: number;
    pendingReviewsCount: number;
  };
  attendanceMetrics: {
    overallAttendance: number;
    presentRate: number;
    absentRate: number;
    lateRate: number;
    semesterBreakdown: Array<{
      semester: number;
      attendancePercent: number;
    }>;
    courseAttendance: Array<{
      courseCode: string;
      courseName: string;
      facultyName: string;
      studentCount: number;
      attendancePercent: number;
      status: 'Healthy' | 'Needs Attention' | 'Critical';
    }>;
  };
  atRiskStudents: Array<{
    studentName: string;
    usn: string;
    semester: number;
    courseCode: string;
    attendancePercent: number;
  }>;
  facultyRosterSummary: Array<{
    name: string;
    designation: string;
    assignedCourseCount: number;
    status: string;
  }>;
}

// -------------------------------------------------------------
// UNIFIED PAYLOAD TYPE
// -------------------------------------------------------------
export type AnalyticsAIContractPayload =
  | StudentAnalyticsAIContract
  | FacultyAnalyticsAIContract
  | HODAnalyticsAIContract;

// -------------------------------------------------------------
// RUNTIME CONTRACT VALIDATION FUNCTIONS
// -------------------------------------------------------------

function isNonNegativeNumber(val: any): boolean {
  return typeof val === 'number' && !isNaN(val) && isFinite(val) && val >= 0;
}

function isValidPercentage(val: any): boolean {
  return typeof val === 'number' && !isNaN(val) && isFinite(val) && val >= 0 && val <= 100;
}

/**
 * Validates a Student Analytics AI Contract object at runtime.
 */
export function validateStudentAnalyticsContract(obj: any): StudentAnalyticsAIContract {
  if (!obj || typeof obj !== 'object') {
    throw new Error('MALFORMED_ANALYTICS: Contract payload must be a non-null object.');
  }
  if (obj.role !== 'STUDENT') {
    throw new Error(`ROLE_MISMATCH: Expected role 'STUDENT', but received '${obj.role}'.`);
  }
  if (typeof obj.timestamp !== 'string' || isNaN(Date.parse(obj.timestamp))) {
    throw new Error('INVALID_FIELD: Valid ISO timestamp string is required.');
  }
  if (!obj.studentContext || typeof obj.studentContext.fullName !== 'string') {
    throw new Error('MISSING_FIELD: studentContext.fullName is required.');
  }
  if (!obj.overview || !isValidPercentage(obj.overview.attendancePercent)) {
    throw new Error('INVALID_FIELD: overview.attendancePercent must be a number between 0 and 100.');
  }
  if (!isNonNegativeNumber(obj.overview.assignmentsSubmitted) || !isNonNegativeNumber(obj.overview.totalAssignments)) {
    throw new Error('INVALID_FIELD: Assignment counts must be non-negative numbers.');
  }
  if (!isValidPercentage(obj.overview.assignmentCompletionRate)) {
    throw new Error('INVALID_FIELD: overview.assignmentCompletionRate must be a number between 0 and 100.');
  }
  if (!isNonNegativeNumber(obj.overview.assessmentsAttempted) || !isValidPercentage(obj.overview.avgAssessmentScore)) {
    throw new Error('INVALID_FIELD: Assessment metrics must be valid numeric values.');
  }
  if (!Array.isArray(obj.subjectPerformance) || !Array.isArray(obj.learningGaps) || !Array.isArray(obj.assessmentBreakdown) || !Array.isArray(obj.semesterTrends)) {
    throw new Error('INVALID_FIELD: Analytics breakdown arrays must be valid arrays.');
  }
  return obj as StudentAnalyticsAIContract;
}

/**
 * Validates a Faculty Analytics AI Contract object at runtime.
 */
export function validateFacultyAnalyticsContract(obj: any): FacultyAnalyticsAIContract {
  if (!obj || typeof obj !== 'object') {
    throw new Error('MALFORMED_ANALYTICS: Contract payload must be a non-null object.');
  }
  if (obj.role !== 'FACULTY') {
    throw new Error(`ROLE_MISMATCH: Expected role 'FACULTY', but received '${obj.role}'.`);
  }
  if (typeof obj.timestamp !== 'string' || isNaN(Date.parse(obj.timestamp))) {
    throw new Error('INVALID_FIELD: Valid ISO timestamp string is required.');
  }
  if (!obj.facultyContext || typeof obj.facultyContext.fullName !== 'string' || typeof obj.facultyContext.departmentName !== 'string') {
    throw new Error('MISSING_FIELD: facultyContext with fullName and departmentName is required.');
  }
  if (!obj.summaryStats || !isNonNegativeNumber(obj.summaryStats.assignedCoursesCount) || !isNonNegativeNumber(obj.summaryStats.totalStudentsTaught)) {
    throw new Error('INVALID_FIELD: summaryStats must contain non-negative numeric metrics.');
  }
  if (!Array.isArray(obj.todaySchedule) || !Array.isArray(obj.pendingEvaluations) || !Array.isArray(obj.atRiskStudents) || !Array.isArray(obj.assignedCourses)) {
    throw new Error('INVALID_FIELD: Faculty metrics breakdown arrays must be valid arrays.');
  }
  return obj as FacultyAnalyticsAIContract;
}

/**
 * Validates an HOD Analytics AI Contract object at runtime.
 */
export function validateHODAnalyticsContract(obj: any): HODAnalyticsAIContract {
  if (!obj || typeof obj !== 'object') {
    throw new Error('MALFORMED_ANALYTICS: Contract payload must be a non-null object.');
  }
  if (obj.role !== 'HOD') {
    throw new Error(`ROLE_MISMATCH: Expected role 'HOD', but received '${obj.role}'.`);
  }
  if (typeof obj.timestamp !== 'string' || isNaN(Date.parse(obj.timestamp))) {
    throw new Error('INVALID_FIELD: Valid ISO timestamp string is required.');
  }
  if (!obj.departmentContext || typeof obj.departmentContext.departmentName !== 'string' || typeof obj.departmentContext.departmentCode !== 'string') {
    throw new Error('MISSING_FIELD: departmentContext with departmentName and departmentCode is required.');
  }
  if (!obj.overviewStats || !isNonNegativeNumber(obj.overviewStats.totalFaculty) || !isNonNegativeNumber(obj.overviewStats.totalStudents)) {
    throw new Error('INVALID_FIELD: overviewStats must contain non-negative numeric metrics.');
  }
  if (!obj.attendanceMetrics || !isValidPercentage(obj.attendanceMetrics.overallAttendance)) {
    throw new Error('INVALID_FIELD: attendanceMetrics.overallAttendance must be a percentage between 0 and 100.');
  }
  if (!Array.isArray(obj.atRiskStudents) || !Array.isArray(obj.facultyRosterSummary)) {
    throw new Error('INVALID_FIELD: HOD breakdown arrays must be valid arrays.');
  }
  return obj as HODAnalyticsAIContract;
}

/**
 * Validates any Analytics AI Contract Payload and asserts clean data security.
 */
export function validateAnalyticsAIContract(data: any): AnalyticsAIContractPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('MALFORMED_ANALYTICS: Payload must be a non-null object.');
  }
  if (data.role === 'STUDENT') return validateStudentAnalyticsContract(data);
  if (data.role === 'FACULTY') return validateFacultyAnalyticsContract(data);
  if (data.role === 'HOD') return validateHODAnalyticsContract(data);

  throw new Error(`INVALID_ROLE: Role '${data.role}' is not a valid AnalyticsRole (STUDENT, FACULTY, HOD).`);
}

/**
 * Verifies that no credentials, JWTs, service role keys, or secrets are present in the serialized JSON.
 */
export function assertCredentialSafety(payload: unknown): boolean {
  const jsonStr = JSON.stringify(payload);
  const forbiddenPatterns = [
    /"password"/i,
    /"secret"/i,
    /"service_role"/i,
    /"access_token"/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /key=[A-Za-z0-9._-]+/i,
    /sbp_[A-Za-z0-9]+/i,
    /eyJhbGciOi/i, // JWT header prefix
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(jsonStr)) {
      throw new Error(`SECURITY_VIOLATION: Payload contains forbidden sensitive credential pattern matching ${pattern}`);
    }
  }
  return true;
}
