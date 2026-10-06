import React from 'react';
import { EmptyState } from './EmptyState';

export interface ActivityEvent {
  id: string;
  timeGroup: string;
  title: string;
  description?: string;
  type?: 'commit' | 'milestone' | 'documentation' | 'branch' | 'task';
}

export const ProjectTimeline: React.FC<{ events: ActivityEvent[] }> = ({ events }) => {
  if (events.length === 0) {
    return <EmptyState title="No activity recorded" message="Project activity will appear after tasks or milestones are updated." />;
  }
  return (
    <div className="activity-timeline">
      {events.map((event) => (
        <div key={event.id} className="timeline-item">
          <div className="timeline-badge font-mono">{event.timeGroup}</div>
          <div className="timeline-content-card">
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--brand-black)' }}>
              {event.title}
            </h4>
            {event.description && (
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
                {event.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
