/**
 * Real Project Service — backed by Supabase user_projects, project_tasks, project_milestones.
 * Uses `sb = supabase as any` for new tables not yet in generated types.
 */
import { supabase } from '../lib/supabase';
import { STORAGE_BUCKETS } from './storageService';
import { createBatchNotificationsIdempotent } from './notificationService';

const sb = supabase as any;

export interface Project {
  id: string;
  owner_id: string;
  department_id?: string | null;
  name: string;
  description?: string | null;
  project_type: 'Personal' | 'Team' | 'Capstone' | 'Research' | 'Mini';
  course_name?: string | null;
  technology: string[];
  team_members: TeamMember[];
  deadline?: string | null;
  status: 'Active' | 'Completed' | 'On Hold' | 'Pending Review' | 'Upcoming';
  progress: number;
  github_repo_url?: string | null;
  faculty_mentor?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  name: string;
  role: string;
  contribution?: string;
  isOwner?: boolean;
  userId?: string;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Todo' | 'In Progress' | 'Completed' | 'Blocked';
  due_date?: string | null;
  completed_at?: string | null;
  task_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectMilestone {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
  milestone_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectResource {
  id: string;
  name: string;
  type: string;
  path: string;
  sizeBytes?: number;
  updatedAt: string;
  content?: string | null;
  storagePath?: string;
  source: 'workspace' | 'storage';
}

export interface CreateProjectPayload {
  name: string;
  description: string;
  projectType: Project['project_type'];
  courseName?: string;
  technology: string[];
  teamMembers?: string;
  deadline?: string;
  facultyMentor?: string;
}

// ---------------------------------------------------------------------------
// PROJECTS CRUD
// ---------------------------------------------------------------------------

export const getProjects = async (): Promise<Project[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await sb
    .from('user_projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[projectService] getProjects error:', error.message);
    return [];
  }

  return (data || []).map(dbToProject);
};

export const getPersonalProjects = async (): Promise<Project[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await sb
    .from('user_projects')
    .select('*')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[projectService] getPersonalProjects error:', error.message);
    return [];
  }

  return (data || []).map(dbToProject);
};

export const getProjectById = async (id: string): Promise<Project | undefined> => {
  const { data, error } = await sb
    .from('user_projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[projectService] getProjectById error:', error.message);
    return undefined;
  }

  return dbToProject(data);
};

export const createProject = async (payload: CreateProjectPayload): Promise<Project> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required.');

  const { data: profile } = await sb
    .from('profiles')
    .select('full_name, department_id')
    .eq('id', user.id)
    .single();

  const teamMembers: TeamMember[] = [
    { name: profile?.full_name || 'Project Owner', role: 'Project Owner', contribution: 'Project Lead', isOwner: true, userId: user.id }
  ];

  if (payload.teamMembers) {
    const names = payload.teamMembers.split(',').map((n: string) => n.trim()).filter(Boolean);
    for (const name of names) {
      teamMembers.push({ name, role: 'Team Member', contribution: 'Module Developer', isOwner: false });
    }
  }

  const { data, error } = await sb
    .from('user_projects')
    .insert({
      owner_id: user.id,
      department_id: profile?.department_id || null,
      name: payload.name,
      description: payload.description,
      project_type: payload.projectType || 'Personal',
      course_name: payload.courseName || null,
      technology: payload.technology || [],
      team_members: teamMembers,
      deadline: payload.deadline || null,
      status: 'Active',
      progress: 0,
      faculty_mentor: payload.facultyMentor || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create project: ${error.message}`);

  return dbToProject(data);
};

export const updateProject = async (id: string, updates: Partial<Project>): Promise<Project> => {
  const { data, error } = await sb
    .from('user_projects')
    .update({
      ...(updates.name && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.status && { status: updates.status }),
      ...(updates.progress !== undefined && { progress: updates.progress }),
      ...(updates.technology && { technology: updates.technology }),
      ...(updates.github_repo_url !== undefined && { github_repo_url: updates.github_repo_url }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update project: ${error.message}`);
  return dbToProject(data);
};

