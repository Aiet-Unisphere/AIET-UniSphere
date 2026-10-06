import React from 'react';
import type { TeamMember } from '../services/projectService';

interface ProjectTeamProps {
  members: TeamMember[];
}

export const ProjectTeam: React.FC<ProjectTeamProps> = ({ members }) => {
  return (
    <div className="team-grid">
      {members.map((member, idx) => (
        <div key={idx} className="team-member-card">
          <div className="team-avatar-circle">
            {member.name.split(' ').map(n => n[0]).join('')}
          </div>

          <div className="team-member-details">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--brand-black)' }}>
                {member.name}
              </span>
              {member.isOwner && (
                <span className="badge badge-active" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                  Project Lead
                </span>
              )}
            </div>
            
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--brand-orange)' }}>
              {member.role}
            </span>
            
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
              {member.contribution || 'Team member'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
