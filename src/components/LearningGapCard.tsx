import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, TrendingUp, ArrowRight } from 'lucide-react';
import type { TopicGapItem } from '../services/learningService';
import { ProgressBar } from './ProgressBar';

interface LearningGapCardProps {
  gap: TopicGapItem;
  onOpenDetail: (gap: TopicGapItem) => void;
}

export const LearningGapCard: React.FC<LearningGapCardProps> = ({ gap, onOpenDetail }) => {
  const getSeverityBadge = (severity: TopicGapItem['severity']) => {
    switch (severity) {
      case 'Critical':
        return (
          <span className="badge badge-overdue font-mono" style={{ gap: '0.2rem' }}>
            <AlertCircle size={13} />
            <span>Critical</span>
          </span>
        );
      case 'Moderate':
        return (
          <span className="badge badge-pending font-mono" style={{ gap: '0.2rem' }}>
            <AlertTriangle size={13} />
            <span>Needs Review</span>
          </span>
        );
      case 'Minor':
      default:
        return (
          <span className="badge badge-active font-mono" style={{ gap: '0.2rem' }}>
            <CheckCircle2 size={13} />
            <span>Minor Gap</span>
          </span>
        );
    }
  };

  return (
    <div className="learning-gap-item-card">
      <div className="gap-card-top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {getSeverityBadge(gap.severity)}
          <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>
            {gap.courseId} — {gap.courseName}
          </span>
        </div>

        <span className="font-mono font-bold" style={{ fontSize: '0.85rem', color: 'var(--brand-black)' }}>
          {gap.scorePercent}% avg
        </span>
      </div>

      <h3 className="gap-topic-title">{gap.topic}</h3>

      <div className="gap-progress-wrapper" style={{ margin: '0.5rem 0' }}>
        <ProgressBar progress={gap.scorePercent} showPercentage={false} />
      </div>

      <p className="gap-suggested-focus font-sans">
        <strong>Questions:</strong> {gap.correctAnswers} correct out of {gap.totalQuestions} ({gap.wrongAnswers} wrong)
      </p>

      <div className="gap-card-footer">
        <span className="font-mono text-dark-grey" style={{ fontSize: '0.8rem' }}>
          <TrendingUp size={13} style={{ display: 'inline', marginRight: '0.25rem' }} />
          {gap.trend || 'Stable'}
        </span>

        <button
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          onClick={() => onOpenDetail(gap)}
        >
          <span>View Details</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
