import React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  description?: string; // alias for message for broader compatibility
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No information found',
  message,
  description,
  icon: Icon = Inbox,
  actionLabel,
  onAction,
}) => {
  const displayMessage = message || description || '';

  return (
    <div 
      className="empty-state-card"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        borderRadius: '12px',
        padding: '3rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '1rem',
        width: '100%',
        boxShadow: 'var(--box-shadow-sm)'
      }}
    >
      <div 
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b'
        }}
      >
        <Icon size={26} />
      </div>
      <div style={{ maxWidth: '420px' }}>
        <h3 className="state-title" style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>{title}</h3>
        {displayMessage && <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', lineHeight: 1.5 }}>{displayMessage}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="btn btn-secondary font-sans"
          style={{ width: 'auto', padding: '0.5rem 1.25rem', marginTop: '0.25rem' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

