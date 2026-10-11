import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ============================================================
// RATE LIMITING (In-memory token bucket per authenticated user)
// NOTE: Single-instance in-memory limiter. Not distributed.
// ============================================================
const userRequestCounts = new Map<string, { count: number; resetTime: number }>();
const MAX_REQUESTS_PER_HOUR = 60;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const userRate = userRequestCounts.get(userId);

  if (!userRate || now > userRate.resetTime) {
    userRequestCounts.set(userId, { count: 1, resetTime: now + hourMs });
    return true;
  }

  if (userRate.count >= MAX_REQUESTS_PER_HOUR) {
    return false;
  }

  userRate.count++;
  return true;
}

// ============================================================
// SECURITY SANITIZERS, VALIDATORS & BOUNDS
// ============================================================

const ALLOWED_ANALYSIS_TYPES = [
  "ACADEMIC_OVERVIEW",
  "RISK_ASSESSMENT",
  "PERFORMANCE_TREND",
  "RECOMMENDATION_GEN",
];

const ALLOWED_TRENDS = ["IMPROVING", "DECLINING", "STABLE", "INSUFFICIENT_DATA"];
const ALLOWED_RISKS = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"];
const ALLOWED_VISUALIZATIONS = ["LINE", "BAR", "PIE", "TABLE", "PROGRESS"];

// Bounds for model output
const MAX_SUMMARY_LENGTH = 2000;
const MAX_INSIGHTS_COUNT = 10;
const MAX_INSIGHT_LENGTH = 300;
const MAX_RECOMMENDATIONS_COUNT = 10;
const MAX_RECOMMENDATION_LENGTH = 300;
const MAX_VISUALIZATIONS_COUNT = 5;
const MAX_TITLE_LENGTH = 150;
const MAX_DATASET_LENGTH = 100;

function assertCredentialSafety(payload: unknown): void {
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

function sanitizeTextOutput(text: string): string {
  if (/<script\b[^>]*>|javascript:|SELECT\s+.*FROM|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|<iframe\b/i.test(text)) {
    throw new Error("SECURITY_REJECTION: Response contains forbidden executable code, HTML tags, or SQL statements.");
  }
  return text.trim();
}

function maskStudentIdentifiers(contract: any): any {
  if (!contract || typeof contract !== "object") return contract;
  const sanitized = JSON.parse(JSON.stringify(contract));

  // Mask student context identifiers
  if (sanitized.studentContext) {
    delete sanitized.studentContext.usn;
    delete sanitized.studentContext.studentId;
  }

  // Mask atRiskStudents USNs and student IDs for Faculty / HOD
  if (Array.isArray(sanitized.atRiskStudents)) {
    sanitized.atRiskStudents = sanitized.atRiskStudents.map((s: any) => ({
      ...s,
      studentId: undefined,
      usn: "[REDACTED]",
    }));
  }

  return sanitized;
}

/**
 * Derives current day of week in the institution's academic timezone (Asia/Kolkata).
 */
function getAcademicDayOfWeek(): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
    });
    return formatter.format(new Date());
  } catch {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[new Date().getDay()];
  }
}

// ============================================================
// SERVER-SIDE AUTHORITATIVE ANALYTICS RETRIEVAL (FAIL CLOSED ON ERRORS)
// ============================================================

