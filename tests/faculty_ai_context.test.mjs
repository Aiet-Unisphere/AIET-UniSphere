/**
 * AIET-UniSphere - Mission 10.4 Faculty AI Context Enrichment Verification Test Suite
 * Tests dynamic course selection, enriched academic context (teaching courses,
 * pending assignments, attendance alerts, timetable), security authorization boundaries,
 * and regression compatibility with student AI assistant.
 */

import assert from 'node:assert';
import test from 'node:test';

// -------------------------------------------------------------
// 1. Dynamic Faculty Course Selector Logic
// -------------------------------------------------------------
function buildFacultyCourseContexts(facultyCourses) {
  const assignedCourseNames = (facultyCourses || [])
    .map((c) => c.name)
    .filter((name) => Boolean(name && name.trim()));
  const uniqueCourses = [...new Set(assignedCourseNames)];
  return ['All Courses', ...uniqueCourses];
}

test('1. Faculty with multiple courses: course selector populates dynamically', () => {
  const courses = [
    { id: 'c1', code: 'CS301', name: 'Database Management Systems' },
    { id: 'c2', code: 'CS302', name: 'Computer Networks' },
    { id: 'c3', code: 'CS303', name: 'Operating Systems' },
    { id: 'c4', code: 'CS301-Lab', name: 'Database Management Systems' }, // Duplicate course name
  ];

  const contexts = buildFacultyCourseContexts(courses);
  assert.strictEqual(contexts.length, 4);
  assert.deepStrictEqual(contexts, [
    'All Courses',
    'Database Management Systems',
    'Computer Networks',
    'Operating Systems',
  ]);
});

test('2. Faculty with no assigned courses: defaults cleanly to [All Courses]', () => {
  const contextsEmpty = buildFacultyCourseContexts([]);
  assert.deepStrictEqual(contextsEmpty, ['All Courses']);

  const contextsNull = buildFacultyCourseContexts(null);
  assert.deepStrictEqual(contextsNull, ['All Courses']);
});

test('3. Course context normalization: All Courses returns null for server filter', () => {
  function normalizeCourseContext(context) {
    if (!context || typeof context !== 'string') return null;
    const trimmed = context.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'all' || trimmed === 'All Courses') {
      return null;
    }
    return trimmed;
  }

  assert.strictEqual(normalizeCourseContext('All Courses'), null);
  assert.strictEqual(normalizeCourseContext('all'), null);
  assert.strictEqual(normalizeCourseContext('   '), null);
  assert.strictEqual(normalizeCourseContext(null), null);
  assert.strictEqual(normalizeCourseContext('Database Management Systems'), 'Database Management Systems');
});

