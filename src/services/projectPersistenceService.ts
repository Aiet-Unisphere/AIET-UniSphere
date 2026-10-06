/**
 * Project Persistence Service — re-exports from the canonical projectService and workspaceService.
 * This file exists for backward compatibility with components that import from projectPersistenceService.
 * ALL data is stored in Supabase. localStorage fallback has been removed.
 */
export {
  getProjects as getUserProjects,
  getPersonalProjects,
  getProjectById,
  createProject,
  updateProject,
  getProjectStats,
} from './projectService';

export {
  getProjectWorkspaceFiles as getProjectFiles,
  createProjectFile,
  updateFileContent as updateProjectFileContent,
  renameProjectFile,
  deleteProjectFile,
} from './workspaceService';

// Re-export types for backward compatibility
export type { Project as UserProject, ProjectTask, ProjectMilestone } from './projectService';
export type { ProjectFileNode } from './workspaceService';