async function fetchStudentServerAnalytics(userClient: any, userId: string, profile: any): Promise<any> {
  // 1. Overview metrics from student_analytics_view (RLS: student_id = auth.uid())
  const { data: analyticsData, error: analyticsError } = await userClient
    .from("student_analytics_view")
    .select("attendance_percentage, total_assignments, submitted_assignments, total_assessment_attempts, avg_assessment_percentage")
    .eq("student_id", userId)
    .maybeSingle();
  if (analyticsError) throw new Error(`Query failed for student_analytics_view: ${analyticsError.message}`);

  // 2. Learning gaps from student_learning_gaps_view (RLS: student_id = auth.uid())
  const { data: gapsData, error: gapsError } = await userClient
    .from("student_learning_gaps_view")
    .select("topic_name, course_id, course_name, total_questions, correct_answers, wrong_answers, topic_score_percent")
    .eq("student_id", userId)
    .order("topic_score_percent", { ascending: true });
  if (gapsError) throw new Error(`Query failed for student_learning_gaps_view: ${gapsError.message}`);

  // 3. Assessment attempts (RLS: student_id = auth.uid())
  const { data: assessmentsData, error: assessmentsError } = await userClient
    .from("assessment_attempts")
    .select("score, max_score, percentage, submitted_at, status, assessments(title)")
    .eq("student_id", userId)
    .in("status", ["Submitted", "Graded"])
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (assessmentsError) throw new Error(`Query failed for assessment_attempts: ${assessmentsError.message}`);

  // 4. Assignments & submissions counts
  const { count: submittedCount, error: subError } = await userClient
    .from("assignment_submissions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", userId);
  if (subError) throw new Error(`Query failed for assignment_submissions: ${subError.message}`);

  let totalAssignmentsCount = 0;
  if (profile.department_id) {
    const { count: activeAssignments, error: asgnError } = await userClient
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("department_id", profile.department_id)
      .eq("status", "Active");
    if (asgnError) throw new Error(`Query failed for assignments: ${asgnError.message}`);
    totalAssignmentsCount = activeAssignments || 0;
  }

  // 5. Semester results trends
  const { data: resultsData, error: resultsError } = await userClient
    .from("results")
    .select("semester, total_marks, max_marks")
    .eq("student_id", userId)
    .order("semester", { ascending: true });
  if (resultsError) throw new Error(`Query failed for results: ${resultsError.message}`);

  // 6. Student profile details (Verified schema columns: semester, cgpa - department is in profiles.department_id)
  const { data: studentProf, error: profError } = await userClient
    .from("student_profiles")
    .select("semester, cgpa")
    .eq("profile_id", userId)
    .maybeSingle();
  if (profError) throw new Error(`Query failed for student_profiles: ${profError.message}`);

  // 7. Department name lookup via verified departments table
  let departmentName: string | undefined = undefined;
  if (profile.department_id) {
    const { data: deptData, error: deptError } = await userClient
      .from("departments")
      .select("name")
      .eq("id", profile.department_id)
      .maybeSingle();
    if (deptError) throw new Error(`Query failed for departments: ${deptError.message}`);
    if (deptData?.name) departmentName = deptData.name;
  }

  // Reconstruct canonical calculation logic server-side
  const gaps = (gapsData || []).map((row: any) => ({
    topic: row.topic_name,
    courseId: row.course_id,
    courseName: row.course_name,
    scorePercent: Number(row.topic_score_percent || 0),
    correctAnswers: Number(row.correct_answers || 0),
    totalQuestions: Number(row.total_questions || 0),
    wrongAnswers: Number(row.wrong_answers || 0),
  }));

  const byCourse = new Map<string, any[]>();
  for (const gap of gaps) {
    const key = `${gap.courseId}:${gap.courseName}`;
    if (!byCourse.has(key)) byCourse.set(key, []);
    byCourse.get(key)!.push(gap);
  }

  const subjectPerformance: any[] = [];
  for (const [key, topics] of byCourse) {
    const [courseId, courseName] = key.split(":");
    const totalQ = topics.reduce((s: number, t: any) => s + t.totalQuestions, 0);
    const correctA = topics.reduce((s: number, t: any) => s + t.correctAnswers, 0);
    const avgScore = totalQ > 0 ? Math.round((correctA / totalQ) * 100) : 0;
    subjectPerformance.push({
      subject: courseName,
      courseId,
      totalQuestions: totalQ,
      correctAnswers: correctA,
      scorePercent: avgScore,
      topicsAnalyzed: topics.length,
    });
  }
  subjectPerformance.sort((a, b) => b.scorePercent - a.scorePercent);

  const bySem = new Map<number, { total: number; max: number }>();
  for (const row of (resultsData || []) as any[]) {
    if (!bySem.has(row.semester)) bySem.set(row.semester, { total: 0, max: 0 });
    const entry = bySem.get(row.semester)!;
    entry.total += Number(row.total_marks || 0);
    entry.max += Number(row.max_marks || 100);
  }
  const semesterTrends = Array.from(bySem.entries()).map(([sem, vals]) => ({
    semester: sem,
    averagePercent: vals.max > 0 ? Math.round((vals.total / vals.max) * 100) : 0,
  }));

  const subCount = submittedCount || Number(analyticsData?.submitted_assignments || 0);
  const totCount = Math.max(totalAssignmentsCount, Number(analyticsData?.total_assignments || 0), subCount);
  const completionRate = totCount > 0 ? Math.round((subCount / totCount) * 100) : 0;

  return {
    role: "STUDENT",
    timestamp: new Date().toISOString(),
    studentContext: {
      fullName: profile.full_name || profile.email?.split("@")[0] || "Student",
      departmentName,
      semester: studentProf?.semester != null ? Number(studentProf.semester) : undefined,
      cgpa: studentProf?.cgpa != null ? Number(studentProf.cgpa) : null,
    },
    overview: {
      attendancePercent: Number(analyticsData?.attendance_percentage || 0),
      assignmentsSubmitted: subCount,
      totalAssignments: totCount,
      assignmentCompletionRate: completionRate,
      assessmentsAttempted: Number(analyticsData?.total_assessment_attempts || 0),
      avgAssessmentScore: Number(analyticsData?.avg_assessment_percentage || 0),
    },
    subjectPerformance,
    learningGaps: gaps,
    assessmentBreakdown: (assessmentsData || []).map((row: any) => ({
      assessmentTitle: row.assessments?.title || "Assessment",
      score: Number(row.score || 0),
      maxScore: Number(row.max_score || 0),
      percentage: Number(row.percentage || 0),
      submittedAt: row.submitted_at,
      status: row.status,
    })),
    assignmentCompletion: {
      submitted: subCount,
      pending: Math.max(0, totCount - subCount),
      late: 0,
      total: totCount,
    },
    semesterTrends,
  };
}