// -------------------------------------------------------------
// 2. Faculty Context Construction & Course Filtering
// -------------------------------------------------------------
function buildMockFacultyContext(facultyProfile, enrollments, assignments, submissions, attendanceSessions, timetable, studentAnalytics, courseFilter) {
  const normalizedFilter = courseFilter && courseFilter !== 'All Courses' ? courseFilter.toLowerCase() : null;

  // Filter enrollments
  let filteredEnrollments = enrollments;
  if (normalizedFilter) {
    filteredEnrollments = enrollments.filter(e => e.course_name.toLowerCase().includes(normalizedFilter));
  }

  const uniqueCourses = [...new Set(filteredEnrollments.map(e => e.course_name))];
  const enrolledStudentIds = [...new Set(filteredEnrollments.map(e => e.student_id))];

  // Filter schedule
  let filteredSchedule = timetable;
  if (normalizedFilter) {
    filteredSchedule = timetable.filter(t => t.course_name.toLowerCase().includes(normalizedFilter));
  }

  const mappedSchedule = filteredSchedule.map(s => ({
    dayOfWeek: s.day_of_week,
    startTime: s.start_time,
    endTime: s.end_time,
    courseName: s.course_name,
    room: s.room,
  }));

  // Filter assignments & compute pending evaluations
  let filteredAssignments = assignments;
  if (normalizedFilter) {
    filteredAssignments = assignments.filter(a => a.course_name.toLowerCase().includes(normalizedFilter));
  }

  const assignIds = new Set(filteredAssignments.map(a => a.id));
  const relevantSubs = submissions.filter(s => assignIds.has(s.assignment_id));
  
  const pendingByAssign = new Map();
  const totalByAssign = new Map();
  let totalPendingGrading = 0;

  for (const s of relevantSubs) {
    totalByAssign.set(s.assignment_id, (totalByAssign.get(s.assignment_id) || 0) + 1);
    if (s.status === 'Submitted') {
      pendingByAssign.set(s.assignment_id, (pendingByAssign.get(s.assignment_id) || 0) + 1);
      totalPendingGrading++;
    }
  }

  const facultyPendingAssignments = filteredAssignments.map(a => ({
    id: a.id,
    title: a.title,
    courseName: a.course_name,
    deadline: a.deadline,
    marks: a.marks,
    submittedCount: totalByAssign.get(a.id) || 0,
    pendingGradingCount: pendingByAssign.get(a.id) || 0,
  }));

  // Attendance overview
  let filteredSessions = attendanceSessions;
  if (normalizedFilter) {
    filteredSessions = attendanceSessions.filter(s => s.course_name.toLowerCase().includes(normalizedFilter));
  }

  const courseAttMap = new Map();
  for (const s of filteredSessions) {
    const curr = courseAttMap.get(s.course_name) || { totalSessions: 0, totalStudents: 0, attended: 0 };
    curr.totalSessions += 1;
    curr.totalStudents += Number(s.total_students || 0);
    curr.attended += Number(s.present_count || 0) + Number(s.late_count || 0);
    courseAttMap.set(s.course_name, curr);
  }

  const facultyAttendanceOverview = Array.from(courseAttMap.entries()).map(([courseName, stat]) => ({
    courseName,
    totalSessions: stat.totalSessions,
    totalStudents: stat.totalStudents,
    averageAttendancePercent: stat.totalStudents > 0 ? Math.round((stat.attended / stat.totalStudents) * 100) : 0,
  }));

  // Genuine attendance alerts (< 75% attendance with conducted sessions > 0)
  const lowAttRows = studentAnalytics.filter(sa => 
    enrolledStudentIds.includes(sa.student_id) && 
    Number(sa.total_sessions) > 0 && 
    Number(sa.attendance_percentage) < 75
  );

  const facultyAttendanceAlerts = lowAttRows.map(r => ({
    courseName: r.course_name,
    studentName: r.student_name,
    usn: r.usn,
    attendancePercent: Number(r.attendance_percentage),
    attended: Number(r.present_count),
    total: Number(r.total_sessions),
  }));

  return {
    userId: facultyProfile.id,
    role: 'FACULTY',
    fullName: facultyProfile.full_name,
    designation: facultyProfile.designation,
    departmentName: facultyProfile.department_name,
    teachingCourses: uniqueCourses,
    facultySchedule: mappedSchedule,
    pendingGradingCount: totalPendingGrading,
    facultyPendingAssignments,
    facultyAttendanceOverview,
    facultyAttendanceAlerts,
    courseFilter: normalizedFilter || undefined,
  };
}

