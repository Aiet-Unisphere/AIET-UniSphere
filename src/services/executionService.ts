/**
 * AIET-UniSphere — UniSphere Code Studio Execution Client Service
 * 
 * Provides communication with the isolated Docker-based execution service,
 * preview generation for web projects, and compilation error diagnostics.
 */

import { supabase } from '../lib/supabase';
import type { FileTreeNode } from '../components/WorkspaceFileExplorer';

export interface ExecutionRequest {
  projectId: string;
  entryFilePath: string;
  files: Array<{ path: string; content: string }>;
  language: string;
  stdin?: string;
}

export interface ExecutionResponse {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionDurationMs: number;
  timedOut: boolean;
  compilationError?: string | null;
  error?: string;
  timestamp: string;
}

export interface DiagnosticProblem {
  id: string;
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ExecutionServiceHealth {
  status: 'ok' | 'degraded' | 'offline';
  dockerAvailable: boolean;
  version: string;
  configuredLimits: {
    maxCpu: number;
    maxMemoryMb: number;
    executionTimeoutMs: number;
    maxProcesses: number;
  };
  supportedLanguages: string[];
}

const EXECUTION_SERVICE_URL = 
  (import.meta as any).env?.VITE_EXECUTION_SERVICE_URL || 'http://localhost:4000';

// In-memory active abort controller for stop requests
let activeAbortController: AbortController | null = null;

/**
 * Checks the health and availability of the isolated execution engine.
 */
export const checkExecutionEngineHealth = async (): Promise<ExecutionServiceHealth> => {
  try {
    const response = await fetch(`${EXECUTION_SERVICE_URL}/api/v1/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return {
        status: 'degraded',
        dockerAvailable: false,
        version: '1.0.0',
        configuredLimits: { maxCpu: 1, maxMemoryMb: 512, executionTimeoutMs: 10000, maxProcesses: 32 },
        supportedLanguages: ['python', 'javascript', 'java', 'c', 'cpp', 'html']
      };
    }

    return await response.json();
  } catch {
    return {
      status: 'offline',
      dockerAvailable: false,
      version: '1.0.0',
      configuredLimits: { maxCpu: 1, maxMemoryMb: 512, executionTimeoutMs: 10000, maxProcesses: 32 },
      supportedLanguages: ['python', 'javascript', 'java', 'c', 'cpp', 'html']
    };
  }
};

/**
 * Submits source code to the isolated execution engine.
 */
export const executeCode = async (
  request: ExecutionRequest
): Promise<ExecutionResponse> => {
  // 1. Authenticate with Supabase
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Authentication required: Active student login is required to execute code.');
  }

  // 2. Setup AbortController for cancel/stop capability
  activeAbortController = new AbortController();

  try {
    const response = await fetch(`${EXECUTION_SERVICE_URL}/api/v1/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(request),
      signal: activeAbortController.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMessage = errorBody.message || errorBody.error || `Execution failed with status ${response.status}`;
      return {
        success: false,
        stdout: '',
        stderr: errorMessage,
        exitCode: response.status === 403 ? 403 : 1,
        executionDurationMs: 0,
        timedOut: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }

    const data: ExecutionResponse = await response.json();
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        stdout: '',
        stderr: 'Execution stopped by user.',
        exitCode: 130, // SIGINT/Stop standard code
        executionDurationMs: 0,
        timedOut: false,
        error: 'Execution stopped by user.',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: false,
      stdout: '',
      stderr: `Execution service connection error: ${err.message || 'Service unreachable'}. Ensure the isolated Docker execution service is running at ${EXECUTION_SERVICE_URL}.`,
      exitCode: -1,
      executionDurationMs: 0,
      timedOut: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  } finally {
    activeAbortController = null;
  }
};

/**
 * Sends a cancellation signal to stop a currently running execution container.
 */
export const stopCodeExecution = async (projectId: string): Promise<boolean> => {
  // Abort client-side fetch immediately
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

    const response = await fetch(`${EXECUTION_SERVICE_URL}/api/v1/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ projectId }),
      signal: AbortSignal.timeout(3000),
    });

    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Parses compilation errors from stderr into structured diagnostic problems.
 */
export const parseCompilationProblems = (stderr: string, language: string): DiagnosticProblem[] => {
  if (!stderr) return [];
  const problems: DiagnosticProblem[] = [];
  const lines = stderr.split('\n');

  lines.forEach((line, index) => {
    let match: RegExpMatchArray | null = null;

    if (language === 'python') {
      // File "main.py", line 4
      match = line.match(/File "([^"]+)", line (\d+)/i);
      if (match) {
        problems.push({
          id: `prob-py-${index}`,
          file: match[1],
          line: parseInt(match[2], 10),
          column: 1,
          message: lines[index + 1] ? `${line.trim()} — ${lines[index + 1].trim()}` : line.trim(),
          severity: 'error'
        });
      }
    } else if (language === 'java') {
      // Main.java:5: error: ';' expected
      match = line.match(/^([^:]+):(\d+):\s*(error|warning):\s*(.+)$/i);
      if (match) {
        problems.push({
          id: `prob-java-${index}`,
          file: match[1],
          line: parseInt(match[2], 10),
          column: 1,
          message: match[4].trim(),
          severity: match[3].toLowerCase() === 'warning' ? 'warning' : 'error'
        });
      }
    } else if (language === 'c' || language === 'cpp') {
      // main.c:12:5: error: expected ';' before 'return'
      match = line.match(/^([^:]+):(\d+):(\d+):\s*(error|warning):\s*(.+)$/i);
      if (match) {
        problems.push({
          id: `prob-c-${index}`,
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[5].trim(),
          severity: match[4].toLowerCase() === 'warning' ? 'warning' : 'error'
        });
      }
    } else if (language === 'javascript' || language === 'typescript') {
      // SyntaxError at main.js:10:4
      match = line.match(/(?:at\s+)?([^:]+):(\d+):(\d+)/i);
      if (match && !line.includes('node:internal')) {
        problems.push({
          id: `prob-js-${index}`,
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: line.trim(),
          severity: 'error'
        });
      }
    }
  });

  return problems;
};

/**
 * Safely bundles HTML, CSS, and JS workspace files into a self-contained
 * isolated document for the sandboxed iframe preview.
 * 
 * Enforces strict CSP and sandbox boundaries.
 */
export const generateSandboxedPreviewHtml = (
  entryHtmlFile: { name: string; content?: string | null },
  allFiles: FileTreeNode[]
): string => {
  let html = entryHtmlFile.content || '<!DOCTYPE html><html><body><p>Empty HTML document</p></body></html>';

  // Extract flat list of workspace files
  const flatFiles: Array<{ name: string; path: string; content: string | null }> = [];
  const walk = (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file') {
        flatFiles.push({ name: node.name, path: node.path || node.name, content: node.content || '' });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(allFiles);

  // Inline CSS files referenced in <link rel="stylesheet" href="...">
  flatFiles.filter(f => f.name.endsWith('.css')).forEach(cssFile => {
    const linkRegex = new RegExp(`<link[^>]+href=["'](?:\.\/)?${cssFile.name}["'][^>]*>`, 'gi');
    if (linkRegex.test(html)) {
      html = html.replace(linkRegex, `<style>/* ${cssFile.name} */\n${cssFile.content || ''}\n</style>`);
    }
  });

  // Inline JS files referenced in <script src="..."></script>
  flatFiles.filter(f => f.name.endsWith('.js')).forEach(jsFile => {
    const scriptRegex = new RegExp(`<script[^>]+src=["'](?:\.\/)?${jsFile.name}["'][^>]*><\/script>`, 'gi');
    if (scriptRegex.test(html)) {
      html = html.replace(scriptRegex, `<script>/* ${jsFile.name} */\n${jsFile.content || ''}\n</script>`);
    }
  });

  // Inject console interception to forward preview console.log to output
  const consoleScript = `
    <script>
      (function() {
        const _log = console.log;
        const _warn = console.warn;
        const _error = console.error;
        function send(type, args) {
          try {
            window.parent.postMessage({
              type: 'UNISPHERE_PREVIEW_CONSOLE',
              logType: type,
              message: Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
            }, '*');
          } catch(e) {}
        }
        console.log = function() { send('info', arguments); _log.apply(console, arguments); };
        console.warn = function() { send('warn', arguments); _warn.apply(console, arguments); };
        console.error = function() { send('error', arguments); _error.apply(console, arguments); };
        window.onerror = function(msg, url, line) {
          send('error', ['Preview Error: ' + msg + ' (Line ' + line + ')']);
        };
      })();
    </script>
  `;

  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>${consoleScript}`);
  } else {
    html = `${consoleScript}${html}`;
  }

  return html;
};
