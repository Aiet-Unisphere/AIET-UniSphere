import React from 'react';
import { CheckCircle, Circle, Clock, User } from 'lucide-react';
import type { ProjectTask as ProjectTaskData } from '../services/projectService';

interface ProjectTaskProps {
  task: ProjectTaskData;
  onToggle?: (id: string) => void;
}

export const ProjectTask: React.FC<ProjectTaskProps> = ({ task, onToggle }) => {
  const getTaskStatusIcon = (status: ProjectTaskData['status']) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />;
      case 'In Progress':
        return <Clock size={16} style={{ color: 'var(--brand-orange)' }} />;
      case 'Todo':
      default:
        return <Circle size={16} style={{ color: 'var(--brand-grey)' }} />;
    }
  };

  return (
    <div 
      className={`project-task-card ${task.status.toLowerCase().replace(' ', '-')}`}
      onClick={() => onToggle && onToggle(task.id)}
      style={{ cursor: onToggle ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
        <div style={{ marginTop: '0.15rem' }}>
          {getTaskStatusIcon(task.status)}
        </div>
        <div style={{ flexGrow: 1 }}>
          <span 
            style={{ 
              fontSize: '0.9rem', 
              fontWeight: 600, 
              color: task.status === 'Completed' ? 'var(--brand-dark-grey)' : 'var(--brand-black)',
              textDecoration: task.status === 'Completed' ? 'line-through' : 'none'
            }}
          >
            {task.title}
          </span>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
            <span><User size={12} style={{ display: 'inline', marginRight: '0.2rem' }} />{task.assigned_to || 'Unassigned'}</span>
            <span>Due: {task.due_date || 'Not set'}</span>
          </div>
        </div>
        <span className={`badge ${task.status === 'Completed' ? 'badge-graded' : task.status === 'In Progress' ? 'badge-active' : 'badge-secondary'}`}>
          {task.status}
        </span>
      </div>
    </div>
  );
};
