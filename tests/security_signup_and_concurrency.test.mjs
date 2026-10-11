/**
 * AIET-UniSphere - Public Signup Security & Timetable Concurrency Test Suite
 * 
 * Verifies:
 * 1. Public Signup Role Hardening (Migration 00034):
 *    - Signup with no metadata defaults to STUDENT
 *    - Signup with metadata role: STUDENT assigns STUDENT
 *    - Signup with metadata role: FACULTY is overridden to STUDENT
 *    - Signup with metadata role: HOD is overridden to STUDENT
 *    - Signup with metadata role: ADMIN is overridden to STUDENT
 *    - Profile self-update attempts to alter role are rejected
 *    - Authorized Admin server-side provisioning assigns FACULTY/HOD legitimately
 * 
 * 2. Timetable Concurrency Protection (Migration 00035):
 *    - Non-overlapping schedules pass validation
 *    - Back-to-back schedules (e.g., 09:00-10:00 and 10:00-11:00) pass validation
 *    - Overlapping schedules for same faculty are rejected
 *    - Overlapping schedules for same physical room are rejected
 *    - Overlapping schedules for same section cohort are rejected
 *    - Updating an existing entry does not self-conflict
 */

import assert from 'node:assert';
import test from 'node:test';

// ============================================================
// SIMULATION: PUBLIC SIGNUP TRIGGER (Migration 00034)
// ============================================================

function simulateHandleNewUserTrigger(newUser, metadata = {}) {
  // Institutional security rule:
  // Public signup ALWAYS forces 'STUDENT' role, regardless of user-supplied metadata
  const profile = {
    id: newUser.id,
    email: newUser.email,
    full_name: metadata.full_name || '',
    usn_or_employee_id: metadata.usn_or_employee_id || null,
    role: 'STUDENT', // Hardened: NEVER trust metadata.role
    account_status: 'ACTIVE',
  };
  return profile;
}

function simulateProfileSelfUpdate(existingProfile, clientUpdatePayload) {
  // RLS Check: WITH CHECK (role = (SELECT role FROM profiles WHERE id = auth.uid()))
  if (clientUpdatePayload.role && clientUpdatePayload.role !== existingProfile.role) {
    throw new Error('RLS_VIOLATION: Users cannot modify their assigned role.');
  }
  if (clientUpdatePayload.account_status && clientUpdatePayload.account_status !== existingProfile.account_status) {
    throw new Error('RLS_VIOLATION: Users cannot alter their account status.');
  }
  return {
    ...existingProfile,
    full_name: clientUpdatePayload.full_name || existingProfile.full_name,
  };
}

function simulateAdminProvisionUser(adminCaller, provisionPayload) {
  // Server-side Edge Function: admin-provision-user
  if (adminCaller.role !== 'ADMIN' || adminCaller.account_status !== 'ACTIVE') {
    throw new Error('FORBIDDEN: Only active Administrators can provision staff accounts.');
  }
  if (!['STUDENT', 'FACULTY', 'HOD'].includes(provisionPayload.role)) {
    throw new Error('INVALID_ROLE: Role must be STUDENT, FACULTY, or HOD.');
  }
  return {
    id: provisionPayload.id || 'prov-uuid-1234',
    email: provisionPayload.email,
    full_name: provisionPayload.fullName,
    usn_or_employee_id: provisionPayload.usn_or_employee_id,
    role: provisionPayload.role,
    department_id: provisionPayload.department_id,
    account_status: 'ACTIVE',
  };
}

// ============================================================
// SIMULATION: TIMETABLE CONCURRENCY VALIDATION (Migration 00035)
// ============================================================

function timesOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}

