import React, { useState } from 'react';
import { 
  Terminal as TerminalIcon, 
  AlertCircle, 
  ScrollText, 
  Globe, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  X,
  Lock,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Smartphone,
  Tablet,
  Monitor
} from 'lucide-react';
import type { ExecutionResponse, DiagnosticProblem } from '../services/executionService';

export type BottomPanelTab = 'output' | 'problems' | 'terminal' | 'preview';

interface WorkspaceBottomPanelProps {
  logs: string[];
  onClearLogs?: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  editorTheme?: 'vs-dark' | 'light';
  activeTab?: BottomPanelTab;
  onTabChange?: (tab: BottomPanelTab) => void;
  executionResult?: ExecutionResponse | null;
  isExecuting?: boolean;
  problems?: DiagnosticProblem[];
  onSelectProblem?: (problem: DiagnosticProblem) => void;
  terminalWsStatus?: 'connected' | 'disconnected' | 'connecting' | 'unavailable';
  terminalLogs?: string[];
  onSendTerminalCommand?: (command: string) => void;
  previewHtml?: string;
  onRefreshPreview?: () => void;
  previewUrlPath?: string;
}

export const WorkspaceBottomPanel: React.FC<WorkspaceBottomPanelProps> = ({
  logs,
  onClearLogs,
  isOpen,
  onToggleOpen,
  editorTheme = 'vs-dark',
  activeTab: externalActiveTab,
  onTabChange,
  executionResult,
  isExecuting = false,
  problems = [],
  onSelectProblem,
  terminalWsStatus = 'unavailable',
  terminalLogs = [],
  onSendTerminalCommand,
  previewHtml,
  onRefreshPreview,
  previewUrlPath = '/index.html'
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState<BottomPanelTab>('output');
  const [terminalInput, setTerminalInput] = useState('');
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const activeTab = externalActiveTab !== undefined ? externalActiveTab : internalActiveTab;
  const setActiveTab = (tab: BottomPanelTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    onSendTerminalCommand?.(terminalInput.trim());
    setTerminalInput('');
  };

  if (!isOpen) {
    return (
      <div
        className="workspace-bottom-collapsed"
        style={{
          height: '28px',
          backgroundColor: editorTheme === 'vs-dark' ? '#1e1e1e' : '#F1F5F9',
          borderTop: editorTheme === 'vs-dark' ? '1px solid #333333' : '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0.75rem',
          fontSize: '0.75rem',
          color: editorTheme === 'vs-dark' ? '#888888' : '#64748B',
          cursor: 'pointer',
        }}
        onClick={onToggleOpen}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ChevronUp size={14} />
          <span style={{ fontWeight: 600 }}>Panel (Output, Problems, Terminal)</span>
          {isExecuting && (
            <span style={{ color: 'var(--brand-orange)', fontWeight: 700, fontSize: '0.7rem' }}>
              ● Running...
            </span>
          )}
          {problems.length > 0 && (
            <span style={{ color: '#EF4444', fontSize: '0.7rem', fontWeight: 600 }}>
              ● {problems.length} {problems.length === 1 ? 'problem' : 'problems'}
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.7rem' }}>Click to expand</span>
      </div>
    );
  }

  return (
    <div
      className="workspace-bottom-panel"
      style={{
        height: '240px',
        backgroundColor: editorTheme === 'vs-dark' ? '#1e1e1e' : '#FFFFFF',
        borderTop: editorTheme === 'vs-dark' ? '1px solid #333333' : '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        color: editorTheme === 'vs-dark' ? '#cccccc' : '#0F172A',
        flexShrink: 0,
        zIndex: 4,
      }}
    >
      {/* Tab Navigation Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: editorTheme === 'vs-dark' ? '#252526' : '#F8FAFC',
          borderBottom: editorTheme === 'vs-dark' ? '1px solid #333333' : '1px solid #E2E8F0',
          padding: '0 0.5rem',
          height: '32px',
        }}
      >
        <div style={{ display: 'flex', gap: '2px' }}>
          <button
            onClick={() => setActiveTab('output')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'output' ? 700 : 500,
              color: activeTab === 'output' 
                ? (editorTheme === 'vs-dark' ? '#FFFFFF' : '#0F172A') 
                : (editorTheme === 'vs-dark' ? '#888888' : '#64748B'),
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'output' ? '2px solid var(--brand-orange)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            <ScrollText size={13} />
            <span>Output</span>
            {isExecuting && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--brand-orange)' }} />
            )}
          </button>

          <button
            onClick={() => setActiveTab('problems')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'problems' ? 700 : 500,
              color: activeTab === 'problems' 
                ? (editorTheme === 'vs-dark' ? '#FFFFFF' : '#0F172A') 
                : (editorTheme === 'vs-dark' ? '#888888' : '#64748B'),
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'problems' ? '2px solid var(--brand-orange)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            <AlertCircle size={13} />
            <span>Problems</span>
            <span style={{ 
              fontSize: '0.65rem', 
              padding: '1px 5px', 
              borderRadius: '10px', 
              backgroundColor: problems.length > 0 ? '#EF4444' : (editorTheme === 'vs-dark' ? '#333' : '#E2E8F0'),
              color: problems.length > 0 ? '#FFFFFF' : 'inherit'
            }}>
              {problems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'terminal' ? 700 : 500,
              color: activeTab === 'terminal' 
                ? (editorTheme === 'vs-dark' ? '#FFFFFF' : '#0F172A') 
                : (editorTheme === 'vs-dark' ? '#888888' : '#64748B'),
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'terminal' ? '2px solid var(--brand-orange)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            <TerminalIcon size={13} />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('preview')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: activeTab === 'preview' ? 700 : 500,
              color: activeTab === 'preview' 
                ? (editorTheme === 'vs-dark' ? '#FFFFFF' : '#0F172A') 
                : (editorTheme === 'vs-dark' ? '#888888' : '#64748B'),
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'preview' ? '2px solid var(--brand-orange)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            <Globe size={13} />
            <span>Preview</span>
          </button>
        </div>

        {/* Panel Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {activeTab === 'output' && onClearLogs && (
            <button
              onClick={onClearLogs}
              title="Clear Output"
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: editorTheme === 'vs-dark' ? '#888888' : '#64748B',
                padding: '3px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.7rem'
              }}
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          )}

          {activeTab === 'preview' && onRefreshPreview && (
            <button
              onClick={onRefreshPreview}
              title="Refresh Preview"
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: editorTheme === 'vs-dark' ? '#888888' : '#64748B',
                padding: '3px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.7rem'
              }}
            >
              <RotateCw size={13} />
              <span>Reload</span>
            </button>
          )}

          <button
            onClick={onToggleOpen}
            title="Minimize Panel"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: editorTheme === 'vs-dark' ? '#888888' : '#64748B',
              padding: '3px',
              borderRadius: '3px',
            }}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0.75rem 1rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>
        
        {/* OUTPUT TAB */}
        {activeTab === 'output' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Real Execution Outcome Banner */}
            {executionResult && (
              <div style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '4px',
                backgroundColor: executionResult.success 
                  ? (editorTheme === 'vs-dark' ? 'rgba(34, 197, 94, 0.1)' : '#F0FDF4')
                  : (editorTheme === 'vs-dark' ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2'),
                border: executionResult.success 
                  ? '1px solid rgba(34, 197, 94, 0.3)' 
                  : '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {executionResult.success ? (
                    <CheckCircle2 size={15} style={{ color: '#22C55E' }} />
                  ) : (
                    <XCircle size={15} style={{ color: '#EF4444' }} />
                  )}
                  <span style={{ fontWeight: 700, color: executionResult.success ? '#22C55E' : '#EF4444' }}>
                    {executionResult.timedOut 
                      ? 'Execution Timed Out (10s limit)' 
                      : executionResult.success 
                        ? 'Process Finished Successfully' 
                        : 'Process Terminated with Errors'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748B' }}>
                  <span>Exit Code: <strong style={{ color: executionResult.exitCode === 0 ? '#22C55E' : '#EF4444' }}>{executionResult.exitCode ?? 'N/A'}</strong></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Clock size={12} />
                    <span>{executionResult.executionDurationMs} ms</span>
                  </span>
                </div>
              </div>
            )}

            {/* Standard Output Stream */}
            {executionResult?.stdout && (
              <div style={{ marginTop: '0.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                  Standard Output:
                </div>
                <pre style={{ margin: 0, padding: '0.5rem', borderRadius: '4px', backgroundColor: editorTheme === 'vs-dark' ? '#141414' : '#F8FAFC', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: editorTheme === 'vs-dark' ? '#A7F3D0' : '#065F46' }}>
                  {executionResult.stdout}
                </pre>
              </div>
            )}

            {/* Standard Error Stream */}
            {executionResult?.stderr && (
              <div style={{ marginTop: '0.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#EF4444', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                  Standard Error / Diagnostics:
                </div>
                <pre style={{ margin: 0, padding: '0.5rem', borderRadius: '4px', backgroundColor: editorTheme === 'vs-dark' ? '#1A0B0B' : '#FEF2F2', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#EF4444' }}>
                  {executionResult.stderr}
                </pre>
              </div>
            )}

            {/* Workspace Event Logs */}
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                Workspace Event Log:
              </div>
              {logs.length === 0 ? (
                <span style={{ color: '#888888' }}>[No output entries]</span>
              ) : (
                logs.map((line, idx) => (
                  <div key={idx} style={{ lineHeight: 1.5, wordBreak: 'break-all' }}>
                    <span style={{ color: '#6B7280', marginRight: '0.5rem' }}>&gt;</span>
                    <span>{line}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PROBLEMS TAB */}
        {activeTab === 'problems' && (
          <div>
            {problems.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#888888' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>No problems have been detected in the workspace.</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>Syntax and compilation diagnostics will appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {problems.map((prob) => (
                  <div
                    key={prob.id}
                    onClick={() => onSelectProblem?.(prob)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: editorTheme === 'vs-dark' ? '#252526' : '#F8FAFC',
                      cursor: onSelectProblem ? 'pointer' : 'default',
                      borderLeft: prob.severity === 'error' ? '3px solid #EF4444' : '3px solid #F59E0B'
                    }}
                  >
                    <AlertCircle size={14} style={{ color: prob.severity === 'error' ? '#EF4444' : '#F59E0B', marginTop: '2px', flexShrink: 0 }} />
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                        <span>{prob.file} [{prob.line}:{prob.column}]</span>
                        <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: prob.severity === 'error' ? '#EF4444' : '#F59E0B' }}>
                          {prob.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: editorTheme === 'vs-dark' ? '#D1D5DB' : '#374151', marginTop: '1px' }}>
                        {prob.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TERMINAL TAB */}
        {activeTab === 'terminal' && (
          <div>
            {terminalWsStatus === 'unavailable' ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
                  <Lock size={20} />
                </div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: editorTheme === 'vs-dark' ? '#FFFFFF' : '#0F172A' }}>
                  Isolated Terminal Runtime (Mission 02)
                </h4>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#888888', lineHeight: 1.5 }}>
                  Browser-based shell commands cannot safely access local processes. Real Docker-isolated container execution, bash terminal, and runtime execution service will be enabled in Mission 02.
                </p>
                <div style={{ marginTop: '0.75rem', padding: '0.5rem', borderRadius: '4px', backgroundColor: editorTheme === 'vs-dark' ? '#252526' : '#F1F5F9', fontSize: '0.7rem', color: '#64748B' }}>
                  Dedicated execution host status: <strong>Docker Host Required</strong> (Port 4000)
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '140px' }}>
                {/* Terminal Output Stream */}
                <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ color: '#22C55E', fontSize: '0.75rem' }}>
                    UniSphere Secure Terminal — Connected to isolated container environment
                  </div>
                  {terminalLogs.map((tLog, idx) => (
                    <div key={idx} style={{ lineHeight: 1.4 }}>{tLog}</div>
                  ))}
                </div>

                {/* Terminal Input Bar */}
                <form onSubmit={handleTerminalSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #333', paddingTop: '0.5rem' }}>
                  <span style={{ color: 'var(--brand-orange)', fontWeight: 700 }}>$</span>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    placeholder="Enter command (e.g. ls, python3 -V, cat)..."
                    style={{
                      flexGrow: 1,
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'inherit',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem'
                    }}
                  />
                </form>
              </div>
            )}
          </div>
        )}

        {/* PREVIEW TAB */}
        {activeTab === 'preview' && (
          <div style={{ height: '100%' }}>
            {previewHtml ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Preview Toolbar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: editorTheme === 'vs-dark' ? '#252526' : '#F1F5F9',
                  borderRadius: '4px 4px 0 0',
                  fontSize: '0.75rem',
                  marginBottom: '0.25rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>URL:</span>
                    <span style={{ padding: '1px 6px', borderRadius: '3px', backgroundColor: editorTheme === 'vs-dark' ? '#141414' : '#FFFFFF', border: '1px solid #CBD5E1' }}>
                      {previewUrlPath}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      onClick={() => setPreviewViewport('desktop')}
                      title="Desktop View"
                      style={{ border: 'none', background: previewViewport === 'desktop' ? 'var(--brand-orange)' : 'none', color: previewViewport === 'desktop' ? '#FFFFFF' : 'inherit', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer' }}
                    >
                      <Monitor size={12} />
                    </button>
                    <button
                      onClick={() => setPreviewViewport('tablet')}
                      title="Tablet View (768px)"
                      style={{ border: 'none', background: previewViewport === 'tablet' ? 'var(--brand-orange)' : 'none', color: previewViewport === 'tablet' ? '#FFFFFF' : 'inherit', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer' }}
                    >
                      <Tablet size={12} />
                    </button>
                    <button
                      onClick={() => setPreviewViewport('mobile')}
                      title="Mobile View (375px)"
                      style={{ border: 'none', background: previewViewport === 'mobile' ? 'var(--brand-orange)' : 'none', color: previewViewport === 'mobile' ? '#FFFFFF' : 'inherit', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer' }}
                    >
                      <Smartphone size={12} />
                    </button>
                  </div>
                </div>

                {/* Sandboxed Iframe Preview */}
                <div style={{
                  flexGrow: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  backgroundColor: '#E2E8F0',
                  borderRadius: '0 0 4px 4px',
                  overflow: 'hidden',
                  minHeight: '150px'
                }}>
                  <iframe
                    title="UniSphere Web Preview"
                    srcDoc={previewHtml}
                    sandbox="allow-scripts allow-forms"
                    style={{
                      width: previewViewport === 'desktop' ? '100%' : (previewViewport === 'tablet' ? '768px' : '375px'),
                      height: '100%',
                      minHeight: '150px',
                      border: 'none',
                      backgroundColor: '#FFFFFF',
                      transition: 'width 0.2s ease-in-out'
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
                  <Globe size={20} />
                </div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: editorTheme === 'vs-dark' ? '#FFFFFF' : '#0F172A' }}>
                  Live Application Preview (Mission 02)
                </h4>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#888888', lineHeight: 1.5 }}>
                  Interactive web server preview will be connected once the containerized execution environment is active in Mission 02.
                </p>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                  Select an HTML file (e.g. <code>index.html</code>) and click <strong>Run</strong> in the toolbar to launch the live sandboxed web preview.
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
