import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);
const PSQL_PATH = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';
const DB_HOST = process.env.PGHOST || '127.0.0.1';
const DB_PORT = process.env.PGPORT || '54333';
const DB_USER = process.env.PGUSER || 'postgres';
const DB_NAME = 'aiet_leave_concurrency_test';

async function runSql(sql, dbName = DB_NAME) {
  try {
    const { stdout, stderr } = await execFileAsync(PSQL_PATH, [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', dbName,
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

async function runSqlFile(filePath, dbName = DB_NAME) {
  try {
    const { stdout, stderr } = await execFileAsync(PSQL_PATH, [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', dbName,
      '-v', 'ON_ERROR_STOP=1',
      '-f', filePath
    ], { encoding: 'utf8' });
    return { success: true, stdout, stderr };
  } catch (err) {
    return { success: false, error: err.message, stderr: (err.stderr || '').trim() };
  }
}

test('Leave Migrations: Setup, Deterministic Provenance & Concurrency Suite', async (t) => {
  if (!fs.existsSync(PSQL_PATH)) {
    t.skip('Local PostgreSQL 16 binary not found at ' + PSQL_PATH);
    return;
  }
  // 1. Setup isolated test database
  await t.test('1. Setup clean isolated database and base schema', async () => {
    // Terminate connections & drop/create test database
    await runSql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}';`, 'postgres');
    await runSql(`DROP DATABASE IF EXISTS ${DB_NAME};`, 'postgres');
    const createRes = await runSql(`CREATE DATABASE ${DB_NAME};`, 'postgres');
    assert.equal(createRes.success, true, `Failed to create database: ${createRes.stderr}`);

    // Create necessary extensions and mock auth schema
    const initRes = await runSql(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub', true)::uuid $$;

      CREATE TABLE IF NOT EXISTS public.departments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        code text UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.profiles (
        id uuid PRIMARY KEY REFERENCES auth.users(id),
        email text,
        full_name text,
        usn_or_employee_id text,
        role text DEFAULT 'STUDENT',
        department_id uuid REFERENCES public.departments(id),
        account_status text DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS public.student_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id uuid REFERENCES public.profiles(id),
        semester int,
        academic_year text,
        phone text,
        parent_phone text
      );

      CREATE TABLE IF NOT EXISTS public.leave_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id uuid REFERENCES public.profiles(id) NOT NULL,
        department_id uuid REFERENCES public.departments(id) NOT NULL,
        hod_id uuid REFERENCES public.profiles(id),
        leave_type text NOT NULL,
        reason text NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        status text NOT NULL DEFAULT 'PENDING',
        reviewed_by uuid REFERENCES public.profiles(id),
        reviewed_at timestamptz,
        rejection_reason text,
        created_at timestamptz DEFAULT now(),
        reference_id text
      );

      CREATE TABLE IF NOT EXISTS public.notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        title text,
        short_message text,
        full_message text,
        source text,
        category text,
        type text,
        related_link text,
        created_at timestamptz DEFAULT now()
      );
    `);
    assert.equal(initRes.success, true, `Base schema creation failed: ${initRes.stderr}`);
  });

  // 2. Pre-populate historical data before migrations 00041 & 00042
  const student1Id = '11111111-1111-1111-1111-111111111111';
  const student2Id = '22222222-2222-2222-2222-222222222222';
  const hod1Id = '33333333-3333-3333-3333-333333333333';
  const hod2Id = '44444444-4444-4444-4444-444444444444';
  const dept1Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const dept2Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const historicalLeave1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const historicalLeave2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  await t.test('2. Seed historical records prior to migration 00041', async () => {
    const seedRes = await runSql(`
      INSERT INTO auth.users (id, email) VALUES 
        ('${student1Id}', 'student1@aiet.edu'),
        ('${student2Id}', 'student2@aiet.edu'),
        ('${hod1Id}', 'hod_cs@aiet.edu'),
        ('${hod2Id}', 'hod_ec@aiet.edu');

      INSERT INTO public.departments (id, name, code) VALUES 
        ('${dept1Id}', 'Computer Science', 'CSE'),
        ('${dept2Id}', 'Electronics', 'ECE');

      INSERT INTO public.profiles (id, email, full_name, usn_or_employee_id, role, department_id) VALUES
        ('${student1Id}', 'student1@aiet.edu', 'Rahul Kumar', '4AL22CS050', 'STUDENT', '${dept1Id}'),
        ('${student2Id}', 'student2@aiet.edu', 'Priya Sharma', NULL, 'STUDENT', '${dept1Id}'),
        ('${hod1Id}', 'hod_cs@aiet.edu', 'Dr. Anand HOD', 'EMP001', 'HOD', '${dept1Id}'),
        ('${hod2Id}', 'hod_ec@aiet.edu', 'Dr. Rekha HOD', 'EMP002', 'HOD', '${dept2Id}');

      INSERT INTO public.student_profiles (profile_id, semester, academic_year, phone, parent_phone) VALUES
        ('${student1Id}', 5, '2024-2025', '9900112233', '9900112244');

      -- Historical leave 1: Has valid student profile and student_profiles data
      INSERT INTO public.leave_requests (id, student_id, department_id, leave_type, reason, start_date, end_date, status, created_at)
      VALUES ('${historicalLeave1}', '${student1Id}', '${dept1Id}', 'Medical', 'Fever', '2026-09-01', '2026-09-03', 'PENDING', '2026-09-01 10:00:00+00');

      -- Historical leave 2: Student profile has NULL USN (incomplete snapshot)
      INSERT INTO public.leave_requests (id, student_id, department_id, leave_type, reason, start_date, end_date, status, created_at)
      VALUES ('${historicalLeave2}', '${student2Id}', '${dept1Id}', 'General', 'Family event', '2026-09-10', '2026-09-11', 'PENDING', '2026-09-10 10:00:00+00');
    `);
    assert.equal(seedRes.success, true, `Seed failed: ${seedRes.stderr}`);
  });

  // 3. Apply Migration 00041 and 00042
  await t.test('3. Execute revised migrations 00041 and 00042', async () => {
    const mig41 = await runSqlFile('supabase/migrations/00041_leave_note_snapshots_and_remarks.sql');
    assert.equal(mig41.success, true, `Migration 00041 failed: ${mig41.stderr}`);

    const mig42 = await runSqlFile('supabase/migrations/00042_leave_note_security_and_provenance.sql');
    assert.equal(mig42.success, true, `Migration 00042 failed: ${mig42.stderr}`);
  });

  // 4. Verify Deterministic Historical Provenance
  await t.test('4. Verify deterministic provenance classification', async () => {
    const res = await runSql(`
      SELECT id, student_name_snapshot, student_usn_snapshot, branch_snapshot, snapshot_provenance
      FROM public.leave_requests
      ORDER BY id;
    `);
    assert.equal(res.success, true);
    
    // Row 1 (Rahul Kumar) must be RETROACTIVE_BACKFILL
    const row1 = await runSql(`SELECT snapshot_provenance, student_name_snapshot, student_usn_snapshot FROM public.leave_requests WHERE id = '${historicalLeave1}';`);
    assert.equal(row1.stdout, 'RETROACTIVE_BACKFILL|Rahul Kumar|4AL22CS050');

    // Row 2 (Priya Sharma, missing USN) must be UNVERIFIED
    const row2 = await runSql(`SELECT snapshot_provenance, student_name_snapshot, student_usn_snapshot FROM public.leave_requests WHERE id = '${historicalLeave2}';`);
    assert.equal(row2.stdout, 'UNVERIFIED|Priya Sharma|');

    // Verify: No historical record is falsely represented as SUBMISSION
    const falseSubmissions = await runSql(`SELECT count(*) FROM public.leave_requests WHERE snapshot_provenance = 'SUBMISSION';`);
    assert.equal(falseSubmissions.stdout, '0', 'Expected 0 SUBMISSION rows from historical backfill');
  });

  // 5. Test Live New Submission Provenance
  const liveLeaveId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  await t.test('5. Verify live submission records SUBMISSION provenance', async () => {
    const liveRes = await runSql(`
      INSERT INTO public.leave_requests (
        id, student_id, department_id, leave_type, reason, start_date, end_date,
        student_name_snapshot, student_usn_snapshot, branch_snapshot, semester_snapshot,
        snapshot_provenance
      ) VALUES (
        '${liveLeaveId}', '${student1Id}', '${dept1Id}', 'Academic', 'Hackathon', '2026-11-20', '2026-11-22',
        'Rahul Kumar', '4AL22CS050', 'Computer Science', 5,
        'SUBMISSION'
      );
    `);
    assert.equal(liveRes.success, true, `Live insert failed: ${liveRes.stderr}`);

    const checkLive = await runSql(`SELECT snapshot_provenance FROM public.leave_requests WHERE id = '${liveLeaveId}';`);
    assert.equal(checkLive.stdout, 'SUBMISSION');
  });

  // 6. Test Department Ownership in review_leave_request
  await t.test('6. Verify department ownership authorization in review_leave_request', async () => {
    // Calling review_leave_request with hod2 (Electronics HOD) on Computer Science request must fail
    const authHOD2 = `
      SET request.jwt.claim.sub = '${hod2Id}';
      SELECT public.review_leave_request('${liveLeaveId}'::uuid, 'APPROVED', NULL, 'Unauthorized HOD remark');
    `;
    const wrongDeptRes = await runSql(authHOD2);
    assert.equal(wrongDeptRes.success, false, 'Expected department mismatch error');
    assert.match(wrongDeptRes.stderr, /ACCESS DENIED/i);
  });

  // 7. Test Concurrency: Simultaneous HOD Approval and Rejection on the Same Request
  await t.test('7. Verify HOD approval concurrency (Row Locking & Atomic Single Transition)', async () => {
    // We launch two parallel psql processes at the exact same moment attempting to review liveLeaveId:
    // Process A attempts APPROVAL with remark 'Approved fast'
    // Process B attempts REJECTION with reason 'Rejected fast'
    const sqlApprove = `
      SET request.jwt.claim.sub = '${hod1Id}';
      SELECT public.review_leave_request('${liveLeaveId}'::uuid, 'APPROVED', NULL, 'Approved fast');
    `;
    const sqlReject = `
      SET request.jwt.claim.sub = '${hod1Id}';
      SELECT public.review_leave_request('${liveLeaveId}'::uuid, 'REJECTED', 'Rejected fast', NULL);
    `;

    const [resA, resB] = await Promise.all([
      runSql(sqlApprove),
      runSql(sqlReject)
    ]);

    const successes = [resA.success, resB.success].filter(Boolean).length;
    const failures = [resA.success, resB.success].filter(s => !s).length;

    assert.equal(successes, 1, `Exactly one review attempt must succeed! (Successes: ${successes}, Failures: ${failures})`);
    assert.equal(failures, 1, `Exactly one review attempt must fail with conflict/already reviewed!`);

    const failedResult = !resA.success ? resA : resB;
    assert.match(failedResult.stderr, /already been reviewed|Conflict/i);

    // Verify final database state is strictly either APPROVED or REJECTED
    const finalState = await runSql(`SELECT status, reviewed_by, approval_remarks, rejection_reason FROM public.leave_requests WHERE id = '${liveLeaveId}';`);
    const [status, reviewer, remarks, reason] = finalState.stdout.split('|');
    assert.ok(status === 'APPROVED' || status === 'REJECTED', `Status must be APPROVED or REJECTED, got: ${status}`);
    assert.equal(reviewer, hod1Id);

    if (status === 'APPROVED') {
      assert.equal(remarks, 'Approved fast');
      assert.equal(reason, '');
    } else {
      assert.equal(reason, 'Rejected fast');
      assert.equal(remarks, '');
    }

    // Verify notifications table has exactly ONE notification for this leave request
    const notifCount = await runSql(`SELECT count(*) FROM public.notifications WHERE user_id = '${student1Id}' AND title IN ('Leave Request Approved', 'Leave Request Rejected');`);
    assert.equal(notifCount.stdout, '1', 'Exactly one notification must be generated');
  });

  // 8. Test Inherent Backward-Compatibility: Calling 4-parameter review_leave_request with 2 and 3 arguments
  await t.test('8. Verify 4-parameter review_leave_request inherently supports 2, 3, and 4 arguments via defaults', async () => {
    // Call with 3 arguments (legacy signature: leave_id, status, rejection_reason)
    const test3Param = `
      SET request.jwt.claim.sub = '${hod1Id}';
      SELECT public.review_leave_request('${historicalLeave1}'::uuid, 'APPROVED'::text, NULL::text);
    `;
    const call3Res = await runSql(test3Param);
    assert.equal(call3Res.success, true, `3-parameter invocation failed: ${call3Res.stderr}`);

    const verifyLeave1 = await runSql(`SELECT status, reviewed_by, approval_remarks FROM public.leave_requests WHERE id = '${historicalLeave1}';`);
    assert.equal(verifyLeave1.stdout, `APPROVED|${hod1Id}|`);

    // Verify 3-parameter rejection on historicalLeave2
    const testReject = `
      SET request.jwt.claim.sub = '${hod1Id}';
      SELECT public.review_leave_request('${historicalLeave2}'::uuid, 'REJECTED'::text, 'Incomplete documentation'::text);
    `;
    const callRejectRes = await runSql(testReject);
    assert.equal(callRejectRes.success, true, `Legacy rejection invocation failed: ${callRejectRes.stderr}`);

    const verifyLeave2 = await runSql(`SELECT status, reviewed_by, rejection_reason FROM public.leave_requests WHERE id = '${historicalLeave2}';`);
    assert.equal(verifyLeave2.stdout, `REJECTED|${hod1Id}|Incomplete documentation`);
  });
});
