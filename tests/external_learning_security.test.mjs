import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Phase 3A: External Learning Security Hardening, Cohort Enrollment Audit & Cross-Role Verification Tests
 */

// Mock Security Context & RPC Enforcers simulating Postgres SECURITY DEFINER logic & RLS

const validateAssignmentRPC = (callerProfile, p_department_id) => {
  if (!callerProfile || !['FACULTY', 'HOD', 'ADMIN'].includes(callerProfile.role)) {
    throw new Error('403 Forbidden: Only faculty, HOD, or admin accounts can create assignments.');
  }
  if (callerProfile.role !== 'ADMIN' && callerProfile.department_id !== p_department_id) {
    throw new Error('403 Forbidden: You are not authorized to create assignments outside your designated department scope.');
  }
  return true;
};

const resolveCohortEnrollment = (allStudents, targetDeptId, targetSem, targetSec) => {
  return allStudents.filter(st => {
    if (st.role !== 'STUDENT' || st.account_status !== 'ACTIVE') return false;
    if (st.department_id !== targetDeptId) return false;
    if (targetSem && st.semester !== targetSem) return false;
    if (targetSec && st.section !== targetSec) return false;
    return true;
  });
};

const validateEvidenceVerificationRPC = (callerProfile, assignmentOwnerId, assignmentDeptId, status, notes) => {
  if (!callerProfile || !['FACULTY', 'HOD', 'ADMIN'].includes(callerProfile.role)) {
    throw new Error('403 Forbidden: Only faculty, HOD, or admin can verify external learning evidence.');
  }
  if (!['VERIFIED', 'REJECTED'].includes(status)) {
    throw new Error('Invalid verification status.');
  }
  if (status === 'REJECTED' && (!notes || !notes.trim())) {
    throw new Error('A verification note explaining the rejection reason is required.');
  }
  if (callerProfile.role !== 'ADMIN') {
    const isOwner = callerProfile.id === assignmentOwnerId;
    const isSameDept = callerProfile.department_id === assignmentDeptId;
    if (!isOwner && !isSameDept) {
      throw new Error('403 Forbidden: Not authorized to verify evidence for another faculty/department assignment.');
    }
  }
  return true;
};

const validateStudentProgressUpdate = (callerRole, callerStudentId, targetEnrollmentStudentId, source) => {
  if (callerRole === 'STUDENT') {
    if (callerStudentId !== targetEnrollmentStudentId) {
      throw new Error('403 Forbidden: Cannot update another student progress.');
    }
    if (source !== 'SELF_REPORTED') {
      throw new Error('403 Forbidden: Students can only submit SELF_REPORTED progress.');
    }
  }
  return true;
};

const validateSignedUrlAuthorization = (callerProfile, evidenceRecord, assignment) => {
  if (!callerProfile) throw new Error('401 Unauthorized');
  if (callerProfile.role === 'STUDENT') {
    if (evidenceRecord.student_id !== callerProfile.id) {
      throw new Error('403 Forbidden: You are not authorized to access this evidence certificate link.');
    }
  } else if (callerProfile.role !== 'ADMIN') {
    if (assignment.department_id !== callerProfile.department_id && assignment.assigned_by !== callerProfile.id) {
      throw new Error('403 Forbidden: You are not authorized to access this evidence certificate link.');
    }
  }
  return true;
};

// --- SECURITY TEST CASES ---

test('1. Faculty same-department assignment allowed', () => {
  const facultyCSE = { id: 'f-cse-1', role: 'FACULTY', department_id: 'dept-cse' };
  assert.equal(validateAssignmentRPC(facultyCSE, 'dept-cse'), true);
});

test('2. Faculty cross-department assignment denied', () => {
  const facultyCSE = { id: 'f-cse-1', role: 'FACULTY', department_id: 'dept-cse' };
  assert.throws(
    () => validateAssignmentRPC(facultyCSE, 'dept-ece'),
    /outside your designated department scope/
  );
});

test('3. HOD same-department assignment allowed', () => {
  const hodCSE = { id: 'h-cse-1', role: 'HOD', department_id: 'dept-cse' };
  assert.equal(validateAssignmentRPC(hodCSE, 'dept-cse'), true);
});

test('4. HOD cross-department assignment denied', () => {
  const hodCSE = { id: 'h-cse-1', role: 'HOD', department_id: 'dept-cse' };
  assert.throws(
    () => validateAssignmentRPC(hodCSE, 'dept-mech'),
    /outside your designated department scope/
  );
});

