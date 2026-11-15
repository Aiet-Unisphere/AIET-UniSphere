import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  CheckCheck, 
  ArrowRight, 
  Clock, 
  CheckCircle2 
} from 'lucide-react';
import { 
  getRecentNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  type NotificationItem 
} from '../services/notificationService';
import { getNotificationIcon } from './NotificationCard';
import { resolveNotificationRoute } from '../utils/notificationNavigation';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount: number;
  userRole?: string;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  isOpen,
  onClose,
  unreadCount,
  userRole
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchRecent = async () => {
    setIsLoading(true);
    try {
      const data = await getRecentNotifications(6);
      setNotifications(data);
    } catch (err) {
      console.error('[NotificationDropdown] Failed to fetch recent notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecent();
    }
  }, [isOpen]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await markNotificationAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }
    onClose();

    const targetRoute = resolveNotificationRoute(notif.relatedLink, userRole);
    navigate(targetRoute);
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const getViewAllRoute = () => {
    if (userRole === 'HOD') return '/hod/notifications';
    if (userRole === 'FACULTY') return '/faculty/notifications';
    return '/student/notifications';
  };

  return (
    <div className="notifications-dropdown" ref={dropdownRef} role="dialog" aria-label="Notifications panel">
      {/* Header */}
      <div className="notifications-dropdown-header">
        <div className="notifications-dropdown-title">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="notifications-dropdown-unread-pill">
              {unreadCount} unread
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button 
            className="notifications-dropdown-mark-all"
            onClick={handleMarkAllRead}
            title="Mark all notifications as read"
          >
            <CheckCheck size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="notifications-dropdown-list">
        {isLoading ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>
            Loading updates...
          </div>
        ) : notifications.length === 0 ? (
          <div className="notifications-dropdown-empty">
            <Bell size={32} style={{ opacity: 0.35, color: 'var(--brand-grey)' }} />
            <span style={{ fontWeight: 600 }}>No notifications yet</span>
            <span style={{ fontSize: '0.775rem', color: 'var(--brand-dark-grey)' }}>
              You're all caught up with your academic updates.
            </span>
          </div>
        ) : (
          notifications.map((notif) => (
            <div 
              key={notif.id}
              className={`notifications-dropdown-item ${!notif.isRead ? 'unread' : ''}`}
              onClick={() => handleItemClick(notif)}
              role="button"
              tabIndex={0}
            >
              <div className={`notifications-dropdown-item-icon ${notif.type.toLowerCase()}`}>
                {getNotificationIcon(notif.type)}
              </div>

              <div className="notifications-dropdown-item-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="notifications-dropdown-item-title">
                    {notif.title}
                  </div>
                  {!notif.isRead && (
                    <span 
                      style={{ 
                        width: '7px', 
                        height: '7px', 
                        borderRadius: '50%', 
                        backgroundColor: 'var(--brand-orange)',
                        flexShrink: 0,
                        marginLeft: '0.5rem'
                      }} 
                    />
                  )}
                </div>

                <div className="notifications-dropdown-item-msg">
                  {notif.shortMessage}
                </div>

                <div className="notifications-dropdown-item-time font-mono">
                  <Clock size={11} style={{ display: 'inline', marginRight: '0.2rem' }} />
                  {notif.time}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="notifications-dropdown-footer">
        <button
          className="notifications-dropdown-footer-link"
          onClick={() => {
            onClose();
            navigate(getViewAllRoute());
          }}
        >
          <span>View All Notifications</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

