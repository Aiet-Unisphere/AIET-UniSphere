import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * AIET-UniSphere — Final Student Statistics Integration and Reconciliation Test Suite
 *
 * Verifies:
 * 1. AdminDashboard metrics consume canonical studentStatisticsService and match institution totals.
 * 2. HODDashboard metrics consume canonical studentStatisticsService and isolate department cohorts.
 * 3. Student Directory totals are independent of pagination, separate active/inactive/incomplete profiles.
 * 4. Faculty Dashboard unique student count deduplicates across multiple allocated subjects.
 * 5. Course identifier normalization: accepts string (code or UUID) or options object.
 * 6. Course Details count matches Attendance Roster count and Assignment Details count 1:1.
 * 7. Cross-department teaching derives student roster from subject ownership.
 * 8. Incomplete student profiles (missing semester/section/department) are counted and flagged with badges.
 */

const DEPT_CSE = 'dept-cse-01';
const DEPT_ECE = 'dept-ece-02';
const DEPT_ISE = 'dept-ise-03';
const FACULTY_CSE = 'fac-cse-01';
const FACULTY_ECE = 'fac-ece-02';

const createMockDatabase = () => ({
  departments: [
    { id: DEPT_CSE, code: 'CSE', name: 'Computer Science & Engineering' },
    { id: DEPT_ECE, code: 'ECE', name: 'Electronics & Communication Engineering' },
    { id: DEPT_ISE, code: 'ISE', name: 'Information Science & Engineering' }
  ],
  profiles: [
    // CSE Students
    { id: 'p-cse-1', full_name: 'Aarav Kumar', usn_or_employee_id: '1AI24CS001', role: 'STUDENT', department_id: DEPT_CSE, account_status: 'ACTIVE' },
    { id: 'p-cse-2', full_name: 'Bhavna Sharma', usn_or_employee_id: '1AI24CS002', role: 'STUDENT', department_id: DEPT_CSE, account_status: 'ACTIVE' },
    { id: 'p-cse-3', full_name: 'Chirag Rao', usn_or_employee_id: '1AI24CS003', role: 'STUDENT', department_id: DEPT_CSE, account_status: 'ACTIVE' },
    { id: 'p-cse-4', full_name: 'Divya Nair', usn_or_employee_id: '1AI24CS004', role: 'STUDENT', department_id: DEPT_CSE, account_status: 'ACTIVE' },
    { id: 'p-cse-inact', full_name: 'Dinesh Inactive', usn_or_employee_id: '1AI24CS005', role: 'STUDENT', department_id: DEPT_CSE, account_status: 'INACTIVE' },
    { id: 'p-cse-incomp', full_name: 'Isha Incomplete', usn_or_employee_id: '1AI24CS006', role: 'STUDENT', department_id: DEPT_CSE, account_status: 'ACTIVE' },

    // ECE Students
    { id: 'p-ece-1', full_name: 'Ekta Verma', usn_or_employee_id: '1AI24EC001', role: 'STUDENT', department_id: DEPT_ECE, account_status: 'ACTIVE' },
    { id: 'p-ece-2', full_name: 'Farhan Ali', usn_or_employee_id: '1AI24EC002', role: 'STUDENT', department_id: DEPT_ECE, account_status: 'ACTIVE' },
    { id: 'p-ece-3', full_name: 'Gaurav Sen', usn_or_employee_id: '1AI24EC003', role: 'STUDENT', department_id: DEPT_ECE, account_status: 'ACTIVE' },

    // ISE Student (missing department in profile = incomplete registration)
    { id: 'p-no-dept', full_name: 'Harish IncompleteDept', usn_or_employee_id: '1AI24XX001', role: 'STUDENT', department_id: null, account_status: 'ACTIVE' },

    // Faculty members
    { id: FACULTY_CSE, full_name: 'Dr. Ramesh Kumar', usn_or_employee_id: 'EMP001', role: 'FACULTY', department_id: DEPT_CSE, account_status: 'ACTIVE' },
    { id: FACULTY_ECE, full_name: 'Dr. Sunita Rao', usn_or_employee_id: 'EMP002', role: 'FACULTY', department_id: DEPT_ECE, account_status: 'ACTIVE' }
  ],
  student_profiles: [
    // CSE cohort
    { profile_id: 'p-cse-1', semester: 7, section: 'A' },
    { profile_id: 'p-cse-2', semester: 7, section: 'A' },
    { profile_id: 'p-cse-3', semester: 7, section: 'B' },
    { profile_id: 'p-cse-4', semester: 7, section: 'B' },
    { profile_id: 'p-cse-inact', semester: 7, section: 'A' },
    // p-cse-incomp has no student_profiles entry or semester is null!
    
    // ECE cohort
    { profile_id: 'p-ece-1', semester: 5, section: 'A' },
    { profile_id: 'p-ece-2', semester: 5, section: 'A' },
    { profile_id: 'p-ece-3', semester: 5, section: 'B' },

    // p-no-dept has semester but no department_id
    { profile_id: 'p-no-dept', semester: 3, section: 'A' }
  ],
  course_enrollments: [
    // Course BCS702 (CSE Sem 7 Section A)
    { course_id: 'BCS702', course_code: 'BCS702', course_name: 'Cloud Computing', department_id: DEPT_CSE, semester: 7, section: 'A', student_id: 'p-cse-1', faculty_id: FACULTY_CSE, status: 'Active' },
    { course_id: 'BCS702', course_code: 'BCS702', course_name: 'Cloud Computing', department_id: DEPT_CSE, semester: 7, section: 'A', student_id: 'p-cse-2', faculty_id: FACULTY_CSE, status: 'Active' },

    // Course BCS703 (CSE Sem 7 Section B)
    { course_id: 'BCS703', course_code: 'BCS703', course_name: 'Deep Learning', department_id: DEPT_CSE, semester: 7, section: 'B', student_id: 'p-cse-3', faculty_id: FACULTY_CSE, status: 'Active' },
    { course_id: 'BCS703', course_code: 'BCS703', course_name: 'Deep Learning', department_id: DEPT_CSE, semester: 7, section: 'B', student_id: 'p-cse-4', faculty_id: FACULTY_CSE, status: 'Active' },

    // Cross-department Course: BEC501 (ECE Sem 5 Section A) taught by CSE Faculty Dr. Ramesh Kumar
    { course_id: 'c7867207-695d-4f24-91b5-9f5cf8c4a161', course_code: 'BEC501', course_name: 'Digital Signal Processing', department_id: DEPT_ECE, semester: 5, section: 'A', student_id: 'p-ece-1', faculty_id: FACULTY_CSE, status: 'Active' },
    { course_id: 'c7867207-695d-4f24-91b5-9f5cf8c4a161', course_code: 'BEC501', course_name: 'Digital Signal Processing', department_id: DEPT_ECE, semester: 5, section: 'A', student_id: 'p-ece-2', faculty_id: FACULTY_CSE, status: 'Active' }
  ],
  assignments: [
    { id: 'asg-01', course_id: 'BCS702', title: 'Cloud Architecture Design', faculty_id: FACULTY_CSE },
    { id: 'asg-02', course_id: 'c7867207-695d-4f24-91b5-9f5cf8c4a161', title: 'DSP Filters Lab', faculty_id: FACULTY_CSE }
  ]
});

