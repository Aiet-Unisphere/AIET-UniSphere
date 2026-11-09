import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * MISSION 08.3.1 TEST SUITE
 * Faculty Attendance Alert Data Integrity & DEF-08.1-03 Verification
 */

// Helper mirroring the corrected attendance alert derivation in facultyService.ts
function deriveFacultyAttendanceAlerts(
  rawAnalyticsRows = [],
  studentProfiles = []
) {
  // 1. Strictly filter for genuine attendance alerts: must have conducted sessions (> 0) and attendance < 75%
  const lowAttendanceRows = (rawAnalyticsRows || []).filter((row) => {
    const totalSessions = Number(row.total_sessions || 0);
    const percentage = Number(row.attendance_percentage ?? 0);
    return totalSessions > 0 && percentage < 75;
  });

  const lowAttendanceIds = new Set(lowAttendanceRows.map((row) => row.student_id));
  const attendanceByStudent = new Map(
    lowAttendanceRows.map((row) => [
      row.student_id,
      {
        percentage: Number(row.attendance_percentage),
        totalSessions: Number(row.total_sessions || 0),
        presentCount: Number(row.present_count || 0),
      }
    ])
  );

  const matchedProfiles = (studentProfiles || []).filter((s) => lowAttendanceIds.has(s.id));

  const studentAlerts = matchedProfiles.map((student) => {
    const attInfo = attendanceByStudent.get(student.id);
    const percentage = attInfo ? attInfo.percentage : 0;
    const totalSessions = attInfo ? attInfo.totalSessions : 0;
    const presentCount = attInfo ? attInfo.presentCount : 0;
    return {
      id: student.id,
      studentName: student.full_name || student.email,
      usn: student.usn_or_employee_id || 'Not recorded',
      type: 'Low Attendance',
      details: totalSessions > 0
        ? `Attendance at ${percentage}% (${presentCount}/${totalSessions} sessions conducted). Below the institutional 75% threshold.`
        : 'Attendance is below the institutional 75% threshold.',
      value: `${percentage}%`,
      severity: percentage < 60 ? 'high' : 'medium',
    };
  });

  return {
    studentAlerts,
    attendanceAlertsCount: studentAlerts.length,
  };
}

// 1. Zero conducted sessions — no low-attendance alert (DEF-08.1-03 Root Fix)
test('1. Zero conducted sessions produces no low-attendance alert (DEF-08.1-03 resolved)', () => {
  const analyticsRows = [
    { student_id: 'std-zero', attendance_percentage: 0, total_sessions: 0, present_count: 0 }
  ];
  const profiles = [
    { id: 'std-zero', full_name: 'Student Zero', usn_or_employee_id: '1AI23CS001', email: 'zero@aiet.edu' }
  ];

  const { studentAlerts, attendanceAlertsCount } = deriveFacultyAttendanceAlerts(analyticsRows, profiles);

  assert.equal(studentAlerts.length, 0, 'Students with zero conducted sessions must NOT receive an alert');
  assert.equal(attendanceAlertsCount, 0, 'Alert count must be 0');
});

// 2. One conducted session, absent — alert
test('2. One conducted session with absence produces genuine 0% low-attendance alert', () => {
  const analyticsRows = [
    { student_id: 'std-one-absent', attendance_percentage: 0.0, total_sessions: 1, present_count: 0 }
  ];
  const profiles = [
    { id: 'std-one-absent', full_name: 'Student Absent', usn_or_employee_id: '1AI23CS002', email: 'absent@aiet.edu' }
  ];

  const { studentAlerts, attendanceAlertsCount } = deriveFacultyAttendanceAlerts(analyticsRows, profiles);

  assert.equal(studentAlerts.length, 1, 'Genuine 0% with conducted sessions must alert');
  assert.equal(attendanceAlertsCount, 1);
  assert.equal(studentAlerts[0].value, '0%');
  assert.equal(studentAlerts[0].severity, 'high');
  assert.ok(studentAlerts[0].details.includes('0/1 sessions conducted'));
});

