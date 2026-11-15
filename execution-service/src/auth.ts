/**
 * AIET-UniSphere Execution Service — Hardened Authentication & Authorization Guard
 */

import type { AuthUser } from './types.ts';

export interface AuthContext {
  user: AuthUser;
  isAuthorizedForProject: boolean;
  reason?: string;
}

/**
 * Validates the Supabase JWT token and extracts authenticated user claims.
 * Verifies token expiration and rejects forged or expired tokens.
 */
export const verifySupabaseAuth = async (
  authHeader?: string
): Promise<AuthUser | null> => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) return null;

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // In production, Supabase verification is mandatory; never allow unverified tokens
    if (process.env.NODE_ENV === 'production' && (!supabaseUrl || !supabaseKey)) {
      console.error('[auth] Production execution service requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      return null;
    }

    if (supabaseUrl && supabaseKey) {
      // Authoritative Supabase Auth API verification
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': supabaseKey,
        },
      });

      if (!res.ok) {
        return null;
      }

      const userData = await res.json();
      if (!userData || !userData.id) return null;

      return {
        id: userData.id,
        email: userData.email || '',
        role: userData.user_metadata?.role || userData.app_metadata?.role || 'STUDENT',
      };
    }

    // In non-production/test environments with no Supabase endpoint configured:
    return parseJwtPayload(token);
  } catch (err) {
    console.warn('[auth] Token verification error:', err);
    return null;
  }
};

/**
 * Verifies that the authenticated user is the owner or team member of the specified project.
 * Cross-student execution is strictly forbidden.
 */
export const authorizeProjectAccess = async (
  user: AuthUser,
  projectId: string,
  projectDataResolver?: (id: string) => Promise<{ owner_id: string; team_members?: any } | null>
): Promise<{ authorized: boolean; reason?: string }> => {
  if (!user || !user.id) {
    return { authorized: false, reason: 'Unauthenticated: User credentials required.' };
  }

  // Strictly validate projectId format to prevent injection
  const projectIdRegex = /^[a-zA-Z0-9_-]{1,64}$/;
  if (!projectId || !projectIdRegex.test(projectId)) {
    return { authorized: false, reason: 'Invalid project identifier format.' };
  }

  // Admins have system diagnostic access
  if (user.role === 'ADMIN') {
    return { authorized: true };
  }

  // Initial access strictly restricted to Students
  if (user.role !== 'STUDENT') {
    return { authorized: false, reason: 'Access Denied: Code Studio execution is restricted to students only.' };
  }

  // Custom or mock resolver
  if (projectDataResolver) {
    const project = await projectDataResolver(projectId);
    if (!project) {
      return { authorized: false, reason: 'Project not found.' };
    }

    if (project.owner_id === user.id) {
      return { authorized: true };
    }

    const isMember = Array.isArray(project.team_members) && project.team_members.some(
      (m: any) => m.userId === user.id || m.email === user.email
    );

    if (isMember) {
      return { authorized: true };
    }

    return { authorized: false, reason: 'Access Denied: You are not an owner or team member of this project.' };
  }

  // Authoritative Supabase database check if credentials available
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/user_projects?id=eq.${projectId}&select=owner_id,team_members`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const project = rows[0];
          if (project.owner_id === user.id) {
            return { authorized: true };
          }
          const isMember = Array.isArray(project.team_members) && project.team_members.some(
            (m: any) => m.userId === user.id || m.email === user.email
          );
          if (isMember) {
            return { authorized: true };
          }
          return { authorized: false, reason: 'Access Denied: You are not an owner or team member of this project.' };
        }
        return { authorized: false, reason: 'Project not found in database.' };
      }
    } catch (e) {
      console.warn('[auth] Error checking project authorization against database:', e);
    }
  }

  // In production with no matching resolver/record: Deny by default
  if (process.env.NODE_ENV === 'production') {
    return { authorized: false, reason: 'Access Denied: Unable to verify project authorization.' };
  }

  // In test harness only
  return { authorized: true };
};

/**
 * Parses JWT payload safely with expiration validation.
 */
export const parseJwtPayload = (token: string): AuthUser | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    if (!payload || !payload.sub) return null;

    // Validate expiration if present
    if (payload.exp && typeof payload.exp === 'number') {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSeconds) {
        return null; // Expired token
      }
    }

    return {
      id: payload.sub,
      email: payload.email || 'student@aiet.edu',
      role: payload.role || payload.user_metadata?.role || 'STUDENT',
    };
  } catch {
    return null;
  }
};
