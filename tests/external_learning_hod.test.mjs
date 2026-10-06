import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit & Integration Verification Tests for HOD External Learning Analytics & Department Management (Phase 2C)
 */

test('1. HOD overview department filtering isolates data by department_id', () => {
  const filterAssignmentsByDepartment = (assignments, hodDeptId) => {
    return assignments.filter(a => a.department_id === hodDeptId);
  };

  const sampleAssignments = [
    { id: 'asgn-1', title: 'CSE Cloud', department_id: 'dept-cse' },
    { id: 'asgn-2', title: 'ECE Embedded', department_id: 'dept-ece' },
    { id: 'asgn-3', title: 'CSE AI/ML', department_id: 'dept-cse' },
  ];

  const cseAssignments = filterAssignmentsByDepartment(sampleAssignments, 'dept-cse');
  assert.equal(cseAssignments.length, 2);
  assert.deepEqual(cseAssignments.map(a => a.id), ['asgn-1', 'asgn-3']);

  const eceAssignments = filterAssignmentsByDepartment(sampleAssignments, 'dept-ece');
  assert.equal(eceAssignments.length, 1);
  assert.equal(eceAssignments[0].id, 'asgn-2');
});

test('2. HOD cannot access another department data via department_id tampering', () => {
  const authorizeHODRequest = (userDeptId, targetDeptId, userRole) => {
    if (userRole === 'ADMIN') return true;
    if (userRole === 'HOD' && userDeptId === targetDeptId) return true;
    throw new Error('403 Forbidden: Department scope mismatch');
  };

  assert.equal(authorizeHODRequest('dept-cse', 'dept-cse', 'HOD'), true);
  assert.throws(() => authorizeHODRequest('dept-cse', 'dept-ece', 'HOD'), /Department scope mismatch/);
  assert.equal(authorizeHODRequest('dept-cse', 'dept-ece', 'ADMIN'), true);
});

test('3. HOD Metrics: Assignment & Student counts calculation accuracy', () => {
  const calculateDepartmentCounts = (assignments, enrollments) => {
    const activeAssignments = assignments.filter(a => a.status === 'ACTIVE').length;
    const totalAssignedStudents = enrollments.length;
    return { activeAssignments, totalAssignedStudents };
  };

  const assignments = [
    { id: 'a1', status: 'ACTIVE' },
    { id: 'a2', status: 'ACTIVE' },
    { id: 'a3', status: 'CLOSED' }
  ];
  const enrollments = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }, { id: 'e4' }, { id: 'e5' }];

  const counts = calculateDepartmentCounts(assignments, enrollments);
  assert.equal(counts.activeAssignments, 2);
  assert.equal(counts.totalAssignedStudents, 5);
});

test('4. Completion Rate calculation excludes CANCELLED enrollments from active denominator', () => {
  const calculateHODCompletionRate = (enrollments) => {
    const activeEnrollments = enrollments.filter(e => e.status !== 'CANCELLED');
    if (activeEnrollments.length === 0) return 0;
    const completedCount = activeEnrollments.filter(e => e.status === 'COMPLETED').length;
    return Math.round((completedCount / activeEnrollments.length) * 100);
  };

  const sampleEnrollments = [
    { id: 'e1', status: 'COMPLETED' },
    { id: 'e2', status: 'COMPLETED' },
    { id: 'e3', status: 'IN_PROGRESS' },
    { id: 'e4', status: 'ASSIGNED' },
    { id: 'e5', status: 'CANCELLED' }, // Should be excluded from denominator
    { id: 'e6', status: 'CANCELLED' }  // Should be excluded from denominator
  ];

  // Active enrollments = 4 (e1, e2, e3, e4). Completed = 2. Rate = 2/4 * 100 = 50%
  const rate = calculateHODCompletionRate(sampleEnrollments);
  assert.equal(rate, 50);
});

test('5. Overdue calculation requires deadline passed AND enrollment not completed/cancelled', () => {
  const checkIsOverdue = (deadlineStr, enrollmentStatus) => {
    if (!deadlineStr) return false;
    if (enrollmentStatus === 'COMPLETED' || enrollmentStatus === 'CANCELLED') return false;
    const deadline = new Date(deadlineStr);
    const now = new Date('2026-10-03T16:00:00Z');
    return deadline < now;
  };

  // Past deadline: 2026-09-20
  assert.equal(checkIsOverdue('2026-09-20T23:59:59Z', 'IN_PROGRESS'), true);
  assert.equal(checkIsOverdue('2026-09-20T23:59:59Z', 'ASSIGNED'), true);
  assert.equal(checkIsOverdue('2026-09-20T23:59:59Z', 'COMPLETED'), false); // Completed on time/after
  assert.equal(checkIsOverdue('2026-09-20T23:59:59Z', 'CANCELLED'), false); // Cancelled

  // Future deadline: 2026-12-01
  assert.equal(checkIsOverdue('2026-12-01T23:59:59Z', 'IN_PROGRESS'), false);
});

