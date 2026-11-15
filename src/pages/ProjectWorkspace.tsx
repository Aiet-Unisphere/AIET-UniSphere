import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FolderGit2, ArrowLeft,
  CheckCircle2, Save, RefreshCw,
  Search, X, FilePlus, FolderPlus,
  Terminal as TerminalIcon, AlertCircle, Plus,
  ChevronRight, ExternalLink, Code2, Sparkles, BookOpen,
  Play, Square, FolderUp
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { WorkspaceActivityBar, type ActivityBarTab } from '../components/WorkspaceActivityBar';
import { WorkspaceFileExplorer, type FileTreeNode } from '../components/WorkspaceFileExplorer';
import { WorkspaceEditor, type OpenTab } from '../components/WorkspaceEditor';
import { WorkspaceBottomPanel, type BottomPanelTab } from '../components/WorkspaceBottomPanel';
import { WorkspaceStatusBar } from '../components/WorkspaceStatusBar';
import { WorkspaceImportModal } from '../components/WorkspaceImportModal';
import { WorkspaceAcademicPanels } from '../components/WorkspaceAcademicPanels';
import { supabase } from '../lib/supabase';
import {
  executeCode,
  stopCodeExecution,
  parseCompilationProblems,
  generateSandboxedPreviewHtml,
  type ExecutionResponse,
  type DiagnosticProblem
} from '../services/executionService';
import {
  getPersonalProjects,
  getProjectById,
  type Project
} from '../services/projectService';
import {
  getProjectWorkspaceFiles,
  initializeProjectWorkspace,
  updateFileContent,
  createProjectFile,
  renameProjectFile,
  deleteProjectFile,
  type ProjectFileNode,
} from '../services/workspaceService';

const convertProjectFilesToNodes = (files: ProjectFileNode[]): FileTreeNode[] => files.map(file => ({
  id: file.id,
  name: file.name,
  type: file.type,
  path: file.path,
  language: file.language,
  content: file.content ?? '',
  parent_id: file.parent_id,
  children: file.children ? convertProjectFilesToNodes(file.children) : undefined,
}));

// Flatten tree to easily search file contents and names
const flattenTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
  let list: FileTreeNode[] = [];
  for (const n of nodes) {
    list.push(n);
    if (n.children && n.children.length > 0) {
      list = list.concat(flattenTree(n.children));
    }
  }
  return list;
};