export const getProjectStats = async () => {
  const projects = await getPersonalProjects();
  return {
    active: projects.filter(p => p.status === 'Active').length,
    completed: projects.filter(p => p.status === 'Completed').length,
    pendingReview: projects.filter(p => p.status === 'Pending Review').length,
    upcoming: projects.filter(p => p.status === 'Upcoming').length,
    total: projects.length,
  };
};

// ---------------------------------------------------------------------------
// PROJECT TASKS
// ---------------------------------------------------------------------------

export const getProjectTasks = async (projectId: string): Promise<ProjectTask[]> => {
  const { data, error } = await sb
    .from('project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('task_order', { ascending: true });

  if (error) {
    console.error('[projectService] getProjectTasks error:', error.message);
    return [];
  }
  return (data || []) as ProjectTask[];
};

export const createTask = async (
  projectId: string,
  task: { title: string; description?: string; priority?: ProjectTask['priority']; assignedTo?: string; dueDate?: string }
): Promise<ProjectTask> => {
  const { data: existing } = await sb
    .from('project_tasks')
    .select('task_order')
    .eq('project_id', projectId)
    .order('task_order', { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.task_order ?? -1) + 1;

  const { data, error } = await sb
    .from('project_tasks')
    .insert({
      project_id: projectId,
      title: task.title,
      description: task.description || null,
      priority: task.priority || 'Medium',
      assigned_to: task.assignedTo || null,
      due_date: task.dueDate || null,
      status: 'Todo',
      task_order: nextOrder,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data as ProjectTask;
};

export const toggleTaskStatus = async (taskId: string): Promise<ProjectTask> => {
  const { data: current } = await sb
    .from('project_tasks')
    .select('status')
    .eq('id', taskId)
    .single();

  const nextStatus = current?.status === 'Completed' ? 'In Progress' : 'Completed';

  const { data, error } = await sb
    .from('project_tasks')
    .update({
      status: nextStatus,
      completed_at: nextStatus === 'Completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update task: ${error.message}`);
  return data as ProjectTask;
};

export const deleteTask = async (taskId: string): Promise<void> => {
  const { error } = await sb.from('project_tasks').delete().eq('id', taskId);
  if (error) throw new Error(`Failed to delete task: ${error.message}`);
};

// ---------------------------------------------------------------------------
// PROJECT MILESTONES
// ---------------------------------------------------------------------------

export const getProjectMilestones = async (projectId: string): Promise<ProjectMilestone[]> => {
  const { data, error } = await sb
    .from('project_milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('milestone_order', { ascending: true });

  if (error) {
    console.error('[projectService] getProjectMilestones error:', error.message);
    return [];
  }
  return (data || []) as ProjectMilestone[];
};

const notifyProjectMembers = async (
  projectId: string,
  title: string,
  shortMessage: string,
  fullMessage?: string
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    // 1. Preferred: Authorized server-side RPC (verifies project membership)
    try {
      const { error: rpcErr } = await (supabase.rpc as any)('notify_project_members', {
        p_project_id: projectId,
        p_title: title,
        p_short_message: shortMessage,
        p_full_message: fullMessage || shortMessage
      });
      if (!rpcErr) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('notifications_updated'));
        }
        return;
      }
    } catch (e) {
      // Fallback to client resolution if migration not yet applied
    }

    const { data: project } = await sb
      .from('user_projects')
      .select('name, owner_id, team_members')
      .eq('id', projectId)
      .single();

    if (!project) return;

    const recipientIds = new Set<string>();
    if (project.owner_id && project.owner_id !== user?.id) {
      recipientIds.add(project.owner_id);
    }

    if (Array.isArray(project.team_members)) {
      project.team_members.forEach((m: any) => {
        if (m.userId && m.userId !== user?.id) {
          recipientIds.add(m.userId);
        }
      });
    }

    const idsToNotify = Array.from(recipientIds);
    if (idsToNotify.length > 0) {
      await createBatchNotificationsIdempotent(idsToNotify, {
        title,
        shortMessage,
        fullMessage: fullMessage || shortMessage,
        source: 'Projects',
        category: 'Projects',
        type: 'Project',
        relatedLink: `/student/projects/${projectId}`
      });
    }
  } catch (e) {
    console.warn('[projectService] notifyProjectMembers error:', e);
  }
};

export const createMilestone = async (
  projectId: string,
  milestone: { title: string; description?: string; dueDate?: string }
): Promise<ProjectMilestone> => {
  const { data: existing } = await sb
    .from('project_milestones')
    .select('milestone_order')
    .eq('project_id', projectId)
    .order('milestone_order', { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.milestone_order ?? -1) + 1;

  const { data, error } = await sb
    .from('project_milestones')
    .insert({
      project_id: projectId,
      title: milestone.title,
      description: milestone.description || null,
      due_date: milestone.dueDate || null,
      status: 'Pending',
      milestone_order: nextOrder,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create milestone: ${error.message}`);

  notifyProjectMembers(
    projectId,
    `New Milestone: ${milestone.title}`,
    `Milestone "${milestone.title}" was added to your project.`,
    `A new milestone "${milestone.title}" has been created in your project.${milestone.dueDate ? `\nDue Date: ${milestone.dueDate}` : ''}${milestone.description ? `\nDescription: ${milestone.description}` : ''}`
  );

  return data as ProjectMilestone;
};

export const updateMilestoneStatus = async (
  milestoneId: string,
  status: ProjectMilestone['status']
): Promise<ProjectMilestone> => {
  const { data, error } = await sb
    .from('project_milestones')
    .update({
      status,
      completed_at: status === 'Completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', milestoneId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update milestone: ${error.message}`);

  if (data?.project_id) {
    notifyProjectMembers(
      data.project_id,
      `Milestone ${status}: ${data.title}`,
      `Milestone "${data.title}" was updated to ${status}.`,
      `Milestone "${data.title}" has been marked as ${status}.${data.due_date ? `\nDue Date: ${data.due_date}` : ''}`
    );
  }

  return data as ProjectMilestone;
};

// ---------------------------------------------------------------------------
// PROJECT RESOURCES & DOCUMENTATION
// ---------------------------------------------------------------------------

export const getProjectResources = async (projectId: string): Promise<ProjectResource[]> => {
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    return [];
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return [];

  // Query workspace files for this project
  const { data: dbFiles, error: dbErr } = await sb
    .from('project_files')
    .select('id, name, type, path, content, language, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('type', 'file')
    .order('updated_at', { ascending: false });

  if (dbErr) {
    console.error('[projectService] getProjectResources DB error:', dbErr.message);
    throw new Error(`Unable to load project resources: ${dbErr.message}`);
  }

  const items: ProjectResource[] = (dbFiles || []).map((f: any) => {
    const ext = f.name.split('.').pop()?.toUpperCase() || 'FILE';
    return {
      id: f.id,
      name: f.name,
      type: f.language ? f.language.toUpperCase() : ext,
      path: f.path,
      sizeBytes: f.content ? new Blob([f.content]).size : 0,
      updatedAt: f.updated_at || f.created_at,
      content: f.content,
      source: 'workspace' as const
    };
  });

  // Query uploaded files from project-files storage bucket under project directory if available
  try {
    const { data: storageList, error: stErr } = await supabase.storage
      .from(STORAGE_BUCKETS.PROJECT_FILES)
      .list(projectId);

    if (!stErr && storageList) {
      storageList.forEach((obj: any) => {
        if (obj.name && !obj.name.startsWith('.')) {
          const ext = obj.name.split('.').pop()?.toUpperCase() || 'FILE';
          items.push({
            id: `storage-${projectId}-${obj.name}`,
            name: obj.name,
            type: obj.metadata?.mimetype || ext,
            path: `${projectId}/${obj.name}`,
            sizeBytes: obj.metadata?.size || 0,
            updatedAt: obj.updated_at || obj.created_at || new Date().toISOString(),
            storagePath: `${projectId}/${obj.name}`,
            source: 'storage' as const
          });
        }
      });
    }
  } catch (err) {
    // Storage listing is supplementary
    console.warn('[projectService] Storage listing note:', err);
  }

  return items;
};

// ---------------------------------------------------------------------------
// FACULTY PROJECT MENTORING
// ---------------------------------------------------------------------------

export interface FacultyProjectsStats {
  totalMentored: number;
  totalDepartment: number;
  pendingReview: number;
  active: number;
  completed: number;
  onHold: number;
}

export interface FacultyProjectsResponse {
  mentoredProjects: Project[];
  departmentProjects: Project[];
  allProjects: Project[];
  stats: FacultyProjectsStats;
}

export const getFacultyMentoredProjects = async (): Promise<FacultyProjectsResponse> => {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return {
      mentoredProjects: [],
      departmentProjects: [],
      allProjects: [],
      stats: { totalMentored: 0, totalDepartment: 0, pendingReview: 0, active: 0, completed: 0, onHold: 0 }
    };
  }

  // Retrieve current faculty profile
  const { data: profile } = await sb
    .from('profiles')
    .select('id, full_name, role, department_id, email')
    .eq('id', user.id)
    .single();

  const callerName = (profile?.full_name || '').trim().toLowerCase();
  const callerEmail = (profile?.email || user.email || '').trim().toLowerCase();

  // Query user_projects (RLS automatically scopes to caller's department for FACULTY / HOD)
  let query = sb
    .from('user_projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (profile?.department_id && profile?.role === 'FACULTY') {
    query = query.eq('department_id', profile.department_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[projectService] getFacultyMentoredProjects error:', error.message);
    throw new Error(`Failed to load mentored projects: ${error.message}`);
  }

  const allProjects: Project[] = (data || []).map(dbToProject);

  // Match faculty mentor name or email
  const isMentorMatch = (mentorField?: string | null): boolean => {
    if (!mentorField) return false;
    const mentorNorm = mentorField.trim().toLowerCase();
    if (!mentorNorm) return false;

    // Check email match
    if (callerEmail && mentorNorm === callerEmail) return true;

    // Check full name exact or substring match
    if (callerName) {
      if (mentorNorm === callerName) return true;
      if (mentorNorm.includes(callerName) || callerName.includes(mentorNorm)) return true;
      
      // Token-based check (e.g. "Dr. Alan Turing" matches "Alan Turing")
      const callerTokens = callerName.split(/\s+/).filter((t: string) => t.length > 2);
      const mentorTokens = mentorNorm.split(/\s+/).filter((t: string) => t.length > 2);
      const matchCount = callerTokens.filter((t: string) => mentorTokens.includes(t)).length;
      if (matchCount >= 2 || (callerTokens.length === 1 && matchCount === 1)) return true;
    }

    return false;
  };

  const mentoredProjects = allProjects.filter(p => isMentorMatch(p.faculty_mentor));
  const departmentProjects = allProjects.filter(p => !isMentorMatch(p.faculty_mentor));

  const stats: FacultyProjectsStats = {
    totalMentored: mentoredProjects.length,
    totalDepartment: allProjects.length,
    pendingReview: allProjects.filter(p => p.status === 'Pending Review').length,
    active: allProjects.filter(p => p.status === 'Active').length,
    completed: allProjects.filter(p => p.status === 'Completed').length,
    onHold: allProjects.filter(p => p.status === 'On Hold').length,
  };

  return {
    mentoredProjects,
    departmentProjects,
    allProjects,
    stats,
  };
};

export const updateProjectReviewStatus = async (
  projectId: string,
  status: Project['status'],
  progress?: number
): Promise<Project> => {
  const allowedStatuses: Project['status'][] = ['Active', 'Completed', 'On Hold', 'Pending Review', 'Upcoming'];
  if (!allowedStatuses.includes(status)) {
    throw new Error(`Invalid project status '${status}'. Must be one of: ${allowedStatuses.join(', ')}`);
  }

  const updates: Partial<Project> = { status };
  if (progress !== undefined) {
    if (progress < 0 || progress > 100) {
      throw new Error(`Invalid progress '${progress}'. Must be between 0 and 100.`);
    }
    updates.progress = progress;
  }

  return updateProject(projectId, updates);
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function dbToProject(row: any): Project {
  return {
    id: row.id,
    owner_id: row.owner_id,
    department_id: row.department_id,
    name: row.name,
    description: row.description,
    project_type: row.project_type || 'Personal',
    course_name: row.course_name,
    technology: Array.isArray(row.technology) ? row.technology : [],
    team_members: Array.isArray(row.team_members) ? row.team_members : [],
    deadline: row.deadline,
    status: row.status || 'Active',
    progress: row.progress || 0,
    github_repo_url: row.github_repo_url,
    faculty_mentor: row.faculty_mentor,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

