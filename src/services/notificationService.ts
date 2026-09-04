import { supabase } from '../lib/supabase';
import type { NotificationItem } from '../data/notifications';
export type { NotificationItem };

export const getNotifications = async (): Promise<NotificationItem[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await (supabase as any)
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((n: any) => {
      const formattedTime = new Date(n.created_at).toLocaleString([], { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      return {
        id: n.id,
        title: n.title,
        shortMessage: n.short_message,
        fullMessage: n.full_message || n.short_message,
        time: formattedTime,
        timestamp: formattedTime,
        isRead: Boolean(n.is_read),
        source: n.source || 'System',
        category: (n.category as any) || 'Academic',
        type: (n.type as any) || 'Notification',
        relatedLink: n.related_link || undefined
      };
    });
  } catch (err) {
    console.error('[notificationService] Failed to get notifications:', err);
    return [];
  }
};

export const getUnreadNotificationsCount = async (): Promise<number> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await (supabase as any)
      .from('notifications')
      .select('*', { count: 'exact Head', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) return 0;
    return count || 0;
  } catch (err) {
    return 0;
  }
};

export const markNotificationAsRead = async (id: string): Promise<NotificationItem[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    await (supabase as any)
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', user.id);

    return getNotifications();
  } catch (err) {
    return getNotifications();
  }
};

export const markAllNotificationsAsRead = async (): Promise<NotificationItem[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    await (supabase as any)
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    return getNotifications();
  } catch (err) {
    return getNotifications();
  }
};

/**
 * DELETE A SINGLE NOTIFICATION
 * Strictly enforced: Only notifications owned by the current user can be deleted.
 */
export const deleteNotification = async (id: string): Promise<NotificationItem[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  console.log('[notificationService] Deleting notification:', { id, userId: user.id });

  // 1. Fetch notification first to verify existence & ownership
  const { data: targetNotif, error: fetchError } = await (supabase as any)
    .from('notifications')
    .select('id, is_read, user_id, title')
    .eq('id', id)
    .maybeSingle();

  if (fetchError || !targetNotif) {
    console.error('[notificationService] Fetch before delete failed:', fetchError);
    throw new Error("Notification record not found.");
  }

  if (targetNotif.user_id !== user.id) {
    throw new Error("ACCESS DENIED: You cannot delete notifications belonging to another user.");
  }

  // 2. Execute DELETE query WITH .select() to verify database deletion
  const { data: deleteData, error: deleteError } = await (supabase as any)
    .from('notifications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select();

  console.log('[notificationService] Direct DELETE result:', { data: deleteData, error: deleteError });

  let deletedSuccessfully = !deleteError && deleteData && deleteData.length > 0;

  // 3. Fallback: If RLS policy blocks direct table DELETE, invoke RPC function delete_notification
  if (!deletedSuccessfully) {
    console.warn('[notificationService] Direct DELETE returned 0 rows (possible missing RLS policy). Trying RPC delete_notification...');
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)('delete_notification', {
        p_notification_id: id
      });
      console.log('[notificationService] RPC delete_notification result:', { data: rpcRes, error: rpcErr });
      if (!rpcErr && rpcRes === true) {
        deletedSuccessfully = true;
      }
    } catch (e) {
      console.error('[notificationService] RPC fallback failed:', e);
    }
  }

  if (!deletedSuccessfully) {
    throw new Error(
      deleteError?.message || 
      "Database deletion failed: No rows were deleted. Please execute migration 00012_fix_notification_deletion.sql in Supabase SQL Editor."
    );
  }

  // Dispatch event so AppShell header updates unread count badge immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('notifications_updated'));
  }

  // 4. Re-fetch fresh notifications list from database to ensure UI is in sync with database
  return getNotifications();
};

/**
 * DELETE ALL READ NOTIFICATIONS FOR AUTHENTICATED USER
 */
export const clearAllReadNotifications = async (): Promise<NotificationItem[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authenticated session required.");

  console.log('[notificationService] Clearing all read notifications for user:', user.id);

  // 1. Direct DELETE query with .select()
  const { data: deleteData, error: deleteError } = await (supabase as any)
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .eq('is_read', true)
    .select();

  console.log('[notificationService] Direct Clear Read DELETE result:', { data: deleteData, error: deleteError });

  let clearedCount = deleteData ? deleteData.length : 0;

  // 2. Fallback: RPC clear_all_read_notifications if direct DELETE returned 0 rows
  if (deleteError || clearedCount === 0) {
    console.warn('[notificationService] Direct Clear DELETE returned 0 rows. Trying RPC clear_all_read_notifications...');
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)('clear_all_read_notifications');
      console.log('[notificationService] RPC clear_all_read_notifications result:', { data: rpcRes, error: rpcErr });
      if (!rpcErr && typeof rpcRes === 'number') {
        clearedCount = rpcRes;
      }
    } catch (e) {
      console.error('[notificationService] RPC clear all fallback failed:', e);
    }
  }

  if (deleteError && clearedCount === 0) {
    throw new Error(
      deleteError.message || 
      "Failed to clear read notifications. Please execute migration 00012_fix_notification_deletion.sql in Supabase SQL Editor."
    );
  }

  // Dispatch event so AppShell header updates unread count badge immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('notifications_updated'));
  }

  return getNotifications();
};

export const addNotification = async (notif: Omit<NotificationItem, 'id' | 'timestamp' | 'time' | 'isRead'> & { userId?: string }): Promise<NotificationItem> => {
  const { data: { user } } = await supabase.auth.getUser();
  const targetUserId = notif.userId || user?.id;

  if (!targetUserId) throw new Error("No target user for notification.");

  const { data, error } = await (supabase as any)
    .from('notifications')
    .insert({
      user_id: targetUserId,
      title: notif.title,
      short_message: notif.shortMessage,
      full_message: notif.fullMessage,
      source: notif.source || 'System',
      category: notif.category || 'Academic',
      type: notif.type || 'Notification',
      related_link: notif.relatedLink || null,
      is_read: false
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create notification.");
  }

  return {
    id: data.id,
    title: data.title,
    shortMessage: data.short_message,
    fullMessage: data.full_message || data.short_message,
    time: 'Just now',
    timestamp: 'Just now',
    isRead: false,
    source: data.source,
    category: data.category,
    type: data.type,
    relatedLink: data.related_link
  };
};
