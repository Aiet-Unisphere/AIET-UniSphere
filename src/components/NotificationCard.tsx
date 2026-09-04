import React from 'react';
import { 
  ClipboardList, 
  FileCheck2, 
  CalendarCheck, 
  FileText, 
  Megaphone, 
  BookOpen, 
  FolderGit2, 
  UserCheck, 
  ShieldAlert,
  Clock,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import type { NotificationItem, NotificationType } from '../data/notifications';

interface NotificationCardProps {
  notification: NotificationItem;
  onClick: (notification: NotificationItem) => void;
  onMarkRead: (id: string, e: React.MouseEvent) => void;
  onDeleteRead?: (id: string, e: React.MouseEvent) => void;
}

export const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'Assignment':
      return <ClipboardList size={18} className="text-blue-icon" />;
    case 'Assessment':
      return <FileCheck2 size={18} className="text-orange-icon" />;
    case 'Attendance':
      return <CalendarCheck size={18} className="text-orange-icon" />;
    case 'Leave':
      return <FileText size={18} className="text-blue-icon" />;
    case 'Announcement':
      return <Megaphone size={18} className="text-orange-icon" />;
    case 'Course':
      return <BookOpen size={18} className="text-blue-icon" />;
    case 'Project':
      return <FolderGit2 size={18} className="text-orange-icon" />;
    case 'Faculty':
      return <UserCheck size={18} className="text-blue-icon" />;
    case 'System':
    default:
      return <ShieldAlert size={18} className="text-dark-icon" />;
  }
};

export const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onClick,
  onMarkRead,
  onDeleteRead
}) => {
  return (
    <div 
      className={`notification-item-card ${!notification.isRead ? 'unread' : ''}`}
      onClick={() => onClick(notification)}
    >
      <div className="notification-card-icon-col">
        <div className={`notification-icon-wrapper ${notification.type.toLowerCase()}`}>
          {getNotificationIcon(notification.type)}
        </div>
      </div>

      <div className="notification-card-content">
        <div className="notification-header-line">
          <span className="notification-type-badge">{notification.type}</span>
          {notification.priority === 'high' && (
            <span className="badge badge-overdue" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
              High Priority
            </span>
          )}
          <span className="notification-time font-mono">
            <Clock size={12} style={{ display: 'inline', marginRight: '0.2rem' }} />
            {notification.time}
          </span>
        </div>

        <h4 className="notification-title">{notification.title}</h4>
        <p className="notification-message">{notification.shortMessage}</p>

        <div className="notification-meta-row">
          <span className="notification-source">From: {notification.source}</span>
          
          <div className="notification-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!notification.isRead ? (
              <button 
                className="btn-mark-read"
                onClick={(e) => onMarkRead(notification.id, e)}
                title="Mark as read"
              >
                <CheckCircle2 size={14} />
                <span>Mark read</span>
              </button>
            ) : (
              onDeleteRead && (
                <button
                  className="btn-delete-notif"
                  onClick={(e) => onDeleteRead(notification.id, e)}
                  title="Delete read notification"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    color: '#DC2626',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