async function fetchFacultyServerAnalytics(userClient: any, userId: string, profile: any): Promise<any> {
  const academicDay = getAcademicDayOfWeek();

  // 1. Timetable entries for today (faculty_id = user.id)
  const { data: scheduleData, error: scheduleError } = await userClient
    .from("timetable_entries")
    .select("course_code, course_name, semester, start_time, end_time, room")
    .eq("faculty_id", userId)
    .eq("day_of_week", academicDay)
    .order("start_time", { ascending: true });
  if (scheduleError) throw new Error(`Query failed for timetable_entries: ${scheduleError.message}`);

  // 2. Assigned courses & student enrollments with real course_name and course_code
  const { data: enrollmentsData, error: enrollmentsError } = await userClient
    .from("course_enrollments")
    .select("course_id, course_name, course_code, semester, student_id")
    .eq("faculty_id", userId)
    .eq("status", "Active");
  if (enrollmentsError) throw new Error(`Query failed for course_enrollments: ${enrollmentsError.message}`);

  // 3. Assignments created by faculty
  const { data: assignmentsData, error: assignmentsError } = await userClient
    .from("assignments")
    .select("id, title, course_id, course_name, status")
    .eq("created_by", userId);
  if (assignmentsError) throw new Error(`Query failed for assignments: ${assignmentsError.message}`);

  const assignmentList = assignmentsData || [];
  const assignmentIds = assignmentList.map((a: any) => a.id);

  // 4. Calculate actual pending evaluations per assignment from assignment_submissions
  let totalPendingEvaluations = 0;
  const pendingCountByAssignment = new Map<string, number>();

  if (assignmentIds.length > 0) {
    const { data: pendingSubmissions, error: submissionsError } = await userClient
      .from("assignment_submissions")
      .select("assignment_id, status")
      .in("assignment_id", assignmentIds)
      .eq("status", "Submitted");
    if (submissionsError) throw new Error(`Query failed for assignment_submissions: ${submissionsError.message}`);

    for (const sub of pendingSubmissions || []) {
      pendingCountByAssignment.set(
        sub.assignment_id,
        (pendingCountByAssignment.get(sub.assignment_id) || 0) + 1
      );
    }
    totalPendingEvaluations = (pendingSubmissions || []).length;
  }

  // Count distinct students and courses
  const enrollments = enrollmentsData || [];
  const uniqueStudents = new Set(enrollments.map((e: any) => e.student_id));
  const coursesMap = new Map<string, { courseId: string; courseCode: string; courseName: string; studentCount: number; semester: number }>();
  for (const e of enrollments) {
    if (!coursesMap.has(e.course_id)) {
      coursesMap.set(e.course_id, {
        courseId: e.course_id,
        courseCode: e.course_code || e.course_id,
        courseName: e.course_name || `Course ${e.course_id}`,
        semester: e.semester || 1,
        studentCount: 0,
      });
    }
    coursesMap.get(e.course_id)!.studentCount++;
  }

  const assignedCourses = Array.from(coursesMap.values()).map(c => ({
    courseId: c.courseId,
    courseCode: c.courseCode,
    courseName: c.courseName,
    semester: c.semester,
    studentCount: c.studentCount,
  }));

  // Fetch department name if profile has department
  let departmentName = "Department";
  if (profile.department_id) {
    const { data: dept, error: deptError } = await userClient
      .from("departments")
      .select("name")
      .eq("id", profile.department_id)
      .maybeSingle();
    if (deptError) throw new Error(`Query failed for departments: ${deptError.message}`);
    if (dept?.name) departmentName = dept.name;
  }

  // At-risk students in faculty's assigned courses (attendance < 75%)
  const atRiskStudents: any[] = [];
  const studentIdArray = Array.from(uniqueStudents).slice(0, 50);
  if (studentIdArray.length > 0) {
    const { data: atRiskData, error: atRiskError } = await userClient
      .from("student_analytics_view")
      .select("student_id, full_name, attendance_percentage")
      .in("student_id", studentIdArray)
      .lt("attendance_percentage", 75);
    if (atRiskError) throw new Error(`Query failed for student_analytics_view (faculty scope): ${atRiskError.message}`);

    for (const s of atRiskData || []) {
      atRiskStudents.push({
        studentName: s.full_name || "Student",
        usn: "[REDACTED]",
        attendancePercent: Number(s.attendance_percentage || 0),
        severity: Number(s.attendance_percentage || 0) < 65 ? "high" : "medium",
        details: `Attendance is ${s.attendance_percentage}%, below required 75%`,
      });
    }
  }

  const pendingEvaluations = assignmentList
    .map((a: any) => ({
      assignmentTitle: a.title,
      courseName: a.course_name || a.course_id,
      pendingCount: pendingCountByAssignment.get(a.id) || 0,
    }))
    .filter((a: any) => a.pendingCount > 0)
    .slice(0, 10);

  return {
    role: "FACULTY",
    timestamp: new Date().toISOString(),
    facultyContext: {
      fullName: profile.full_name || profile.email?.split("@")[0] || "Faculty",
      departmentName,
      designation: "Faculty Member",
    },
    summaryStats: {
      assignedCoursesCount: coursesMap.size,
      totalStudentsTaught: uniqueStudents.size,
      todaysClassesCount: (scheduleData || []).length,
      pendingEvaluationsCount: totalPendingEvaluations,
      activeAssignmentsCount: assignmentList.filter((a: any) => a.status === "Active").length,
      attendanceAlertsCount: atRiskStudents.length,
    },
    todaySchedule: (scheduleData || []).map((c: any) => ({
      courseCode: c.course_code || "",
      courseName: c.course_name || "",
      semester: c.semester || 1,
      time: `${c.start_time} - ${c.end_time || ""}`,
      room: c.room || "Room TBA",
      status: "Scheduled",
    })),
    pendingEvaluations,
    atRiskStudents,
    assignedCourses,
  };
}

