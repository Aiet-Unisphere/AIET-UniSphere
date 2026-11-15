/**
 * AIET-UniSphere — Attendance Report Export Service
 * Generates official institutional subject-wise attendance reports in:
 * 1. PDF (using jspdf with standard styling)
 * 2. Excel (.xlsx using fflate openxml zip packaging)
 * 3. CSV (RFC 4180 compliant formatted text)
 */
import { jsPDF } from 'jspdf';
import * as fflate from 'fflate';
import { supabase } from '../lib/supabase';

export interface AttendanceReportFilter {
  courseCode: string;
  courseName?: string;
  facultyName?: string;
  departmentName?: string;
  section?: string | null;
  semester?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface StudentAttendanceReportRow {
  usn: string;
  name: string;
  totalClasses: number;
  present: number;
  absent: number;
  late: number;
  attendancePercent: number; // Late counts as attended in accordance with institutional policy
}

export interface SessionAttendanceReportRow {
  date: string;
  timeSlot: string;
  courseCode: string;
  section?: string | null;
  semester?: number | null;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  totalStudents: number;
  attendanceRate: number;
}

export interface FullAttendanceReportData {
  institutionName: string;
  departmentName: string;
  courseCode: string;
  courseName: string;
  facultyName: string;
  section: string;
  semester: string;
  dateRange: string;
  generatedDate: string;
  totalClassesConducted: number;
  overallPresent: number;
  overallAbsent: number;
  overallLate: number;
  overallPercentage: number;
  studentRows: StudentAttendanceReportRow[];
  sessionRows: SessionAttendanceReportRow[];
}

/**
 * Compiles real saved attendance data from Supabase for the specified report filters.
 */
export const compileAttendanceReportData = async (
  filter: AttendanceReportFilter
): Promise<FullAttendanceReportData> => {
  const { data: { user } } = await (supabase as any).auth.getUser();
  
  // 1. Resolve Profile and Department
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name, department:departments(name)')
    .eq('id', user?.id || '')
    .maybeSingle();

  const facultyName = filter.facultyName || profile?.full_name || 'Faculty Instructor';
  const departmentName = filter.departmentName || profile?.department?.name || 'Computer Science & Engineering';

  // 2. Query matching attendance sessions
  const cleanCourse = filter.courseCode.trim();
  const normCourse = cleanCourse.replace(/[^A-Za-z0-9]/g, '');

  let sessionQuery = (supabase as any)
    .from('attendance_sessions')
    .select('*')
    .or(`course_id.ilike.%${cleanCourse}%,course_id.ilike.%${normCourse}%,course_name.ilike.%${cleanCourse}%`)
    .order('session_date', { ascending: true });

  if (filter.section && filter.section.trim()) {
    sessionQuery = sessionQuery.eq('section', filter.section.trim());
  }
  if (filter.semester != null) {
    sessionQuery = sessionQuery.eq('semester', filter.semester);
  }
  if (filter.fromDate) {
    sessionQuery = sessionQuery.gte('session_date', filter.fromDate);
  }
  if (filter.toDate) {
    sessionQuery = sessionQuery.lte('session_date', filter.toDate);
  }

  const { data: sessions, error: sessErr } = await sessionQuery;
  if (sessErr) {
    console.warn('[compileAttendanceReportData] Session query error:', sessErr);
  }

  const sessionList = sessions || [];
  if (sessionList.length === 0) {
    throw new Error(`No saved attendance sessions found for course ${filter.courseCode}. Record and save an attendance session first.`);
  }

  const sessionIds = sessionList.map((s: any) => s.id);

  // 3. Query all attendance records for these sessions
  let records: any[] = [];
  if (sessionIds.length > 0) {
    const { data: recData, error: recErr } = await (supabase as any)
      .from('attendance_records')
      .select('session_id, student_id, status, remarks')
      .in('session_id', sessionIds);
    if (!recErr && recData) {
      records = recData;
    }
  }

  // 4. Resolve Student Profiles (Name, USN) for all student_ids present in records
  const studentIds = Array.from(new Set(records.map((r: any) => r.student_id).filter(Boolean)));
  const profileMap = new Map<string, { name: string; usn: string }>();

  if (studentIds.length > 0) {
    const { data: profs, error: profErr } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, usn_or_employee_id')
      .in('id', studentIds);

    if (!profErr && profs) {
      profs.forEach((p: any) => {
        profileMap.set(p.id, {
          name: p.full_name || 'Student',
          usn: (p.usn_or_employee_id || 'N/A').toUpperCase()
        });
      });
    }
  }

  // 5. Aggregate student totals
  const studentMap = new Map<string, {
    usn: string;
    name: string;
    total: number;
    present: number;
    absent: number;
    late: number;
  }>();

  records.forEach((r: any) => {
    const studentInfo = profileMap.get(r.student_id) || {
      name: 'Student',
      usn: 'N/A'
    };

    const key = r.student_id || studentInfo.usn;
    const current = studentMap.get(key) || {
      usn: studentInfo.usn,
      name: studentInfo.name,
      total: 0,
      present: 0,
      absent: 0,
      late: 0
    };

    current.total += 1;
    const st = (r.status || 'Present').toUpperCase();
    if (st === 'PRESENT') {
      current.present += 1;
    } else if (st === 'ABSENT') {
      current.absent += 1;
    } else if (st === 'LATE') {
      current.late += 1;
    }

    studentMap.set(key, current);
  });

  const studentRows: StudentAttendanceReportRow[] = Array.from(studentMap.values()).map(s => {
    // Institutional policy: Late is counted as attended class attendance
    const attended = s.present + s.late;
    const pct = s.total > 0 ? Math.round((attended / s.total) * 1000) / 10 : 0;
    return {
      usn: s.usn,
      name: s.name,
      totalClasses: s.total,
      present: s.present,
      absent: s.absent,
      late: s.late,
      attendancePercent: pct
    };
  }).sort((a, b) => a.usn.localeCompare(b.usn));

  // 6. Aggregate session totals
  let overallPresent = 0;
  let overallAbsent = 0;
  let overallLate = 0;
  let overallRecords = 0;

  const sessionRows: SessionAttendanceReportRow[] = sessionList.map((s: any) => {
    const p = Number(s.present_count || 0);
    const a = Number(s.absent_count || 0);
    const l = Number(s.late_count || 0);
    const total = Number(s.total_students || (p + a + l));

    overallPresent += p;
    overallAbsent += a;
    overallLate += l;
    overallRecords += total;

    const rate = total > 0 ? Math.round(((p + l) / total) * 1000) / 10 : 0;

    return {
      date: s.session_date,
      timeSlot: `${s.start_time || ''}${s.end_time ? ' - ' + s.end_time : ''}`,
      courseCode: s.course_id || filter.courseCode,
      section: s.section,
      semester: s.semester,
      presentCount: p,
      absentCount: a,
      lateCount: l,
      totalStudents: total,
      attendanceRate: rate
    };
  });

  const overallAttended = overallPresent + overallLate;
  const overallPercentage = overallRecords > 0 ? Math.round((overallAttended / overallRecords) * 1000) / 10 : 0;

  return {
    institutionName: "Alva's Institute of Engineering & Technology",
    departmentName,
    courseCode: filter.courseCode,
    courseName: filter.courseName || (sessionList[0]?.course_name) || filter.courseCode,
    facultyName,
    section: filter.section || (sessionList[0]?.section) || 'All Sections',
    semester: filter.semester ? `Semester ${filter.semester}` : (sessionList[0]?.semester ? `Semester ${sessionList[0].semester}` : 'All Semesters'),
    dateRange: `${filter.fromDate || 'Earliest'} to ${filter.toDate || 'Latest'}`,
    generatedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    totalClassesConducted: sessionList.length,
    overallPresent,
    overallAbsent,
    overallLate,
    overallPercentage,
    studentRows,
    sessionRows
  };
};

/**
 * Downloads a binary blob directly to user's browser with safety checks.
 * Ensures the temporary anchor is appended to the document body, triggered,
 * removed, and the object URL is revoked only after a safe delay (never synchronously).
 */
export const triggerBrowserDownload = (content: BlobPart, filename: string, mimeType: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Browser download requires a browser environment.');
  }

  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  if (blob.size === 0) {
    throw new Error('Cannot download empty report file.');
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  a.setAttribute('download', filename);

  document.body.appendChild(a);
  a.click();

  // Safely remove anchor and defer object URL revocation to prevent cancelling downloads in Chrome/Firefox/Safari
  setTimeout(() => {
    try {
      if (a.parentNode) {
        a.parentNode.removeChild(a);
      }
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Deferred download cleanup exception:', e);
    }
  }, 30000); // 30-second window gives all browsers ample time to stream/hand off the download
};

/**
 * Exports CSV format (RFC 4180).
 */
export const downloadAttendanceCSV = (data: FullAttendanceReportData) => {
  const csvLines: string[] = [];
  
  // Header
  csvLines.push(`"${data.institutionName}"`);
  csvLines.push(`"Department: ${data.departmentName}"`);
  csvLines.push(`"Subject: ${data.courseName} (${data.courseCode})"`);
  csvLines.push(`"Faculty: ${data.facultyName}"`);
  csvLines.push(`"Section: ${data.section} | Semester: ${data.semester}"`);
  csvLines.push(`"Date Range: ${data.dateRange} | Generated: ${data.generatedDate}"`);
  csvLines.push(`"Total Sessions: ${data.totalClassesConducted} | Overall Attendance: ${data.overallPercentage}%"`);
  csvLines.push('');

  // Student Section
  csvLines.push('"--- STUDENT ATTENDANCE SUMMARY ---"');
  csvLines.push('"USN","Student Name","Total Classes","Present","Absent","Late","Attendance %"');
  data.studentRows.forEach(s => {
    csvLines.push(`"${s.usn}","${s.name}",${s.totalClasses},${s.present},${s.absent},${s.late},${s.attendancePercent}%`);
  });
  csvLines.push('');

  // Session Section
  csvLines.push('"--- SESSION-WISE LOGS ---"');
  csvLines.push('"Date","Time Slot","Course Code","Section","Present","Absent","Late","Total","Attendance Rate %"');
  data.sessionRows.forEach(s => {
    csvLines.push(`"${s.date}","${s.timeSlot}","${s.courseCode}","${s.section || 'All'}",${s.presentCount},${s.absentCount},${s.lateCount},${s.totalStudents},${s.attendanceRate}%`);
  });

  const fullCsv = csvLines.join('\r\n');
  const cleanDate = new Date().toISOString().slice(0, 10);
  const filename = `Attendance_${data.courseCode}_${cleanDate}.csv`;
  triggerBrowserDownload(fullCsv, filename, 'text/csv;charset=utf-8;');
};

/**
 * Exports XLSX format using pure JS ZIP packaging with fflate.
 */
export const downloadAttendanceXLSX = (data: FullAttendanceReportData) => {
  const escapeXml = (str: any) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const rows: (string | number)[][] = [
    [data.institutionName],
    [`Department: ${data.departmentName}`],
    [`Subject: ${data.courseName} (${data.courseCode})`],
    [`Faculty: ${data.facultyName}`],
    [`Section: ${data.section} | Semester: ${data.semester}`],
    [`Date Range: ${data.dateRange} | Generated: ${data.generatedDate}`],
    [`Total Sessions: ${data.totalClassesConducted} | Overall Attendance: ${data.overallPercentage}%`],
    [],
    ['STUDENT-LEVEL ATTENDANCE REPORT'],
    ['USN', 'Student Name', 'Total Classes', 'Present', 'Absent', 'Late', 'Attendance %']
  ];

  data.studentRows.forEach(s => {
    rows.push([s.usn, s.name, s.totalClasses, s.present, s.absent, s.late, `${s.attendancePercent}%`]);
  });

  rows.push([]);
  rows.push(['SESSION-WISE ATTENDANCE LOGS']);
  rows.push(['Date', 'Time Slot', 'Course Code', 'Section', 'Present', 'Absent', 'Late', 'Total', 'Attendance Rate %']);

  data.sessionRows.forEach(s => {
    rows.push([s.date, s.timeSlot, s.courseCode, s.section || 'All', s.presentCount, s.absentCount, s.lateCount, s.totalStudents, `${s.attendanceRate}%`]);
  });

  let rowXml = '';
  rows.forEach((r, rIdx) => {
    rowXml += `<row r="${rIdx + 1}">`;
    r.forEach((c, cIdx) => {
      const colLetter = String.fromCharCode(65 + (cIdx % 26));
      const cellRef = `${colLetter}${rIdx + 1}`;
      if (typeof c === 'number') {
        rowXml += `<c r="${cellRef}" t="n"><v>${c}</v></c>`;
      } else {
        rowXml += `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(c)}</t></is></c>`;
      }
    });
    rowXml += '</row>';
  });

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${rowXml}</sheetData>
</worksheet>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Attendance" sheetId="1" r:id="rId1"/>
</sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const files = {
    '[Content_Types].xml': fflate.strToU8(contentTypes),
    '_rels/.rels': fflate.strToU8(rels),
    'xl/workbook.xml': fflate.strToU8(workbook),
    'xl/_rels/workbook.xml.rels': fflate.strToU8(wbRels),
    'xl/worksheets/sheet1.xml': fflate.strToU8(sheetXml)
  };

  const zipped = fflate.zipSync(files);
  const cleanDate = new Date().toISOString().slice(0, 10);
  const filename = `Attendance_${data.courseCode}_${cleanDate}.xlsx`;
  triggerBrowserDownload(
    zipped,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
};

/**
 * Exports official institutional PDF format using jsPDF.
 */
export const downloadAttendancePDF = (data: FullAttendanceReportData) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 36;

  // Header Box
  doc.setFillColor(11, 83, 160); // AIET Brand Blue
  doc.rect(0, 0, pageWidth, 55, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(data.institutionName.toUpperCase(), pageWidth / 2, 24, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`DEPARTMENT OF ${data.departmentName.toUpperCase()}`, pageWidth / 2, 42, { align: 'center' });

  y = 75;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Official Course Attendance Report`, 36, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${data.generatedDate}`, pageWidth - 36, y, { align: 'right' });

  // Metadata Grid
  y += 18;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(36, y, pageWidth - 72, 54, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Subject: ${data.courseName} (${data.courseCode})`, 46, y + 16);
  doc.text(`Faculty: ${data.facultyName}`, 46, y + 32);
  doc.text(`Total Sessions: ${data.totalClassesConducted} classes`, 46, y + 46);

  doc.text(`Section / Sem: ${data.section} • ${data.semester}`, pageWidth / 2 + 20, y + 16);
  doc.text(`Date Range: ${data.dateRange}`, pageWidth / 2 + 20, y + 32);
  doc.text(`Overall Attendance: ${data.overallPercentage}% (P: ${data.overallPresent}, L: ${data.overallLate}, A: ${data.overallAbsent})`, pageWidth / 2 + 20, y + 46);

  // Student Table Header
  y += 72;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(11, 83, 160);
  doc.text(`Student-Level Attendance Summary (${data.studentRows.length} Students)`, 36, y);

  y += 10;
  const colX = {
    usn: 36,
    name: 120,
    classes: 280,
    present: 340,
    absent: 390,
    late: 440,
    pct: 490
  };

  doc.setFillColor(241, 245, 249);
  doc.rect(36, y, pageWidth - 72, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('USN', colX.usn + 6, y + 12);
  doc.text('STUDENT NAME', colX.name, y + 12);
  doc.text('TOTAL', colX.classes, y + 12);
  doc.text('PRESENT', colX.present, y + 12);
  doc.text('ABSENT', colX.absent, y + 12);
  doc.text('LATE', colX.late, y + 12);
  doc.text('ATTENDANCE %', colX.pct, y + 12);

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const pageHeight = doc.internal.pageSize.getHeight();

  data.studentRows.forEach((s, idx) => {
    if (y > pageHeight - 45) {
      doc.addPage();
      y = 36;
      // Repeat Header on new page
      doc.setFillColor(241, 245, 249);
      doc.rect(36, y, pageWidth - 72, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text('USN', colX.usn + 6, y + 12);
      doc.text('STUDENT NAME', colX.name, y + 12);
      doc.text('TOTAL', colX.classes, y + 12);
      doc.text('PRESENT', colX.present, y + 12);
      doc.text('ABSENT', colX.absent, y + 12);
      doc.text('LATE', colX.late, y + 12);
      doc.text('ATTENDANCE %', colX.pct, y + 12);
      y += 18;
      doc.setFont('helvetica', 'normal');
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(36, y, pageWidth - 72, 16, 'F');
    }

    doc.setTextColor(15, 23, 42);
    doc.text(s.usn, colX.usn + 6, y + 11);
    doc.text(s.name.slice(0, 26), colX.name, y + 11);
    doc.text(String(s.totalClasses), colX.classes + 8, y + 11);
    doc.text(String(s.present), colX.present + 10, y + 11);
    doc.text(String(s.absent), colX.absent + 8, y + 11);
    doc.text(String(s.late), colX.late + 6, y + 11);

    // Color code percentage: Green >= 75%, Red < 75%
    if (s.attendancePercent >= 75) {
      doc.setTextColor(4, 120, 87);
    } else {
      doc.setTextColor(220, 38, 38);
    }
    doc.text(`${s.attendancePercent}%`, colX.pct + 12, y + 11);

    y += 16;
  });

  // Footer note on last page
  y += 16;
  if (y > pageHeight - 35) {
    doc.addPage();
    y = 36;
  }
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('* Late class arrivals are recorded as attended in accordance with institutional academic regulation.', 36, y);

  const cleanSec = data.section ? data.section.replace(/\s+/g, '') : 'AllSec';
  const cleanDate = new Date().toISOString().slice(0, 10);
  const filename = `Attendance_${data.courseCode}_${cleanDate}.pdf`;
  
  // Use universal Blob download workflow for browser compatibility
  const pdfBlob = doc.output('blob');
  triggerBrowserDownload(pdfBlob, filename, 'application/pdf');
};

