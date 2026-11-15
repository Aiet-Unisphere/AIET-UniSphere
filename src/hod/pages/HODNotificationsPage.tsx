import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HODAppShell } from '../components/HODAppShell';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import type { NotificationItem } from '../../data/notifications';
import type { FilterCategory } from '../../components/NotificationFilter';
import { NotificationCard } from '../../components/NotificationCard';
import { NotificationFilter } from '../../components/NotificationFilter';
import { NotificationDetailModal } from '../../components/NotificationDetailModal';
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllReadNotifications,
  subscribeToNotifications
} from '../../services/notificationService';
import { useAuth } from '../../app/context/AuthContext';
import { resolveNotificationRoute } from '../../utils/notificationNavigation';
import { CheckCheck, Trash2, Bell } from 'lucide-react';

export const HODNotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>('All');
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);

  // Modals / Status for Deletion
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchNotifications = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error('[HODNotificationsPage] Error fetching notifications:', err);
      setError("Unable to load department notifications. Please try again.");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications(true);

    const handleUpdate = () => fetchNotifications(false);
    window.addEventListener('notifications_updated', handleUpdate);

    const unsubscribe = user?.id 
      ? subscribeToNotifications(user.id, () => fetchNotifications(false))
      : () => {};

    return () => {
      window.removeEventListener('notifications_updated', handleUpdate);
      unsubscribe();
    };
  }, [user?.id]);

  const notifyHeaderUpdate = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notifications_updated'));
    }
  };

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await markNotificationAsRead(id);
      setNotifications(updated);
      notifyHeaderUpdate();
    } catch (err) {
      console.error('[HODNotificationsPage] Mark read failed:', err);
    }
  };

  const handleMarkAllRead = async () => {
    setIsProcessing(true);
    try {
      const updated = await markAllNotificationsAsRead();
      setNotifications(updated);
      notifyHeaderUpdate();
      setActionStatus("All notifications marked as read.");
      setTimeout(() => setActionStatus(null), 3000);
    } catch (err) {
      console.error('[HODNotificationsPage] Mark all read failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await markNotificationAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      notifyHeaderUpdate();
    }
    setSelectedNotification(notif);
  };

  const handleNavigate = (link: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = resolveNotificationRoute(link, 'HOD');
    navigate(target);
  };

  const promptDeleteReadNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTargetId(id);
  };

  const confirmDeleteReadNotification = async () => {
    if (!deleteTargetId || isProcessing) return;
    setIsProcessing(true);
    try {
      const updated = await deleteNotification(deleteTargetId);
      setNotifications(updated);
      notifyHeaderUpdate();
      setActionStatus("Notification deleted.");
      setTimeout(() => setActionStatus(null), 3000);
    } catch (err) {
      console.error('[HODNotificationsPage] Delete failed:', err);
    } finally {
      setIsProcessing(false);
      setDeleteTargetId(null);
    }
  };

  const confirmClearAllReadNotifications = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const updated = await clearAllReadNotifications();
      setNotifications(updated);
      notifyHeaderUpdate();
      setActionStatus("Cleared all read notifications.");
      setTimeout(() => setActionStatus(null), 3000);
    } catch (err) {
      console.error('[HODNotificationsPage] Clear read failed:', err);
    } finally {
      setIsProcessing(false);
      setShowClearAllModal(false);
    }
  };

  // Category counts
  const categoryCounts = {
    academic: notifications.filter(n => 
      n.category === 'Academic' || 
      n.category === 'Leave' || 
      n.type === 'Assignment' || 
      n.type === 'Assessment' || 
      n.type === 'Attendance' ||
      n.type === 'Leave'
    ).length,
    projects: notifications.filter(n => n.category === 'Projects' || n.type === 'Project').length,
    system: notifications.filter(n => n.category === 'System' || n.type === 'System').length
  };

  // Filter items
  const filteredNotifications = notifications.filter(n => {
    if (selectedFilter === 'Unread') return !n.isRead;
    if (selectedFilter === 'Academic') {
      return (
        n.category === 'Academic' || 
        n.category === 'Leave' || 
        n.type === 'Assignment' || 
        n.type === 'Assessment' || 
        n.type === 'Attendance' ||
        n.type === 'Leave'
      );
    }
    if (selectedFilter === 'Projects') return n.category === 'Projects' || n.type === 'Project';
    if (selectedFilter === 'System') return n.category === 'System' || n.type === 'System';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const readCount = notifications.filter(n => n.isRead).length;

  if (error) {
    return (
      <HODAppShell>
        <ErrorState message={error} onRetry={() => fetchNotifications(true)} />
      </HODAppShell>
    );
  }

  return (
    <HODAppShell>
      {/* Header */}
      <div className="page-header-container" style={{ marginBottom: '1.5rem' }}>
        <div>
          <div className="breadcrumbs">
            <span>Department</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Notifications</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.25rem 0' }}>Department Notifications</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', margin: 0 }}>
            Track department notices, faculty submissions, leave approvals, and student escalations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {unreadCount > 0 && (
            <button
              className="btn btn-secondary"
              style={{ width: 'auto' }}
              onClick={handleMarkAllRead}
              disabled={isProcessing}
            >
              <CheckCheck size={16} />
              Mark all as read
            </button>
          )}

          {readCount > 0 && (
            <button
              className="btn"
              style={{ 
                width: 'auto', 
                backgroundColor: '#FEF2F2', 
                color: '#DC2626', 
                border: '1px solid #FCA5A5',
                opacity: isProcessing ? 0.6 : 1 
              }}
              onClick={() => setShowClearAllModal(true)}
              disabled={isProcessing}
            >
              <Trash2 size={16} />
              Clear Read Notifications
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Status Banner */}
      {actionStatus && (
        <div 
          className="alert-banner success" 
          style={{ marginBottom: '1.25rem', padding: '0.65rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Bell size={16} />
          <span>{actionStatus}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <NotificationFilter
        selectedFilter={selectedFilter}
        onSelectFilter={setSelectedFilter}
        unreadCount={unreadCount}
        totalCount={notifications.length}
        categoryCounts={categoryCounts}
      />

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="notifications-list-wrapper">
          {[1, 2, 3, 4].map(idx => (
            <div 
              key={idx} 
              className="notification-item-card" 
              style={{ pointerEvents: 'none', minHeight: '88px' }}
            >
              <div className="notification-card-icon-col">
                <div className="notification-skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
              </div>
              <div className="notification-card-content" style={{ gap: '0.5rem', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <div className="notification-skeleton" style={{ width: '80px', height: '14px' }} />
                  <div className="notification-skeleton" style={{ width: '60px', height: '14px' }} />
                </div>
                <div className="notification-skeleton" style={{ width: '55%', height: '18px' }} />
                <div className="notification-skeleton" style={{ width: '85%', height: '14px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <EmptyState
          title={selectedFilter === 'Unread' ? "All notifications read" : "No notifications found"}
          message={
            selectedFilter === 'Unread'
              ? "You're all caught up! There are no unread notifications right now."
              : `No notifications found in the ${selectedFilter} category.`
          }
          actionLabel={selectedFilter !== 'All' ? 'View All Notifications' : undefined}
          onAction={() => setSelectedFilter('All')}
        />
      ) : (
        <div className="notifications-list-wrapper">
          {filteredNotifications.map((notif) => (
            <NotificationCard
              key={notif.id}
              notification={notif}
              onClick={handleNotificationClick}
              onMarkRead={handleMarkRead}
              onDeleteRead={promptDeleteReadNotification}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <NotificationDetailModal
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
        userRole="HOD"
      />

      {/* Single Read Notification Delete Modal */}
      {deleteTargetId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: 0, marginBottom: '0.5rem', color: '#DC2626' }}>
              Delete notification?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', lineHeight: 1.5 }}>
              Are you sure you want to delete this notification? It will be permanently removed.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTargetId(null)} disabled={isProcessing}>Cancel</button>
              <button 
                className="btn" 
                style={{ backgroundColor: '#DC2626', color: '#FFF', border: '1px solid #DC2626', opacity: isProcessing ? 0.6 : 1 }}
                onClick={confirmDeleteReadNotification}
                disabled={isProcessing}
              >
                {isProcessing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Read Notifications Modal */}
      {showClearAllModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '440px', padding: '1.5rem' }}>
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: 0, marginBottom: '0.5rem', color: '#DC2626' }}>
              Clear all read notifications?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', lineHeight: 1.5 }}>
              This will permanently clear your read notifications. Unread notifications will remain.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowClearAllModal(false)} disabled={isProcessing}>Cancel</button>
              <button 
                className="btn" 
                style={{ backgroundColor: '#DC2626', color: '#FFF', border: '1px solid #DC2626', opacity: isProcessing ? 0.6 : 1 }}
                onClick={confirmClearAllReadNotifications}
                disabled={isProcessing}
              >
                {isProcessing ? 'Clearing...' : 'Clear Read'}
              </button>
            </div>
          </div>
        </div>
      )}
    </HODAppShell>
  );
};

export default HODNotificationsPage;