export const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Project and Auth State
  const [project, setProject] = useState<Project | null>(null);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [lastActiveId, setLastActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'not-found' | 'access-denied' | 'general' | null>(null);

  // Layout and View State
  const [activeActivityTab, setActiveActivityTab] = useState<ActivityBarTab>('explorer');
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Workspace Files & Tabs State
  const [treeFiles, setTreeFiles] = useState<FileTreeNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<OpenTab | null>(null);

  // Status and Output Logs
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [outputLogs, setOutputLogs] = useState<string[]>([]);

  // Execution & Preview State
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResponse | null>(null);
  const [problems, setProblems] = useState<DiagnosticProblem[]>([]);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomPanelTab>('output');
  const [previewHtml, setPreviewHtml] = useState<string | undefined>(undefined);

  // Search view state
  const [searchQuery, setSearchQuery] = useState('');

  // Prompt modal state (Create / Rename / Delete)
  const [promptMode, setPromptMode] = useState<'create-file' | 'create-folder' | 'rename' | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptTarget, setPromptTarget] = useState<{ parentId: string | null; parentPath: string; file?: FileTreeNode } | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileTreeNode | null>(null);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Autosave Debounce Ref
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setOutputLogs(prev => [...prev, `[${time}] ${message}`]);
  }, []);

  // 1. LOAD WORKSPACE OR EMPTY STATE
  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorType(null);

    // If no project ID in URL, check if we should show available projects list
    if (!id) {
      try {
        const cachedId = sessionStorage.getItem('unisphere_active_project_id');
        if (cachedId) {
          setLastActiveId(cachedId);
        }
        const myProjects = await getPersonalProjects();
        setAvailableProjects(myProjects);
      } catch (err: any) {
        console.warn('[ProjectWorkspace] Could not load available projects:', err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Save active project id for session refresh persistence
    try {
      sessionStorage.setItem('unisphere_active_project_id', id);
    } catch (e) {
      // Ignore quota errors
    }

    try {
      // Verify user authentication
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Authentication session required to access UniSphere Code Studio.');
      }

      // Fetch project details
      const projectData = await getProjectById(id);
      if (!projectData) {
        setErrorType('not-found');
        throw new Error('Project workspace not found. The project identifier may be invalid or the project has been deleted.');
      }

      // Verify user authorization: owner, team member, or admin
      const isOwner = projectData.owner_id === user.id;
      const isMember = (projectData.team_members || []).some((m: any) => m.userId === user.id || m.name === user.email);
      
      // Check role
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const isAdmin = profile?.role === 'ADMIN';

      if (!isOwner && !isMember && !isAdmin) {
        setErrorType('access-denied');
        throw new Error('Access Denied: You are not authorized to view or edit this project workspace.');
      }

      setProject(projectData);

      // Initialize or load existing workspace files
      const rawFiles = await initializeProjectWorkspace(id, {
        name: projectData.name,
        description: projectData.description,
        technology: projectData.technology
      });

      const nodes = convertProjectFilesToNodes(rawFiles);
      setTreeFiles(nodes);

      addLog(`Workspace loaded for project "${projectData.name}"`);

      // Auto-open primary file if no tabs open
      const flat = flattenTree(nodes);
      const initialFile = flat.find(f => f.type === 'file' && f.name.toLowerCase().includes('readme')) ||
                          flat.find(f => f.type === 'file') || null;

      if (initialFile) {
        const tab: OpenTab = {
          ...initialFile,
          isDirty: false,
          savedContent: initialFile.content || ''
        };
        setOpenTabs([tab]);
        setActiveTab(tab);
      }
    } catch (err: any) {
      console.error('[ProjectWorkspace] Load error:', err);
      setError(err.message || 'Unable to load project workspace.');
    } finally {
      setIsLoading(false);
    }
  }, [id, addLog]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Clean up autosave timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  // 2. FILE SELECTION & TAB MANAGEMENT
  const handleSelectFile = async (file: FileTreeNode) => {
    if (file.type === 'folder') return;

    const existing = openTabs.find(t => t.id === file.id);
    if (existing) {
      setActiveTab(existing);
      return;
    }

    const newTab: OpenTab = {
      ...file,
      content: file.content || '',
      savedContent: file.content || '',
      isDirty: false
    };

    setOpenTabs(prev => [...prev, newTab]);
    setActiveTab(newTab);
    addLog(`Opened file "${file.name}"`);
  };

  const handleCloseTab = (tabToClose: OpenTab, e: React.MouseEvent) => {
    e.stopPropagation();

    // If dirty, confirm with user
    if (tabToClose.isDirty) {
      const confirmDiscard = window.confirm(`File "${tabToClose.name}" has unsaved changes. Discard changes and close?`);
      if (!confirmDiscard) return;
    }

    const nextTabs = openTabs.filter(t => t.id !== tabToClose.id);
    setOpenTabs(nextTabs);

    if (activeTab?.id === tabToClose.id) {
      setActiveTab(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null);
    }
  };

  // 3. EDITOR CONTENT CHANGE & AUTOSAVE
  const handleContentChange = (newContent: string) => {
    if (!activeTab) return;

    const isDirty = newContent !== (activeTab.savedContent ?? '');
    const updatedTab: OpenTab = {
      ...activeTab,
      content: newContent,
      isDirty
    };

    setActiveTab(updatedTab);
    setOpenTabs(prev => prev.map(t => t.id === activeTab.id ? updatedTab : t));
    setSaveStatus(isDirty ? 'dirty' : 'saved');

    // Debounced Autosave (1500ms debounce)
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    if (isDirty) {
      autosaveTimerRef.current = setTimeout(() => {
        executeSave(updatedTab);
      }, 1500);
    }
  };

  // 4. PERSISTENT FILE SAVE (Ctrl+S or Autosave)
  const executeSave = async (tabToSave?: OpenTab) => {
    const target = tabToSave || activeTab;
    if (!target) return;

    // Clear any pending timer
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setSaveStatus('saving');
    try {
      await updateFileContent(target.id, target.content || '');

      const savedTab: OpenTab = {
        ...target,
        savedContent: target.content || '',
        isDirty: false
      };

      setActiveTab(prev => prev?.id === target.id ? savedTab : prev);
      setOpenTabs(prev => prev.map(t => t.id === target.id ? savedTab : t));
      
      // Update tree files in memory
      setTreeFiles(prev => {
        const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map(n => {
            if (n.id === target.id) {
              return { ...n, content: target.content || '' };
            }
            if (n.children) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        };
        return updateNode(prev);
      });

      setSaveStatus('saved');
      addLog(`Saved "${target.name}"`);
    } catch (err: any) {
      console.error('[ProjectWorkspace] Save failed:', err);
      setSaveStatus('error');
      addLog(`Error saving "${target.name}": ${err.message || 'Unknown error'}`);
    }
  };

  // 5. RUN CODE / LIVE PREVIEW
  const handleRunCode = async () => {
    if (isExecuting) return;
    if (!activeTab) {
      addLog('Select a source file to run.');
      return;
    }

    // Ensure active file is saved before execution
    if (activeTab.isDirty) {
      await executeSave();
    }

    const ext = activeTab.name.split('.').pop()?.toLowerCase();

    // HTML Web Project Preview
    if (ext === 'html' || ext === 'htm') {
      const bundled = generateSandboxedPreviewHtml(activeTab, treeFiles);
      setPreviewHtml(bundled);
      setActiveBottomTab('preview');
      setIsBottomPanelOpen(true);
      addLog(`Rendered web preview for "${activeTab.name}"`);
      return;
    }

    // Map file extension to supported backend execution runtimes
    let lang: 'python' | 'javascript' | 'java' | 'c' | 'cpp' | null = null;
    if (ext === 'py') lang = 'python';
    else if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') lang = 'javascript';
    else if (ext === 'java') lang = 'java';
    else if (ext === 'c') lang = 'c';
    else if (ext === 'cpp' || ext === 'cc' || ext === 'cxx') lang = 'cpp';

    if (!lang) {
      addLog(`File type ".${ext}" cannot be executed directly. Supported languages: Python, JavaScript, Java, C, C++, HTML.`);
      return;
    }

    setIsExecuting(true);
    setActiveBottomTab('output');
    setIsBottomPanelOpen(true);
    addLog(`Running ${activeTab.name} (${lang})...`);

    // Gather all workspace files for multi-file projects / compilation
    const allFlat = flattenTree(treeFiles).filter(f => f.type === 'file');
    const filesPayload = allFlat.map(f => ({
      path: f.path || f.name,
      content: f.id === activeTab.id ? (activeTab.content || '') : (f.content || '')
    }));

    try {
      const res = await executeCode({
        projectId: id || project?.id || '',
        entryFilePath: activeTab.path || activeTab.name,
        files: filesPayload,
        language: lang,
      });

      setExecutionResult(res);

      if (res.stderr) {
        const diagProblems = parseCompilationProblems(res.stderr, lang);
        setProblems(diagProblems);
        if (diagProblems.length > 0) {
          setActiveBottomTab('problems');
        }
      } else {
        setProblems([]);
      }

      if (res.success) {
        addLog(`Execution completed successfully (exit code 0 in ${res.executionDurationMs}ms).`);
      } else if (res.timedOut) {
        addLog(`Execution timed out after 10 seconds.`);
      } else {
        addLog(`Execution finished with errors (exit code ${res.exitCode ?? 'N/A'}).`);
      }
    } catch (err: any) {
      addLog(`Execution failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleStopCode = async () => {
    if (!isExecuting) return;
    await stopCodeExecution(id || project?.id || '');
    setIsExecuting(false);
    addLog('Execution stopped by user.');
  };

  const handleRefreshPreview = () => {
    if (activeTab && (activeTab.name.endsWith('.html') || activeTab.name.endsWith('.htm'))) {
      const bundled = generateSandboxedPreviewHtml(activeTab, treeFiles);
      setPreviewHtml(bundled);
      addLog(`Preview refreshed for "${activeTab.name}"`);
    }
  };

  // 6. FILE & FOLDER OPERATIONS (Create, Rename, Delete)
  const handleOpenCreatePrompt = (parentId: string | null, parentPath: string, type: 'file' | 'folder') => {
    setPromptMode(type === 'file' ? 'create-file' : 'create-folder');
    setPromptTarget({ parentId, parentPath });
    setPromptValue('');
    setPromptError(null);
  };

  const handleOpenRenamePrompt = (file: FileTreeNode) => {
    setPromptMode('rename');
    setPromptTarget({ parentId: null, parentPath: '', file });
    setPromptValue(file.name);
    setPromptError(null);
  };

  const handleOpenDeleteConfirm = (file: FileTreeNode) => {
    setConfirmDelete(file);
  };

  const executePromptAction = async () => {
    if (!promptValue.trim()) {
      setPromptError('Name cannot be empty.');
      return;
    }

    const cleanName = promptValue.trim();
    if (!id) return;

    try {
      if (promptMode === 'create-file') {
        const created = await createProjectFile(
          id,
          promptTarget?.parentId || null,
          cleanName,
          'file',
          promptTarget?.parentPath || ''
        );

        const newNodes = convertProjectFilesToNodes([created])[0];
        await reloadFileTree();
        await handleSelectFile(newNodes);
        addLog(`Created file "${cleanName}"`);
      } else if (promptMode === 'create-folder') {
        await createProjectFile(
          id,
          promptTarget?.parentId || null,
          cleanName,
          'folder',
          promptTarget?.parentPath || ''
        );
        await reloadFileTree();
        addLog(`Created folder "${cleanName}"`);
      } else if (promptMode === 'rename' && promptTarget?.file) {
        const oldFile = promptTarget.file;
        const filePathStr = oldFile.path || oldFile.name;
        const parentPath = filePathStr.includes('/') 
          ? filePathStr.substring(0, filePathStr.lastIndexOf('/')) 
          : '';
        const newPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;

        await renameProjectFile(oldFile.id, cleanName, newPath, id);
        await reloadFileTree();

        // Update tabs
        setOpenTabs(prev => prev.map(t => t.id === oldFile.id ? { ...t, name: cleanName, path: newPath } : t));
        if (activeTab?.id === oldFile.id) {
          setActiveTab(prev => prev ? { ...prev, name: cleanName, path: newPath } : null);
        }
        addLog(`Renamed "${oldFile.name}" to "${cleanName}"`);
      }

      setPromptMode(null);
      setPromptTarget(null);
      setPromptValue('');
    } catch (err: any) {
      setPromptError(err.message || 'File operation failed.');
    }
  };

  const executeDeleteAction = async () => {
    if (!confirmDelete || !id) return;

    try {
      await deleteProjectFile(confirmDelete.id, id);

      // Close tab if open
      setOpenTabs(prev => prev.filter(t => t.id !== confirmDelete.id));
      if (activeTab?.id === confirmDelete.id) {
        const remaining = openTabs.filter(t => t.id !== confirmDelete.id);
        setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1] : null);
      }

      await reloadFileTree();
      addLog(`Deleted "${confirmDelete.name}"`);
    } catch (err: any) {
      addLog(`Failed to delete "${confirmDelete.name}": ${err.message}`);
      alert(`Delete failed: ${err.message}`);
    } finally {
      setConfirmDelete(null);
    }
  };

  const reloadFileTree = async () => {
    if (!id) return;
    try {
      const freshFiles = await getProjectWorkspaceFiles(id);
      setTreeFiles(convertProjectFilesToNodes(freshFiles));
    } catch (err: any) {
      console.error('[ProjectWorkspace] reloadFileTree error:', err);
    }
  };

  // Academic Documentation & Workspace File Sync
  const handleSaveAcademicFile = async (filePath: string, content: string) => {
    if (!id) return;
    const allFiles = flattenTree(treeFiles).filter(f => f.type === 'file');
    const existing = allFiles.find(
      f => (f.path || f.name).toLowerCase() === filePath.toLowerCase() || f.name.toLowerCase() === filePath.toLowerCase()
    );

    if (existing) {
      await updateFileContent(existing.id, content);
      setTreeFiles(prev => {
        const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map(n => {
            if (n.id === existing.id) return { ...n, content };
            if (n.children) return { ...n, children: updateNode(n.children) };
            return n;
          });
        };
        return updateNode(prev);
      });
      setOpenTabs(prev =>
        prev.map(t => (t.id === existing.id ? { ...t, content, savedContent: content, isDirty: false } : t))
      );
      if (activeTab?.id === existing.id) {
        setActiveTab(prev => (prev ? { ...prev, content, savedContent: content, isDirty: false } : null));
      }
      addLog(`Updated "${filePath}" in workspace`);
    } else {
      const created = await createProjectFile(id, null, filePath, 'file', '');
      await updateFileContent(created.id, content);
      await reloadFileTree();
      addLog(`Created and saved "${filePath}" in workspace`);
    }
  };

  const handleNavigateToFile = (filePath: string) => {
    const allFiles = flattenTree(treeFiles).filter(f => f.type === 'file');
    const match = allFiles.find(
      f => (f.path || f.name).toLowerCase() === filePath.toLowerCase() || f.name.toLowerCase() === filePath.toLowerCase()
    );
    if (match) {
      handleSelectFile(match);
      setActiveActivityTab('explorer');
    }
  };

  // 6. RENDER EMPTY STATE IF ACCESSED WITHOUT PROJECT ID
  if (!id) {
    return (
      <AppShell>
        <div className="page-header-container" style={{ marginBottom: '1.5rem' }}>
          <div>
            <div className="breadcrumbs">
              <span>Development</span>
              <span className="breadcrumbs-separator">/</span>
              <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>UniSphere Code Studio</span>
            </div>
            <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0.25rem 0 0' }}>
              UniSphere Code Studio
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
              Full-featured browser IDE for AIET engineering and research projects
            </p>
          </div>

          <button
            onClick={() => navigate('/student/projects/my')}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', width: 'auto' }}
          >
            <span>Go to My Projects</span>
            <ArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>

        {/* Empty State Banner */}
        <div
          className="dashboard-panel"
          style={{
            textAlign: 'center',
            padding: '3.5rem 2rem',
            maxWidth: '780px',
            margin: '0 auto 2rem',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--border-radius)',
            border: '1px solid rgba(156, 163, 175, 0.25)'
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              backgroundColor: '#FEF3C7',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}
          >
            <Code2 size={36} />
          </div>

          <h2 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
            No Active Project Workspace
          </h2>

          <p style={{ fontSize: '0.95rem', color: 'var(--brand-dark-grey)', maxWidth: '520px', margin: '0.75rem auto 1.5rem', lineHeight: 1.6 }}>
            Select an existing project from your portfolio to launch its Code Studio workspace, edit files with Monaco syntax highlighting, and develop your project.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {lastActiveId && (
              <button
                onClick={() => navigate(`/student/projects/${lastActiveId}/workspace`)}
                className="btn btn-primary"
                style={{ padding: '0.65rem 1.25rem', fontWeight: 700, backgroundColor: 'var(--brand-orange)', borderColor: 'var(--brand-orange)' }}
              >
                Resume Recent Workspace
              </button>
            )}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="btn btn-primary font-sans"
              style={{
                padding: '0.65rem 1.25rem',
                fontWeight: 700,
                backgroundColor: '#2563EB',
                borderColor: '#2563EB',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <FolderUp size={16} />
              <span>Import Existing Project</span>
            </button>
            <button
              onClick={() => navigate('/student/projects/my')}
              className={lastActiveId ? "btn btn-secondary" : "btn btn-primary"}
              style={{ padding: '0.65rem 1.25rem', fontWeight: 700 }}
            >
              Browse My Projects
            </button>
            <button
              onClick={() => navigate('/student/projects')}
              className="btn btn-secondary"
              style={{ padding: '0.65rem 1.25rem' }}
            >
              View All Projects
            </button>
          </div>
        </div>

        {/* Available Workspaces List */}
        {availableProjects.length > 0 && (
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FolderGit2 size={18} style={{ color: 'var(--brand-blue)' }} />
              <span>Available Project Workspaces ({availableProjects.length})</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {availableProjects.map((p) => (
                <div
                  key={p.id}
                  className="dashboard-panel"
                  style={{
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1px solid rgba(156, 163, 175, 0.25)',
                    borderRadius: 'var(--border-radius)',
                    backgroundColor: '#FFFFFF'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span className="badge badge-active font-mono" style={{ fontSize: '0.75rem' }}>
                        {p.project_type}
                      </span>
                      <span className="badge font-mono" style={{ fontSize: '0.7rem', backgroundColor: '#F1F5F9', color: '#475569' }}>
                        {p.status}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--brand-black)', margin: '0 0 0.35rem' }}>
                      {p.name}
                    </h4>

                    <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', lineHeight: 1.5, margin: 0, maxHeight: '2.8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.description || 'No description provided.'}
                    </p>

                    {/* Tech Badges */}
                    {p.technology && p.technology.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '0.75rem' }}>
                        {p.technology.slice(0, 3).map((t, idx) => (
                          <span key={idx} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#EFF6FF', color: '#1E40AF', fontWeight: 600 }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => navigate(`/student/projects/${p.id}/workspace`)}
                    className="btn btn-primary"
                    style={{ marginTop: '1.25rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                  >
                    <TerminalIcon size={15} />
                    <span>Open Code Studio</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <WorkspaceImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={(newId) => {
            setIsImportModalOpen(false);
            navigate(`/student/projects/${newId}/workspace`);
          }}
        />
      </AppShell>
    );
  }

  // 7. LOADING STATE
  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading UniSphere Code Studio workspace..." />
      </AppShell>
    );
  }

  // 8. ERROR STATE
  if (error || !project) {
    return (
      <AppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem', maxWidth: '600px', margin: '3rem auto' }}>
          <AlertCircle size={48} style={{ color: errorType === 'access-denied' ? '#D97706' : '#EF4444', margin: '0 auto 1rem' }} />
          
          <h2 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)' }}>
            {errorType === 'access-denied' ? 'Access Denied' : 'Project Workspace Not Found'}
          </h2>

          <p style={{ color: 'var(--brand-dark-grey)', marginTop: '0.5rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
            {error || 'Unable to open the requested project workspace.'}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              onClick={() => navigate('/student/projects/my')}
              className="btn btn-primary font-sans"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <ArrowLeft size={16} />
              <span>Back to My Projects</span>
            </button>
            <button
              onClick={loadWorkspace}
              className="btn btn-secondary font-sans"
            >
              Retry
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  // Flatten tree for live file search
  const allFlatFiles = flattenTree(treeFiles).filter(f => f.type === 'file');
  const searchResults = searchQuery.trim() === '' ? [] : allFlatFiles.filter(f => {
    const q = searchQuery.toLowerCase();
    const nameMatch = f.name.toLowerCase().includes(q);
    const contentMatch = (f.content || '').toLowerCase().includes(q);
    return nameMatch || contentMatch;
  });

  return (
    <AppShell>
      {/* Top Header / Breadcrumb Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => navigate(`/student/projects/${project.id}`)}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Back to Project Details"
          >
            <ArrowLeft size={14} />
            <span>Details</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="badge badge-active font-mono" style={{ fontSize: '0.75rem' }}>
              CODE STUDIO
            </span>
            <span style={{ fontWeight: 800, color: 'var(--brand-black)', fontSize: '1.05rem' }}>
              {project.name}
            </span>
            <span style={{ color: 'var(--brand-dark-grey)', fontSize: '0.8rem' }}>
              ({project.project_type})
            </span>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Run Button */}
          <button
            onClick={handleRunCode}
            disabled={isExecuting}
            className="btn btn-primary"
            style={{
              width: 'auto',
              padding: '0.35rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#16A34A',
              borderColor: '#16A34A',
              opacity: isExecuting ? 0.7 : 1,
              cursor: isExecuting ? 'not-allowed' : 'pointer'
            }}
            title="Run Active File (Ctrl+Enter)"
          >
            <Play size={13} style={{ fill: '#FFFFFF' }} />
            <span>Run</span>
          </button>

          {/* Stop Button (Active when executing) */}
          {isExecuting && (
            <button
              onClick={handleStopCode}
              className="btn btn-secondary"
              style={{
                width: 'auto',
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: '#EF4444',
                color: '#FFFFFF',
                borderColor: '#EF4444',
              }}
              title="Stop Running Process"
            >
              <Square size={13} style={{ fill: '#FFFFFF' }} />
              <span>Stop</span>
            </button>
          )}

          <button
            onClick={() => executeSave()}
            disabled={saveStatus !== 'dirty'}
            className="btn btn-primary"
            style={{
              width: 'auto',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              opacity: saveStatus === 'dirty' ? 1 : 0.6
            }}
            title="Save Active File (Ctrl+S)"
          >
            <Save size={14} />
            <span>Save</span>
          </button>

          <button
            onClick={reloadFileTree}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Reload Workspace Files"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Import Folder or ZIP Archive into Project"
          >
            <FolderUp size={13} />
            <span>Import</span>
          </button>
        </div>
      </div>

      {/* Main IDE Window */}
      <div 
        className="ide-workspace-outer"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 170px)',
          minHeight: '520px',
          backgroundColor: editorTheme === 'vs-dark' ? '#1e1e1e' : '#FFFFFF',
          borderRadius: 'var(--border-radius)',
          border: editorTheme === 'vs-dark' ? '1px solid #333333' : '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: 'var(--box-shadow-lg)'
        }}
      >
        {/* IDE Center Body (Activity Bar + Sidebar + Editor) */}
        <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
          {/* 1. Activity Bar */}
          <WorkspaceActivityBar
            activeTab={activeActivityTab}
            onSelectTab={setActiveActivityTab}
            editorTheme={editorTheme}
            onToggleTheme={() => setEditorTheme(prev => prev === 'vs-dark' ? 'light' : 'vs-dark')}
          />

          {/* 2. Side Panel (Explorer, Search, Git, Academic Suites) */}
          <div
            style={{
              width: '290px',
              backgroundColor: editorTheme === 'vs-dark' ? '#1E293B' : '#F8FAFC',
              borderRight: editorTheme === 'vs-dark' ? '1px solid #334155' : '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              overflow: 'hidden'
            }}
          >
            {activeActivityTab === 'explorer' && (
              <WorkspaceFileExplorer
                files={treeFiles}
                activeFile={activeTab?.id || activeTab?.name || ''}
                projectName={project.name}
                onSelectFile={handleSelectFile}
                onCreateFile={handleOpenCreatePrompt}
                onRenameFile={handleOpenRenamePrompt}
                onDeleteFile={handleOpenDeleteConfirm}
                onRefresh={reloadFileTree}
              />
            )}

            {activeActivityTab === 'search' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.75rem', color: editorTheme === 'vs-dark' ? '#CCCCCC' : '#0F172A' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem', color: '#888888' }}>
                  SEARCH IN FILES
                </span>
                <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                  <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: '#888888' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search file names or code..."
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.5rem 0.4rem 1.75rem',
                      fontSize: '0.8rem',
                      backgroundColor: editorTheme === 'vs-dark' ? '#3C3C3C' : '#FFFFFF',
                      border: editorTheme === 'vs-dark' ? '1px solid #555' : '1px solid #CBD5E1',
                      borderRadius: '4px',
                      color: 'inherit'
                    }}
                  />
                </div>

                <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                  {searchQuery.trim() === '' ? (
                    <p style={{ fontSize: '0.75rem', color: '#888888', margin: 0 }}>Type above to search files and text in the workspace.</p>
                  ) : searchResults.length === 0 ? (
                    <p style={{ fontSize: '0.75rem', color: '#888888', margin: 0 }}>No matching files found.</p>
                  ) : (
                    searchResults.map(f => (
                      <div
                        key={f.id}
                        onClick={() => handleSelectFile(f)}
                        style={{
                          padding: '0.4rem 0.5rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          marginBottom: '0.25rem',
                          backgroundColor: editorTheme === 'vs-dark' ? '#2A2D2E' : '#F1F5F9',
                          fontSize: '0.8rem'
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{f.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#888888' }}>{f.path}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeActivityTab === 'git' && (
              <div style={{ padding: '1rem', color: editorTheme === 'vs-dark' ? '#CCCCCC' : '#0F172A', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#888888' }}>
                  SOURCE CONTROL
                </span>

                <div style={{ backgroundColor: editorTheme === 'vs-dark' ? '#1E1E1E' : '#FFFFFF', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(156,163,175,0.2)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Git Repository Status</div>
                  <div style={{ fontSize: '0.75rem', color: '#888888', marginTop: '0.25rem' }}>
                    Workspace tracking active for <strong>{project.name}</strong>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/student/git')}
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  <ExternalLink size={14} />
                  <span>Open Git / GitHub Center</span>
                </button>
              </div>
            )}

            {/* Academic Panels (Intelligence, Health, Assistant, Docs, Submission, Team) */}
            {(activeActivityTab === 'intelligence' ||
              activeActivityTab === 'health' ||
              activeActivityTab === 'assistant' ||
              activeActivityTab === 'docs' ||
              activeActivityTab === 'submission' ||
              activeActivityTab === 'team') && (
              <WorkspaceAcademicPanels
                panelType={activeActivityTab}
                projectName={project.name}
                projectDescription={project.description || ''}
                projectType={project.project_type}
                files={treeFiles}
                editorTheme={editorTheme}
                onSaveFile={handleSaveAcademicFile}
                onNavigateToFile={handleNavigateToFile}
                onOpenDocsStudio={() => setActiveActivityTab('docs')}
              />
            )}
          </div>

          {/* 3. Editor & Bottom Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
            {/* Editor Area */}
            <div style={{ flexGrow: 1, overflow: 'hidden' }}>
              <WorkspaceEditor
                openTabs={openTabs}
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                onCloseTab={handleCloseTab}
                onContentChange={handleContentChange}
                onSave={() => executeSave()}
                onRun={handleRunCode}
                saveStatus={saveStatus}
                editorTheme={editorTheme}
                onCursorChange={(line, col) => setCursorPos({ line, col })}
              />
            </div>

            {/* Bottom Collapsible Panel */}
            <WorkspaceBottomPanel
              logs={outputLogs}
              onClearLogs={() => setOutputLogs([])}
              isOpen={isBottomPanelOpen}
              onToggleOpen={() => setIsBottomPanelOpen(prev => !prev)}
              editorTheme={editorTheme}
              activeTab={activeBottomTab}
              onTabChange={setActiveBottomTab}
              executionResult={executionResult}
              isExecuting={isExecuting}
              problems={problems}
              onSelectProblem={(prob) => {
                addLog(`Navigating to problem: ${prob.file}:${prob.line}`);
                setCursorPos({ line: prob.line, col: prob.column });
              }}
              previewHtml={previewHtml}
              onRefreshPreview={handleRefreshPreview}
              previewUrlPath={activeTab?.path || '/index.html'}
            />
          </div>
        </div>

        {/* 4. Status Bar */}
        <WorkspaceStatusBar
          projectName={project.name}
          activeFileName={activeTab?.name}
          language={activeTab?.language || 'plaintext'}
          cursorPos={cursorPos}
          saveStatus={saveStatus}
          editorTheme={editorTheme}
          onRetrySave={() => executeSave()}
        />
      </div>

      {/* CREATE / RENAME PROMPT MODAL */}
      {promptMode && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => setPromptMode(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--border-radius)',
              width: '100%',
              maxWidth: '420px',
              padding: '1.5rem',
              boxShadow: 'var(--box-shadow-lg)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.15rem', fontWeight: 700, color: 'var(--brand-black)' }}>
              {promptMode === 'create-file' && 'Create New File'}
              {promptMode === 'create-folder' && 'Create New Folder'}
              {promptMode === 'rename' && 'Rename'}
            </h3>

            {promptError && (
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                {promptError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-dark-grey)', marginBottom: '0.35rem' }}>
                {promptMode === 'create-folder' ? 'Folder Name' : 'File Name (with extension, e.g. app.py)'}
              </label>
              <input
                type="text"
                className="form-input font-sans"
                value={promptValue}
                onChange={e => {
                  setPromptValue(e.target.value);
                  if (promptError) setPromptError(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') executePromptAction();
                  if (e.key === 'Escape') setPromptMode(null);
                }}
                autoFocus
                placeholder={promptMode === 'create-folder' ? 'e.g. components' : 'e.g. index.ts'}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary font-sans"
                onClick={() => setPromptMode(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary font-sans"
                onClick={executePromptAction}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--border-radius)',
              width: '100%',
              maxWidth: '420px',
              padding: '1.5rem',
              boxShadow: 'var(--box-shadow-lg)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.15rem', fontWeight: 700, color: '#DC2626' }}>
              Confirm Deletion
            </h3>

            <p style={{ fontSize: '0.9rem', color: 'var(--brand-black)', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>?
              {confirmDelete.type === 'folder' && ' All files and nested folders inside will also be permanently deleted.'}
              This action cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary font-sans"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn font-sans"
                style={{ backgroundColor: '#DC2626', color: '#FFFFFF', border: '1px solid #DC2626', fontWeight: 700 }}
                onClick={executeDeleteAction}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT WORKSPACE MODAL */}
      <WorkspaceImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={(newId) => {
          setIsImportModalOpen(false);
          navigate(`/student/projects/${newId}/workspace`);
        }}
      />
    </AppShell>
  );
};

export default ProjectWorkspace;