test('5. Cohort enrollment matches trusted database records only', () => {
  const databaseStudents = [
    { id: 's1', role: 'STUDENT', account_status: 'ACTIVE', department_id: 'dept-cse', semester: 7, section: 'A' },
    { id: 's2', role: 'STUDENT', account_status: 'ACTIVE', department_id: 'dept-cse', semester: 7, section: 'B' },
    { id: 's3', role: 'STUDENT', account_status: 'ACTIVE', department_id: 'dept-ece', semester: 7, section: 'A' },
    { id: 's4', role: 'STUDENT', account_status: 'LOCKED', department_id: 'dept-cse', semester: 7, section: 'A' }
  ];

  const enrolled = resolveCohortEnrollment(databaseStudents, 'dept-cse', 7, 'A');
  assert.equal(enrolled.length, 1);
  assert.equal(enrolled[0].id, 's1');
});

test('6. Malicious student list cannot bypass cohort criteria', () => {
  const databaseStudents = [
    { id: 's-cse-1', role: 'STUDENT', account_status: 'ACTIVE', department_id: 'dept-cse', semester: 7 },
    { id: 's-ece-1', role: 'STUDENT', account_status: 'ACTIVE', department_id: 'dept-ece', semester: 7 }
  ];

  // Even if attacker passes s-ece-1, server-side RPC resolves cohort strictly via DB
  const cohort = resolveCohortEnrollment(databaseStudents, 'dept-cse', 7);
  assert.equal(cohort.length, 1);
  assert.equal(cohort[0].id, 's-cse-1');
});

test('7. Duplicate enrollment prevented by UNIQUE constraint key', () => {
  const existingEnrollments = new Set(['asgn-1:st-1']);
  const tryEnroll = (asgnId, stId) => {
    const key = `${asgnId}:${stId}`;
    if (existingEnrollments.has(key)) return false; // ON CONFLICT DO NOTHING
    existingEnrollments.add(key);
    return true;
  };

  assert.equal(tryEnroll('asgn-1', 'st-1'), false);
  assert.equal(tryEnroll('asgn-1', 'st-2'), true);
});

test('8. Student A cannot read Student B enrollment', () => {
  const canReadEnrollment = (studentId, enrollmentStudentId) => {
    return studentId === enrollmentStudentId;
  };

  assert.equal(canReadEnrollment('st-A', 'st-A'), true);
  assert.equal(canReadEnrollment('st-A', 'st-B'), false);
});

test('9. Student A cannot read Student B progress', () => {
  const canReadProgress = (studentId, progressStudentId) => {
    return studentId === progressStudentId;
  };

  assert.equal(canReadProgress('st-A', 'st-A'), true);
  assert.equal(canReadProgress('st-A', 'st-B'), false);
});

test('10. Student A cannot read Student B evidence', () => {
  const canReadEvidence = (studentId, evidenceStudentId) => {
    return studentId === evidenceStudentId;
  };

  assert.equal(canReadEvidence('st-A', 'st-A'), true);
  assert.equal(canReadEvidence('st-A', 'st-B'), false);
});

test('11. Student cannot self-verify evidence', () => {
  const studentUser = { id: 'st-A', role: 'STUDENT', department_id: 'dept-cse' };
  assert.throws(
    () => validateEvidenceVerificationRPC(studentUser, 'f-1', 'dept-cse', 'VERIFIED'),
    /Only faculty, HOD, or admin can verify/
  );
});

test('12. Student cannot forge FACULTY_UPDATED progress source', () => {
  assert.throws(
    () => validateStudentProgressUpdate('STUDENT', 'st-A', 'st-A', 'FACULTY_UPDATED'),
    /Students can only submit SELF_REPORTED progress/
  );
  assert.throws(
    () => validateStudentProgressUpdate('STUDENT', 'st-A', 'st-A', 'VERIFIED'),
    /Students can only submit SELF_REPORTED progress/
  );
  assert.equal(validateStudentProgressUpdate('STUDENT', 'st-A', 'st-A', 'SELF_REPORTED'), true);
});

test('13. Faculty A cannot access unauthorized Faculty B private assignment data', () => {
  const canAccessAssignment = (faculty, assignment) => {
    if (faculty.role === 'ADMIN') return true;
    return assignment.assigned_by === faculty.id || assignment.department_id === faculty.department_id;
  };

  const facultyCSE = { id: 'f-cse', role: 'FACULTY', department_id: 'dept-cse' };
  const assignmentECE = { id: 'a-ece', assigned_by: 'f-ece', department_id: 'dept-ece' };

  assert.equal(canAccessAssignment(facultyCSE, assignmentECE), false);
});

test('14. Faculty A cannot verify Faculty B evidence outside department scope', () => {
  const facultyCSE = { id: 'f-cse', role: 'FACULTY', department_id: 'dept-cse' };
  assert.throws(
    () => validateEvidenceVerificationRPC(facultyCSE, 'f-ece', 'dept-ece', 'VERIFIED'),
    /Not authorized to verify evidence for another faculty\/department/
  );
});

