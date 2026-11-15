import React, { useEffect, useCallback, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { X, FileCode, Circle, Code2 } from 'lucide-react';
import type { FileTreeNode } from './WorkspaceFileExplorer';
import { mapToMonacoLanguage } from '../services/workspaceService';

export interface OpenTab extends FileTreeNode {
  isDirty?: boolean;
  savedContent?: string;
}

interface WorkspaceEditorProps {
  openTabs: OpenTab[];
  activeTab: OpenTab | null;
  onSelectTab: (file: OpenTab) => void;
  onCloseTab: (file: OpenTab, e: React.MouseEvent) => void;
  onContentChange: (newContent: string) => void;
  onSave?: () => void;
  onRun?: () => void;
  saveStatus?: string | null;
  editorTheme?: 'vs-dark' | 'light';
  onCursorChange?: (line: number, col: number) => void;
}

export const WorkspaceEditor: React.FC<WorkspaceEditorProps> = ({
  openTabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSave,
  onRun,
  saveStatus,
  editorTheme = 'vs-dark',
  onCursorChange,
}) => {
  const editorRef = useRef<any>(null);

  // Ctrl+S and Ctrl+Enter keyboard handlers
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave?.();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
    }
  }, [onSave, onRun]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });

    // Register Ctrl+S action in Monaco
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    // Register Ctrl+Enter action in Monaco for Run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRun?.();
    });
  };

  if (!activeTab) {
    return (
      <div 
        className="workspace-editor-empty"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: editorTheme === 'vs-dark' ? '#1e1e1e' : '#FFFFFF',
          color: editorTheme === 'vs-dark' ? '#858585' : '#64748B',
          textAlign: 'center',
          padding: '2rem'
        }}
      >
        <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: editorTheme === 'vs-dark' ? '#252526' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', color: 'var(--brand-orange)' }}>
          <Code2 size={36} />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: editorTheme === 'vs-dark' ? '#FFFFFF' : '#0F172A' }}>
          UniSphere Code Studio
        </h2>
        <p style={{ marginTop: '0.4rem', fontSize: '0.9rem', maxWidth: '400px', lineHeight: 1.5 }}>
          Select a file from the explorer on the left or create a new one to begin editing with full Monaco syntax highlighting.
        </p>

        {/* Shortcuts quick guide */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: editorTheme === 'vs-dark' ? '#999999' : '#64748B' }}>
          <div><kbd style={{ backgroundColor: editorTheme === 'vs-dark' ? '#333' : '#E2E8F0', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' }}>Ctrl + S</kbd> Save Active File</div>
          <div><kbd style={{ backgroundColor: editorTheme === 'vs-dark' ? '#333' : '#E2E8F0', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' }}>Ctrl + F</kbd> Find in File</div>
        </div>
      </div>
    );
  }

  const monacoLanguage = mapToMonacoLanguage(activeTab.name || activeTab.language || 'plaintext');

  return (
    <div 
      className="workspace-editor-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: editorTheme === 'vs-dark' ? '#1e1e1e' : '#FFFFFF',
        overflow: 'hidden'
      }}
    >
      {/* Tabs Header */}
      <div 
        className="editor-tabs-bar"
        style={{
          display: 'flex',
          backgroundColor: editorTheme === 'vs-dark' ? '#252526' : '#F8FAFC',
          borderBottom: editorTheme === 'vs-dark' ? '1px solid #333333' : '1px solid #E2E8F0',
          overflowX: 'auto',
          minHeight: '36px',
        }}
      >
        {openTabs.map((tab) => {
          const isActive = activeTab.id === tab.id;
          return (
            <div
              key={tab.id}
              className={`editor-tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                backgroundColor: isActive 
                  ? (editorTheme === 'vs-dark' ? '#1e1e1e' : '#FFFFFF') 
                  : (editorTheme === 'vs-dark' ? '#2d2d2d' : '#F1F5F9'),
                color: isActive 
                  ? (editorTheme === 'vs-dark' ? '#FFFFFF' : '#0F172A') 
                  : (editorTheme === 'vs-dark' ? '#969696' : '#64748B'),
                borderRight: editorTheme === 'vs-dark' ? '1px solid #252526' : '1px solid #E2E8F0',
                borderTop: isActive ? '2px solid var(--brand-orange)' : '2px solid transparent',
                userSelect: 'none',
                maxWidth: '220px',
              }}
            >
              <FileCode size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tab.name}
              </span>
              {tab.isDirty ? (
                <span title="Unsaved changes" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <Circle 
                    size={8} 
                    style={{ fill: 'var(--brand-orange)', color: 'var(--brand-orange)', marginLeft: '2px', flexShrink: 0 }} 
                  />
                </span>
              ) : (
                <button 
                  className="tab-close-btn" 
                  onClick={(e) => onCloseTab(tab, e)}
                  aria-label="Close tab"
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    borderRadius: '2px',
                    color: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: '4px',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Monaco Editor Container */}
      <div style={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
        <Editor
          height="100%"
          language={monacoLanguage}
          value={activeTab.content || ''}
          theme={editorTheme}
          onChange={(val) => onContentChange(val || '')}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            fontFamily: 'Consolas, "Fira Code", "Courier New", monospace',
            lineNumbers: 'on',
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            folding: true,
            autoIndent: 'full',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            tabSize: 2,
            formatOnPaste: true,
            formatOnType: true,
            renderWhitespace: 'selection',
          }}
        />
      </div>
    </div>
  );
};
