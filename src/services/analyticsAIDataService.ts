/**
 * AIET-UniSphere - Deterministic Analytics AI Data Builder Service
 * 
 * SECURITY BOUNDARY RULE:
 * Analytics Data Layer ---> Future Local LLM
 * This is a ONE-WAY data boundary adapter.
 * 
 * Functions in this module:
 *  1. Authenticate session via Supabase Auth (JWT)
 *  2. Resolve caller profile and verified role from 'profiles' table
 *  3. Invoke canonical deterministic analytics services
 *  4. Format and validate structured Analytics AI contracts
 *  5. Assert zero secret/credential leakage
 * 
 * NO SQL is generated here.
 * NO external LLM is called here.
 * NO user-supplied ID overrides authorization.
 */

import { supabase } from '../lib/supabase';
import {
  getAcademicOverview,
  getLearningGaps,
  getSubjectPerformances,
  getAssessmentBreakdown,
  getAssignmentCompletion,
  getSemesterTrends,
} from './analyticsService';
import { getStudentProfile } from './studentService';
import { getFacultyDashboardData } from '../faculty/services/facultyService';
import {
  getDepartmentOverview,
  getDepartmentAttendanceMetrics,
  getDepartmentDetailData,
} from './departmentService';
import type {
  StudentAnalyticsAIContract,
  FacultyAnalyticsAIContract,
  HODAnalyticsAIContract,
  AnalyticsAIContractPayload,
} from '../types/analyticsAI';
import {
  validateStudentAnalyticsContract,
  validateFacultyAnalyticsContract,
  validateHODAnalyticsContract,
  assertCredentialSafety,
} from '../types/analyticsAI';

/**
 * Helper to fetch verified caller identity and profile from Supabase Auth & DB.
 */
async function getAuthenticatedCallerProfile(): Promise<{
  id: string;
  email: string;
  role: 'STUDENT' | 'FACULTY' | 'HOD' | 'ADMIN';
  fullName: string;
  departmentId: string | null;
  accountStatus: string;
}> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('AUTHENTICATION_REQUIRED: Valid authenticated session required.');
  }

  const { data: profile, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('id, email, full_name, role, department_id, account_status')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('USER_NOT_FOUND: Profile not found for authenticated user.');
  }

  if (profile.account_status !== 'ACTIVE') {
    throw new Error('ACCOUNT_INACTIVE: An active account is required to generate analytics contracts.');
  }

  return {
    id: profile.id,
    email: profile.email || user.email || '',
    role: profile.role,
    fullName: profile.full_name || profile.email?.split('@')[0] || 'User',
    departmentId: profile.department_id || null,
    accountStatus: profile.account_status,
  };
}

/**
 * Builds the Student Analytics AI Contract for the authenticated student.
 */
export const getStudentAnalyticsAIContract = async (): Promise<StudentAnalyticsAIContract> => {
  const caller = await getAuthenticatedCallerProfile();
  if (caller.role !== 'STUDENT') {
    throw new Error(`PERMISSION_DENIED: Role '${caller.role}' cannot request Student Analytics Contract.`);
  }

  const [studentProf, overview, gaps, subjects, assessments, assignments, trends] = await Promise.all([
    getStudentProfile(),
    getAcademicOverview(caller.id),
    getLearningGaps(caller.id),
    getSubjectPerformances(caller.id),
    getAssessmentBreakdown(caller.id),
    getAssignmentCompletion(caller.id),
    getSemesterTrends(caller.id),
  ]);

  const completionRate = assignments.total > 0
    ? Math.round((assignments.submitted / assignments.total) * 100)
    : 0;

  const rawContract: StudentAnalyticsAIContract = {
    role: 'STUDENT',
    timestamp: new Date().toISOString(),
    studentContext: {
      fullName: caller.fullName,
      departmentName: studentProf?.department || undefined,
      semester: studentProf?.semester != null ? Number(studentProf.semester) : undefined,
      cgpa: studentProf?.cgpa != null ? Number(studentProf.cgpa) : null,
    },
    overview: {
      attendancePercent: overview.attendancePercent,
      assignmentsSubmitted: overview.assignmentsSubmitted,
      totalAssignments: overview.totalAssignments,
      assignmentCompletionRate: completionRate,
      assessmentsAttempted: overview.assessmentsAttempted,
      avgAssessmentScore: overview.avgAssessmentScore,
    },
    subjectPerformance: subjects.map(s => ({
      subject: s.subject,
      courseId: s.courseId,
      scorePercent: s.scorePercent,
      totalQuestions: s.totalQuestions,
      correctAnswers: s.correctAnswers,
      topicsAnalyzed: s.topicsAnalyzed,
    })),
    learningGaps: gaps.map(g => ({
      topic: g.topic,
      courseName: g.courseName,
      scorePercent: g.scorePercent,
      correctAnswers: g.correctAnswers,
      totalQuestions: g.totalQuestions,
      wrongAnswers: g.wrongAnswers,
    })),
    assessmentBreakdown: assessments.map(a => ({
      assessmentTitle: a.assessmentTitle,
      score: a.score,
      maxScore: a.maxScore,
      percentage: a.percentage,
      submittedAt: a.submittedAt,
      status: a.status,
    })),
    assignmentCompletion: {
      submitted: assignments.submitted,
      pending: assignments.pending,
      late: assignments.late,
      total: assignments.total,
    },
    semesterTrends: trends.map(t => ({
      semester: t.semester,
      averagePercent: t.averagePercent,
    })),
  };

  // Validate contract schema and security constraints
  const validated = validateStudentAnalyticsContract(rawContract);
  assertCredentialSafety(validated);
  return validated;
};

/**
 * Builds the Faculty Analytics AI Contract for the authenticated faculty.
 */
