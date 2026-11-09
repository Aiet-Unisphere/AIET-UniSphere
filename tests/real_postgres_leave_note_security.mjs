/**
 * AIET-UniSphere - MISSION 09.2: Real PostgreSQL 16 Leave Note Snapshots & RPC Security Suite
 * 
 * Tests the Leave Request Snapshots, Approval Remarks, and review_leave_request RPC against
 * PostgreSQL 16 on port 54333:
 * - Table schema and snapshot columns verification
 * - Student RLS isolation (cross-student read blocking)
 * - Departmental HOD authorization and cross-department defense
 * - Approval remarks recording and RPC transaction atomicity
 * - Rejection reason mandatory check
 * - Immutability of reviewed status (double-review prevention)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const PSQL_PATH = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';
const DB_HOST = process.env.PGHOST || '127.0.0.1';
const DB_PORT = process.env.PGPORT || '54333';
const DB_USER = process.env.PGUSER || 'postgres';
const DB_NAME = process.env.PGDATABASE || 'postgres';

async function runSql(sql) {
  try {
    const { stdout, stderr } = await execFileAsync(PSQL_PATH, [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', DB_NAME,
      '-q',
      '-v', 'ON_ERROR_STOP=1',
      '-t', '-A',
      '-c', sql
    ], { encoding: 'utf8' });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { success: false, error: err.message, stderr: (err.stderr || '').trim() };
  }
}

async function runSqlAsUser(userId, sql) {
  const fullSql = `
    BEGIN;
    SET ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    SET LOCAL "request.jwt.claims" = '{"sub": "${userId}", "role": "authenticated"}';
    ${sql}
    COMMIT;
  `;
  return await runSql(fullSql);
}

async function runSqlAsAnon(sql) {
  const fullSql = `
    BEGIN;
    SET ROLE anon;
    SET LOCAL "request.jwt.claim.role" = 'anon';
    SET LOCAL "request.jwt.claims" = '{"role": "anon"}';
    ${sql}
    COMMIT;
  `;
  return await runSql(fullSql);
}

async function run() {
  console.log('=== AIET-UniSphere MISSION 09.2: Real PostgreSQL 16 Leave Note Security ===\n');

  // 0. Connection probe
  const probe = await runSql('SELECT version();');
  assert.equal(probe.success, true, `PostgreSQL connection failed: ${probe.stderr}`);
  console.log('✔ [0/14] Connection verified to PostgreSQL 16 on port 54333.');

  // Apply migrations 00041 and 00042 to ensure schema and privileges are active
  await execFileAsync(PSQL_PATH, [
    '-h', DB_HOST,
    '-p', DB_PORT,
    '-U', DB_USER,
    '-d', DB_NAME,
    '-q',
    '-v', 'ON_ERROR_STOP=1',
    '-f', 'supabase/migrations/00041_leave_note_snapshots_and_remarks.sql'
  ], { encoding: 'utf8' });

  await execFileAsync(PSQL_PATH, [
    '-h', DB_HOST,
    '-p', DB_PORT,
    '-U', DB_USER,
    '-d', DB_NAME,
    '-q',
    '-v', 'ON_ERROR_STOP=1',
    '-f', 'supabase/migrations/00042_leave_note_security_and_provenance.sql'
  ], { encoding: 'utf8' });
  console.log('✔ Migrations 00041 and 00042 applied cleanly.');

  // 1. Schema check: Verify all 9 snapshot & remarks columns exist
  const colCheck = await runSql(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'leave_requests'
      AND column_name IN (
        'student_name_snapshot',
        'student_usn_snapshot',
        'branch_snapshot',
        'section_snapshot',
        'semester_snapshot',
        'academic_year_snapshot',
        'student_phone_snapshot',
        'parent_phone_snapshot',
        'approval_remarks'
      )
    ORDER BY column_name;
  `);
  assert.equal(colCheck.success, true, `Column query failed: ${colCheck.stderr}`);
  const columnsFound = colCheck.stdout.split('\n').filter(Boolean);
  assert.equal(columnsFound.length, 9, `Expected 9 snapshot columns, found ${columnsFound.length}: ${columnsFound.join(', ')}`);
  console.log('✔ [1/8] All 9 snapshot and remarks columns verified in public.leave_requests.');

  // 2. Setup mock data fixtures
  const deptCseId = '11111111-1111-1111-1111-111111111111';
  const deptEceId = '22222222-2222-2222-2222-222222222222';
  const student1Id = 'a0000000-0000-0000-0000-000000000001';
  const student2Id = 'a0000000-0000-0000-0000-000000000002';
  const hodCseId = 'b0000000-0000-0000-0000-000000000001';
  const hodEceId = 'b0000000-0000-0000-0000-000000000002';

  const setupFixtures = await runSql(`
    -- Seed auth.users for foreign key constraints
    INSERT INTO auth.users (id) VALUES
      ('${student1Id}'),
      ('${student2Id}'),
      ('${hodCseId}'),
      ('${hodEceId}')
    ON CONFLICT (id) DO NOTHING;

    -- Setup Profiles
    INSERT INTO public.profiles (id, full_name, usn_or_employee_id, role, department_id, account_status)
    VALUES
      ('${student1Id}', 'Arjun Rao', '4AL21CS001', 'STUDENT', '${deptCseId}', 'ACTIVE'),
      ('${student2Id}', 'Neha Shetty', '4AL21CS002', 'STUDENT', '${deptCseId}', 'ACTIVE'),
      ('${hodCseId}', 'Dr. Ramesh HOD', 'EMP_CSE_01', 'HOD', '${deptCseId}', 'ACTIVE'),
      ('${hodEceId}', 'Dr. Suresh ECE HOD', 'EMP_ECE_01', 'HOD', '${deptEceId}', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, department_id = EXCLUDED.department_id;

    GRANT SELECT, INSERT, UPDATE ON public.leave_requests TO authenticated;
    GRANT SELECT ON public.profiles TO authenticated;
    GRANT SELECT ON public.departments TO authenticated;

    -- Setup Student Profiles
    INSERT INTO public.student_profiles (profile_id, semester, academic_year, phone, parent_phone)
    VALUES
      ('${student1Id}', 7, '2026-2027', '9876543210', '9876543211'),
      ('${student2Id}', 7, '2026-2027', '9876543220', '9876543221')
    ON CONFLICT (profile_id) DO UPDATE SET 
      semester = EXCLUDED.semester, 
      academic_year = EXCLUDED.academic_year, 
      phone = EXCLUDED.phone, 
      parent_phone = EXCLUDED.parent_phone;
  `);
  assert.equal(setupFixtures.success, true, `Fixture setup failed: ${setupFixtures.stderr}`);
  console.log('✔ [2/8] Department, Profile, and Student Profile fixtures seeded.');

  // 3. Test insert with snapshots
  const leaveId1 = 'c0000000-0000-0000-0000-000000000001';
  const insertLeave = await runSql(`
    DELETE FROM public.leave_requests WHERE id = '${leaveId1}';

    INSERT INTO public.leave_requests (
      id,
      reference_id,
      student_id,
      department_id,
      hod_id,
      leave_type,
      reason,
      start_date,
      end_date,
      status,
      student_name_snapshot,
      student_usn_snapshot,
      branch_snapshot,
      section_snapshot,
      semester_snapshot,
      academic_year_snapshot,
      student_phone_snapshot,
      parent_phone_snapshot
    ) VALUES (
      '${leaveId1}',
      'LV-TEST-101',
      '${student1Id}',
      '${deptCseId}',
      '${hodCseId}',
      'Academic Duty / Event',
      'VTU State Level Hackathon participation',
      '2026-11-12',
      '2026-11-14',
      'PENDING',
      'Arjun Rao',
      '4AL21CS001',
      'Computer Science & Engineering',
      'CSE-A',
      7,
      '2026-2027',
      '9876543210',
      '9876543211'
    );
  `);
  assert.equal(insertLeave.success, true, `Leave insert failed: ${insertLeave.stderr}`);
  console.log('✔ [3/8] Leave request with immutable snapshot columns inserted successfully.');

  // 4. Test RLS Student Isolation: Student 1 can select, Student 2 CANNOT
  const s1Read = await runSqlAsUser(student1Id, `
    SELECT id, reference_id, student_name_snapshot, section_snapshot 
    FROM public.leave_requests 
    WHERE id = '${leaveId1}';
  `);
  assert.equal(s1Read.success, true, `Student 1 read failed: ${s1Read.stderr}`);
  assert.ok(s1Read.stdout.includes('LV-TEST-101'), 'Student 1 must be able to read own leave request');

  const s2Read = await runSqlAsUser(student2Id, `
    SELECT id, reference_id 
    FROM public.leave_requests 
    WHERE id = '${leaveId1}';
  `);
  assert.equal(s2Read.success, true);
  assert.equal(s2Read.stdout, '', 'Student 2 must NOT be able to read Student 1 leave request (RLS isolation)');
  console.log('✔ [4/8] Row-Level Security isolation verified: cross-student read denied.');

  // 5. Test Cross-Department HOD Access Block via RPC
  const crossDeptReview = await runSqlAsUser(hodEceId, `
    SELECT public.review_leave_request('${leaveId1}'::uuid, 'APPROVED', NULL, 'ECE HOD Attempt');
  `);
  assert.equal(crossDeptReview.success, false, 'Cross-department HOD review must fail');
  assert.ok(
    crossDeptReview.stderr.includes('ACCESS DENIED') || crossDeptReview.stderr.includes('department'),
    'Expected ACCESS DENIED for cross-department HOD'
  );
  console.log('✔ [5/8] Cross-department review authorization guard strictly enforced.');

  // 6. Test Authorized HOD Approval with Approval Remarks
  const authApproval = await runSqlAsUser(hodCseId, `
    SELECT public.review_leave_request(
      '${leaveId1}'::uuid, 
      'APPROVED', 
      NULL, 
      'Official academic duty sanctioned under VTU guidelines.'
    );
  `);
  assert.equal(authApproval.success, true, `Authorized approval failed: ${authApproval.stderr}`);

  // Inspect database record after approval
  const approvedCheck = await runSql(`
    SELECT status, reviewed_by, approval_remarks 
    FROM public.leave_requests 
    WHERE id = '${leaveId1}';
  `);
  assert.equal(approvedCheck.success, true);
  assert.ok(approvedCheck.stdout.includes('APPROVED'), 'Status must be APPROVED');
  assert.ok(approvedCheck.stdout.includes(hodCseId), 'Reviewed by must be CSE HOD id');
  assert.ok(
    approvedCheck.stdout.includes('Official academic duty sanctioned under VTU guidelines.'),
    'Approval remarks must be stored in database'
  );
  console.log('✔ [6/8] Authorized HOD approval succeeded and recorded approval_remarks.');

  // 7. Test Double-Review Prevention (Immutability)
  const doubleReview = await runSqlAsUser(hodCseId, `
    SELECT public.review_leave_request('${leaveId1}'::uuid, 'REJECTED', 'Cannot reject after approval');
  `);
  assert.equal(doubleReview.success, false, 'Double review must fail');
  assert.ok(
    doubleReview.stderr.includes('already been reviewed'),
    'Expected error indicating request was already reviewed'
  );
  console.log('✔ [7/8] Double-review prevention guard successfully verified.');

  // 8. Test Mandatory Rejection Reason on a fresh pending leave
  const leaveId2 = 'c0000000-0000-0000-0000-000000000002';
  await runSql(`
    DELETE FROM public.leave_requests WHERE id = '${leaveId2}';
    INSERT INTO public.leave_requests (id, reference_id, student_id, department_id, hod_id, leave_type, reason, start_date, end_date, status)
    VALUES ('${leaveId2}', 'LV-TEST-102', '${student1Id}', '${deptCseId}', '${hodCseId}', 'Personal', 'Family function', '2026-11-15', '2026-11-16', 'PENDING');
  `);

  const emptyReject = await runSqlAsUser(hodCseId, `
    SELECT public.review_leave_request('${leaveId2}'::uuid, 'REJECTED', '');
  `);
  assert.equal(emptyReject.success, false, 'Rejection without reason must fail');
  assert.ok(
    emptyReject.stderr.includes('Rejection reason is required'),
    'Expected rejection reason required error'
  );
  console.log('✔ [8/8] Mandatory rejection reason requirement verified.');

  // 9. Privilege Hardening: Anonymous (anon) caller cannot execute review_leave_request
  const anonReview = await runSqlAsAnon(`
    SELECT public.review_leave_request('${leaveId1}'::uuid, 'APPROVED', NULL, 'Anon Exploit');
  `);
  assert.equal(anonReview.success, false, 'Anon user must not be permitted to execute review_leave_request');
  assert.ok(
    anonReview.stderr.includes('permission denied') || anonReview.stderr.includes('ACL'),
    `Expected permission denied for anon role, got: ${anonReview.stderr}`
  );
  console.log('✔ [9/14] Anonymous execution privilege strictly revoked at PostgreSQL catalog level.');

  // 10. Student INSERT Hardening: Student cannot forge status = 'APPROVED' via direct REST INSERT
  const forgeStatusId = 'c0000000-0000-0000-0000-000000000091';
  await runSql(`DELETE FROM public.leave_requests WHERE id = '${forgeStatusId}';`);
  const forgeStatusAttempt = await runSqlAsUser(student1Id, `
    INSERT INTO public.leave_requests (
      id, reference_id, student_id, department_id, leave_type, reason, start_date, end_date, status
    ) VALUES (
      '${forgeStatusId}', 'LV-FORGE-1', '${student1Id}', '${deptCseId}', 'Personal', 'Trip', '2026-11-20', '2026-11-21', 'APPROVED'
    );
  `);
  assert.equal(forgeStatusAttempt.success, false, 'Student must not be able to insert leave with status = APPROVED');
  assert.ok(
    forgeStatusAttempt.stderr.includes('violates row-level security policy'),
    `Expected RLS policy violation for forged status, got: ${forgeStatusAttempt.stderr}`
  );
  console.log('✔ [10/14] Direct REST INSERT forging status = APPROVED blocked by RLS.');

  // 11. Student INSERT Hardening: Student cannot supply reviewed_by or approval_remarks
  const forgeReviewerId = 'c0000000-0000-0000-0000-000000000092';
  await runSql(`DELETE FROM public.leave_requests WHERE id = '${forgeReviewerId}';`);
  const forgeReviewerAttempt = await runSqlAsUser(student1Id, `
    INSERT INTO public.leave_requests (
      id, reference_id, student_id, department_id, leave_type, reason, start_date, end_date, status, reviewed_by, approval_remarks
    ) VALUES (
      '${forgeReviewerId}', 'LV-FORGE-2', '${student1Id}', '${deptCseId}', 'Personal', 'Trip', '2026-11-20', '2026-11-21', 'PENDING', '${hodCseId}', 'Self-Approved'
    );
  `);
  assert.equal(forgeReviewerAttempt.success, false, 'Student must not be able to set reviewed_by or approval_remarks on INSERT');
  assert.ok(
    forgeReviewerAttempt.stderr.includes('violates row-level security policy'),
    `Expected RLS policy violation for forged review fields, got: ${forgeReviewerAttempt.stderr}`
  );
  console.log('✔ [11/14] Direct REST INSERT forging reviewed_by / approval_remarks blocked by RLS.');

  // 12. Student INSERT Hardening: Student cannot forge snapshot_provenance = 'RETROACTIVE_BACKFILL'
  const forgeProvId = 'c0000000-0000-0000-0000-000000000093';
  await runSql(`DELETE FROM public.leave_requests WHERE id = '${forgeProvId}';`);
  const forgeProvAttempt = await runSqlAsUser(student1Id, `
    INSERT INTO public.leave_requests (
      id, reference_id, student_id, department_id, leave_type, reason, start_date, end_date, status, snapshot_provenance
    ) VALUES (
      '${forgeProvId}', 'LV-FORGE-3', '${student1Id}', '${deptCseId}', 'Personal', 'Trip', '2026-11-20', '2026-11-21', 'PENDING', 'RETROACTIVE_BACKFILL'
    );
  `);
  assert.equal(forgeProvAttempt.success, false, 'Student must not be able to set snapshot_provenance = RETROACTIVE_BACKFILL');
  assert.ok(
    forgeProvAttempt.stderr.includes('violates row-level security policy'),
    `Expected RLS policy violation for forged snapshot provenance, got: ${forgeProvAttempt.stderr}`
  );
  console.log('✔ [12/14] Direct REST INSERT forging snapshot_provenance blocked by RLS.');

  // 13. Legitimate Student INSERT: status = 'PENDING', snapshot_provenance = 'SUBMISSION'
  const legitLeaveId = 'c0000000-0000-0000-0000-000000000094';
  await runSql(`DELETE FROM public.leave_requests WHERE id = '${legitLeaveId}';`);
  const legitInsert = await runSqlAsUser(student1Id, `
    INSERT INTO public.leave_requests (
      id, reference_id, student_id, department_id, leave_type, reason, start_date, end_date, status, snapshot_provenance
    ) VALUES (
      '${legitLeaveId}', 'LV-LEGIT-1', '${student1Id}', '${deptCseId}', 'Personal', 'Legitimate family function', '2026-11-20', '2026-11-21', 'PENDING', 'SUBMISSION'
    );
  `);
  assert.equal(legitInsert.success, true, `Legitimate insert should succeed, got error: ${legitInsert.stderr}`);
  console.log('✔ [13/14] Legitimate student leave submission via RLS succeeds with status = PENDING.');

  // 14. snapshot_provenance CHECK constraint validation
  const invalidProvId = 'c0000000-0000-0000-0000-000000000095';
  const invalidProv = await runSql(`
    INSERT INTO public.leave_requests (
      id, reference_id, student_id, department_id, leave_type, reason, start_date, end_date, status, snapshot_provenance
    ) VALUES (
      '${invalidProvId}', 'LV-INVALID-PROV', '${student1Id}', '${deptCseId}', 'Personal', 'Test', '2026-11-20', '2026-11-21', 'PENDING', 'INVALID_PROVENANCE_VALUE'
    );
  `);
  assert.equal(invalidProv.success, false, 'Invalid snapshot provenance value must violate check constraint');
  assert.ok(
    invalidProv.stderr.includes('check constraint') || invalidProv.stderr.includes('violates'),
    `Expected check constraint violation, got: ${invalidProv.stderr}`
  );
  console.log('✔ [14/14] snapshot_provenance domain CHECK constraint verified.');

  console.log('\n================================================================');
  console.log('All 14 Real PostgreSQL 16 Leave Note & RPC Security tests PASSED!');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('\nFAILED VERIFICATION:', err);
  process.exit(1);
});
