import { supabase } from '../lib/supabase';
import type { NotificationItem } from '../data/notifications';
export type { NotificationItem };

const mapDBRowToNotificationItem = (n: any): NotificationItem => {
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
};

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

    return data.map(mapDBRowToNotificationItem);
  } catch (err) {
    console.error('[notificationService] Failed to get notifications:', err);
    return [];
  }
};

export const getRecentNotifications = async (limit = 6): Promise<NotificationItem[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await (supabase as any)
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map(mapDBRowToNotificationItem);
  } catch (err) {
    console.error('[notificationService] Failed to get recent notifications:', err);
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

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notifications_updated'));
    }

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

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notifications_updated'));
    }

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
    console.warn('[notificationService] Direct DELETE returned 0 rows. Trying RPC delete_notification...');
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
      "Database deletion failed: No rows were deleted."
    );
  }

  // Dispatch event so AppShell header updates unread count badge immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('notifications_updated'));
  }

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

  let clearedCount = deleteData ? deleteData.length : 0;

  // 2. Fallback: RPC clear_all_read_notifications if direct DELETE returned 0 rows
  if (deleteError || clearedCount === 0) {
    console.warn('[notificationService] Direct Clear DELETE returned 0 rows. Trying RPC clear_all_read_notifications...');
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)('clear_all_read_notifications');
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
      "Failed to clear read notifications."
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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('notifications_updated'));
  }

  return mapDBRowToNotificationItem(data);
};

/**
 * IDEMPOTENT SINGLE NOTIFICATION CREATION
 * Skips insertion if an identical notification (userId + title + relatedLink) already exists.
 */
export const createNotificationIdempotent = async (params: {
  userId: string;
  title: string;
  shortMessage: string;
  fullMessage?: string;
  source?: string;
  category?: string;
  type?: string;
  relatedLink?: string;
}): Promise<boolean> => {
  try {
    if (params.relatedLink) {
      const { data: existing } = await (supabase as any)
        .from('notifications')
        .select('id')
        .eq('user_id', params.userId)
        .eq('title', params.title)
        .eq('related_link', params.relatedLink)
        .limit(1);

      if (existing && existing.length > 0) {
        return false;
      }
    }

    const { error } = await (supabase as any).from('notifications').insert({
      user_id: params.userId,
      title: params.title,
      short_message: params.shortMessage,
      full_message: params.fullMessage || params.shortMessage,
      source: params.source || 'System',
      category: params.category || 'Academic',
      type: params.type || 'Notification',
      related_link: params.relatedLink || null,
      is_read: false
    });

    if (error) {
      console.warn('[notificationService] createNotificationIdempotent insert error:', error.message);
      return false;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notifications_updated'));
    }
    return true;
  } catch (err) {
    console.warn('[notificationService] createNotificationIdempotent failed:', err);
    return false;
  }
};

/**
 * IDEMPOTENT BATCH NOTIFICATIONS CREATION
 * Delivers notifications to multiple recipients safely and prevents duplicate alerts.
 */
