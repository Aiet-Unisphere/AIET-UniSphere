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
  const tmpFile = path.join(rootDir, 'temp_test_rejection_runner.sql');
  fs.writeFileSync(tmpFile, sql, 'utf-8');
  try {
    const psqlCmd = `"C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe" -p 54333 -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -f "${tmpFile}"`;
    return execSync(psqlCmd, { encoding: 'utf-8', env: { ...process.env, PGPASSWORD: '' }, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
};

describe('AIET-UniSphere — Leave Rejection Reasons & Reviewer Remarks Suite', () => {
  const deptId = '11111111-1111-1111-1111-111111111111';
  const studentId = 'a0000000-0000-0000-0000-000000000001';
  const hodId = 'da000000-0000-0000-0000-000000000001';
  const otherStudentId = 'a0000000-0000-0000-0000-000000000002';
  const wrongDeptHodId = 'db000000-0000-0000-0000-000000000002';

  const resetTestLeave = (leaveId, status = 'PENDING') => {
    runSql(`
      INSERT INTO public.leave_requests (
        id, student_id, department_id, leave_type, reason, start_date, end_date,
        status, student_name_snapshot, student_usn_snapshot, branch_snapshot,
        section_snapshot, semester_snapshot, academic_year_snapshot,
        student_phone_snapshot, parent_phone_snapshot, snapshot_provenance
      ) VALUES (
        '${leaveId}', '${studentId}', '${deptId}', 'Medical', 'Viral Flu',
        '2026-11-20', '2026-11-22', '${status}',
        'Arjun Rao', '4AL22CS010', 'Computer Science and Engineering',
        'A', 6, '2025-2026', '9876543210', '9876543211', 'SUBMISSION'
      ) ON CONFLICT (id) DO UPDATE SET 
        status = '${status}',
        reviewed_by = NULL,
        reviewed_at = NULL,
        approval_remarks = NULL,
        rejection_reason = NULL,
        snapshot_provenance = 'SUBMISSION';
    `);
  };

  it('1. HOD cannot reject without a reason (rejects empty or whitespace string)', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000011';
    resetTestLeave(leaveId, 'PENDING');

    // Attempt 1: NULL rejection reason
    let nullFailed = false;
    try {
      runSql(`
        SET request.jwt.claim.sub = '${hodId}';
        SELECT public.review_leave_request('${leaveId}', 'REJECTED', NULL, NULL);
      `);
    } catch (e) {
      nullFailed = true;
      assert.ok(e.message.includes('Rejection reason is required'), 'Must require rejection reason');
    }
    assert.strictEqual(nullFailed, true, 'Null rejection reason must be rejected by Postgres');

    // Attempt 2: Empty / whitespace rejection reason
    let whitespaceFailed = false;
    try {
      runSql(`
        SET request.jwt.claim.sub = '${hodId}';
        SELECT public.review_leave_request('${leaveId}', 'REJECTED', '   ', NULL);
      `);
    } catch (e) {
      whitespaceFailed = true;
      assert.ok(e.message.includes('Rejection reason is required'), 'Must reject whitespace-only reason');
    }
    assert.strictEqual(whitespaceFailed, true, 'Whitespace rejection reason must be rejected by Postgres');
  });

  it('2. HOD can reject with a valid reason', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000012';
    resetTestLeave(leaveId, 'PENDING');

    const result = runSql(`
      SET request.jwt.claim.sub = '${hodId}';
      SELECT public.review_leave_request('${leaveId}', 'REJECTED', 'Medical certificate not provided for 3 consecutive working days.', NULL);
    `);

    assert.ok(result.includes('"success": true') || result.includes('"status": "REJECTED"'));
  });

  it('3. Rejection reason is persisted in PostgreSQL table atomically', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000012';
    const queryResult = runSql(`
      SELECT status || '|' || reviewed_by || '|' || rejection_reason
      FROM public.leave_requests WHERE id = '${leaveId}';
    `);

    assert.strictEqual(
      queryResult,
      `REJECTED|${hodId}|Medical certificate not provided for 3 consecutive working days.`
    );
  });

  it('4. Student can view the rejection reason via mapped leave object', () => {
    const servicePath = path.join(rootDir, 'src', 'services', 'leaveService.ts');
    const content = fs.readFileSync(servicePath, 'utf-8');

    // Verify mapping in leaveService.ts
    assert.ok(content.includes('remark: l.rejection_reason || undefined'), 'Must map rejection_reason to remark');
    assert.ok(content.includes('rejectionReason: l.rejection_reason || undefined'), 'Must map rejection_reason to rejectionReason');

    // Verify student LeaveRequestsPage.tsx renders the rejection reason modal
    const studentPagePath = path.join(rootDir, 'src', 'pages', 'LeaveRequestsPage.tsx');
    const studentPageContent = fs.readFileSync(studentPagePath, 'utf-8');

    assert.ok(studentPageContent.includes('selectedRejectedLeave'), 'Must have selectedRejectedLeave state for details modal');
    assert.ok(studentPageContent.includes('View Reason'), 'Must render View Reason button for rejected requests');
    assert.ok(studentPageContent.includes('HOD Rejection Reason'), 'Must display HOD Rejection Reason header in modal');
    assert.ok(studentPageContent.includes('No rejection reason was recorded for this request.'), 'Must contain fallback for historical requests');
  });

  it('5. Student cannot modify reviewer remarks or review leave requests', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000013';
    resetTestLeave(leaveId, 'PENDING');

    let studentReviewBlocked = false;
    try {
      runSql(`
        SET request.jwt.claim.sub = '${studentId}';
        SELECT public.review_leave_request('${leaveId}', 'REJECTED', 'Student self-rejection attempt', NULL);
      `);
    } catch (e) {
      studentReviewBlocked = true;
      assert.ok(e.message.includes('Only HODs or Administrators'), 'Non-HOD caller must be rejected by RPC');
    }

    assert.strictEqual(studentReviewBlocked, true, 'Student cannot invoke review RPC');
  });

  it('6. Approved leave workflow remains completely unchanged', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000014';
    resetTestLeave(leaveId, 'PENDING');

    const result = runSql(`
      SET request.jwt.claim.sub = '${hodId}';
      SELECT public.review_leave_request('${leaveId}', 'APPROVED', NULL, 'Sanctioned for academic hackathon representation.');
    `);

    assert.ok(result.includes('"status": "APPROVED"'));

    const check = runSql(`
      SELECT status || '|' || COALESCE(rejection_reason, 'NONE') || '|' || approval_remarks
      FROM public.leave_requests WHERE id = '${leaveId}';
    `);

    assert.strictEqual(check, `APPROVED|NONE|Sanctioned for academic hackathon representation.`);
  });

  it('7. Existing leave-note PDF generation remains fully functional', async () => {
    const sampleLeave = {
      id: 'LV-2026-905',
      studentId: 'a0000000-0000-0000-0000-000000000001',
      studentNameSnapshot: 'Arjun Rao',
      studentUsnSnapshot: '4AL22CS010',
      branchSnapshot: 'Computer Science and Engineering',
      semesterSnapshot: 6,
      academicYearSnapshot: '2025-2026',
      sectionSnapshot: 'A',
      studentPhoneSnapshot: '9876543210',
      parentPhoneSnapshot: '9876543211',
      leaveType: 'Medical Leave',
      startDate: '2026-11-20',
      endDate: '2026-11-22',
      days: 3,
      reason: 'Fever',
      status: 'Approved',
      submittedAt: '10/11/2026',
      reviewedBy: 'Dr. K. R. Sharma',
      approvalRemarks: 'Sanctioned under institutional policy.',
      snapshotProvenance: 'SUBMISSION'
    };

    const doc = await generateLeaveNotePdf(sampleLeave);
    assert.strictEqual(doc.getNumberOfPages(), 1);
    const pdf = doc.output();
    assert.ok(pdf.includes('HOD APPROVED'));
    assert.ok(pdf.includes('Sanctioned under institutional policy.'));
  });

  it('8. Rejection notification contains the exact explanation', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000015';
    resetTestLeave(leaveId, 'PENDING');

    const reasonText = 'Insufficient attendance in core laboratory subjects.';

    runSql(`DELETE FROM public.notifications WHERE user_id = '${studentId}' AND related_link = '/student/leave-requests';`);

    runSql(`
      SET request.jwt.claim.sub = '${hodId}';
      SELECT public.review_leave_request('${leaveId}', 'REJECTED', '${reasonText}', NULL);
    `);

    const notifRow = runSql(`
      SELECT title || '|' || category || '|' || type || '|' || full_message
      FROM public.notifications
      WHERE user_id = '${studentId}'
        AND type = 'Rejection'
      ORDER BY created_at DESC
      LIMIT 1;
    `);

    assert.ok(notifRow.includes('Leave Request Rejected|Leave|Rejection|'));
    assert.ok(notifRow.includes(reasonText), 'Rejection notification must contain the explanation');
  });

  it('9. Unrelated users cannot access another student rejection details or cross-department reviews', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000015';

    // Calling review as HOD of another department must be rejected
    let crossDeptFailed = false;
    try {
      runSql(`
        SET request.jwt.claim.sub = '${wrongDeptHodId}';
        SELECT public.review_leave_request('${leaveId}', 'REJECTED', 'Cross dept rejection', NULL);
      `);
    } catch (e) {
      crossDeptFailed = true;
      assert.ok(e.message.includes('ACCESS DENIED') || e.message.includes('department'));
    }

    assert.strictEqual(crossDeptFailed, true, 'Cross-department HOD cannot review leave requests');
  });

  it('10. Historical rejected records without remarks display the appropriate fallback', () => {
    const studentPagePath = path.join(rootDir, 'src', 'pages', 'LeaveRequestsPage.tsx');
    const studentPageContent = fs.readFileSync(studentPagePath, 'utf-8');

    const hodPagePath = path.join(rootDir, 'src', 'hod', 'pages', 'HODLeaveDetail.tsx');
    const hodPageContent = fs.readFileSync(hodPagePath, 'utf-8');

    const expectedFallback = 'No rejection reason was recorded for this request.';

    // Both student modal and HOD view must have the exact fallback
    assert.ok(studentPageContent.includes(expectedFallback), 'Student page must render the fallback message');
    assert.ok(hodPageContent.includes(expectedFallback), 'HOD page must render the fallback message');
  });

  it('11. Duplicate review submissions do not create duplicate notifications', () => {
    const leaveId = 'e0000000-0000-0000-0000-000000000016';
    resetTestLeave(leaveId, 'PENDING');

    runSql(`DELETE FROM public.notifications WHERE user_id = '${studentId}' AND related_link = '/student/leave-requests';`);

    // First review succeeds
    runSql(`
      SET request.jwt.claim.sub = '${hodId}';
      SELECT public.review_leave_request('${leaveId}', 'REJECTED', 'First valid reason', NULL);
    `);

    const countBefore = runSql(`
      SELECT COUNT(*) FROM public.notifications
      WHERE user_id = '${studentId}' AND type = 'Rejection';
    `);
    assert.strictEqual(parseInt(countBefore, 10), 1, 'Exactly one notification generated after first review');

    // Second review on now REJECTED request must be rejected by PostgreSQL
    let secondAttemptFailed = false;
    try {
      runSql(`
        SET request.jwt.claim.sub = '${hodId}';
        SELECT public.review_leave_request('${leaveId}', 'REJECTED', 'Duplicate overwrite attempt', NULL);
      `);
    } catch (e) {
      secondAttemptFailed = true;
      assert.ok(e.message.includes('already been reviewed') || e.message.includes('Only pending requests can be modified'));
    }

    assert.strictEqual(secondAttemptFailed, true, 'Duplicate review attempt must be rejected');

    const countAfter = runSql(`
      SELECT COUNT(*) FROM public.notifications
      WHERE user_id = '${studentId}' AND type = 'Rejection';
    `);
    assert.strictEqual(parseInt(countAfter, 10), 1, 'Duplicate review must not generate extra notifications');
  });

});
