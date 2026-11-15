/**
 * AIET-UniSphere — Isolated Execution Service Server (Hardened)
 */

import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from './config.ts';
import { DockerManager } from './dockerManager.ts';
import { LanguageRunner } from './compiler.ts';
import { TerminalGateway } from './terminalGateway.ts';
import { PreviewGateway } from './previewGateway.ts';
import { verifySupabaseAuth, authorizeProjectAccess } from './auth.ts';
import { validateWorkspacePath, validateStorageQuota } from './security.ts';
import type { ExecutionPayload, SupportedLanguage } from './types.ts';

const app = express();
const server = http.createServer(app);

// Create WebSocketServer in noServer mode to verify authentication before upgrade handshake
const wss = new WebSocketServer({ 
  noServer: true,
  maxPayload: 64 * 1024 
});

server.on('upgrade', async (request, socket, head) => {
  try {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || '', `http://${host}`);
    
    if (url.pathname === '/ws/terminal') {
      const token = url.searchParams.get('token');
      const projectId = url.searchParams.get('projectId');
      
      if (!token || !projectId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      
      const user = await verifySupabaseAuth(`Bearer ${token}`);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      
      const authCheck = await authorizeProjectAccess(user, projectId);
      if (!authCheck.authorized) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, user, projectId);
      });
    } else {
      socket.destroy();
    }
  } catch (err) {
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Core Services
const dockerManager = new DockerManager();
const runner = new LanguageRunner(dockerManager);
const terminalGateway = new TerminalGateway(wss, dockerManager);
const previewGateway = new PreviewGateway();

// Concurrency & Rate Limiting Controls
const activeProjectExecutions = new Set<string>();
const activeUserExecutions = new Map<string, number>();
const requestRateCounts = new Map<string, { count: number; resetAt: number }>();

const MAX_GLOBAL_CONCURRENT = 10;
const MAX_USER_CONCURRENT = 2;
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 60;

// Rate limiting middleware
const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const clientKey = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown-client';
  const now = Date.now();
  let rate = requestRateCounts.get(clientKey);

  if (!rate || now > rate.resetAt) {
    rate = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    requestRateCounts.set(clientKey, rate);
  }

  rate.count++;
  if (rate.count > MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded: Maximum 60 requests per minute allowed.'
    });
    return;
  }

  next();
};

app.use(rateLimiter);

/**
 * Health check endpoint
 */
app.get('/api/v1/health', (req, res) => {
  const dockerOk = dockerManager.isDockerAvailable();
  res.json({
    status: dockerOk ? 'ok' : 'degraded',
    dockerAvailable: dockerOk,
    version: '1.0.0',
    configuredLimits: {
      maxCpu: config.maxCpu,
      maxMemoryMb: config.maxMemoryMb,
      executionTimeoutMs: config.executionTimeoutMs,
      maxProcesses: config.maxProcesses,
      maxWorkspaceStorageMb: config.maxWorkspaceStorageMb,
      activeExecutions: activeProjectExecutions.size,
      maxGlobalConcurrent: MAX_GLOBAL_CONCURRENT
    },
    supportedLanguages: ['python', 'javascript', 'java', 'c', 'cpp', 'html'],
    message: dockerOk
      ? 'Isolated Docker execution engine ready.'
      : 'Docker daemon offline. Container execution requires an active Docker host.'
  });
});

/**
 * Execute program endpoint
 */
