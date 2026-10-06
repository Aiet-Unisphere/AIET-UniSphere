/**
 * Real Project Service — backed by Supabase user_projects, project_tasks, project_milestones.
 * Uses `sb = supabase as any` for new tables not yet in generated types.
 */
import { supabase } from '../lib/supabase';

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
  return data as ProjectMilestone;
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