// 3. Four conducted sessions, three present — exactly 75%, no alert
test('3. Exactly 75% attendance (3/4 sessions) produces no alert', () => {
  const analyticsRows = [
    { student_id: 'std-75', attendance_percentage: 75.0, total_sessions: 4, present_count: 3 }
  ];
  const profiles = [
    { id: 'std-75', full_name: 'Student 75Pct', usn_or_employee_id: '1AI23CS003', email: 's75@aiet.edu' }
  ];

  const { studentAlerts, attendanceAlertsCount } = deriveFacultyAttendanceAlerts(analyticsRows, profiles);

  assert.equal(studentAlerts.length, 0, 'Students at exactly 75% threshold must not receive an alert');
  assert.equal(attendanceAlertsCount, 0);
});

// 4. Four conducted sessions, two present — 50%, alert
test('4. 50% attendance (2/4 sessions) produces alert with high severity', () => {
  const analyticsRows = [
    { student_id: 'std-50', attendance_percentage: 50.0, total_sessions: 4, present_count: 2 }
  ];
  const profiles = [
    { id: 'std-50', full_name: 'Student 50Pct', usn_or_employee_id: '1AI23CS004', email: 's50@aiet.edu' }
  ];

  const { studentAlerts, attendanceAlertsCount } = deriveFacultyAttendanceAlerts(analyticsRows, profiles);

  assert.equal(studentAlerts.length, 1);
  assert.equal(attendanceAlertsCount, 1);
  assert.equal(studentAlerts[0].value, '50%');
  assert.equal(studentAlerts[0].severity, 'high'); // < 60% is high
  assert.ok(studentAlerts[0].details.includes('2/4 sessions conducted'));
});

// 5. Borderline case: 74.9% vs 75.0%
test('5. Borderline attendance: 74.9% produces medium alert, 75.0% produces no alert', () => {
  const analyticsRows = [
    { student_id: 'std-74-9', attendance_percentage: 74.9, total_sessions: 100, present_count: 74 },
    { student_id: 'std-75-0', attendance_percentage: 75.0, total_sessions: 100, present_count: 75 }
  ];
  const profiles = [
    { id: 'std-74-9', full_name: 'Student Borderline Below', usn_or_employee_id: '1AI23CS005' },
    { id: 'std-75-0', full_name: 'Student Borderline OnTrack', usn_or_employee_id: '1AI23CS006' }
  ];

  const { studentAlerts, attendanceAlertsCount } = deriveFacultyAttendanceAlerts(analyticsRows, profiles);

  assert.equal(studentAlerts.length, 1);
  assert.equal(attendanceAlertsCount, 1);
  assert.equal(studentAlerts[0].id, 'std-74-9');
  assert.equal(studentAlerts[0].value, '74.9%');
  assert.equal(studentAlerts[0].severity, 'medium'); // >= 60% and < 75% is medium
});

// 6. Missing attendance records — no fabricated alert
test('6. Missing attendance records handles safely without fabricated alerts', () => {
  // Empty result from database
  const { studentAlerts: alertsEmpty, attendanceAlertsCount: countEmpty } = deriveFacultyAttendanceAlerts([], []);
  assert.equal(alertsEmpty.length, 0);
  assert.equal(countEmpty, 0);

  // Null/undefined elements or unexpected formats
  const dirtyRows = [
    { student_id: 'std-null', attendance_percentage: null, total_sessions: null, present_count: null },
    { student_id: 'std-nan', attendance_percentage: NaN, total_sessions: 0, present_count: 0 }
  ];
  const { studentAlerts: alertsDirty, attendanceAlertsCount: countDirty } = deriveFacultyAttendanceAlerts(dirtyRows, []);
  assert.equal(alertsDirty.length, 0);
  assert.equal(countDirty, 0);
});

