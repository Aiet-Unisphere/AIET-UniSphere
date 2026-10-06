import React from 'react';
import { Sparkles, Clock, ArrowRight, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { RecommendationItem } from '../services/learningService';

interface RecommendationCardProps {
  recommendation: RecommendationItem;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation }) => {
  const navigate = useNavigate();

  const getPriorityBadge = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return <span className="badge badge-overdue font-mono">High Priority</span>;
      case 'medium':
        return <span className="badge badge-pending font-mono">Medium</span>;
      case 'low':
      default:
        return <span className="badge badge-secondary font-mono">Low Priority</span>;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'Review Material': return 'Study Material';
      case 'Practice Quiz': return 'Practice Quiz';
      case 'Peer Study': return 'Peer Study';
      case 'Video Resource': return 'Video';
      case 'Consult Faculty': return 'Faculty Help';
      default: return type;
    }
  };

  const handleActionClick = () => {
    // Navigate to learning gaps or AI based on type
    if (recommendation.type === 'Practice Quiz') {
      navigate('/student/assessments');
    } else if (recommendation.type === 'Review Material') {
      navigate('/student/courses');
    } else if (recommendation.type === 'Consult Faculty') {
      navigate('/student/services');
    } else {
      navigate('/student/ai');
    }
  };

  return (
    <div className="recommendation-item-card">
      <div className="rec-card-top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span className="badge badge-active font-mono" style={{ gap: '0.2rem' }}>
            <Sparkles size={12} />
            <span>{getTypeLabel(recommendation.type)}</span>
          </span>
          {getPriorityBadge(recommendation.priority)}
        </div>

        {recommendation.estimatedTime && (
          <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>
            <Clock size={12} style={{ display: 'inline', marginRight: '0.2rem' }} />
            Est. {recommendation.estimatedTime}
          </span>
        )}
      </div>

      <h3 className="rec-title">{recommendation.topic}</h3>
      <p className="rec-reason font-sans">{recommendation.description}</p>

      <div className="rec-card-footer">
        <span className="font-mono text-dark-grey" style={{ fontSize: '0.8rem' }}>
          <BookOpen size={13} style={{ display: 'inline', marginRight: '0.25rem' }} />
          {recommendation.courseId} · {recommendation.courseName}
        </span>

        <button
          className="btn btn-primary"
          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
          onClick={handleActionClick}
        >
          <span>Take Action</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