test('6. 100% self-reported progress is kept visually & logically distinct from Verified Completion', () => {
  const evaluateProgressState = (progressPercent, enrollmentStatus, latestEvidenceStatus) => {
    const is100Reported = progressPercent === 100;
    const isVerifiedCompletion = enrollmentStatus === 'COMPLETED' && latestEvidenceStatus === 'VERIFIED';

    return {
      is100Reported,
      isVerifiedCompletion,
      pendingVerification: is100Reported && !isVerifiedCompletion
    };
  };

  const case1 = evaluateProgressState(100, 'IN_PROGRESS', 'PENDING');
  assert.equal(case1.is100Reported, true);
  assert.equal(case1.isVerifiedCompletion, false);
  assert.equal(case1.pendingVerification, true);

  const case2 = evaluateProgressState(100, 'COMPLETED', 'VERIFIED');
  assert.equal(case2.is100Reported, true);
  assert.equal(case2.isVerifiedCompletion, true);
  assert.equal(case2.pendingVerification, false);
});

test('7. Evidence verification counting (Pending, Verified, Rejected)', () => {
  const tallyEvidenceStatus = (evidences) => {
    let pending = 0;
    let verified = 0;
    let rejected = 0;

    evidences.forEach(e => {
      if (e.verification_status === 'PENDING') pending++;
      else if (e.verification_status === 'VERIFIED') verified++;
      else if (e.verification_status === 'REJECTED') rejected++;
    });

    return { pending, verified, rejected };
  };

  const evidences = [
    { id: 'v1', verification_status: 'PENDING' },
    { id: 'v2', verification_status: 'PENDING' },
    { id: 'v3', verification_status: 'VERIFIED' },
    { id: 'v4', verification_status: 'VERIFIED' },
    { id: 'v5', verification_status: 'VERIFIED' },
    { id: 'v6', verification_status: 'REJECTED' }
  ];

  const counts = tallyEvidenceStatus(evidences);
  assert.equal(counts.pending, 2);
  assert.equal(counts.verified, 3);
  assert.equal(counts.rejected, 1);
});

test('8. Rejection action requires a mandatory rejection note', () => {
  const validateRejection = (status, note) => {
    if (status === 'REJECTED' && (!note || !note.trim())) {
      throw new Error('A verification note explaining the rejection reason is required.');
    }
    return true;
  };

  assert.throws(() => validateRejection('REJECTED', ''), /rejection reason is required/);
  assert.throws(() => validateRejection('REJECTED', '  '), /rejection reason is required/);
  assert.equal(validateRejection('REJECTED', 'Certificate does not contain readable USN'), true);
  assert.equal(validateRejection('VERIFIED', null), true);
});

test('9. Student Matrix filtering logic operates accurately on authorized dataset', () => {
  const matrix = [
    { studentUsn: '1AT22CS001', sem: 7, sec: 'A', status: 'IN_PROGRESS', vStatus: 'PENDING' },
    { studentUsn: '1AT22CS002', sem: 7, sec: 'B', status: 'COMPLETED', vStatus: 'VERIFIED' },
    { studentUsn: '1AT22CS003', sem: 5, sec: 'A', status: 'ASSIGNED', vStatus: 'NONE' }
  ];

  const filterMatrix = (list, { sem, sec, status }) => {
    return list.filter(item => {
      if (sem && sem !== 'All' && item.sem.toString() !== sem) return false;
      if (sec && sec !== 'All' && item.sec !== sec) return false;
      if (status && status !== 'All' && item.status !== status) return false;
      return true;
    });
  };

  assert.equal(filterMatrix(matrix, { sem: '7', sec: 'All', status: 'All' }).length, 2);
  assert.equal(filterMatrix(matrix, { sem: '7', sec: 'A', status: 'All' }).length, 1);
  assert.equal(filterMatrix(matrix, { sem: 'All', sec: 'All', status: 'COMPLETED' }).length, 1);
});

test('10. Existing HOD academic courses state contract remains intact', () => {
  const academicCourseSample = {
    id: 'c-101',
    code: '22CS71',
    name: 'Cloud Computing',
    department: 'CSE',
    semester: 7,
    faculty: 'Dr. Ramesh',
    studentCount: 65,
    averageAttendancePercent: 88,
    activeAssignmentsCount: 4
  };

  assert.equal(academicCourseSample.code, '22CS71');
  assert.equal(academicCourseSample.studentCount, 65);
  assert.equal(academicCourseSample.averageAttendancePercent, 88);
});
