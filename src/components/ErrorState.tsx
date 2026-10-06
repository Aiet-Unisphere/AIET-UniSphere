import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Failed to load information",
  message,
  onRetry
}) => {
  return (
    <div 
      className="error-state-card"
      style={{
        backgroundColor: '#fef2f2',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: '12px',
        padding: '2.5rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '1rem',
        width: '100%'
      }}
    >
      <div 
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: '#fee2e2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#dc2626'
        }}
      >
        <AlertTriangle size={26} />
      </div>
      <div style={{ maxWidth: '440px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.35rem' }}>{title}</h3>
        <p style={{ fontSize: '0.875rem', color: '#b91c1c', lineHeight: 1.5 }}>{message}</p>
      </div>
      {onRetry && (
        <button 
          onClick={onRetry} 
          className="btn font-sans" 
          style={{ width: 'auto', padding: '0.5rem 1.25rem', backgroundColor: '#dc2626', color: '#ffffff', border: 'none' }}
        >
          <RefreshCw size={16} />
          Try Again
        </button>
      )}
    </div>
  );
};

