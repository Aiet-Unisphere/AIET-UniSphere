import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import type { NotificationItem } from '../data/notifications';
import type { FilterCategory } from '../components/NotificationFilter';
import { NotificationCard } from '../components/NotificationCard';
import { NotificationFilter } from '../components/NotificationFilter';
import { NotificationDetailModal } from '../components/NotificationDetailModal';
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllReadNotifications
} from '../services/notificationService';
import { CheckCheck, Trash2 } from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>('All');
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);

  // Modals for Deletion
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const fetchNotifications = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (err) {
      setError("Unable to load notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = await markNotificationAsRead(id);
    setNotifications(updated);
  };

  const handleMarkAllRead = async () => {
    const updated = await markAllNotificationsAsRead();
    setNotifications(updated);
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await markNotificationAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }
    setSelectedNotification(notif);
  };

  // Delete Single Read Notification
  const [isProcessing, setIsProcessing] = useState(false);

  const promptDeleteReadNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = notifications.find(n => n.id === id);
    if (!target) return;
    setDeleteTargetId(id);
  };

  const confirmDeleteReadNotification = async () => {
    if (!deleteTargetId || isProcessing) return;
    setIsProcessing(true);
    try {
      const updated = await deleteNotification(deleteTargetId);
      setNotifications(updated);
      setActionStatus("Notification deleted successfully.");
      setTimeout(() => setActionStatus(null), 4000);
    } catch (err: any) {
      console.error('[NotificationsPage] Delete failed:', err);
      setActionStatus(`Error: ${err.message || "Failed to delete notification."}`);
      setTimeout(() => setActionStatus(null), 6000);
    } finally {
      setIsProcessing(false);
      setDeleteTargetId(null);
    }
  };

  // Clear All Read Notifications
  const confirmClearAllRead = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const updated = await clearAllReadNotifications();
      setNotifications(updated);
      setActionStatus("All read notifications cleared.");
      setTimeout(() => setActionStatus(null), 4000);
    } catch (err: any) {
      console.error('[NotificationsPage] Clear read failed:', err);
      setActionStatus(`Error: ${err.message || "Failed to clear read notifications."}`);
      setTimeout(() => setActionStatus(null), 6000);
    } finally {
      setIsProcessing(false);
      setShowClearAllModal(false);
    }
  };

  // Filtering notifications
  const filteredNotifications = notifications.filter(n => {
    if (selectedFilter === 'Unread') return !n.isRead;
    if (selectedFilter === 'Academic') return n.category === 'Academic' || n.category === 'Leave';
    if (selectedFilter === 'Projects') return n.category === 'Projects';
    if (selectedFilter === 'System') return n.category === 'System';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const readCount = notifications.filter(n => n.isRead).length;

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading your notifications..." />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <ErrorState message={error} onRetry={fetchNotifications} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Communication</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Notifications</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Notification Center</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Real-time updates across assignments, assessments, attendance, leaves, and project milestones
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
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
              style={{ width: 'auto', backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', opacity: isProcessing ? 0.6 : 1 }}
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
        <div style={{ 
          padding: '0.75rem 1rem', 
          backgroundColor: actionStatus.startsWith('Error:') ? '#FEF2F2' : '#F0FDF4', 
          border: `1px solid ${actionStatus.startsWith('Error:') ? '#FCA5A5' : '#86EFAC'}`, 
          borderRadius: '8px', 
          color: actionStatus.startsWith('Error:') ? '#991B1B' : '#166534', 
          marginBottom: '1rem', 
          fontSize: '0.85rem',
          fontWeight: 500
        }}>
          {actionStatus}
        </div>
      )}

      {/* Filter Tabs */}
      <NotificationFilter 
        selectedFilter={selectedFilter}
        onSelectFilter={setSelectedFilter}
        unreadCount={unreadCount}
        totalCount={notifications.length}
      />

      {/* Notification List or Empty State */}
      {filteredNotifications.length === 0 ? (
        <EmptyState 
          title="No notifications yet."
          message={
            selectedFilter === 'Unread' 
              ? "You've read all your notifications!" 
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
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <NotificationDetailModal
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
      />

      {/* Single Read Notification Delete Confirmation Modal */}
      {deleteTargetId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: 0, marginBottom: '0.5rem', color: '#DC2626' }}>
              Delete notification?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', lineHeight: 1.5 }}>
              Are you sure you want to delete this notification? It will be permanently removed from your account.
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

      {/* Clear All Read Notifications Confirmation Modal */}
      {showClearAllModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '440px', padding: '1.5rem' }}>
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: 0, marginBottom: '0.5rem', color: '#DC2626' }}>
              Clear all read notifications?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', lineHeight: 1.5 }}>
              This will permanently remove your read notifications from your notification history. Unread notifications will remain intact.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowClearAllModal(false)} disabled={isProcessing}>Cancel</button>
              <button 
                className="btn" 
                style={{ backgroundColor: '#DC2626', color: '#FFF', border: '1px solid #DC2626', opacity: isProcessing ? 0.6 : 1 }}
                onClick={confirmClearAllRead}
                disabled={isProcessing}
              >
                {isProcessing ? 'Clearing...' : 'Clear Read Notifications'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default NotificationsPage;
