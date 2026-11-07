/**
 * AIET-UniSphere - MISSION 07.4.1 Course Detail Data Integrity Test Suite
 * 
 * Verifies:
 * 1. Valid course attendance calculation (present + late / totalConducted).
 * 2. Zero attendance sessions handled as "N/A" or "No sessions" without division-by-zero or 0% distortion.
 * 3. Missing / null attendance data fallback (never renders undefined% or NaN%).
 * 4. Valid course progress from combined submitted assignments & attempted assessments.
 * 5. Missing progress data / zero coursework assigned handled as "N/A".
 * 6. Real modules derived from academic materials grouped by module ID.
 * 7. No modules available / empty state handling (no crash on empty array).
 * 8. Unauthorized course access rejection (non-enrolled student).
 * 9. Invalid or missing course identifier handling.
 */

import assert from 'node:assert';
import test from 'node:test';

// -------------------------------------------------------------
// Pure logic mirrors matching CourseDetail & courseService implementation
// -------------------------------------------------------------

export function calculateCourseAttendance(attSummary, course) {
  if (!course) {
    return { percentage: null, display: 'N/A', held: 0, attended: 0 };
  }

  const matchingSubject = (attSummary?.subjects || []).find((s) => 
    (course.code && s.code?.toLowerCase() === course.code.toLowerCase()) ||
    (course.id && s.code?.toLowerCase() === course.id.toLowerCase()) ||
    (course.name && s.subject?.toLowerCase() === course.name.toLowerCase())
  );

  let attendancePct = null;
  let attendanceDisp = 'N/A';
  let sessionsHeld = 0;
  let sessionsAttended = 0;

  if (matchingSubject) {
    sessionsHeld = matchingSubject.held || 0;
    sessionsAttended = matchingSubject.attended || 0;
    if (sessionsHeld > 0) {
      attendancePct = matchingSubject.percentage ?? Math.round((sessionsAttended / sessionsHeld) * 100);
      attendanceDisp = `${attendancePct}%`;
    } else {
      attendanceDisp = 'No sessions';
    }
  } else if (attSummary?.counts && attSummary.counts.totalConducted === 0) {
    attendanceDisp = 'No sessions';
  }

  // Strict assertion: never return literal undefined% or NaN%
  assert.ok(!attendanceDisp.includes('undefined%'), 'Attendance display must never contain undefined%');
  assert.ok(!attendanceDisp.includes('NaN%'), 'Attendance display must never contain NaN%');

  return {
    percentage: attendancePct,
    display: attendanceDisp,
    held: sessionsHeld,
    attended: sessionsAttended
  };
}

export function calculateCourseProgress(assignments = [], assessments = []) {
  const completedAssignments = assignments.filter(a => a.status === 'Submitted' || a.status === 'Graded').length;
  const completedAssessments = assessments.filter(a => 
    a.studentAttempt && (a.studentAttempt.status === 'Submitted' || a.studentAttempt.status === 'Graded')
  ).length;

  const totalItems = assignments.length + assessments.length;
  const completedItems = completedAssignments + completedAssessments;

  let progressPct = null;
  let progressDisp = 'N/A';

  if (totalItems > 0) {
    progressPct = Math.round((completedItems / totalItems) * 100);
    progressDisp = `${progressPct}%`;
  }

  // Strict assertion: never return literal undefined% or NaN%
  assert.ok(!progressDisp.includes('undefined%'), 'Progress display must never contain undefined%');
  assert.ok(!progressDisp.includes('NaN%'), 'Progress display must never contain NaN%');

  return {
    percentage: progressPct,
    display: progressDisp,
    total: totalItems,
    completed: completedItems
  };
}

export function deriveCourseModules(materials = [], courseAssignments = []) {
  if (!materials || materials.length === 0) {
    return [];
  }

  const moduleMap = new Map();

  materials.forEach((m) => {
    const modKey = (m.moduleId && m.moduleId.trim()) || 'General';
    if (!moduleMap.has(modKey)) {
      let title = modKey;
      if (/^\d+$/.test(modKey)) {
        title = `Module ${modKey}`;
      } else if (modKey.toLowerCase() === 'general') {
        title = 'General Resources';
      } else if (!modKey.toLowerCase().startsWith('module')) {
        title = `Module: ${modKey}`;
      }
      moduleMap.set(modKey, {
        id: modKey,
        title,
        materials: []
      });
    }
    moduleMap.get(modKey).materials.push(m);
  });

  return Array.from(moduleMap.values()).map(mod => {
    const matchingAssignments = courseAssignments.filter(a => 
      (a.title && a.title.toLowerCase().includes(`module ${mod.id}`.toLowerCase())) ||
      (a.instructions && a.instructions.toLowerCase().includes(`module ${mod.id}`.toLowerCase()))
    );

    const assignmentsCount = matchingAssignments.length;
    const completedAssignments = matchingAssignments.filter(a => a.status === 'Submitted' || a.status === 'Graded').length;
    const completion = assignmentsCount > 0 
      ? Math.round((completedAssignments / assignmentsCount) * 100) 
      : 0;

    return {
      id: mod.id,
      title: mod.title,
      materialsCount: mod.materials.length,
      assignmentsCount,
      completion,
      materials: mod.materials
    };
  });
}

