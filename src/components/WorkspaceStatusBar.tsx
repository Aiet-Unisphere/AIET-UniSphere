import React from 'react';
import { FolderGit2, Check, AlertCircle, Loader2 } from 'lucide-react';

interface WorkspaceStatusBarProps {
  projectName?: string;
  activeFileName?: string;
  language?: string;
  cursorPos: { line: number; col: number };
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  saveMessage?: string | null;
  editorTheme?: 'vs-dark' | 'light';
  onRetrySave?: () => void;
}

export const WorkspaceStatusBar: React.FC<WorkspaceStatusBarProps> = ({
  projectName = 'UniSphere Workspace',
  activeFileName,
  language = 'plaintext',
  cursorPos,
  saveStatus,
  saveMessage,
  editorTheme = 'vs-dark',
  onRetrySave,
}) => {
  return (
    <div
      className="workspace-status-bar"
      style={{
        height: '24px',
        backgroundColor: editorTheme === 'vs-dark' ? '#007ACC' : '#0284C7',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 0.75rem',
        fontSize: '0.725rem',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 5,
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Left items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
          <FolderGit2 size={13} />
          <span>{projectName}</span>
        </div>

        {activeFileName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: 0.9 }}>
            <span>{activeFileName}</span>
          </div>
        )}
      </div>

      {/* Right items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Save Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {saveStatus === 'saving' && (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check size={12} />
              <span>Saved</span>
            </>
          )}
          {saveStatus === 'dirty' && (
            <span style={{ color: '#FEF08A', fontWeight: 600 }}>• Unsaved Changes</span>
          )}
          {saveStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#FEE2E2' }}>
              <AlertCircle size={12} />
              <span>Save Failed</span>
              {onRetrySave && (
                <button
                  onClick={onRetrySave}
                  style={{
                    border: 'none',
                    background: '#DC2626',
                    color: '#FFF',
                    fontSize: '0.65rem',
                    padding: '1px 5px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontWeight: 700
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Cursor Position */}
        <div style={{ opacity: 0.9 }}>
          Ln {cursorPos.line}, Col {cursorPos.col}
        </div>

        {/* Encoding */}
        <div style={{ opacity: 0.9 }}>
          UTF-8
        </div>

        {/* Language */}
        <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
          {language}
        </div>
      </div>
    </div>
  );
};

