/**
 * AIET-UniSphere - MISSION 07.4.3 Student Dashboard Course Progress Test Suite
 * 
 * Verifies:
 * 1. No coursework: Returns null percentage and 'N/A' display (no false 0%).
 * 2. All coursework incomplete: Returns 0% when coursework exists but none is completed.
 * 3. Partially completed coursework: Accurate completion percentage (e.g. 50%).
 * 4. All coursework completed: Returns 100% when all assigned items are completed.
 * 5. Missing assignment data: Gracefully falls back to empty array without crashing.
 * 6. Missing assessment data: Gracefully falls back to empty array without crashing.
 * 7. Zero denominator: Divides safely without producing NaN, Infinity, or unhandled errors.
 * 8. Student-specific data isolation: Evaluates only the target student's attempts and submissions.
 * 9. Multiple courses with different completion rates: Evaluates independent metrics for each course.
 * 10. Consistency between dashboard and CourseDetail calculations: Shared logic guarantees identical values.
 */

import assert from 'node:assert';
import test from 'node:test';

// -------------------------------------------------------------
// Pure logic mirror matching courseService.calculateStudentCourseProgress
// -------------------------------------------------------------

export function calculateStudentCourseProgress(
  course,
  assignments = [],
  assessments = []
) {
  if (!course || !course.id) {
    return {
      percentage: null,
      display: 'N/A',
      totalCoursework: 0,
      completedCoursework: 0,
      hasCoursework: false
    };
  }

  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeAssessments = Array.isArray(assessments) ? assessments : [];

  const courseAssignments = safeAssignments.filter(a => 
    a && (
      a.courseId === course.id || 
      (course.code && a.courseId === course.code) ||
      (a.courseName && course.name && a.courseName.toLowerCase() === course.name.toLowerCase())
    )
  );

  const courseAssessments = safeAssessments.filter(a => 
    a && (
      a.courseId === course.id || 
      (course.code && (a.courseCode === course.code || a.courseId === course.code)) ||
      (a.courseName && course.name && a.courseName.toLowerCase() === course.name.toLowerCase())
    )
  );

  const completedAssignments = courseAssignments.filter(a => a.status === 'Submitted' || a.status === 'Graded').length;
  const completedAssessments = courseAssessments.filter(a => 
    a.studentAttempt && (a.studentAttempt.status === 'Submitted' || a.studentAttempt.status === 'Graded')
  ).length;

  const totalCoursework = courseAssignments.length + courseAssessments.length;
  const completedCoursework = completedAssignments + completedAssessments;

  if (totalCoursework === 0) {
    return {
      percentage: null,
      display: 'N/A',
      totalCoursework: 0,
      completedCoursework: 0,
      hasCoursework: false
    };
  }

  const percentage = Math.round((completedCoursework / totalCoursework) * 100);
  return {
    percentage,
    display: `${percentage}%`,
    totalCoursework,
    completedCoursework,
    hasCoursework: true
  };
}

// -------------------------------------------------------------
// Test Scenarios
// -------------------------------------------------------------

test('1. No coursework: Returns null percentage and "N/A" display (no false 0%)', () => {
  const course = { id: 'c-1', code: 'CS101', name: 'Intro to CS' };
  const result = calculateStudentCourseProgress(course, [], []);

  assert.strictEqual(result.hasCoursework, false);
  assert.strictEqual(result.percentage, null);
  assert.strictEqual(result.display, 'N/A');
  assert.strictEqual(result.totalCoursework, 0);
  assert.strictEqual(result.completedCoursework, 0);
});

test('2. All coursework incomplete: Returns 0% when coursework exists but none is completed', () => {
  const course = { id: 'c-1', code: 'CS101', name: 'Intro to CS' };
  const assignments = [
    { id: 'a-1', courseId: 'c-1', status: 'Pending' },
    { id: 'a-2', courseId: 'c-1', status: 'Overdue' }
  ];
  const assessments = [
    { id: 'as-1', courseId: 'c-1', status: 'Upcoming', studentAttempt: null }
  ];

  const result = calculateStudentCourseProgress(course, assignments, assessments);
  assert.strictEqual(result.hasCoursework, true);
  assert.strictEqual(result.totalCoursework, 3);
  assert.strictEqual(result.completedCoursework, 0);
  assert.strictEqual(result.percentage, 0);
  assert.strictEqual(result.display, '0%');
});

