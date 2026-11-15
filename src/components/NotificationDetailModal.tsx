import React from 'react';
import { X, Clock, User, ExternalLink, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { NotificationItem } from '../data/notifications';
import { getNotificationIcon } from './NotificationCard';
import { resolveNotificationRoute } from '../utils/notificationNavigation';

interface NotificationDetailModalProps {
  notification: NotificationItem | null;
  onClose: () => void;
  userRole?: string;
}

export const NotificationDetailModal: React.FC<NotificationDetailModalProps> = ({
  notification,
  onClose,
  userRole
}) => {
  const navigate = useNavigate();

  if (!notification) return null;

  const handleOpenRelated = () => {
    if (notification.relatedLink) {
      const target = resolveNotificationRoute(notification.relatedLink, userRole);
      onClose();
      navigate(target);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content notification-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className={`notification-icon-wrapper ${(notification.type || '').toLowerCase()}`}>
              {getNotificationIcon(notification.type)}
            </div>
            <div>
              <span className="notification-type-badge">{notification.type}</span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.2rem' }}>
                {notification.title}
              </h3>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="notification-detail-meta-grid">
            <div className="meta-item">
              <Clock size={14} className="meta-icon" />
              <span>Received: <strong>{notification.time}</strong></span>
            </div>
            <div className="meta-item">
              <User size={14} className="meta-icon" />
              <span>Source: <strong>{notification.source}</strong></span>
            </div>
            <div className="meta-item">
              <Tag size={14} className="meta-icon" />
              <span>Category: <strong>{notification.category}</strong></span>
            </div>
          </div>

          <div className="notification-full-message-box">
            <p style={{ whiteSpace: 'pre-line', fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--brand-black)' }}>
              {notification.fullMessage}
            </p>
          </div>

          {notification.relatedItem && (
            <div className="notification-related-card">
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--brand-dark-grey)' }}>
                Related Item
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '0.25rem' }}>
                {notification.relatedItem.type}: {notification.relatedItem.title}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {notification.relatedLink ? (
            <button 
              className="btn btn-primary"
              style={{ width: 'auto' }}
              onClick={handleOpenRelated}
            >
              <ExternalLink size={16} />
              Open Related Feature
            </button>
          ) : (
            <div />
          )}

          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