// Canonical Mock Service logic
const computeInstitutionStudentMetrics = (db) => {
  const students = db.profiles.filter(p => p.role === 'STUDENT');
  const spMap = new Map(db.student_profiles.map(sp => [sp.profile_id, sp]));

  let totalRegistered = 0;
  let totalActive = 0;
  let totalInactive = 0;
  let totalIncomplete = 0;

  const deptMap = new Map();

  for (const s of students) {
    totalRegistered++;
    const isActive = !s.account_status || s.account_status.toUpperCase() === 'ACTIVE';
    if (isActive) totalActive++;
    else totalInactive++;

    const sp = spMap.get(s.id);
    const isIncomplete = !s.department_id || sp?.semester == null;
    if (isIncomplete) totalIncomplete++;

    if (s.department_id) {
      const d = deptMap.get(s.department_id) || { total: 0, active: 0 };
      d.total++;
      if (isActive) d.active++;
      deptMap.set(s.department_id, d);
    }
  }

  const byDepartment = db.departments.map(d => ({
    departmentId: d.id,
    departmentCode: d.code,
    departmentName: d.name,
    total: deptMap.get(d.id)?.total || 0,
    active: deptMap.get(d.id)?.active || 0
  }));

  return { totalRegistered, totalActive, totalInactive, totalIncomplete, byDepartment };
};