app.post('/api/v1/execute', async (req, res) => {
  // 1. Authentication Check
  const user = await verifySupabaseAuth(req.headers.authorization);
  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Valid student authentication required.'
    });
    return;
  }

  // 2. Validate Payload
  const payload: ExecutionPayload = req.body;
  if (!payload.projectId || !payload.entryFilePath || !Array.isArray(payload.files) || !payload.language) {
    res.status(400).json({
      success: false,
      error: 'Invalid request: projectId, entryFilePath, files array, and language are required.'
    });
    return;
  }

  // 3. Concurrency Check
  if (activeProjectExecutions.has(payload.projectId)) {
    res.status(429).json({
      success: false,
      error: 'An execution is already in progress for this project. Please wait or stop it.'
    });
    return;
  }

  const userActive = activeUserExecutions.get(user.id) || 0;
  if (userActive >= MAX_USER_CONCURRENT) {
    res.status(429).json({
      success: false,
      error: `Concurrency limit reached: Maximum ${MAX_USER_CONCURRENT} active executions per student.`
    });
    return;
  }

  if (activeProjectExecutions.size >= MAX_GLOBAL_CONCURRENT) {
    res.status(503).json({
      success: false,
      error: 'Execution service busy: Maximum global concurrent container limit reached. Please retry in a few moments.'
    });
    return;
  }

  // 4. Authorization Check (Project Ownership / Membership)
  const authCheck = await authorizeProjectAccess(user, payload.projectId);
  if (!authCheck.authorized) {
    res.status(403).json({
      success: false,
      error: authCheck.reason || 'Forbidden: You do not have access to execute code in this project.'
    });
    return;
  }

  // 5. Validate Language Whitelist
  const supportedLanguages: SupportedLanguage[] = ['python', 'javascript', 'java', 'c', 'cpp'];
  if (!supportedLanguages.includes(payload.language)) {
    res.status(400).json({
      success: false,
      error: `Unsupported language: ${payload.language}. Supported: ${supportedLanguages.join(', ')}`
    });
    return;
  }

  // 6. Path Traversal & Safety Checks
  const entryPathCheck = validateWorkspacePath(payload.entryFilePath);
  if (!entryPathCheck.valid) {
    res.status(400).json({
      success: false,
      error: `Security violation in entry file path: ${entryPathCheck.error}`
    });
    return;
  }

  for (const f of payload.files) {
    const fileCheck = validateWorkspacePath(f.path);
    if (!fileCheck.valid) {
      res.status(400).json({
        success: false,
        error: `Security violation in file '${f.path}': ${fileCheck.error}`
      });
      return;
    }
  }

  // 7. Storage Quota Check
  const quotaCheck = validateStorageQuota(payload.files, config.maxWorkspaceStorageMb * 1024 * 1024);
  if (!quotaCheck.valid) {
    res.status(413).json({
      success: false,
      error: quotaCheck.error
    });
    return;
  }

  // 8. Track active execution
  activeProjectExecutions.add(payload.projectId);
  activeUserExecutions.set(user.id, userActive + 1);

  // 9. Execute in Isolated Container
  try {
    const result = await runner.run(
      payload.projectId,
      payload.language,
      entryPathCheck.sanitizedPath!,
      payload.files,
      payload.stdin
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Internal execution error: ${err.message}`
    });
  } finally {
    activeProjectExecutions.delete(payload.projectId);
    const updatedCount = (activeUserExecutions.get(user.id) || 1) - 1;
    if (updatedCount <= 0) {
      activeUserExecutions.delete(user.id);
    } else {
      activeUserExecutions.set(user.id, updatedCount);
    }
  }
});

/**
 * Stop execution endpoint
 */
app.post('/api/v1/stop', async (req, res) => {
  const user = await verifySupabaseAuth(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { projectId } = req.body;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required.' });
    return;
  }

  const authCheck = await authorizeProjectAccess(user, projectId);
  if (!authCheck.authorized) {
    res.status(403).json({ error: authCheck.reason || 'Forbidden' });
    return;
  }

  const stopped = dockerManager.stopExecution(projectId);
  activeProjectExecutions.delete(projectId);
  res.json({ success: true, stopped });
});

/**
 * Preview session endpoints
 */
app.post('/api/v1/preview/session', (req, res) => previewGateway.createPreviewSession(req, res));
app.get('/api/v1/preview/:sessionId/*', (req, res) => previewGateway.handlePreviewRequest(req, res));

// Export for testing or standalone execution
export { app, server, dockerManager, runner, terminalGateway, previewGateway };

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.port, () => {
    console.log(`[UniSphere Execution Service] Listening on port ${config.port}`);
  });
}