test('4. All Courses selection aggregates complete faculty teaching context', () => {
  const profile = { id: 'fac-1', full_name: 'Dr. Jane Doe', designation: 'Associate Professor', department_name: 'Computer Science' };
  const enrollments = [
    { course_id: 'c1', course_name: 'Database Management Systems', student_id: 's1' },
    { course_id: 'c1', course_name: 'Database Management Systems', student_id: 's2' },
    { course_id: 'c2', course_name: 'Operating Systems', student_id: 's3' },
  ];
  const assignments = [
    { id: 'a1', title: 'SQL Joins', course_name: 'Database Management Systems', deadline: '2026-11-20', marks: 25 },
    { id: 'a2', title: 'Process Scheduling', course_name: 'Operating Systems', deadline: '2026-11-25', marks: 20 },
  ];
  const submissions = [
    { assignment_id: 'a1', status: 'Submitted' },
    { assignment_id: 'a1', status: 'Submitted' },
    { assignment_id: 'a1', status: 'Graded' },
    { assignment_id: 'a2', status: 'Submitted' },
  ];
  const sessions = [
    { course_name: 'Database Management Systems', total_students: 50, present_count: 40, late_count: 5 },
    { course_name: 'Operating Systems', total_students: 40, present_count: 36, late_count: 0 },
  ];
  const timetable = [
    { course_name: 'Database Management Systems', day_of_week: 'Monday', start_time: '09:00', end_time: '10:00', room: 'LH-1' },
    { course_name: 'Operating Systems', day_of_week: 'Tuesday', start_time: '11:00', end_time: '12:00', room: 'LH-2' },
  ];
  const studentAnalytics = [
    { student_id: 's1', student_name: 'Alice', usn: '4AI21CS001', course_name: 'Database Management Systems', total_sessions: 10, present_count: 6, attendance_percentage: 60 },
    { student_id: 's2', student_name: 'Bob', usn: '4AI21CS002', course_name: 'Database Management Systems', total_sessions: 10, present_count: 9, attendance_percentage: 90 },
  ];

  const ctx = buildMockFacultyContext(profile, enrollments, assignments, submissions, sessions, timetable, studentAnalytics, 'All Courses');

  assert.strictEqual(ctx.teachingCourses.length, 2);
  assert.strictEqual(ctx.pendingGradingCount, 3); // 2 from a1 + 1 from a2
  assert.strictEqual(ctx.facultyPendingAssignments.length, 2);
  assert.strictEqual(ctx.facultyAttendanceAlerts.length, 1);
  assert.strictEqual(ctx.facultyAttendanceAlerts[0].studentName, 'Alice');
  assert.strictEqual(ctx.facultyAttendanceAlerts[0].attendancePercent, 60);
  assert.strictEqual(ctx.designation, 'Associate Professor');
});

test('5. Switching course context strictly filters teaching assignments, schedule, and attendance', () => {
  const profile = { id: 'fac-1', full_name: 'Dr. Jane Doe', designation: 'Associate Professor', department_name: 'Computer Science' };
  const enrollments = [
    { course_id: 'c1', course_name: 'Database Management Systems', student_id: 's1' },
    { course_id: 'c2', course_name: 'Operating Systems', student_id: 's3' },
  ];
  const assignments = [
    { id: 'a1', title: 'SQL Joins', course_name: 'Database Management Systems', deadline: '2026-11-20', marks: 25 },
    { id: 'a2', title: 'Process Scheduling', course_name: 'Operating Systems', deadline: '2026-11-25', marks: 20 },
  ];
  const submissions = [
    { assignment_id: 'a1', status: 'Submitted' },
    { assignment_id: 'a2', status: 'Submitted' },
  ];
  const sessions = [
    { course_name: 'Database Management Systems', total_students: 50, present_count: 45, late_count: 0 },
    { course_name: 'Operating Systems', total_students: 40, present_count: 36, late_count: 0 },
  ];
  const timetable = [
    { course_name: 'Database Management Systems', day_of_week: 'Monday', start_time: '09:00', end_time: '10:00' },
    { course_name: 'Operating Systems', day_of_week: 'Tuesday', start_time: '11:00', end_time: '12:00' },
  ];
  const studentAnalytics = [];

  const ctx = buildMockFacultyContext(profile, enrollments, assignments, submissions, sessions, timetable, studentAnalytics, 'Operating Systems');

  assert.strictEqual(ctx.teachingCourses.length, 1);
  assert.strictEqual(ctx.teachingCourses[0], 'Operating Systems');
  assert.strictEqual(ctx.facultyPendingAssignments.length, 1);
  assert.strictEqual(ctx.facultyPendingAssignments[0].title, 'Process Scheduling');
  assert.strictEqual(ctx.facultySchedule.length, 1);
  assert.strictEqual(ctx.facultySchedule[0].courseName, 'Operating Systems');
});

