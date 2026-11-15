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
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    throw new Error('Project identifier is required.');
  }

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

/**
 * Ensures a project has an initialized workspace with starter files.
 * Reuses existing files if already present to prevent duplicate records.
 */
export const initializeProjectWorkspace = async (
  projectId: string,
  projectInfo?: { name?: string; description?: string | null; technology?: string[] }
): Promise<ProjectFileNode[]> => {
  if (!projectId) throw new Error('Project identifier is required to initialize workspace.');

  // Check if workspace already has files
  const { data: existingFiles, error: checkError } = await sb
    .from('project_files')
    .select('id')
    .eq('project_id', projectId)
    .limit(1);

  if (checkError) {
    console.error('[workspaceService] Check existing files error:', checkError.message);
    throw new Error(`Unable to verify workspace files: ${checkError.message}`);
  }

  if (existingFiles && existingFiles.length > 0) {
    // Re-use existing workspace
    return await getProjectWorkspaceFiles(projectId);
  }

  const projectName = projectInfo?.name || 'Project';
  const description = projectInfo?.description || 'AIET-UniSphere Student Project Workspace';
  const techList = projectInfo?.technology && projectInfo.technology.length > 0
    ? projectInfo.technology.map(t => `- ${t}`).join('\n')
    : '- General Engineering';

  const readmeContent = `# ${projectName}

${description}

## Technology Stack
${techList}

## Getting Started
Welcome to **UniSphere Code Studio**. Use the File Explorer on the left to create and manage files, and edit code with syntax highlighting and automatic saving.
`;

  // Determine initial code template based on technology
  const techLower = (projectInfo?.technology || []).map(t => t.toLowerCase()).join(' ');
  let starterFileName = 'index.js';
  let starterContent = `// ${projectName} — Entry Point\nconsole.log("Welcome to ${projectName} on UniSphere Code Studio!");\n`;

  if (techLower.includes('python') || techLower.includes('django') || techLower.includes('flask') || techLower.includes('fastapi') || techLower.includes('ai') || techLower.includes('ml')) {
    starterFileName = 'main.py';
    starterContent = `# ${projectName} — Main Script\ndef main():\n    print("Welcome to ${projectName} on UniSphere Code Studio!")\n\nif __name__ == "__main__":\n    main()\n`;
  } else if (techLower.includes('java') || techLower.includes('spring')) {
    starterFileName = 'Main.java';
    starterContent = `// ${projectName}\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Welcome to ${projectName}!");\n    }\n}\n`;
  } else if (techLower.includes('c++') || techLower.includes('cpp')) {
    starterFileName = 'main.cpp';
    starterContent = `// ${projectName}\n#include <iostream>\n\nint main() {\n    std::cout << "Welcome to ${projectName}!" << std::endl;\n    return 0;\n}\n`;
  } else if (techLower.includes('c') && !techLower.includes('css')) {
    starterFileName = 'main.c';
    starterContent = `// ${projectName}\n#include <stdio.h>\n\nint main() {\n    printf("Welcome to ${projectName}!\\n");\n    return 0;\n}\n`;
  } else if (techLower.includes('html') || techLower.includes('css') || techLower.includes('frontend') || techLower.includes('web')) {
    starterFileName = 'index.html';
    starterContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${projectName}</title>\n  <style>\n    body { font-family: system-ui, sans-serif; padding: 2rem; }\n  </style>\n</head>\n<body>\n  <h1>${projectName}</h1>\n  <p>${description}</p>\n</body>\n</html>\n`;
  } else if (techLower.includes('typescript') || techLower.includes('ts')) {
    starterFileName = 'index.ts';
    starterContent = `// ${projectName}\nconst projectName: string = "${projectName}";\nconsole.log(\`Welcome to \${projectName}!\`);\n`;
  }

  const initialItems = [
    {
      project_id: projectId,
      parent_id: null,
      name: 'README.md',
      type: 'file',
      path: 'README.md',
      content: readmeContent,
      language: 'markdown'
    },
    {
      project_id: projectId,
      parent_id: null,
      name: starterFileName,
      type: 'file',
      path: starterFileName,
      content: starterContent,
      language: detectLanguage(starterFileName)
    }
  ];

  const { error: insertError } = await sb
    .from('project_files')
    .insert(initialItems);

  if (insertError) {
    console.error('[workspaceService] initializeProjectWorkspace insert error:', insertError.message);
    // If insert fails due to race condition, try loading existing files
    return await getProjectWorkspaceFiles(projectId);
  }

  return await getProjectWorkspaceFiles(projectId);
};

