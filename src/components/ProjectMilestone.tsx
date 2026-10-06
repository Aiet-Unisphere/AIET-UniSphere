import React from 'react';
import { Calendar, CheckCircle2, Clock } from 'lucide-react';
import type { ProjectMilestone as ProjectMilestoneData } from '../services/projectService';

interface ProjectMilestoneProps {
  milestone: ProjectMilestoneData;
}

export const ProjectMilestone: React.FC<ProjectMilestoneProps> = ({ milestone }) => {
  return (
    <div className={`milestone-item-card ${milestone.status.toLowerCase().replace(' ', '-')}`}>
      <div className="milestone-status-icon">
        {milestone.status === 'Completed' ? (
          <CheckCircle2 size={20} style={{ color: 'var(--color-success)' }} />
        ) : milestone.status === 'In Progress' ? (
          <Clock size={20} style={{ color: 'var(--brand-orange)' }} />
        ) : (
          <Calendar size={20} style={{ color: 'var(--brand-grey)' }} />
        )}
      </div>

      <div className="milestone-info">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--brand-black)' }}>
            {milestone.title}
          </h4>
          <span className={`badge ${milestone.status === 'Completed' ? 'badge-graded' : milestone.status === 'In Progress' ? 'badge-active' : 'badge-secondary'}`}>
            {milestone.status}
          </span>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
          {milestone.description}
        </p>
        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)' }}>
          Target Deadline: {milestone.due_date || 'Not set'}
          {milestone.completed_at && (
            <span style={{ color: 'var(--color-success)', marginLeft: '0.75rem' }}>
              Completed on {new Date(milestone.completed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
