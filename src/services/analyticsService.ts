/**
 * Real Analytics Service — derives metrics from actual Supabase data.
 * Uses student_analytics_view and student_learning_gaps_view.
 * Uses `as any` casts for new tables not yet in generated types.
 */
import { supabase } from '../lib/supabase';

const sb = supabase as any;

export interface AcademicOverviewStats {
  attendancePercent: number;
  assignmentsSubmitted: number;
  totalAssignments: number;
  assessmentsAttempted: number;
  avgAssessmentScore: number;
}

export interface SubjectPerformanceItem {
  subject: string;
  courseId: string;
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
  topicsAnalyzed: number;
}

export interface SemesterTrendItem {
  semester: number;
  averagePercent: number;
}

export interface AssessmentBreakdownItem {
  assessmentTitle: string;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string | null;
  status: string;
}

export interface AssignmentCompletionData {
  submitted: number;
  pending: number;
  late: number;
  total: number;
}

export interface LearningGapItem {
  topic: string;
  courseId: string;
  courseName: string;
  scorePercent: number;
  correctAnswers: number;
  totalQuestions: number;
  wrongAnswers: number;
}

export const getAcademicOverview = async (studentId?: string): Promise<AcademicOverviewStats> => {
  const blank: AcademicOverviewStats = { attendancePercent: 0, assignmentsSubmitted: 0, totalAssignments: 0, assessmentsAttempted: 0, avgAssessmentScore: 0 };
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return blank;

  const { data, error } = await sb
    .from('student_analytics_view')
    .select('attendance_percentage, total_assignments, submitted_assignments, total_assessment_attempts, avg_assessment_percentage')
    .eq('student_id', uid)
    .maybeSingle();

  if (error || !data) {
    console.error('[analyticsService] getAcademicOverview error:', error?.message);
    return blank;
  }

  return {
    attendancePercent: Number(data.attendance_percentage || 0),
    assignmentsSubmitted: Number(data.submitted_assignments || 0),
    totalAssignments: Number(data.total_assignments || 0),
    assessmentsAttempted: Number(data.total_assessment_attempts || 0),
    avgAssessmentScore: Number(data.avg_assessment_percentage || 0),
  };
};

export const getLearningGaps = async (studentId?: string): Promise<LearningGapItem[]> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const { data, error } = await sb
    .from('student_learning_gaps_view')
    .select('*')
    .eq('student_id', uid)
    .order('topic_score_percent', { ascending: true });

  if (error) {
    console.error('[analyticsService] getLearningGaps error:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    topic: row.topic_name,
    courseId: row.course_id,
    courseName: row.course_name,
    scorePercent: Number(row.topic_score_percent),
    correctAnswers: Number(row.correct_answers),
    totalQuestions: Number(row.total_questions),
    wrongAnswers: Number(row.wrong_answers),
  }));
};

export const getAssessmentBreakdown = async (studentId?: string): Promise<AssessmentBreakdownItem[]> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const { data, error } = await sb
    .from('assessment_attempts')
    .select('score, max_score, percentage, submitted_at, status, assessments(title)')
    .eq('student_id', uid)
    .eq('status', 'Submitted')
    .order('submitted_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[analyticsService] getAssessmentBreakdown error:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    assessmentTitle: row.assessments?.title || 'Unknown Assessment',
    score: Number(row.score || 0),
    maxScore: Number(row.max_score || 0),
    percentage: Number(row.percentage || 0),
    submittedAt: row.submitted_at,
    status: row.status,
  }));
};

export const getAssignmentCompletion = async (studentId?: string): Promise<AssignmentCompletionData> => {
  const blank: AssignmentCompletionData = { submitted: 0, pending: 0, late: 0, total: 0 };
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return blank;

  const { count: submittedCount } = await sb
    .from('assignment_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', uid);

  const { data: profile } = await sb
    .from('profiles')
    .select('department_id')
    .eq('id', uid)
    .single();

  let totalCount = 0;
  if (profile?.department_id) {
    const { count } = await sb
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('department_id', profile.department_id)
      .eq('status', 'Active');
    totalCount = count || 0;
  }

  const submitted = submittedCount || 0;
  const pending = Math.max(0, totalCount - submitted);

  return { submitted, pending, late: 0, total: totalCount };
};

export const getSubjectPerformances = async (studentId?: string): Promise<SubjectPerformanceItem[]> => {
  const gaps = await getLearningGaps(studentId);

  const byCourse = new Map<string, LearningGapItem[]>();
  for (const gap of gaps) {
    const key = `${gap.courseId}:${gap.courseName}`;
    if (!byCourse.has(key)) byCourse.set(key, []);
    byCourse.get(key)!.push(gap);
  }

  const performances: SubjectPerformanceItem[] = [];
  for (const [key, topics] of byCourse) {
    const [courseId, courseName] = key.split(':');
    const totalQ = topics.reduce((s, t) => s + t.totalQuestions, 0);
    const correctA = topics.reduce((s, t) => s + t.correctAnswers, 0);
    const avgScore = totalQ > 0 ? Math.round((correctA / totalQ) * 100) : 0;

    performances.push({
      subject: courseName,
      courseId,
      totalQuestions: totalQ,
      correctAnswers: correctA,
      scorePercent: avgScore,
      topicsAnalyzed: topics.length,
    });
  }

  return performances.sort((a, b) => b.scorePercent - a.scorePercent);
};

export const getSemesterTrends = async (studentId?: string): Promise<SemesterTrendItem[]> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const { data, error } = await sb
    .from('results')
    .select('semester, total_marks, max_marks')
    .eq('student_id', uid)
    .order('semester', { ascending: true });

  if (error || !data || data.length === 0) return [];

  const bySem = new Map<number, { total: number; max: number }>();
  for (const row of data as any[]) {
    if (!bySem.has(row.semester)) bySem.set(row.semester, { total: 0, max: 0 });
    const entry = bySem.get(row.semester)!;
    entry.total += Number(row.total_marks || 0);
    entry.max += Number(row.max_marks || 100);
  }

  return Array.from(bySem.entries()).map(([sem, vals]) => ({
    semester: sem,
    averagePercent: vals.max > 0 ? Math.round((vals.total / vals.max) * 100) : 0,
  }));
};
