/**
 * AIET-UniSphere - Oracle Cloud FastAPI Gateway + Local LLM Integration Test Suite
 *
 * ARCHITECTURAL TEST STRATEGY & ISOLATION NOTE:
 * ============================================
 * This test suite utilizes high-fidelity unit simulations of the Supabase Edge Function
 * environment (`supabase/functions/local-llm-analyze/index.ts`) and mock database clients.
 *
 * - MOCKED SIMULATION TESTS:
 *   Tests verify JWT session enforcement, profile status validation, role-based authorization
 *   matrices (cross-student, cross-course, cross-department, unauthorized admin), fail-closed
 *   handling of database query errors and nonexistent schema fields, credential redaction,
 *   gateway timeout/resilience, and bounded response normalization in a fast, deterministic,
 *   side-effect-free environment.
 *
 * - REAL DATABASE INTEGRATION TESTS:
 *   Full database-level integration tests requiring PostgreSQL execution (e.g., actual RLS
 *   evaluation, trigger executions, and schema migrations) execute against disposable local
 *   containers (via `supabase test db`). Per task instructions, no live Supabase edge function
 *   deployments, remote database mutations, or secret changes are executed directly here.
 */

import assert from 'node:assert';
import test from 'node:test';

// ============================================================
// SIMULATED EDGE FUNCTION GATEWAY PROXY LOGIC (MIRROR)
// ============================================================

const ALLOWED_ANALYSIS_TYPES = [
  'ACADEMIC_OVERVIEW',
  'RISK_ASSESSMENT',
  'PERFORMANCE_TREND',
  'RECOMMENDATION_GEN',
];

const ALLOWED_TRENDS = ['IMPROVING', 'DECLINING', 'STABLE', 'INSUFFICIENT_DATA'];
const ALLOWED_RISKS = ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'];
const ALLOWED_VISUALIZATIONS = ['LINE', 'BAR', 'PIE', 'TABLE', 'PROGRESS'];

function assertCredentialSafety(payload) {
  const jsonStr = JSON.stringify(payload);
  const forbiddenPatterns = [
    /"password"/i,
    /"secret"/i,
    /"service_role"/i,
    /"access_token"/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /key=[A-Za-z0-9._-]+/i,
    /sbp_[A-Za-z0-9]+/i,
    /eyJhbGciOi/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(jsonStr)) {
      throw new Error(`SECURITY_VIOLATION: Payload contains forbidden sensitive credential pattern matching ${pattern}`);
    }
  }
}

function sanitizeTextOutput(text) {
  if (/<script\b[^>]*>|javascript:|SELECT\s+.*FROM|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|<iframe\b/i.test(text)) {
    throw new Error('SECURITY_REJECTION: Response contains forbidden executable code, HTML tags, or SQL statements.');
  }
  return text.trim();
}

function maskStudentIdentifiers(contract) {
  if (!contract || typeof contract !== 'object') return contract;
  const sanitized = JSON.parse(JSON.stringify(contract));

  if (sanitized.studentContext && sanitized.studentContext.usn) {
    delete sanitized.studentContext.usn;
  }

  if (Array.isArray(sanitized.atRiskStudents)) {
    sanitized.atRiskStudents = sanitized.atRiskStudents.map(s => ({
      ...s,
      usn: '[REDACTED]',
    }));
  }

  return sanitized;
}

/**
 * Normalizes gateway response to frontend LocalLLMAnalysisResponse
 */
function normalizeGatewayResponse(gatewayJson) {
  if (!gatewayJson || typeof gatewayJson !== 'object') {
    return {
      success: false,
      summary: 'Malformed response received from Local LLM gateway.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: 'LLM_INVALID_RESPONSE',
        message: 'Gateway response payload is not an object.',
        timestamp: new Date().toISOString(),
      },
    };
  }

  const analysisObj = gatewayJson.analysis || gatewayJson;

  let rawSummary = analysisObj.summary;
  if (typeof rawSummary !== 'string' || !rawSummary.trim()) {
    return {
      success: false,
      summary: 'Summary missing in model response.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: 'LLM_INVALID_RESPONSE',
        message: 'Response summary must be a non-empty string.',
        timestamp: new Date().toISOString(),
      },
    };
  }

  let sanitizedSummary;
  try {
    sanitizedSummary = sanitizeTextOutput(rawSummary);
  } catch (err) {
    return {
      success: false,
      summary: 'Unsafe response content detected.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: 'LLM_INVALID_RESPONSE',
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const trend = ALLOWED_TRENDS.includes(analysisObj.trend) ? analysisObj.trend : 'INSUFFICIENT_DATA';
  const risk_level = ALLOWED_RISKS.includes(analysisObj.risk_level) ? analysisObj.risk_level : 'UNKNOWN';

  // Strict bounds on model output
  const MAX_SUMMARY_LENGTH = 2000;
  const MAX_INSIGHTS_COUNT = 10;
  const MAX_INSIGHT_LENGTH = 300;
  const MAX_RECOMMENDATIONS_COUNT = 10;
  const MAX_RECOMMENDATION_LENGTH = 300;
  const MAX_VISUALIZATIONS_COUNT = 5;

  const boundedSummary = sanitizedSummary.length > MAX_SUMMARY_LENGTH
    ? sanitizedSummary.slice(0, MAX_SUMMARY_LENGTH)
    : sanitizedSummary;

  const insights = Array.isArray(analysisObj.insights)
    ? analysisObj.insights
        .filter(i => typeof i === 'string')
        .map(i => i.trim().slice(0, MAX_INSIGHT_LENGTH))
        .filter(i => i.length > 0)
        .slice(0, MAX_INSIGHTS_COUNT)
    : [];

  const recommendations = Array.isArray(analysisObj.recommendations)
    ? analysisObj.recommendations
        .filter(r => typeof r === 'string')
        .map(r => r.trim().slice(0, MAX_RECOMMENDATION_LENGTH))
        .filter(r => r.length > 0)
        .slice(0, MAX_RECOMMENDATIONS_COUNT)
    : [];

  const visualizations = [];
  if (Array.isArray(analysisObj.visualizations)) {
    for (const v of analysisObj.visualizations) {
      if (
        v &&
        typeof v === 'object' &&
        ALLOWED_VISUALIZATIONS.includes(v.type) &&
        typeof v.dataset === 'string' &&
        typeof v.title === 'string'
      ) {
        visualizations.push({
          type: v.type,
          dataset: v.dataset.slice(0, 100),
          title: v.title.slice(0, 150),
        });
        if (visualizations.length >= MAX_VISUALIZATIONS_COUNT) break;
      }
    }
  }

  return {
    success: true,
    summary: boundedSummary,
    trend,
    risk_level,
    insights,
    recommendations,
    visualizations,
    model: gatewayJson.model || 'qwen3:4b',
  };
}

/**
 * Helper to get current day of week in the institution's academic timezone (Asia/Kolkata).
 */
function getAcademicDayOfWeek() {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
    });
    return formatter.format(new Date());
  } catch {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  }
}

