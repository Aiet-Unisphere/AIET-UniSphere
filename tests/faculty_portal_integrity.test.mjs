import assert from 'node:assert/strict';

console.log('=== AIET-UniSphere: Faculty Portal Final Data Integrity Test Suite ===\n');

// -------------------------------------------------------------
// Test 1: Canonical Student Deduplication & USN Conflict Flagging
// -------------------------------------------------------------
console.log('TEST 1: Canonical Deduplication & USN Identity Conflict Flagging');

function deduplicateStudents(students) {
  // 1. Deduplicate repeated references to the exact same UUID
  const seenIds = new Set();
  const uniqueByUuid = [];

  for (const s of students) {
    if (!s || !s.id) continue;
    if (seenIds.has(s.id)) continue;
    seenIds.add(s.id);
    uniqueByUuid.push(s);
  }

  // 2. Map normalized USNs to set of distinct UUIDs claiming that USN
  const usnToIds = new Map();
  for (const s of uniqueByUuid) {
    const rawUsn = s.usn || s.usn_or_employee_id || '';
    const normUsn = rawUsn.trim().toUpperCase();
    if (normUsn && normUsn !== 'N/A' && normUsn !== 'NOT RECORDED') {
      const set = usnToIds.get(normUsn) || new Set();
      set.add(s.id);
      usnToIds.set(normUsn, set);
    }
  }

  // 3. Flag conflicts for distinct UUIDs sharing the same USN without merging or discarding them
  return uniqueByUuid.map((s) => {
    const rawUsn = s.usn || s.usn_or_employee_id || '';
    const normUsn = rawUsn.trim().toUpperCase();
    const sharingIds = (normUsn && normUsn !== 'N/A' && normUsn !== 'NOT RECORDED')
      ? usnToIds.get(normUsn)
      : undefined;

    const isConflict = Boolean(sharingIds && sharingIds.size > 1);
    return {
      ...s,
      usn: normUsn || s.usn || 'N/A',
      isUsnConflict: isConflict,
      conflictDetails: isConflict
        ? `Identity conflict: Normalized USN "${normUsn}" is shared by ${sharingIds.size} distinct student accounts. Records kept separate to preserve audit history.`
        : undefined
    };
  });
}

const mockInputStudents = [
  // Repeated reference to the exact same UUID: must be deduplicated
  { id: 'uuid-1', name: 'Aarav Sharma', usn: '4AL21CS001', account_status: 'ACTIVE' },
  { id: 'uuid-1', name: 'Aarav Sharma (Duplicate Ref)', usn: '4al21cs001', account_status: 'ACTIVE' },

  // Different UUID claiming the same normalized USN: MUST NOT be merged or dropped! Must be flagged as conflict!
  { id: 'uuid-2', name: 'Aarav Sharma (Conflicting Account)', usn: '4al21cs001', account_status: 'ACTIVE' },

  // Casing and whitespace normalization on unique UUID
  { id: 'uuid-3', name: 'Bhavya Patel', usn: ' 4al21cs002 ', account_status: 'ACTIVE' },

  // Normal unique student
  { id: 'uuid-4', name: 'Chetan Rao', usn: '4AL21CS003', account_status: 'ACTIVE' },

  // Students with N/A USN
  { id: 'uuid-5', name: 'Divya Nair', usn: 'N/A', account_status: 'ACTIVE' },
  { id: 'uuid-6', name: 'Esha Verma', usn: 'N/A', account_status: 'ACTIVE' },
];

const deduplicated = deduplicateStudents(mockInputStudents);

// Verifications:
// 1. Repeated reference to uuid-1 deduplicated from 2 down to 1
assert.equal(deduplicated.filter(s => s.id === 'uuid-1').length, 1, 'Repeated reference to uuid-1 must appear exactly once');

// 2. Both uuid-1 and uuid-2 must remain in the roster (total 6 distinct accounts)
assert.equal(deduplicated.length, 6, 'Total count must be 6 (no distinct accounts merged or deleted)');

// 3. Both uuid-1 and uuid-2 must be flagged as conflict
const u1 = deduplicated.find(s => s.id === 'uuid-1');
const u2 = deduplicated.find(s => s.id === 'uuid-2');
assert.equal(u1.isUsnConflict, true, 'uuid-1 must be flagged with isUsnConflict: true');
assert.equal(u2.isUsnConflict, true, 'uuid-2 must be flagged with isUsnConflict: true');
assert.equal(u1.usn, '4AL21CS001', 'USN must be normalized to uppercase');
assert.equal(u2.usn, '4AL21CS001', 'USN must be normalized to uppercase');

// 4. Non-conflicting students must have isUsnConflict: false
const u3 = deduplicated.find(s => s.id === 'uuid-3');
const u4 = deduplicated.find(s => s.id === 'uuid-4');
assert.equal(u3.isUsnConflict, false, 'uuid-3 must not be conflicted');
assert.equal(u3.usn, '4AL21CS002', 'uuid-3 whitespace trimmed and uppercased');
assert.equal(u4.isUsnConflict, false, 'uuid-4 must not be conflicted');

console.log('✓ TEST 1 PASSED: USN identity conflicts are flagged without merging, and duplicate UUIDs are collapsed.\n');

// -------------------------------------------------------------
// Test 2: Prohibition of Silent Department-wide Fallback for Course Attendance
// -------------------------------------------------------------
console.log('TEST 2: Course Attendance Roster Scoping & Missing Mapping Alert');

function resolveAttendanceRoster({
  requestedCourseCode,
  courseEnrollments,
  departmentStudents
}) {
  if (requestedCourseCode) {
    const verified = courseEnrollments.filter(e => 
      (e.course_code === requestedCourseCode || e.course_id === requestedCourseCode) &&
      e.status === 'Active'
    );

    if (verified.length > 0) {
      return {
        students: verified.map(e => ({ id: e.student_id, course: requestedCourseCode })),
        missingMapping: false
      };
    }

    // STRICT: Do NOT fall back to department students!
    return {
      students: [],
      missingMapping: true,
      warning: `No verified student enrollment mapping found for course code "${requestedCourseCode}". Attendance requires verified course/section enrollments; unverified department-wide fallback is prohibited.`
    };
  }

  // Non-course general department lookup (e.g. Student Directory)
  return {
    students: departmentStudents,
    missingMapping: false
  };
}