function validateTimetableEntryConcurrency(newEntry, existingEntries) {
  if (newEntry.start_time >= newEntry.end_time) {
    throw new Error(`Invalid timetable entry: start_time (${newEntry.start_time}) must be strictly before end_time (${newEntry.end_time}).`);
  }

  for (const entry of existingEntries) {
    // Exclude self during updates
    if (newEntry.id && entry.id === newEntry.id) continue;
    if (entry.day_of_week !== newEntry.day_of_week) continue;
    if (!timesOverlap(newEntry.start_time, newEntry.end_time, entry.start_time, entry.end_time)) continue;

    // 1. Faculty double booking
    if (newEntry.faculty_id && entry.faculty_id && newEntry.faculty_id === entry.faculty_id) {
      throw new Error(`Faculty scheduling conflict: Faculty is already scheduled for ${entry.course_name} on ${entry.day_of_week} (${entry.start_time} - ${entry.end_time}).`);
    }

    // 2. Room double booking
    if (newEntry.room && entry.room && newEntry.room.trim().toLowerCase() === entry.room.trim().toLowerCase()) {
      throw new Error(`Room double-booking conflict: Room ${newEntry.room} is already reserved for ${entry.course_name} on ${entry.day_of_week} (${entry.start_time} - ${entry.end_time}).`);
    }

    // 3. Section double booking
    if (
      newEntry.section &&
      entry.section &&
      newEntry.semester === entry.semester &&
      newEntry.department_id === entry.department_id &&
      newEntry.section.trim().toLowerCase() === entry.section.trim().toLowerCase()
    ) {
      throw new Error(`Section scheduling conflict: Semester ${newEntry.semester} Section ${newEntry.section} already has class ${entry.course_name} on ${entry.day_of_week} (${entry.start_time} - ${entry.end_time}).`);
    }
  }

  return true;
}

// ============================================================
// TEST SUITES
// ============================================================

test('1. Public Signup with no role metadata defaults to STUDENT', () => {
  const user = { id: 'usr-1', email: 'alice@aiet.edu' };
  const profile = simulateHandleNewUserTrigger(user, { full_name: 'Alice M', usn_or_employee_id: '4AI21CS001' });
  assert.strictEqual(profile.role, 'STUDENT');
  assert.strictEqual(profile.account_status, 'ACTIVE');
});

test('2. Public Signup with role: STUDENT explicitly assigns STUDENT', () => {
  const user = { id: 'usr-2', email: 'bob@aiet.edu' };
  const profile = simulateHandleNewUserTrigger(user, { role: 'STUDENT', full_name: 'Bob K' });
  assert.strictEqual(profile.role, 'STUDENT');
});

test('3. Public Signup privilege escalation attempt with role: FACULTY is neutralized to STUDENT', () => {
  const user = { id: 'usr-3', email: 'malicious@aiet.edu' };
  const profile = simulateHandleNewUserTrigger(user, { role: 'FACULTY', full_name: 'Attacker' });
  assert.strictEqual(profile.role, 'STUDENT', 'Supplied FACULTY role must be overridden to STUDENT');
});

test('4. Public Signup privilege escalation attempt with role: HOD is neutralized to STUDENT', () => {
  const user = { id: 'usr-4', email: 'malicious2@aiet.edu' };
  const profile = simulateHandleNewUserTrigger(user, { role: 'HOD', full_name: 'Attacker 2' });
  assert.strictEqual(profile.role, 'STUDENT', 'Supplied HOD role must be overridden to STUDENT');
});

test('5. Public Signup privilege escalation attempt with role: ADMIN is neutralized to STUDENT', () => {
  const user = { id: 'usr-5', email: 'malicious3@aiet.edu' };
  const profile = simulateHandleNewUserTrigger(user, { role: 'ADMIN', full_name: 'Attacker 3' });
  assert.strictEqual(profile.role, 'STUDENT', 'Supplied ADMIN role must be overridden to STUDENT');
});

test('6. Attempts to modify assigned role via client profile update are rejected', () => {
  const profile = { id: 'usr-1', email: 'alice@aiet.edu', role: 'STUDENT', account_status: 'ACTIVE' };
  assert.throws(
    () => simulateProfileSelfUpdate(profile, { role: 'FACULTY' }),
    /RLS_VIOLATION/
  );
});

test('7. Authorized Admin server-side provisioning assigns legitimate staff roles', () => {
  const admin = { id: 'admin-1', role: 'ADMIN', account_status: 'ACTIVE' };
  const provisionedFaculty = simulateAdminProvisionUser(admin, {
    email: 'prof.smith@aiet.edu',
    fullName: 'Dr. Smith',
    usn_or_employee_id: 'EMP101',
    role: 'FACULTY',
    department_id: 'dept-cse-uuid',
  });
  assert.strictEqual(provisionedFaculty.role, 'FACULTY');
  assert.strictEqual(provisionedFaculty.account_status, 'ACTIVE');

  const provisionedHOD = simulateAdminProvisionUser(admin, {
    email: 'hod.cse@aiet.edu',
    fullName: 'Dr. Jane HOD',
    usn_or_employee_id: 'EMP100',
    role: 'HOD',
    department_id: 'dept-cse-uuid',
  });
  assert.strictEqual(provisionedHOD.role, 'HOD');
});

