import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLeaveNotePdf, generateStudentApplicationPdf } from '../src/services/leaveNotePdfService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseLeave = {
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
  reason: 'Representing AIET at VTU State Hackathon 2026 (Academic duty sanctioned for competition participation).',
  status: 'Approved',
  submittedAt: '2026-11-10T10:00:00Z',
  reviewedBy: 'Dr. Ramesh HOD',
  reviewerName: 'Dr. Ramesh HOD',
  reviewedAt: '2026-11-11T14:30:00Z',
  approvalRemarks: 'Sanctioned under AIET VTU event guidelines. Academic duty leave approved.',
  snapshotProvenance: 'SUBMISSION'
};

async function run() {
  const samplesDir = path.join(__dirname, '..', 'docs', 'audit', 'samples');
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  // 1. Approved Leave Note
  const approvedDoc = await generateLeaveNotePdf(baseLeave);
  const approvedBytes = await approvedDoc.save();
  const approvedPath = path.join(samplesDir, 'redesigned_approved_leave_note.pdf');
  fs.writeFileSync(approvedPath, approvedBytes);
  console.log('✓ Generated:', approvedPath, 'Bytes:', approvedBytes.length);

  // 2. Student Application Form
  const appLeave = { ...baseLeave, status: 'Pending' };
  const appDoc = await generateStudentApplicationPdf(appLeave);
  const appBytes = await appDoc.save();
  const appPath = path.join(samplesDir, 'redesigned_student_application.pdf');
  fs.writeFileSync(appPath, appBytes);
  console.log('✓ Generated:', appPath, 'Bytes:', appBytes.length);
}

run();
