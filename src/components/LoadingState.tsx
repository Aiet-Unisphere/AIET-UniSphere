import React from 'react';

interface LoadingStateProps {
  message?: string;
  type?: 'spinner' | 'cards' | 'dashboard';
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  message = "Loading information...",
  type = 'spinner'
}) => {
  if (type === 'cards' || type === 'dashboard') {
    return (
      <div style={{ width: '100%', padding: '1rem 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem', width: '100%' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: '#ffffff', border: '1px solid rgba(226, 232, 240, 0.9)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="skeleton-loader" style={{ height: '22px', width: '65%' }} />
              <div className="skeleton-loader" style={{ height: '14px', width: '90%' }} />
              <div className="skeleton-loader" style={{ height: '14px', width: '45%' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="state-container" style={{ padding: '5rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
      <div 
        className="spinner" 
        style={{ 
          width: '36px', 
          height: '36px', 
          borderWidth: '3px',
          borderColor: 'rgba(226, 232, 240, 0.9)',
          borderTopColor: 'var(--brand-orange)',
          borderRadius: '50%'
        }}
      ></div>
      <p style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--brand-dark-grey)' }}>
        {message}
      </p>
    </div>
  );
};

