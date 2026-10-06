/**
 * Real Workspace Service — backed by Supabase project_files, project_tasks, project_milestones.
 */
import { supabase } from '../lib/supabase';
import {
  getProjectTasks,
  getProjectMilestones,
  toggleTaskStatus,
  createTask,
  createMilestone,
  updateMilestoneStatus,
  type ProjectTask,
  type ProjectMilestone,
} from './projectService';

export type { ProjectTask, ProjectMilestone };
export { getProjectTasks, getProjectMilestones, toggleTaskStatus, createTask, createMilestone, updateMilestoneStatus };

const sb = supabase as any;

// ---------------------------------------------------------------------------
// PROJECT FILES
// ---------------------------------------------------------------------------

export interface ProjectFileNode {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  type: 'file' | 'folder';
  path: string;
  content: string | null;
  language?: string;
  created_at: string;
  updated_at: string;
  children?: ProjectFileNode[];
}

export const getProjectWorkspaceFiles = async (projectId: string): Promise<ProjectFileNode[]> => {
  const { data, error } = await sb
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('type', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[workspaceService] getProjectWorkspaceFiles error:', error.message);
    throw new Error(`Unable to load project files: ${error.message}`);
  }

  return buildFileTree((data || []) as ProjectFileNode[]);
};

export const createProjectFile = async (
  projectId: string,
  parentId: string | null,
  name: string,
  type: 'file' | 'folder',
  parentPath: string
): Promise<ProjectFileNode> => {
  const path = parentPath ? `${parentPath}/${name}` : name;
  const language = type === 'file' ? detectLanguage(name) : undefined;

  const { data, error } = await sb
    .from('project_files')
    .insert({
      project_id: projectId,
      parent_id: parentId,
      name,
      type,
      path,
      content: type === 'file' ? '' : null,
      language,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create file: ${error.message}`);
  return data as ProjectFileNode;
};

export const updateFileContent = async (fileId: string, content: string): Promise<void> => {
  const { data, error } = await sb
    .from('project_files')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', fileId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to save file: ${error.message}`);
  if (!data) throw new Error('File was not found or you are not allowed to edit it.');
};

export const renameProjectFile = async (fileId: string, newName: string, newPath: string): Promise<void> => {
  const { data, error } = await sb
    .from('project_files')
    .update({ name: newName, path: newPath, updated_at: new Date().toISOString() })
    .eq('id', fileId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to rename file: ${error.message}`);
  if (!data) throw new Error('File was not found or you are not allowed to rename it.');
};

export const deleteProjectFile = async (fileId: string, projectId: string): Promise<void> => {
  const { data: allFiles, error: filesError } = await sb
    .from('project_files')
    .select('id, parent_id, type')
    .eq('project_id', projectId);
  if (filesError) throw new Error(`Failed to inspect project file tree: ${filesError.message}`);

  const idsToDelete = [fileId];
  const findDescendants = (parentId: string) => {
    (allFiles || []).filter((f: any) => f.parent_id === parentId).forEach((child: any) => {
      idsToDelete.push(child.id);
      if (child.type === 'folder') findDescendants(child.id);
    });
  };

  const target = (allFiles || []).find((f: any) => f.id === fileId);
  if (target?.type === 'folder') findDescendants(fileId);

  const { data, error } = await sb
    .from('project_files')
    .delete()
    .in('id', idsToDelete)
    .select('id');

  if (error) throw new Error(`Failed to delete file: ${error.message}`);
  if (!data?.length) throw new Error('File was not found or you are not allowed to delete it.');
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const detectLanguage = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    'ts': 'typescript', 'tsx': 'typescript', 'js': 'javascript', 'jsx': 'javascript',
    'css': 'css', 'html': 'html', 'json': 'json', 'md': 'markdown',
    'py': 'python', 'java': 'java', 'cpp': 'cpp', 'c': 'c',
    'rs': 'rust', 'go': 'go', 'rb': 'ruby', 'php': 'php',
    'sql': 'sql', 'yaml': 'yaml', 'yml': 'yaml', 'xml': 'xml',
    'txt': 'text', 'sh': 'shell', 'bash': 'shell'
  };
  return map[ext] || 'text';
};

const buildFileTree = (flatFiles: ProjectFileNode[]): ProjectFileNode[] => {
  const map = new Map<string, ProjectFileNode & { children?: ProjectFileNode[] }>();
  const roots: (ProjectFileNode & { children?: ProjectFileNode[] })[] = [];

  flatFiles.forEach(f => {
    map.set(f.id, { ...f, children: f.type === 'folder' ? [] : undefined });
  });

  flatFiles.forEach(f => {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      const parent = map.get(f.parent_id)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: (ProjectFileNode & { children?: ProjectFileNode[] })[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => { if (n.children) sortNodes(n.children); });
  };
  sortNodes(roots);

  return roots as ProjectFileNode[];
};