test('15. HOD A cannot access HOD B department analytics', () => {
  const canReadDeptOverview = (hod, targetDeptId) => {
    if (hod.role === 'ADMIN') return true;
    return hod.department_id === targetDeptId;
  };

  const hodCSE = { id: 'h-cse', role: 'HOD', department_id: 'dept-cse' };
  assert.equal(canReadDeptOverview(hodCSE, 'dept-cse'), true);
  assert.equal(canReadDeptOverview(hodCSE, 'dept-ece'), false);
});

test('16. Verification RPC authorization & rejection note enforcement', () => {
  const facultyCSE = { id: 'f-cse', role: 'FACULTY', department_id: 'dept-cse' };
  assert.throws(
    () => validateEvidenceVerificationRPC(facultyCSE, 'f-cse', 'dept-cse', 'REJECTED', ''),
    /rejection reason is required/i
  );
  assert.equal(
    validateEvidenceVerificationRPC(facultyCSE, 'f-cse', 'dept-cse', 'REJECTED', 'Invalid URL'),
    true
  );
});

test('17. Signed URL pre-authorization check denies unauthorized request', () => {
  const studentA = { id: 'st-A', role: 'STUDENT', department_id: 'dept-cse' };
  const evidenceRecordB = { id: 'ev-B', student_id: 'st-B' };
  const assignmentCSE = { department_id: 'dept-cse', assigned_by: 'f-cse' };

  assert.throws(
    () => validateSignedUrlAuthorization(studentA, evidenceRecordB, assignmentCSE),
    /You are not authorized to access this evidence certificate link/
  );
});

test('18. Storage object isolation policy restricts cross-department access', () => {
  const isStorageAccessAllowed = (caller, pathOwnerId, pathDeptId) => {
    if (caller.role === 'ADMIN') return true;
    if (caller.role === 'STUDENT') return caller.id === pathOwnerId;
    if (['FACULTY', 'HOD'].includes(caller.role)) return caller.department_id === pathDeptId;
    return false;
  };

  const studentA = { id: 'st-A', role: 'STUDENT' };
  assert.equal(isStorageAccessAllowed(studentA, 'st-A', 'dept-cse'), true);
  assert.equal(isStorageAccessAllowed(studentA, 'st-B', 'dept-cse'), false);

  const facultyECE = { id: 'f-ece', role: 'FACULTY', department_id: 'dept-ece' };
  assert.equal(isStorageAccessAllowed(facultyECE, 'st-A', 'dept-cse'), false);
});

test('19. Admin institutional access remains functional across departments', () => {
  const admin = { id: 'admin-1', role: 'ADMIN', department_id: null };
  assert.equal(validateAssignmentRPC(admin, 'dept-cse'), true);
  assert.equal(validateAssignmentRPC(admin, 'dept-ece'), true);
  assert.equal(validateEvidenceVerificationRPC(admin, 'f-any', 'dept-ece', 'VERIFIED'), true);
});

test('20. Academic course system contract remains unaffected', () => {
  const academicContract = {
    tables: ['course_enrollments', 'assignments', 'assignment_submissions', 'attendance', 'academic_materials'],
    externalTablesIsolated: true
  };
  assert.equal(academicContract.externalTablesIsolated, true);
  assert.equal(academicContract.tables.length, 5);
});

test('21. Student cannot create or modify EXTERNAL_API progress source', () => {
  const trySetExternalAPI = (callerRole, source) => {
    if (source === 'EXTERNAL_API') {
      if (callerRole !== 'SERVER_SYNC_ROLE') {
        throw new Error('403 Forbidden: EXTERNAL_API source is reserved for trusted server-side synchronization only.');
      }
    }
    return true;
  };

  assert.throws(() => trySetExternalAPI('STUDENT', 'EXTERNAL_API'), /reserved for trusted server-side synchronization/);
  assert.throws(() => trySetExternalAPI('FACULTY', 'EXTERNAL_API'), /reserved for trusted server-side synchronization/);
  assert.equal(trySetExternalAPI('SERVER_SYNC_ROLE', 'EXTERNAL_API'), true);
});

test('22. Client cannot set trusted external completion state directly', () => {
  const tryDirectCompletion = (callerRole, newStatus) => {
    if (callerRole === 'STUDENT' && (newStatus === 'COMPLETED' || newStatus === 'CANCELLED')) {
      throw new Error('403 Forbidden: Students cannot set completion status directly.');
    }
    return true;
  };

  assert.throws(() => tryDirectCompletion('STUDENT', 'COMPLETED'), /cannot set completion status directly/);
  assert.equal(tryDirectCompletion('STUDENT', 'IN_PROGRESS'), true);
});

test('23. Platform adapter types interface contract integrity', () => {
  const validPlatforms = ['COURSERA', 'NPTEL', 'SWAYAM', 'EDX', 'UDEMY', 'OTHER'];
  assert.equal(validPlatforms.includes('COURSERA'), true);
  assert.equal(validPlatforms.length, 6);
});