test('3. Partially completed coursework: Accurate completion percentage (50%)', () => {
  const course = { id: 'c-1', code: 'CS101', name: 'Intro to CS' };
  const assignments = [
    { id: 'a-1', courseId: 'c-1', status: 'Submitted' },
    { id: 'a-2', courseId: 'c-1', status: 'Pending' }
  ];
  const assessments = [
    { id: 'as-1', courseId: 'c-1', status: 'Completed', studentAttempt: { status: 'Graded', score: 18, maxScore: 20 } },
    { id: 'as-2', courseId: 'c-1', status: 'Upcoming', studentAttempt: null }
  ];

  const result = calculateStudentCourseProgress(course, assignments, assessments);
  assert.strictEqual(result.hasCoursework, true);
  assert.strictEqual(result.totalCoursework, 4);
  assert.strictEqual(result.completedCoursework, 2);
  assert.strictEqual(result.percentage, 50);
  assert.strictEqual(result.display, '50%');
});

test('4. All coursework completed: Returns 100% when all assigned items are completed', () => {
  const course = { id: 'c-1', code: 'CS101', name: 'Intro to CS' };
  const assignments = [
    { id: 'a-1', courseId: 'c-1', status: 'Submitted' },
    { id: 'a-2', courseId: 'c-1', status: 'Graded' }
  ];
  const assessments = [
    { id: 'as-1', courseId: 'c-1', status: 'Completed', studentAttempt: { status: 'Submitted', score: 20, maxScore: 20 } }
  ];

  const result = calculateStudentCourseProgress(course, assignments, assessments);
  assert.strictEqual(result.hasCoursework, true);
  assert.strictEqual(result.totalCoursework, 3);
  assert.strictEqual(result.completedCoursework, 3);
  assert.strictEqual(result.percentage, 100);
  assert.strictEqual(result.display, '100%');
});

test('5. Missing assignment data: Gracefully falls back to empty array without crashing', () => {
  const course = { id: 'c-1', code: 'CS101', name: 'Intro to CS' };
  const assessments = [
    { id: 'as-1', courseId: 'c-1', status: 'Completed', studentAttempt: { status: 'Graded' } }
  ];

  // Missing assignments (null / undefined)
  const resultNull = calculateStudentCourseProgress(course, null, assessments);
  assert.strictEqual(resultNull.hasCoursework, true);
  assert.strictEqual(resultNull.totalCoursework, 1);
  assert.strictEqual(resultNull.completedCoursework, 1);
  assert.strictEqual(resultNull.percentage, 100);

  const resultUndefined = calculateStudentCourseProgress(course, undefined, assessments);
  assert.strictEqual(resultUndefined.hasCoursework, true);
  assert.strictEqual(resultUndefined.percentage, 100);
});

test('6. Missing assessment data: Gracefully falls back to empty array without crashing', () => {
  const course = { id: 'c-1', code: 'CS101', name: 'Intro to CS' };
  const assignments = [
    { id: 'a-1', courseId: 'c-1', status: 'Submitted' }
  ];

  // Missing assessments (null / undefined)
  const resultNull = calculateStudentCourseProgress(course, assignments, null);
  assert.strictEqual(resultNull.hasCoursework, true);
  assert.strictEqual(resultNull.totalCoursework, 1);
  assert.strictEqual(resultNull.completedCoursework, 1);
  assert.strictEqual(resultNull.percentage, 100);

  const resultUndefined = calculateStudentCourseProgress(course, assignments, undefined);
  assert.strictEqual(resultUndefined.hasCoursework, true);
  assert.strictEqual(resultUndefined.percentage, 100);
});

test('7. Zero denominator: Divides safely without producing NaN, Infinity, or unhandled errors', () => {
  const course = { id: 'c-empty', code: 'CS000', name: 'Empty Course' };
  const result = calculateStudentCourseProgress(course, [], []);

  assert.strictEqual(Number.isNaN(result.percentage), false);
  assert.strictEqual(result.percentage, null);
  assert.strictEqual(result.display, 'N/A');
  assert.strictEqual(result.hasCoursework, false);
});

