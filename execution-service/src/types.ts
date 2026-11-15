export type SupportedLanguage = 'python' | 'javascript' | 'java' | 'c' | 'cpp';

export interface ExecutionFile {
  path: string;
  content: string;
}

export interface ExecutionPayload {
  projectId: string;
  entryFilePath: string;
  files: ExecutionFile[];
  language: SupportedLanguage;
  stdin?: string;
}

export interface ExecutionOutcome {
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

export interface AuthUser {
  id: string;
  email: string;
  role: 'STUDENT' | 'FACULTY' | 'HOD' | 'ADMIN';
}

export interface TerminalSession {
  sessionId: string;
  projectId: string;
  userId: string;
  createdAt: number;
  lastActiveAt: number;
  containerId?: string;
}

