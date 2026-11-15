import { supabase } from '../lib/supabase';
import { getEligibleStudentRoster, resolveSubjectOwnershipAndCohort } from './studentRosterService';

export interface InstitutionStudentMetrics {
  totalRegistered: number;
  totalActive: number;
  totalInactive: number;
  totalIncomplete: number;
  byDepartment: { departmentId: string; departmentCode: string; departmentName: string; total: number; active: number }[];
  bySemester: { semester: number; count: number }[];
  bySection: { section: string; count: number }[];
}

export interface DepartmentStudentMetrics {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  incompleteStudents: number;
  bySemester: { semester: number; count: number }[];
  bySection: { section: string; count: number }[];
}

export interface FacultyStudentMetrics {
  facultyId: string;
  uniqueStudentsCount: number;
  allocatedCoursesCount: number;
  uniqueStudentIds?: string[];
  courseMetrics: {
    courseId: string;
    courseCode: string;
    courseName: string;
    semester?: number;
    section?: string;
    studentCount: number;
  }[];
}

export type CourseCountInput =
  | string
  | {
      courseCode?: string;
      courseId?: string;
      section?: string | null;
      semester?: number | null;
      departmentId?: string | null;
    };

/**
 * 1. Institution-Wide Student Metrics (Authoritative for Admin & Institution Governance)
 * Queries canonical public.profiles (role = 'STUDENT') and public.student_profiles.
 */
export const getInstitutionStudentMetrics = async (): Promise<InstitutionStudentMetrics> => {
  try {
    const [profilesRes, studentProfilesRes, deptsRes] = await Promise.all([
      (supabase as any)
        .from('profiles')
        .select('id, full_name, usn_or_employee_id, role, department_id, account_status')
        .eq('role', 'STUDENT'),
      (supabase as any)
        .from('student_profiles')
        .select('profile_id, semester, section'),
      (supabase as any)
        .from('departments')
        .select('id, code, name')
        .order('name', { ascending: true })
    ]);

    const profiles = profilesRes.data || [];
    const studentProfiles = studentProfilesRes.data || [];
    const depts = deptsRes.data || [];

    const spMap = new Map<string, { semester?: number | null; section?: string | null }>(
      studentProfiles.map((sp: any) => [sp.profile_id, sp])
    );

    let totalRegistered = 0;
    let totalActive = 0;
    let totalInactive = 0;
    let totalIncomplete = 0;

    const deptMap = new Map<string, { total: number; active: number }>();
    const semMap = new Map<number, number>();
    const secMap = new Map<string, number>();

    for (const p of profiles) {
      totalRegistered++;
      const isActive = !p.account_status || p.account_status.toUpperCase() === 'ACTIVE';
      if (isActive) {
        totalActive++;
      } else {
        totalInactive++;
      }

      const sp = spMap.get(p.id);
      const isMissingDept = !p.department_id;
      const isMissingSem = sp?.semester == null;
      if (isMissingDept || isMissingSem) {
        totalIncomplete++;
      }

      if (p.department_id) {
        const d = deptMap.get(p.department_id) || { total: 0, active: 0 };
        d.total++;
        if (isActive) d.active++;
        deptMap.set(p.department_id, d);
      }

      if (sp?.semester != null) {
        semMap.set(Number(sp.semester), (semMap.get(Number(sp.semester)) || 0) + 1);
      }

      if (sp?.section) {
        secMap.set(sp.section.trim().toUpperCase(), (secMap.get(sp.section.trim().toUpperCase()) || 0) + 1);
      }
    }

    const byDepartment = depts.map((d: any) => ({
      departmentId: d.id,
      departmentCode: d.code,
      departmentName: d.name,
      total: deptMap.get(d.id)?.total || 0,
      active: deptMap.get(d.id)?.active || 0
    }));

    const bySemester = Array.from(semMap.entries())
      .map(([semester, count]) => ({ semester, count }))
      .sort((a, b) => a.semester - b.semester);

    const bySection = Array.from(secMap.entries())
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => a.section.localeCompare(b.section));

    return {
      totalRegistered,
      totalActive,
      totalInactive,
      totalIncomplete,
      byDepartment,
      bySemester,
      bySection
    };
  } catch (err: any) {
    console.error('[studentStatisticsService] getInstitutionStudentMetrics error:', err?.message);
    return {
      totalRegistered: 0,
      totalActive: 0,
      totalInactive: 0,
      totalIncomplete: 0,
      byDepartment: [],
      bySemester: [],
      bySection: []
    };
  }
};

/**
 * 2. Department-Specific Student Metrics (Authoritative for HOD Dashboard & Department Reports)
 */