async function fetchHODServerAnalytics(userClient: any, profile: any): Promise<any> {
  if (!profile.department_id) {
    throw new Error("HOD account is not assigned to a department.");
  }
  const deptId = profile.department_id;

  // 1. Department details
  const { data: dept, error: deptError } = await userClient
    .from("departments")
    .select("name, code")
    .eq("id", deptId)
    .single();
  if (deptError || !dept) throw new Error(`Query failed for departments: ${deptError?.message || "Department not found"}`);

  // 2. Verified academic year from real course_enrollments
  const { data: academicYearData, error: yearError } = await userClient
    .from("course_enrollments")
    .select("academic_year")
    .eq("department_id", deptId)
    .not("academic_year", "is", null)
    .limit(1)
    .maybeSingle();
  if (yearError) throw new Error(`Query failed for academic_year: ${yearError.message}`);
  const academicYear = academicYearData?.academic_year || "Current Academic Year";

  // 3. Count faculty and students in department
  const { count: totalFaculty, error: facErr } = await userClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("department_id", deptId)
    .in("role", ["FACULTY", "HOD"]);
  if (facErr) throw new Error(`Query failed for faculty profiles: ${facErr.message}`);

  const { count: activeFacultyCount, error: actFacErr } = await userClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("department_id", deptId)
    .in("role", ["FACULTY", "HOD"])
    .eq("account_status", "ACTIVE");
  if (actFacErr) throw new Error(`Query failed for active faculty count: ${actFacErr.message}`);

  const { count: totalStudents, error: studErr } = await userClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("department_id", deptId)
    .eq("role", "STUDENT");
  if (studErr) throw new Error(`Query failed for student profiles: ${studErr.message}`);

  const { count: activeStudents, error: actStudErr } = await userClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("department_id", deptId)
    .eq("role", "STUDENT")
    .eq("account_status", "ACTIVE");
  if (actStudErr) throw new Error(`Query failed for active students count: ${actStudErr.message}`);

  // 4. Calculate active faculty today from timetable_entries for the academic day
  const academicDay = getAcademicDayOfWeek();
  const { data: todayTimetable, error: ttErr } = await userClient
    .from("timetable_entries")
    .select("faculty_id")
    .eq("department_id", deptId)
    .eq("day_of_week", academicDay);
  if (ttErr) throw new Error(`Query failed for timetable_entries: ${ttErr.message}`);
  const uniqueFacultyToday = new Set((todayTimetable || []).map((t: any) => t.faculty_id).filter(Boolean));
  const activeFacultyToday = uniqueFacultyToday.size;

  // 5. Active courses in department from course_enrollments
  const { data: coursesData, error: crsErr } = await userClient
    .from("course_enrollments")
    .select("course_id, course_name, course_code")
    .eq("department_id", deptId)
    .eq("status", "Active");
  if (crsErr) throw new Error(`Query failed for course_enrollments: ${crsErr.message}`);
  const uniqueCourses = new Set((coursesData || []).map((c: any) => c.course_id));

  // 6. Student attendance and at-risk student records
  const { data: deptAnalytics, error: attErr } = await userClient
    .from("student_analytics_view")
    .select("student_id, full_name, attendance_percentage")
    .eq("department_id", deptId);
  if (attErr) throw new Error(`Query failed for student_analytics_view: ${attErr.message}`);

  const studentRows = deptAnalytics || [];
  const lowAttendanceStudents = studentRows.filter((s: any) => Number(s.attendance_percentage || 0) < 75);
  const overallAttendancePercent = studentRows.length > 0
    ? Math.round(studentRows.reduce((sum: number, s: any) => sum + Number(s.attendance_percentage || 0), 0) / studentRows.length)
    : 0;

  // Lookup real semester and course_code for low attendance students from course_enrollments
  const lowStudentIds = lowAttendanceStudents.slice(0, 15).map((s: any) => s.student_id);
  const studentCourseMap = new Map<string, { semester: number; courseCode: string }>();

  if (lowStudentIds.length > 0) {
    const { data: studentEnrollments, error: enrollErr } = await userClient
      .from("course_enrollments")
      .select("student_id, semester, course_code")
      .in("student_id", lowStudentIds)
      .eq("department_id", deptId)
      .eq("status", "Active");
    if (enrollErr) throw new Error(`Query failed for low student course_enrollments: ${enrollErr.message}`);

    for (const enr of studentEnrollments || []) {
      if (!studentCourseMap.has(enr.student_id)) {
        studentCourseMap.set(enr.student_id, {
          semester: enr.semester || 1,
          courseCode: enr.course_code || dept.code || "DEPT",
        });
      }
    }
  }

  const atRiskStudents = lowAttendanceStudents.slice(0, 15).map((s: any) => {
    const enr = studentCourseMap.get(s.student_id);
    return {
      studentName: s.full_name || "Student",
      usn: "[REDACTED]",
      semester: enr?.semester || 1,
      courseCode: enr?.courseCode || dept.code || "DEPT",
      attendancePercent: Number(s.attendance_percentage || 0),
    };
  });

  return {
    role: "HOD",
    timestamp: new Date().toISOString(),
    departmentContext: {
      departmentName: dept.name,
      departmentCode: dept.code || "DEPT",
      hodName: profile.full_name || "HOD",
      academicYear,
    },
    overviewStats: {
      totalFaculty: totalFaculty || 0,
      activeFacultyCount: activeFacultyCount || 0,
      activeFacultyToday,
      totalStudents: totalStudents || 0,
      activeStudents: activeStudents || 0,
      activeCourses: uniqueCourses.size,
      overallAttendancePercent,
      averageCgpa: null,
      passRatePercent: null,
      assignmentCompletionPercent: null,
      academicAlertsCount: atRiskStudents.length,
      pendingReviewsCount: 0,
    },
    attendanceMetrics: {
      overallAttendance: overallAttendancePercent,
      presentRate: overallAttendancePercent,
      absentRate: Math.max(0, 100 - overallAttendancePercent),
      lateRate: 0,
      semesterBreakdown: [],
      courseAttendance: [],
    },
    atRiskStudents,
    facultyRosterSummary: [],
  };
}