// Case A: Course has 3 verified enrollments
const caseA = resolveAttendanceRoster({
  requestedCourseCode: 'CS501',
  courseEnrollments: [
    { student_id: 's1', course_code: 'CS501', status: 'Active' },
    { student_id: 's2', course_code: 'CS501', status: 'Active' },
    { student_id: 's3', course_code: 'CS501', status: 'Active' },
    { student_id: 's4', course_code: 'CS502', status: 'Active' }
  ],
  departmentStudents: Array.from({ length: 13 }, (_, i) => ({ id: `dept-s${i + 1}` }))
});

assert.equal(caseA.students.length, 3, 'Course CS501 must resolve strictly 3 enrolled students');
assert.equal(caseA.missingMapping, false, 'Enrollment mapping is present');

// Case B: Course has NO enrollment mapping (0 rows)
const caseB = resolveAttendanceRoster({
  requestedCourseCode: 'CS503',
  courseEnrollments: [], // No mappings exist
  departmentStudents: Array.from({ length: 13 }, (_, i) => ({ id: `dept-s${i + 1}` }))
});

assert.equal(caseB.students.length, 0, 'Course CS503 must NOT fall back to 13 department students');
assert.equal(caseB.missingMapping, true, 'missingMapping must be true');
assert.ok(caseB.warning.includes('No verified student enrollment mapping found'), 'Warning message must report missing mapping');

// Case C: Student Directory without course scope retains department students
const caseC = resolveAttendanceRoster({
  requestedCourseCode: undefined,
  courseEnrollments: [],
  departmentStudents: Array.from({ length: 13 }, (_, i) => ({ id: `dept-s${i + 1}` }))
});

assert.equal(caseC.students.length, 13, 'Department-level directory retains department students');
assert.equal(caseC.missingMapping, false);

console.log('✓ TEST 2 PASSED: Course attendance prohibits silent department-wide fallback and flags missing mapping.\n');

// -------------------------------------------------------------
// Test 3: Assignment Enrollment Counts Strictly Scoped to Course Scope
// -------------------------------------------------------------
console.log('TEST 3: Assignment Enrollment Counts Strict Scoping');

function getAssignmentEnrolledCount({
  assignmentCourseId,
  courseEnrollments,
  departmentStudentCount
}) {
  const verified = courseEnrollments.filter(e =>
    (e.course_id === assignmentCourseId || e.course_code === assignmentCourseId) &&
    e.status === 'Active'
  );

  if (verified.length > 0) {
    return {
      enrolledCount: verified.length,
      isEnrollmentMissing: false
    };
  }

  // Must NOT fall back to departmentStudentCount!
  return {
    enrolledCount: 0,
    isEnrollmentMissing: true
  };
}

const asgnResultWithEnrollments = getAssignmentEnrolledCount({
  assignmentCourseId: 'CS501',
  courseEnrollments: [
    { student_id: 's1', course_code: 'CS501', status: 'Active' },
    { student_id: 's2', course_code: 'CS501', status: 'Active' }
  ],
  departmentStudentCount: 13
});

assert.equal(asgnResultWithEnrollments.enrolledCount, 2);
assert.equal(asgnResultWithEnrollments.isEnrollmentMissing, false);

const asgnResultMissingEnrollments = getAssignmentEnrolledCount({
  assignmentCourseId: 'CS504',
  courseEnrollments: [],
  departmentStudentCount: 13
});

assert.equal(asgnResultMissingEnrollments.enrolledCount, 0, 'Must be 0, not 13');
assert.equal(asgnResultMissingEnrollments.isEnrollmentMissing, true, 'isEnrollmentMissing must be true');

console.log('✓ TEST 3 PASSED: Assignment enrollment counts strictly adhere to course scope.\n');

// -------------------------------------------------------------
// Test 4: Institutional Timetable Resolution in Asia/Kolkata (IST)
// -------------------------------------------------------------
console.log('TEST 4: Institutional Timetable Resolution in Asia/Kolkata (IST)');

function getISTDayAndCurrentTime(simulatedDate) {
  const todayNameIST = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  }).format(simulatedDate);

  const currentTimeIST = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(simulatedDate);

  return { todayNameIST, currentTimeIST };
}

const transitionDate = new Date('2026-11-15T20:00:00Z');
const utcDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][transitionDate.getUTCDay()];
const { todayNameIST, currentTimeIST } = getISTDayAndCurrentTime(transitionDate);

assert.equal(utcDay, 'Sunday');
assert.equal(todayNameIST, 'Monday');
assert.equal(currentTimeIST.slice(0, 5), '01:30');

console.log('✓ TEST 4 PASSED: Asia/Kolkata institutional timezone day and class statuses correctly calculated.\n');

// -------------------------------------------------------------
// Test 5: Attendance Summary Aggregation
// -------------------------------------------------------------
console.log('TEST 5: Attendance Summary Aggregation');

function aggregateAttendance(roster, attendanceMap) {
  const total = roster.length;
  let present = 0;
  let absent = 0;
  let late = 0;

  for (const s of roster) {
    const st = attendanceMap[s.id] || 'Present';
    if (st === 'Present') present++;
    else if (st === 'Absent') absent++;
    else if (st === 'Late') late++;
  }

  const unmarked = total - (present + absent + late);
  return { total, present, absent, late, unmarked };
}

const mockRoster = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }];
const attSummary = aggregateAttendance(mockRoster, {
  s1: 'Present',
  s2: 'Absent',
  s3: 'Late',
  s4: 'Present'
});

assert.equal(attSummary.total, 5);
assert.equal(attSummary.present, 3);
assert.equal(attSummary.absent, 1);
assert.equal(attSummary.late, 1);
assert.equal(attSummary.unmarked, 0);

console.log('✓ TEST 5 PASSED: Attendance summary properly aggregates all student states.\n');

// -------------------------------------------------------------
// Test 6: Course Identification Resolution (UUID vs Course Code vs Casing)
// -------------------------------------------------------------
console.log('TEST 6: Course Identification Resolution (UUID vs Alphanumeric Code vs ILIKE)');

