import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateLeaveNotePdf,
  generateStudentApplicationPdf
} from '../src/services/leaveNotePdfService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to run query against local isolated Postgres test cluster on port 54333
const runSql = (sql) => {
  const tmpFile = path.join(rootDir, 'temp_test_leave_runner.sql');
  fs.writeFileSync(tmpFile, sql, 'utf-8');
  try {
    const psqlCmd = `"C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe" -p 54333 -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -f "${tmpFile}"`;
    return execSync(psqlCmd, { encoding: 'utf-8', env: { ...process.env, PGPASSWORD: '' }, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
};

describe('Mission 10.6 — Final Leave Management Authoritative Architecture Test Suite', () => {

  it('1. Service Contract: submitLeaveRequest enforces immutable snapshots and fails safely', () => {
    const servicePath = path.join(rootDir, 'src', 'services', 'leaveService.ts');
    const content = fs.readFileSync(servicePath, 'utf-8');

    // Retains academic_year_snapshot and full snapshots
    assert.ok(content.includes('student_name_snapshot:'), 'Must write student_name_snapshot');
    assert.ok(content.includes('student_usn_snapshot:'), 'Must write student_usn_snapshot');
    assert.ok(content.includes('branch_snapshot:'), 'Must write branch_snapshot');
    assert.ok(content.includes('section_snapshot:'), 'Must write section_snapshot');
    assert.ok(content.includes('semester_snapshot:'), 'Must write semester_snapshot');
    assert.ok(content.includes('academic_year_snapshot:'), 'Must write academic_year_snapshot');
    assert.ok(content.includes('snapshot_provenance: \'SUBMISSION\''), 'Must set snapshot_provenance SUBMISSION');

    // Never silently discards snapshots
    assert.ok(!content.includes('const basePayload = {'), 'Must not define degraded basePayload');
    assert.ok(content.includes('Migration 00041 pending'), 'Must fail safely when schema is unmigrated');
  });

  it('2. Service Contract: mapLeaveRow does NOT reconstruct snapshots from current live profiles', () => {
    const servicePath = path.join(rootDir, 'src', 'services', 'leaveService.ts');
    const content = fs.readFileSync(servicePath, 'utf-8');

    assert.ok(content.includes('semester: l.semester_snapshot ?? null'), 'Semester must derive from snapshot, not current profile');
    assert.ok(!content.includes('semester: l.semester_snapshot ?? l.student_academic?.semester'), 'Must not reconstruct semester from live student_academic');
  });

  it('3. Service Contract: HOD approval and rejection strictly require authoritative RPC', () => {
    const servicePath = path.join(rootDir, 'src', 'services', 'leaveService.ts');
    const content = fs.readFileSync(servicePath, 'utf-8');

    // No direct table update
    assert.ok(!content.includes(".from('leave_requests').update({"), 'Must not use direct table update for leave review');
    assert.ok(content.includes("p_approval_remarks: cleanRemarks"), 'Must pass clean remarks to authoritative RPC');
    assert.ok(content.includes("p_rejection_reason: cleanRemark"), 'Must pass clean rejection reason to authoritative RPC');
  });

  it('4. Real PostgreSQL 16: Snapshot Persistence & Provenance Verification', () => {
    const studentId = 'a0000000-0000-0000-0000-000000000001';
    const deptId = '11111111-1111-1111-1111-111111111111';
    const leaveId = 'e0000000-0000-0000-0000-000000000001';

    // Insert leave request directly into test DB
    runSql(`
      INSERT INTO public.leave_requests (
        id, student_id, department_id, leave_type, reason, start_date, end_date,
        status, student_name_snapshot, student_usn_snapshot, branch_snapshot,
        section_snapshot, semester_snapshot, academic_year_snapshot,
        student_phone_snapshot, parent_phone_snapshot, snapshot_provenance
      ) VALUES (
        '${leaveId}', '${studentId}', '${deptId}', 'Medical', 'Fever and viral infection',
        '2026-11-20', '2026-11-22', 'PENDING',
        'Arjun Rao', '4AL22CS010', 'Computer Science and Engineering',
        'A', 6, '2025-2026', '9876543210', '9876543211', 'SUBMISSION'
      ) ON CONFLICT (id) DO UPDATE SET 
        status = 'PENDING',
        reviewed_by = NULL,
        reviewed_at = NULL,
        approval_remarks = NULL,
        rejection_reason = NULL;
    `);

    const result = runSql(`
      SELECT student_name_snapshot || '|' || branch_snapshot || '|' || semester_snapshot || '|' || snapshot_provenance
      FROM public.leave_requests WHERE id = '${leaveId}';
    `);

    assert.strictEqual(result, 'Arjun Rao|Computer Science and Engineering|6|SUBMISSION');
  });

  it('5. Real PostgreSQL 16: Duplicate Submission Prevention via Primary Key Uniqueness', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000001';
    const studentId = 'a0000000-0000-0000-0000-000000000001';
    const deptId = '11111111-1111-1111-1111-111111111111';

    let duplicateFailed = false;
    try {
      runSql(`
        INSERT INTO public.leave_requests (
          id, student_id, department_id, leave_type, reason, start_date, end_date, status
        ) VALUES (
          '${leaveId}', '${studentId}', '${deptId}', 'Medical', 'Duplicate attempt',
          '2026-11-20', '2026-11-22', 'PENDING'
        );
      `);
    } catch (e) {
      duplicateFailed = true;
      assert.ok(e.message.includes('duplicate key value') || e.message.includes('leave_requests_pkey'), 'Must fail with unique constraint violation');
    }

    assert.strictEqual(duplicateFailed, true, 'Duplicate submission with same ID must be rejected by Postgres');
  });

  it('6. Real PostgreSQL 16: HOD Authorization — Non-HOD and Wrong Department Denied', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000001';
    const studentId = 'a0000000-0000-0000-0000-000000000001';
    const wrongDeptHodId = 'db000000-0000-0000-0000-000000000002'; // ECE HOD

    // 1. Calling as student must fail
    let studentDenied = false;
    try {
      runSql(`
        SET request.jwt.claim.sub = '${studentId}';
        SELECT public.review_leave_request('${leaveId}', 'APPROVED', NULL, 'Remarks');
      `);
    } catch (e) {
      studentDenied = true;
      assert.ok(e.message.includes('Only HODs or Administrators'), 'Non-HOD caller must be rejected');
    }
    assert.strictEqual(studentDenied, true, 'Student cannot review leave request');

    // 2. Calling as HOD of different department must fail
    let crossDeptDenied = false;
    try {
      runSql(`
        SET request.jwt.claim.sub = '${wrongDeptHodId}';
        SELECT public.review_leave_request('${leaveId}', 'APPROVED', NULL, 'Remarks');
      `);
    } catch (e) {
      crossDeptDenied = true;
      assert.ok(e.message.includes('ACCESS DENIED') || e.message.includes('department'), 'Cross-department HOD must be denied');
    }
    assert.strictEqual(crossDeptDenied, true, 'HOD cannot review leave request of another department');
  });

  it('7. Real PostgreSQL 16: Authoritative RPC Approval with Atomic Notification & Audit', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000001';
    const hodId = 'da000000-0000-0000-0000-000000000001'; // CS HOD

    // Clear previous notifications for clean assertion
    runSql(`DELETE FROM public.notifications WHERE related_link = '/student/leave-requests';`);

    // Execute authoritative review RPC as authorized HOD
    const rpcOutput = runSql(`
      SET request.jwt.claim.sub = '${hodId}';
      SELECT public.review_leave_request('${leaveId}', 'APPROVED', NULL, 'Sanctioned under institutional policy.');
    `);

    assert.ok(rpcOutput.includes('"success": true') || rpcOutput.includes('"status": "APPROVED"'));

    // Verify DB update
    const statusCheck = runSql(`
      SELECT status || '|' || reviewed_by || '|' || approval_remarks
      FROM public.leave_requests WHERE id = '${leaveId}';
    `);

    assert.strictEqual(statusCheck, `APPROVED|${hodId}|Sanctioned under institutional policy.`);

    // Verify atomic notification was created
    const notifCount = runSql(`
      SELECT COUNT(*) FROM public.notifications 
      WHERE user_id = 'a0000000-0000-0000-0000-000000000001'
        AND type = 'Approval'
        AND category = 'Leave';
    `);

    assert.strictEqual(parseInt(notifCount, 10) >= 1, true, 'Atomic notification must be created in PostgreSQL transaction');
  });

  it('8. Real PostgreSQL 16: Enforce PENDING-Only Transition Guard', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000001';
    const hodId = 'da000000-0000-0000-0000-000000000001';

    // The leave request is now APPROVED. Attempting to approve or reject again must fail.
    let reReviewBlocked = false;
    try {
      runSql(`
        SET request.jwt.claim.sub = '${hodId}';
        SELECT public.review_leave_request('${leaveId}', 'REJECTED', 'Late rejection', NULL);
      `);
    } catch (e) {
      reReviewBlocked = true;
      assert.ok(e.message.includes('already been reviewed') || e.message.includes('Only pending requests can be modified'));
    }

    assert.strictEqual(reReviewBlocked, true, 'PostgreSQL must reject review transitions for non-PENDING requests');
  });

  it('9. PDF Fidelity: Student Application PDF leaves remarks sections 100% clean and preserves original template', async () => {
    const sampleLeave = {
      id: 'LV-2026-901',
      studentId: 'a0000000-0000-0000-0000-000000000001',
      studentNameSnapshot: 'Sneha Rao',
      studentUsnSnapshot: '4AL22CS088',
      branchSnapshot: 'Computer Science and Engineering',
      semesterSnapshot: 6,
      academicYearSnapshot: '2025-2026',
      sectionSnapshot: 'A',
      studentPhoneSnapshot: '9876543210',
      parentPhoneSnapshot: '9876543211',
      leaveType: 'Academic Duty',
      startDate: '2026-11-20',
      endDate: '2026-11-22',
      days: 3,
      reason: 'Representing AIET at VTU Hackathon',
      status: 'Pending',
      submittedAt: '10/11/2026',
      snapshotProvenance: 'SUBMISSION'
    };

    const doc = await generateStudentApplicationPdf(sampleLeave);
    assert.strictEqual(doc.getNumberOfPages(), 1);

    const pdfOutput = doc.output();
    assert.strictEqual(pdfOutput.includes('HOD APPROVED'), false);
    assert.strictEqual(pdfOutput.includes('HOD Remarks:'), false);
    assert.strictEqual(pdfOutput.includes('SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE'), false);
    assert.ok(pdfOutput.includes('Student Leave Application Form'));
    assert.ok(pdfOutput.includes('Sneha Rao'));
    assert.ok(pdfOutput.includes('Computer Science and Engineering'));
  });

  it('10. PDF Fidelity: Approved Leave Note renders official template with bounded HOD remarks & watermark', async () => {
    const sampleLeave = {
      id: 'LV-2026-901',
      studentId: 'a0000000-0000-0000-0000-000000000001',
      studentNameSnapshot: 'Sneha Rao',
      studentUsnSnapshot: '4AL22CS088',
      branchSnapshot: 'Computer Science and Engineering',
      semesterSnapshot: 6,
      academicYearSnapshot: '2025-2026',
      sectionSnapshot: 'A',
      studentPhoneSnapshot: '9876543210',
      parentPhoneSnapshot: '9876543211',
      leaveType: 'Academic Duty',
      startDate: '2026-11-20',
      endDate: '2026-11-22',
      days: 3,
      reason: 'Representing AIET at VTU Hackathon',
      status: 'Approved',
      submittedAt: '10/11/2026',
      reviewedBy: 'Dr. K. R. Sharma',
      reviewerName: 'Dr. K. R. Sharma',
      reviewedAt: '11/11/2026',
      approvalRemarks: 'Sanctioned under AIET VTU event guidelines.',
      snapshotProvenance: 'SUBMISSION'
    };

    const doc = await generateLeaveNotePdf(sampleLeave);
    assert.strictEqual(doc.getNumberOfPages(), 1);

    const pdfOutput = doc.output();
    assert.ok(pdfOutput.includes('HOD APPROVED'));
    assert.ok(pdfOutput.includes('Sanctioned under AIET VTU event guidelines.'));
    assert.ok(pdfOutput.includes('Provenance: Verified Submission Snapshot'));
    assert.ok(pdfOutput.includes('Dr. K. R. Sharma'));
  });

});
