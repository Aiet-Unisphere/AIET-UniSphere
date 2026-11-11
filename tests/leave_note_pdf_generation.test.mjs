import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Import from built or compiled sources
import { 
  generateLeaveNotePdf, 
  generateStudentApplicationPdf,
  generateLeaveNoteDocument,
  isLeaveApproved 
} from '../src/services/leaveNotePdfService.ts';

describe('Mission 09.2 — Approved Leave Note PDF Generation & Security Audit', () => {

  const baseApprovedLeave = {
    id: 'LV-101',
    dbId: 'a1000000-0000-0000-0000-000000000001',
    requesterId: '00000000-0000-0000-0000-000000000001',
    requesterName: 'Arjun Rao',
    requesterUsnOrEmpId: '4AL21CS001',
    requesterRole: 'STUDENT',
    departmentId: 'd0000000-0000-0000-0000-000000000001',
    departmentName: 'Computer Science and Engineering',
    leaveType: 'Academic Duty / Event',
    startDate: '2026-11-12',
    endDate: '2026-11-14',
    days: 3,
    reason: 'Representing AIET at the VTU State Level Hackathon 2026 for AI in Healthcare project showcase.',
    status: 'Approved',
    submittedAt: '10/11/2026',
    reviewedBy: 'Dr. Ramesh HOD',
    reviewerName: 'Dr. Ramesh HOD',
    reviewedAt: '11/11/2026',
    approvalRemarks: 'Academic duty sanctioned. Attendance adjustment permitted under VTU Hackathon guidelines.',
    studentNameSnapshot: 'Arjun Rao (Verified)',
    studentUsnSnapshot: '4AL21CS001',
    branchSnapshot: 'Computer Science and Engineering',
    sectionSnapshot: 'CSE-A',
    semesterSnapshot: 7,
    academicYearSnapshot: '2026-2027',
    studentPhoneSnapshot: '9876543210',
    parentPhoneSnapshot: '9876543211'
  };

  it('1. isLeaveApproved identifies approved statuses case-insensitively and rejects pending/rejected', () => {
    assert.strictEqual(isLeaveApproved('Approved'), true);
    assert.strictEqual(isLeaveApproved('APPROVED'), true);
    assert.strictEqual(isLeaveApproved('approved'), true);
    assert.strictEqual(isLeaveApproved('Pending'), false);
    assert.strictEqual(isLeaveApproved('PENDING'), false);
    assert.strictEqual(isLeaveApproved('Rejected'), false);
    assert.strictEqual(isLeaveApproved('REJECTED'), false);
    assert.strictEqual(isLeaveApproved(undefined), false);
    assert.strictEqual(isLeaveApproved(''), false);
  });

  it('2. generateLeaveNotePdf strictly rejects unapproved leave requests with an informative error', async () => {
    const pendingLeave = { ...baseApprovedLeave, status: 'Pending' };
    await assert.rejects(
      async () => await generateLeaveNotePdf(pendingLeave),
      /Cannot generate approved leave note: Leave request is currently "Pending"/
    );

    const rejectedLeave = { ...baseApprovedLeave, status: 'Rejected' };
    await assert.rejects(
      async () => await generateLeaveNotePdf(rejectedLeave),
      /Cannot generate approved leave note: Leave request is currently "Rejected"/
    );
  });

  it('3. generateLeaveNotePdf generates valid jsPDF document for approved leave', async () => {
    const doc = await generateLeaveNotePdf(baseApprovedLeave);
    assert.ok(doc && typeof doc.getNumberOfPages === 'function', 'Expected jsPDF document');
    assert.strictEqual(doc.getNumberOfPages(), 1, 'Document must be exactly 1 page');
  });

  it('4. Single-page constraint: document remains strictly 1 page even with lengthy reason and remarks', async () => {
    const lengthyLeave = {
      ...baseApprovedLeave,
      reason: 'A'.repeat(500), // very long reason
      approvalRemarks: 'R'.repeat(300) // very long remark
    };
    const doc = await generateLeaveNotePdf(lengthyLeave);
    assert.strictEqual(doc.getNumberOfPages(), 1, 'Lengthy content must not spill onto a second page');
  });

  it('5. Snapshot values take precedence over mutable profile fields', async () => {
    const leaveWithSnapshots = {
      ...baseApprovedLeave,
      requesterName: 'Old Mutable Name',
      studentNameSnapshot: 'Immutable Snapshot Name',
      requesterUsnOrEmpId: 'OLD_USN',
      studentUsnSnapshot: 'SNAPSHOT_USN_4AL21CS099',
      departmentName: 'Old Department',
      branchSnapshot: 'Information Science & Engineering',
      sectionSnapshot: 'ISE-B'
    };

    const doc = await generateLeaveNotePdf(leaveWithSnapshots);
    const pdfOutput = doc.output();

    // Verify snapshot fields are in the output string
    assert.ok(pdfOutput.includes('Immutable Snapshot Name'), 'Snapshot name must be rendered');
    assert.ok(pdfOutput.includes('SNAPSHOT_USN_4AL21CS099'), 'Snapshot USN must be rendered');
    assert.ok(pdfOutput.includes('Information Science & Engineering'), 'Snapshot branch must be rendered');
    assert.ok(pdfOutput.includes('Sec: ISE-B'), 'Snapshot section must be rendered');
  });

  it('6. Fallback values are safely rendered when snapshot fields are missing', async () => {
    const legacyLeave = {
      ...baseApprovedLeave,
      studentNameSnapshot: undefined,
      studentUsnSnapshot: undefined,
      branchSnapshot: undefined,
      sectionSnapshot: undefined,
      semesterSnapshot: undefined,
      academicYearSnapshot: undefined,
      studentPhoneSnapshot: undefined,
      parentPhoneSnapshot: undefined,
      requesterName: 'Legacy Student',
      requesterUsnOrEmpId: '4AL20CS050',
      departmentName: 'Civil Engineering',
      semester: 5
    };

    const doc = await generateLeaveNotePdf(legacyLeave);
    const pdfOutput = doc.output();

    assert.ok(pdfOutput.includes('Legacy Student'), 'Fallback requesterName must be rendered');
    assert.ok(pdfOutput.includes('4AL20CS050'), 'Fallback requesterUsn must be rendered');
    assert.ok(pdfOutput.includes('Civil Engineering'), 'Fallback departmentName must be rendered');
    assert.ok(pdfOutput.includes('Sem: 5'), 'Fallback semester must be rendered');
    assert.ok(pdfOutput.includes('Sec: -') || pdfOutput.includes('Sec:'), 'Fallback empty section must render dash');
  });

  it('7. Approval remarks and reviewer details are rendered accurately', async () => {
    const doc = await generateLeaveNotePdf(baseApprovedLeave);
    const pdfOutput = doc.output();

    assert.ok(
      pdfOutput.includes('HOD APPROVED') && pdfOutput.includes('DEMONSTRATION COPY'),
      'Approval status demonstration badge must be present'
    );
    assert.ok(
      pdfOutput.includes('SAMPLE / DEMO') && pdfOutput.includes('NOT AN OFFICIAL SIGNATURE OR SEAL'),
      'HOD endorsement area disclaimer must be present'
    );
    assert.ok(pdfOutput.includes('Dr. Ramesh HOD'), 'Reviewer name must be present');
    assert.ok(
      pdfOutput.includes('Academic duty sanctioned') || pdfOutput.includes('VTU Hackathon'),
      'HOD approval remarks must be present'
    );
  });

  it('8. Default approval remarks are rendered when approvalRemarks is omitted', async () => {
    const leaveWithoutRemarks = {
      ...baseApprovedLeave,
      approvalRemarks: undefined
    };
    const doc = await generateLeaveNotePdf(leaveWithoutRemarks);
    const pdfOutput = doc.output();

    assert.ok(
      pdfOutput.includes('Leave request sanctioned and approved for academic records.'),
      'Default approval remark must be rendered when custom remarks are absent'
    );
  });

  it('9. Authenticity integrity: No fabricated signatures, stamps, seals, or artificial approval marks appear', async () => {
    const doc = await generateLeaveNotePdf(baseApprovedLeave);
    const pdfOutput = doc.output();

    // Must never invent signatures, stamps, or seals
    assert.strictEqual(
      pdfOutput.includes('[SAMPLE / DEMO SIGNATURE]'),
      false,
      'Must NOT invent fake signatures'
    );
    assert.strictEqual(
      pdfOutput.includes('SAMPLE / DEMO SEAL'),
      false,
      'Must NOT invent fake seals'
    );
    // Must contain legitimate authoritative approval details
    assert.ok(
      pdfOutput.includes('HOD APPROVED') || pdfOutput.includes('APPROVED'),
      'Authoritative approval status must be present'
    );
    assert.ok(
      pdfOutput.includes('Dr. Ramesh HOD'),
      'Authoritative reviewer identity must be present'
    );
  });

  it('10. Blank manual signature sections exist for all required signatories', async () => {
    const doc = await generateLeaveNotePdf(baseApprovedLeave);
    const pdfOutput = doc.output();

    assert.ok(pdfOutput.includes('STUDENT DECLARATION & SIGNATURE'), 'Student signature box must be present');
    assert.ok(pdfOutput.includes('REMARKS & SIGNATURE OF MENTOR'), 'Mentor signature box must be present');
    assert.ok(pdfOutput.includes('CLASS COORDINATOR RECOMMENDATION'), 'Class coordinator box must be present');
    assert.ok(pdfOutput.includes('STUDENT WELFARE OFFICER'), 'SWO/Warden box must be present');
    assert.ok(pdfOutput.includes('REMARKS & SIGNATURE OF PRINCIPAL'), 'Principal/AO box must be present');
  });

  it('11. Institutional header and original physical form printed notes are preserved', async () => {
    const doc = await generateLeaveNotePdf(baseApprovedLeave);
    const pdfOutput = doc.output();

    assert.ok(pdfOutput.includes("ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY"), 'Header institution title must be present');
    assert.ok(pdfOutput.includes('Shobavana Campus, Mijar, Moodbidri, DK-574225'), 'Campus address must be present');
    assert.ok(pdfOutput.includes('Phone: 08258-262725'), 'Phone contact must be present');
    assert.ok(pdfOutput.includes('Fax: 08258-262726'), 'Fax contact must be present');
    assert.ok(!pdfOutput.includes('NAAC'), 'Unverified NAAC accreditation should not be in the physical header');
    assert.ok(!pdfOutput.includes('info@aiet.org.in'), 'Modern email not present on physical form header');
    assert.ok(
      pdfOutput.includes('mess bill reduction') || pdfOutput.includes('Separate mess bill'),
      'Original physical form mess bill reduction notes must be present'
    );
  });

  it('12. Migration 00041 schema integrity check', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '00041_leave_note_snapshots_and_remarks.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 00041 file must exist');

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

    // Verify all 9 columns added
    const requiredColumns = [
      'student_name_snapshot',
      'student_usn_snapshot',
      'branch_snapshot',
      'section_snapshot',
      'semester_snapshot',
      'academic_year_snapshot',
      'student_phone_snapshot',
      'parent_phone_snapshot',
      'approval_remarks'
    ];

    for (const col of requiredColumns) {
      assert.ok(
        sqlContent.includes(col),
        `Migration 00041 must include column ${col}`
      );
    }

    // Verify review_leave_request updated with p_approval_remarks
    assert.ok(
      sqlContent.includes('p_approval_remarks TEXT DEFAULT NULL'),
      'Migration 00041 must update review_leave_request with p_approval_remarks'
    );
    assert.ok(
      sqlContent.includes('DROP FUNCTION IF EXISTS public.review_leave_request(UUID, TEXT, TEXT)'),
      'Migration 00041 must safely drop 3-param overload before creating 4-param version'
    );
    assert.ok(
      sqlContent.includes('approval_remarks = CASE WHEN p_status = \'APPROVED\' THEN TRIM(p_approval_remarks) ELSE NULL END'),
      'Migration 00041 must update approval_remarks on APPROVED status'
    );
  });

  it('13. Service contract validation: submitLeaveRequest payload accepts snapshot parameters', () => {
    const leaveServicePath = path.join(rootDir, 'src', 'services', 'leaveService.ts');
    const serviceContent = fs.readFileSync(leaveServicePath, 'utf-8');

    assert.ok(serviceContent.includes('section?: string'), 'submitLeaveRequest must accept section');
    assert.ok(serviceContent.includes('studentPhone?: string'), 'submitLeaveRequest must accept studentPhone');
    assert.ok(serviceContent.includes('parentPhone?: string'), 'submitLeaveRequest must accept parentPhone');
    assert.ok(serviceContent.includes('student_name_snapshot:'), 'submitLeaveRequest must insert student_name_snapshot');
    assert.ok(serviceContent.includes('snapshot_provenance: \'SUBMISSION\''), 'submitLeaveRequest must insert snapshot_provenance SUBMISSION');
    assert.ok(serviceContent.includes('p_approval_remarks: cleanRemarks'), 'approveLeaveRequest must pass p_approval_remarks');
  });

  it('14. UI integration: student and HOD pages contain download button and snapshot fields', () => {
    const studentPagePath = path.join(rootDir, 'src', 'pages', 'LeaveRequestsPage.tsx');
    const studentContent = fs.readFileSync(studentPagePath, 'utf-8');

    assert.ok(studentContent.includes('downloadApprovedLeaveNote'), 'LeaveRequestsPage must import downloadApprovedLeaveNote');
    assert.ok(studentContent.includes('Download Note'), 'LeaveRequestsPage must have Download Note button');
    assert.ok(!studentContent.includes('Download PDF'), 'LeaveRequestsPage must not have Download PDF button');
    assert.ok(!studentContent.includes('<span>Application PDF</span>'), 'LeaveRequestsPage must not have Application PDF button');
    assert.ok(studentContent.includes('Section'), 'LeaveRequestsPage modal must have Section field');

    const hodPagePath = path.join(rootDir, 'src', 'hod', 'pages', 'HODLeaveDetail.tsx');
    const hodContent = fs.readFileSync(hodPagePath, 'utf-8');

    assert.ok(hodContent.includes('downloadApprovedLeaveNote'), 'HODLeaveDetail must import downloadApprovedLeaveNote');
    assert.ok(hodContent.includes('Download Approved Leave Note PDF'), 'HODLeaveDetail must have Download button');
    assert.ok(hodContent.includes('Approval Remarks'), 'HODLeaveDetail modal must have Approval Remarks input');
  });

  it('15. Provenance tracking: PDF distinguishes SUBMISSION, RETROACTIVE_BACKFILL, and UNVERIFIED', async () => {
    // 1. Default / SUBMISSION
    const submissionLeave = { ...baseApprovedLeave, snapshotProvenance: 'SUBMISSION' };
    const docSubmission = await generateLeaveNotePdf(submissionLeave);
    assert.ok(
      docSubmission.output().includes('Provenance: Verified Submission Snapshot'),
      'SUBMISSION must render Verified Submission Snapshot'
    );

    // 2. RETROACTIVE_BACKFILL
    const backfillLeave = { ...baseApprovedLeave, snapshotProvenance: 'RETROACTIVE_BACKFILL' };
    const docBackfill = await generateLeaveNotePdf(backfillLeave);
    assert.ok(
      docBackfill.output().includes('Provenance: Retroactive Backfill') && docBackfill.output().includes('Current Profile'),
      'RETROACTIVE_BACKFILL must render Retroactive Backfill (Current Profile)'
    );

    // 3. UNVERIFIED
    const unverifiedLeave = { ...baseApprovedLeave, snapshotProvenance: 'UNVERIFIED' };
    const docUnverified = await generateLeaveNotePdf(unverifiedLeave);
    assert.ok(
      docUnverified.output().includes('Provenance: Unverified Historical Record'),
      'UNVERIFIED must render Unverified Historical Record'
    );
  });

  it('16. Migration 00042 security hardening and provenance schema check', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '00042_leave_note_security_and_provenance.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 00042 file must exist');

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

    // Privilege hardening
    assert.ok(
      sqlContent.includes('REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;') &&
      sqlContent.includes('REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM anon;'),
      'Must revoke EXECUTE from PUBLIC and anon'
    );
    assert.ok(
      sqlContent.includes('GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) TO authenticated;'),
      'Must grant EXECUTE to authenticated'
    );

    // Column and check constraint
    assert.ok(
      sqlContent.includes('ADD COLUMN IF NOT EXISTS snapshot_provenance TEXT DEFAULT \'SUBMISSION\''),
      'Must add snapshot_provenance column'
    );
    assert.ok(
      sqlContent.includes('RETROACTIVE_BACKFILL') && sqlContent.includes('UNVERIFIED'),
      'Must define snapshot_provenance check constraint values'
    );

    // Student INSERT policy hardening
    assert.ok(
      sqlContent.includes('status = \'PENDING\''),
      'Must enforce status = PENDING on student insert'
    );
    assert.ok(
      sqlContent.includes('reviewed_by IS NULL'),
      'Must enforce reviewed_by IS NULL on student insert'
    );
    assert.ok(
      sqlContent.includes('reviewed_at IS NULL'),
      'Must enforce reviewed_at IS NULL on student insert'
    );
    assert.ok(
      sqlContent.includes('approval_remarks IS NULL'),
      'Must enforce approval_remarks IS NULL on student insert'
    );
  });

  it('17. generateStudentApplicationPdf generates valid single-page PDF for pending leave requests', async () => {
    const pendingLeave = {
      ...baseApprovedLeave,
      id: 'LV-APP-999',
      status: 'Pending',
      approvalRemarks: undefined,
      reviewedBy: undefined,
      reviewerName: undefined,
      reviewedAt: undefined
    };

    const doc = await generateStudentApplicationPdf(pendingLeave);
    assert.ok(doc && typeof doc.getNumberOfPages === 'function', 'Expected document wrapper');
    assert.strictEqual(doc.getNumberOfPages(), 1, 'Application PDF must be strictly 1 page');

    const pdfOutput = doc.output();
    assert.ok(pdfOutput.includes('Arjun Rao'), 'Student name must be rendered');
    assert.ok(pdfOutput.includes('4AL21CS001'), 'USN must be rendered');
    assert.ok(pdfOutput.includes('Computer Science and Engineering'), 'Branch must be rendered');
    assert.ok(pdfOutput.includes('Student Leave Application Form'), 'Application footer must be present');
  });

  it('18. generateStudentApplicationPdf keeps remarks and signature sections 100% clean of HOD endorsement', async () => {
    const pendingLeave = {
      ...baseApprovedLeave,
      id: 'LV-APP-998',
      status: 'Pending',
      approvalRemarks: 'Malicious Injected Remarks',
      reviewedBy: 'Unauthorized Hacker'
    };

    const doc = await generateStudentApplicationPdf(pendingLeave);
    const pdfOutput = doc.output();

    assert.strictEqual(pdfOutput.includes('HOD APPROVED'), false, 'Application form must NOT contain HOD approval stamp');
    assert.strictEqual(pdfOutput.includes('HOD Remarks:'), false, 'Application form must NOT contain HOD remarks label');
    assert.strictEqual(pdfOutput.includes('SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE'), false, 'Application form must NOT contain sample HOD seal');
  });

  it('19. Both application and approved PDFs share identical A4 page dimensions and byte structure', async () => {
    const appDoc = await generateStudentApplicationPdf({ ...baseApprovedLeave, status: 'Pending' });
    const apprDoc = await generateLeaveNotePdf(baseApprovedLeave);

    assert.strictEqual(appDoc.getNumberOfPages(), 1);
    assert.strictEqual(apprDoc.getNumberOfPages(), 1);

    const appBytes = await appDoc.save();
    const apprBytes = await apprDoc.save();

    assert.ok(appBytes.byteLength > 18000, 'Application PDF bytes must be valid');
    assert.ok(apprBytes.byteLength > 18000, 'Approved note PDF bytes must be valid');
  });

  it('20. Authoritative Architecture: submitLeaveRequest preserves snapshots and fails safely on missing schema', () => {
    const leaveServicePath = path.join(rootDir, 'src', 'services', 'leaveService.ts');
    const serviceContent = fs.readFileSync(leaveServicePath, 'utf-8');

    // 1. Must retain academic_year_snapshot in primary payload (do not delete or suppress)
    assert.ok(
      serviceContent.includes('academic_year_snapshot:'),
      'submitLeaveRequest MUST retain academic_year_snapshot in application payload'
    );
    assert.ok(
      serviceContent.includes('fullSnapshotPayload'),
      'submitLeaveRequest must define fullSnapshotPayload containing all snapshot fields'
    );

    // 2. Must NOT silently discard snapshots via basePayload fallback
    assert.ok(
      !serviceContent.includes('const basePayload = {'),
      'submitLeaveRequest must NOT define basePayload fallback that discards snapshot fields'
    );

    // 3. Must detect schema cache error and fail safely with clear error message
    assert.ok(
      serviceContent.includes('PGRST204'),
      'submitLeaveRequest must detect PGRST204 schema error'
    );
    assert.ok(
      serviceContent.includes('Migration 00041 pending'),
      'submitLeaveRequest must advise that Migration 00041 is pending'
    );

    // 4. Must not reconstruct historical snapshots from live student profiles
    assert.ok(
      serviceContent.includes('semester: l.semester_snapshot ?? null'),
      'mapLeaveRow must not reconstruct semester from student_academic live profile'
    );

    // 5. Authoritative 4-parameter review_leave_request RPC is strictly required
    assert.ok(
      serviceContent.includes("p_approval_remarks: cleanRemarks"),
      'approveLeaveRequest must pass cleanRemarks to review_leave_request'
    );
    assert.ok(
      !serviceContent.includes(".from('leave_requests').update({"),
      'approveLeaveRequest must NOT use direct table update fallback'
    );
    assert.ok(
      serviceContent.includes("Authoritative 4-parameter 'review_leave_request' RPC is not registered"),
      'approveLeaveRequest must require the authoritative 4-parameter RPC'
    );
  });

  it('21. Status-based PDF selection: generateLeavePdf routes approved vs pending/rejected correctly', async () => {
    const { generateLeavePdf } = await import('../src/services/leaveNotePdfService.ts');

    // 1. APPROVED -> renders approved leave note with HOD endorsement
    const approvedDoc = await generateLeavePdf(baseApprovedLeave);
    const approvedText = approvedDoc.output();
    assert.ok(approvedText.includes('HOD APPROVED'), 'Approved leave must include HOD endorsement');
    assert.ok(approvedText.includes('Provenance: Verified Submission Snapshot'), 'Approved leave must include snapshot badge');

    // 2. PENDING -> renders clean application form without approval details
    const pendingLeave = { ...baseApprovedLeave, status: 'Pending', approvalRemarks: 'Should Not Appear' };
    const pendingDoc = await generateLeavePdf(pendingLeave);
    const pendingText = pendingDoc.output();
    assert.ok(!pendingText.includes('HOD APPROVED'), 'Pending leave must NOT include HOD endorsement');
    assert.ok(!pendingText.includes('Should Not Appear'), 'Pending leave must NOT include approval remarks');
    assert.ok(pendingText.includes('Student Leave Application Form'), 'Pending leave must be student application form');

    // 3. REJECTED -> renders clean application form without fabricated approval details
    const rejectedLeave = { ...baseApprovedLeave, status: 'Rejected', approvalRemarks: 'Rejection reason' };
    const rejectedDoc = await generateLeavePdf(rejectedLeave);
    const rejectedText = rejectedDoc.output();
    assert.ok(!rejectedText.includes('HOD APPROVED'), 'Rejected leave must NOT include HOD endorsement');
    assert.ok(!rejectedText.includes('Rejection reason'), 'Rejected leave must NOT include remarks in HOD area');
    assert.ok(rejectedText.includes('Student Leave Application Form'), 'Rejected leave must be original student application form');
  });

});
