import React, { useState, useEffect } from 'react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { LoadingState } from '../../components/LoadingState';
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
  clearAllReadNotifications
} from '../../services/notificationService';
import { CheckCheck, Trash2, Bell } from 'lucide-react';

export const FacultyNotificationsPage: React.FC = () => {
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

  const fetchNotifications = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error('[FacultyNotificationsPage] Error fetching notifications:', err);
      setError("Unable to load faculty notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

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
      console.error('[FacultyNotificationsPage] Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const updated = await markAllNotificationsAsRead();
      setNotifications(updated);
      notifyHeaderUpdate();
      setActionStatus("All notifications marked as read.");
      setTimeout(() => setActionStatus(null), 4000);
    } catch (err) {
      console.error('[FacultyNotificationsPage] Failed to mark all read:', err);
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
      console.error('[FacultyNotificationsPage] Delete failed:', err);
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
      console.error('[FacultyNotificationsPage] Clear read failed:', err);
    } finally {
      setIsProcessing(false);
      setShowClearAllModal(false);
    }
  };

  // Filter items
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
      <FacultyAppShell>
        <LoadingState message="Loading faculty notifications..." />
      </FacultyAppShell>
    );
  }

  if (error) {
    return (
      <FacultyAppShell>
        <ErrorState message={error} onRetry={fetchNotifications} />
      </FacultyAppShell>
    );
  }

  return (
    <FacultyAppShell>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>FACULTY NOTIFICATIONS</span>
              {unreadCount > 0 && (
                <span className="badge badge-pending font-mono" style={{ fontSize: '0.7rem' }}>
                  {unreadCount} UNREAD
                </span>
              )}
            </div>
            <h1 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
              Notifications &amp; Alerts
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
              Stay informed on departmental announcements, course updates, student submissions, and system alerts.
            </p>
          </div>

          {/* Top Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="btn btn-secondary"
                style={{ fontSize: '0.825rem', padding: '0.5rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <CheckCheck size={16} />
                <span>Mark All Read</span>
              </button>
            )}

            {readCount > 0 && (
              <button
                type="button"
                onClick={() => setShowClearAllModal(true)}
                className="btn btn-secondary"
                style={{ fontSize: '0.825rem', padding: '0.5rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#dc2626' }}
              >
                <Trash2 size={16} />
                <span>Clear Read</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action Toast Feedback */}
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
      <div style={{ marginBottom: '1.25rem' }}>
        <NotificationFilter
          selectedFilter={selectedFilter}
          onSelectFilter={setSelectedFilter}
          unreadCount={unreadCount}
          totalCount={notifications.length}
        />
      </div>

      {/* Main Notification Content */}
      {filteredNotifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={selectedFilter === 'Unread' ? "No Unread Notifications" : "No Notifications"}
          description={
            selectedFilter === 'Unread'
              ? "You're all caught up! There are no unread notifications right now."
              : "You have no notifications matching this filter."
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
        />
      )}

      {/* Single Item Delete Confirmation Modal */}
      {deleteTargetId && (
        <div className="modal-overlay" onClick={() => !isProcessing && setDeleteTargetId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--brand-black)' }}>
              Delete Notification?
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginBottom: '1.25rem' }}>
              Are you sure you want to remove this read notification?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteTargetId(null)}
                disabled={isProcessing}
                style={{ fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmDeleteReadNotification}
                disabled={isProcessing}
                style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: '0.85rem' }}
              >
                {isProcessing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Read Confirmation Modal */}
      {showClearAllModal && (
        <div className="modal-overlay" onClick={() => !isProcessing && setShowClearAllModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--brand-black)' }}>
              Clear All Read Notifications?
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginBottom: '1.25rem' }}>
              This will permanently delete all read notifications from your list. Unread notifications will not be affected.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowClearAllModal(false)}
                disabled={isProcessing}
                style={{ fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmClearAllReadNotifications}
                disabled={isProcessing}
                style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: '0.85rem' }}
              >
                {isProcessing ? 'Clearing...' : 'Clear All Read'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FacultyAppShell>
  );
};

export default FacultyNotificationsPage;
