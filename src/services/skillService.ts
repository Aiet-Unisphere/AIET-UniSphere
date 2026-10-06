/**
 * Real Skill & Achievement Service — backed by Supabase student_skills and student_achievements.
 */
import { supabase } from '../lib/supabase';

const sb = supabase as any;

export interface StudentSkill {
  id: string;
  student_id: string;
  name: string;
  category: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  level_percent: number;
  evidence_source?: string | null;
  evidence_id?: string | null;
  last_updated: string;
  created_at: string;
}

export interface StudentAchievement {
  id: string;
  student_id: string;
  name: string;
  description?: string | null;
  category: string;
  icon: string;
  earned_at: string;
  evidence_type?: string | null;
  evidence_id?: string | null;
  is_featured: boolean;
  created_at: string;
}

export interface StudentSkillProfile {
  skills: StudentSkill[];
  totalSkills: number;
  skillsByCategory: Record<string, StudentSkill[]>;
  topSkills: StudentSkill[];
}

const getLevelFromPercent = (percent: number): StudentSkill['level'] => {
  if (percent >= 85) return 'Expert';
  if (percent >= 65) return 'Advanced';
  if (percent >= 40) return 'Intermediate';
  return 'Beginner';
};

// ---------------------------------------------------------------------------
// SKILLS
// ---------------------------------------------------------------------------

export const computeAndSyncSkills = async (studentId?: string): Promise<StudentSkill[]> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const { data: topicPerf } = await sb
    .from('student_learning_gaps_view')
    .select('topic_name, course_name, topic_score_percent, total_questions')
    .eq('student_id', uid);

  const skillsToUpsert: any[] = [];

  if (topicPerf && topicPerf.length > 0) {
    for (const tp of topicPerf as any[]) {
      const score = Number(tp.topic_score_percent);
      skillsToUpsert.push({
        student_id: uid,
        name: tp.topic_name,
        category: 'Academic',
        level: getLevelFromPercent(score),
        level_percent: score,
        evidence_source: 'assessment',
        evidence_id: tp.course_name,
        last_updated: new Date().toISOString(),
      });
    }
  }

  const { data: githubConn } = await sb
    .from('github_connections')
    .select('github_username')
    .eq('user_id', uid)
    .maybeSingle();

  if (githubConn?.github_username) {
    skillsToUpsert.push({
      student_id: uid,
      name: 'Version Control (Git)',
      category: 'Tools',
      level: 'Intermediate',
      level_percent: 65,
      evidence_source: 'github',
      evidence_id: githubConn.github_username,
      last_updated: new Date().toISOString(),
    });
  }

  const { count: projectCount } = await sb
    .from('user_projects')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', uid);

  if ((projectCount || 0) > 0) {
    const projLevel = (projectCount || 0) >= 3 ? 70 : 45;
    skillsToUpsert.push({
      student_id: uid,
      name: 'Project Management',
      category: 'Soft Skills',
      level: getLevelFromPercent(projLevel),
      level_percent: projLevel,
      evidence_source: 'projects',
      evidence_id: uid,
      last_updated: new Date().toISOString(),
    });
  }

  if (skillsToUpsert.length > 0) {
    await sb
      .from('student_skills')
      .upsert(skillsToUpsert, { onConflict: 'student_id,name', ignoreDuplicates: false });
  }

  return getSkillPassport(uid).then(p => p.skills);
};

export const getSkillPassport = async (studentId?: string): Promise<StudentSkillProfile> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return { skills: [], totalSkills: 0, skillsByCategory: {}, topSkills: [] };

  const { data, error } = await sb
    .from('student_skills')
    .select('*')
    .eq('student_id', uid)
    .order('level_percent', { ascending: false });

  if (error) {
    console.error('[skillService] getSkillPassport error:', error.message);
    return { skills: [], totalSkills: 0, skillsByCategory: {}, topSkills: [] };
  }

  const skills = (data || []) as StudentSkill[];
  const skillsByCategory: Record<string, StudentSkill[]> = {};
  for (const s of skills) {
    if (!skillsByCategory[s.category]) skillsByCategory[s.category] = [];
    skillsByCategory[s.category].push(s);
  }

  return {
    skills,
    totalSkills: skills.length,
    skillsByCategory,
    topSkills: skills.slice(0, 5),
  };
};

// ---------------------------------------------------------------------------
// ACHIEVEMENTS
// ---------------------------------------------------------------------------

