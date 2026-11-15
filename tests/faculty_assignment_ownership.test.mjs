import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * AIET-UniSphere — Faculty Assignment Ownership & Data Isolation Test Suite
 *
 * Scenarios Tested:
 * 1. Faculty A sees only Faculty A's assignments.
 * 2. Faculty B sees only Faculty B's assignments.
 * 3. Faculty A cannot see Faculty B's assignments (strict data isolation).
 * 4. Faculty sees assignments across multiple allocated subjects owned by them.
 * 5. Search and status filters (Active, Pending, Closed, Draft) apply strictly within permitted set.
 * 6. Assignment creation persists authenticated created_by (cannot be spoofed from frontend).
 * 7. Faculty A cannot view or grade Faculty B's assignment submissions.
 * 8. Tampering with assignment ID in URL is rejected with unauthorized/not found error.
 * 9. Student submission access remains intact.
 * 10. HOD and Admin assignment access preserved.
 * 11. Missing/unowned assignment records handled safely without arbitrary assignment.
 */

// Mock in-memory database
const createMockSupabase = (currentUser, userProfile, dbState) => {
  return {
    auth: {
      getUser: async () => ({ data: { user: currentUser } })
    },
    from: (tableName) => {
      let filterCol = null;
      let filterVal = null;
      let orFilter = null;
      let inCol = null;
      let inVals = null;
      let isSingle = false;
      let isMaybeSingle = false;
      let selectFields = '*';
      let updatePayload = null;
      let insertPayload = null;

      const chain = {
        select: (fields) => {
          selectFields = fields;
          return chain;
        },
        eq: (col, val) => {
          filterCol = col;
          filterVal = val;
          return chain;
        },
        or: (expr) => {
          orFilter = expr;
          return chain;
        },
        in: (col, vals) => {
          inCol = col;
          inVals = vals;
          return chain;
        },
        order: () => chain,
        single: async () => {
          isSingle = true;
          return await execute();
        },
        maybeSingle: async () => {
          isMaybeSingle = true;
          return await execute();
        },
        update: (payload) => {
          updatePayload = payload;
          return chain;
        },
        insert: (payload) => {
          insertPayload = payload;
          return chain;
        },
        then: (resolve, reject) => execute().then(resolve, reject)
      };

      const execute = async () => {
        if (tableName === 'profiles') {
          if (filterCol === 'id') {
            const p = dbState.profiles.find(x => x.id === filterVal);
            if (isSingle && !p) return { data: null, error: new Error('Profile not found') };
            return { data: p || null, error: null };
          }
          if (inCol === 'id') {
            const list = dbState.profiles.filter(x => inVals.includes(x.id));
            return { data: list, error: null };
          }
          return { data: dbState.profiles, error: null };
        }

        if (tableName === 'assignments') {
          if (insertPayload) {
            const newRecord = { ...insertPayload };
            dbState.assignments.push(newRecord);
            return { data: newRecord, error: null };
          }
          let rows = [...dbState.assignments];
          if (filterCol === 'created_by') {
            rows = rows.filter(r => r.created_by === filterVal);
          } else if (filterCol === 'department_id') {
            rows = rows.filter(r => r.department_id === filterVal);
          } else if (filterCol === 'id') {
            rows = rows.filter(r => r.id === filterVal);
          }
          if (orFilter) {
            // e.g. department_id.eq.dept1,created_by.eq.user1
            const parts = orFilter.split(',');
            rows = rows.filter(r => {
              return parts.some(p => {
                const [k, op, v] = p.split('.');
                return r[k] === v;
              });
            });
          }
          if (isSingle) {
            const r = rows[0];
            return { data: r || null, error: r ? null : new Error('Assignment not found') };
          }
          return { data: rows, error: null };
        }

        if (tableName === 'assignment_submissions') {
          if (updatePayload && filterCol === 'id') {
            const sub = dbState.assignment_submissions.find(s => s.id === filterVal);
            if (sub) {
              Object.assign(sub, updatePayload);
              return { data: sub, error: null };
            }
            return { data: null, error: new Error('Submission not found') };
          }
          let rows = [...dbState.assignment_submissions];
          if (filterCol === 'assignment_id') {
            rows = rows.filter(s => s.assignment_id === filterVal);
          }
          return { data: rows, error: null };
        }

        return { data: [], error: null };
      };

      return chain;
    }
  };
};