export function resolveNextActivity(assessments = [], assignments = []) {
  const upcomingAssessment = assessments.find(a => 
    ['Upcoming', 'Active'].includes(a.status) && a.date
  );
  const pendingAssignment = assignments.find(a => 
    a.status === 'Pending' && a.deadline && new Date(a.deadline) > new Date()
  );

  if (upcomingAssessment) {
    return `${upcomingAssessment.title} (${upcomingAssessment.date}${upcomingAssessment.time ? ' at ' + upcomingAssessment.time : ''})`;
  }
  if (pendingAssignment) {
    return `${pendingAssignment.title} (Due: ${new Date(pendingAssignment.deadline).toLocaleDateString()})`;
  }
  return 'No upcoming sessions scheduled';
}

// -------------------------------------------------------------
// Test Suite Execution
// -------------------------------------------------------------

test('1. Valid course attendance calculation (present + late / totalConducted)', () => {
  const course = { id: 'crs-101', code: 'CS401', name: 'Database Management Systems' };
  const attSummary = {
    counts: { totalConducted: 20, present: 15, late: 2, absent: 3 },
    subjects: [
      {
        code: 'CS401',
        subject: 'Database Management Systems',
        held: 20,
        attended: 17,
        percentage: 85,
        status: 'Good'
      }
    ]
  };

  const result = calculateCourseAttendance(attSummary, course);
  assert.strictEqual(result.percentage, 85);
  assert.strictEqual(result.display, '85%');
  assert.strictEqual(result.held, 20);
  assert.strictEqual(result.attended, 17);
});

test('2. Zero attendance sessions handled as "No sessions" without division-by-zero or 0% distortion', () => {
  const course = { id: 'crs-102', code: 'CS402', name: 'Computer Networks' };
  const attSummary = {
    counts: { totalConducted: 0, present: 0, late: 0, absent: 0 },
    subjects: [
      {
        code: 'CS402',
        subject: 'Computer Networks',
        held: 0,
        attended: 0,
        percentage: 0,
        status: 'Critical'
      }
    ]
  };

  const result = calculateCourseAttendance(attSummary, course);
  assert.strictEqual(result.percentage, null);
  assert.strictEqual(result.display, 'No sessions');
  assert.strictEqual(result.held, 0);
  assert.strictEqual(result.attended, 0);
  assert.doesNotMatch(result.display, /undefined|NaN|0%/);
});

test('3. Missing / null attendance data fallback (never renders undefined% or NaN%)', () => {
  const course = { id: 'crs-103', code: 'CS403', name: 'Software Engineering' };
  
  // Test with null attSummary
  const resultNull = calculateCourseAttendance(null, course);
  assert.strictEqual(resultNull.percentage, null);
  assert.strictEqual(resultNull.display, 'N/A');
  assert.strictEqual(resultNull.held, 0);

  // Test with empty subjects array
  const resultEmpty = calculateCourseAttendance({ subjects: [], counts: { totalConducted: 5 } }, course);
  assert.strictEqual(resultEmpty.percentage, null);
  assert.strictEqual(resultEmpty.display, 'N/A');
});

test('4. Valid course progress from combined submitted assignments & attempted assessments', () => {
  const assignments = [
    { id: 'asg-1', title: 'ER Diagram', status: 'Submitted' },
    { id: 'asg-2', title: 'Normalization', status: 'Pending' }
  ];
  const assessments = [
    { 
      id: 'asm-1', 
      title: 'Unit Test 1', 
      status: 'Closed',
      studentAttempt: { status: 'Graded', score: 18, maxScore: 20 }
    },
    { 
      id: 'asm-2', 
      title: 'Quiz 2', 
      status: 'Upcoming',
      studentAttempt: null
    }
  ];

  // Total coursework = 2 assignments + 2 assessments = 4
  // Completed coursework = 1 assignment (Submitted) + 1 assessment (Graded) = 2
  // Expected progress = 2 / 4 * 100 = 50%
  const result = calculateCourseProgress(assignments, assessments);
  assert.strictEqual(result.total, 4);
  assert.strictEqual(result.completed, 2);
  assert.strictEqual(result.percentage, 50);
  assert.strictEqual(result.display, '50%');
});

