/**
 * Real Audit Service — backed by Supabase audit_logs table.
 */
import { supabase } from '../lib/supabase';

const sb = supabase as any;

export interface AuditLogEvent {
  id: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  created_at: string;
}

export const getAuditLogs = async (
  limit: number = 100,
  entityType?: string,
  actorId?: string
): Promise<AuditLogEvent[]> => {
  let query = sb
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (entityType) query = query.eq('entity_type', entityType);
  if (actorId) query = query.eq('actor_id', actorId);

  const { data, error } = await query;
  if (error) {
    console.error('[auditService] getAuditLogs error:', error.message);
    return [];
  }
  return (data || []) as AuditLogEvent[];
};

export const addAuditLog = async (
  event: Omit<AuditLogEvent, 'id' | 'created_at'>
): Promise<AuditLogEvent | null> => {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await sb
    .from('audit_logs')
    .insert({
      ...event,
      actor_id: event.actor_id || user?.id || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[auditService] addAuditLog error:', error.message);
    return null;
  }
  return data as AuditLogEvent;
};

export const logUserAction = async (params: {
  action: string;
  entityType: string;
  entityId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await sb
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .single();

  await addAuditLog({
    actor_id: user.id,
    actor_email: profile?.email || user.email || null,
    actor_role: profile?.role || null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId || null,
    description: params.description || null,
    metadata: params.metadata || {},
  });
};