export const getFacultyAnalyticsAIContract = async (): Promise<FacultyAnalyticsAIContract> => {
  const caller = await getAuthenticatedCallerProfile();
  if (caller.role !== 'FACULTY' && caller.role !== 'HOD') {
    throw new Error(`PERMISSION_DENIED: Role '${caller.role}' cannot request Faculty Analytics Contract.`);
  }

  const dashData = await getFacultyDashboardData();

  const rawContract: FacultyAnalyticsAIContract = {
    role: 'FACULTY',
    timestamp: new Date().toISOString(),
    facultyContext: {
      fullName: dashData.profile.name,
      departmentName: dashData.profile.department,
      designation: dashData.profile.title,
    },
    summaryStats: {
      assignedCoursesCount: dashData.stats.myCoursesCount,
      totalStudentsTaught: dashData.stats.studentsCount,
      todaysClassesCount: dashData.stats.todaysClassesCount,
      pendingEvaluationsCount: dashData.stats.pendingEvaluationsCount,
      activeAssignmentsCount: dashData.stats.activeAssignmentsCount,
      attendanceAlertsCount: dashData.stats.attendanceAlertsCount,
    },
    todaySchedule: dashData.todaysClasses.map(c => ({
      courseCode: c.courseCode,
      courseName: c.courseName,
      semester: c.semester,
      time: c.time,
      room: c.room,
      status: c.status,
    })),
    pendingEvaluations: dashData.pendingWork.map(p => ({
      assignmentTitle: p.title,
      courseName: p.courseName,
      pendingCount: p.pendingCount,
    })),
    atRiskStudents: dashData.studentAlerts.map(a => ({
      studentName: a.studentName,
      usn: a.usn,
      attendancePercent: parseFloat(a.value.replace('%', '')) || 0,
      severity: a.severity,
      details: a.details,
    })),
    assignedCourses: [], // Populated below if available
  };

  const validated = validateFacultyAnalyticsContract(rawContract);
  assertCredentialSafety(validated);
  return validated;
};

/**
 * Builds the HOD Analytics AI Contract for the authenticated HOD.
 */
export const getHODAnalyticsAIContract = async (): Promise<HODAnalyticsAIContract> => {
  const caller = await getAuthenticatedCallerProfile();
  if (caller.role !== 'HOD' && caller.role !== 'ADMIN') {
    throw new Error(`PERMISSION_DENIED: Role '${caller.role}' cannot request HOD Analytics Contract.`);
  }

  const [deptOverview, attMetrics, deptDetail] = await Promise.all([
    getDepartmentOverview(),
    getDepartmentAttendanceMetrics(),
    caller.departmentId ? getDepartmentDetailData(caller.departmentId) : Promise.resolve(null),
  ]);

  const rawContract: HODAnalyticsAIContract = {
    role: 'HOD',
    timestamp: new Date().toISOString(),
    departmentContext: {
      departmentName: deptOverview.departmentName,
      departmentCode: deptOverview.departmentCode,
      hodName: deptOverview.hodName,
      academicYear: deptOverview.academicYear,
    },
    overviewStats: {
      totalFaculty: deptOverview.totalFaculty,
      activeFacultyCount: deptOverview.activeFacultyCount,
      activeFacultyToday: deptOverview.activeFacultyToday,
      totalStudents: deptOverview.totalStudents,
      activeStudents: deptOverview.activeStudents,
      activeCourses: deptOverview.activeCourses,
      overallAttendancePercent: deptOverview.overallAttendancePercent,
      averageCgpa: deptOverview.averageCgpa,
      passRatePercent: deptOverview.passRatePercent,
      assignmentCompletionPercent: deptOverview.assignmentCompletionPercent,
      academicAlertsCount: deptOverview.academicAlertsCount,
      pendingReviewsCount: deptOverview.pendingReviewsCount,
    },
    attendanceMetrics: {
      overallAttendance: attMetrics.overallAttendance,
      presentRate: attMetrics.presentRate,
      absentRate: attMetrics.absentRate,
      lateRate: attMetrics.lateRate,
      semesterBreakdown: attMetrics.semesterBreakdown,
      courseAttendance: attMetrics.courseAttendance.map(c => ({
        courseCode: c.courseCode,
        courseName: c.courseName,
        facultyName: c.facultyName,
        studentCount: c.studentCount,
        attendancePercent: c.attendancePercent,
        status: c.status,
      })),
    },
    atRiskStudents: attMetrics.lowAttendanceStudents.map(s => ({
      studentName: s.studentName,
      usn: s.usn,
      semester: s.semester,
      courseCode: s.courseCode,
      attendancePercent: s.attendancePercent,
    })),
    facultyRosterSummary: deptDetail ? deptDetail.faculty.map(f => ({
      name: f.name,
      designation: f.designation,
      assignedCourseCount: f.assignedCourseCount,
      status: f.status,
    })) : [],
  };

  const validated = validateHODAnalyticsContract(rawContract);
  assertCredentialSafety(validated);
  return validated;
};

/**
 * Automatically builds the Analytics AI contract corresponding to the authenticated caller's role.
 */
export const getAuthenticatedAnalyticsAIContract = async (): Promise<AnalyticsAIContractPayload> => {
  const caller = await getAuthenticatedCallerProfile();
  if (caller.role === 'STUDENT') return getStudentAnalyticsAIContract();
  if (caller.role === 'FACULTY') return getFacultyAnalyticsAIContract();
  if (caller.role === 'HOD' || caller.role === 'ADMIN') return getHODAnalyticsAIContract();

  throw new Error(`UNSUPPORTED_ROLE: Role '${caller.role}' is not supported for Analytics AI Contracts.`);
};