async function fetchAdminServerAnalytics(userClient: any, profile: any, requestedDepartmentId?: string): Promise<any> {
  if (requestedDepartmentId) {
    const scopedProfile = { ...profile, department_id: requestedDepartmentId };
    return fetchHODServerAnalytics(userClient, scopedProfile);
  }

  const { count: totalFaculty, error: facErr } = await userClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .in("role", ["FACULTY", "HOD"]);
  if (facErr) throw new Error(`Query failed for totalFaculty: ${facErr.message}`);

  const { count: totalStudents, error: studErr } = await userClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "STUDENT");
  if (studErr) throw new Error(`Query failed for totalStudents: ${studErr.message}`);

  const { count: totalDepartments, error: deptErr } = await userClient
    .from("departments")
    .select("id", { count: "exact", head: true })
    .eq("status", "ACTIVE");
  if (deptErr) throw new Error(`Query failed for totalDepartments: ${deptErr.message}`);

  return {
    role: "ADMIN",
    timestamp: new Date().toISOString(),
    institutionalContext: {
      scope: "CAMPUS_WIDE",
      totalDepartments: totalDepartments || 0,
      totalFaculty: totalFaculty || 0,
      totalStudents: totalStudents || 0,
    },
  };
}

// ============================================================
// MAIN HTTP HANDLER
// ============================================================

