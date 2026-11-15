import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import test from 'node:test';

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

test('Old Frontend Submission Compatibility & RLS Hardening Suite', async (t) => {
  const studentId = '11111111-1111-1111-1111-111111111111';
  const deptId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const hodId = '33333333-3333-3333-3333-333333333333';

  // Enable RLS on leave_requests in the test database and clean up test records
  await t.test('1. Setup RLS environment for student role', async () => {
    const rlsSetup = await runSql(`
      ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON public.leave_requests TO authenticated;
      GRANT ALL ON public.notifications TO authenticated;
      GRANT SELECT ON public.profiles TO authenticated;
      GRANT SELECT ON public.departments TO authenticated;
      DELETE FROM public.leave_requests WHERE id::text LIKE '99999999-9999-9999-9999-%';
    `);
    assert.equal(rlsSetup.success, true);
  });

  // Test 2: Old frontend submission omitting all snapshot fields
  const oldLeaveId1 = '99999999-9999-9999-9999-000000000001';
  await t.test('2. Old frontend payload without snapshot fields succeeds with PENDING status and default provenance', async () => {
    // Old frontend payload: only base fields from migration 00010
    const oldPayloadSql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${studentId}';
      SET request.jwt.claim.role = 'authenticated';

      INSERT INTO public.leave_requests (
        id,
        student_id,
        department_id,
        hod_id,
        leave_type,
        reason,
        start_date,
        end_date,
        status
      ) VALUES (
        '${oldLeaveId1}',
        '${studentId}',
        '${deptId}',
        '${hodId}',
        'Medical',
        'Viral fever',
        '2026-12-01',
        '2026-12-03',
        'PENDING'
      );
    `;
    const res = await runSql(oldPayloadSql);
    assert.equal(res.success, true, `Old frontend insert failed: ${res.stderr}`);

    // Verify row was stored with default SUBMISSION provenance and nullable snapshot columns as NULL
    const verifySql = `
      SELECT status, snapshot_provenance, student_name_snapshot, branch_snapshot, approval_remarks
      FROM public.leave_requests WHERE id = '${oldLeaveId1}';
    `;
    const verifyRes = await runSql(verifySql);
    assert.equal(verifyRes.stdout, 'PENDING|SUBMISSION|||');
  });

  // Test 3: Student attempting to forge status = APPROVED via direct REST insert is blocked
  await t.test('3. Forgery Guard: Student attempting direct insert with status = APPROVED is rejected by RLS', async () => {
    const forgeStatusSql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${studentId}';
      SET request.jwt.claim.role = 'authenticated';

      INSERT INTO public.leave_requests (
        id, student_id, department_id, leave_type, reason, start_date, end_date, status
      ) VALUES (
        '99999999-9999-9999-9999-000000000002',
        '${studentId}',
        '${deptId}',
        'Medical',
        'Forged approval attempt',
        '2026-12-01',
        '2026-12-03',
        'APPROVED'
      );
    `;
    const res = await runSql(forgeStatusSql);
    assert.equal(res.success, false, 'Expected RLS violation error');
    assert.match(res.stderr, /row-level security policy/i);
  });

  // Test 4: Student attempting to forge reviewed_by or approval_remarks is blocked
  await t.test('4. Forgery Guard: Student attempting direct insert with reviewed_by or approval_remarks is rejected', async () => {
    const forgeRemarksSql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${studentId}';
      SET request.jwt.claim.role = 'authenticated';

      INSERT INTO public.leave_requests (
        id, student_id, department_id, leave_type, reason, start_date, end_date, status, approval_remarks
      ) VALUES (
        '99999999-9999-9999-9999-000000000003',
        '${studentId}',
        '${deptId}',
        'Medical',
        'Forged remarks attempt',
        '2026-12-01',
        '2026-12-03',
        'PENDING',
        'Forged HOD Remark'
      );
    `;
    const res = await runSql(forgeRemarksSql);
    assert.equal(res.success, false, 'Expected RLS violation error');
    assert.match(res.stderr, /row-level security policy/i);

    const forgeReviewerSql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${studentId}';
      SET request.jwt.claim.role = 'authenticated';

      INSERT INTO public.leave_requests (
        id, student_id, department_id, leave_type, reason, start_date, end_date, status, reviewed_by
      ) VALUES (
        '99999999-9999-9999-9999-000000000004',
        '${studentId}',
        '${deptId}',
        'Medical',
        'Forged reviewer attempt',
        '2026-12-01',
        '2026-12-03',
        'PENDING',
        '${hodId}'
      );
    `;
    const resRev = await runSql(forgeReviewerSql);
    assert.equal(resRev.success, false, 'Expected RLS violation error');
    assert.match(resRev.stderr, /row-level security policy/i);
  });

  // Test 5: Student attempting to forge provenance = RETROACTIVE_BACKFILL is blocked
  await t.test('5. Forgery Guard: Student attempting direct insert with forged provenance is rejected', async () => {
    const forgeProvSql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${studentId}';
      SET request.jwt.claim.role = 'authenticated';

      INSERT INTO public.leave_requests (
        id, student_id, department_id, leave_type, reason, start_date, end_date, status, snapshot_provenance
      ) VALUES (
        '99999999-9999-9999-9999-000000000005',
        '${studentId}',
        '${deptId}',
        'Medical',
        'Forged provenance attempt',
        '2026-12-01',
        '2026-12-03',
        'PENDING',
        'RETROACTIVE_BACKFILL'
      );
    `;
    const res = await runSql(forgeProvSql);
    assert.equal(res.success, false, 'Expected RLS violation error');
    assert.match(res.stderr, /row-level security policy/i);
  });

  // Test 6: Cross-student submission is blocked
  await t.test('6. Forgery Guard: Student cannot submit leave for another student', async () => {
    const otherStudentId = '22222222-2222-2222-2222-222222222222';
    const crossStudentSql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${studentId}';
      SET request.jwt.claim.role = 'authenticated';

      INSERT INTO public.leave_requests (
        id, student_id, department_id, leave_type, reason, start_date, end_date, status
      ) VALUES (
        '99999999-9999-9999-9999-000000000006',
        '${otherStudentId}',
        '${deptId}',
        'Medical',
        'Cross student attempt',
        '2026-12-01',
        '2026-12-03',
        'PENDING'
      );
    `;
    const res = await runSql(crossStudentSql);
    assert.equal(res.success, false, 'Expected RLS violation error');
    assert.match(res.stderr, /row-level security policy/i);
  });
});