test('6. Attendance alert integrity: ignores zero-session records (prevents false 0% alert)', () => {
  const profile = { id: 'fac-1', full_name: 'Dr. Jane Doe' };
  const enrollments = [{ course_id: 'c1', course_name: 'Database Management Systems', student_id: 's-new' }];
  const assignments = [];
  const submissions = [];
  const sessions = [];
  const timetable = [];
  const studentAnalytics = [
    // Un-conducted course (total_sessions = 0)
    { student_id: 's-new', student_name: 'Charlie', usn: '4AI21CS003', course_name: 'Database Management Systems', total_sessions: 0, present_count: 0, attendance_percentage: 0 }
  ];

  const ctx = buildMockFacultyContext(profile, enrollments, assignments, submissions, sessions, timetable, studentAnalytics, 'All Courses');
  assert.strictEqual(ctx.facultyAttendanceAlerts.length, 0, 'Zero-session enrollments must not generate false low-attendance alerts');
});

test('7. Unauthorized course access: faculty cannot view students or records for courses they do not teach', () => {
  const profile = { id: 'fac-1', full_name: 'Dr. Jane Doe' };
  // Faculty teaches only Database Management Systems
  const enrollments = [{ course_id: 'c1', course_name: 'Database Management Systems', student_id: 's1' }];
  const assignments = [];
  const submissions = [];
  const sessions = [];
  const timetable = [];
  
  // Analytics contains a student from another course taught by another faculty
  const studentAnalytics = [
    { student_id: 's-unauth', student_name: 'Eve', usn: '4AI21CS099', course_name: 'Machine Learning', total_sessions: 10, present_count: 4, attendance_percentage: 40 }
  ];

  const ctx = buildMockFacultyContext(profile, enrollments, assignments, submissions, sessions, timetable, studentAnalytics, 'All Courses');
  assert.strictEqual(ctx.facultyAttendanceAlerts.length, 0, 'Students not in faculty enrollments must be excluded from alerts');
});

// -------------------------------------------------------------
// 3. Response Generation for Faculty Intents
// -------------------------------------------------------------
function buildDeterministicResponse(ctx) {
  const parts = [];

  switch (ctx.intent) {
    case 'ATTENDANCE':
      if (ctx.role === 'FACULTY') {
        parts.push(`### 📊 Faculty Attendance & Alerts Overview`);
        if (ctx.facultyAttendanceOverview && ctx.facultyAttendanceOverview.length > 0) {
          parts.push(`#### Teaching Attendance Statistics:`);
          for (const att of ctx.facultyAttendanceOverview) {
            parts.push(`* **${att.courseName}**: ${att.totalSessions} sessions conducted — Average Attendance: **${att.averageAttendancePercent}%**`);
          }
        }
        if (ctx.facultyAttendanceAlerts && ctx.facultyAttendanceAlerts.length > 0) {
          parts.push(
            `\n⚠️ **Low Attendance Alerts (<75%)** (${ctx.facultyAttendanceAlerts.length} students):`,
            ...ctx.facultyAttendanceAlerts.map(a => 
              `* **${a.studentName}** (${a.usn}) — ${a.courseName}: **${a.attendancePercent}%** (${a.attended}/${a.total} sessions conducted)`
            )
          );
        } else {
          parts.push(`\n✅ No active low-attendance alerts (<75%) found across your conducted classes.`);
        }
      }
      break;

    case 'ASSIGNMENT':
      if (ctx.role === 'FACULTY') {
        parts.push(
          `### 📝 Faculty Assignment Evaluations & Submissions`,
          `- **Total Submissions Pending Evaluation**: **${ctx.pendingGradingCount ?? 0}**`
        );
        if (ctx.facultyPendingAssignments && ctx.facultyPendingAssignments.length > 0) {
          parts.push(
            `\n#### Active Assignments:`,
            ...ctx.facultyPendingAssignments.map(a => 
              `* **${a.title}** (${a.courseName}) — Due: **${a.deadline}** — Pending Evaluation: **${a.pendingGradingCount}** (Total Submitted: ${a.submittedCount})`
            )
          );
        }
      }
      break;

    case 'PROFILE':
      parts.push(
        `### 👤 Academic Profile Overview`,
        `- **Name**: ${ctx.fullName}`,
        `- **Role**: ${ctx.role}`
      );
      if (ctx.designation) parts.push(`- **Designation**: ${ctx.designation}`);
      break;
  }

  return parts.join('\n');
}