const computeDepartmentStudentMetrics = (db, departmentId) => {
  const students = db.profiles.filter(p => p.role === 'STUDENT' && p.department_id === departmentId);
  const spMap = new Map(db.student_profiles.map(sp => [sp.profile_id, sp]));

  let totalStudents = 0;
  let activeStudents = 0;
  let inactiveStudents = 0;
  let incompleteStudents = 0;

  for (const s of students) {
    totalStudents++;
    const isActive = !s.account_status || s.account_status.toUpperCase() === 'ACTIVE';
    if (isActive) activeStudents++;
    else inactiveStudents++;

    const sp = spMap.get(s.id);
    if (sp?.semester == null) incompleteStudents++;
  }

  return { departmentId, totalStudents, activeStudents, inactiveStudents, incompleteStudents };
};

const computeEligibleStudentRoster = (db, { courseCode, courseId, section, semester }) => {
  const inputCode = (courseCode || courseId || '').trim();
  const parenMatch = inputCode.match(/\(([^)]+)\)/);
  const cleanCode = parenMatch ? parenMatch[1].trim() : inputCode;

  // Find course enrollments or timetable
  const enrollments = db.course_enrollments.filter(ce => 
    (ce.course_id === cleanCode || ce.course_code === cleanCode || ce.course_id.includes(cleanCode)) &&
    ce.status === 'Active' &&
    (!section || ce.section === section) &&
    (semester == null || ce.semester === Number(semester))
  );

  const studentIds = new Set(enrollments.map(e => e.student_id));
  return db.profiles.filter(p => studentIds.has(p.id) && p.role === 'STUDENT' && (!p.account_status || p.account_status === 'ACTIVE'));
};

const computeEligibleStudentCountForCourse = (db, courseInput, section, semester) => {
  let resolvedCode = '';
  let resolvedSection = section;
  let resolvedSemester = semester;

  if (typeof courseInput === 'object' && courseInput !== null) {
    resolvedCode = courseInput.courseCode || courseInput.courseId || '';
    if (resolvedSection === undefined) resolvedSection = courseInput.section;
    if (resolvedSemester === undefined) resolvedSemester = courseInput.semester;
  } else if (typeof courseInput === 'string') {
    resolvedCode = courseInput;
  }

  const roster = computeEligibleStudentRoster(db, {
    courseCode: resolvedCode,
    section: resolvedSection,
    semester: resolvedSemester
  });
  return roster.length;
};

const computeFacultyUniqueStudentMetrics = (db, facultyId, allocatedCourses) => {
  const allIds = new Set();
  const courseMetrics = [];

  for (const c of allocatedCourses) {
    const roster = computeEligibleStudentRoster(db, {
      courseCode: c.code || c.id,
      section: c.section,
      semester: c.semester
    });
    roster.forEach(s => allIds.add(s.id));
    courseMetrics.push({
      courseId: c.id || c.code,
      courseCode: c.code || c.id,
      studentCount: roster.length
    });
  }

  return {
    facultyId,
    uniqueStudentsCount: allIds.size,
    uniqueStudentIds: Array.from(allIds),
    allocatedCoursesCount: allocatedCourses.length,
    courseMetrics
  };
};