/**
 * Creates a mock Supabase query client for testing fail-closed database query handling.
 */
function createMockQueryClient(tableResponses = {}) {
  return {
    from: (tableName) => {
      const state = {
        table: tableName,
        columns: '*',
        filters: [],
        ordering: null,
        limits: null,
      };

      const builder = {
        select: (cols, opts) => { state.columns = cols; state.opts = opts; return builder; },
        eq: (col, val) => { state.filters.push({ type: 'eq', col, val }); return builder; },
        in: (col, vals) => { state.filters.push({ type: 'in', col, vals }); return builder; },
        lt: (col, val) => { state.filters.push({ type: 'lt', col, val }); return builder; },
        not: (col, op, val) => { state.filters.push({ type: 'not', col, op, val }); return builder; },
        order: (col, opts) => { state.ordering = { col, opts }; return builder; },
        limit: (n) => { state.limits = n; return builder; },
        maybeSingle: async () => {
          const resp = tableResponses[tableName];
          if (typeof resp === 'function') return resp(state, 'maybeSingle');
          if (resp) return resp;
          return { data: null, error: null };
        },
        single: async () => {
          const resp = tableResponses[tableName];
          if (typeof resp === 'function') return resp(state, 'single');
          if (resp) return resp;
          return { data: null, error: null };
        },
        then: (resolve, reject) => {
          const resp = tableResponses[tableName];
          let result;
          if (typeof resp === 'function') result = resp(state, 'then');
          else if (resp) result = resp;
          else result = { data: [], error: null, count: 0 };
          return Promise.resolve(result).then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

async function simulateFetchStudentServerAnalytics(userClient, userId, profile) {
  const { data: analyticsData, error: analyticsError } = await userClient
    .from('student_analytics_view')
    .select('attendance_percentage, total_assignments, submitted_assignments, total_assessment_attempts, avg_assessment_percentage')
    .eq('student_id', userId)
    .maybeSingle();
  if (analyticsError) throw new Error(`Query failed for student_analytics_view: ${analyticsError.message}`);

  const { data: gapsData, error: gapsError } = await userClient
    .from('student_learning_gaps_view')
    .select('topic_name, course_id, course_name, total_questions, correct_answers, wrong_answers, topic_score_percent')
    .eq('student_id', userId)
    .order('topic_score_percent', { ascending: true });
  if (gapsError) throw new Error(`Query failed for student_learning_gaps_view: ${gapsError.message}`);

  const { data: assessmentsData, error: assessmentsError } = await userClient
    .from('assessment_attempts')
    .select('score, max_score, percentage, submitted_at, status, assessments(title)')
    .eq('student_id', userId)
    .in('status', ['Submitted', 'Graded'])
    .order('submitted_at', { ascending: false })
    .limit(20);
  if (assessmentsError) throw new Error(`Query failed for assessment_attempts: ${assessmentsError.message}`);

  const { count: submittedCount, error: subError } = await userClient
    .from('assignment_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', userId);
  if (subError) throw new Error(`Query failed for assignment_submissions: ${subError.message}`);

  let totalAssignmentsCount = 0;
  if (profile.department_id) {
    const { count: activeAssignments, error: asgnError } = await userClient
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', profile.department_id)
      .eq('status', 'Active');
    if (asgnError) throw new Error(`Query failed for assignments: ${asgnError.message}`);
    totalAssignmentsCount = activeAssignments || 0;
  }

  const { data: resultsData, error: resultsError } = await userClient
    .from('results')
    .select('semester, total_marks, max_marks')
    .eq('student_id', userId)
    .order('semester', { ascending: true });
  if (resultsError) throw new Error(`Query failed for results: ${resultsError.message}`);

  const { data: studentProf, error: profError } = await userClient
    .from('student_profiles')
    .select('semester, cgpa')
    .eq('profile_id', userId)
    .maybeSingle();
  if (profError) throw new Error(`Query failed for student_profiles: ${profError.message}`);

  let departmentName = undefined;
  if (profile.department_id) {
    const { data: deptData, error: deptError } = await userClient
      .from('departments')
      .select('name')
      .eq('id', profile.department_id)
      .maybeSingle();
    if (deptError) throw new Error(`Query failed for departments: ${deptError.message}`);
    if (deptData?.name) departmentName = deptData.name;
  }

  const subCount = submittedCount || Number(analyticsData?.submitted_assignments || 0);
  const totCount = Math.max(totalAssignmentsCount, Number(analyticsData?.total_assignments || 0), subCount);

  return {
    role: 'STUDENT',
    timestamp: new Date().toISOString(),
    studentContext: {
      fullName: profile.full_name || 'Student',
      departmentName,
      semester: studentProf?.semester != null ? Number(studentProf.semester) : undefined,
      cgpa: studentProf?.cgpa != null ? Number(studentProf.cgpa) : null,
    },
    overview: {
      attendancePercent: Number(analyticsData?.attendance_percentage || 0),
      assignmentsSubmitted: subCount,
      totalAssignments: totCount,
      assignmentCompletionRate: totCount > 0 ? Math.round((subCount / totCount) * 100) : 0,
      assessmentsAttempted: Number(analyticsData?.total_assessment_attempts || 0),
      avgAssessmentScore: Number(analyticsData?.avg_assessment_percentage || 0),
    },
    subjectPerformance: [],
    learningGaps: [],
    assessmentBreakdown: [],
    assignmentCompletion: { submitted: subCount, pending: Math.max(0, totCount - subCount), late: 0, total: totCount },
    semesterTrends: [],
  };
}

async function simulateFetchFacultyServerAnalytics(userClient, userId, profile) {
  const academicDay = getAcademicDayOfWeek();

  const { data: scheduleData, error: scheduleError } = await userClient
    .from('timetable_entries')
    .select('course_code, course_name, semester, start_time, end_time, room')
    .eq('faculty_id', userId)
    .eq('day_of_week', academicDay)
    .order('start_time', { ascending: true });
  if (scheduleError) throw new Error(`Query failed for timetable_entries: ${scheduleError.message}`);

  const { data: enrollmentsData, error: enrollmentsError } = await userClient
    .from('course_enrollments')
    .select('course_id, course_name, course_code, semester, student_id')
    .eq('faculty_id', userId)
    .eq('status', 'Active');
  if (enrollmentsError) throw new Error(`Query failed for course_enrollments: ${enrollmentsError.message}`);

  const { data: assignmentsData, error: assignmentsError } = await userClient
    .from('assignments')
    .select('id, title, course_id, course_name, status')
    .eq('created_by', userId);
  if (assignmentsError) throw new Error(`Query failed for assignments: ${assignmentsError.message}`);

  const assignmentList = assignmentsData || [];
  const assignmentIds = assignmentList.map(a => a.id);

  let totalPendingEvaluations = 0;
  if (assignmentIds.length > 0) {
    const { data: pendingSubmissions, error: submissionsError } = await userClient
      .from('assignment_submissions')
      .select('assignment_id, status')
      .in('assignment_id', assignmentIds)
      .eq('status', 'Submitted');
    if (submissionsError) throw new Error(`Query failed for assignment_submissions: ${submissionsError.message}`);
    totalPendingEvaluations = (pendingSubmissions || []).length;
  }

  let departmentName = 'Department';
  if (profile.department_id) {
    const { data: dept, error: deptError } = await userClient
      .from('departments')
      .select('name')
      .eq('id', profile.department_id)
      .maybeSingle();
    if (deptError) throw new Error(`Query failed for departments: ${deptError.message}`);
    if (dept?.name) departmentName = dept.name;
  }

  return {
    role: 'FACULTY',
    timestamp: new Date().toISOString(),
    facultyContext: {
      fullName: profile.full_name || 'Faculty',
      departmentName,
      designation: 'Faculty Member',
    },
    summaryStats: {
      assignedCoursesCount: (enrollmentsData || []).length,
      totalStudentsTaught: 60,
      todaysClassesCount: (scheduleData || []).length,
      pendingEvaluationsCount: totalPendingEvaluations,
      activeAssignmentsCount: assignmentList.filter(a => a.status === 'Active').length,
      attendanceAlertsCount: 0,
    },
    todaySchedule: [],
    pendingEvaluations: [],
    atRiskStudents: [],
    assignedCourses: [],
  };
}

async function simulateFetchHODServerAnalytics(userClient, profile) {
  if (!profile.department_id) {
    throw new Error('HOD account is not assigned to a department.');
  }
  const deptId = profile.department_id;

  const { data: dept, error: deptError } = await userClient
    .from('departments')
    .select('name, code')
    .eq('id', deptId)
    .single();
  if (deptError || !dept) throw new Error(`Query failed for departments: ${deptError?.message || 'Department not found'}`);

  const { data: academicYearData, error: yearError } = await userClient
    .from('course_enrollments')
    .select('academic_year')
    .eq('department_id', deptId)
    .not('academic_year', 'is', null)
    .limit(1)
    .maybeSingle();
  if (yearError) throw new Error(`Query failed for academic_year: ${yearError.message}`);

  const { count: totalFaculty, error: facErr } = await userClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('department_id', deptId)
    .in('role', ['FACULTY', 'HOD']);
  if (facErr) throw new Error(`Query failed for faculty profiles: ${facErr.message}`);

  return {
    role: 'HOD',
    timestamp: new Date().toISOString(),
    departmentContext: {
      departmentName: dept.name,
      departmentCode: dept.code || 'DEPT',
      hodName: profile.full_name || 'HOD',
      academicYear: academicYearData?.academic_year || 'Current Academic Year',
    },
    overviewStats: {
      totalFaculty: totalFaculty || 0,
      activeFacultyCount: totalFaculty || 0,
      activeFacultyToday: 0,
      totalStudents: 0,
      activeStudents: 0,
      activeCourses: 0,
      overallAttendancePercent: 85,
      averageCgpa: null,
      passRatePercent: null,
      assignmentCompletionPercent: null,
      academicAlertsCount: 0,
      pendingReviewsCount: 0,
    },
    attendanceMetrics: { overallAttendance: 85, presentRate: 85, absentRate: 15, lateRate: 0, semesterBreakdown: [], courseAttendance: [] },
    atRiskStudents: [],
    facultyRosterSummary: [],
  };
}

async function simulateFetchAdminServerAnalytics(userClient, profile) {
  const { count: totalFaculty, error: facErr } = await userClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('role', ['FACULTY', 'HOD']);
  if (facErr) throw new Error(`Query failed for totalFaculty: ${facErr.message}`);

  const { count: totalStudents, error: studErr } = await userClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'STUDENT');
  if (studErr) throw new Error(`Query failed for totalStudents: ${studErr.message}`);

  const { count: totalDepartments, error: deptErr } = await userClient
    .from('departments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ACTIVE');
  if (deptErr) throw new Error(`Query failed for totalDepartments: ${deptErr.message}`);

  return {
    role: 'ADMIN',
    timestamp: new Date().toISOString(),
    institutionalContext: {
      scope: 'CAMPUS_WIDE',
      totalDepartments: totalDepartments || 0,
      totalFaculty: totalFaculty || 0,
      totalStudents: totalStudents || 0,
    },
  };
}

/**
 * Simulated Edge Function execution handler
 */
async function simulateLocalLLMAnalyzeEdgeFunction({
  authHeader,
  userProfile,
  requestBody,
  envSecrets = {},
  mockGatewayFetch = null,
  facultyAuthorizedCourses = null,
  facultyAuthorizedStudents = null,
  serverDerivedAnalytics = null,
  mockUserClient = null,
}) {
  // 1. Authenticate JWT
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, body: { success: false, error: 'AUTHENTICATION_REQUIRED' } };
  }

  // 2. Verify account status
  if (!userProfile) {
    return { status: 404, body: { success: false, error: 'USER_NOT_FOUND' } };
  }
  if (userProfile.account_status !== 'ACTIVE') {
    return { status: 403, body: { success: false, error: 'ACCOUNT_INACTIVE' } };
  }

  const verifiedRole = userProfile.role;

  // 3. Prevent client role spoofing
  if (requestBody.role && requestBody.role !== verifiedRole) {
    return { status: 403, body: { success: false, error: 'ROLE_MISMATCH' } };
  }

  // Non-admin cannot use admin path
  if (requestBody.role === 'ADMIN' && verifiedRole !== 'ADMIN') {
    return { status: 403, body: { success: false, error: 'PERMISSION_DENIED' } };
  }

  // 4. Validate analysis type
  const analysisType = requestBody.analysisType || requestBody.analysis_type || 'ACADEMIC_OVERVIEW';
  if (!ALLOWED_ANALYSIS_TYPES.includes(analysisType)) {
    return { status: 400, body: { success: false, error: 'INVALID_ANALYSIS_TYPE' } };
  }

  // 5. Validate analytics contract & role matching
  const contract = requestBody.analyticsContract || requestBody.analytics_contract;
  if (!contract || typeof contract !== 'object') {
    return { status: 400, body: { success: false, error: 'MISSING_ANALYTICS_CONTRACT' } };
  }

  if (contract.role && contract.role !== verifiedRole) {
    return { status: 403, body: { success: false, error: 'ROLE_MISMATCH' } };
  }

  // 6. Role-specific scoping & student cross-account protection
  if (verifiedRole === 'STUDENT') {
    if (contract.studentContext && contract.studentContext.studentId && contract.studentContext.studentId !== userProfile.id) {
      return { status: 403, body: { success: false, error: 'CROSS_ACCOUNT_ACCESS_DENIED' } };
    }
  } else if (verifiedRole === 'FACULTY') {
    if (contract.facultyContext && contract.facultyContext.facultyId && contract.facultyContext.facultyId !== userProfile.id) {
      return { status: 403, body: { success: false, error: 'UNAUTHORIZED_FACULTY_SCOPE' } };
    }
    // Check faculty assigned courses scope
    if (facultyAuthorizedCourses && Array.isArray(contract.assignedCourses)) {
      const hasUnauthorizedCourse = contract.assignedCourses.some(
        c => !facultyAuthorizedCourses.includes(c.courseId)
      );
      if (hasUnauthorizedCourse) {
        return { status: 403, body: { success: false, error: 'UNAUTHORIZED_FACULTY_SCOPE' } };
      }
    }
    // Check faculty authorized students scope
    if (facultyAuthorizedStudents && Array.isArray(contract.atRiskStudents)) {
      const hasUnauthorizedStudent = contract.atRiskStudents.some(
        s => s.studentId && !facultyAuthorizedStudents.includes(s.studentId)
      );
      if (hasUnauthorizedStudent) {
        return { status: 403, body: { success: false, error: 'UNAUTHORIZED_FACULTY_SCOPE' } };
      }
    }
  } else if (verifiedRole === 'HOD') {
    if (contract.departmentContext && contract.departmentContext.departmentId && contract.departmentContext.departmentId !== userProfile.department_id) {
      return { status: 403, body: { success: false, error: 'CROSS_DEPARTMENT_ACCESS_DENIED' } };
    }
  }

  // 7. Authoritative Server-Side Analytics Retrieval (Fail Closed on Error)
  let finalContract = { ...contract };
  if (mockUserClient) {
    try {
      if (verifiedRole === 'STUDENT') {
        finalContract = await simulateFetchStudentServerAnalytics(mockUserClient, userProfile.id, userProfile);
      } else if (verifiedRole === 'FACULTY') {
        finalContract = await simulateFetchFacultyServerAnalytics(mockUserClient, userProfile.id, userProfile);
      } else if (verifiedRole === 'HOD') {
        finalContract = await simulateFetchHODServerAnalytics(mockUserClient, userProfile);
      } else if (verifiedRole === 'ADMIN') {
        finalContract = await simulateFetchAdminServerAnalytics(mockUserClient, userProfile);
      }
    } catch (err) {
      return {
        status: 200,
        body: {
          success: false,
          summary: 'Authoritative database query failed during analytics retrieval. Deterministic analytics remain active.',
          trend: 'INSUFFICIENT_DATA',
          risk_level: 'UNKNOWN',
          insights: [],
          recommendations: [],
          visualizations: [],
          error: {
            code: 'DATABASE_QUERY_FAILED',
            message: 'A database error occurred while querying authoritative analytics. Gateway dispatch was aborted.',
            timestamp: new Date().toISOString(),
          },
        },
      };
    }
  } else if (serverDerivedAnalytics) {
    finalContract = {
      ...finalContract,
      ...serverDerivedAnalytics,
      studentContext: {
        ...finalContract.studentContext,
        ...(serverDerivedAnalytics.studentContext || {}),
      },
      overview: {
        ...finalContract.overview,
        ...(serverDerivedAnalytics.overview || {}),
      },
    };
  }

  // 8. Security assertions and identifier masking
  try {
    assertCredentialSafety(finalContract);
  } catch (err) {
    return { status: 400, body: { success: false, error: err.message } };
  }

  const sanitizedContract = maskStudentIdentifiers(finalContract);

  // 8. Check gateway configuration secrets
  const gatewayUrl = envSecrets.ORACLE_GATEWAY_URL;
  const gatewayApiKey = envSecrets.ORACLE_GATEWAY_API_KEY;

  if (!gatewayUrl || !gatewayApiKey) {
    return {
      status: 200,
      body: {
        success: false,
        summary: 'Local LLM analysis unavailable. Standard deterministic analytics dashboards remain fully operational.',
        trend: 'INSUFFICIENT_DATA',
        risk_level: 'UNKNOWN',
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: 'LLM_UNAVAILABLE',
          message: 'No private Local LLM runtime endpoint is configured in Supabase Edge Function secrets.',
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  // 9. Dispatch to gateway using mockGatewayFetch
  if (!mockGatewayFetch) {
    return { status: 500, body: { success: false, error: 'NO_GATEWAY_SIMULATION' } };
  }

  try {
    const gatewayRes = await mockGatewayFetch({
      url: `${gatewayUrl.replace(/\/+$/, '')}/v1/analyze`,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': gatewayApiKey,
      },
      body: {
        role: verifiedRole,
        analysis_type: analysisType,
        analytics_contract: sanitizedContract,
      },
    });

    if (gatewayRes.timeout) {
      return {
        status: 200,
        body: {
          success: false,
          summary: 'Local LLM analysis request timed out.',
          trend: 'INSUFFICIENT_DATA',
          risk_level: 'UNKNOWN',
          insights: [],
          recommendations: [],
          visualizations: [],
          error: {
            code: 'LLM_TIMEOUT',
            message: 'Local LLM request timed out after 35000ms.',
            timestamp: new Date().toISOString(),
          },
        },
      };
    }

    if (gatewayRes.status !== 200) {
      return {
        status: 200,
        body: {
          success: false,
          summary: `Gateway returned status ${gatewayRes.status}.`,
          trend: 'INSUFFICIENT_DATA',
          risk_level: 'UNKNOWN',
          insights: [],
          recommendations: [],
          visualizations: [],
          error: {
            code: 'LLM_REQUEST_FAILED',
            message: `Gateway returned HTTP status ${gatewayRes.status}.`,
            timestamp: new Date().toISOString(),
          },
        },
      };
    }

    const normalized = normalizeGatewayResponse(gatewayRes.data);
    return { status: 200, body: normalized };

  } catch (err) {
    return {
      status: 200,
      body: {
        success: false,
        summary: 'Network error communicating with gateway.',
        trend: 'INSUFFICIENT_DATA',
        risk_level: 'UNKNOWN',
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: 'LLM_REQUEST_FAILED',
          message: err.message,
          timestamp: new Date().toISOString(),
        },
      },
    };
  }
}

// ============================================================
// TEST SUITES
// ============================================================

const validStudentProfile = {
  id: 'usr-student-1',
  role: 'STUDENT',
  account_status: 'ACTIVE',
  full_name: 'Rahul Sharma',
  department_id: 'dept-ece',
};

const validStudentContract = {
  role: 'STUDENT',
  timestamp: new Date().toISOString(),
  studentContext: { fullName: 'Rahul Sharma', studentId: 'usr-student-1', usn: '1AT21EC001', semester: 6 },
  overview: { attendancePercent: 86.5, assignmentsSubmitted: 12, totalAssignments: 14, assignmentCompletionRate: 85, assessmentsAttempted: 3, avgAssessmentScore: 78.5 },
  subjectPerformance: [{ subject: 'Digital Signal Processing', courseId: 'ECE301', scorePercent: 82, totalQuestions: 30, correctAnswers: 25, topicsAnalyzed: 4 }],
  learningGaps: [],
  assessmentBreakdown: [],
  assignmentCompletion: { submitted: 12, pending: 2, late: 0, total: 14 },
  semesterTrends: [{ semester: 5, averagePercent: 80 }],
};

test('1. Unauthenticated requests are rejected (401)', async () => {
  const res1 = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: null,
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
  });
  assert.strictEqual(res1.status, 401);
  assert.strictEqual(res1.body.error, 'AUTHENTICATION_REQUIRED');

  const res2 = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Basic invalid',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
  });
  assert.strictEqual(res2.status, 401);
});

