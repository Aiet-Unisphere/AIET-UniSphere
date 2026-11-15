import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import type { NotificationItem } from '../data/notifications';
import { getNotificationIcon } from './NotificationCard';
import { markNotificationAsRead, playNotificationSound } from '../services/notificationService';
import { resolveNotificationRoute } from '../utils/notificationNavigation';

interface ToastItem {
  id: string;
  notification: NotificationItem;
  createdAt: number;
}

interface NotificationToastContainerProps {
  userRole?: string;
}

export const NotificationToastContainer: React.FC<NotificationToastContainerProps> = ({ userRole }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    const handleNewAlert = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationItem>;
      const notif = customEvent.detail;
      if (!notif || !notif.id) return;

      // Prevent duplicate alert alerts within a 15-second window
      if (seenIdsRef.current.has(notif.id)) return;
      seenIdsRef.current.add(notif.id);

      // Play subtle chime if allowed by user preference
      playNotificationSound();

      const newToast: ToastItem = {
        id: notif.id,
        notification: notif,
        createdAt: Date.now()
      };

      // Keep maximum 3 toasts visible simultaneously to avoid clutter
      setToasts(prev => [...prev.slice(-2), newToast]);

      // Automatically dismiss the toast after 6 seconds
      setTimeout(() => {
        dismissToast(notif.id);
      }, 6000);
    };

    window.addEventListener('new_notification_alert', handleNewAlert);
    return () => {
      window.removeEventListener('new_notification_alert', handleNewAlert);
    };
  }, []);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleToastClick = async (toast: ToastItem) => {
    dismissToast(toast.id);
    if (!toast.notification.isRead) {
      await markNotificationAsRead(toast.notification.id);
    }
    const target = resolveNotificationRoute(toast.notification.relatedLink, userRole);
    navigate(target);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="notification-toasts-container" role="region" aria-live="polite" aria-label="Notification alerts">
      {toasts.map((toast) => {
        const typeKey = (toast.notification.type || 'system').toLowerCase();

        return (
          <div 
            key={toast.id}
            className="notification-toast-card"
            onClick={() => handleToastClick(toast)}
            role="alert"
          >
            <div className="notification-toast-icon-col">
              <div className={`notification-icon-wrapper ${typeKey}`} style={{ width: '34px', height: '34px' }}>
                {getNotificationIcon(toast.notification.type)}
              </div>
            </div>

            <div className="notification-toast-content">
              <div className="notification-toast-header">
                <span className="notification-type-badge">{toast.notification.type}</span>
                <span className="notification-toast-time">Just now</span>
              </div>
              <h5 className="notification-toast-title">{toast.notification.title}</h5>
              <p className="notification-toast-message">{toast.notification.shortMessage}</p>
            </div>

            <button 
              className="notification-toast-close"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.id);
              }}
              aria-label="Dismiss alert"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