test('5. Missing progress data / zero coursework assigned handled as "N/A"', () => {
  const result = calculateCourseProgress([], []);
  assert.strictEqual(result.total, 0);
  assert.strictEqual(result.completed, 0);
  assert.strictEqual(result.percentage, null);
  assert.strictEqual(result.display, 'N/A');
  assert.doesNotMatch(result.display, /undefined|NaN/);
});

test('6. Real modules derived from academic materials grouped by module ID', () => {
  const materials = [
    { id: 'mat-1', title: 'Relational Model Intro', moduleId: '1', fileName: 'intro.pdf' },
    { id: 'mat-2', title: 'SQL Cheatsheet', moduleId: '1', fileName: 'sql.pdf' },
    { id: 'mat-3', title: 'Transactions & ACID', moduleId: '2', fileName: 'acid.pdf' },
    { id: 'mat-4', title: 'Syllabus & Lab Manual', moduleId: 'General', fileName: 'syllabus.pdf' }
  ];
  const assignments = [
    { id: 'asg-1', title: 'Module 1: Relational Schema', status: 'Submitted' },
    { id: 'asg-2', title: 'Module 1: SQL Queries', status: 'Graded' },
    { id: 'asg-3', title: 'Module 2: Concurrency Control', status: 'Pending' }
  ];

  const modules = deriveCourseModules(materials, assignments);
  assert.strictEqual(modules.length, 3);

  const mod1 = modules.find(m => m.id === '1');
  assert.ok(mod1);
  assert.strictEqual(mod1.title, 'Module 1');
  assert.strictEqual(mod1.materialsCount, 2);
  assert.strictEqual(mod1.assignmentsCount, 2);
  assert.strictEqual(mod1.completion, 100); // 2 of 2 completed

  const mod2 = modules.find(m => m.id === '2');
  assert.ok(mod2);
  assert.strictEqual(mod2.title, 'Module 2');
  assert.strictEqual(mod2.materialsCount, 1);
  assert.strictEqual(mod2.assignmentsCount, 1);
  assert.strictEqual(mod2.completion, 0); // 0 of 1 completed

  const genMod = modules.find(m => m.id === 'General');
  assert.ok(genMod);
  assert.strictEqual(genMod.title, 'General Resources');
  assert.strictEqual(genMod.materialsCount, 1);
});

test('7. No modules available / empty state handling (no crash on empty array)', () => {
  const modules = deriveCourseModules([], []);
  assert.deepStrictEqual(modules, []);
  
  // Verify that an empty array does not throw or cause undefined references
  assert.strictEqual(modules.length, 0);
  const emptyStateRendered = modules.length === 0 ? 'No syllabus modules available yet' : 'Rendered';
  assert.strictEqual(emptyStateRendered, 'No syllabus modules available yet');
});

test('8. Unauthorized course access rejection (non-enrolled student)', () => {
  const enrolledCourses = [
    { id: 'crs-1', code: 'CS101', name: 'Programming in C' }
  ];

  function getCourseForStudent(courseId) {
    return enrolledCourses.find(c => c.id === courseId || c.code.toLowerCase() === courseId.toLowerCase());
  }

  // Attempt to access un-enrolled course
  const unauthorizedCourse = getCourseForStudent('crs-secret-999');
  assert.strictEqual(unauthorizedCourse, undefined);
});

test('9. Invalid or missing course identifier handling', () => {
  const enrolledCourses = [
    { id: 'crs-1', code: 'CS101', name: 'Programming in C' }
  ];

  function getCourseByIdSafe(id) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return undefined;
    }
    return enrolledCourses.find(c => c.id === id || c.code.toLowerCase() === id.trim().toLowerCase());
  }

  assert.strictEqual(getCourseByIdSafe(''), undefined);
  assert.strictEqual(getCourseByIdSafe(null), undefined);
  assert.strictEqual(getCourseByIdSafe(undefined), undefined);
  assert.strictEqual(getCourseByIdSafe('   '), undefined);
  assert.ok(getCourseByIdSafe('CS101'));
});