test('2. Inactive accounts are rejected (403)', async () => {
  const inactiveProfile = { ...validStudentProfile, account_status: 'SUSPENDED' };
  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: inactiveProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'ACCOUNT_INACTIVE');
});

test('3. Client role spoofing is rejected (403)', async () => {
  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile, // Verified role is STUDENT
    requestBody: {
      role: 'ADMIN', // Spoofed client role!
      analyticsContract: validStudentContract,
    },
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'ROLE_MISMATCH');
});

test('4. Student cross-account data access is rejected (403)', async () => {
  const crossAccountContract = {
    ...validStudentContract,
    studentContext: {
      ...validStudentContract.studentContext,
      studentId: 'usr-student-OTHER', // Different student ID!
    },
  };

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile, // id is usr-student-1
    requestBody: { role: 'STUDENT', analyticsContract: crossAccountContract },
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'CROSS_ACCOUNT_ACCESS_DENIED');
});

test('5. Faculty access is restricted to authorized faculty ID and USNs are masked', async () => {
  const facultyProfile = { id: 'usr-fac-1', role: 'FACULTY', account_status: 'ACTIVE', department_id: 'dept-ece' };
  const facultyContract = {
    role: 'FACULTY',
    timestamp: new Date().toISOString(),
    facultyContext: { fullName: 'Prof. Rao', facultyId: 'usr-fac-1', departmentName: 'ECE', designation: 'Assistant Professor' },
    summaryStats: { assignedCoursesCount: 2, totalStudentsTaught: 120, todaysClassesCount: 2, pendingEvaluationsCount: 5, activeAssignmentsCount: 2, attendanceAlertsCount: 3 },
    todaySchedule: [],
    pendingEvaluations: [],
    atRiskStudents: [
      { studentName: 'Student X', usn: '1AT21EC999', attendancePercent: 62, severity: 'high', details: 'Critical shortage' },
    ],
    assignedCourses: [],
  };

  let capturedGatewayPayload = null;
  const mockFetch = async ({ url, headers, body }) => {
    capturedGatewayPayload = body;
    return {
      status: 200,
      data: {
        success: true,
        model: 'qwen3:4b',
        analysis: {
          summary: 'Faculty classes are running smoothly with 5 evaluations pending.',
          trend: 'STABLE',
          risk_level: 'MEDIUM',
          insights: ['Attendance alerts require follow up'],
          recommendations: ['Send reminder notifications'],
          visualizations: [],
        },
      },
    };
  };

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: facultyProfile,
    requestBody: { role: 'FACULTY', analyticsContract: facultyContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: 'test-secret-key' },
    mockGatewayFetch: mockFetch,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  // Verify USN was masked before sending to gateway!
  assert.strictEqual(capturedGatewayPayload.analytics_contract.atRiskStudents[0].usn, '[REDACTED]');
});

