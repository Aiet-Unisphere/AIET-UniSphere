/**
 * Real Learning Service — derives learning gaps from assessment data via Supabase.
 */
import { supabase } from '../lib/supabase';
import { getLearningGaps as getGapsFromAnalytics } from './analyticsService';

const sb = supabase as any;

export interface TopicGapItem {
  id: string;
  topic: string;
  courseId: string;
  courseName: string;
  scorePercent: number;
  correctAnswers: number;
  wrongAnswers: number;
  totalQuestions: number;
  severity: 'Critical' | 'Moderate' | 'Minor';
  trend?: 'Improving' | 'Declining' | 'Stable';
}

export interface RecommendationItem {
  id: string;
  type: 'Review Material' | 'Practice Quiz' | 'Peer Study' | 'Video Resource' | 'Consult Faculty';
  topic: string;
  courseId: string;
  courseName: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  estimatedTime?: string;
}

const getSeverity = (score: number): TopicGapItem['severity'] => {
  if (score < 40) return 'Critical';
  if (score < 60) return 'Moderate';
  return 'Minor';
};

export const getLearningGaps = async (studentId?: string): Promise<TopicGapItem[]> => {
  const rawGaps = await getGapsFromAnalytics(studentId);

  return rawGaps.map((gap, idx) => ({
    id: `gap-${idx}-${gap.topic.replace(/\s+/g, '-').toLowerCase()}`,
    topic: gap.topic,
    courseId: gap.courseId,
    courseName: gap.courseName,
    scorePercent: gap.scorePercent,
    correctAnswers: gap.correctAnswers,
    wrongAnswers: gap.wrongAnswers,
    totalQuestions: gap.totalQuestions,
    severity: getSeverity(gap.scorePercent),
    trend: 'Stable' as const,
  }));
};

export const getTopicDetail = async (topicId: string): Promise<TopicGapItem | null> => {
  const gaps = await getLearningGaps();
  return gaps.find(g => g.id === topicId) || null;
};

export const getRecommendations = async (
  categoryFilter: string = 'All',
  studentId?: string
): Promise<RecommendationItem[]> => {
  const gaps = await getLearningGaps(studentId);

  const recommendations: RecommendationItem[] = [];
  let counter = 0;

  for (const gap of gaps) {
    const priority: RecommendationItem['priority'] =
      gap.severity === 'Critical' ? 'High' :
      gap.severity === 'Moderate' ? 'Medium' : 'Low';

    if (categoryFilter === 'All' || categoryFilter === 'Review Material') {
      recommendations.push({
        id: `rec-${counter++}`,
        type: 'Review Material',
        topic: gap.topic,
        courseId: gap.courseId,
        courseName: gap.courseName,
        description: `Review academic materials for "${gap.topic}" in ${gap.courseName}. Current score: ${gap.scorePercent}%.`,
        priority,
        estimatedTime: '30-45 minutes',
      });
    }

    if (gap.severity !== 'Minor' && (categoryFilter === 'All' || categoryFilter === 'Practice Quiz')) {
      recommendations.push({
        id: `rec-${counter++}`,
        type: 'Practice Quiz',
        topic: gap.topic,
        courseId: gap.courseId,
        courseName: gap.courseName,
        description: `Practice additional questions on "${gap.topic}". Answered ${gap.wrongAnswers} of ${gap.totalQuestions} incorrectly.`,
        priority,
        estimatedTime: '20-30 minutes',
      });
    }

    if (gap.severity === 'Critical' && (categoryFilter === 'All' || categoryFilter === 'Consult Faculty')) {
      recommendations.push({
        id: `rec-${counter++}`,
        type: 'Consult Faculty',
        topic: gap.topic,
        courseId: gap.courseId,
        courseName: gap.courseName,
        description: `Score on "${gap.topic}" is critically low (${gap.scorePercent}%). Schedule a session with your course faculty.`,
        priority: 'High',
        estimatedTime: '1 hour',
      });
    }
  }

  return recommendations.sort((a, b) => {
    const pOrder = { High: 0, Medium: 1, Low: 2 };
    return pOrder[a.priority] - pOrder[b.priority];
  });
};

export const getAssessmentLearningGaps = async (
  assessmentId: string,
  studentId?: string
): Promise<{ topic: string; scorePercent: number; questionCount: number }[]> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const { data: attempt } = await sb
    .from('assessment_attempts')
    .select('id')
    .eq('assessment_id', assessmentId)
    .eq('student_id', uid)
    .eq('status', 'Submitted')
    .maybeSingle();

  if (!attempt) return [];

  const { data: answers } = await sb
    .from('assessment_answers')
    .select('is_correct, assessment_questions(topic_id, assessment_topics(name))')
    .eq('attempt_id', attempt.id);

  if (!answers) return [];

  const byTopic = new Map<string, { correct: number; total: number }>();
  for (const ans of answers as any[]) {
    const topicName = ans.assessment_questions?.assessment_topics?.name;
    if (!topicName) continue;
    if (!byTopic.has(topicName)) byTopic.set(topicName, { correct: 0, total: 0 });
    const t = byTopic.get(topicName)!;
    t.total++;
    if (ans.is_correct) t.correct++;
  }

  return Array.from(byTopic.entries()).map(([topic, vals]) => ({
    topic,
    scorePercent: vals.total > 0 ? Math.round((vals.correct / vals.total) * 100) : 0,
    questionCount: vals.total,
  }));
};
