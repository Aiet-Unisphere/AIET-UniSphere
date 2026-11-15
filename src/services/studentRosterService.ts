import { supabase } from '../lib/supabase';
import type { DepartmentStudent } from './attendanceService';

export interface AcademicEligibilityParams {
  courseCode: string;
  courseName?: string;
  semester?: number | null;
  section?: string | null;
  departmentId?: string | null; // Subject-owning department ID if known
}

export interface ResolvedSubjectCohort {
  courseCode: string;
  courseName: string;
  departmentId?: string;
  departmentName?: string;
  departmentCode?: string;
  semester?: number;
  section?: string;
  enrollmentCount: number;
  isCourseLevelEnrolled: boolean;
  students: DepartmentStudent[];
}

/**
 * Resolves the subject's owning department, target semester, and section
 * from authoritative institutional allocations (course_enrollments or timetable_entries),
 * independent of which department the faculty member belongs to.
 */
export const resolveSubjectOwnershipAndCohort = async (
  courseInput: string,
  hintSection?: string | null,
  hintSemester?: number | null
): Promise<{
  cleanCode: string;
  departmentId?: string;
  departmentName?: string;
  departmentCode?: string;
  semester?: number;
  section?: string;
}> => {
  const rawTrimmed = (courseInput || '').trim();
  const parenMatch = rawTrimmed.match(/\(([^)]+)\)/);
  const cleanCode = (parenMatch ? parenMatch[1].trim() : (rawTrimmed.split(' ')[0] || rawTrimmed)).trim();
  const normCode = cleanCode.replace(/[^a-zA-Z0-9]/g, '');

  let departmentId: string | undefined;
  let departmentName: string | undefined;
  let departmentCode: string | undefined;
  let semester: number | undefined = hintSemester != null ? Number(hintSemester) : undefined;
  let section: string | undefined = (hintSection && hintSection.trim() !== '') ? hintSection.trim() : undefined;

  try {
    // 1. Check course_enrollments for the subject's owning department & cohort details
    const { data: ceRows } = await (supabase as any)
      .from('course_enrollments')
      .select(`
        department_id,
        semester,
        section,
        department:departments(id, name, code)
      `)
      .or(`course_id.ilike.${cleanCode},course_code.ilike.${cleanCode},course_id.ilike.%${normCode}%,course_code.ilike.%${normCode}%`)
      .limit(1);

    if (ceRows && ceRows.length > 0) {
      const row = ceRows[0];
      departmentId = row.department_id || undefined;
      if (row.department) {
        departmentName = row.department.name;
        departmentCode = row.department.code;
      }
      if (semester == null && row.semester != null) semester = Number(row.semester);
      if (!section && row.section) section = row.section;
    }

    // 2. If departmentId is still unknown, check timetable_entries
    if (!departmentId) {
      const { data: ttRows } = await (supabase as any)
        .from('timetable_entries')
        .select(`
          department_id,
          semester,
          section,
          department:departments(id, name, code)
        `)
        .or(`course_id.ilike.${cleanCode},course_code.ilike.${cleanCode},course_id.ilike.%${normCode}%,course_code.ilike.%${normCode}%`)
        .limit(1);

      if (ttRows && ttRows.length > 0) {
        const row = ttRows[0];
        departmentId = row.department_id || undefined;
        if (row.department) {
          departmentName = row.department.name;
          departmentCode = row.department.code;
        }
        if (semester == null && row.semester != null) semester = Number(row.semester);
        if (!section && row.section) section = row.section;
      }
    }

    // 3. If departmentId is still unknown and cleanCode is a UUID, check assignments table
    if (!departmentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode)) {
      const { data: assgRows } = await (supabase as any)
        .from('assignments')
        .select('course_id, department_id, department:departments(id, name, code)')
        .or(`id.eq.${cleanCode},course_id.eq.${cleanCode}`)
        .limit(1);

      if (assgRows && assgRows.length > 0) {
        const row = assgRows[0];
        if (row.department_id) departmentId = row.department_id;
        if (row.department) {
          departmentName = row.department.name;
          departmentCode = row.department.code;
        }
      }
    }

    // 4. Resolve department name/code if departmentId is known but metadata wasn't joined
    if (departmentId && (!departmentName || !departmentCode)) {
      const { data: dRow } = await (supabase as any)
        .from('departments')
        .select('name, code')
        .eq('id', departmentId)
        .maybeSingle();
      if (dRow) {
        departmentName = dRow.name;
        departmentCode = dRow.code;
      }
    }
  } catch (err: any) {
    console.warn('[studentRosterService] resolveSubjectOwnership error:', err?.message);
  }

  return {
    cleanCode,
    departmentId,
    departmentName,
    departmentCode,
    semester,
    section
  };
};

