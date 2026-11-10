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
const outDir = path.join(rootDir, 'docs', 'audit', 'samples');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Scenario A: Complete student information (Approved)
const scenarioA = {
  id: 'LV-2026-001',
  studentId: 'a0000000-0000-0000-0000-000000000001',
  studentNameSnapshot: 'Aditya Shenoy',
  studentUsnSnapshot: '4AL22CS015',
  branchSnapshot: 'Computer Science and Engineering',
  semesterSnapshot: 6,
  academicYearSnapshot: '2025-2026',
  sectionSnapshot: 'B',
  studentPhoneSnapshot: '9876543210',
  parentPhoneSnapshot: '9876543211',
  leaveType: 'Academic Duty / Event',
  startDate: '2026-11-12',
  endDate: '2026-11-14',
  days: 3,
  reason: 'Participating as team lead in the VTU State-Level Hackathon 2026 representing AIET Mijar in the Smart Campus AI Track.',
  status: 'Approved',
  submittedAt: '09/11/2026',
  reviewedBy: 'Dr. K. R. Sharma',
  reviewerName: 'Dr. K. R. Sharma',
  reviewedAt: '10/11/2026',
  approvalRemarks: 'Sanctioned and approved under AIET VTU event guidelines. Full attendance credit granted upon certificate submission.',
  snapshotProvenance: 'SUBMISSION'
};

// 2. Scenario B: Missing optional information (no section, no parent mobile)
const scenarioB = {
  id: 'LV-2026-002',
  studentId: 'a0000000-0000-0000-0000-000000000002',
  studentNameSnapshot: 'Pooja Hegde',
  studentUsnSnapshot: '4AL23IS042',
  branchSnapshot: 'Information Science and Engineering',
  semesterSnapshot: 4,
  academicYearSnapshot: '2025-2026',
  sectionSnapshot: undefined,
  studentPhoneSnapshot: '9845123456',
  parentPhoneSnapshot: undefined,
  leaveType: 'Medical Leave',
  startDate: '2026-11-18',
  endDate: '2026-11-18',
  days: 1,
  reason: "Severe viral fever and medical consultation at Alva's Health Centre. Doctor's medical prescription attached in portal.",
  status: 'Approved',
  submittedAt: '16/11/2026',
  reviewedBy: 'Dr. Ramesh Shetty',
  reviewerName: 'Dr. Ramesh Shetty',
  reviewedAt: '17/11/2026',
  approvalRemarks: 'Medical leave approved. Please submit fitness certificate to department coordinator upon return.',
  snapshotProvenance: 'SUBMISSION'
};

// 3. Scenario C: Historical backfilled request
const scenarioC = {
  id: 'LV-2025-089',
  studentId: 'a0000000-0000-0000-0000-000000000003',
  studentNameSnapshot: 'Naveen Kumar',
  studentUsnSnapshot: '4AL21ME078',
  branchSnapshot: 'Mechanical Engineering',
  semesterSnapshot: 7,
  academicYearSnapshot: '2025-2026',
  sectionSnapshot: 'A',
  studentPhoneSnapshot: '9123456780',
  parentPhoneSnapshot: '9123456789',
  leaveType: 'Industrial Visit / Internship',
  startDate: '2025-10-05',
  endDate: '2025-10-07',
  days: 3,
  reason: 'Attending VTU sponsored CNC machine workshop and advanced manufacturing training at Bosch Rexroth regional center.',
  status: 'Approved',
  submittedAt: '03/10/2025',
  reviewedBy: 'Prof. M. B. Patil',
  reviewerName: 'Prof. M. B. Patil',
  reviewedAt: '04/10/2025',
  approvalRemarks: 'Approved retrospectively for VTU industrial training records.',
  snapshotProvenance: 'RETROACTIVE_BACKFILL'
};

// 4. Scenario Student Application: Pending Leave Request
const scenarioApplication = {
  id: 'LV-2026-104',
  studentId: 'a0000000-0000-0000-0000-000000000004',
  studentNameSnapshot: 'Sneha Rao',
  studentUsnSnapshot: '4AL22CS088',
  branchSnapshot: 'Computer Science and Engineering',
  semesterSnapshot: 6,
  academicYearSnapshot: '2025-2026',
  sectionSnapshot: 'A',
  studentPhoneSnapshot: '9741234567',
  parentPhoneSnapshot: '9741234568',
  leaveType: 'Academic Duty / Event',
  startDate: '2026-11-20',
  endDate: '2026-11-22',
  days: 3,
  reason: 'Representing AIET at the Inter-Collegiate Technical Symposium for Project Presentation and Coding Challenge.',
  status: 'Pending',
  submittedAt: '10/11/2026',
  snapshotProvenance: 'SUBMISSION'
};

const samples = [
  { name: 'scenario_a_complete_student.pdf', data: scenarioA, type: 'approved' },
  { name: 'scenario_b_missing_optional.pdf', data: scenarioB, type: 'approved' },
  { name: 'scenario_c_retroactive_backfill.pdf', data: scenarioC, type: 'approved' },
  { name: 'scenario_student_application.pdf', data: scenarioApplication, type: 'application' },
  { name: 'scenario_approved_leave_note.pdf', data: scenarioA, type: 'approved' }
];

for (const { name, data, type } of samples) {
  const doc = type === 'application' 
    ? await generateStudentApplicationPdf(data) 
    : await generateLeaveNotePdf(data);
  const filePath = path.join(outDir, name);
  const pdfBytes = doc.output('arraybuffer');
  fs.writeFileSync(filePath, Buffer.from(pdfBytes));
  console.log(`Generated (${type}): ${filePath} (${pdfBytes.byteLength} bytes, pages: ${doc.getNumberOfPages()})`);
}
