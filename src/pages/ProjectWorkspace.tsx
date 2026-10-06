import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  GitBranch, FolderGit2, Play, ArrowLeft,
  Sidebar, CheckCircle2, Save, FolderSync
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { WorkspaceFileExplorer } from '../components/WorkspaceFileExplorer';
import type { FileTreeNode } from '../components/WorkspaceFileExplorer';
import { WorkspaceEditor } from '../components/WorkspaceEditor';
import { WorkspaceTerminal } from '../components/WorkspaceTerminal';
import {
  getSelectedRepository,
  getRemoteFileTree,
  getRemoteFileContent,
  recordWorkspaceFileChange,
  getGitChanges
} from '../services/githubService';
import type { GitHubRepositoryItem } from '../data/repositories';
import {
  getProjectWorkspaceFiles,
  updateFileContent,
  createProjectFile,
  renameProjectFile,
  deleteProjectFile,
  type ProjectFileNode,
} from '../services/workspaceService';

interface OpenTab extends FileTreeNode {
  isDirty?: boolean;
  savedContent?: string;
}

const convertGitHubTreeToNodes = (rawItems: any[]): FileTreeNode[] => {
  const rootNodes: FileTreeNode[] = [];
  const mapByPath = new Map<string, FileTreeNode>();

  const sorted = [...rawItems].sort((a, b) => a.path.localeCompare(b.path));

  sorted.forEach((item) => {
    const parts = item.path.split('/');
    const fileName = parts[parts.length - 1];
    const isFolder = item.type === 'tree';

    const ext = fileName.split('.').pop()?.toLowerCase();
    let lang = 'typescript';
    if (ext === 'js' || ext === 'jsx') lang = 'javascript';
    else if (ext === 'css') lang = 'css';
    else if (ext === 'html') lang = 'html';
    else if (ext === 'json') lang = 'json';
    else if (ext === 'md') lang = 'markdown';

    const node: FileTreeNode = {
      id: item.path,
      name: fileName,
      type: isFolder ? 'folder' : 'file',
      path: item.path,
      language: lang,
      children: isFolder ? [] : undefined,
      content: undefined
    };

    mapByPath.set(item.path, node);

    if (parts.length === 1) {
      rootNodes.push(node);
    } else {
      const parentPath = parts.slice(0, parts.length - 1).join('/');
      const parentNode = mapByPath.get(parentPath);
      if (parentNode && parentNode.children) {
        parentNode.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }
  });

  return rootNodes;
};

const convertProjectFilesToNodes = (files: ProjectFileNode[]): FileTreeNode[] => files.map(file => ({
  id: file.id,
  name: file.name,
  type: file.type,
  path: file.path,
  language: file.language,
  content: file.content || '',
  parent_id: file.parent_id,
  children: file.children ? convertProjectFilesToNodes(file.children) : undefined,
}));

export const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepositoryItem | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'github' | 'project'>('project');
  const [treeFiles, setTreeFiles] = useState<FileTreeNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<OpenTab | null>(null);

  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [isTerminalOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<'editor' | 'explorer' | 'terminal'>('editor');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Prompt modal state
  const [promptMode, setPromptMode] = useState<'create-file' | 'create-folder' | 'rename' | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptTarget, setPromptTarget] = useState<{ parentId: string | null; parentPath: string; file?: FileTreeNode } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileTreeNode | null>(null);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!id) throw new Error('Open a project workspace from a project before editing files.');
      const repo = await getSelectedRepository();
      setSelectedRepo(repo);

      if (repo && repo.owner && repo.name) {
        setWorkspaceMode('github');
        const rawTree = await getRemoteFileTree(repo.owner, repo.name, repo.selectedBranch || repo.defaultBranch || 'main');
        setTreeFiles(convertGitHubTreeToNodes(rawTree));
      } else {
        setWorkspaceMode('project');
        const projectFiles = await getProjectWorkspaceFiles(id);
        setTreeFiles(convertProjectFilesToNodes(projectFiles));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to load project workspace files.';
      console.error('[ProjectWorkspace] Workspace load failed:', message);
      setTreeFiles([]);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const refreshFiles = async () => {
    await loadWorkspace();
  };

  const handleSelectFile = async (file: FileTreeNode) => {
    if (file.type === 'folder') return;
    
    const existing = openTabs.find(t => t.id === file.id);
    if (existing) {
      setActiveTab(existing);
    } else {
      let fileContent = file.content;
      if (workspaceMode === 'github' && fileContent === undefined && selectedRepo?.owner && selectedRepo?.name) {
        setSaveStatus(`Fetching ${file.name} from GitHub...`);
        try {
          fileContent = await getRemoteFileContent(
            selectedRepo.owner,
            selectedRepo.name,
            file.path || file.id,
            selectedRepo.selectedBranch || selectedRepo.defaultBranch || 'main'
          );
        } catch (error) {
          setSaveStatus(error instanceof Error ? error.message : 'Unable to fetch file content.');
          return;
        }
        setSaveStatus(null);
      }

      const tab: OpenTab = { 
        ...file, 
        content: fileContent || '', 
        isDirty: false, 
        savedContent: fileContent || '' 
      };
      setOpenTabs(prev => [...prev, tab]);
      setActiveTab(tab);
    }
    setMobileTab('editor');
  };

  const handleCloseTab = (file: OpenTab, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = openTabs.filter(t => t.id !== file.id);
    setOpenTabs(remaining);
    if (activeTab?.id === file.id) {
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!activeTab) return;
    const updatedTab: OpenTab = {
      ...activeTab,
      content: newContent,
      isDirty: newContent !== (activeTab.savedContent ?? '')
    };
    setActiveTab(updatedTab);
    setOpenTabs(prev => prev.map(t => t.id === activeTab.id ? updatedTab : t));
  };

  const handleSave = async () => {
    if (!activeTab || !activeTab.isDirty) return;
    try {
      if (workspaceMode === 'github') {
        await recordWorkspaceFileChange(
          activeTab.path || activeTab.id,
          activeTab.content || '',
          'MODIFIED',
          activeTab.savedContent
        );
      } else {
        await updateFileContent(activeTab.id, activeTab.content || '');
      }

      const savedTab: OpenTab = { ...activeTab, isDirty: false, savedContent: activeTab.content || '' };
      setActiveTab(savedTab);
      setOpenTabs(prev => prev.map(t => t.id === activeTab.id ? savedTab : t));
      setSaveStatus(workspaceMode === 'github' ? 'Change saved to the GitHub workspace queue.' : 'File saved to the project workspace.');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus('Failed to save file: ' + (err.message || 'Unknown error'));
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  // File CRUD handlers
  const handleCreateFile = (parentId: string | null, parentPath: string, type: 'file' | 'folder') => {
    if (workspaceMode === 'github' && type === 'folder') {
      setSaveStatus('Git does not persist empty folders. Add a file inside the directory instead.');
      return;
    }
    setPromptMode(type === 'file' ? 'create-file' : 'create-folder');
    setPromptTarget({ parentId, parentPath });
    setPromptValue('');
  };

  const handleRenameFile = (file: FileTreeNode) => {
    setPromptMode('rename');
    setPromptTarget({ parentId: null, parentPath: '', file });
    setPromptValue(file.name);
  };

  const handleDeleteFile = (file: FileTreeNode) => {
    if (workspaceMode === 'github' && file.type === 'folder') {
      setSaveStatus('Git does not persist folders. Delete tracked files individually.');
      return;
    }
    setConfirmDelete(file);
  };

  const executePrompt = async () => {
    if (!promptValue.trim()) return;
    const cleanName = promptValue.trim();
    try {
      if (!id) throw new Error('Project identifier is required to change workspace files.');
      if (promptMode === 'create-file') {
        const fullPath = promptTarget?.parentPath ? `${promptTarget.parentPath}/${cleanName}` : cleanName;
        let newFileNode: FileTreeNode;
        if (workspaceMode === 'github') {
          await recordWorkspaceFileChange(fullPath, '', 'ADDED');
          newFileNode = {
            id: fullPath,
            name: cleanName,
            type: 'file',
            path: fullPath,
            content: '',
            language: cleanName.endsWith('.tsx') || cleanName.endsWith('.ts') ? 'typescript' : 'javascript',
          };
        } else {
          const created = await createProjectFile(id, promptTarget?.parentId || null, cleanName, 'file', promptTarget?.parentPath || '');
          newFileNode = convertProjectFilesToNodes([created])[0];
        }
        if (workspaceMode === 'github') setTreeFiles(prev => [...prev, newFileNode]);
        else await loadWorkspace();
        await handleSelectFile(newFileNode);
        setSaveStatus(workspaceMode === 'github' ? `Added ${cleanName} to the GitHub workspace queue.` : `Created ${cleanName} in the project workspace.`);
      } else if (promptMode === 'create-folder') {
        const fullPath = promptTarget?.parentPath ? `${promptTarget.parentPath}/${cleanName}` : cleanName;
        await createProjectFile(id, promptTarget?.parentId || null, cleanName, 'folder', promptTarget?.parentPath || '');
        await loadWorkspace();
        setSaveStatus(`Created folder ${cleanName} in the project workspace.`);
      } else if (promptMode === 'rename' && promptTarget?.file) {
        const oldFile = promptTarget.file;
        const filePathStr = oldFile.path || oldFile.id;
        const parentPath = filePathStr.includes('/') ? filePathStr.substring(0, filePathStr.lastIndexOf('/')) : '';
        const newPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;
        let renamedId = oldFile.id;
        if (workspaceMode === 'github') {
          await recordWorkspaceFileChange(filePathStr, '', 'DELETED');
          await recordWorkspaceFileChange(newPath, oldFile.content || '', 'ADDED');
          renamedId = newPath;
        } else {
          await renameProjectFile(oldFile.id, cleanName, newPath);
          await loadWorkspace();
        }
        setOpenTabs(prev => prev.map(tab => tab.id === oldFile.id ? { ...tab, id: renamedId, name: cleanName, path: newPath } : tab));
        if (activeTab?.id === oldFile.id) setActiveTab(prev => prev ? { ...prev, id: renamedId, name: cleanName, path: newPath } : null);
        setSaveStatus(`Renamed to ${cleanName}.`);
      }
    } catch (err: unknown) {
      setSaveStatus(err instanceof Error ? err.message : 'File operation failed.');
    }
    setPromptMode(null);
    setPromptTarget(null);
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (workspaceMode === 'github') {
        await recordWorkspaceFileChange(confirmDelete.path || confirmDelete.id, '', 'DELETED');
      } else if (id) {
        await deleteProjectFile(confirmDelete.id, id);
      } else {
        throw new Error('Project identifier is required to delete workspace files.');
      }
      setOpenTabs(prev => prev.filter(t => t.id !== confirmDelete.id));
      if (activeTab?.id === confirmDelete.id) {
        const remaining = openTabs.filter(t => t.id !== confirmDelete.id);
        setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1] : null);
      }
      if (workspaceMode === 'project') await loadWorkspace();
      else setTreeFiles(prev => prev.filter(t => t.id !== confirmDelete.id));
      setSaveStatus(`Deleted ${confirmDelete.name} from the ${workspaceMode === 'github' ? 'GitHub change queue' : 'project workspace'}.`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: unknown) {
      setSaveStatus(err instanceof Error ? err.message : 'Unable to delete file.');
    }
    setConfirmDelete(null);
  };

  const handleRunProject = () => {
    const htmlTab = openTabs.find(t => t.name.endsWith('.html')) || activeTab;
    if (htmlTab && htmlTab.content) {
      const blob = new Blob([htmlTab.content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setSaveStatus('Preview opened in new browser tab.');
    } else {
      setSaveStatus('Open or select an HTML file to enable Run / Preview.');
    }
    setTimeout(() => setSaveStatus(null), 4000);
  };

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading GitHub repository workspace tree..." />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <ErrorState message={error} onRetry={loadWorkspace} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="ide-workspace-outer">
        {/* Top IDE Toolbar */}
        <div className="ide-top-toolbar">
          <div className="toolbar-left">
            <button className="ide-btn-icon" onClick={() => navigate('/student/github')} title="Back to Git / GitHub">
              <ArrowLeft size={16} />
            </button>
            <div className="toolbar-project-title">
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--brand-black)' }}>
                {selectedRepo?.fullName || selectedRepo?.name || 'UniSphere Developer Workspace'}
              </span>
              <span className="badge badge-active" style={{ fontSize: '0.65rem' }}>
                GitHub IDE
              </span>
            </div>
          </div>

          <div className="toolbar-center font-mono">
            <div className="toolbar-branch-select">
              <GitBranch size={14} className="text-orange-icon" />
              <span>{selectedRepo?.selectedBranch || selectedRepo?.defaultBranch || 'main'}</span>
            </div>
            {saveStatus && (
              <>
                <span className="toolbar-divider">|</span>
                <div className="toolbar-status-item">
                  <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />
                  <span style={{ fontSize: '0.75rem' }}>{saveStatus}</span>
                </div>
              </>
            )}
          </div>

          <div className="toolbar-right">
            <button className="ide-btn ide-btn-secondary" onClick={() => navigate('/student/github')}>
              <FolderGit2 size={15} /> Git / GitHub
            </button>
            <button className="ide-btn ide-btn-primary" onClick={handleRunProject}>
              <Play size={15} /> Run / Preview
            </button>
            <div className="panel-toggles-group">
              <button 
                className={`ide-btn-icon ${isExplorerOpen ? 'active' : ''}`}
                onClick={() => setIsExplorerOpen(!isExplorerOpen)}
                title="Toggle Explorer"
              >
                <Sidebar size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile View Switcher Tabs */}
        <div className="ide-mobile-nav">
          <button className={mobileTab === 'explorer' ? 'active' : ''} onClick={() => setMobileTab('explorer')}>Explorer</button>
          <button className={mobileTab === 'editor' ? 'active' : ''} onClick={() => setMobileTab('editor')}>Editor</button>
          <button className={mobileTab === 'terminal' ? 'active' : ''} onClick={() => setMobileTab('terminal')}>Terminal</button>
        </div>

        {/* Main IDE Layout Body */}
        <div className="ide-layout-grid">
          {isExplorerOpen && (
            <div className={`ide-panel-left ${mobileTab === 'explorer' ? 'mobile-visible' : ''}`}>
              <WorkspaceFileExplorer
                files={treeFiles}
                activeFile={activeTab?.id || ''}
                onSelectFile={handleSelectFile}
                onCreateFile={handleCreateFile}
                onRenameFile={handleRenameFile}
                onDeleteFile={handleDeleteFile}
                onRefresh={refreshFiles}
              />
            </div>
          )}

          <div className={`ide-panel-center ${mobileTab === 'editor' || mobileTab === 'terminal' ? 'mobile-visible' : ''}`}>
            <div className="ide-editor-wrapper">
              <WorkspaceEditor
                openTabs={openTabs}
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                onCloseTab={handleCloseTab}
                onContentChange={handleContentChange}
                onSave={handleSave}
              />
            </div>

            {isTerminalOpen && (
              <div className="ide-terminal-wrapper">
                <WorkspaceTerminal projectName={selectedRepo?.name || 'UniSphere Workspace'} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create / Rename Prompt Modal */}
      {promptMode && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '400px', padding: '1.5rem' }}>
            <h3 className="font-display" style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 0, marginBottom: '1rem' }}>
              {promptMode === 'create-file' ? 'Create New File' : promptMode === 'create-folder' ? 'Create New Folder' : 'Rename'}
            </h3>
            <input
              type="text"
              className="form-input font-sans"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptMode === 'rename' ? 'New name...' : promptMode === 'create-folder' ? 'Folder name...' : 'File name (e.g. App.tsx)...'}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') executePrompt(); }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setPromptMode(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={executePrompt}>
                {promptMode === 'rename' ? 'Rename' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '400px', padding: '1.5rem' }}>
            <h3 className="font-display" style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 0, color: '#DC2626' }}>
              Delete {confirmDelete.type === 'folder' ? 'Folder' : 'File'}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)' }}>
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn" style={{ backgroundColor: '#DC2626', color: '#FFF', border: '1px solid #DC2626' }} onClick={executeDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default ProjectWorkspace;