export const validatePathSafety = (name: string, path: string): void => {
  if (!name || name.trim() === '') {
    throw new Error('Name cannot be empty.');
  }
  if (name.includes('..') || path.includes('..')) {
    throw new Error('Path cannot contain relative traversal sequences (..).');
  }
  if (/[\0<>:"|?*]/.test(name)) {
    throw new Error('Name contains invalid characters.');
  }
};

export const createProjectFile = async (
  projectId: string,
  parentId: string | null,
  name: string,
  type: 'file' | 'folder',
  parentPath: string
): Promise<ProjectFileNode> => {
  const cleanName = name.trim();
  const path = parentPath ? `${parentPath}/${cleanName}` : cleanName;
  validatePathSafety(cleanName, path);

  const language = type === 'file' ? detectLanguage(cleanName) : undefined;

  const { data, error } = await sb
    .from('project_files')
    .insert({
      project_id: projectId,
      parent_id: parentId,
      name: cleanName,
      type,
      path,
      content: type === 'file' ? '' : null,
      language,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create ${type}: ${error.message}`);
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

export const renameProjectFile = async (
  fileId: string,
  newName: string,
  newPath: string,
  projectId?: string
): Promise<void> => {
  const cleanName = newName.trim();
  validatePathSafety(cleanName, newPath);

  // Check if target is a folder to cascade path updates to descendants
  const { data: targetNode, error: fetchErr } = await sb
    .from('project_files')
    .select('id, type, path, project_id')
    .eq('id', fileId)
    .single();

  if (fetchErr || !targetNode) {
    throw new Error('File was not found or you are not allowed to rename it.');
  }

  const oldPath = targetNode.path;

  const { data, error } = await sb
    .from('project_files')
    .update({ name: cleanName, path: newPath, updated_at: new Date().toISOString() })
    .eq('id', fileId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to rename file: ${error.message}`);
  if (!data) throw new Error('File was not found or you are not allowed to rename it.');

  // If folder, update paths of all children whose path starts with oldPath/
  if (targetNode.type === 'folder' && targetNode.project_id) {
    const { data: children } = await sb
      .from('project_files')
      .select('id, path')
      .eq('project_id', targetNode.project_id);

    if (children && children.length > 0) {
      const prefix = `${oldPath}/`;
      for (const child of children) {
        if (child.path.startsWith(prefix)) {
          const updatedChildPath = `${newPath}/${child.path.slice(prefix.length)}`;
          await sb
            .from('project_files')
            .update({ path: updatedChildPath, updated_at: new Date().toISOString() })
            .eq('id', child.id);
        }
      }
    }
  }
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

export const detectLanguage = (filename: string): string => {
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

export const mapToMonacoLanguage = (filenameOrLang: string): string => {
  const clean = filenameOrLang.toLowerCase();
  const ext = clean.includes('.') ? (clean.split('.').pop() || '') : clean;
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    typescript: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    javascript: 'javascript',
    css: 'css',
    scss: 'css',
    less: 'css',
    html: 'html',
    htm: 'html',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    py: 'python',
    python: 'python',
    java: 'java',
    cpp: 'cpp',
    'c++': 'cpp',
    cc: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    txt: 'plaintext',
    text: 'plaintext'
  };
  return map[ext] || 'plaintext';
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