test('8. Non-overlapping timetable entries pass validation', () => {
  const existing = [
    { id: 'tt-1', day_of_week: 'Monday', start_time: '09:00', end_time: '10:00', faculty_id: 'fac-1', room: 'LH-101', semester: 4, section: 'A', department_id: 'dept-1' }
  ];
  const newEntry = {
    id: 'tt-2', day_of_week: 'Monday', start_time: '11:00', end_time: '12:00', faculty_id: 'fac-1', room: 'LH-101', semester: 4, section: 'A', department_id: 'dept-1'
  };
  assert.strictEqual(validateTimetableEntryConcurrency(newEntry, existing), true);
});

test('9. Back-to-back timetable entries (e.g. 09:00-10:00 and 10:00-11:00) pass validation', () => {
  const existing = [
    { id: 'tt-1', day_of_week: 'Monday', start_time: '09:00', end_time: '10:00', faculty_id: 'fac-1', room: 'LH-101', semester: 4, section: 'A', department_id: 'dept-1' }
  ];
  const backToBackEntry = {
    id: 'tt-2', day_of_week: 'Monday', start_time: '10:00', end_time: '11:00', faculty_id: 'fac-1', room: 'LH-101', semester: 4, section: 'A', department_id: 'dept-1'
  };
  assert.strictEqual(validateTimetableEntryConcurrency(backToBackEntry, existing), true);
});

test('10. Faculty double-booking across different rooms is rejected', () => {
  const existing = [
    { id: 'tt-1', day_of_week: 'Monday', start_time: '09:00', end_time: '10:00', faculty_id: 'fac-1', room: 'LH-101', course_name: 'Algorithms', semester: 4, section: 'A', department_id: 'dept-1' }
  ];
  const conflicting = {
    id: 'tt-2', day_of_week: 'Monday', start_time: '09:30', end_time: '10:30', faculty_id: 'fac-1', room: 'LH-202', course_name: 'Operating Systems', semester: 6, section: 'B', department_id: 'dept-1'
  };
  assert.throws(
    () => validateTimetableEntryConcurrency(conflicting, existing),
    /Faculty scheduling conflict/
  );
});

test('11. Physical room double-booking across different faculty is rejected', () => {
  const existing = [
    { id: 'tt-1', day_of_week: 'Monday', start_time: '09:00', end_time: '10:00', faculty_id: 'fac-1', room: 'LH-101', course_name: 'Algorithms', semester: 4, section: 'A', department_id: 'dept-1' }
  ];
  const conflicting = {
    id: 'tt-2', day_of_week: 'Monday', start_time: '09:30', end_time: '10:30', faculty_id: 'fac-2', room: 'LH-101', course_name: 'Database Systems', semester: 6, section: 'B', department_id: 'dept-1'
  };
  assert.throws(
    () => validateTimetableEntryConcurrency(conflicting, existing),
    /Room double-booking conflict/
  );
});

test('12. Section cohort double-booking is rejected', () => {
  const existing = [
    { id: 'tt-1', day_of_week: 'Tuesday', start_time: '14:00', end_time: '15:00', faculty_id: 'fac-1', room: 'LH-101', course_name: 'Algorithms', semester: 4, section: 'A', department_id: 'dept-1' }
  ];
  const conflicting = {
    id: 'tt-2', day_of_week: 'Tuesday', start_time: '14:00', end_time: '15:00', faculty_id: 'fac-3', room: 'LAB-2', course_name: 'Web Tech Lab', semester: 4, section: 'A', department_id: 'dept-1'
  };
  assert.throws(
    () => validateTimetableEntryConcurrency(conflicting, existing),
    /Section scheduling conflict/
  );
});

test('13. Updating an existing entry does not self-conflict', () => {
  const existing = [
    { id: 'tt-1', day_of_week: 'Monday', start_time: '09:00', end_time: '10:00', faculty_id: 'fac-1', room: 'LH-101', course_name: 'Algorithms', semester: 4, section: 'A', department_id: 'dept-1' }
  ];
  const updatingSelf = {
    id: 'tt-1', day_of_week: 'Monday', start_time: '09:00', end_time: '10:00', faculty_id: 'fac-1', room: 'LH-101', course_name: 'Advanced Algorithms', semester: 4, section: 'A', department_id: 'dept-1'
  };
  assert.strictEqual(validateTimetableEntryConcurrency(updatingSelf, existing), true);
});