/**
 * Authoritative Student Roster Resolver
 *
 * Enforces:
 * 1. Subject-owning department (ECE, CSE, etc.) determines student cohort, NOT faculty department.
 * 2. Active student account status (or null legacy active). Inactive/locked students are excluded.
 * 3. Consistent matching across course_enrollments and academic cohort (department/semester/section).
 * 4. Automatic support for future registered students.
 * 5. Canonical deduplication and USN conflict detection.
 */
export const getEligibleStudentRoster = async (
  params: AcademicEligibilityParams
): Promise<DepartmentStudent[]> => {
  const { courseCode, semester, section, departmentId } = params;
  if (!courseCode || courseCode.trim() === '') return [];

  const rawTrimmed = courseCode.trim();
  const parenMatch = rawTrimmed.match(/\(([^)]+)\)/);
  const cleanCode = (parenMatch ? parenMatch[1].trim() : (rawTrimmed.split(' ')[0] || rawTrimmed)).trim();
  const normCode = cleanCode.replace(/[^a-zA-Z0-9]/g, '');

  // 1. Resolve authoritative subject owning department if not passed in
  let targetDeptId = departmentId;
  let targetSemester = semester;
  let targetSection = section;

  if (!targetDeptId) {
    const meta = await resolveSubjectOwnershipAndCohort(cleanCode, section, semester);
    targetDeptId = meta.departmentId;
    if (targetSemester == null && meta.semester != null) targetSemester = meta.semester;
    if (!targetSection && meta.section) targetSection = meta.section;
  }

  let enrolledStudentIds: string[] = [];

  try {
    // 2. Authoritative check: course-level enrollments in public.course_enrollments
    let ceQuery = (supabase as any)
      .from('course_enrollments')
      .select('student_id, department_id, semester, section')
      .or(`course_id.ilike.${cleanCode},course_code.ilike.${cleanCode},course_id.ilike.%${normCode}%,course_code.ilike.%${normCode}%`)
      .in('status', ['Active', 'ACTIVE']);

    if (targetSection && targetSection.trim() !== '') {
      ceQuery = ceQuery.eq('section', targetSection.trim());
    }
    if (targetSemester != null) {
      ceQuery = ceQuery.eq('semester', targetSemester);
    }
    if (targetDeptId) {
      ceQuery = ceQuery.eq('department_id', targetDeptId);
    }

    const { data: ceRows, error: ceErr } = await ceQuery;
    if (!ceErr && ceRows && ceRows.length > 0) {
      enrolledStudentIds = Array.from(new Set(ceRows.map((r: any) => r.student_id).filter(Boolean)));
      if (!targetDeptId && ceRows[0].department_id) {
        targetDeptId = ceRows[0].department_id;
      }
    } else if (targetSection && targetSection.trim() !== '') {
      // Relax section filter if section yielded 0 (e.g. course enrollments recorded without section)
      let relaxQuery = (supabase as any)
        .from('course_enrollments')
        .select('student_id, department_id')
        .or(`course_id.ilike.${cleanCode},course_code.ilike.${cleanCode},course_id.ilike.%${normCode}%,course_code.ilike.%${normCode}%`)
        .in('status', ['Active', 'ACTIVE']);
      if (targetSemester != null) {
        relaxQuery = relaxQuery.eq('semester', targetSemester);
      }
      if (targetDeptId) {
        relaxQuery = relaxQuery.eq('department_id', targetDeptId);
      }
      const { data: relaxRows } = await relaxQuery;
      if (relaxRows && relaxRows.length > 0) {
        enrolledStudentIds = Array.from(new Set(relaxRows.map((r: any) => r.student_id).filter(Boolean)));
        if (!targetDeptId && relaxRows[0].department_id) {
          targetDeptId = relaxRows[0].department_id;
        }
      }
    }

    // 3. Secondary resolution: If course_enrollments has no rows, check student cohort by Subject-Owning Department + Semester
    if (enrolledStudentIds.length === 0 && targetDeptId && targetSemester != null) {
      let spQuery = (supabase as any)
        .from('student_profiles')
        .select('profile_id')
        .eq('semester', targetSemester);

      const { data: spRows } = await spQuery;
      if (spRows && spRows.length > 0) {
        const candidateIds = spRows.map((r: any) => r.profile_id).filter(Boolean);
        if (candidateIds.length > 0) {
          // Verify candidate students belong to the subject-owning department
          const { data: deptMatches } = await (supabase as any)
            .from('profiles')
            .select('id')
            .in('id', candidateIds)
            .eq('department_id', targetDeptId)
            .eq('role', 'STUDENT')
            .in('account_status', ['ACTIVE', 'active']);
          if (deptMatches && deptMatches.length > 0) {
            enrolledStudentIds = deptMatches.map((m: any) => m.id);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[studentRosterService] Enrollment query error:', err?.message);
  }

  // 4. Fetch the verified student profiles
  let students: any[] = [];
  if (enrolledStudentIds.length > 0) {
    let profQuery = (supabase as any)
      .from('profiles')
      .select('id, full_name, usn_or_employee_id, department_id, account_status')
      .in('id', enrolledStudentIds)
      .eq('role', 'STUDENT')
      .or('account_status.eq.ACTIVE,account_status.eq.active,account_status.is.null');

    // Strict safety: If target department is known, ensure student belongs to target department
    if (targetDeptId) {
      profQuery = profQuery.eq('department_id', targetDeptId);
    }

    const { data: profData, error: profErr } = await profQuery.order('full_name', { ascending: true });
    if (!profErr && profData) {
      students = profData;
    }
  } else {
    // Zero eligible enrolled students found for this subject cohort
    return [];
  }

  if (students.length === 0) return [];

  // 5. Canonical deduplication and USN conflict detection
  const seenIds = new Set<string>();
  const uniqueStudents: any[] = [];
  for (const s of students) {
    if (!s || !s.id || seenIds.has(s.id)) continue;
    seenIds.add(s.id);
    uniqueStudents.push(s);
  }

  const usnToIds = new Map<string, Set<string>>();
  for (const s of uniqueStudents) {
    const rawUsn = s.usn_or_employee_id || '';
    const normUsn = rawUsn.trim().toUpperCase();
    if (normUsn && normUsn !== 'N/A' && normUsn !== 'NOT RECORDED') {
      const set = usnToIds.get(normUsn) || new Set<string>();
      set.add(s.id);
      usnToIds.set(normUsn, set);
    }
  }

  const processedStudents: DepartmentStudent[] = uniqueStudents.map((s) => {
    const rawUsn = s.usn_or_employee_id || '';
    const normUsn = rawUsn.trim().toUpperCase();
    const sharingIds = (normUsn && normUsn !== 'N/A' && normUsn !== 'NOT RECORDED')
      ? usnToIds.get(normUsn)
      : undefined;

    const isConflict = Boolean(sharingIds && sharingIds.size > 1);
    const resolvedName = s.full_name || s.name || 'Student';
    const resolvedUsn = normUsn || s.usn || s.usn_or_employee_id || 'N/A';
    return {
      id: s.id,
      name: resolvedName,
      usn: resolvedUsn,
      full_name: resolvedName,
      usn_or_employee_id: resolvedUsn,
      departmentId: s.department_id || targetDeptId,
      department_id: s.department_id || targetDeptId,
      semester: targetSemester ?? null,
      section: targetSection ?? null,
      isUsnConflict: isConflict,
      conflictDetails: isConflict
        ? `Identity conflict: Normalized USN "${normUsn}" is shared by ${sharingIds!.size} distinct student accounts.`
        : undefined
    };
  });

  return processedStudents;
};