export const createBatchNotificationsIdempotent = async (
  recipientUserIds: string[],
  notificationData: {
    title: string;
    shortMessage: string;
    fullMessage?: string;
    source?: string;
    category?: string;
    type?: string;
    relatedLink?: string;
  }
): Promise<number> => {
  if (!recipientUserIds || recipientUserIds.length === 0) return 0;

  const uniqueUserIds = Array.from(new Set(recipientUserIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return 0;

  try {
    let usersToNotify = uniqueUserIds;
    if (notificationData.relatedLink) {
      const { data: existing } = await (supabase as any)
        .from('notifications')
        .select('user_id')
        .in('user_id', uniqueUserIds)
        .eq('title', notificationData.title)
        .eq('related_link', notificationData.relatedLink);

      if (existing && existing.length > 0) {
        const alreadyNotified = new Set(existing.map((e: any) => e.user_id));
        usersToNotify = uniqueUserIds.filter(id => !alreadyNotified.has(id));
      }
    }

    if (usersToNotify.length === 0) return 0;

    const rows = usersToNotify.map(uid => ({
      user_id: uid,
      title: notificationData.title,
      short_message: notificationData.shortMessage,
      full_message: notificationData.fullMessage || notificationData.shortMessage,
      source: notificationData.source || 'System',
      category: notificationData.category || 'Academic',
      type: notificationData.type || 'Notification',
      related_link: notificationData.relatedLink || null,
      is_read: false
    }));

    const { error } = await (supabase as any).from('notifications').insert(rows);
    if (error) {
      console.warn('[notificationService] Batch insert error:', error.message);
      return 0;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notifications_updated'));
    }
    return rows.length;
  } catch (err) {
    console.warn('[notificationService] createBatchNotificationsIdempotent error:', err);
    return 0;
  }
};

/**
 * Plays a subtle, non-intrusive notification chime using the Web Audio API.
 * Respects user sound preference in localStorage ('notification_sound_enabled' !== 'false').
 * Zero external audio asset dependencies, 100% offline-ready.
 */
export const playNotificationSound = () => {
  try {
    if (typeof window === 'undefined') return;
    const pref = localStorage.getItem('notification_sound_enabled');
    if (pref === 'false') return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Gentle high-low pleasant chime: 587Hz (D5) -> 880Hz (A5)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // AudioContext blocked or restricted by browser autoplay policy - silently ignore
  }
};

// Singleton Realtime Subscription State
let activeChannel: any = null;
let activeSubscribedUserId: string | null = null;
const activeListeners = new Set<(payload?: any) => void>();
let fallbackIntervalId: any = null;

export const teardownNotificationChannel = () => {
  if (activeChannel) {
    try {
      (supabase as any).removeChannel(activeChannel);
    } catch (e) {
      console.warn('[notificationService] Error removing channel:', e);
    }
    activeChannel = null;
    activeSubscribedUserId = null;
  }
  if (fallbackIntervalId) {
    clearInterval(fallbackIntervalId);
    fallbackIntervalId = null;
  }
  activeListeners.clear();
};

/**
 * REALTIME NOTIFICATIONS SUBSCRIPTION (SINGLETON)
 * Maintains exactly one active Supabase channel per authenticated user.
 * Dispatches 'new_notification_alert' on INSERT and 'notifications_updated' on all mutation events.
 * Prevents duplicate channel subscriptions, memory leaks, and duplicate toast alerts.
 */
export const subscribeToNotifications = (
  userId: string,
  onNotificationChange: (payload?: any) => void
): (() => void) => {
  if (!userId) return () => {};

  activeListeners.add(onNotificationChange);

  // If already subscribed to this user's channel, register the listener and return unbind
  if (activeChannel && activeSubscribedUserId === userId) {
    return () => {
      activeListeners.delete(onNotificationChange);
      if (activeListeners.size === 0) {
        teardownNotificationChannel();
      }
    };
  }

  // If channel is open for a different user, tear down first
  if (activeChannel && activeSubscribedUserId !== userId) {
    teardownNotificationChannel();
  }

  activeSubscribedUserId = userId;

  try {
    activeChannel = (supabase as any)
      .channel(`public:notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload: any) => {
          // If a new notification is inserted, dispatch a toast alert
          if (payload?.eventType === 'INSERT' && payload.new) {
            const notif = mapDBRowToNotificationItem(payload.new);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('new_notification_alert', { detail: notif }));
            }
          }

          // Trigger unread counter refresh across all shells
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('notifications_updated'));
          }

          // Notify all component listeners
          activeListeners.forEach((listener) => {
            try {
              listener(payload);
            } catch (err) {
              console.error('[notificationService] Listener callback error:', err);
            }
          });
        }
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[notificationService] Realtime channel connection issue, fallback active.');
        }
      });

    // Controlled fallback mechanism: check unread count on tab focus and periodic idle interval
    if (typeof window !== 'undefined' && !fallbackIntervalId) {
      const handleWindowFocus = () => {
        window.dispatchEvent(new Event('notifications_updated'));
      };
      window.addEventListener('focus', handleWindowFocus);

      // Periodic check every 45s as a fallback when realtime is delayed or unavailable
      fallbackIntervalId = setInterval(() => {
        window.dispatchEvent(new Event('notifications_updated'));
      }, 45000);
    }
  } catch (err) {
    console.error('[notificationService] Subscription failed:', err);
  }

  return () => {
    activeListeners.delete(onNotificationChange);
    if (activeListeners.size === 0) {
      teardownNotificationChannel();
    }
  };
};