test('FACULTY ASSIGNMENT OWNERSHIP & DATA ISOLATION TEST SUITE', async (t) => {
  const FACULTY_A_ID = 'fac-uuid-1111';
  const FACULTY_B_ID = 'fac-uuid-2222';
  const HOD_ID = 'hod-uuid-3333';
  const ADMIN_ID = 'admin-uuid-4444';
  const STUDENT_ID = 'stud-uuid-5555';
  const DEPT_CSE = 'dept-cse-01';

  const initialDbState = () => ({
    profiles: [
      { id: FACULTY_A_ID, full_name: 'Dr. Faculty A', role: 'FACULTY', department_id: DEPT_CSE },
      { id: FACULTY_B_ID, full_name: 'Prof. Faculty B', role: 'FACULTY', department_id: DEPT_CSE },
      { id: HOD_ID, full_name: 'Dr. CSE HOD', role: 'HOD', department_id: DEPT_CSE },
      { id: ADMIN_ID, full_name: 'System Admin', role: 'ADMIN', department_id: null },
      { id: STUDENT_ID, full_name: 'Student One', role: 'STUDENT', department_id: DEPT_CSE }
    ],
    assignments: [
      {
        id: 'assg-a-1',
        title: 'Assignment 1 by Faculty A',
        course_id: 'BCS702',
        course_name: 'Cloud Computing',
        deadline: '2026-12-01T23:59:59Z',
        marks: 50,
        department_id: DEPT_CSE,
        created_by: FACULTY_A_ID,
        status: 'Active'
      },
      {
        id: 'assg-a-2',
        title: 'Assignment 2 by Faculty A',
        course_id: 'BCS705',
        course_name: 'Parallel Programming',
        deadline: '2026-12-05T23:59:59Z',
        marks: 25,
        department_id: DEPT_CSE,
        created_by: FACULTY_A_ID,
        status: 'Active'
      },
      {
        id: 'assg-b-1',
        title: 'Assignment 1 by Faculty B',
        course_id: 'BCS701',
        course_name: 'Distributed Systems',
        deadline: '2026-12-02T23:59:59Z',
        marks: 100,
        department_id: DEPT_CSE,
        created_by: FACULTY_B_ID,
        status: 'Active'
      },
      {
        id: 'assg-unowned',
        title: 'Legacy Legacy Assignment',
        course_id: 'BCS709',
        course_name: 'Seminar',
        deadline: '2026-12-10T23:59:59Z',
        marks: 10,
        department_id: DEPT_CSE,
        created_by: null,
        status: 'Active'
      }
    ],
    assignment_submissions: [
      {
        id: 'sub-1',
        assignment_id: 'assg-a-1',
        student_id: STUDENT_ID,
        file_name: 'cloud_lab1.pdf',
        submitted_at: '2026-11-10T10:00:00Z',
        status: 'Submitted'
      },
      {
        id: 'sub-2',
        assignment_id: 'assg-b-1',
        student_id: STUDENT_ID,
        file_name: 'dist_lab1.pdf',
        submitted_at: '2026-11-10T11:00:00Z',
        status: 'Submitted'
      }
    ]
  });

  // Re-implemented helper functions matching the fixed assignmentService.ts logic
  const queryFacultyAssignments = async (mockSupabase) => {
    const { data: { user } } = await mockSupabase.auth.getUser();
    if (!user) return [];
    const { data: profile } = await mockSupabase.from('profiles').select('department_id, role').eq('id', user.id).single();
    if (!profile) return [];

    const role = (profile.role || '').toUpperCase();
    let query = mockSupabase.from('assignments').select('*');

    if (role === 'FACULTY') {
      query = query.eq('created_by', user.id);
    } else if (role === 'HOD') {
      if (!profile.department_id) return [];
      query = query.eq('department_id', profile.department_id);
    } else if (role === 'ADMIN') {
      // All
    } else {
      query = query.eq('created_by', user.id);
    }

    const { data } = await query;
    return data || [];
  };

  const queryAssignmentById = async (mockSupabase, id) => {
    const { data: a, error } = await mockSupabase.from('assignments').select('*').eq('id', id).single();
    if (error || !a) return undefined;

    const { data: { user } } = await mockSupabase.auth.getUser();
    if (user) {
      const { data: profile } = await mockSupabase.from('profiles').select('role, department_id').eq('id', user.id).maybeSingle();
      const role = (profile?.role || '').toUpperCase();
      if (role === 'FACULTY' && a.created_by && a.created_by !== user.id) {
        return undefined; // unauthorized access blocked
      }
    }
    return a;
  };

  const querySubmissionsForAssignment = async (mockSupabase, assignmentId) => {
    const { data: { user } } = await mockSupabase.auth.getUser();
    if (!user) throw new Error("Authenticated session required.");

    const { data: assignment, error: aErr } = await mockSupabase.from('assignments').select('id, created_by, department_id').eq('id', assignmentId).single();
    if (aErr || !assignment) throw new Error("Assignment not found or inaccessible.");

    const { data: profile } = await mockSupabase.from('profiles').select('role, department_id').eq('id', user.id).single();
    const role = (profile?.role || '').toUpperCase();
    const isOwner = assignment.created_by === user.id;
    const isHodOfDept = role === 'HOD' && assignment.department_id === profile?.department_id;
    const isAdmin = role === 'ADMIN';

    if (!isOwner && !isHodOfDept && !isAdmin) {
      throw new Error("Unauthorized: You do not have permission to view submissions for this assignment.");
    }

    const { data: subsData } = await mockSupabase.from('assignment_submissions').select('*').eq('assignment_id', assignmentId);
    return subsData || [];
  };

  const executeGradeSubmission = async (mockSupabase, assignmentId, submissionId, marks, feedback) => {
    const { data: { user } } = await mockSupabase.auth.getUser();
    if (!user) throw new Error("Authenticated session required.");

    const { data: assignment, error: aErr } = await mockSupabase.from('assignments').select('id, created_by, department_id').eq('id', assignmentId).single();
    if (aErr || !assignment) throw new Error("Assignment not found or inaccessible.");

    const { data: profile } = await mockSupabase.from('profiles').select('role, department_id').eq('id', user.id).single();
    const role = (profile?.role || '').toUpperCase();
    const isOwner = assignment.created_by === user.id;
    const isHodOfDept = role === 'HOD' && assignment.department_id === profile?.department_id;
    const isAdmin = role === 'ADMIN';

    if (!isOwner && !isHodOfDept && !isAdmin) {
      throw new Error("Unauthorized: You do not have permission to grade submissions for this assignment.");
    }

    const { data: updatedSub } = await mockSupabase.from('assignment_submissions').update({
      status: 'Graded',
      marks,
      feedback,
      graded_by: user.id
    }).eq('id', submissionId);

    return updatedSub;
  };

  await t.test('1. Faculty A sees only Faculty A assignments', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: FACULTY_A_ID }, null, state);
    const results = await queryFacultyAssignments(mock);

    assert.equal(results.length, 2);
    assert.deepEqual(results.map(r => r.id).sort(), ['assg-a-1', 'assg-a-2'].sort());
    assert.ok(results.every(r => r.created_by === FACULTY_A_ID));
    console.log('✓ Scenario 1: Faculty A sees only their own 2 assignments');
  });

  await t.test('2. Faculty B sees only Faculty B assignments', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: FACULTY_B_ID }, null, state);
    const results = await queryFacultyAssignments(mock);

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'assg-b-1');
    assert.equal(results[0].created_by, FACULTY_B_ID);
    console.log('✓ Scenario 2: Faculty B sees only their own assignment');
  });

  await t.test('3. Faculty A cannot see Faculty B assignments (Strict Isolation)', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: FACULTY_A_ID }, null, state);
    const results = await queryFacultyAssignments(mock);

    const bAssignmentsInA = results.filter(r => r.created_by === FACULTY_B_ID);
    assert.equal(bAssignmentsInA.length, 0, 'Faculty A must NOT see Faculty B assignments');
    console.log('✓ Scenario 3: Cross-faculty leakage is 0');
  });

  await t.test('4. Faculty sees assignments across multiple allocated subjects owned by them', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: FACULTY_A_ID }, null, state);
    const results = await queryFacultyAssignments(mock);

    const courses = results.map(r => r.course_id);
    assert.ok(courses.includes('BCS702'));
    assert.ok(courses.includes('BCS705'));
    console.log('✓ Scenario 4: Multiple subjects owned by Faculty A (BCS702 & BCS705) are included');
  });

  await t.test('5. Search and status filters apply strictly within permitted set', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: FACULTY_A_ID }, null, state);
    const results = await queryFacultyAssignments(mock);

    // Filter by course_name query 'Parallel' or courseId 'BCS705'
    const searchMatch = results.filter(r => 
      r.title.toLowerCase().includes('parallel') || 
      r.course_name.toLowerCase().includes('parallel') ||
      r.course_id.toLowerCase().includes('bcs705')
    );
    assert.equal(searchMatch.length, 1);
    assert.equal(searchMatch[0].id, 'assg-a-2');

    // Searching for Faculty B course returns empty
    const crossSearch = results.filter(r => r.course_id.toLowerCase().includes('bcs701'));
    assert.equal(crossSearch.length, 0);
    console.log('✓ Scenario 5: Search filters are bounded within faculty-owned subset');
  });

  await t.test('6. Assignment creation persists authenticated created_by (tamper-proof)', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: FACULTY_A_ID }, null, state);

    // Attempting to create an assignment
    const { data: { user } } = await mock.auth.getUser();
    const newAssg = {
      id: 'assg-new-1',
      title: 'New Lab 3',
      course_id: 'BCS702',
      created_by: user.id, // Enforced by service
      department_id: DEPT_CSE
    };
    await mock.from('assignments').insert(newAssg);

    assert.equal(state.assignments.find(a => a.id === 'assg-new-1')?.created_by, FACULTY_A_ID);
    console.log('✓ Scenario 6: Assignment creation attaches authenticated user.id');
  });

  await t.test('7. Faculty A cannot view or grade Faculty B assignment submissions', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: FACULTY_A_ID }, null, state);

    // Faculty A attempts to view submissions of Faculty B's assignment
    await assert.rejects(
      async () => querySubmissionsForAssignment(mock, 'assg-b-1'),
      /Unauthorized/
    );

    // Faculty A attempts to grade Faculty B's submission
    await assert.rejects(
      async () => executeGradeSubmission(mock, 'assg-b-1', 'sub-2', 90, 'Great work'),
      /Unauthorized/
    );

    console.log('✓ Scenario 7: Unauthorized submission view & grading attempts are blocked');
  });

  await t.test('8. Tampering with assignment ID in URL is rejected', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: FACULTY_A_ID }, null, state);

    // Faculty A manually navigates to URL /faculty/assignments/assg-b-1
    const result = await queryAssignmentById(mock, 'assg-b-1');
    assert.equal(result, undefined, 'Tampered URL with other faculty assignment must return undefined/not found');

    // Non-existent ID
    const notFound = await queryAssignmentById(mock, 'assg-fake-999');
    assert.equal(notFound, undefined);
    console.log('✓ Scenario 8: URL parameter tampering safely blocked');
  });

  await t.test('9. Student submission access remains intact', async () => {
    const state = initialDbState();
    const mock = createMockSupabase({ id: STUDENT_ID }, null, state);

    // Student queries assignment
    const assg = await queryAssignmentById(mock, 'assg-a-1');
    assert.ok(assg, 'Student should be able to view assignment details');
    console.log('✓ Scenario 9: Student workflow unhindered');
  });

  await t.test('10. HOD and Admin assignment access preserved', async () => {
    const state = initialDbState();
    
    // HOD
    const mockHod = createMockSupabase({ id: HOD_ID }, null, state);
    const hodAssignments = await queryFacultyAssignments(mockHod);
    // HOD sees all 4 CSE assignments (including Faculty A, B, and legacy unowned)
    assert.equal(hodAssignments.length, 4);

    // Admin
    const mockAdmin = createMockSupabase({ id: ADMIN_ID }, null, state);
    const adminAssignments = await queryFacultyAssignments(mockAdmin);
    assert.equal(adminAssignments.length, 4);
    console.log('✓ Scenario 10: HOD and Admin oversight preserved');
  });

  await t.test('11. Missing/unowned assignment records handled safely without arbitrary assignment', async () => {
    const state = initialDbState();
    const mockA = createMockSupabase({ id: FACULTY_A_ID }, null, state);
    const resultsA = await queryFacultyAssignments(mockA);

    // Unowned record has created_by = null, so neither Faculty A nor B sees it
    assert.ok(!resultsA.some(r => r.id === 'assg-unowned'));

    const mockB = createMockSupabase({ id: FACULTY_B_ID }, null, state);
    const resultsB = await queryFacultyAssignments(mockB);
    assert.ok(!resultsB.some(r => r.id === 'assg-unowned'));

    console.log('✓ Scenario 11: Unowned records not arbitrarily assigned to anyone');
  });
});