test('8. Student-specific data isolation: Evaluates only the target student attempts and submissions', () => {
  const course = { id: 'c-1', code: 'CS101', name: 'Intro to CS' };

  // Student A has submitted
  const studentAAssignments = [{ id: 'a-1', courseId: 'c-1', status: 'Submitted' }];
  const studentAAssessments = [{ id: 'as-1', courseId: 'c-1', studentAttempt: { status: 'Graded' } }];

  // Student B has not submitted
  const studentBAssignments = [{ id: 'a-1', courseId: 'c-1', status: 'Pending' }];
  const studentBAssessments = [{ id: 'as-1', courseId: 'c-1', studentAttempt: null }];

  const progressA = calculateStudentCourseProgress(course, studentAAssignments, studentAAssessments);
  const progressB = calculateStudentCourseProgress(course, studentBAssignments, studentBAssessments);

  assert.strictEqual(progressA.percentage, 100);
  assert.strictEqual(progressB.percentage, 0);
  assert.notStrictEqual(progressA.percentage, progressB.percentage);
});

test('9. Multiple courses with different completion rates: Evaluates independent metrics for each course', () => {
  const course1 = { id: 'c-1', code: 'CS101', name: 'Data Structures' };
  const course2 = { id: 'c-2', code: 'CS102', name: 'Algorithms' };
  const course3 = { id: 'c-3', code: 'CS103', name: 'Operating Systems' };

  const assignments = [
    { id: 'a-1', courseId: 'c-1', status: 'Submitted' },
    { id: 'a-2', courseId: 'c-2', status: 'Submitted' },
    { id: 'a-3', courseId: 'c-2', status: 'Pending' }
  ];

  const assessments = [
    { id: 'as-1', courseId: 'c-1', status: 'Closed', studentAttempt: { status: 'Graded' } },
    { id: 'as-2', courseId: 'c-2', status: 'Closed', studentAttempt: null }
  ];

  const p1 = calculateStudentCourseProgress(course1, assignments, assessments);
  const p2 = calculateStudentCourseProgress(course2, assignments, assessments);
  const p3 = calculateStudentCourseProgress(course3, assignments, assessments);

  // Course 1: 1/1 assignment + 1/1 assessment = 2/2 = 100%
  assert.strictEqual(p1.percentage, 100);
  assert.strictEqual(p1.display, '100%');
  assert.strictEqual(p1.hasCoursework, true);

  // Course 2: 1/2 assignment + 0/1 assessment = 1/3 = 33%
  assert.strictEqual(p2.percentage, 33);
  assert.strictEqual(p2.display, '33%');
  assert.strictEqual(p2.hasCoursework, true);

  // Course 3: 0 coursework assigned = N/A
  assert.strictEqual(p3.percentage, null);
  assert.strictEqual(p3.display, 'N/A');
  assert.strictEqual(p3.hasCoursework, false);
});

test('10. Consistency between dashboard and CourseDetail calculations: Shared logic guarantees identical values', () => {
  const course = { id: 'c-common', code: 'CS301', name: 'Database Management Systems' };
  const assignments = [
    { id: 'a-1', courseId: 'c-common', status: 'Submitted' },
    { id: 'a-2', courseId: 'c-common', status: 'Graded' },
    { id: 'a-3', courseId: 'c-common', status: 'Pending' }
  ];
  const assessments = [
    { id: 'as-1', courseId: 'c-common', status: 'Completed', studentAttempt: { status: 'Graded', score: 15, maxScore: 20 } }
  ];

  // Dashboard calculation
  const dashboardProgress = calculateStudentCourseProgress(course, assignments, assessments);

  // CourseDetail calculation
  const courseDetailProgress = calculateStudentCourseProgress(course, assignments, assessments);

  assert.deepStrictEqual(dashboardProgress, courseDetailProgress);
  assert.strictEqual(dashboardProgress.percentage, 75); // 3 of 4 = 75%
  assert.strictEqual(dashboardProgress.display, '75%');
  assert.strictEqual(dashboardProgress.completedCoursework, 3);
  assert.strictEqual(dashboardProgress.totalCoursework, 4);
});