export const computeAndSyncAchievements = async (studentId?: string): Promise<StudentAchievement[]> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const achievementsToAward: any[] = [];
  const now = new Date().toISOString();

  const { count: submissionCount } = await sb
    .from('assignment_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', uid);

  if ((submissionCount || 0) >= 1) {
    achievementsToAward.push({
      student_id: uid,
      name: 'First Submission',
      description: 'Submitted your first assignment. Great start!',
      category: 'Assignments',
      icon: 'file-text',
      earned_at: now,
      evidence_type: 'assignment_submission',
      is_featured: false,
    });
  }

  if ((submissionCount || 0) >= 10) {
    achievementsToAward.push({
      student_id: uid,
      name: 'Consistent Learner',
      description: 'Submitted 10 or more assignments. Keep it up!',
      category: 'Assignments',
      icon: 'star',
      earned_at: now,
      evidence_type: 'assignment_submission',
      is_featured: true,
    });
  }

  const { data: analyticsData } = await sb
    .from('student_analytics_view')
    .select('attendance_percentage, total_sessions')
    .eq('student_id', uid)
    .maybeSingle();

  if (analyticsData && Number(analyticsData.attendance_percentage) >= 90 && Number(analyticsData.total_sessions) >= 5) {
    achievementsToAward.push({
      student_id: uid,
      name: 'Attendance Star',
      description: 'Maintained 90% or higher attendance. Excellent dedication!',
      category: 'Attendance',
      icon: 'calendar-check',
      earned_at: now,
      evidence_type: 'attendance',
      is_featured: true,
    });
  }

  if (analyticsData && Number(analyticsData.total_sessions) >= 1) {
    achievementsToAward.push({
      student_id: uid,
      name: 'Regular Attendee',
      description: 'Attended your first class session.',
      category: 'Attendance',
      icon: 'calendar',
      earned_at: now,
      evidence_type: 'attendance',
      is_featured: false,
    });
  }

  const { data: attempts } = await sb
    .from('assessment_attempts')
    .select('percentage')
    .eq('student_id', uid)
    .eq('status', 'Submitted');

  if (attempts && attempts.length > 0) {
    achievementsToAward.push({
      student_id: uid,
      name: 'First Assessment',
      description: 'Completed your first online assessment.',
      category: 'Assessments',
      icon: 'clipboard',
      earned_at: now,
      evidence_type: 'assessment_attempt',
      is_featured: false,
    });

    const highScoreAttempts = (attempts as any[]).filter(a => Number(a.percentage) >= 80);
    if (highScoreAttempts.length >= 1) {
      achievementsToAward.push({
        student_id: uid,
        name: 'High Achiever',
        description: 'Scored 80% or above on an assessment. Outstanding!',
        category: 'Assessments',
        icon: 'award',
        earned_at: now,
        evidence_type: 'assessment_attempt',
        is_featured: true,
      });
    }
  }

  const { data: githubConn } = await sb
    .from('github_connections')
    .select('id')
    .eq('user_id', uid)
    .maybeSingle();

  if (githubConn) {
    achievementsToAward.push({
      student_id: uid,
      name: 'GitHub Connected',
      description: 'Connected your GitHub account to UniSphere.',
      category: 'Technical',
      icon: 'github',
      earned_at: now,
      evidence_type: 'github_connection',
      is_featured: false,
    });
  }

  const { count: projCount } = await sb
    .from('user_projects')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', uid);

  if ((projCount || 0) >= 1) {
    achievementsToAward.push({
      student_id: uid,
      name: 'Project Creator',
      description: 'Created your first academic project workspace.',
      category: 'Projects',
      icon: 'folder',
      earned_at: now,
      evidence_type: 'project',
      is_featured: false,
    });
  }

  if (achievementsToAward.length > 0) {
    await sb
      .from('student_achievements')
      .upsert(achievementsToAward, { onConflict: 'student_id,name', ignoreDuplicates: true });
  }

  return getAchievements(uid);
};

export const getAchievements = async (
  studentId?: string,
  categoryFilter: string = 'All'
): Promise<StudentAchievement[]> => {
  let uid = studentId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  let query = sb
    .from('student_achievements')
    .select('*')
    .eq('student_id', uid)
    .order('earned_at', { ascending: false });

  if (categoryFilter !== 'All') {
    query = query.eq('category', categoryFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[skillService] getAchievements error:', error.message);
    return [];
  }
  return (data || []) as StudentAchievement[];
};
