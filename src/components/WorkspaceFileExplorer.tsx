import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, FolderOpen, FileCode, FileText, ChevronRight, ChevronDown, 
  FilePlus, FolderPlus, Trash2, Edit3, RefreshCw,
  Code2, FileSpreadsheet, FileJson
} from 'lucide-react';

export interface FileTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  language?: string;
  content?: string | null;
  parent_id?: string | null;
  path?: string;
  children?: FileTreeNode[];
}

interface WorkspaceFileExplorerProps {
  files: FileTreeNode[];
  activeFile: string;
  projectName?: string;
  onSelectFile: (file: FileTreeNode) => void;
  onCreateFile?: (parentId: string | null, parentPath: string, type: 'file' | 'folder') => void;
  onRenameFile?: (file: FileTreeNode) => void;
  onDeleteFile?: (file: FileTreeNode) => void;
  onRefresh?: () => void;
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return <FileCode size={14} style={{ color: '#3178C6' }} />;
    case 'js':
    case 'jsx':
      return <FileCode size={14} style={{ color: '#F7DF1E' }} />;
    case 'py':
      return <Code2 size={14} style={{ color: '#3776AB' }} />;
    case 'java':
      return <Code2 size={14} style={{ color: '#E76F00' }} />;
    case 'c':
    case 'cpp':
    case 'cc':
    case 'h':
    case 'hpp':
      return <Code2 size={14} style={{ color: '#00599C' }} />;
    case 'html':
      return <FileCode size={14} style={{ color: '#E34F26' }} />;
    case 'css':
    case 'scss':
      return <FileCode size={14} style={{ color: '#1572B6' }} />;
    case 'json':
      return <FileJson size={14} style={{ color: '#CBCB41' }} />;
    case 'sql':
      return <FileSpreadsheet size={14} style={{ color: '#00758F' }} />;
    case 'md':
      return <FileText size={14} style={{ color: '#42A5F5' }} />;
    default:
      return <FileText size={14} style={{ color: '#9E9E9E' }} />;
  }
};