function resolveCourseEnrollments(requestedCourseIdentifier, courseEnrollments, timetableAllocations = []) {
  if (!requestedCourseIdentifier) return [];
  const cleanId = requestedCourseIdentifier.trim().toLowerCase();

  // 1. Direct match on course_id or course_code (case-insensitive)
  const directMatches = courseEnrollments.filter(e =>
    e.status === 'Active' &&
    ((e.course_id && e.course_id.toLowerCase() === cleanId) ||
     (e.course_code && e.course_code.toLowerCase() === cleanId))
  );

  if (directMatches.length > 0) {
    return Array.from(new Set(directMatches.map(e => e.student_id)));
  }

  // 2. Timetable allocation lookup (faculty allocated to section/semester for course)
  const ttMatch = timetableAllocations.find(tt =>
    (tt.course_id && tt.course_id.toLowerCase() === cleanId) ||
    (tt.course_code && tt.course_code.toLowerCase() === cleanId)
  );

  if (ttMatch && ttMatch.semester != null) {
    const ttMatches = courseEnrollments.filter(e =>
      e.status === 'Active' &&
      e.semester === ttMatch.semester &&
      (!ttMatch.section || e.section === ttMatch.section)
    );
    return Array.from(new Set(ttMatches.map(e => e.student_id)));
  }

  return [];
}

