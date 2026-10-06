import React, { useState, useEffect } from 'react';
import { HODAppShell } from '../components/HODAppShell';
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

export const HODNotificationsPage: React.FC = () => {
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
      console.error('[HODNotificationsPage] Error fetching notifications:', err);
      setError("Unable to load department notifications. Please try again.");
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
      console.error('[HODNotificationsPage] Failed to mark read:', err);
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
      console.error('[HODNotificationsPage] Failed to mark all read:', err);
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
      setActionStatus("Notification deleted successfully.");
      setTimeout(() => setActionStatus(null), 4000);
    } catch (err: any) {
      console.error('[HODNotificationsPage] Delete failed:', err);
      setActionStatus(`Error: ${err.message || "Failed to delete notification."}`);
      setTimeout(() => setActionStatus(null), 6000);
    } finally {
      setIsProcessing(false);
      setDeleteTargetId(null);
    }
  };

  const confirmClearAllRead = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const updated = await clearAllReadNotifications();
      setNotifications(updated);
      notifyHeaderUpdate();
      setActionStatus("All read notifications cleared.");
      setTimeout(() => setActionStatus(null), 4000);
    } catch (err: any) {
      console.error('[HODNotificationsPage] Clear read failed:', err);
      setActionStatus(`Error: ${err.message || "Failed to clear read notifications."}`);
      setTimeout(() => setActionStatus(null), 6000);
    } finally {
      setIsProcessing(false);
      setShowClearAllModal(false);
    }
  };

  // Filter notifications
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
      <HODAppShell>
        <LoadingState message="Loading department notifications..." />
      </HODAppShell>
    );
  }

  if (error) {
    return (
      <HODAppShell>
        <ErrorState message={error} onRetry={fetchNotifications} />
      </HODAppShell>
    );
  }

  return (
    <HODAppShell>
      {/* Header */}
      <div className="page-header-container" style={{ marginBottom: '1.5rem' }}>
        <div>
          <div className="breadcrumbs" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-active font-mono">DEPARTMENT HEAD PORTAL</span>
          </div>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
            Notifications
          </h1>
          <p style={{ fontSize: '0.925rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            Your latest academic and department notifications
          </p>
        </div>

        {/* Global Action Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {unreadCount > 0 && (
            <button 
              className="btn btn-secondary" 
              onClick={handleMarkAllRead}
              style={{ fontSize: '0.85rem' }}
            >
              <CheckCheck size={16} />
              <span>Mark all as read</span>
            </button>
          )}

          {readCount > 0 && (
            <button 
              className="btn btn-secondary text-danger" 
              onClick={() => setShowClearAllModal(true)}
              style={{ fontSize: '0.85rem' }}
            >
              <Trash2 size={16} />
              <span>Clear read</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionStatus && (
        <div className="alert-banner info" style={{ marginBottom: '1.25rem' }}>
          <span>{actionStatus}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <NotificationFilter
          selectedFilter={selectedFilter}
          onSelectFilter={setSelectedFilter}
          unreadCount={unreadCount}
          totalCount={notifications.length}
        />
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet."
          description={
            selectedFilter === 'Unread' 
              ? "You've read all your department notifications!" 
              : "No notifications found for the selected filter."
          }
        />
      ) : (
        <div className="notifications-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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

      {/* Notification Detail Modal */}
      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
        />
      )}

      {/* Delete Single Read Notification Confirmation Modal */}
      {deleteTargetId && (
        <div className="modal-backdrop" onClick={() => setDeleteTargetId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Delete Notification?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginBottom: '1.25rem' }}>
              Are you sure you want to delete this notification record? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setDeleteTargetId(null)}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={confirmDeleteReadNotification}
                disabled={isProcessing}
                style={{ backgroundColor: 'var(--brand-danger, #ef4444)', borderColor: 'var(--brand-danger, #ef4444)' }}
              >
                {isProcessing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Read Confirmation Modal */}
      {showClearAllModal && (
        <div className="modal-backdrop" onClick={() => setShowClearAllModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Clear Read Notifications?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginBottom: '1.25rem' }}>
              This will permanently delete all read notifications ({readCount}) for your account. Unread notifications will remain intact.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowClearAllModal(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={confirmClearAllRead}
                disabled={isProcessing}
                style={{ backgroundColor: 'var(--brand-danger, #ef4444)', borderColor: 'var(--brand-danger, #ef4444)' }}
              >
                {isProcessing ? 'Clearing...' : 'Clear All Read'}
              </button>
            </div>
          </div>
        </div>
      )}
    </HODAppShell>
  );
};

export default HODNotificationsPage;