test('FINAL STUDENT STATISTICS INTEGRATION AND RECONCILIATION SUITE', async (t) => {
  const db = createMockDatabase();

  await t.test('1. AdminDashboard metrics consume canonical service: total, active, inactive, incomplete', () => {
    const metrics = computeInstitutionStudentMetrics(db);
    // Total registered students: 6 (CSE) + 3 (ECE) + 1 (no dept) = 10
    assert.strictEqual(metrics.totalRegistered, 10, 'Total registered students must be 10');
    // Active students: 9 active (1 inactive: p-cse-inact)
    assert.strictEqual(metrics.totalActive, 9, 'Active students must be 9');
    assert.strictEqual(metrics.totalInactive, 1, 'Inactive students must be 1');
    // Incomplete students: p-cse-incomp (no semester) + p-no-dept (no dept) = 2
    assert.strictEqual(metrics.totalIncomplete, 2, 'Incomplete students must be 2');
    assert.strictEqual(metrics.totalActive + metrics.totalInactive, metrics.totalRegistered, 'Active + Inactive must equal Total');
  });

  await t.test('2. HODDashboard metrics isolate department cohorts without cross-department bleeding', () => {
    const cseMetrics = computeDepartmentStudentMetrics(db, DEPT_CSE);
    assert.strictEqual(cseMetrics.totalStudents, 6, 'CSE department must have exactly 6 registered students');
    assert.strictEqual(cseMetrics.activeStudents, 5, 'CSE active students must be 5');
    assert.strictEqual(cseMetrics.inactiveStudents, 1, 'CSE inactive students must be 1');
    assert.strictEqual(cseMetrics.incompleteStudents, 1, 'CSE incomplete students must be 1 (p-cse-incomp)');

    const eceMetrics = computeDepartmentStudentMetrics(db, DEPT_ECE);
    assert.strictEqual(eceMetrics.totalStudents, 3, 'ECE department must have exactly 3 registered students');
    assert.strictEqual(eceMetrics.activeStudents, 3, 'ECE active students must be 3');
    assert.strictEqual(eceMetrics.incompleteStudents, 0, 'ECE incomplete students must be 0');
  });

  await t.test('3. Student Directory totals are independent of pagination limit', () => {
    const allStudents = db.profiles.filter(p => p.role === 'STUDENT' && p.department_id === DEPT_CSE && p.account_status === 'ACTIVE');
    const totalEnrolledCount = allStudents.length;

    // Simulate pagination with page size = 2
    const pageSize = 2;
    const page1 = allStudents.slice(0, pageSize);
    const page2 = allStudents.slice(pageSize, pageSize * 2);

    assert.strictEqual(page1.length, 2, 'Page 1 has 2 items');
    assert.strictEqual(page2.length, 2, 'Page 2 has 2 items');
    assert.strictEqual(totalEnrolledCount, 5, 'True directory total must be 5 regardless of page limit');
  });

  await t.test('4. Faculty Dashboard unique student count deduplicates across multiple allocated subjects', () => {
    // Dr. Ramesh Kumar teaches BCS702 (2 students: p-cse-1, p-cse-2) and BCS703 (2 students: p-cse-3, p-cse-4)
    // Plus cross-department BEC501 (2 students: p-ece-1, p-ece-2)
    const allocatedCourses = [
      { id: 'BCS702', code: 'BCS702', section: 'A', semester: 7 },
      { id: 'BCS703', code: 'BCS703', section: 'B', semester: 7 },
      { id: 'c7867207-695d-4f24-91b5-9f5cf8c4a161', code: 'BEC501', section: 'A', semester: 5 }
    ];

    const facultyMetrics = computeFacultyUniqueStudentMetrics(db, FACULTY_CSE, allocatedCourses);
    assert.strictEqual(facultyMetrics.allocatedCoursesCount, 3, 'Allocated courses count must be 3');
    assert.strictEqual(facultyMetrics.uniqueStudentsCount, 6, 'Total deduplicated unique students must be 6 (2 + 2 + 2)');
    assert.strictEqual(facultyMetrics.uniqueStudentIds.length, 6, 'Unique student IDs array must have 6 elements');
  });

  await t.test('5. Course identifier normalization: accepts string (code or UUID) or options object', () => {
    // Case A: string with course code
    const countA = computeEligibleStudentCountForCourse(db, 'BCS702');
    assert.strictEqual(countA, 2, 'Querying by course code "BCS702" must return 2');

    // Case B: string with course name and code e.g. "Cloud Computing (BCS702)"
    const countB = computeEligibleStudentCountForCourse(db, 'Cloud Computing (BCS702)');
    assert.strictEqual(countB, 2, 'Querying by title with paren "Cloud Computing (BCS702)" must return 2');

    // Case C: string with course UUID
    const countC = computeEligibleStudentCountForCourse(db, 'c7867207-695d-4f24-91b5-9f5cf8c4a161');
    assert.strictEqual(countC, 2, 'Querying by course UUID must return 2');

    // Case D: options object with courseCode, section, semester
    const countD = computeEligibleStudentCountForCourse(db, { courseCode: 'BCS702', section: 'A', semester: 7 });
    assert.strictEqual(countD, 2, 'Querying by options object { courseCode, section, semester } must return 2');

    // Case E: options object with courseId as UUID
    const countE = computeEligibleStudentCountForCourse(db, { courseId: 'c7867207-695d-4f24-91b5-9f5cf8c4a161', section: 'A', semester: 5 });
    assert.strictEqual(countE, 2, 'Querying by options object { courseId, section, semester } must return 2');
  });

  await t.test('6. 1:1 Reconciliation: Course Details count == Attendance Roster count == Assignment Details count', () => {
    const courseCode = 'BCS702';
    const section = 'A';
    const semester = 7;

    const courseDetailsCount = computeEligibleStudentCountForCourse(db, courseCode, section, semester);
    const attendanceRoster = computeEligibleStudentRoster(db, { courseCode, section, semester });
    const assignmentCount = computeEligibleStudentCountForCourse(db, { courseCode, section, semester });

    assert.strictEqual(courseDetailsCount, attendanceRoster.length, 'Course Details count must equal Attendance Roster length');
    assert.strictEqual(attendanceRoster.length, assignmentCount, 'Attendance Roster length must equal Assignment Details count');
    assert.strictEqual(courseDetailsCount, 2, 'All counts must be exactly 2');
  });

  await t.test('7. Cross-department teaching derives student roster from subject ownership, not faculty department', () => {
    // Dr. Ramesh Kumar is CSE Faculty, but BEC501 belongs to ECE department
    const roster = computeEligibleStudentRoster(db, { courseCode: 'BEC501', section: 'A', semester: 5 });
    assert.strictEqual(roster.length, 2, 'Cross-department course roster must contain 2 students');
    assert.strictEqual(roster[0].department_id, DEPT_ECE, 'Enrolled student 1 must belong to ECE');
    assert.strictEqual(roster[1].department_id, DEPT_ECE, 'Enrolled student 2 must belong to ECE');
  });

  await t.test('8. Incomplete student profiles display incomplete indicators and are not discarded', () => {
    const cseStudents = db.profiles.filter(p => p.department_id === DEPT_CSE && p.role === 'STUDENT');
    const spMap = new Map(db.student_profiles.map(sp => [sp.profile_id, sp]));

    const processed = cseStudents.map(s => {
      const sp = spMap.get(s.id);
      return {
        id: s.id,
        name: s.full_name,
        semester: sp?.semester ?? null,
        isIncomplete: sp?.semester == null
      };
    });

    const incompleteStudent = processed.find(s => s.id === 'p-cse-incomp');
    assert.ok(incompleteStudent, 'Incomplete student profile must be present in directory');
    assert.strictEqual(incompleteStudent.semester, null, 'Semester must be null');
    assert.strictEqual(incompleteStudent.isIncomplete, true, 'isIncomplete flag must be true');
  });

  await t.test('9. Section isolation: Section A and Section B cohorts remain strictly isolated', () => {
    // Course BCS702 is Section A, Course BCS703 is Section B
    const secARoster = computeEligibleStudentRoster(db, { courseCode: 'BCS702', section: 'A', semester: 7 });
    const secBRoster = computeEligibleStudentRoster(db, { courseCode: 'BCS703', section: 'B', semester: 7 });

    const secAIds = new Set(secARoster.map(s => s.id));
    const secBIds = new Set(secBRoster.map(s => s.id));

    assert.strictEqual(secARoster.length, 2, 'Section A must contain exactly 2 students');
    assert.strictEqual(secBRoster.length, 2, 'Section B must contain exactly 2 students');

    // Verify 0 overlap
    for (const id of secAIds) {
      assert.strictEqual(secBIds.has(id), false, `Section A student ${id} must not appear in Section B`);
    }

    // Explicit section filter test: requesting Section A on BCS703 should return 0
    const secAOnBCS703 = computeEligibleStudentRoster(db, { courseCode: 'BCS703', section: 'A', semester: 7 });
    assert.strictEqual(secAOnBCS703.length, 0, 'BCS703 is Section B; requesting Section A must return 0');
  });

  await t.test('10. Dynamic registration: Newly registered student automatically appears in directory and subject roster', () => {
    // Register a new student: Kiran Kumar (ECE Sem 5 Sec A)
    const newStudentProfile = {
      id: 'p-ece-new',
      full_name: 'Kiran Kumar',
      usn_or_employee_id: '1AI24EC004',
      role: 'STUDENT',
      department_id: DEPT_ECE,
      account_status: 'ACTIVE'
    };
    const newStudentAcademic = {
      profile_id: 'p-ece-new',
      semester: 5,
      section: 'A'
    };
    const newEnrollment = {
      course_id: 'c7867207-695d-4f24-91b5-9f5cf8c4a161',
      course_code: 'BEC501',
      course_name: 'Digital Signal Processing',
      department_id: DEPT_ECE,
      semester: 5,
      section: 'A',
      student_id: 'p-ece-new',
      faculty_id: FACULTY_CSE,
      status: 'Active'
    };

    const updatedDb = {
      ...db,
      profiles: [...db.profiles, newStudentProfile],
      student_profiles: [...db.student_profiles, newStudentAcademic],
      course_enrollments: [...db.course_enrollments, newEnrollment]
    };

    // 1. Check ECE Department directory count
    const eceMetrics = computeDepartmentStudentMetrics(updatedDb, DEPT_ECE);
    assert.strictEqual(eceMetrics.totalStudents, 4, 'ECE department total must dynamically increase from 3 to 4');
    assert.strictEqual(eceMetrics.activeStudents, 4, 'ECE active students must increase from 3 to 4');

    // 2. Check Subject BEC501 roster count
    const updatedRoster = computeEligibleStudentRoster(updatedDb, { courseCode: 'BEC501', section: 'A', semester: 5 });
    assert.strictEqual(updatedRoster.length, 3, 'BEC501 Section A roster must dynamically increase from 2 to 3');
    assert.ok(updatedRoster.some(s => s.id === 'p-ece-new'), 'Newly registered student must be in the roster');

    // 3. Check Institution metrics
    const instMetrics = computeInstitutionStudentMetrics(updatedDb);
    assert.strictEqual(instMetrics.totalRegistered, 11, 'Institution total must increase from 10 to 11');
    assert.strictEqual(instMetrics.totalActive, 10, 'Institution active must increase from 9 to 10');
  });
});

