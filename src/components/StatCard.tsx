import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  accentColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, subtitle }) => {
  return (
    <div className="stat-card">
      <div className="stat-label-row">
        <span className="stat-card-title">{title}</span>
        <div className="stat-icon-wrapper">{icon}</div>
      </div>
      <span className="stat-card-value">{value}</span>
      {subtitle && (
        <span className="stat-card-subtitle" style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem', display: 'block' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
};

