/**
 * Real Results Service — reads from public.results table
 */
import { supabase } from '../lib/supabase';

export interface CourseResult {
  id: string;
  student_id: string;
  department_id: string;
  course_id: string;
  course_name: string;
  course_code?: string | null;
  semester: number;
  academic_year?: string | null;
  internal_marks?: number | null;
  external_marks?: number | null;
  total_marks?: number | null;
  max_marks?: number | null;
  grade?: string | null;
  grade_points?: number | null;
  credits?: number | null;
  status: string;
  result_type: string;
  entered_by?: string | null;
  entered_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SemesterResultSummary {
  semester: number;
  courses: CourseResult[];
  totalCredits: number;
  earnedCredits: number;
  sgpa: number | null;
  cgpa: number | null;
  passCount: number;
  failCount: number;
}

export const getStudentResults = async (studentId?: string): Promise<CourseResult[]> => {
  let query = supabase
    .from('results')
    .select('*')
    .order('semester', { ascending: true })
    .order('course_name', { ascending: true });

  if (studentId) {
    query = query.eq('student_id', studentId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[resultService] getStudentResults error:', error.message);
    return [];
  }
  return (data || []) as CourseResult[];
};

export const getStudentResultsBySemester = async (
  semester?: number,
  studentId?: string
): Promise<CourseResult[]> => {
  let query = supabase
    .from('results')
    .select('*')
    .order('course_name', { ascending: true });

  if (studentId) query = query.eq('student_id', studentId);
  if (semester) query = query.eq('semester', semester);

  const { data, error } = await query;
  if (error) {
    console.error('[resultService] getStudentResultsBySemester error:', error.message);
    return [];
  }
  return (data || []) as CourseResult[];
};

export const getDepartmentResults = async (
  departmentId?: string,
  semester?: number
): Promise<CourseResult[]> => {
  let query = supabase
    .from('results')
    .select('*, profiles!student_id(full_name, usn_or_employee_id)')
    .order('semester', { ascending: true });

  if (departmentId) query = query.eq('department_id', departmentId);
  if (semester) query = query.eq('semester', semester);

  const { data, error } = await query;
  if (error) {
    console.error('[resultService] getDepartmentResults error:', error.message);
    return [];
  }
  return (data || []) as CourseResult[];
};

export const upsertResult = async (
  resultData: Omit<CourseResult, 'id' | 'created_at' | 'updated_at'>
): Promise<CourseResult | null> => {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await (supabase as any)
    .from('results')
    .upsert({
      ...resultData,
      entered_by: user?.id,
      entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'student_id,course_id,semester,result_type'
    })
    .select()
    .single();

  if (error) {
    console.error('[resultService] upsertResult error:', error.message);
    throw new Error(`Failed to save result: ${error.message}`);
  }
  return data as CourseResult;
};

export const computeSemesterSummaries = (results: CourseResult[]): SemesterResultSummary[] => {
  const bySemester = new Map<number, CourseResult[]>();
  for (const r of results) {
    if (!bySemester.has(r.semester)) bySemester.set(r.semester, []);
    bySemester.get(r.semester)!.push(r);
  }

  const summaries: SemesterResultSummary[] = [];
  for (const [semester, courses] of bySemester) {
    const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 3), 0);
    const earnedCredits = courses
      .filter(c => c.status === 'Pass')
      .reduce((sum, c) => sum + (c.credits || 3), 0);

    // Calculate SGPA
    const gradePointTotal = courses.reduce((sum, c) => {
      const gp = c.grade_points || 0;
      const cr = c.credits || 3;
      return sum + gp * cr;
    }, 0);
    const sgpa = totalCredits > 0 ? Math.round((gradePointTotal / totalCredits) * 100) / 100 : null;

    summaries.push({
      semester,
      courses,
      totalCredits,
      earnedCredits,
      sgpa,
      cgpa: null, // calculated across semesters
      passCount: courses.filter(c => c.status === 'Pass').length,
      failCount: courses.filter(c => c.status === 'Fail').length,
    });
  }

  // Calculate CGPA
  let totalGradePoints = 0;
  let totalCreditsAll = 0;
  for (const s of summaries) {
    for (const c of s.courses) {
      if (c.grade_points && c.credits) {
        totalGradePoints += c.grade_points * c.credits;
        totalCreditsAll += c.credits;
      }
    }
  }
  const cgpa = totalCreditsAll > 0
    ? Math.round((totalGradePoints / totalCreditsAll) * 100) / 100
    : null;