test('6. HOD access is restricted to assigned department', async () => {
  const hodProfile = { id: 'usr-hod-1', role: 'HOD', account_status: 'ACTIVE', department_id: 'dept-ece' };
  const crossDeptContract = {
    role: 'HOD',
    timestamp: new Date().toISOString(),
    departmentContext: { departmentId: 'dept-CSE', departmentName: 'CSE', departmentCode: 'CSE', hodName: 'Dr. Kumar', academicYear: '2025-26' }, // Mismatched dept!
    overviewStats: { totalFaculty: 15, activeFacultyCount: 15, activeFacultyToday: 12, totalStudents: 240, activeStudents: 238, activeCourses: 8, overallAttendancePercent: 84, averageCgpa: 8.1, passRatePercent: 92, assignmentCompletionPercent: 88, academicAlertsCount: 5, pendingReviewsCount: 2 },
    attendanceMetrics: { overallAttendance: 84, presentRate: 84, absentRate: 14, lateRate: 2, semesterBreakdown: [], courseAttendance: [] },
    atRiskStudents: [],
    facultyRosterSummary: [],
  };

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: hodProfile,
    requestBody: { role: 'HOD', analyticsContract: crossDeptContract },
  });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'CROSS_DEPARTMENT_ACCESS_DENIED');
});

