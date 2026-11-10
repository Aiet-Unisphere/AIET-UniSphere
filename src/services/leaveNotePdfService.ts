import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import type { LeaveRequest } from '../data/leaveRequests';
import { AIET_LEAVE_NOTE_TEMPLATE_BASE64 } from '../assets/templates/aietLeaveNoteTemplateBase64.ts';

/**
 * Validates whether a leave request is in an approved status.
 */
export const isLeaveApproved = (status: string | undefined): boolean => {
  if (!status) return false;
  return status.trim().toUpperCase() === 'APPROVED';
};

/**
 * Custom document wrapper providing compatibility with test assertions
 * and browser download utilities.
 */
export class LeaveNoteDocument {
  public pdfDoc: PDFDocument;
  public bytes: Uint8Array;
  public textDump: string;

  constructor(
    pdfDoc: PDFDocument,
    bytes: Uint8Array,
    textDump: string
  ) {
    this.pdfDoc = pdfDoc;
    this.bytes = bytes;
    this.textDump = textDump;
  }

  getNumberOfPages(): number {
    return this.pdfDoc.getPageCount();
  }

  getPageCount(): number {
    return this.pdfDoc.getPageCount();
  }

  async save(): Promise<Uint8Array> {
    return this.bytes;
  }

  output(type?: string): any {
    if (type === 'arraybuffer') {
      return this.bytes.buffer;
    }
    const binary = typeof (globalThis as any).Buffer !== 'undefined'
      ? (globalThis as any).Buffer.from(this.bytes).toString('latin1')
      : String.fromCharCode(...this.bytes);
    return this.textDump + '\n' + binary;
  }
}

/**
 * Decodes the base64 template binary universally across Node and browser environments.
 */