  return summaries
    .map(s => ({ ...s, cgpa }))
    .sort((a, b) => a.semester - b.semester);
};

// ---------------------------------------------------------------------------
// HOD / DEPARTMENT SUMMARIES
// ---------------------------------------------------------------------------

export interface CourseResultSummary {
  courseId: string;
  courseCode: string;
  courseName: string;
  semester: number;
  facultyName: string;
  totalStudents: number;
  passCount: number;
  failCount: number;
  averageMarksPercent: number;
  highestMarksPercent: number;
  lowestMarksPercent: number;
  passRatePercent: number;
  status: 'Healthy' | 'Needs Review';
}

export interface StudentResultSummary {
  studentId: string;
  studentName: string;
  usn: string;
  semester: number;
  sgpa: number | null;
  cgpa: number | null;
  totalCredits: number;
  earnedCredits: number;
  passCount: number;
  failCount: number;
  results: CourseResult[];
}

export const getDepartmentResultSummaries = async (
  departmentId?: string,
  semester?: number
): Promise<CourseResultSummary[]> => {
  const raw = await getDepartmentResults(departmentId, semester);

  const byCourse = new Map<string, CourseResult[]>();
  for (const r of raw) {
    if (!byCourse.has(r.course_id)) byCourse.set(r.course_id, []);
    byCourse.get(r.course_id)!.push(r);
  }

  const summaries: CourseResultSummary[] = [];
  for (const [courseId, records] of byCourse) {
    const sample = records[0];
    const passRecords = records.filter(r => r.status === 'Pass');
    const failRecords = records.filter(r => r.status === 'Fail');
    const totalPercent = records.reduce((sum, r) => {
      const pct = r.max_marks && r.max_marks > 0 ? ((r.total_marks || 0) / r.max_marks) * 100 : 0;
      return sum + pct;
    }, 0);
    const percentages = records.map(r => r.max_marks && r.max_marks > 0 ? ((r.total_marks || 0) / r.max_marks) * 100 : 0);
    const passRatePercent = records.length > 0 ? Math.round((passRecords.length / records.length) * 100) : 0;

    summaries.push({
      courseId,
      courseCode: sample.course_code || courseId,
      courseName: sample.course_name,
      semester: sample.semester,
      facultyName: 'Faculty',
      totalStudents: records.length,
      passCount: passRecords.length,
      failCount: failRecords.length,
      averageMarksPercent: records.length > 0 ? Math.round(totalPercent / records.length) : 0,
      highestMarksPercent: Math.round(Math.max(...percentages)),
      lowestMarksPercent: Math.round(Math.min(...percentages)),
      passRatePercent,
      status: passRatePercent >= 75 ? 'Healthy' : 'Needs Review',
    });
  }

  return summaries.sort((a, b) => a.semester - b.semester || a.courseName.localeCompare(b.courseName));
};

export const getStudentResultSummary = async (studentId: string): Promise<StudentResultSummary | null> => {
  const results = await getStudentResults(studentId);
  if (results.length === 0) return null;

  const summaries = computeSemesterSummaries(results);
  const lastSummary = summaries[summaries.length - 1];

  return {
    studentId,
    studentName: (results[0] as any)?.profiles?.full_name || 'Unknown',
    usn: (results[0] as any)?.profiles?.usn_or_employee_id || '',
    semester: lastSummary.semester,
    sgpa: lastSummary.sgpa,
    cgpa: lastSummary.cgpa,
    totalCredits: lastSummary.totalCredits,
    earnedCredits: lastSummary.earnedCredits,
    passCount: lastSummary.passCount,
    failCount: lastSummary.failCount,
    results,
  };
};

export const getSemesterPerformanceSummary = async (
  departmentId?: string
): Promise<{ semester: number; averagePercent: number }[]> => {
  const results = await getDepartmentResults(departmentId);
  
  const bySem = new Map<number, { total: number; max: number }>();
  for (const r of results) {
    if (!bySem.has(r.semester)) bySem.set(r.semester, { total: 0, max: 0 });
    const entry = bySem.get(r.semester)!;
    entry.total += r.total_marks || 0;
    entry.max += r.max_marks || 100;
  }

  return Array.from(bySem.entries())
    .map(([sem, vals]) => ({
      semester: sem,
      averagePercent: vals.max > 0 ? Math.round((vals.total / vals.max) * 100) : 0,
    }))
    .sort((a, b) => a.semester - b.semester);
};

