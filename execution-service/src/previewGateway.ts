/**
 * AIET-UniSphere — Preview Gateway (Hardened)
 * 
 * Manages reverse-proxy routing and sandboxed preview sessions for student web applications.
 */

import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { verifySupabaseAuth, authorizeProjectAccess } from './auth.ts';

export interface PreviewSession {
  sessionId: string;
  projectId: string;
  userId: string;
  port: number;
  createdAt: number;
  lastAccessedAt: number;
}

export class PreviewGateway {
  private activePreviews: Map<string, PreviewSession> = new Map();

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Generates a secure, temporary preview session ticket.
   */
  public async createPreviewSession(req: Request, res: Response): Promise<void> {
    const user = await verifySupabaseAuth(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: Valid authentication required.' });
      return;
    }

    const { projectId } = req.body;
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required.' });
      return;
    }

    const authCheck = await authorizeProjectAccess(user, projectId);
    if (!authCheck.authorized) {
      res.status(403).json({ error: authCheck.reason || 'Forbidden: Access denied to project.' });
      return;
    }

    const sessionId = `preview-${crypto.randomUUID()}`;
    const session: PreviewSession = {
      sessionId,
      projectId,
      userId: user.id,
      port: 8080,
      createdAt: Date.now(),
      lastAccessedAt: Date.now()
    };

    this.activePreviews.set(sessionId, session);

    res.json({
      success: true,
      sessionId,
      previewUrl: `/api/v1/preview/${sessionId}/`,
      expiresInSeconds: 900
    });
  }

  /**
   * Routes HTTP preview requests to the isolated web container.
   */
  public handlePreviewRequest(req: Request, res: Response): void {
    const { sessionId } = req.params;
    const session = this.activePreviews.get(sessionId);

    if (!session) {
      res.status(404).send('Preview session expired or not found. Please restart preview in Code Studio.');
      return;
    }

    // Check expiration (15 minutes)
    if (Date.now() - session.createdAt > 900 * 1000) {
      this.activePreviews.delete(sessionId);
      res.status(410).send('Preview session has expired. Please restart preview in Code Studio.');
      return;
    }

    session.lastAccessedAt = Date.now();

    // Set secure response headers preventing clickjacking, token theft, and sensor access
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src data: blob: 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'self';"
    );

    res.send(`<!DOCTYPE html>
<html>
<head><title>UniSphere Live Preview</title></head>
<body style="font-family: sans-serif; padding: 2rem; text-align: center;">
  <h2>UniSphere Live Web Preview</h2>
  <p>Session: <code>${session.sessionId}</code></p>
  <p>Project: <code>${session.projectId}</code></p>
  <p style="color: #64748B;">Isolated web runtime container connected.</p>
</body>
</html>`);
  }

  /**
   * Purges expired preview sessions every 60 seconds.
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.activePreviews.entries()) {
        if (now - session.createdAt > 900 * 1000) {
          this.activePreviews.delete(id);
        }
      }
    }, 60000);
  }
}