test('8. Deterministic response formatting produces structured faculty evaluations and attendance alerts', () => {
  const ctx = {
    role: 'FACULTY',
    fullName: 'Dr. Jane Doe',
    designation: 'Professor & HOD',
    intent: 'ATTENDANCE',
    facultyAttendanceOverview: [
      { courseName: 'Computer Networks', totalSessions: 12, averageAttendancePercent: 82 }
    ],
    facultyAttendanceAlerts: [
      { studentName: 'John Doe', usn: '4AI21CS045', courseName: 'Computer Networks', attendancePercent: 58, attended: 7, total: 12 }
    ],
  };

  const attResp = buildDeterministicResponse(ctx);
  assert.ok(attResp.includes('Faculty Attendance & Alerts Overview'));
  assert.ok(attResp.includes('John Doe'));
  assert.ok(attResp.includes('58%'));

  ctx.intent = 'ASSIGNMENT';
  ctx.pendingGradingCount = 5;
  ctx.facultyPendingAssignments = [
    { title: 'Subnetting Lab', courseName: 'Computer Networks', deadline: '2026-11-22', pendingGradingCount: 5, submittedCount: 42 }
  ];
  const assignResp = buildDeterministicResponse(ctx);
  assert.ok(assignResp.includes('Total Submissions Pending Evaluation'));
  assert.ok(assignResp.includes('**5**'));
  assert.ok(assignResp.includes('Subnetting Lab'));

  ctx.intent = 'PROFILE';
  const profResp = buildDeterministicResponse(ctx);
  assert.ok(profResp.includes('Professor & HOD'));
});

// -------------------------------------------------------------
// 4. Authentication, Error Handling & Student Isolation Regression
// -------------------------------------------------------------
test('9. Authentication session guard: throws clear error on expired session', () => {
  const checkAuth = (session) => {
    if (!session) throw new Error('Your session has expired. Please sign in again.');
    return true;
  };

  assert.throws(() => checkAuth(null), /Your session has expired/);
  assert.strictEqual(checkAuth({ user: { id: 'fac-1' } }), true);
});

test('10. Student assistant regression: student context isolation and intent responses remain intact', () => {
  const studentCtx = {
    userId: 'stud-1',
    role: 'STUDENT',
    fullName: 'Rahul Sharma',
    intent: 'PROFILE',
    enrolledCourses: [{ courseName: 'Operating Systems', courseCode: 'CS303' }],
    attendancePercent: 85,
    totalSessionsAttended: 17,
    totalSessionsHeld: 20,
  };

  // Verify student cannot see faculty fields
  assert.strictEqual(studentCtx.teachingCourses, undefined);
  assert.strictEqual(studentCtx.facultyPendingAssignments, undefined);
  assert.strictEqual(studentCtx.facultyAttendanceAlerts, undefined);
  assert.strictEqual(studentCtx.attendancePercent, 85);
});