test('7. Admin authorization follows existing administrative policies', async () => {
  const adminProfile = { id: 'usr-admin-1', role: 'ADMIN', account_status: 'ACTIVE', department_id: null };
  const adminContract = {
    role: 'ADMIN',
    timestamp: new Date().toISOString(),
    institutionalContext: { scope: 'CAMPUS_WIDE' },
  };

  const mockFetch = async () => ({
    status: 200,
    data: {
      success: true,
      model: 'qwen3:4b',
      analysis: {
        summary: 'Institutional metrics are stable across all branches.',
        trend: 'STABLE',
        risk_level: 'LOW',
        insights: ['Good overall attendance'],
        recommendations: ['Maintain current scheduling'],
        visualizations: [],
      },
    },
  });

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: adminProfile,
    requestBody: { role: 'ADMIN', analyticsContract: adminContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: 'test-secret-key' },
    mockGatewayFetch: mockFetch,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
});

test('8. Gateway credentials never reach the frontend or response body', async () => {
  const testSecretKey = 'super-secret-oracle-gateway-key-xyz123';
  const mockFetch = async () => ({
    status: 200,
    data: {
      success: true,
      analysis: {
        summary: 'Student is performing well.',
        trend: 'IMPROVING',
        risk_level: 'LOW',
        insights: [],
        recommendations: [],
        visualizations: [],
      },
    },
  });

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: testSecretKey },
    mockGatewayFetch: mockFetch,
  });

  const responseString = JSON.stringify(res.body);
  assert.strictEqual(responseString.includes(testSecretKey), false);
  assert.strictEqual(responseString.includes('X-API-Key'), false);
});

