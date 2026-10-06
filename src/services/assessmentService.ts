import type { Assessment } from '../data/assessments';
import { supabase } from '../lib/supabase';
import { logUserAction } from './auditService';
import { 
  STORAGE_BUCKETS, 
  uploadFile, 
  getSignedUrl, 
  downloadStorageFile, 
  sanitizeFileName 
} from './storageService';

export interface CreateAssessmentQuestion {
  text: string;
  topic?: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  marks: number;
}

export interface CreateAssessmentPayload {
  title: string;
  subjectCode?: string;
  courseId?: string;
  courseName?: string;
  courseCode?: string;
  semester?: number;
  date: string;
  dueDate?: string;
  availableFrom?: string;
  deadline?: string;
  time: string;
  duration: number; // in minutes
  totalMarks?: number;
  instructions: string;
  questions: CreateAssessmentQuestion[];
  file?: File;
}

export const getAssessments = async (): Promise<Assessment[]> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to read authenticated session: ${authError.message}`);
  if (!user) return [];

  const { data, error } = await (supabase as any)
    .from('assessments')
    .select('*')
    .order('assessment_date', { ascending: false });
  if (error) throw new Error(`Unable to load assessments: ${error.message}`);

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  let attemptsMap = new Map<string, any>();
  if (profile?.role === 'STUDENT') {
    const { data: attempts } = await (supabase as any)
      .from('assessment_attempts')
      .select('id, assessment_id, status, started_at, submitted_at, score, max_score, percentage')
      .eq('student_id', user.id);
    if (attempts) {
      attemptsMap = new Map((attempts || []).map((att: any) => [att.assessment_id, att]));
    }
  }

  return (data || []).map((row: any) => {
    const assessment = mapAssessment(row);
    const attempt = attemptsMap.get(row.id);
    if (attempt) {
      assessment.studentAttempt = {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        score: attempt.score != null ? Number(attempt.score) : undefined,
        maxScore: attempt.max_score != null ? Number(attempt.max_score) : undefined,
        percentage: attempt.percentage != null ? Number(attempt.percentage) : undefined,
      };
    }
    return assessment;
  });
};

export const getDepartmentAssessments = getAssessments;
export const getFacultyAssessments = getAssessments;

export interface AssessmentPerformanceSummary {
  enrolledStudents: number;
  attemptedStudents: number;
  submittedAttempts: number;
  inProgressAttempts: number;
  pendingStudents: number;
  averagePercentage: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  submissionRate: number;
}

export interface FacultySubmissionRow {
  studentId: string;
  studentName: string;
  usn: string;
  status: 'Submitted' | 'Graded' | 'In Progress' | 'Abandoned' | 'Pending';
  startedAt?: string;
  submittedAt?: string;
  score?: number;
  maxScore?: number;
  percentage?: number;
  attemptId?: string;
}

export interface QuestionReviewItem {
  questionId: string;
  questionText: string;
  options: [string, string, string, string];
  selectedOption: string | null;
  correctOption: string;
  isCorrect: boolean;
  marksEarned: number;
  maxMarks: number;
  questionOrder: number;
}

export interface FacultyAttemptReview {
  attemptId: string;
  assessmentId: string;
  studentId: string;
  studentName: string;
  usn: string;
  attemptStatus: string;
  startedAt?: string;
  submittedAt?: string;
  score: number;
  maxScore: number;
  percentage: number;
  questions: QuestionReviewItem[];
}

export interface StudentAttemptReview {
  attemptId: string;
  assessmentTitle: string;
  courseName: string;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt?: string;
  questions: QuestionReviewItem[];
}

export const getFacultyAssessmentSubmissions = async (assessmentId: string): Promise<FacultySubmissionRow[]> => {
  try {
    const { data, error } = await (supabase as any)
      .rpc('get_faculty_assessment_submissions', { p_assessment_id: assessmentId });

    if (!error && data) {
      return (data || []).map((row: any) => ({
        studentId: row.student_id,
        studentName: row.student_name,
        usn: row.usn,
        status: row.status as FacultySubmissionRow['status'],
        startedAt: row.started_at || undefined,
        submittedAt: row.submitted_at || undefined,
        score: row.score != null ? Number(row.score) : undefined,
        maxScore: row.max_score != null ? Number(row.max_score) : undefined,
        percentage: row.percentage != null ? Number(row.percentage) : undefined,
        attemptId: row.attempt_id || undefined,
      }));
    }
  } catch (err) {
    console.warn('[getFacultyAssessmentSubmissions] RPC fallback triggered:', err);
  }

  // Fallback to client table queries
  const { data: assessment, error: aErr } = await (supabase as any)
    .from('assessments')
    .select('id, course_id, course_code, department_id, total_marks, deadline')
    .eq('id', assessmentId)
    .single();

  if (aErr || !assessment) {
    throw new Error(`Unable to load assessment: ${aErr?.message || 'Not found.'}`);
  }

  // Query enrolled students for course
  let eligibleStudents: { id: string; name: string; usn: string }[] = [];
  
  if (assessment.course_id || assessment.course_code) {
    const code = assessment.course_id || assessment.course_code;
    const { data: enrollments } = await (supabase as any)
      .from('course_enrollments')
      .select('student_id, profile:profiles(id, full_name, email, usn_or_employee_id)')
      .eq('status', 'Active')
      .or(`course_id.ilike.${code},course_code.ilike.${code}`);

    if (enrollments && enrollments.length > 0) {
      eligibleStudents = enrollments
        .filter((e: any) => e.profile)
        .map((e: any) => ({
          id: e.profile.id,
          name: e.profile.full_name || e.profile.email,
          usn: e.profile.usn_or_employee_id || 'N/A'
        }));
    }
  }

  if (eligibleStudents.length === 0) {
    const { data: deptStudents } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, email, usn_or_employee_id')
      .eq('role', 'STUDENT')
      .eq('department_id', assessment.department_id);

    if (deptStudents) {
      eligibleStudents = deptStudents.map((s: any) => ({
        id: s.id,
        name: s.full_name || s.email,
        usn: s.usn_or_employee_id || 'N/A'
      }));
    }
  }

  // Query attempts for assessment
  const { data: attempts } = await (supabase as any)
    .from('assessment_attempts')
    .select('*')
    .eq('assessment_id', assessmentId);

  const attemptsMap = new Map((attempts || []).map((att: any) => [att.student_id, att]));

  return eligibleStudents.map(student => {
    const att: any = attemptsMap.get(student.id);
    let status: FacultySubmissionRow['status'] = 'Pending';
    if (att) {
      status = att.status as FacultySubmissionRow['status'];
    }

    return {
      studentId: student.id,
      studentName: student.name,
      usn: student.usn,
      status,
      startedAt: att?.started_at || undefined,
      submittedAt: att?.submitted_at || undefined,
      score: att?.score != null ? Number(att.score) : undefined,
      maxScore: att?.max_score != null ? Number(att.max_score) : Number(assessment.total_marks || 0),
      percentage: att?.percentage != null ? Number(att.percentage) : undefined,
      attemptId: att?.id || undefined,
    };
  });
};

export const getFacultyAttemptReview = async (attemptId: string): Promise<FacultyAttemptReview> => {
  try {
    const { data, error } = await (supabase as any)
      .rpc('get_faculty_attempt_review', { p_attempt_id: attemptId });

    if (!error && data && data.length > 0) {
      const first = data[0];
      const questions: QuestionReviewItem[] = data.map((row: any) => ({
        questionId: row.question_id,
        questionText: row.question_text,
        options: [row.option_a, row.option_b, row.option_c, row.option_d],
        selectedOption: row.selected_option || null,
        correctOption: row.correct_option,
        isCorrect: Boolean(row.is_correct),
        marksEarned: Number(row.marks_earned || 0),
        maxMarks: Number(row.max_marks || 0),
        questionOrder: Number(row.question_order || 0)
      }));

      return {
        attemptId: first.attempt_id,
        assessmentId: first.assessment_id,
        studentId: first.student_id,
        studentName: first.student_name,
        usn: first.usn,
        attemptStatus: first.attempt_status,
        startedAt: first.started_at || undefined,
        submittedAt: first.submitted_at || undefined,
        score: Number(first.score || 0),
        maxScore: Number(first.max_score || 0),
        percentage: Number(first.percentage || 0),
        questions
      };
    }
  } catch (err) {
    console.warn('[getFacultyAttemptReview] RPC fallback triggered:', err);
  }

  // Fallback to client table queries
  const { data: attempt, error: attErr } = await (supabase as any)
    .from('assessment_attempts')
    .select('*')
    .eq('id', attemptId)
    .maybeSingle();

  if (attErr || !attempt) {
    throw new Error(`Unable to load attempt: ${attErr?.message || 'Attempt not found.'}`);
  }

  let studentName = 'Student';
  let usn = 'N/A';
  if (attempt.student_id) {
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, email, usn_or_employee_id')
      .eq('id', attempt.student_id)
      .maybeSingle();

    if (profile) {
      studentName = profile.full_name || profile.email || 'Student';
      usn = profile.usn_or_employee_id || 'N/A';
    }
  }

  const { data: questions } = await (supabase as any)
    .from('assessment_questions')
    .select('*')
    .eq('assessment_id', attempt.assessment_id)
    .order('question_order', { ascending: true });

  const { data: answers } = await (supabase as any)
    .from('assessment_answers')
    .select('*')
    .eq('attempt_id', attemptId);

  const answersMap = new Map((answers || []).map((ans: any) => [ans.question_id, ans]));

  const mappedQuestions: QuestionReviewItem[] = (questions || []).map((q: any) => {
    const ans: any = answersMap.get(q.id);
    const selectedOption = ans?.selected_option || null;
    const isCorrect = selectedOption !== null && selectedOption === q.correct_option;
    const marksEarned = isCorrect ? Number(q.marks || 1) : 0;

    return {
      questionId: q.id,
      questionText: q.question_text,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
      selectedOption,
      correctOption: q.correct_option,
      isCorrect,
      marksEarned,
      maxMarks: Number(q.marks || 1),
      questionOrder: Number(q.question_order || 0)
    };
  });

  return {
    attemptId: attempt.id,
    assessmentId: attempt.assessment_id,
    studentId: attempt.student_id,
    studentName,
    usn,
    attemptStatus: attempt.status,
    startedAt: attempt.started_at || undefined,
    submittedAt: attempt.submitted_at || undefined,
    score: Number(attempt.score || 0),
    maxScore: Number(attempt.max_score || 0),
    percentage: Number(attempt.percentage || 0),
    questions: mappedQuestions
  };
};

export const getStudentAttemptReview = async (attemptId: string): Promise<StudentAttemptReview> => {
  try {
    const { data, error } = await (supabase as any)
      .rpc('get_student_attempt_review', { p_attempt_id: attemptId });

    if (!error && data && data.length > 0) {
      const first = data[0];
      const questions: QuestionReviewItem[] = data.map((row: any) => ({
        questionId: row.question_id,
        questionText: row.question_text,
        options: [row.option_a, row.option_b, row.option_c, row.option_d],
        selectedOption: row.selected_option || null,
        correctOption: row.correct_option,
        isCorrect: Boolean(row.is_correct),
        marksEarned: Number(row.marks_earned || 0),
        maxMarks: Number(row.max_marks || 0),
        questionOrder: Number(row.question_order || 0)
      }));

      return {
        attemptId: first.attempt_id,
        assessmentTitle: first.assessment_title,
        courseName: first.course_name,
        score: Number(first.score || 0),
        maxScore: Number(first.max_score || 0),
        percentage: Number(first.percentage || 0),
        submittedAt: first.submitted_at || undefined,
        questions
      };
    }
  } catch (err) {
    console.warn('[getStudentAttemptReview] RPC fallback triggered:', err);
  }

  // Fallback to client table queries
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const { data: attempt, error: attErr } = await (supabase as any)
    .from('assessment_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('student_id', user.id)
    .maybeSingle();

  if (attErr || !attempt) {
    throw new Error("Assessment attempt not found or unauthorized.");
  }

  if (!['Submitted', 'Graded'].includes(attempt.status)) {
    throw new Error("Answers are only available for review after submitting the assessment.");
  }

  let assessmentTitle = 'Assessment';
  let courseName = 'Course';
  if (attempt.assessment_id) {
    const { data: asmt } = await (supabase as any)
      .from('assessments')
      .select('title, course_name')
      .eq('id', attempt.assessment_id)
      .maybeSingle();

    if (asmt) {
      assessmentTitle = asmt.title || 'Assessment';
      courseName = asmt.course_name || 'Course';
    }
  }

  const { data: questions } = await (supabase as any)
    .from('assessment_questions')
    .select('*')
    .eq('assessment_id', attempt.assessment_id)
    .order('question_order', { ascending: true });

  const { data: answers } = await (supabase as any)
    .from('assessment_answers')
    .select('*')
    .eq('attempt_id', attemptId);

  const answersMap = new Map((answers || []).map((ans: any) => [ans.question_id, ans]));

  const mappedQuestions: QuestionReviewItem[] = (questions || []).map((q: any) => {
    const ans: any = answersMap.get(q.id);
    const selectedOption = ans?.selected_option || null;
    const isCorrect = selectedOption !== null && selectedOption === q.correct_option;
    const marksEarned = isCorrect ? Number(q.marks || 1) : 0;

    return {
      questionId: q.id,
      questionText: q.question_text,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
      selectedOption,
      correctOption: q.correct_option,
      isCorrect,
      marksEarned,
      maxMarks: Number(q.marks || 1),
      questionOrder: Number(q.question_order || 0)
    };
  });

  return {
    attemptId: attempt.id,
    assessmentTitle,
    courseName,
    score: Number(attempt.score || 0),
    maxScore: Number(attempt.max_score || 0),
    percentage: Number(attempt.percentage || 0),
    submittedAt: attempt.submitted_at || undefined,
    questions: mappedQuestions
  };
};

export const getAssessmentPerformanceSummary = async (assessmentId: string): Promise<AssessmentPerformanceSummary> => {
  const submissions = await getFacultyAssessmentSubmissions(assessmentId);
  
  const enrolledStudents = submissions.length;
  const submitted = submissions.filter(s => ['Submitted', 'Graded'].includes(s.status));
  const inProgress = submissions.filter(s => s.status === 'In Progress');
  const pending = submissions.filter(s => s.status === 'Pending');

  const scores = submitted.map(s => Number(s.score || 0)).filter(Number.isFinite);
  const percentages = submitted.map(s => Number(s.percentage || 0)).filter(Number.isFinite);

  const averagePercentage = percentages.length 
    ? Math.round((percentages.reduce((sum, p) => sum + p, 0) / percentages.length) * 100) / 100 
    : null;

  const highestScore = scores.length ? Math.max(...scores) : null;
  const lowestScore = scores.length ? Math.min(...scores) : null;
  const submissionRate = enrolledStudents > 0 
    ? Math.round((submitted.length / enrolledStudents) * 1000) / 10 
    : 0;

  return {
    enrolledStudents,
    attemptedStudents: submitted.length + inProgress.length,
    submittedAttempts: submitted.length,
    inProgressAttempts: inProgress.length,
    pendingStudents: pending.length,
    averagePercentage,
    highestScore,
    lowestScore,
    submissionRate
  };
};

export const getAssessmentById = async (id: string): Promise<Assessment | undefined> => {
  const { data, error } = await (supabase as any)
    .from('assessments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load assessment: ${error.message}`);
  if (!data) return undefined;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify session: ${authError.message}`);
  let questions: Assessment['questions'] = [];
  let attempt: any = null;
  if (user) {
    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profileError) throw new Error(`Unable to verify user role: ${profileError.message}`);
    if (profile?.role === 'STUDENT') {
      const { data: studentAttempt, error: attemptError } = await (supabase as any)
        .from('assessment_attempts')
        .select('id, score, max_score, percentage, status, started_at, submitted_at, assessment_answers(question_id, selected_option, is_correct)')
        .eq('assessment_id', id)
        .eq('student_id', user.id)
        .maybeSingle();
      if (attemptError) throw new Error(`Unable to load assessment attempt: ${attemptError.message}`);
      attempt = studentAttempt;
      if (['Upcoming', 'Active'].includes(data.status) && attempt?.status === 'In Progress') {
        const { data: safeQuestions, error: questionError } = await (supabase as any)
          .rpc('get_student_assessment_questions', { p_assessment_id: id });
        if (questionError) throw new Error(`Unable to load assessment questions: ${questionError.message}`);
        questions = (safeQuestions || []).map((question: any) => mapQuestion(question, false));
      }
    } else {
      const { data: staffQuestions, error: questionError } = await (supabase as any)
        .from('assessment_questions')
        .select('*, assessment_topics(name)')
        .eq('assessment_id', id)
        .order('question_order', { ascending: true });
      if (questionError) throw new Error(`Unable to load assessment questions: ${questionError.message}`);
      questions = (staffQuestions || []).map((question: any) => mapQuestion(question, true));
    }
  }

  const assessment = mapAssessment(data, questions);
  if (attempt) {
    assessment.studentAttempt = {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      score: attempt.score != null ? Number(attempt.score) : undefined,
      maxScore: attempt.max_score != null ? Number(attempt.max_score) : undefined,
      percentage: attempt.percentage != null ? Number(attempt.percentage) : undefined,
    };
  }
  if (attempt?.status === 'In Progress') {
    assessment.studentAnswers = Object.fromEntries((attempt.assessment_answers || [])
      .filter((answer: any) => answer.selected_option)
      .map((answer: any) => [answer.question_id, answer.selected_option.charCodeAt(0) - 65]));
  }
  if (attempt?.status === 'Submitted' || attempt?.status === 'Graded') {
      const { data: result, error: resultError } = await (supabase as any)
        .rpc('get_student_assessment_result', { p_assessment_id: id });
      if (resultError || !result) throw new Error(`Unable to load assessment result: ${resultError?.message || 'No result returned.'}`);
      const correctCount = Number(result.correct_count || 0);
      assessment.status = 'Completed';
      assessment.result = {
        score: Number(result.score || 0),
        percentage: Number(result.percentage || 0),
        correctCount,
        incorrectCount: Math.max(0, Number(result.question_count || assessment.questionsCount) - correctCount),
        topicPerformance: (result.topic_performance || []).map((topic: any) => ({ topic: topic.topic, score: Number(topic.score) })),
      };
  }
  return assessment;
};

export const startAssessmentAttempt = async (assessmentId: string): Promise<{ attemptId: string; startedAt: string; durationMinutes: number }> => {
  const { data, error } = await (supabase as any).rpc('start_assessment_attempt', { p_assessment_id: assessmentId });
  if (error || !data) throw new Error(`Unable to start assessment: ${error?.message || 'No attempt was returned.'}`);
  return { attemptId: data.attempt_id, startedAt: data.started_at, durationMinutes: Number(data.duration_minutes) };
};

export const saveAssessmentAnswer = async (
  assessmentId: string,
  questionId: string,
  optionIndex: number
): Promise<void> => {
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) {
    throw new Error('Selected answer is invalid.');
  }
  const { error } = await (supabase as any).rpc('save_assessment_answer', {
    p_assessment_id: assessmentId,
    p_question_id: questionId,
    p_selected_option: String.fromCharCode(65 + optionIndex),
  });
  if (error) throw new Error(`Unable to save answer: ${error.message}`);
};

export const submitAssessmentAnswers = async (
  id: string,
  answers: { [questionId: string]: number }
): Promise<Assessment> => {
  const responseAnswers = Object.entries(answers).map(([questionId, optionIndex]) => {
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) {
      throw new Error('One or more selected answers are invalid.');
    }
    return { question_id: questionId, selected_option: String.fromCharCode(65 + optionIndex) };
  });
  const { data, error } = await (supabase as any).rpc('submit_assessment_attempt', {
    p_assessment_id: id,
    p_answers: responseAnswers,
  });
  if (error) throw new Error(`Unable to submit assessment: ${error.message}`);

  const assessment = await getAssessmentById(id);
  if (!assessment) throw new Error('Assessment result could not be loaded.');
  assessment.status = 'Completed';
  assessment.result = {
    score: Number(data.score),
    percentage: Number(data.percentage),
    correctCount: Number(data.correct_count),
    incorrectCount: Number(data.question_count) - Number(data.correct_count),
    topicPerformance: (data.topic_performance || []).map((topic: any) => ({ topic: topic.topic, score: Number(topic.score) })),
  };
  return assessment;
};

export const createAssessment = async (payload: CreateAssessmentPayload): Promise<Assessment> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated faculty session required.');
  if (!payload.questions.length) throw new Error('Add at least one question before creating an assessment.');

  const { data: profile, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('department_id, role, account_status')
    .eq('id', user.id)
    .single();
  if (profileError || !profile?.department_id || profile.account_status !== 'ACTIVE') {
    throw new Error('An active department profile is required to create an assessment.');
  }
  if (!['FACULTY', 'HOD', 'ADMIN'].includes(profile.role)) {
    throw new Error('Only faculty and department administrators can create assessments.');
  }

  for (const question of payload.questions) {
    if (!question.text.trim() || question.options.some(option => !option.trim())) {
      throw new Error('Every question needs a prompt and four answer options.');
    }
    if (!Number.isInteger(question.correctOptionIndex) || question.correctOptionIndex < 0 || question.correctOptionIndex > 3 || question.marks <= 0) {
      throw new Error('Each question needs a valid correct option and positive marks.');
    }
  }

  const assessmentId = crypto.randomUUID();
  const totalMarks = payload.questions.reduce((total, question) => total + question.marks, 0);
  const fileName = payload.file?.name || null;
  const fileSize = payload.file?.size || null;
  const mimeType = payload.file?.type || null;
  const storagePath = payload.file
    ? `${profile.department_id}/${payload.courseId}/${assessmentId}/${sanitizeFileName(payload.file.name)}`
    : null;

  if (payload.file && storagePath) {
    await uploadFile({ bucket: STORAGE_BUCKETS.ASSESSMENTS, path: storagePath, file: payload.file, upsert: false });
  }

  const code = (payload.subjectCode || payload.courseCode || payload.courseId || '').trim();
  const courseIdValue = payload.courseId || code;
  const courseNameValue = payload.courseName || code;
  const courseCodeValue = code;

  const availableFromISO = payload.availableFrom || (payload.date ? `${payload.date}T${payload.time || '10:00:00'}` : new Date().toISOString());
  const deadlineISO = payload.deadline || (payload.dueDate || payload.date ? `${payload.dueDate || payload.date}T23:59:59` : new Date().toISOString());

  const { data: assessmentRow, error: assessmentError } = await (supabase as any)
    .from('assessments')
    .insert({
      id: assessmentId,
      title: payload.title.trim(),
      course_id: courseIdValue,
      course_name: courseNameValue,
      course_code: courseCodeValue,
      semester: payload.semester,
      department_id: profile.department_id,
      created_by: user.id,
      available_from: availableFromISO,
      deadline: deadlineISO,
      assessment_date: payload.date || availableFromISO.slice(0, 10),
      due_date: payload.dueDate || deadlineISO.slice(0, 10),
      assessment_time: payload.time || availableFromISO.slice(11, 16),
      duration_minutes: payload.duration,
      total_marks: totalMarks,
      question_count: payload.questions.length,
      instructions: payload.instructions,
      status: 'Upcoming',
      storage_path: storagePath,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
    })
    .select()
    .single();

  if (assessmentError || !assessmentRow) {
    if (storagePath) await supabase.storage.from(STORAGE_BUCKETS.ASSESSMENTS).remove([storagePath]);
    throw new Error(`Failed to create assessment: ${assessmentError?.message || 'No assessment record returned.'}`);
  }

  try {
    const topicNames = [...new Set(payload.questions.map(q => q.topic?.trim()).filter(Boolean) as string[])];
    let topicIds = new Map<string, string>();
    if (topicNames.length > 0) {
      const { data: topics, error: topicError } = await (supabase as any)
        .from('assessment_topics')
        .insert(topicNames.map(name => ({ assessment_id: assessmentId, name })))
        .select('id, name');
      if (topicError) throw new Error(`Failed to save assessment topics: ${topicError.message}`);
      topicIds = new Map((topics || []).map((topic: any) => [topic.name, topic.id]));
    }

    const questionRows = payload.questions.map((question, index) => {
      const trimmedTopic = question.topic?.trim();
      const topicId = trimmedTopic ? topicIds.get(trimmedTopic) || null : null;
      return {
        assessment_id: assessmentId,
        topic_id: topicId,
        question_text: question.text.trim(),
        option_a: question.options[0].trim(),
        option_b: question.options[1].trim(),
        option_c: question.options[2].trim(),
        option_d: question.options[3].trim(),
        correct_option: String.fromCharCode(65 + question.correctOptionIndex),
        marks: question.marks,
        question_order: index,
      };
    });
    const { data: questions, error: questionError } = await (supabase as any)
      .from('assessment_questions')
      .insert(questionRows)
      .select('*, assessment_topics(name)');
    if (questionError) throw new Error(`Failed to save assessment questions: ${questionError.message}`);
    return mapAssessment(assessmentRow, (questions || []).map((question: any) => mapQuestion(question, true)));
  } catch (error) {
    await (supabase as any).from('assessments').delete().eq('id', assessmentId);
    if (storagePath) await supabase.storage.from(STORAGE_BUCKETS.ASSESSMENTS).remove([storagePath]);
    throw error;
  }
};

function mapAssessment(row: any, questions: Assessment['questions'] = []): Assessment {
  const code = row.course_code || row.course_id || row.course_name || '';
  return {
    id: row.id,
    title: row.title,
    courseId: row.course_id || code,
    courseCode: code,
    subjectCode: code,
    courseName: row.course_name && row.course_name !== code ? row.course_name : code,
    semester: row.semester == null ? undefined : Number(row.semester),
    date: row.assessment_date,
    dueDate: row.due_date || undefined,
    availableFrom: row.available_from || undefined,
    deadline: row.deadline || undefined,
    time: row.assessment_time || '',
    duration: Number(row.duration_minutes || 0),
    durationMinutes: Number(row.duration_minutes || 0),
    status: row.status,
    questionsCount: Number(row.question_count ?? questions.length),
    totalMarks: Number(row.total_marks || 0),
    instructions: row.instructions || '',
    storagePath: row.storage_path || undefined,
    fileName: row.file_name || undefined,
    fileSize: row.file_size == null ? undefined : Number(row.file_size),
    mimeType: row.mime_type || undefined,
    questions,
  };
}

function mapQuestion(row: any, includeAnswer: boolean): NonNullable<Assessment['questions']>[number] {
  return {
    id: row.id,
    text: row.question_text,
    options: [row.option_a, row.option_b, row.option_c, row.option_d],
    ...(includeAnswer ? { correctOptionIndex: String(row.correct_option).charCodeAt(0) - 65 } : {}),
    marks: Number(row.marks),
    topic: row.assessment_topics?.name || row.topic_name || undefined,
  };
}

export const downloadAssessmentFile = async (storagePath: string, fileName?: string): Promise<void> => {
  await downloadStorageFile(STORAGE_BUCKETS.ASSESSMENTS, storagePath, fileName);
};

export const getAssessmentFileUrl = async (storagePath: string): Promise<string | null> => {
  return await getSignedUrl(STORAGE_BUCKETS.ASSESSMENTS, storagePath, 3600);
};

export const saveAssessmentQuestion = async (
  assessmentId: string,
  question: CreateAssessmentQuestion,
  questionId?: string
): Promise<Assessment['questions'] extends (infer T)[] | undefined ? T : never> => {
  if (!question.text.trim() || question.options.some(option => !option.trim())) {
    throw new Error('A question needs a prompt and four answer options.');
  }
  if (!Number.isInteger(question.correctOptionIndex) || question.correctOptionIndex < 0 || question.correctOptionIndex > 3 || question.marks <= 0) {
    throw new Error('Choose a correct option and positive marks.');
  }

  const trimmedTopic = question.topic?.trim();
  let topicId: string | null = null;
  if (trimmedTopic) {
    const { data: topic, error: topicLookupError } = await (supabase as any)
      .from('assessment_topics')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('name', trimmedTopic)
      .maybeSingle();
    if (topicLookupError) throw new Error(`Unable to resolve question topic: ${topicLookupError.message}`);
    topicId = topic?.id || null;
    if (!topicId) {
      const { data: createdTopic, error: topicInsertError } = await (supabase as any)
        .from('assessment_topics')
        .insert({ assessment_id: assessmentId, name: trimmedTopic })
        .select('id')
        .single();
      if (topicInsertError || !createdTopic) throw new Error(`Unable to create question topic: ${topicInsertError?.message || 'No topic returned.'}`);
      topicId = createdTopic.id;
    }
  }

  const questionData = {
    assessment_id: assessmentId,
    topic_id: topicId,
    question_text: question.text.trim(),
    option_a: question.options[0].trim(),
    option_b: question.options[1].trim(),
    option_c: question.options[2].trim(),
    option_d: question.options[3].trim(),
    correct_option: String.fromCharCode(65 + question.correctOptionIndex),
    marks: question.marks,
  };
  let query = (supabase as any).from('assessment_questions');
  query = questionId
    ? query.update(questionData).eq('id', questionId).eq('assessment_id', assessmentId)
    : query.insert(questionData);
  const { data, error } = await query.select('*, assessment_topics(name)').single();
  if (error || !data) throw new Error(`Unable to save assessment question: ${error?.message || 'No question returned.'}`);
  await refreshAssessmentTotalMarks(assessmentId);
  return mapQuestion(data, true);
};

export const deleteAssessmentQuestion = async (assessmentId: string, questionId: string): Promise<void> => {
  const { data, error } = await (supabase as any)
    .from('assessment_questions')
    .delete()
    .eq('assessment_id', assessmentId)
    .eq('id', questionId)
    .select('id');
  if (error) throw new Error(`Unable to delete assessment question: ${error.message}`);
  if (!data?.length) throw new Error('Question was not found or this assessment is no longer editable.');
  await refreshAssessmentTotalMarks(assessmentId);
};

const refreshAssessmentTotalMarks = async (assessmentId: string): Promise<void> => {
  const { data: questions, error: questionsError } = await (supabase as any)
    .from('assessment_questions')
    .select('marks')
    .eq('assessment_id', assessmentId);
  if (questionsError) throw new Error(`Unable to total assessment marks: ${questionsError.message}`);
  const totalMarks = (questions || []).reduce((total: number, question: any) => total + Number(question.marks || 0), 0);
  const { error } = await (supabase as any).from('assessments').update({ total_marks: totalMarks }).eq('id', assessmentId);
  if (error) throw new Error(`Unable to update assessment total marks: ${error.message}`);
};

export const publishAssessment = async (assessmentId: string): Promise<void> => {
  const { count, error: questionsError } = await (supabase as any)
    .from('assessment_questions')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId);
  if (questionsError) throw new Error(`Unable to validate assessment questions: ${questionsError.message}`);
  if (!count) throw new Error('Add at least one question before publishing this assessment.');

  const { data, error } = await (supabase as any)
    .from('assessments')
    .update({ status: 'Upcoming' })
    .eq('id', assessmentId)
    .eq('status', 'Draft')
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error(`Unable to publish assessment: ${error?.message || 'Assessment is no longer a draft.'}`);
  await logUserAction({ action: 'ASSESSMENT_PUBLISHED', entityType: 'assessment', entityId: assessmentId });
};

export const unpublishAssessment = async (assessmentId: string): Promise<void> => {
  const { count, error: attemptsError } = await (supabase as any)
    .from('assessment_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId);
  if (attemptsError) throw new Error(`Unable to check assessment attempts: ${attemptsError.message}`);
  if (count) throw new Error('An assessment with attempts cannot be unpublished.');
  const { data, error } = await (supabase as any)
    .from('assessments')
    .update({ status: 'Draft' })
    .eq('id', assessmentId)
    .eq('status', 'Upcoming')
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error(`Unable to unpublish assessment: ${error?.message || 'Assessment is not upcoming.'}`);
};

export const openAssessment = async (assessmentId: string): Promise<void> => {
  const { data: assessment, error: lookupError } = await (supabase as any)
    .from('assessments')
    .select('assessment_date')
    .eq('id', assessmentId)
    .maybeSingle();
  if (lookupError || !assessment) throw new Error(`Unable to load assessment schedule: ${lookupError?.message || 'Assessment not found.'}`);
  if (assessment.assessment_date > new Date().toISOString().slice(0, 10)) {
    throw new Error('The assessment cannot be opened before its scheduled date.');
  }
  const { data, error } = await (supabase as any)
    .from('assessments')
    .update({ status: 'Active' })
    .eq('id', assessmentId)
    .eq('status', 'Upcoming')
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error(`Unable to open assessment: ${error?.message || 'Assessment is not published.'}`);
  await logUserAction({ action: 'ASSESSMENT_OPENED', entityType: 'assessment', entityId: assessmentId });
};

export const closeAssessment = async (assessmentId: string): Promise<void> => {
  const { data, error } = await (supabase as any)
    .from('assessments')
    .update({ status: 'Closed' })
    .eq('id', assessmentId)
    .eq('status', 'Active')
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error(`Unable to close assessment: ${error?.message || 'Assessment is not active.'}`);
  await logUserAction({ action: 'ASSESSMENT_CLOSED', entityType: 'assessment', entityId: assessmentId });
};

export const deleteAssessment = async (assessmentId: string): Promise<void> => {
  const { data, error } = await (supabase as any)
    .from('assessments')
    .delete()
    .eq('id', assessmentId)
    .select('id');
  if (error) throw new Error(`Unable to delete assessment: ${error.message}`);
  if (!data?.length) throw new Error('Assessment could not be deleted or is locked.');
  await logUserAction({ action: 'ASSESSMENT_DELETED', entityType: 'assessment', entityId: assessmentId });
};