export const getDepartmentStudentMetrics = async (
  departmentId: string
): Promise<DepartmentStudentMetrics> => {
  try {
    const [deptRes, profilesRes, studentProfilesRes] = await Promise.all([
      (supabase as any).from('departments').select('id, code, name').eq('id', departmentId).maybeSingle(),
      (supabase as any).from('profiles').select('id, account_status').eq('department_id', departmentId).eq('role', 'STUDENT'),
      (supabase as any).from('student_profiles').select('profile_id, semester, section')
    ]);

    const dept = deptRes.data || { id: departmentId, code: 'N/A', name: 'Department' };
    const profiles = profilesRes.data || [];
    const studentProfiles = studentProfilesRes.data || [];

    const spMap = new Map<string, { semester?: number | null; section?: string | null }>(
      studentProfiles.map((sp: any) => [sp.profile_id, sp])
    );

    let totalStudents = 0;
    let activeStudents = 0;
    let inactiveStudents = 0;
    let incompleteStudents = 0;

    const semMap = new Map<number, number>();
    const secMap = new Map<string, number>();

    for (const p of profiles) {
      totalStudents++;
      const isActive = !p.account_status || p.account_status.toUpperCase() === 'ACTIVE';
      if (isActive) {
        activeStudents++;
      } else {
        inactiveStudents++;
      }

      const sp = spMap.get(p.id);
      if (sp?.semester == null) {
        incompleteStudents++;
      } else {
        semMap.set(Number(sp.semester), (semMap.get(Number(sp.semester)) || 0) + 1);
      }

      if (sp?.section) {
        secMap.set(sp.section.trim().toUpperCase(), (secMap.get(sp.section.trim().toUpperCase()) || 0) + 1);
      }
    }

    const bySemester = Array.from(semMap.entries())
      .map(([semester, count]) => ({ semester, count }))
      .sort((a, b) => a.semester - b.semester);

    const bySection = Array.from(secMap.entries())
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => a.section.localeCompare(b.section));

    return {
      departmentId,
      departmentCode: dept.code,
      departmentName: dept.name,
      totalStudents,
      activeStudents,
      inactiveStudents,
      incompleteStudents,
      bySemester,
      bySection
    };
  } catch (err: any) {
    console.error('[studentStatisticsService] getDepartmentStudentMetrics error:', err?.message);
    return {
      departmentId,
      departmentCode: 'N/A',
      departmentName: 'Department',
      totalStudents: 0,
      activeStudents: 0,
      inactiveStudents: 0,
      incompleteStudents: 0,
      bySemester: [],
      bySection: []
    };
  }
};

/**
 * 3. Faculty Student Metrics (Authoritative for Faculty Dashboard & My Courses)
 * Deduplicates students across multiple allocated courses using canonical profile ID.
 */
export const getFacultyUniqueStudentMetrics = async (
  facultyId: string,
  allocatedCourses: { id?: string; code: string; name?: string; section?: string; semester?: number }[]
): Promise<FacultyStudentMetrics> => {
  if (!allocatedCourses || allocatedCourses.length === 0) {
    return {
      facultyId,
      uniqueStudentsCount: 0,
      allocatedCoursesCount: 0,
      courseMetrics: []
    };
  }

  try {
    const coursePromises = allocatedCourses.map(async (c) => {
      const roster = await getEligibleStudentRoster({
        courseCode: c.code,
        section: c.section,
        semester: c.semester
      });
      return {
        courseId: c.id || c.code,
        courseCode: c.code,
        courseName: c.name || c.code,
        semester: c.semester,
        section: c.section,
        studentCount: roster.length,
        studentIds: roster.map(s => s.id)
      };
    });

    const courseResults = await Promise.all(coursePromises);
    const allStudentIds = courseResults.flatMap(cr => cr.studentIds);
    const uniqueStudentIds = new Set(allStudentIds.filter(Boolean));

    return {
      facultyId,
      uniqueStudentsCount: uniqueStudentIds.size,
      allocatedCoursesCount: allocatedCourses.length,
      uniqueStudentIds: Array.from(uniqueStudentIds),
      courseMetrics: courseResults.map(({ studentIds, ...rest }) => rest)
    };
  } catch (err: any) {
    console.error('[studentStatisticsService] getFacultyUniqueStudentMetrics error:', err?.message);
    return {
      facultyId,
      uniqueStudentsCount: 0,
      allocatedCoursesCount: allocatedCourses.length,
      uniqueStudentIds: [],
      courseMetrics: []
    };
  }
};

/**
 * 4. Course-Specific Eligible Student Count
 * Used by Assignment Details, Assessment Details, and Course Overview to guarantee
 * 1:1 agreement with the Attendance Roster.
 *
 * Accepts either:
 * (a) String: courseCode (e.g. 'BCS702') or course UUID
 * (b) Options object: { courseCode?: string; courseId?: string; section?: string | null; semester?: number | null; departmentId?: string | null }
 */
export async function getEligibleStudentCountForCourse(
  courseInput: CourseCountInput,
  section?: string | null,
  semester?: number | null
): Promise<number> {
  let resolvedCode = '';
  let resolvedSection = section;
  let resolvedSemester = semester;
  let resolvedDeptId: string | null | undefined = undefined;

  if (typeof courseInput === 'object' && courseInput !== null) {
    resolvedCode = courseInput.courseCode || courseInput.courseId || '';
    if (resolvedSection === undefined) resolvedSection = courseInput.section;
    if (resolvedSemester === undefined) resolvedSemester = courseInput.semester;
    resolvedDeptId = courseInput.departmentId;
  } else if (typeof courseInput === 'string') {
    resolvedCode = courseInput;
  }

  if (!resolvedCode || resolvedCode.trim() === '') return 0;

  try {
    const roster = await getEligibleStudentRoster({
      courseCode: resolvedCode,
      section: resolvedSection,
      semester: resolvedSemester,
      departmentId: resolvedDeptId
    });
    return roster.length;
  } catch (err: any) {
    console.warn('[studentStatisticsService] getEligibleStudentCountForCourse error:', err?.message);
    return 0;
  }
}