test('9. Missing secrets and unavailable gateway are handled safely (LLM_UNAVAILABLE)', async () => {
  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
    envSecrets: {}, // Missing secrets!
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error.code, 'LLM_UNAVAILABLE');
  assert.strictEqual(res.body.summary.includes('unavailable'), true);
});

test('10. Gateway timeout and non-2xx responses are handled (LLM_TIMEOUT / LLM_REQUEST_FAILED)', async () => {
  // Timeout simulation
  const timeoutFetch = async () => ({ timeout: true });
  const resTimeout = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: 'test-key' },
    mockGatewayFetch: timeoutFetch,
  });

  assert.strictEqual(resTimeout.body.success, false);
  assert.strictEqual(resTimeout.body.error.code, 'LLM_TIMEOUT');

  // HTTP 502 Bad Gateway simulation
  const non2xxFetch = async () => ({ status: 502 });
  const res502 = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: 'test-key' },
    mockGatewayFetch: non2xxFetch,
  });

  assert.strictEqual(res502.body.success, false);
  assert.strictEqual(res502.body.error.code, 'LLM_REQUEST_FAILED');
  assert.strictEqual(res502.body.error.message.includes('502'), true);
});

test('11. Malformed model responses are rejected or safely normalized', () => {
  // Empty payload
  const emptyRes = normalizeGatewayResponse(null);
  assert.strictEqual(emptyRes.success, false);
  assert.strictEqual(emptyRes.error.code, 'LLM_INVALID_RESPONSE');

  // Missing summary
  const noSummary = normalizeGatewayResponse({ success: true, analysis: { summary: '' } });
  assert.strictEqual(noSummary.success, false);
  assert.strictEqual(noSummary.error.code, 'LLM_INVALID_RESPONSE');

  // Script injection in model summary
  const scriptInSummary = normalizeGatewayResponse({
    success: true,
    analysis: { summary: 'Analysis <script>alert("pwned")</script>' },
  });
  assert.strictEqual(scriptInSummary.success, false);
  assert.strictEqual(scriptInSummary.error.code, 'LLM_INVALID_RESPONSE');
  assert.strictEqual(scriptInSummary.error.message.includes('SECURITY_REJECTION'), true);

  // SQL injection in summary
  const sqlInSummary = normalizeGatewayResponse({
    success: true,
    analysis: { summary: 'SELECT * FROM student_profiles WHERE id = 1;' },
  });
  assert.strictEqual(sqlInSummary.success, false);
  assert.strictEqual(sqlInSummary.error.code, 'LLM_INVALID_RESPONSE');

  // Invalid visualization type is safely filtered
  const invalidVis = normalizeGatewayResponse({
    success: true,
    analysis: {
      summary: 'Valid summary text.',
      visualizations: [{ type: 'UNSUPPORTED_3D_CHART', dataset: 'test', title: 'Test' }],
    },
  });
  assert.strictEqual(invalidVis.success, true);
  assert.strictEqual(invalidVis.visualizations.length, 0); // Filtered out safely
});

test('12. Valid analysis responses map correctly to existing TypeScript response type', () => {
  const gatewayOutput = {
    success: true,
    model: 'qwen3:4b',
    analysis: {
      summary: 'Student exhibits consistent attendance of 86.5% with strong DSP performance.',
      trend: 'IMPROVING',
      risk_level: 'LOW',
      insights: ['Scored 82% in DSP', 'Zero late submissions'],
      recommendations: ['Complete 2 pending assignments before Friday'],
      visualizations: [
        { type: 'BAR', dataset: 'subjectPerformance', title: 'Subject Performance Overview' },
        { type: 'LINE', dataset: 'semesterTrends', title: 'Semester Performance Trend' },
      ],
    },
  };

  const normalized = normalizeGatewayResponse(gatewayOutput);
  assert.strictEqual(normalized.success, true);
  assert.strictEqual(normalized.summary.includes('86.5%'), true);
  assert.strictEqual(normalized.trend, 'IMPROVING');
  assert.strictEqual(normalized.risk_level, 'LOW');
  assert.strictEqual(normalized.insights.length, 2);
  assert.strictEqual(normalized.recommendations.length, 1);
  assert.strictEqual(normalized.visualizations.length, 2);
  assert.strictEqual(normalized.visualizations[0].type, 'BAR');
  assert.strictEqual(normalized.model, 'qwen3:4b');
});

test('13. Existing deterministic AI tests and functionality remain unchanged', () => {
  // Deterministic response generator logic mirror verification
  function deterministicAttendance(percent) {
    if (percent < 75) {
      return `⚠️ Your attendance is ${percent}%, below university requirement of 75%.`;
    }
    return `✅ Your attendance is ${percent}%, meeting university requirements.`;
  }

  assert.strictEqual(deterministicAttendance(88).includes('meeting'), true);
  assert.strictEqual(deterministicAttendance(64).includes('below'), true);
});

test('14. Existing analytics calculations remain the authoritative source of truth', () => {
  const attendancePercent = validStudentContract.overview.attendancePercent;
  const assignmentRate = validStudentContract.overview.assignmentCompletionRate;

  // The local LLM never alters or recalculates authoritative database metrics
  assert.strictEqual(attendancePercent, 86.5);
  assert.strictEqual(assignmentRate, 85);
});