serve(async (req: Request) => {
  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    // 2. Validate User Authentication via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({
        success: false,
        error: "AUTHENTICATION_REQUIRED: Valid authenticated session required."
      }, 401);
    }

    // @ts-ignore Deno global
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // @ts-ignore Deno global
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({
        success: false,
        error: "Backend Supabase environment is misconfigured."
      }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({
        success: false,
        error: "UNAUTHORIZED: Invalid or expired session."
      }, 401);
    }

    // 3. Rate Limiting Check (Per user ID in memory)
    if (!checkRateLimit(user.id)) {
      return jsonResponse({
        success: false,
        error: "RATE_LIMITED: You can send up to 60 analysis requests per hour. Please wait a moment."
      }, 429);
    }

    // 4. Retrieve and Verify Caller Profile from Database
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("id, email, full_name, role, department_id, account_status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({
        success: false,
        error: "USER_NOT_FOUND: Profile not found for authenticated user."
      }, 404);
    }

    if (profile.account_status !== "ACTIVE") {
      return jsonResponse({
        success: false,
        error: "ACCOUNT_INACTIVE: An active account is required to perform local AI analysis."
      }, 403);
    }

    const verifiedRole = profile.role;
    if (!["STUDENT", "FACULTY", "HOD", "ADMIN"].includes(verifiedRole)) {
      return jsonResponse({
        success: false,
        error: `INVALID_ROLE: Role '${verifiedRole}' is not permitted for local AI analysis.`
      }, 403);
    }

    // 5. Parse Request Body and Validate Size
    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({
        success: false,
        error: "MALFORMED_REQUEST: Request body must be valid JSON."
      }, 400);
    }

    if (!rawBody || typeof rawBody !== "object") {
      return jsonResponse({
        success: false,
        error: "MALFORMED_REQUEST: Request body must be an object."
      }, 400);
    }

    if (JSON.stringify(rawBody).length > 100_000) {
      return jsonResponse({
        success: false,
        error: "PAYLOAD_TOO_LARGE: Request exceeds 100KB limit."
      }, 413);
    }

    // 6. Enforce Role Isolation (Prevent Role Spoofing)
    if (rawBody.role && rawBody.role !== verifiedRole) {
      return jsonResponse({
        success: false,
        error: `ROLE_MISMATCH: Client role '${rawBody.role}' does not match verified server profile role '${verifiedRole}'.`
      }, 403);
    }

    // Non-admin cannot use admin path
    if (rawBody.role === "ADMIN" && verifiedRole !== "ADMIN") {
      return jsonResponse({
        success: false,
        error: "PERMISSION_DENIED: Explicit active administrator authorization is required."
      }, 403);
    }

    // Validate analysis type
    const rawAnalysisType = rawBody.analysisType || rawBody.analysis_type || "ACADEMIC_OVERVIEW";
    if (!ALLOWED_ANALYSIS_TYPES.includes(rawAnalysisType)) {
      return jsonResponse({
        success: false,
        error: `INVALID_ANALYSIS_TYPE: '${rawAnalysisType}' is not a supported analysis type.`
      }, 400);
    }

    // Extract client-supplied contract (if present) for scope mismatch detection
    const rawContract = rawBody.analyticsContract || rawBody.analytics_contract;
    if (rawContract && typeof rawContract === "object") {
      if (rawContract.role && rawContract.role !== verifiedRole) {
        return jsonResponse({
          success: false,
          error: `ROLE_MISMATCH: Contract role '${rawContract.role}' does not match verified profile role '${verifiedRole}'.`
        }, 403);
      }

      // Check role-specific scope boundaries in client payload
      if (verifiedRole === "STUDENT") {
        if (rawContract.studentContext?.studentId && rawContract.studentContext.studentId !== user.id) {
          return jsonResponse({
            success: false,
            error: "CROSS_ACCOUNT_ACCESS_DENIED: Students may only access their own analytics."
          }, 403);
        }
      } else if (verifiedRole === "FACULTY") {
        if (rawContract.facultyContext?.facultyId && rawContract.facultyContext.facultyId !== user.id) {
          return jsonResponse({
            success: false,
            error: "UNAUTHORIZED_FACULTY_SCOPE: Faculty may only access their assigned scope."
          }, 403);
        }
      } else if (verifiedRole === "HOD") {
        if (rawContract.departmentContext?.departmentId && rawContract.departmentContext.departmentId !== profile.department_id) {
          return jsonResponse({
            success: false,
            error: "CROSS_DEPARTMENT_ACCESS_DENIED: HOD may only access their assigned department."
          }, 403);
        }
      }
    }

    // 7. Server-Side Authoritative Analytics Retrieval
    // NEVER pass client-supplied metrics or student lists to the model as trusted facts.
    // FAIL CLOSED on database query failures: never substitute fake 0s and never call gateway on error.
    let authoritativeContract: any;
    try {
      if (verifiedRole === "STUDENT") {
        authoritativeContract = await fetchStudentServerAnalytics(userClient, user.id, profile);
      } else if (verifiedRole === "FACULTY") {
        authoritativeContract = await fetchFacultyServerAnalytics(userClient, user.id, profile);
      } else if (verifiedRole === "HOD") {
        authoritativeContract = await fetchHODServerAnalytics(userClient, profile);
      } else if (verifiedRole === "ADMIN") {
        authoritativeContract = await fetchAdminServerAnalytics(
          userClient,
          profile,
          rawContract?.departmentContext?.departmentId
        );
      } else {
        return jsonResponse({
          success: false,
          error: `UNSUPPORTED_ROLE: Server analytics reconstruction is not supported for role '${verifiedRole}'.`
        }, 403);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Database query failure";
      console.error("[local-llm-analyze] Database analytics retrieval error:", msg);
      return jsonResponse({
        success: false,
        summary: "Authoritative database query failed during analytics retrieval. Deterministic analytics remain active.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "DATABASE_QUERY_FAILED",
          message: "A database error occurred while querying authoritative analytics. Gateway dispatch was aborted.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    // 8. Security Assertions & Identifier Masking
    try {
      assertCredentialSafety(authoritativeContract);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Security violation detected in server analytics.";
      return jsonResponse({ success: false, error: msg }, 400);
    }

    const sanitizedContract = maskStudentIdentifiers(authoritativeContract);

    // 9. Verify Oracle Gateway Configuration (Secrets)
    // @ts-ignore Deno global
    const gatewayUrl = Deno.env.get("ORACLE_GATEWAY_URL");
    // @ts-ignore Deno global
    const gatewayApiKey = Deno.env.get("ORACLE_GATEWAY_API_KEY");
    // @ts-ignore Deno global
    const timeoutEnv = Deno.env.get("ORACLE_GATEWAY_TIMEOUT_MS");
    const timeoutMs = timeoutEnv ? parseInt(timeoutEnv, 10) : 35_000;

    if (!gatewayUrl || !gatewayApiKey) {
      return jsonResponse({
        success: false,
        summary: "Local LLM analysis unavailable. Standard deterministic analytics dashboards remain fully operational.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_UNAVAILABLE",
          message: "No private Local LLM runtime endpoint is configured in Supabase Edge Function secrets. Deterministic analytics remain active.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    // 10. Dispatch to Oracle Cloud FastAPI Gateway: POST /v1/analyze
    const endpoint = `${gatewayUrl.replace(/\/+$/, "")}/v1/analyze`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let httpResponse: Response;
    try {
      httpResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": gatewayApiKey,
        },
        body: JSON.stringify({
          role: verifiedRole,
          analysis_type: rawAnalysisType,
          analytics_contract: sanitizedContract,
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        return jsonResponse({
          success: false,
          summary: "Local LLM analysis request timed out. Deterministic analytics remain fully active.",
          trend: "INSUFFICIENT_DATA",
          risk_level: "UNKNOWN",
          insights: [],
          recommendations: [],
          visualizations: [],
          error: {
            code: "LLM_TIMEOUT",
            message: `Local LLM request timed out after ${timeoutMs}ms.`,
            timestamp: new Date().toISOString(),
          },
        }, 200);
      }
      return jsonResponse({
        success: false,
        summary: "Network error communicating with Local LLM endpoint. Deterministic analytics remain fully active.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_REQUEST_FAILED",
          message: "Failed to connect to Oracle Local LLM gateway.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    } finally {
      clearTimeout(timeoutId);
    }

    // 11. Handle Gateway Response
    if (!httpResponse.ok) {
      return jsonResponse({
        success: false,
        summary: `Local LLM gateway returned status ${httpResponse.status}. Deterministic analytics remain fully active.`,
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_REQUEST_FAILED",
          message: `Gateway returned HTTP status ${httpResponse.status}.`,
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    let gatewayJson: any;
    try {
      gatewayJson = await httpResponse.json();
    } catch {
      return jsonResponse({
        success: false,
        summary: "Malformed JSON received from Local LLM gateway.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_INVALID_RESPONSE",
          message: "Gateway response could not be parsed as JSON.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    // 12. Normalize and Bounded Validation of Gateway Response
    const analysisObj = gatewayJson.analysis || gatewayJson;

    let rawSummary = analysisObj.summary;
    if (typeof rawSummary !== "string" || !rawSummary.trim()) {
      return jsonResponse({
        success: false,
        summary: "Summary missing in model response.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_INVALID_RESPONSE",
          message: "Response summary must be a non-empty string.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    let sanitizedSummary = "";
    try {
      sanitizedSummary = sanitizeTextOutput(rawSummary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unsafe response content detected.";
      return jsonResponse({
        success: false,
        summary: "Unsafe response content detected.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_INVALID_RESPONSE",
          message: msg,
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    // Bound summary length
    if (sanitizedSummary.length > MAX_SUMMARY_LENGTH) {
      sanitizedSummary = sanitizedSummary.slice(0, MAX_SUMMARY_LENGTH);
    }

    const trend = ALLOWED_TRENDS.includes(analysisObj.trend) ? analysisObj.trend : "INSUFFICIENT_DATA";
    const risk_level = ALLOWED_RISKS.includes(analysisObj.risk_level) ? analysisObj.risk_level : "UNKNOWN";

    const insights = Array.isArray(analysisObj.insights)
      ? analysisObj.insights
          .filter((i: any) => typeof i === "string")
          .map((i: string) => i.trim().slice(0, MAX_INSIGHT_LENGTH))
          .filter((i: string) => i.length > 0)
          .slice(0, MAX_INSIGHTS_COUNT)
      : [];

    const recommendations = Array.isArray(analysisObj.recommendations)
      ? analysisObj.recommendations
          .filter((r: any) => typeof r === "string")
          .map((r: string) => r.trim().slice(0, MAX_RECOMMENDATION_LENGTH))
          .filter((r: string) => r.length > 0)
          .slice(0, MAX_RECOMMENDATIONS_COUNT)
      : [];

    const visualizations: Array<{ type: string; dataset: string; title: string }> = [];
    if (Array.isArray(analysisObj.visualizations)) {
      for (const v of analysisObj.visualizations) {
        if (
          v &&
          typeof v === "object" &&
          ALLOWED_VISUALIZATIONS.includes(v.type) &&
          typeof v.dataset === "string" &&
          typeof v.title === "string"
        ) {
          visualizations.push({
            type: v.type,
            dataset: v.dataset.slice(0, MAX_DATASET_LENGTH),
            title: v.title.slice(0, MAX_TITLE_LENGTH),
          });
          if (visualizations.length >= MAX_VISUALIZATIONS_COUNT) break;
        }
      }
    }

    return jsonResponse({
      success: true,
      summary: sanitizedSummary,
      trend,
      risk_level,
      insights,
      recommendations,
      visualizations,
      model: gatewayJson.model || "qwen3:4b",
    }, 200);

  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : "An unexpected server error occurred.";
    const safeError = rawMessage
      .replace(/key=[^&\s]+/gi, "key=REDACTED")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");

    return jsonResponse({
      success: false,
      summary: "Local LLM analysis error occurred.",
      trend: "INSUFFICIENT_DATA",
      risk_level: "UNKNOWN",
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: "LLM_REQUEST_FAILED",
        message: safeError,
        timestamp: new Date().toISOString(),
      },
    }, 500);
  }
});