const FileTreeItem: React.FC<{
  node: FileTreeNode;
  depth: number;
  activeFile: string;
  onSelectFile: (file: FileTreeNode) => void;
  onCreateFile?: (parentId: string | null, parentPath: string, type: 'file' | 'folder') => void;
  onRenameFile?: (file: FileTreeNode) => void;
  onDeleteFile?: (file: FileTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
}> = ({ node, depth, activeFile, onSelectFile, onCreateFile, onRenameFile, onDeleteFile, onContextMenu }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showActions, setShowActions] = useState(false);

  if (node.type === 'folder') {
    return (
      <div className="file-tree-folder">
        <div 
          className="file-tree-folder-title" 
          style={{ paddingLeft: `${depth * 14 + 8}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
          onClick={() => setIsOpen(!isOpen)}
          onContextMenu={(e) => onContextMenu(e, node)}
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => setShowActions(false)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
            {isOpen ? <ChevronDown size={14} style={{ color: '#858585' }} /> : <ChevronRight size={14} style={{ color: '#858585' }} />}
            {isOpen ? <FolderOpen size={15} style={{ color: '#D97706' }} /> : <Folder size={15} style={{ color: '#D97706' }} />}
            <span className="node-name" style={{ fontWeight: 600, fontSize: '0.85rem' }}>{node.name}</span>
          </div>

          {showActions && (
            <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              {onCreateFile && (
                <button className="ide-btn-icon" style={{ padding: '2px' }} title="New File Inside" onClick={() => onCreateFile(node.id, node.path || node.name, 'file')}>
                  <FilePlus size={12} />
                </button>
              )}
              {onCreateFile && (
                <button className="ide-btn-icon" style={{ padding: '2px' }} title="New Folder Inside" onClick={() => onCreateFile(node.id, node.path || node.name, 'folder')}>
                  <FolderPlus size={12} />
                </button>
              )}
              {onRenameFile && (
                <button className="ide-btn-icon" style={{ padding: '2px' }} title="Rename" onClick={() => onRenameFile(node)}>
                  <Edit3 size={11} />
                </button>
              )}
              {onDeleteFile && (
                <button className="ide-btn-icon" style={{ padding: '2px' }} title="Delete Folder" onClick={() => onDeleteFile(node)}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}
        </div>

        {isOpen && node.children && (
          <div className="file-tree-children">
            {node.children.map((child, idx) => (
              <FileTreeItem
                key={child.id || `${child.name}-${idx}`}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onSelectFile={onSelectFile}
                onCreateFile={onCreateFile}
                onRenameFile={onRenameFile}
                onDeleteFile={onDeleteFile}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = activeFile === node.id || activeFile === node.name || activeFile === node.path;

  return (
    <div 
      className={`file-tree-file-item ${isSelected ? 'selected' : ''}`}
      style={{ paddingLeft: `${depth * 14 + 22}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
      onClick={() => onSelectFile(node)}
      onContextMenu={(e) => onContextMenu(e, node)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        {getFileIcon(node.name)}
        <span className="node-name" style={{ fontSize: '0.85rem' }}>{node.name}</span>
      </div>

      {showActions && (
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {onRenameFile && (
            <button className="ide-btn-icon" style={{ padding: '2px' }} title="Rename" onClick={() => onRenameFile(node)}>
              <Edit3 size={11} />
            </button>
          )}
          {onDeleteFile && (
            <button className="ide-btn-icon" style={{ padding: '2px' }} title="Delete" onClick={() => onDeleteFile(node)}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const WorkspaceFileExplorer: React.FC<WorkspaceFileExplorerProps> = ({
  files,
  activeFile,
  projectName = 'WORKSPACE',
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onRefresh
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileTreeNode | null;
  } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: FileTreeNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  return (
    <div 
      className="workspace-file-explorer"
      onContextMenu={(e) => handleContextMenu(e, null)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#252526',
        color: '#cccccc',
        fontSize: '0.85rem',
        borderRight: '1px solid #333333'
      }}
    >
      {/* Header */}
      <div 
        className="explorer-header" 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '0.5rem 0.85rem',
          backgroundColor: '#252526',
          borderBottom: '1px solid #333333'
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: '#BBBBBB', textTransform: 'uppercase' }}>
          {projectName}
        </span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {onCreateFile && (
            <button 
              className="ide-btn-icon" 
              style={{ padding: '3px' }} 
              title="New File in Root" 
              onClick={() => onCreateFile(null, '', 'file')}
            >
              <FilePlus size={14} />
            </button>
          )}
          {onCreateFile && (
            <button 
              className="ide-btn-icon" 
              style={{ padding: '3px' }} 
              title="New Folder in Root" 
              onClick={() => onCreateFile(null, '', 'folder')}
            >
              <FolderPlus size={14} />
            </button>
          )}
          {onRefresh && (
            <button 
              className="ide-btn-icon" 
              style={{ padding: '3px' }} 
              title="Refresh Explorer" 
              onClick={onRefresh}
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div className="explorer-tree-container" style={{ flexGrow: 1, overflowY: 'auto', padding: '0.35rem 0' }}>
        {files.length === 0 ? (
          <div style={{ padding: '2rem 1rem', fontSize: '0.8rem', color: '#888888', textAlign: 'center' }}>
            <p style={{ margin: 0 }}>No files in workspace.</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem' }}>Click the + icon above to create your first file.</p>
          </div>
        ) : (
          files.map((fileNode, idx) => (
            <FileTreeItem
              key={fileNode.id || `${fileNode.name}-${idx}`}
              node={fileNode}
              depth={0}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            backgroundColor: '#252526',
            border: '1px solid #454545',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            borderRadius: '4px',
            padding: '0.25rem 0',
            zIndex: 10000,
            minWidth: '150px',
            fontSize: '0.8rem',
            color: '#CCCCCC',
          }}
        >
          {onCreateFile && (
            <div
              style={{ padding: '0.4rem 0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              className="context-menu-item"
              onClick={() => {
                const targetNode = contextMenu.node;
                const parentId = targetNode ? (targetNode.type === 'folder' ? targetNode.id : targetNode.parent_id || null) : null;
                const parentPath = targetNode ? (targetNode.type === 'folder' ? targetNode.path || targetNode.name : '') : '';
                onCreateFile(parentId, parentPath, 'file');
                setContextMenu(null);
              }}
            >
              <FilePlus size={14} />
              <span>New File</span>
            </div>
          )}

          {onCreateFile && (
            <div
              style={{ padding: '0.4rem 0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              className="context-menu-item"
              onClick={() => {
                const targetNode = contextMenu.node;
                const parentId = targetNode ? (targetNode.type === 'folder' ? targetNode.id : targetNode.parent_id || null) : null;
                const parentPath = targetNode ? (targetNode.type === 'folder' ? targetNode.path || targetNode.name : '') : '';
                onCreateFile(parentId, parentPath, 'folder');
                setContextMenu(null);
              }}
            >
              <FolderPlus size={14} />
              <span>New Folder</span>
            </div>
          )}

          {contextMenu.node && onRenameFile && (
            <div
              style={{ padding: '0.4rem 0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              className="context-menu-item"
              onClick={() => {
                if (contextMenu.node) onRenameFile(contextMenu.node);
                setContextMenu(null);
              }}
            >
              <Edit3 size={14} />
              <span>Rename</span>
            </div>
          )}

          {contextMenu.node && onDeleteFile && (
            <div
              style={{ padding: '0.4rem 0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#EF4444' }}
              className="context-menu-item"
              onClick={() => {
                if (contextMenu.node) onDeleteFile(contextMenu.node);
                setContextMenu(null);
              }}
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </div>
          )}

          {onRefresh && (
            <div
              style={{ padding: '0.4rem 0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid #333333' }}
              className="context-menu-item"
              onClick={() => {
                onRefresh();
                setContextMenu(null);
              }}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