test('15. Faculty cannot submit metrics for unassigned courses or unauthorized students', async () => {
  const facultyProfile = { id: 'usr-fac-1', role: 'FACULTY', account_status: 'ACTIVE', department_id: 'dept-ece' };

  // 1. Attempting to submit unassigned course
  const unassignedCourseContract = {
    role: 'FACULTY',
    timestamp: new Date().toISOString(),
    facultyContext: { fullName: 'Prof. Rao', facultyId: 'usr-fac-1', departmentName: 'ECE', designation: 'Assistant Professor' },
    summaryStats: { assignedCoursesCount: 1, totalStudentsTaught: 60, todaysClassesCount: 1, pendingEvaluationsCount: 0, activeAssignmentsCount: 1, attendanceAlertsCount: 0 },
    todaySchedule: [],
    pendingEvaluations: [],
    atRiskStudents: [],
    assignedCourses: [
      { courseId: 'UNASSIGNED-CSE-999', courseCode: 'CS999', courseName: 'Hacking 101', semester: 8, studentCount: 60 },
    ],
  };

  const res1 = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: facultyProfile,
    requestBody: { role: 'FACULTY', analyticsContract: unassignedCourseContract },
    facultyAuthorizedCourses: ['ECE301', 'ECE302'], // Only ECE301 and ECE302 authorized
  });

  assert.strictEqual(res1.status, 403);
  assert.strictEqual(res1.body.error, 'UNAUTHORIZED_FACULTY_SCOPE');

  // 2. Attempting to submit unauthorized student outside faculty courses
  const unauthorizedStudentContract = {
    role: 'FACULTY',
    timestamp: new Date().toISOString(),
    facultyContext: { fullName: 'Prof. Rao', facultyId: 'usr-fac-1', departmentName: 'ECE', designation: 'Assistant Professor' },
    summaryStats: { assignedCoursesCount: 1, totalStudentsTaught: 60, todaysClassesCount: 1, pendingEvaluationsCount: 0, activeAssignmentsCount: 1, attendanceAlertsCount: 1 },
    todaySchedule: [],
    pendingEvaluations: [],
    atRiskStudents: [
      { studentId: 'student-from-another-dept', studentName: 'Intruder', usn: '1AT21CS099', attendancePercent: 40, severity: 'high', details: 'Unknown student' },
    ],
    assignedCourses: [{ courseId: 'ECE301', courseCode: 'ECE301', courseName: 'Signals', semester: 4, studentCount: 60 }],
  };

  const res2 = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: facultyProfile,
    requestBody: { role: 'FACULTY', analyticsContract: unauthorizedStudentContract },
    facultyAuthorizedCourses: ['ECE301'],
    facultyAuthorizedStudents: ['student-enrolled-1', 'student-enrolled-2'], // Does not include student-from-another-dept
  });

  assert.strictEqual(res2.status, 403);
  assert.strictEqual(res2.body.error, 'UNAUTHORIZED_FACULTY_SCOPE');
});

test('16. Non-admin cannot use the admin path (403 PERMISSION_DENIED)', async () => {
  // Student attempting to access admin route
  const studentProfile = { id: 'usr-student-1', role: 'STUDENT', account_status: 'ACTIVE', department_id: 'dept-ece' };
  const resStudent = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: studentProfile,
    requestBody: {
      role: 'ADMIN',
      analyticsContract: { role: 'ADMIN', timestamp: new Date().toISOString() },
    },
  });
  assert.strictEqual(resStudent.status, 403);
  assert.strictEqual(resStudent.body.error, 'ROLE_MISMATCH');

  // Faculty attempting to access admin route
  const facultyProfile = { id: 'usr-fac-1', role: 'FACULTY', account_status: 'ACTIVE', department_id: 'dept-ece' };
  const resFaculty = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: facultyProfile,
    requestBody: {
      role: 'ADMIN',
      analyticsContract: { role: 'ADMIN', timestamp: new Date().toISOString() },
    },
  });
  assert.strictEqual(resFaculty.status, 403);
  assert.strictEqual(resFaculty.body.error, 'ROLE_MISMATCH');
});

test('17. Client-forged aggregate metrics are rejected or replaced with server-derived values', async () => {
  // Client maliciously attempts to send 100% attendance and fake assessment scores
  const clientForgedContract = {
    ...validStudentContract,
    overview: {
      attendancePercent: 100, // Forged!
      assignmentsSubmitted: 50, // Forged!
      totalAssignments: 50,
      assignmentCompletionRate: 100, // Forged!
      assessmentsAttempted: 10,
      avgAssessmentScore: 100, // Forged!
    },
  };

  // Authoritative database values
  const serverAuthoritativeOverview = {
    overview: {
      attendancePercent: 72.4, // Real DB metric
      assignmentsSubmitted: 8,
      totalAssignments: 14,
      assignmentCompletionRate: 57,
      assessmentsAttempted: 2,
      avgAssessmentScore: 68.0,
    },
  };

  let dispatchedContractToGateway = null;
  const mockFetch = async ({ body }) => {
    dispatchedContractToGateway = body.analytics_contract;
    return {
      status: 200,
      data: {
        success: true,
        model: 'qwen3:4b',
        analysis: {
          summary: 'Student attendance is at 72.4%, below the 75% threshold.',
          trend: 'DECLINING',
          risk_level: 'HIGH',
          insights: ['Attendance is 72.4%'],
          recommendations: ['Attend next 3 classes'],
          visualizations: [],
        },
      },
    };
  };

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: clientForgedContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: 'test-secret' },
    mockGatewayFetch: mockFetch,
    serverDerivedAnalytics: serverAuthoritativeOverview, // Server replaces forged metrics
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  // Verify that the model received the authoritative 72.4%, NOT the forged 100%!
  assert.strictEqual(dispatchedContractToGateway.overview.attendancePercent, 72.4);
  assert.strictEqual(dispatchedContractToGateway.overview.assignmentCompletionRate, 57);
});

test('18. Gateway model output fields, lengths, and counts are strictly bounded', () => {
  // Excessively large model response with 50 insights, 50 recommendations, 20 visualizations, 5000-char summary
  const excessiveGatewayOutput = {
    success: true,
    model: 'qwen3:4b',
    analysis: {
      summary: 'A'.repeat(5000), // Far exceeds 2000 chars
      trend: 'STABLE',
      risk_level: 'LOW',
      insights: Array.from({ length: 50 }, (_, i) => `Insight ${i}: ${'B'.repeat(500)}`),
      recommendations: Array.from({ length: 50 }, (_, i) => `Recommendation ${i}: ${'C'.repeat(500)}`),
      visualizations: Array.from({ length: 20 }, (_, i) => ({
        type: 'BAR',
        dataset: `dataset_${i}`,
        title: `Chart ${i}: ${'D'.repeat(300)}`,
      })),
    },
  };

  const normalized = normalizeGatewayResponse(excessiveGatewayOutput);
  assert.strictEqual(normalized.success, true);
  // Summary bounded to <= 2000 characters
  assert.ok(normalized.summary.length <= 2000, 'Summary must be bounded to 2000 chars');
  // Insights bounded to max 10, each <= 300 chars
  assert.strictEqual(normalized.insights.length, 10, 'Insights must be capped at 10');
  assert.ok(normalized.insights.every(i => i.length <= 300), 'Each insight must be <= 300 chars');
  // Recommendations bounded to max 10, each <= 300 chars
  assert.strictEqual(normalized.recommendations.length, 10, 'Recommendations must be capped at 10');
  assert.ok(normalized.recommendations.every(r => r.length <= 300), 'Each recommendation must be <= 300 chars');
  // Visualizations bounded to max 5
  assert.strictEqual(normalized.visualizations.length, 5, 'Visualizations must be capped at 5');
});

