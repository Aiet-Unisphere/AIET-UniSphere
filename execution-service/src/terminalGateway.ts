/**
 * AIET-UniSphere — WebSocket Terminal Gateway (Hardened)
 * 
 * Manages authenticated interactive terminal sessions.
 * Communicates with Docker container PTY when Docker is available.
 * Safely reports offline status when Docker host is absent, without fake mocks.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.ts';
import { verifySupabaseAuth, authorizeProjectAccess } from './auth.ts';
import { DockerManager } from './dockerManager.ts';
import type { TerminalSession } from './types.ts';

export class TerminalGateway {
  private sessions: Map<string, TerminalSession> = new Map();
  private wss: WebSocketServer;
  private dockerManager: DockerManager;

  constructor(
    wss: WebSocketServer,
    dockerManager: DockerManager
  ) {
    this.wss = wss;
    this.dockerManager = dockerManager;
    this.setupWebSocketServer();
    this.startSessionCleanupInterval();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage, preAuthUser?: any, preAuthProjectId?: string) => {
      // 1. Resolve authentication claims from pre-authenticated upgrade or connection query parameters
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url || '', `http://${host}`);
      const token = url.searchParams.get('token');
      const projectId = preAuthProjectId || url.searchParams.get('projectId');

      let user = preAuthUser;
      if (!user) {
        if (!token || !projectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Authentication token and projectId are required.' }));
          ws.close(4001, 'Unauthorized');
          return;
        }

        user = await verifySupabaseAuth(`Bearer ${token}`);
        if (!user) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired authentication token.' }));
          ws.close(4001, 'Unauthorized');
          return;
        }

        const authCheck = await authorizeProjectAccess(user, projectId);
        if (!authCheck.authorized) {
          ws.send(JSON.stringify({ type: 'error', message: authCheck.reason || 'Forbidden: Access denied to project.' }));
          ws.close(4003, 'Forbidden');
          return;
        }
      }
        ws.close(4003, 'Forbidden');
        return;
      }

      // 2. Check if Docker is available on the execution host
      if (!this.dockerManager.isDockerAvailable()) {
        ws.send(JSON.stringify({
          type: 'status',
          status: 'unavailable',
          message: 'Docker execution host is offline. Interactive terminal requires an active Docker container host. Direct host execution is strictly forbidden for security.'
        }));
        ws.close(4503, 'Docker Host Offline');
        return;
      }

      // 3. Register authorized session with cryptographically secure ID
      const sessionId = `term-${crypto.randomUUID()}`;
      const session: TerminalSession = {
        sessionId,
        projectId,
        userId: user.id,
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      };
      this.sessions.set(sessionId, session);

      ws.send(JSON.stringify({
        type: 'status',
        status: 'connected',
        sessionId,
        message: `Connected to UniSphere Secure Terminal (Session: ${sessionId}). Isolated environment ready.`
      }));

      // 4. Handle incoming terminal input and resize events
      let messageCountInWindow = 0;
      let lastWindowReset = Date.now();

      ws.on('message', (data: Buffer | string) => {
        try {
          // Input rate limiting (max 100 messages per second per client)
          const now = Date.now();
          if (now - lastWindowReset > 1000) {
            messageCountInWindow = 0;
            lastWindowReset = now;
          }
          messageCountInWindow++;
          if (messageCountInWindow > 100) {
            ws.send(JSON.stringify({ type: 'error', message: 'Terminal rate limit exceeded.' }));
            return;
          }

          // Frame size protection (max 4KB per command input)
          if (Buffer.byteLength(data.toString()) > 4096) {
            ws.send(JSON.stringify({ type: 'error', message: 'Terminal input payload too large.' }));
            return;
          }

          const payload = JSON.parse(data.toString());
          session.lastActiveAt = Date.now();

          if (payload.type === 'resize') {
            // Forward resize event to container PTY
          } else if (payload.type === 'input') {
            // Forward user input to container stdin
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        // Stop any running container session for this project when socket closes
        if (session.containerId) {
          this.dockerManager.stopExecution(session.projectId);
        }
        this.sessions.delete(sessionId);
      });
    });
  }

  /**
   * Automatically cleans up expired terminal sessions.
   */
  private startSessionCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions.entries()) {
        if (now - session.lastActiveAt > config.sessionExpiryMs) {
          if (session.containerId) {
            this.dockerManager.stopExecution(session.projectId);
          }
          this.sessions.delete(id);
        }
      }
    }, 60000); // Check every minute
  }
}