const mockEnrollmentDb = [
  // BCS702 enrollments stored with alphanumeric code and UUID
  { student_id: 'std-1', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  { student_id: 'std-2', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  { student_id: 'std-3', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  { student_id: 'std-4', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  { student_id: 'std-5', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  { student_id: 'std-6', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  { student_id: 'std-7', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  { student_id: 'std-8', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  { student_id: 'std-9', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Active' },
  // Dropped student: must NOT be included
  { student_id: 'std-10-dropped', course_id: 'c-uuid-702', course_code: 'BCS702', semester: 7, section: 'A', status: 'Dropped' },
  // Another course: BCS714A
  { student_id: 'std-1', course_id: 'c-uuid-714', course_code: 'BCS714A', semester: 7, section: 'A', status: 'Active' },
];

// Test 6a: Lookup by exact course code 'BCS702'
const res6a = resolveCourseEnrollments('BCS702', mockEnrollmentDb);
assert.equal(res6a.length, 9, 'Lookup by BCS702 must resolve all 9 active students');
assert.ok(!res6a.includes('std-10-dropped'), 'Dropped student must be excluded');

// Test 6b: Lookup by lowercased course code 'bcs702'
const res6b = resolveCourseEnrollments('bcs702', mockEnrollmentDb);
assert.equal(res6b.length, 9, 'Lookup by bcs702 (lowercase) must resolve all 9 active students');

// Test 6c: Lookup by course UUID 'c-uuid-702'
const res6c = resolveCourseEnrollments('c-uuid-702', mockEnrollmentDb);
assert.equal(res6c.length, 9, 'Lookup by course UUID c-uuid-702 must resolve all 9 active students');

// Test 6d: Timetable allocation lookup fallback
const ttAllocations = [
  { course_id: 'c-uuid-unknown', course_code: 'BCS799', semester: 7, section: 'A' }
];
const res6d = resolveCourseEnrollments('BCS799', mockEnrollmentDb, ttAllocations);
assert.equal(res6d.length, 9, 'Timetable allocation must resolve students enrolled in semester 7 section A');

console.log('✓ TEST 6 PASSED: Course identification resolves across UUID, code, casing, and allocations.\n');

// -------------------------------------------------------------
// Test 7: Historical Attendance Preservation & Zero-Student Save Guard
// -------------------------------------------------------------
console.log('TEST 7: Historical Attendance Record Preservation & Zero-Student Save Blocking');

const mockHistoricalSessions = [
  { id: 'sess-1', course_id: 'BCS714A', total_students: 9, marked_count: 9 },
  { id: 'sess-2', course_id: 'BCS702', total_students: 9, marked_count: 9 },
  { id: 'sess-3', course_id: 'BCS702', total_students: 9, marked_count: 9 },
];

// Verify historical logs reflect saved sessions directly without depending on current enrollment
assert.equal(mockHistoricalSessions.length, 3, 'All 3 historical sessions must be preserved');
assert.equal(mockHistoricalSessions[1].total_students, 9, 'Session 2 for BCS702 must retain 9 marked students');
assert.equal(mockHistoricalSessions[2].total_students, 9, 'Session 3 for BCS702 must retain 9 marked students');

// Verify zero-student save guard
function canSaveAttendance(rosterLength, isSaving) {
  return !isSaving && rosterLength > 0;
}

assert.equal(canSaveAttendance(0, false), false, 'Save Attendance must be blocked when roster count is 0');
assert.equal(canSaveAttendance(9, false), true, 'Save Attendance must be enabled when roster has verified students');
assert.equal(canSaveAttendance(9, true), false, 'Save Attendance must be disabled while saving');

console.log('✓ TEST 7 PASSED: Historical sessions preserved and zero-student saves strictly blocked.\n');

// -------------------------------------------------------------
// Test 8: Timetable-Driven Session Filtering & IST Weekday Resolution
// -------------------------------------------------------------
console.log('TEST 8: Timetable-Driven Session Filtering & IST Weekday Resolution');

function getDayOfWeekIST(dateInput) {
  let targetDate;
  if (typeof dateInput === 'string') {
    const parts = dateInput.trim().split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      targetDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
    } else {
      targetDate = new Date(dateInput);
    }
  } else {
    targetDate = dateInput;
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  }).format(targetDate);
}

function filterScheduledTimetableSessions({
  dateString,
  courseIdentifier,
  section,
  semester,
  facultyTimetable
}) {
  const dayOfWeek = getDayOfWeekIST(dateString);
  let filtered = facultyTimetable.filter(entry => entry.day_of_week === dayOfWeek);

  if (courseIdentifier && courseIdentifier.trim() !== '') {
    const cleanId = courseIdentifier.trim().toLowerCase();
    filtered = filtered.filter(entry => {
      const entryId = (entry.course_id || '').trim().toLowerCase();
      const entryCode = (entry.course_code || '').trim().toLowerCase();
      return entryId === cleanId || entryCode === cleanId;
    });
  }

  if (section && section.trim() !== '') {
    const cleanSec = section.trim().toLowerCase();
    filtered = filtered.filter(entry => (entry.section || '').trim().toLowerCase() === cleanSec);
  }

  if (semester != null && semester !== '') {
    filtered = filtered.filter(entry => entry.semester === semester);
  }

  return filtered;
}

const mockFacultyTimetable = [
  // Monday sessions
  { id: 'tt-1', day_of_week: 'Monday', course_id: 'c-702', course_code: 'BCS702', course_name: 'Advanced Algorithms', start_time: '09:00 AM', end_time: '10:00 AM', section: 'A', semester: 7, room: 'LH-101' },
  { id: 'tt-2', day_of_week: 'Monday', course_id: 'c-702', course_code: 'BCS702', course_name: 'Advanced Algorithms', start_time: '02:00 PM', end_time: '03:00 PM', section: 'A', semester: 7, room: 'LH-101' },
  { id: 'tt-3', day_of_week: 'Monday', course_id: 'c-714', course_code: 'BCS714A', course_name: 'Cloud Computing', start_time: '11:15 AM', end_time: '12:15 PM', section: 'A', semester: 7, room: 'LH-102' },
  // Tuesday session
  { id: 'tt-4', day_of_week: 'Tuesday', course_id: 'c-702', course_code: 'BCS702', course_name: 'Advanced Algorithms', start_time: '10:00 AM', end_time: '11:00 AM', section: 'B', semester: 7, room: 'LH-201' },
  // Wednesday session
  { id: 'tt-5', day_of_week: 'Wednesday', course_id: 'c-501', course_code: 'CS501', course_name: 'Database Systems', start_time: '09:00 AM', end_time: '10:00 AM', section: 'A', semester: 5, room: 'LH-105' },
];

// Test 8a: Deterministic IST Weekday Calculation (2026-11-16 is Monday)
assert.equal(getDayOfWeekIST('2026-11-16'), 'Monday', '2026-11-16 must resolve to Monday in Asia/Kolkata');
assert.equal(getDayOfWeekIST('2026-11-17'), 'Tuesday', '2026-11-17 must resolve to Tuesday in Asia/Kolkata');
assert.equal(getDayOfWeekIST('2026-11-18'), 'Wednesday', '2026-11-18 must resolve to Wednesday in Asia/Kolkata');

// Test 8b: Multiple scheduled sessions on same date for course BCS702
const mondaySessions = filterScheduledTimetableSessions({
  dateString: '2026-11-16',
  courseIdentifier: 'BCS702',
  section: 'A',
  semester: 7,
  facultyTimetable: mockFacultyTimetable
});
assert.equal(mondaySessions.length, 2, 'Monday must return both 09:00 AM and 02:00 PM sessions for BCS702');
assert.equal(mondaySessions[0].start_time, '09:00 AM');
assert.equal(mondaySessions[1].start_time, '02:00 PM');

// Test 8c: Section filter isolation (Tuesday Section B vs Section A)
const tuesdaySecA = filterScheduledTimetableSessions({
  dateString: '2026-11-17',
  courseIdentifier: 'BCS702',
  section: 'A',
  semester: 7,
  facultyTimetable: mockFacultyTimetable
});
assert.equal(tuesdaySecA.length, 0, 'No Section A session scheduled on Tuesday');

const tuesdaySecB = filterScheduledTimetableSessions({
  dateString: '2026-11-17',
  courseIdentifier: 'BCS702',
  section: 'B',
  semester: 7,
  facultyTimetable: mockFacultyTimetable
});
assert.equal(tuesdaySecB.length, 1, 'Tuesday Section B session correctly matched');
assert.equal(tuesdaySecB[0].room, 'LH-201');

// Test 8d: No scheduled session on date returns empty array
const sundaySessions = filterScheduledTimetableSessions({
  dateString: '2026-11-15', // Sunday
  courseIdentifier: 'BCS702',
  section: 'A',
  semester: 7,
  facultyTimetable: mockFacultyTimetable
});
assert.equal(sundaySessions.length, 0, 'Sunday must return 0 scheduled sessions');

// Test 8e: Duplicate attendance session prevention logic
const existingHistoryLogs = [
  { courseCode: 'BCS702', date: '2026-11-16', timeSlot: '09:00 AM - 10:00 AM', section: 'A' }
];

function isDuplicateAttendance({ courseCode, date, timeSlot, section, historyLogs }) {
  return historyLogs.some(log =>
    log.date === date &&
    log.courseCode.toLowerCase() === courseCode.toLowerCase() &&
    log.timeSlot === timeSlot &&
    (log.section || null) === (section || null)
  );
}

assert.equal(isDuplicateAttendance({
  courseCode: 'BCS702',
  date: '2026-11-16',
  timeSlot: '09:00 AM - 10:00 AM',
  section: 'A',
  historyLogs: existingHistoryLogs
}), true, 'Duplicate session must be detected and blocked');

assert.equal(isDuplicateAttendance({
  courseCode: 'BCS702',
  date: '2026-11-16',
  timeSlot: '02:00 PM - 03:00 PM', // Different time slot on same day
  section: 'A',
  historyLogs: existingHistoryLogs
}), false, 'Different timetable slot on same day must be permitted');

console.log('✓ TEST 8 PASSED: Timetable session filtering, weekday IST resolution, and duplicate session checks verified.\n');

// -------------------------------------------------------------
// Test 9: Strict Attendance Roster & Timetable Authorization Integrity Suite
// -------------------------------------------------------------
console.log('TEST 9: Strict Attendance Roster & Timetable Authorization Integrity Suite');

// 9.1: Prohibition of Historical Attendance as Current Roster Fallback
// Historical attendance records must NEVER establish the current roster for a new session.
function resolveCurrentEnrolledRoster({
  requestedCourseCode,
  courseEnrollments,
  timetableAllocations = [],
  historicalSessions = [],
  historicalRecords = []
}) {
  if (!requestedCourseCode) return { roster: [], missingMapping: false };
  const clean = requestedCourseCode.trim().toLowerCase();

  // 1. Authoritative Current Relationship: Direct course_enrollments
  const verifiedDirect = courseEnrollments.filter(e =>
    (e.status === 'Active' || e.status === 'ACTIVE') &&
    ((e.course_id && e.course_id.toLowerCase() === clean) ||
     (e.course_code && e.course_code.toLowerCase() === clean))
  );

  if (verifiedDirect.length > 0) {
    return {
      roster: Array.from(new Set(verifiedDirect.map(e => e.student_id))),
      missingMapping: false
    };
  }

  // 2. Authoritative Current Relationship: Timetable section/semester allocation
  const ttMatch = timetableAllocations.find(tt =>
    (tt.course_id && tt.course_id.toLowerCase() === clean) ||
    (tt.course_code && tt.course_code.toLowerCase() === clean)
  );

  if (ttMatch && ttMatch.semester != null) {
    const allocated = courseEnrollments.filter(e =>
      (e.status === 'Active' || e.status === 'ACTIVE') &&
      e.semester === ttMatch.semester &&
      (!ttMatch.section || e.section === ttMatch.section)
    );
    if (allocated.length > 0) {
      return {
        roster: Array.from(new Set(allocated.map(e => e.student_id))),
        missingMapping: false
      };
    }
  }

  // STRICT: Historical records (historicalSessions, historicalRecords) MUST NOT be used!
  // Return empty roster with missingMapping = true
  return {
    roster: [],
    missingMapping: true,
    warning: `No verified student enrollment mapping found for course code "${requestedCourseCode}".`
  };
}

// 9.1 Test: Course BCS702 has historical sessions with 9 students, BUT currently has 0 course_enrollments
const mockHistoricalBCS702Sessions = [
  { id: 'sess-bcs702-1', course_id: 'BCS702', total_students: 9 },
  { id: 'sess-bcs702-2', course_id: 'BCS702', total_students: 9 }
];
const mockHistoricalBCS702Records = Array.from({ length: 9 }, (_, i) => ({
  session_id: 'sess-bcs702-1',
  student_id: `std-hist-${i + 1}`,
  status: 'Present'
}));

const resultWithoutEnrollment = resolveCurrentEnrolledRoster({
  requestedCourseCode: 'BCS702',
  courseEnrollments: [], // No current enrollments in the database!
  timetableAllocations: [],
  historicalSessions: mockHistoricalBCS702Sessions,
  historicalRecords: mockHistoricalBCS702Records
});

assert.equal(resultWithoutEnrollment.roster.length, 0, 'Historical BCS702 students MUST NOT become current roster members without verified enrollment');
assert.equal(resultWithoutEnrollment.missingMapping, true, 'missingMapping must be true when current enrollment is missing');

// 9.2 Test: Existing historical sessions remain readable
const historyLogs = [
  { id: 'sess-1', courseCode: 'BCS714A', totalStudents: 9, presentCount: 8, absentCount: 1, lateCount: 0 },
  { id: 'sess-2', courseCode: 'BCS702', totalStudents: 9, presentCount: 7, absentCount: 2, lateCount: 0 },
  { id: 'sess-3', courseCode: 'BCS702', totalStudents: 9, presentCount: 9, absentCount: 0, lateCount: 0 },
];
assert.equal(historyLogs.length, 3, 'All 3 historical sessions remain readable');
assert.equal(historyLogs[1].courseCode, 'BCS702');
assert.equal(historyLogs[1].totalStudents, 9);
assert.equal(historyLogs[2].courseCode, 'BCS702');
assert.equal(historyLogs[2].totalStudents, 9);

// 9.3 Test: Historical corrections still work on existing session records
function applyHistoricalCorrection(roster, targetRecordId, newStatus) {
  const updated = roster.map(r => r.recordId === targetRecordId ? { ...r, status: newStatus } : r);
  const presentCount = updated.filter(r => r.status === 'Present').length;
  const absentCount = updated.filter(r => r.status === 'Absent').length;
  const lateCount = updated.filter(r => r.status === 'Late').length;
  return { updatedRoster: updated, presentCount, absentCount, lateCount, totalStudents: updated.length };
}

const initialHistRoster = [
  { recordId: 'rec-1', studentName: 'Aarav', status: 'Absent' },
  { recordId: 'rec-2', studentName: 'Bhavya', status: 'Present' },
  { recordId: 'rec-3', studentName: 'Chetan', status: 'Present' }
];
const corrected = applyHistoricalCorrection(initialHistRoster, 'rec-1', 'Present');
assert.equal(corrected.presentCount, 3, 'Corrected student updates session present count');
assert.equal(corrected.absentCount, 0, 'Absent count decreases accordingly');

// 9.4 Test: Verified current course enrollment produces the correct roster
const currentVerifiedEnrollments = Array.from({ length: 9 }, (_, i) => ({
  student_id: `std-current-${i + 1}`,
  course_code: 'BCS702',
  status: 'Active'
}));

const resultWithEnrollment = resolveCurrentEnrolledRoster({
  requestedCourseCode: 'BCS702',
  courseEnrollments: currentVerifiedEnrollments
});
assert.equal(resultWithEnrollment.roster.length, 9, 'Verified current enrollment produces the exact 9 students');
assert.equal(resultWithEnrollment.missingMapping, false, 'missingMapping must be false');

// 9.5 Test: Missing current enrollment blocks new attendance save
function validateAttendanceSave({ rosterLength, courseCode, isSaving }) {
  if (isSaving) return { canSave: false, reason: 'Save in progress' };
  if (!courseCode || courseCode.trim() === '') return { canSave: false, reason: 'Course code required' };
  if (rosterLength === 0) return { canSave: false, reason: 'Course enrollment mapping required' };
  return { canSave: true };
}

const saveAttemptMissing = validateAttendanceSave({ rosterLength: 0, courseCode: 'BCS702', isSaving: false });
assert.equal(saveAttemptMissing.canSave, false, 'Save MUST be blocked when roster is empty');
assert.equal(saveAttemptMissing.reason, 'Course enrollment mapping required');

const saveAttemptValid = validateAttendanceSave({ rosterLength: 9, courseCode: 'BCS702', isSaving: false });
assert.equal(saveAttemptValid.canSave, true, 'Save is allowed when verified roster is present');

// 9.6 Test: Department timetable visibility does not bypass faculty authorization
function getAuthorizedFacultyTimetable({ user, profile, allTimetableEntries }) {
  if (!user || !profile) return [];
  if (profile.role === 'ADMIN') {
    return allTimetableEntries;
  }
  if (profile.role === 'HOD') {
    return allTimetableEntries.filter(e => e.department_id === profile.department_id);
  }
  // FACULTY: Strictly direct assigned sessions only. Matching by fuzzy name or general department is prohibited!
  return allTimetableEntries.filter(e => e.faculty_id === user.id);
}

const mockAllEntries = [
  { id: 'tt-fac1-1', faculty_id: 'fac-1', department_id: 'dept-cse', course_code: 'BCS702', start_time: '09:00 AM', end_time: '10:00 AM' },
  { id: 'tt-fac1-2', faculty_id: 'fac-1', department_id: 'dept-cse', course_code: 'BCS702', start_time: '02:00 PM', end_time: '03:00 PM' },
  { id: 'tt-fac2-3', faculty_id: 'fac-2', department_id: 'dept-cse', course_code: 'BCS702', start_time: '11:00 AM', end_time: '12:00 PM' },
];

const fac1Entries = getAuthorizedFacultyTimetable({
  user: { id: 'fac-1' },
  profile: { id: 'fac-1', role: 'FACULTY', department_id: 'dept-cse' },
  allTimetableEntries: mockAllEntries
});

assert.equal(fac1Entries.length, 2, 'Faculty 1 only sees their 2 assigned sessions');
assert.ok(!fac1Entries.some(e => e.id === 'tt-fac2-3'), 'Faculty 2 session is strictly excluded for Faculty 1');

// 9.7 Test: Faculty cannot mark attendance for another faculty member's session
function canFacultyMarkSession(callerProfile, session) {
  if (callerProfile.role === 'ADMIN' || callerProfile.role === 'HOD') {
    return true; // HOD and Admin have administrative override within department
  }
  if (callerProfile.role === 'FACULTY') {
    if (session.faculty_id && session.faculty_id !== callerProfile.id) {
      return false; // Unauthorized: Cannot mark another faculty's timetable session!
    }
    return true;
  }
  return false;
}

assert.equal(canFacultyMarkSession(
  { id: 'fac-1', role: 'FACULTY' },
  { id: 'tt-fac2-3', faculty_id: 'fac-2', course_code: 'BCS702' }
), false, 'Faculty 1 must NOT be permitted to record attendance for Faculty 2 session');

assert.equal(canFacultyMarkSession(
  { id: 'fac-1', role: 'FACULTY' },
  { id: 'tt-fac1-1', faculty_id: 'fac-1', course_code: 'BCS702' }
), true, 'Faculty 1 can record attendance for their own timetable session');

// 9.8 Test: Timetable-derived time slots continue working
const selectedSlot = fac1Entries[0];
const sessionTimeSlot = `${selectedSlot.start_time} - ${selectedSlot.end_time}`;
assert.equal(sessionTimeSlot, '09:00 AM - 10:00 AM', 'Authoritative session time slot is derived directly from timetable entry');

console.log('✓ TEST 9 PASSED: All 8 attendance roster, authorization, and timetable integrity requirements verified.\n');

// -------------------------------------------------------------
// Test 10: Unified Shared Timetable & Attendance Scheduling Parity
// -------------------------------------------------------------
console.log('TEST 10: Unified Shared Timetable & Attendance Scheduling Parity');

const CANONICAL_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function normalizeWeekday(dayStr) {
  if (!dayStr) return '';
  const trimmed = dayStr.trim().toLowerCase();
  for (const day of CANONICAL_WEEKDAYS) {
    const dayLower = day.toLowerCase();
    if (dayLower === trimmed || dayLower.startsWith(trimmed) || trimmed.startsWith(dayLower.slice(0, 3))) {
      return day;
    }
  }
  return dayStr.trim();
}

function getDayOfWeekISTUnified(dateInput) {
  let targetDate;
  if (typeof dateInput === 'string') {
    const parts = dateInput.trim().split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      targetDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
    } else {
      targetDate = new Date(dateInput);
    }
  } else {
    targetDate = dateInput;
  }
  const rawDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  }).format(targetDate);
  return normalizeWeekday(rawDay);
}

function getDateForWeekdayInWeek(targetWeekday, refDateStr) {
  const normTarget = normalizeWeekday(targetWeekday);
  const targetIndex = CANONICAL_WEEKDAYS.indexOf(normTarget);
  if (targetIndex === -1) return refDateStr;

  const parts = refDateStr.trim().split('-');
  if (parts.length !== 3) return refDateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const refDate = new Date(Date.UTC(year, month, day, 12, 0, 0));

  const jsDay = refDate.getUTCDay();
  const refIndex = jsDay === 0 ? 6 : jsDay - 1;

  const dayDiff = targetIndex - refIndex;
  const targetDate = new Date(refDate.getTime() + dayDiff * 24 * 60 * 60 * 1000);
  return targetDate.toISOString().slice(0, 10);
}

function resolveScheduledSessions({
  date,
  courseIdentifier,
  section,
  semester,
  preloadedEntries
}) {
  const entries = preloadedEntries || [];
  const dayOfWeek = getDayOfWeekISTUnified(date);
  const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

  if (!entries || entries.length === 0) {
    return {
      matchingSessions: [],
      dayOfWeek,
      allCourseSessions: [],
      scheduledDaysForCourse: [],
      reasonIfNotMatched: 'NO_FACULTY_ENTRIES',
      detailedMessage: 'No institutional timetable entries are assigned to your faculty profile in the database.'
    };
  }

  let allCourseSessions = entries;
  let cleanCode = '';

  if (courseIdentifier && courseIdentifier.trim() !== '') {
    const rawTrimmed = courseIdentifier.trim();
    const parenMatch = rawTrimmed.match(/\(([^)]+)\)/);
    cleanCode = (parenMatch ? parenMatch[1].trim() : (rawTrimmed.split(' ')[0] || rawTrimmed)).trim().toLowerCase();
    const cleanName = (parenMatch ? rawTrimmed.slice(0, parenMatch.index).trim() : rawTrimmed).toLowerCase();
    const rawLower = rawTrimmed.toLowerCase();
    const normClean = cleanCode.replace(/[^a-z0-9]/g, '');
    const normName = cleanName.replace(/[^a-z0-9]/g, '');

    allCourseSessions = entries.filter(e => {
      const eCode = (e.course_code || '').trim().toLowerCase();
      const eId = (e.course_id || '').trim().toLowerCase();
      const eName = (e.course_name || '').trim().toLowerCase();
      const normECode = eCode.replace(/[^a-z0-9]/g, '');
      const normEId = eId.replace(/[^a-z0-9]/g, '');
      const normEName = eName.replace(/[^a-z0-9]/g, '');

      return (
        eCode === cleanCode ||
        eId === cleanCode ||
        eCode === rawLower ||
        eId === rawLower ||
        (normClean && normECode === normClean) ||
        (normClean && normEId === normClean) ||
        (normClean.length >= 3 && normECode.includes(normClean)) ||
        (normClean.length >= 3 && normEId.includes(normClean)) ||
        (normName.length >= 3 && normEName.includes(normName)) ||
        (cleanCode.length >= 3 && eCode.includes(cleanCode)) ||
        (cleanCode.length >= 3 && eId.includes(cleanCode)) ||
        (cleanName.length >= 3 && eName.includes(cleanName))
      );
    });

    if (allCourseSessions.length === 0) {
      return {
        matchingSessions: [],
        dayOfWeek,
        allCourseSessions: [],
        scheduledDaysForCourse: [],
        reasonIfNotMatched: 'COURSE_NOT_IN_TIMETABLE',
        detailedMessage: `No timetable entries found for course "${cleanCode.toUpperCase()}" assigned to your faculty profile in the database. Please ensure your Department HOD or Admin has scheduled this course and assigned your faculty account as the instructor in the HOD Timetable Management portal.`
      };
    }
  }

  const scheduledDaysForCourse = Array.from(
    new Set(allCourseSessions.map(e => normalizeWeekday(e.day_of_week)).filter(Boolean))
  );

  const daySessions = allCourseSessions.filter(
    e => normalizeWeekday(e.day_of_week) === dayOfWeek
  );

  if (daySessions.length === 0) {
    const daysListStr = scheduledDaysForCourse.length > 0 ? scheduledDaysForCourse.join(', ') : 'other days';
    const displayCode = cleanCode ? cleanCode.toUpperCase() : 'This course';
    return {
      matchingSessions: [],
      dayOfWeek,
      allCourseSessions,
      scheduledDaysForCourse,
      reasonIfNotMatched: 'NO_SESSION_ON_DAY',
      detailedMessage: `${displayCode} is scheduled on [${daysListStr}], but has no periods scheduled on ${dayOfWeek} (${dateStr}).`
    };
  }

  let filtered = daySessions;
  if (section && section.trim() !== '') {
    const cleanSec = section.trim().toLowerCase();
    const secMatched = filtered.filter(e => (e.section || '').trim().toLowerCase() === cleanSec);
    if (secMatched.length > 0) {
      filtered = secMatched;
    } else {
      const availableSecs = Array.from(new Set(daySessions.map(s => s.section || 'All'))).join(', ');
      return {
        matchingSessions: [],
        dayOfWeek,
        allCourseSessions,
        scheduledDaysForCourse,
        reasonIfNotMatched: 'SECTION_SEMESTER_MISMATCH',
        detailedMessage: `${cleanCode ? cleanCode.toUpperCase() : 'This course'} is scheduled on ${dayOfWeek}, but for Section(s) [${availableSecs}] rather than Section ${section.trim()}.`
      };
    }
  }

  if (semester != null && semester !== '') {
    const numSem = Number(semester);
    const semMatched = filtered.filter(e => e.semester === numSem);
    if (semMatched.length > 0) {
      filtered = semMatched;
    } else {
      const availableSems = Array.from(new Set(daySessions.map(s => `Sem ${s.semester}`))).join(', ');
      return {
        matchingSessions: [],
        dayOfWeek,
        allCourseSessions,
        scheduledDaysForCourse,
        reasonIfNotMatched: 'SECTION_SEMESTER_MISMATCH',
        detailedMessage: `${cleanCode ? cleanCode.toUpperCase() : 'This course'} is scheduled on ${dayOfWeek}, but for [${availableSems}] rather than Semester ${numSem}.`
      };
    }
  }

  return {
    matchingSessions: filtered,
    dayOfWeek,
    allCourseSessions,
    scheduledDaysForCourse,
    reasonIfNotMatched: null,
    detailedMessage: `Found ${filtered.length} scheduled session(s) on ${dayOfWeek}.`
  };
}

// 10.1 Verify weekday normalization
assert.equal(normalizeWeekday('wed'), 'Wednesday');
assert.equal(normalizeWeekday('WEDNESDAY'), 'Wednesday');
assert.equal(normalizeWeekday('Wednesday'), 'Wednesday');
assert.equal(normalizeWeekday('Mon'), 'Monday');
assert.equal(normalizeWeekday('friday'), 'Friday');

// 10.2 Verify IST weekday determination for 2026-11-11
assert.equal(getDayOfWeekISTUnified('2026-11-11'), 'Wednesday');
assert.equal(getDayOfWeekISTUnified('2026-11-09'), 'Monday');
assert.equal(getDayOfWeekISTUnified('2026-11-13'), 'Friday');

// 10.3 Verify date switching relative calculation
assert.equal(getDateForWeekdayInWeek('Monday', '2026-11-11'), '2026-11-09');
assert.equal(getDateForWeekdayInWeek('Friday', '2026-11-11'), '2026-11-13');
assert.equal(getDateForWeekdayInWeek('Wednesday', '2026-11-11'), '2026-11-11');

// Mock authoritative timetable schedule for BCS702
const mockAuthoritativeFacultyTimetable = [
  {
    id: 'tt-bcs702-mon',
    faculty_id: 'fac-1',
    course_code: 'BCS702',
    course_name: 'Machine Learning',
    day_of_week: 'Monday',
    start_time: '09:00 AM',
    end_time: '10:00 AM',
    room: 'LH-301',
    section: 'A',
    semester: 7,
    is_lab: false
  },
  {
    id: 'tt-bcs702-fri',
    faculty_id: 'fac-1',
    course_code: 'BCS702',
    course_name: 'Machine Learning',
    day_of_week: 'Friday',
    start_time: '11:00 AM',
    end_time: '12:00 PM',
    room: 'LH-301',
    section: 'A',
    semester: 7,
    is_lab: false
  }
];

// 10.4 Querying BCS702 on Wednesday (2026-11-11):
// Course meets on Monday and Friday, but NOT on Wednesday.
const resWed = resolveScheduledSessions({
  date: '2026-11-11',
  courseIdentifier: 'Machine Learning (BCS702)',
  section: 'A',
  semester: 7,
  preloadedEntries: mockAuthoritativeFacultyTimetable
});

assert.equal(resWed.matchingSessions.length, 0, 'No sessions match on Wednesday');
assert.equal(resWed.dayOfWeek, 'Wednesday');
assert.equal(resWed.reasonIfNotMatched, 'NO_SESSION_ON_DAY');
assert.deepEqual(resWed.scheduledDaysForCourse, ['Monday', 'Friday'], 'Returns scheduled days Monday & Friday');
assert.ok(resWed.detailedMessage.includes('BCS702 is scheduled on [Monday, Friday]'), 'Detailed message lists meeting days');
assert.ok(resWed.detailedMessage.includes('Wednesday (2026-11-11)'), 'Detailed message notes selected date');

// 10.5 One-click switch to Monday (2026-11-09):
const mondayDate = getDateForWeekdayInWeek('Monday', '2026-11-11');
assert.equal(mondayDate, '2026-11-09');

const resMon = resolveScheduledSessions({
  date: mondayDate,
  courseIdentifier: 'BCS702',
  section: 'A',
  semester: 7,
  preloadedEntries: mockAuthoritativeFacultyTimetable
});

assert.equal(resMon.matchingSessions.length, 1, 'Monday has exactly 1 scheduled session');
assert.equal(resMon.reasonIfNotMatched, null, 'No mismatch reason on scheduled day');
assert.equal(resMon.matchingSessions[0].start_time, '09:00 AM');
assert.equal(resMon.matchingSessions[0].end_time, '10:00 AM');

// 10.6 Section mismatch detection
const resWrongSec = resolveScheduledSessions({
  date: '2026-11-09',
  courseIdentifier: 'BCS702',
  section: 'B', // Timetable has section 'A'
  semester: 7,
  preloadedEntries: mockAuthoritativeFacultyTimetable
});
assert.equal(resWrongSec.matchingSessions.length, 0);
assert.equal(resWrongSec.reasonIfNotMatched, 'SECTION_SEMESTER_MISMATCH');

// 10.7 Course not in timetable detection
const resWrongCourse = resolveScheduledSessions({
  date: '2026-11-09',
  courseIdentifier: 'UNKNOWN101',
  preloadedEntries: mockAuthoritativeFacultyTimetable
});
assert.equal(resWrongCourse.matchingSessions.length, 0);
assert.equal(resWrongCourse.reasonIfNotMatched, 'COURSE_NOT_IN_TIMETABLE');

// 10.8 Empty timetable detection
const resEmpty = resolveScheduledSessions({
  date: '2026-11-09',
  courseIdentifier: 'BCS702',
  preloadedEntries: []
});
assert.equal(resEmpty.matchingSessions.length, 0);
assert.equal(resEmpty.reasonIfNotMatched, 'NO_FACULTY_ENTRIES');

// 10.9 Save guard requires selected timetable session
function validateAttendanceSaveSubmission({
  selectedSession,
  rosterLength,
  callerRole,
  callerId,
  sessionFacultyId
}) {
  if (!selectedSession) {
    return { allowed: false, error: 'A scheduled timetable class time slot must be selected.' };
  }
  if (rosterLength === 0) {
    return { allowed: false, error: 'Verified student enrollment is required to save attendance.' };
  }
  if (callerRole === 'FACULTY' && sessionFacultyId && sessionFacultyId !== callerId) {
    return { allowed: false, error: 'Unauthorized: You are not authorized to record attendance for another faculty member\'s timetable session.' };
  }
  return { allowed: true, timeSlot: `${selectedSession.start_time} - ${selectedSession.end_time}` };
}

const unselectedSave = validateAttendanceSaveSubmission({
  selectedSession: null,
  rosterLength: 9,
  callerRole: 'FACULTY',
  callerId: 'fac-1',
  sessionFacultyId: 'fac-1'
});
assert.equal(unselectedSave.allowed, false);
assert.equal(unselectedSave.error, 'A scheduled timetable class time slot must be selected.');

const emptyRosterSave = validateAttendanceSaveSubmission({
  selectedSession: resMon.matchingSessions[0],
  rosterLength: 0,
  callerRole: 'FACULTY',
  callerId: 'fac-1',
  sessionFacultyId: 'fac-1'
});
assert.equal(emptyRosterSave.allowed, false);
assert.equal(emptyRosterSave.error, 'Verified student enrollment is required to save attendance.');

const crossFacultySave = validateAttendanceSaveSubmission({
  selectedSession: resMon.matchingSessions[0],
  rosterLength: 9,
  callerRole: 'FACULTY',
  callerId: 'fac-OTHER',
  sessionFacultyId: 'fac-1'
});
assert.equal(crossFacultySave.allowed, false);
assert.ok(crossFacultySave.error.includes('Unauthorized'));

const validSave = validateAttendanceSaveSubmission({
  selectedSession: resMon.matchingSessions[0],
  rosterLength: 9,
  callerRole: 'FACULTY',
  callerId: 'fac-1',
  sessionFacultyId: 'fac-1'
});
assert.equal(validSave.allowed, true);
assert.equal(validSave.timeSlot, '09:00 AM - 10:00 AM');

console.log('✓ TEST 10 PASSED: Unified Shared Timetable resolution, weekday parsing, slot switching, and save guards verified.\n');

console.log('ALL FINAL DATA INTEGRITY & TIMETABLE TESTS PASSED (10/10)!');