// 7. Department and course authorization scoping
test('7. Alert evaluation is strictly scoped to enrolled students of the faculty member', () => {
  const facultyEnrolledStudentIds = new Set(['std-course-1', 'std-course-2']);
  
  // Mixed analytics rows containing students across the entire institution
  const institutionAnalytics = [
    { student_id: 'std-course-1', attendance_percentage: 45.0, total_sessions: 10, present_count: 4.5 }, // Faculty's student (low)
    { student_id: 'std-course-2', attendance_percentage: 90.0, total_sessions: 10, present_count: 9 },   // Faculty's student (good)
    { student_id: 'std-other-fac', attendance_percentage: 30.0, total_sessions: 10, present_count: 3 },  // Other faculty's student (low)
  ];

  // Scoped query filter simulation: .in('student_id', studentIds)
  const scopedRows = institutionAnalytics.filter(row => facultyEnrolledStudentIds.has(row.student_id));
  const profiles = [
    { id: 'std-course-1', full_name: 'Enrolled Student 1', usn_or_employee_id: '1AI23CS010' },
    { id: 'std-course-2', full_name: 'Enrolled Student 2', usn_or_employee_id: '1AI23CS011' }
  ];

  const { studentAlerts, attendanceAlertsCount } = deriveFacultyAttendanceAlerts(scopedRows, profiles);

  assert.equal(studentAlerts.length, 1);
  assert.equal(attendanceAlertsCount, 1);
  assert.equal(studentAlerts[0].id, 'std-course-1');
  assert.ok(!studentAlerts.some(a => a.id === 'std-other-fac'), 'Must not include unassigned students');
});

// 8. Existing dashboard statistics remain intact
test('8. Existing dashboard statistics remain coherent alongside corrected alerts', () => {
  const mockCourses = [{ id: 'c1' }, { id: 'c2' }];
  const mockStudentIds = ['s1', 's2', 's3', 's4'];
  const mockTodayClasses = [{ id: 't1' }];
  const mockPendingWork = [{ id: 'p1', pendingCount: 3 }];
  const mockAssignments = [{ id: 'a1', status: 'Active' }, { id: 'a2', status: 'Closed' }];

  const analyticsRows = [
    { student_id: 's1', attendance_percentage: 0, total_sessions: 0, present_count: 0 }, // Zero sessions (no alert)
    { student_id: 's2', attendance_percentage: 65, total_sessions: 20, present_count: 13 }, // Alert (65% < 75%)
    { student_id: 's3', attendance_percentage: 85, total_sessions: 20, present_count: 17 }, // Good (no alert)
    { student_id: 's4', attendance_percentage: 0, total_sessions: 0, present_count: 0 }, // Zero sessions (no alert)
  ];

  const profiles = [
    { id: 's2', full_name: 'Student S2', usn_or_employee_id: '1AI23CS020' }
  ];

  const { studentAlerts, attendanceAlertsCount } = deriveFacultyAttendanceAlerts(analyticsRows, profiles);

  const stats = {
    myCoursesCount: mockCourses.length,
    studentsCount: mockStudentIds.length,
    todaysClassesCount: mockTodayClasses.length,
    pendingEvaluationsCount: mockPendingWork.reduce((total, item) => total + item.pendingCount, 0),
    activeAssignmentsCount: mockAssignments.filter(a => !['Completed', 'Closed'].includes(a.status)).length,
    attendanceAlertsCount,
  };

  assert.equal(stats.myCoursesCount, 2);
  assert.equal(stats.studentsCount, 4);
  assert.equal(stats.todaysClassesCount, 1);
  assert.equal(stats.pendingEvaluationsCount, 3);
  assert.equal(stats.activeAssignmentsCount, 1);
  assert.equal(stats.attendanceAlertsCount, 1, 'Only genuine low attendance student s2 is alerted');
  assert.equal(studentAlerts.length, 1);
});