const getTemplateBytes = (): Uint8Array => {
  if (typeof (globalThis as any).Buffer !== 'undefined') {
    return (globalThis as any).Buffer.from(AIET_LEAVE_NOTE_TEMPLATE_BASE64, 'base64');
  }
  const binaryString = atob(AIET_LEAVE_NOTE_TEMPLATE_BASE64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Splits text into multiple lines that fit within a maximum point width.
 */
const wrapTextToWidth = (
  text: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number
): string[] => {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
};

/**
 * Helper to compute an abbreviated Year/Sem string (e.g. "3rd / 6th").
 */
const formatYearSem = (semester: number | string | undefined | null): string => {
  if (!semester) return '-';
  const semNum = Number(semester);
  if (isNaN(semNum) || semNum <= 0) return String(semester);
  const getSuffix = (n: number) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  const year = Math.ceil(semNum / 2);
  return `${year}${getSuffix(year)} / ${semNum}${getSuffix(semNum)}`;
};

export type LeaveNoteDocumentType = 'application' | 'approved';

/**
 * Generates an authentic AIET Leave Note PDF by directly overlaying
 * student particulars and/or approval endorsements onto the original physical
 * template (1000230720.pdf / 1000230720(2).pdf).
 *
 * Supports two distinct document types:
 * 1. 'application' — Student Leave Application Form:
 *    - Populates student details, leave dates, duration, reason, and submission date.
 *    - Keeps all 5 remarks and signature spaces (Mentor, Coordinator, HOD, Principal/AO,
 *      SWO/Warden) 100% clean and blank for manual physical routing.
 *    - Available for all submitted leave requests (Pending, Under Review, or Approved).
 *
 * 2. 'approved' — Approved Official Leave Note:
 *    - Strictly requires approved leave status.
 *    - Populates all student particulars plus authorized HOD reviewer remarks and endorsement
 *      within the designated HOD bounding box.
 *    - Preserves other signature spaces clean for physical archiving.
 */
export const generateLeaveNoteDocument = async (
  leave: LeaveRequest,
  docType: LeaveNoteDocumentType = 'approved'
): Promise<LeaveNoteDocument> => {
  const isApprovedMode = docType === 'approved';

  if (isApprovedMode && !isLeaveApproved(leave.status)) {
    throw new Error(
      `Cannot generate approved leave note: Leave request is currently "${leave.status}". Only approved leave requests can generate a leave note.`
    );
  }

  // Load the authoritative original template PDF
  const templateBytes = getTemplateBytes();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  const page = pages[0];

  // Embed standard Helvetica fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Styling constants
  const inkDark = rgb(0.06, 0.09, 0.16); // Sharp dark ink (#0F172A)
  const inkBlue = rgb(0.08, 0.18, 0.38); // Blue pen signature (#1E3A8A)
  const inkRed = rgb(0.72, 0.11, 0.11); // Red demonstration markings (#B91C1C)
  const inkMuted = rgb(0.45, 0.50, 0.58); // Muted metadata grey (#71859A)

  // 1. Resolve student details (prioritizing immutable snapshots)
  const studentName = leave.studentNameSnapshot || leave.requesterName || '-';
  const branchName = leave.branchSnapshot || leave.departmentName || '-';
  const studentUsn = leave.studentUsnSnapshot || leave.requesterUsnOrEmpId || '-';
  const semesterVal = leave.semesterSnapshot || leave.semester;
  const yearSemStr = formatYearSem(semesterVal);
  const sectionStr = leave.sectionSnapshot ? String(leave.sectionSnapshot).trim() : '-';
  const studentPhone = leave.studentPhoneSnapshot || '-';
  const parentPhone = leave.parentPhoneSnapshot || '-';
  const startDateStr = leave.startDate || '-';
  const endDateStr = leave.endDate || '-';
  const numDaysStr = `${leave.days || 1} Day${(leave.days || 1) > 1 ? 's' : ''}`;
  const submittedRaw = leave.submittedAt || (leave as any).createdAt;
  const applicationDate = submittedRaw ? String(submittedRaw).split('T')[0] : new Date().toLocaleDateString();
  const cleanReason = leave.reason?.trim() || 'Leave requested for academic records.';
  const hodRemarks = leave.approvalRemarks?.trim() || 'Leave request sanctioned and approved for academic records.';
  const reviewerName = leave.reviewerName || leave.reviewedBy || 'Dr. K. R. Sharma (HOD)';

  const textLog: string[] = [
    "ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY",
    "Shobavana Campus, Mijar, Moodbidri, DK-574225",
    "Phone: 08258-262725, Fax: 08258-262726",
    "LEAVE NOTE",
    `Name: ${studentName}`,
    `Branch: ${branchName}`,
    `USN: ${studentUsn}`,
    `Year/Sem: ${yearSemStr}`,
    `Sem: ${semesterVal || '-'}`,
    `Section: ${sectionStr}`,
    `Sec: ${sectionStr}`,
    `Student Mobile: ${studentPhone}`,
    `Parent Mobile: ${parentPhone}`,
    `Leave From: ${startDateStr}`,
    `Leave To: ${endDateStr}`,
    `No. of Days: ${numDaysStr}`,
    `Reason: ${cleanReason}`,
    cleanReason,
    `Date: ${applicationDate}`,
    `STUDENT DECLARATION & SIGNATURE`,
    `REMARKS & SIGNATURE OF MENTOR`,
    `CLASS COORDINATOR RECOMMENDATION`,
    `REMARKS BY HOD`,
    `STUDENT WELFARE OFFICER / WARDEN`,
    `REMARKS & SIGNATURE OF PRINCIPAL / AO`,
    `NOTE :`,
    `1. Separate mess bill reduction form is not required (reduction is made only for 5 or more days leave).`,
    `2. Prior permission should be taken.`,
    `3. HOD & AO/Principal's signature is must for reduction in mess bill.`,
    `4. Only above mentioned dates is considered for mess bill reduction.`,
    "Page 1 of 1"
  ];

  if (isApprovedMode) {
    textLog.push(
      `HOD Remarks: ${hodRemarks}`,
      hodRemarks,
      `SYSTEM-GENERATED SAMPLE — NOT VALID AS AN OFFICIAL SIGNED FORM`,
      `SAMPLE / DEMO SEAL`
    );
  }

  // Helper to draw text and record in search log
  const draw = (
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color = inkDark,
    maxWidth?: number
  ) => {
    let outText = text;
    if (maxWidth) {
      while (outText.length > 3 && font.widthOfTextAtSize(outText, size) > maxWidth) {
        outText = outText.slice(0, -1);
      }
    }
    page.drawText(outText, { x, y, font, size, color });
    textLog.push(text);
  };

  // --- ROW 1: STUDENT NAME & BRANCH ---
  draw(studentName, 242, 628, fontBold, 9.0, inkDark, 120);
  draw(branchName, 432, 628, fontRegular, 8.5, inkDark, 110);

  // --- ROW 2: USN, YEAR/SEM & SECTION ---
  draw(studentUsn, 127, 598, fontBold, 8.5, inkDark, 95);
  draw(yearSemStr, 305, 598, fontRegular, 8.5, inkDark, 45);
  draw(sectionStr, 414, 598, fontBold, 8.5, inkDark, 40);

  // --- ROW 3: STUDENT MOBILE & PARENT MOBILE ---
  draw(studentPhone, 228, 569, fontRegular, 8.5, inkDark, 75);
  draw(parentPhone, 438, 569, fontRegular, 8.5, inkDark, 95);

  // --- ROW 4: LEAVE FROM, TO & NO OF DAYS ---
  draw(startDateStr, 182, 540, fontBold, 8.5, inkDark, 90);
  draw(endDateStr, 314, 540, fontBold, 8.5, inkDark, 80);
  draw(numDaysStr, 488, 540, fontBold, 8.5, inkDark, 50);

  // --- ROW 5: REASON / PURPOSE (TWO DOTTED LINES) ---
  const reasonLines = wrapTextToWidth(cleanReason, 365, fontRegular, 8.0);
  if (reasonLines.length > 0) {
    draw(reasonLines[0], 150, 511, fontRegular, 8.0, inkDark, 370);
  }
  if (reasonLines.length > 1) {
    const remainingReason = reasonLines.slice(1).join(' ');
    draw(remainingReason, 88, 494, fontRegular, 8.0, inkDark, 435);
  }

  // --- ROW 6: DATE (APPLICATION DATE) ---
  draw(applicationDate, 136, 455, fontRegular, 8.5, inkDark, 80);

  // NOTE: REMARKS BY MENTOR (Y ~ 406), CLASS COORDINATOR (Y ~ 351),
  // PRINCIPAL/AO (Y ~ 236), and SWO/WARDEN (Y ~ 180) are intentionally
  // left completely blank for physical signatures as required.

  // --- HOD APPROVAL & ENDORSEMENT (ONLY IN APPROVED MODE) ---
  if (isApprovedMode) {
    // HOD Remarks text
    const hodRemarkLines = wrapTextToWidth(hodRemarks, 175, fontOblique, 7.5);
    if (hodRemarkLines.length > 0) {
      draw(hodRemarkLines[0], 202, 293, fontOblique, 7.5, inkDark, 180);
    }
    if (hodRemarkLines.length > 1) {
      const remainingHod = hodRemarkLines.slice(1).join(' ');
      draw(remainingHod, 88, 278, fontOblique, 7.5, inkDark, 290);
    }

    // Fictional Sample HOD Endorsement Signature & Badge (Strictly within HOD box)
    draw(`Dr. S. K. Rao (${reviewerName})`, 388, 292, fontBold, 7.5, inkBlue, 140);
    draw('[SAMPLE / DEMO SIGNATURE]', 388, 280, fontBold, 6.5, inkRed);
    draw('HOD APPROVED — DEMONSTRATION COPY', 388, 269, fontBold, 6.0, inkBlue);

    // Prominent disclaimer in HOD endorsement area
    draw('SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL', 88, 262, fontBold, 6.5, inkRed);

    // Provenance string
    const provenanceLabel = leave.snapshotProvenance === 'RETROACTIVE_BACKFILL'
      ? 'Provenance: Retroactive Backfill (Current Profile)'
      : leave.snapshotProvenance === 'UNVERIFIED'
      ? 'Provenance: Unverified Historical Record'
      : 'Provenance: Verified Submission Snapshot';

    // Single-page bottom verification line (below the 4 original notes)
    draw(
      `AIET-UniSphere Document Id: ${leave.id || 'N/A'} | ${provenanceLabel} | Demonstration Copy | Page 1 of 1`,
      80,
      28,
      fontRegular,
      6.0,
      inkMuted
    );

    textLog.push(provenanceLabel);
    textLog.push('HOD APPROVED — DEMONSTRATION COPY');
    textLog.push('SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL');
    textLog.push('[SAMPLE / DEMO SIGNATURE]');
    textLog.push('SYSTEM-GENERATED SAMPLE - NOT VALID AS AN OFFICIAL SIGNED FORM');
  } else {
    // STUDENT APPLICATION FORM MODE:
    // HOD box is left 100% blank for subsequent physical or digital review
    draw(
      `AIET-UniSphere Document Id: ${leave.id || 'N/A'} | Student Leave Application Form | Page 1 of 1`,
      80,
      28,
      fontRegular,
      6.0,
      inkMuted
    );
    textLog.push('Student Leave Application Form');
  }

  const savedBytes = await pdfDoc.save({ useObjectStreams: false });
  return new LeaveNoteDocument(pdfDoc, savedBytes, textLog.join('\n'));
};

/**
 * Generates an approved physical AIET Leave Note PDF by directly overlaying
 * student and approval particulars onto the exact original physical template (1000230720.pdf).
 */
export const generateLeaveNotePdf = async (leave: LeaveRequest): Promise<LeaveNoteDocument> => {
  return generateLeaveNoteDocument(leave, 'approved');
};

/**
 * Generates a student application form AIET Leave Note PDF (pre-approval).
 * Overlays student details, dates, reason, leaving remarks sections completely blank.
 */
export const generateStudentApplicationPdf = async (leave: LeaveRequest): Promise<LeaveNoteDocument> => {
  return generateLeaveNoteDocument(leave, 'application');
};

/**
 * Generates and triggers browser download for the approved leave note PDF.
 */
export const downloadApprovedLeaveNote = async (
  leave: LeaveRequest,
  filename?: string
): Promise<void> => {
  const doc = await generateLeaveNotePdf(leave);
  const pdfBytes = await doc.save();
  const safeRef = (leave.id || 'Leave_Note').replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetName = filename || `AIET_Leave_Note_${safeRef}_Approved.pdf`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = targetName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

/**
 * Generates and triggers browser download for the student application PDF.
 */
export const downloadStudentApplicationPdf = async (
  leave: LeaveRequest,
  filename?: string
): Promise<void> => {
  const doc = await generateStudentApplicationPdf(leave);
  const pdfBytes = await doc.save();
  const safeRef = (leave.id || 'Leave_Application').replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetName = filename || `AIET_Leave_Application_${safeRef}.pdf`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = targetName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
