import React from 'react';
import { Award, Trophy, Code, GitMerge, CalendarCheck, FolderCheck, FileText, ArrowRight } from 'lucide-react';
import type { StudentAchievement } from '../services/skillService';

interface AchievementCardProps {
  achievement: StudentAchievement;
  onOpenDetail: (achievement: StudentAchievement) => void;
}

export const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, onOpenDetail }) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'star':
      case 'award':
        return <Trophy size={20} className="text-orange" />;
      case 'github':
        return <Code size={20} className="text-blue" />;
      case 'clipboard':
        return <GitMerge size={20} className="text-orange" />;
      case 'calendar-check':
      case 'calendar':
        return <CalendarCheck size={20} className="text-blue" />;
      case 'folder':
        return <FolderCheck size={20} className="text-orange" />;
      case 'file-text':
        return <FileText size={20} className="text-blue" />;
      case 'Award':
      default:
        return <Award size={20} className="text-orange" />;
    }
  };

  return (
    <div className="achievement-card-item">
      <div className="achievement-top-row">
        <div className="achievement-icon-box">
          {getIcon(achievement.icon)}
        </div>

        <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>
          {achievement.category}
        </span>
      </div>

      <h3 className="achievement-title">{achievement.name}</h3>
      <p className="achievement-desc font-sans">{achievement.description || 'Achievement verified from your academic records.'}</p>

      <div className="achievement-footer font-mono">
        <span className="text-dark-grey" style={{ fontSize: '0.75rem' }}>{new Date(achievement.earned_at).toLocaleDateString()}</span>

        <button 
          className="btn btn-secondary" 
          style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
          onClick={() => onOpenDetail(achievement)}
        >
          <span>Details</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
};