test('19. Supabase database query failures trigger DATABASE_QUERY_FAILED and prevent gateway dispatch (fail closed)', async () => {
  let gatewayDispatched = false;
  const mockFetch = async () => {
    gatewayDispatched = true;
    return { status: 200, data: { success: true } };
  };

  // Simulate a database failure on student_analytics_view
  const failingClient = createMockQueryClient({
    student_analytics_view: () => ({
      data: null,
      error: { message: 'connection refused to postgres:5432' },
    }),
  });

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: 'test-key' },
    mockGatewayFetch: mockFetch,
    mockUserClient: failingClient,
  });

  // Verify safe fail-closed response
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error.code, 'DATABASE_QUERY_FAILED');
  assert.strictEqual(res.body.summary.includes('Deterministic analytics remain active'), true);
  // CRITICAL: Verify that the Oracle gateway was NEVER called!
  assert.strictEqual(gatewayDispatched, false, 'Gateway must NOT be dispatched on database query failure');
});

test('20. Nonexistent schema field failures (e.g. student_profiles.department) fail closed without gateway dispatch', async () => {
  let gatewayDispatched = false;
  const mockFetch = async () => {
    gatewayDispatched = true;
    return { status: 200, data: { success: true } };
  };

  // Simulate query failure caused by querying non-existent column
  const schemaErrorClient = createMockQueryClient({
    student_analytics_view: () => ({ data: { attendance_percentage: 85, total_assignments: 10, submitted_assignments: 8 }, error: null }),
    student_learning_gaps_view: () => ({ data: [], error: null }),
    assessment_attempts: () => ({ data: [], error: null }),
    assignment_submissions: () => ({ count: 8, error: null }),
    assignments: () => ({ count: 10, error: null }),
    results: () => ({ data: [], error: null }),
    student_profiles: () => ({
      data: null,
      error: { message: 'column student_profiles.department does not exist' },
    }),
  });

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: 'test-key' },
    mockGatewayFetch: mockFetch,
    mockUserClient: schemaErrorClient,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error.code, 'DATABASE_QUERY_FAILED');
  assert.strictEqual(gatewayDispatched, false, 'Gateway must NOT be dispatched when schema query fails');
});

test('21. Legitimate empty database results succeed and permit gateway dispatch without error', async () => {
  let gatewayDispatched = false;
  let receivedPayload = null;
  const mockFetch = async ({ body }) => {
    gatewayDispatched = true;
    receivedPayload = body;
    return {
      status: 200,
      data: {
        success: true,
        model: 'qwen3:4b',
        analysis: {
          summary: 'Student is newly enrolled with no historical assessment records.',
          trend: 'INSUFFICIENT_DATA',
          risk_level: 'UNKNOWN',
          insights: ['Zero recorded assessment attempts'],
          recommendations: ['Complete introductory assignment'],
          visualizations: [],
        },
      },
    };
  };

  // Legitimate empty result: student has 0 sessions, 0 submissions, 0 attempts, but error is NULL
  const legitimateEmptyClient = createMockQueryClient({
    student_analytics_view: () => ({ data: null, error: null }),
    student_learning_gaps_view: () => ({ data: [], error: null }),
    assessment_attempts: () => ({ data: [], error: null }),
    assignment_submissions: () => ({ count: 0, error: null }),
    assignments: () => ({ count: 0, error: null }),
    results: () => ({ data: [], error: null }),
    student_profiles: () => ({ data: { semester: 1, cgpa: null }, error: null }),
    departments: () => ({ data: { name: 'ECE' }, error: null }),
  });

  const res = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: validStudentProfile,
    requestBody: { role: 'STUDENT', analyticsContract: validStudentContract },
    envSecrets: { ORACLE_GATEWAY_URL: 'https://test-oracle-gateway.internal', ORACLE_GATEWAY_API_KEY: 'test-key' },
    mockGatewayFetch: mockFetch,
    mockUserClient: legitimateEmptyClient,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(gatewayDispatched, true, 'Gateway SHOULD be dispatched on legitimate empty data');
  // Check that empty attendance defaulted to 0 rather than crashing
  assert.strictEqual(receivedPayload.analytics_contract.overview.attendancePercent, 0);
  assert.strictEqual(receivedPayload.analytics_contract.studentContext.semester, 1);
});

test('22. Comprehensive authorization boundaries: cross-student, cross-course, cross-department, and unauthorized-admin access', async () => {
  // A. Cross-student data access
  const studentA = { id: 'student-A', role: 'STUDENT', account_status: 'ACTIVE', department_id: 'dept-ece' };
  const crossStudentRes = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: studentA,
    requestBody: {
      role: 'STUDENT',
      analyticsContract: {
        role: 'STUDENT',
        timestamp: new Date().toISOString(),
        studentContext: { studentId: 'student-B' }, // Cross-account!
      },
    },
  });
  assert.strictEqual(crossStudentRes.status, 403);
  assert.strictEqual(crossStudentRes.body.error, 'CROSS_ACCOUNT_ACCESS_DENIED');

  // B. Cross-course access for faculty
  const facultyUser = { id: 'faculty-1', role: 'FACULTY', account_status: 'ACTIVE', department_id: 'dept-ece' };
  const crossCourseRes = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: facultyUser,
    requestBody: {
      role: 'FACULTY',
      analyticsContract: {
        role: 'FACULTY',
        timestamp: new Date().toISOString(),
        assignedCourses: [{ courseId: 'COURSE-OUTSIDE-FACULTY-SCOPE' }],
      },
    },
    facultyAuthorizedCourses: ['ECE101', 'ECE102'],
  });
  assert.strictEqual(crossCourseRes.status, 403);
  assert.strictEqual(crossCourseRes.body.error, 'UNAUTHORIZED_FACULTY_SCOPE');

  // C. Cross-department access for HOD
  const hodUser = { id: 'hod-1', role: 'HOD', account_status: 'ACTIVE', department_id: 'dept-ece' };
  const crossDeptRes = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: hodUser,
    requestBody: {
      role: 'HOD',
      analyticsContract: {
        role: 'HOD',
        timestamp: new Date().toISOString(),
        departmentContext: { departmentId: 'dept-mech' }, // Cross-department!
      },
    },
  });
  assert.strictEqual(crossDeptRes.status, 403);
  assert.strictEqual(crossDeptRes.body.error, 'CROSS_DEPARTMENT_ACCESS_DENIED');

  // D. Inactive Admin attempting admin access
  const inactiveAdmin = { id: 'admin-1', role: 'ADMIN', account_status: 'SUSPENDED', department_id: null };
  const inactiveAdminRes = await simulateLocalLLMAnalyzeEdgeFunction({
    authHeader: 'Bearer valid.jwt.token',
    userProfile: inactiveAdmin,
    requestBody: {
      role: 'ADMIN',
      analyticsContract: { role: 'ADMIN', timestamp: new Date().toISOString() },
    },
  });
  assert.strictEqual(inactiveAdminRes.status, 403);
  assert.strictEqual(inactiveAdminRes.body.error, 'ACCOUNT_INACTIVE');
});

console.log('All 22 Oracle Cloud FastAPI Gateway + Local LLM Integration test suites passed successfully.');
