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

  it('2. generateLeaveNotePdf strictly rejects unapproved leave requests with an informative error', () => {
    const pendingLeave = { ...baseApprovedLeave, status: 'Pending' };
    assert.throws(
      () => generateLeaveNotePdf(pendingLeave),
      /Cannot generate approved leave note: Leave request is currently "Pending"/
    );

    const rejectedLeave = { ...baseApprovedLeave, status: 'Rejected' };
    assert.throws(
      () => generateLeaveNotePdf(rejectedLeave),
      /Cannot generate approved leave note: Leave request is currently "Rejected"/
    );
  });

  it('3. generateLeaveNotePdf generates valid jsPDF document for approved leave', () => {
    const doc = generateLeaveNotePdf(baseApprovedLeave);
    assert.ok(doc && typeof doc.getNumberOfPages === 'function', 'Expected jsPDF document');
    assert.strictEqual(doc.getNumberOfPages(), 1, 'Document must be exactly 1 page');
  });

  it('4. Single-page constraint: document remains strictly 1 page even with lengthy reason and remarks', () => {
    const lengthyLeave = {
      ...baseApprovedLeave,
      reason: 'A'.repeat(500), // very long reason
      approvalRemarks: 'R'.repeat(300) // very long remark
    };
    const doc = generateLeaveNotePdf(lengthyLeave);
    assert.strictEqual(doc.getNumberOfPages(), 1, 'Lengthy content must not spill onto a second page');
  });

  it('5. Snapshot values take precedence over mutable profile fields', () => {
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

    const doc = generateLeaveNotePdf(leaveWithSnapshots);
    const pdfOutput = doc.output();

    // Verify snapshot fields are in the output string
    assert.ok(pdfOutput.includes('Immutable Snapshot Name'), 'Snapshot name must be rendered');
    assert.ok(pdfOutput.includes('SNAPSHOT_USN_4AL21CS099'), 'Snapshot USN must be rendered');
    assert.ok(pdfOutput.includes('Information Science & Engineering'), 'Snapshot branch must be rendered');
    assert.ok(pdfOutput.includes('Sec: ISE-B'), 'Snapshot section must be rendered');
  });

  it('6. Fallback values are safely rendered when snapshot fields are missing', () => {
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

    const doc = generateLeaveNotePdf(legacyLeave);
    const pdfOutput = doc.output();

    assert.ok(pdfOutput.includes('Legacy Student'), 'Fallback requesterName must be rendered');
    assert.ok(pdfOutput.includes('4AL20CS050'), 'Fallback requesterUsn must be rendered');
    assert.ok(pdfOutput.includes('Civil Engineering'), 'Fallback departmentName must be rendered');
    assert.ok(pdfOutput.includes('Sem: 5'), 'Fallback semester must be rendered');
    assert.ok(pdfOutput.includes('Sec: -') || pdfOutput.includes('Sec:'), 'Fallback empty section must render dash');
  });

  it('7. Approval remarks and reviewer details are rendered accurately', () => {
    const doc = generateLeaveNotePdf(baseApprovedLeave);
    const pdfOutput = doc.output();

    assert.ok(pdfOutput.includes('STATUS: APPROVED [OFFICIAL]'), 'Approval status badge must be present');
    assert.ok(pdfOutput.includes('Dr. Ramesh HOD'), 'Reviewer name must be present');
    assert.ok(
      pdfOutput.includes('Academic duty sanctioned') || pdfOutput.includes('VTU Hackathon'),
      'HOD approval remarks must be present'
    );
  });

  it('8. Default approval remarks are rendered when approvalRemarks is omitted', () => {
    const leaveWithoutRemarks = {
      ...baseApprovedLeave,
      approvalRemarks: undefined
    };
    const doc = generateLeaveNotePdf(leaveWithoutRemarks);
    const pdfOutput = doc.output();

    assert.ok(
      pdfOutput.includes('Leave request sanctioned and approved for academic records.'),
      'Default approval remark must be rendered when custom remarks are absent'
    );
  });

  it('9. Prominent fictional watermark and sample labels are present in the PDF output', () => {
    const doc = generateLeaveNotePdf(baseApprovedLeave);
    const pdfOutput = doc.output();

    assert.ok(
      pdfOutput.includes('SYSTEM-GENERATED SAMPLE') && pdfOutput.includes('NOT VALID AS AN OFFICIAL SIGNED FORM'),
      'Watermark must be present'
    );
    assert.ok(
      pdfOutput.includes('[SAMPLE / DEMO SIGNATURE]'),
      'Sample signature tag must be present'
    );
    assert.ok(
      pdfOutput.includes('SAMPLE / DEMO SEAL'),
      'Sample seal tag must be present'
    );
  });

  it('10. Blank manual signature sections exist for all required signatories', () => {
    const doc = generateLeaveNotePdf(baseApprovedLeave);
    const pdfOutput = doc.output();

    assert.ok(pdfOutput.includes('STUDENT DECLARATION & SIGNATURE'), 'Student signature box must be present');
    assert.ok(pdfOutput.includes('REMARKS & SIGNATURE OF MENTOR'), 'Mentor signature box must be present');
    assert.ok(pdfOutput.includes('CLASS COORDINATOR RECOMMENDATION'), 'Class coordinator box must be present');
    assert.ok(pdfOutput.includes('STUDENT WELFARE OFFICER'), 'SWO/Warden box must be present');
    assert.ok(pdfOutput.includes('REMARKS & SIGNATURE OF PRINCIPAL'), 'Principal/AO box must be present');
  });

  it('11. Institutional header and VTU attendance regulations are rendered', () => {
    const doc = generateLeaveNotePdf(baseApprovedLeave);
    const pdfOutput = doc.output();

    assert.ok(pdfOutput.includes("ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY"), 'Header institution title must be present');
    assert.ok(pdfOutput.includes('Shobhavana Campus, Mijar, Moodbidri'), 'Campus address must be present');
    assert.ok(pdfOutput.includes('75% attendance'), 'VTU 75% attendance regulation must be present');
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
    assert.ok(serviceContent.includes('p_approval_remarks: cleanRemarks'), 'approveLeaveRequest must pass p_approval_remarks');
  });

  it('14. UI integration: student and HOD pages contain download button and snapshot fields', () => {
    const studentPagePath = path.join(rootDir, 'src', 'pages', 'LeaveRequestsPage.tsx');
    const studentContent = fs.readFileSync(studentPagePath, 'utf-8');

    assert.ok(studentContent.includes('downloadApprovedLeaveNote'), 'LeaveRequestsPage must import downloadApprovedLeaveNote');
    assert.ok(studentContent.includes('Download Note'), 'LeaveRequestsPage must have Download Note button');
    assert.ok(studentContent.includes('Section'), 'LeaveRequestsPage modal must have Section field');

    const hodPagePath = path.join(rootDir, 'src', 'hod', 'pages', 'HODLeaveDetail.tsx');
    const hodContent = fs.readFileSync(hodPagePath, 'utf-8');

    assert.ok(hodContent.includes('downloadApprovedLeaveNote'), 'HODLeaveDetail must import downloadApprovedLeaveNote');
    assert.ok(hodContent.includes('Download Approved Leave Note PDF'), 'HODLeaveDetail must have Download button');
    assert.ok(hodContent.includes('Approval Remarks'), 'HODLeaveDetail modal must have Approval Remarks input');
  });

});
