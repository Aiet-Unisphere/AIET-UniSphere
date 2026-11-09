import { jsPDF } from 'jspdf';
import type { LeaveRequest } from '../data/leaveRequests';

/**
 * Validates whether a leave request is in an approved status.
 */
export const isLeaveApproved = (status: string | undefined): boolean => {
  if (!status) return false;
  return status.trim().toUpperCase() === 'APPROVED';
};

/**
 * Generates an official AIET-style single-page A4 Leave Note PDF.
 *
 * Implements strict security:
 * - Throws error if request is not approved.
 * - Snapshots are prioritized over mutable profile fields.
 * - Watermark and sample seals clearly distinguish sample/demo documents.
 */
export const generateLeaveNotePdf = (leave: LeaveRequest): jsPDF => {
  if (!isLeaveApproved(leave.status)) {
    throw new Error(
      `Cannot generate approved leave note: Leave request is currently "${leave.status}". Only approved leave requests can generate a leave note.`
    );
  }

  // A4 portrait: 210mm x 297mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  // -------------------------------------------------------------
  // 1. WATERMARK (Faint diagonal background stamp)
  // -------------------------------------------------------------
  doc.saveGraphicsState?.();
  doc.setTextColor(226, 232, 240); // Faint light grey (#E2E8F0)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  // Repeat watermark diagonally across page center
  doc.text(
    'SYSTEM-GENERATED SAMPLE - NOT VALID AS AN OFFICIAL SIGNED FORM',
    105,
    135,
    { align: 'center', angle: 36 }
  );
  doc.text(
    'SAMPLE / DEMO APPROVED LEAVE NOTE',
    105,
    175,
    { align: 'center', angle: 36 }
  );
  doc.restoreGraphicsState?.();

  // -------------------------------------------------------------
  // 2. OUTER BORDER
  // -------------------------------------------------------------
  doc.setDrawColor(30, 41, 59); // Slate-800
  doc.setLineWidth(0.6);
  doc.rect(marginX, 10, contentWidth, 277);

  // Inner subtle border
  doc.setDrawColor(203, 213, 225); // Slate-300
  doc.setLineWidth(0.2);
  doc.rect(marginX + 1.2, 11.2, contentWidth - 2.4, 274.6);

  // -------------------------------------------------------------
  // 3. INSTITUTIONAL HEADER
  // -------------------------------------------------------------
  let currentY = 17;

  doc.setTextColor(24, 43, 73); // Deep Navy
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text("ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY", 105, currentY, { align: 'center' });

  currentY += 4.5;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text('Recognized by Govt. of Karnataka, Affiliated to VTU Belagavi & Approved by AICTE, New Delhi', 105, currentY, { align: 'center' });

  currentY += 3.8;
  doc.text('Shobhavana Campus, Mijar, Moodbidri, D.K. - 574225, Karnataka, India', 105, currentY, { align: 'center' });

  currentY += 3.6;
  doc.setFontSize(7);
  doc.text('Phone: 08258-262725 / 262724 | Email: principalaiet08@gmail.com | Website: www.aiet.org.in', 105, currentY, { align: 'center' });

  // Divider line
  currentY += 4;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(marginX + 3, currentY, marginX + contentWidth - 3, currentY);

  // -------------------------------------------------------------
  // 4. DOCUMENT TITLE & IDENTIFIERS
  // -------------------------------------------------------------
  currentY += 3.5;
  doc.setFillColor(241, 245, 249); // Slate-100
  doc.roundedRect(marginX + 45, currentY, 92, 7.5, 1, 1, 'F');
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX + 45, currentY, 92, 7.5, 1, 1, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('STUDENT LEAVE NOTE / ON-DUTY (OD) FORM', 105, currentY + 5.2, { align: 'center' });

  // Reference number & Date metadata
  currentY += 11;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`Ref. No: ${leave.id || 'LV-N/A'}`, marginX + 4, currentY);

  const applicationDate = leave.submittedAt || new Date().toLocaleDateString();
  doc.text(`Date of Application: ${applicationDate}`, marginX + contentWidth - 4, currentY, { align: 'right' });

  // -------------------------------------------------------------
  // 5. STUDENT & LEAVE PARTICULARS (TABULAR GRID)
  // -------------------------------------------------------------
  currentY += 3.5;
  const gridStartX = marginX + 3;
  const gridWidth = contentWidth - 6;
  const rowHeight = 7.2;

  // Resolve snapshot values first with existing fallbacks
  const studentName = leave.studentNameSnapshot || leave.requesterName || 'Student Name';
  const studentUsn = leave.studentUsnSnapshot || leave.requesterUsnOrEmpId || 'USN Not Provided';
  const branchName = leave.branchSnapshot || leave.departmentName || 'Engineering Department';
  const semesterStr = leave.semesterSnapshot ? String(leave.semesterSnapshot) : (leave.semester ? String(leave.semester) : '-');
  const sectionStr = leave.sectionSnapshot ? String(leave.sectionSnapshot) : '-';
  const academicYear = leave.academicYearSnapshot || '2024-2025';
  const studentPhone = leave.studentPhoneSnapshot || '-';
  const parentPhone = leave.parentPhoneSnapshot || '-';
  const leaveCategory = leave.leaveType || 'General Leave';
  const datesSpan = `${leave.startDate} to ${leave.endDate} (${leave.days || 1} Day${(leave.days || 1) > 1 ? 's' : ''})`;

  // Helper to draw grid rows
  const drawTableRow = (
    y: number,
    label1: string,
    val1: string,
    label2: string,
    val2: string,
    h = rowHeight
  ) => {
    doc.setDrawColor(180, 190, 205);
    doc.setLineWidth(0.2);
    doc.rect(gridStartX, y, gridWidth, h);

    const midX = gridStartX + gridWidth / 2;
    doc.line(midX, y, midX, y + h);

    // Left column: label (32mm) + value
    const col1LabelW = 34;
    doc.setFillColor(248, 250, 252);
    doc.rect(gridStartX, y, col1LabelW, h, 'F');
    doc.line(gridStartX + col1LabelW, y, gridStartX + col1LabelW, y + h);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(label1, gridStartX + 2, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(val1, gridStartX + col1LabelW + 2.5, y + 4.8, { maxWidth: midX - (gridStartX + col1LabelW) - 4 });

    // Right column: label (34mm) + value
    const col2LabelW = 34;
    doc.setFillColor(248, 250, 252);
    doc.rect(midX, y, col2LabelW, h, 'F');
    doc.line(midX + col2LabelW, y, midX + col2LabelW, y + h);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(label2, midX + 2, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(val2, midX + col2LabelW + 2.5, y + 4.8, { maxWidth: gridStartX + gridWidth - (midX + col2LabelW) - 4 });
  };

  drawTableRow(currentY, '1. Student Name', studentName, '2. USN / Roll No', studentUsn);
  currentY += rowHeight;

  drawTableRow(currentY, '3. Branch / Dept', branchName, '4. Sem & Section', `Sem: ${semesterStr}  |  Sec: ${sectionStr}`);
  currentY += rowHeight;

  drawTableRow(currentY, '5. Academic Year', academicYear, '6. Leave Category', leaveCategory);
  currentY += rowHeight;

  drawTableRow(currentY, '7. Student Contact', studentPhone, '8. Parent Contact', parentPhone);
  currentY += rowHeight;

  // Single full-width row for Dates
  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.2);
  doc.rect(gridStartX, currentY, gridWidth, rowHeight);
  doc.setFillColor(248, 250, 252);
  doc.rect(gridStartX, currentY, 34, rowHeight, 'F');
  doc.line(gridStartX + 34, currentY, gridStartX + 34, currentY + rowHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('9. Period of Leave', gridStartX + 2, currentY + 4.8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(datesSpan, gridStartX + 36.5, currentY + 4.8);

  // Reason box
  currentY += rowHeight;
  const reasonBoxH = 14;
  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.2);
  doc.rect(gridStartX, currentY, gridWidth, reasonBoxH);

  doc.setFillColor(248, 250, 252);
  doc.rect(gridStartX, currentY, 34, reasonBoxH, 'F');
  doc.line(gridStartX + 34, currentY, gridStartX + 34, currentY + reasonBoxH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('10. Reason / Purpose', gridStartX + 2, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const cleanReason = leave.reason || 'No specific reason entered.';
  const reasonLines = doc.splitTextToSize(cleanReason, gridWidth - 38);
  doc.text(reasonLines.slice(0, 3), gridStartX + 36.5, currentY + 4.8);

  // -------------------------------------------------------------
  // 6. STUDENT SIGNATURE & VERIFICATION STAGES
  // -------------------------------------------------------------
  currentY += reasonBoxH + 3;

  const boxW = (gridWidth - 3) / 2;
  const boxH1 = 20;

  // Box A: Student Signature
  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.2);
  doc.rect(gridStartX, currentY, boxW, boxH1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('STUDENT DECLARATION & SIGNATURE', gridStartX + 2, currentY + 4);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.text('I hereby confirm that the reason provided above is genuine.', gridStartX + 2, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text('Date: ____________________', gridStartX + 2, currentY + 16.5);
  doc.text('Signature of Student: ___________________', gridStartX + boxW - 2, currentY + 16.5, { align: 'right' });

  // Box B: Mentor Remarks & Signature
  const rightColX = gridStartX + boxW + 3;
  doc.rect(rightColX, currentY, boxW, boxH1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('REMARKS & SIGNATURE OF MENTOR', rightColX + 2, currentY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Remarks: __________________________________________________', rightColX + 2, currentY + 10);
  doc.text('Date: _______________', rightColX + 2, currentY + 16.5);
  doc.text('Mentor Signature: __________________', rightColX + boxW - 2, currentY + 16.5, { align: 'right' });

  // Row 2: Class Coordinator & SWO / Hostel Warden
  currentY += boxH1 + 2.5;
  const boxH2 = 18;

  // Box C: Class Coordinator
  doc.rect(gridStartX, currentY, boxW, boxH2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('CLASS COORDINATOR RECOMMENDATION', gridStartX + 2, currentY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Attendance %: ________   Recommended:  [   ] Yes   [   ] No', gridStartX + 2, currentY + 9.5);
  doc.text('Signature & Date: _____________________________________', gridStartX + 2, currentY + 15);

  // Box D: SWO / Hostel Warden
  doc.rect(rightColX, currentY, boxW, boxH2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('STUDENT WELFARE OFFICER (SWO) / WARDEN', rightColX + 2, currentY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('(Applicable for hostellers / event participants)', rightColX + 2, currentY + 8);
  doc.text('Remarks & Sign: ______________________________________', rightColX + 2, currentY + 15);

  // -------------------------------------------------------------
  // 7. HOD APPROVAL & ENDORSEMENT SECTION (WITH SAMPLE GRAPHICS)
  // -------------------------------------------------------------
  currentY += boxH2 + 3;
  const hodSectionH = 37;

  // Background panel for HOD endorsement
  doc.setFillColor(240, 253, 244); // Light Mint/Green (Approved)
  doc.rect(gridStartX, currentY, gridWidth, hodSectionH, 'F');
  doc.setDrawColor(34, 197, 94); // Emerald border
  doc.setLineWidth(0.4);
  doc.rect(gridStartX, currentY, gridWidth, hodSectionH, 'S');

  // Header banner inside HOD block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(21, 128, 61); // Green-700
  doc.text('DEPARTMENT HEAD (HOD) APPROVAL & ENDORSEMENT', gridStartX + 3, currentY + 5);

  doc.setFillColor(220, 252, 231);
  doc.roundedRect(gridStartX + gridWidth - 48, currentY + 1.5, 45, 5, 0.8, 0.8, 'F');
  doc.setFontSize(7);
  doc.setTextColor(22, 101, 52);
  doc.text('STATUS: APPROVED [OFFICIAL]', gridStartX + gridWidth - 25.5, currentY + 5, { align: 'center' });

  // Approval details text on left
  const hodTextStartY = currentY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Approving Authority:', gridStartX + 3, hodTextStartY);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Head of Department (${leave.reviewerName || leave.reviewedBy || 'HOD - CSE/Dept'})`,
    gridStartX + 33,
    hodTextStartY
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Approval Date:', gridStartX + 3, hodTextStartY + 5.5);
  doc.setFont('helvetica', 'normal');
  const approvalDateStr = leave.reviewedAt || leave.submittedAt || new Date().toLocaleDateString();
  doc.text(`${approvalDateStr}`, gridStartX + 33, hodTextStartY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.text('HOD Remarks:', gridStartX + 3, hodTextStartY + 11);
  doc.setFont('helvetica', 'italic');
  const cleanRemarks = leave.approvalRemarks || 'Leave request sanctioned and approved for academic records.';
  const remarkLines = doc.splitTextToSize(cleanRemarks, 78);
  doc.text(remarkLines.slice(0, 2), gridStartX + 33, hodTextStartY + 11);

  // Digital verification note
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Verified through AIET-UniSphere Academic Governance Portal.', gridStartX + 3, currentY + hodSectionH - 2.5);

  // --- FICTIONAL SAMPLE HOD SIGNATURE GRAPHIC ---
  const sigX = gridStartX + gridWidth - 85;
  const sigY = currentY + 10;

  // Box for sample signature
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(sigX, sigY, 38, 23);
  doc.setFillColor(255, 255, 255);
  doc.rect(sigX + 0.2, sigY + 0.2, 37.6, 22.6, 'F');

  doc.setFont('times', 'italic');
  doc.setFontSize(13);
  doc.setTextColor(30, 58, 138); // Blue pen ink
  doc.text('Dr. S. K. Rao, Ph.D.', sigX + 19, sigY + 8.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('Head of Department', sigX + 19, sigY + 12.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(220, 38, 38); // Red sample tag
  doc.text('[SAMPLE / DEMO SIGNATURE]', sigX + 19, sigY + 17, { align: 'center' });
  doc.text('Digitally Authorized', sigX + 19, sigY + 20.5, { align: 'center' });

  // --- FICTIONAL SAMPLE DEPARTMENT SEAL ---
  const sealCenterX = gridStartX + gridWidth - 23;
  const sealCenterY = currentY + 21.5;
  const sealRadius = 11.5;

  doc.setDrawColor(37, 99, 235); // Blue seal ink
  doc.setLineWidth(0.5);
  doc.circle(sealCenterX, sealCenterY, sealRadius);
  doc.setLineWidth(0.2);
  doc.circle(sealCenterX, sealCenterY, sealRadius - 1.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(30, 64, 175);
  doc.text("ALVA'S INST. OF ENGG & TECH", sealCenterX, sealCenterY - 6.5, { align: 'center' });
  doc.text('DEPARTMENT OF CSE', sealCenterX, sealCenterY - 3.5, { align: 'center' });

  doc.setFontSize(5.5);
  doc.setTextColor(220, 38, 38);
  doc.text('★ APPROVED ★', sealCenterX, sealCenterY, { align: 'center' });

  doc.setFontSize(4.5);
  doc.setTextColor(30, 64, 175);
  doc.text('MOODBIDRI - 574225', sealCenterX, sealCenterY + 3.8, { align: 'center' });

  doc.setFontSize(4.2);
  doc.setTextColor(220, 38, 38);
  doc.text('SAMPLE / DEMO SEAL', sealCenterX, sealCenterY + 7.2, { align: 'center' });

  // -------------------------------------------------------------
  // 8. HIGHER AUTHORITY (PRINCIPAL / ADMINISTRATIVE OFFICER)
  // -------------------------------------------------------------
  currentY += hodSectionH + 2.5;
  const principalH = 14;

  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.2);
  doc.rect(gridStartX, currentY, gridWidth, principalH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('REMARKS & SIGNATURE OF PRINCIPAL / ADMINISTRATIVE OFFICER (AO)', gridStartX + 2, currentY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Remarks: ____________________________________________________________________________________________', gridStartX + 2, currentY + 8.5);
  doc.text('Date: ________________', gridStartX + 2, currentY + 12.5);
  doc.text('Signature & Seal of Principal / AO: ________________________________', gridStartX + gridWidth - 2, currentY + 12.5, { align: 'right' });

  // -------------------------------------------------------------
  // 9. OFFICIAL NOTES & VTU REGULATIONS FOOTER
  // -------------------------------------------------------------
  currentY += principalH + 2;

  doc.setFillColor(248, 250, 252);
  doc.rect(gridStartX, currentY, gridWidth, 14, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(gridStartX, currentY, gridWidth, 14, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(30, 41, 59);
  doc.text('IMPORTANT INSTRUCTIONS & ATTENDANCE REGULATIONS:', gridStartX + 2, currentY + 3.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    '1. Leave / On-Duty application must be submitted prior to availing leave, except in sudden illness or unforeseen emergency.',
    gridStartX + 2,
    currentY + 6.8
  );
  doc.text(
    '2. For Medical Leave, an authorized Registered Medical Practitioner certificate must be attached in the portal.',
    gridStartX + 2,
    currentY + 9.8
  );
  doc.text(
    '3. Minimum 75% attendance in each course is mandatory as per VTU Belagavi regulations to qualify for semester examinations.',
    gridStartX + 2,
    currentY + 12.8
  );

  // Verification & page counter line at very bottom
  currentY += 16;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  const nowStr = new Date().toLocaleString();
  doc.text(
    `AIET-UniSphere Document Id: ${leave.id || 'N/A'} | Generated on: ${nowStr} | Single Page Official Record`,
    marginX + 4,
    currentY
  );
  doc.text('Page 1 of 1', marginX + contentWidth - 4, currentY, { align: 'right' });

  // Ensure single page constraint
  const totalPages = doc.getNumberOfPages();
  if (totalPages > 1) {
    console.warn(`[leaveNotePdfService] Document exceeded 1 page (actual: ${totalPages}). Content should fit within A4 single page.`);
  }

  return doc;
};

/**
 * Generates and triggers browser download for the approved leave note PDF.
 */
export const downloadApprovedLeaveNote = (leave: LeaveRequest, filename?: string): void => {
  const doc = generateLeaveNotePdf(leave);
  const safeRef = (leave.id || 'Leave_Note').replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetName = filename || `AIET_Leave_Note_${safeRef}_Approved.pdf`;
  doc.save(targetName);
};
