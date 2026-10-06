import React from 'react';
import { X, CheckSquare, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TopicGapItem } from '../services/learningService';
import { ProgressBar } from './ProgressBar';

interface TopicDetailModalProps {
  topic: TopicGapItem | null;
  onClose: () => void;
}

export const TopicDetailModal: React.FC<TopicDetailModalProps> = ({ topic, onClose }) => {
  const navigate = useNavigate();

  if (!topic) return null;

  const handleAskAI = () => {
    onClose();
    navigate(`/student/ai?prompt=Explain%20${encodeURIComponent(topic.topic)}%20in%20${encodeURIComponent(topic.courseName)}`);
  };

  const severityColor = topic.severity === 'Critical' ? '#ef4444' : topic.severity === 'Moderate' ? '#f59e0b' : '#10b981';

  const recommendedActions: string[] = [];
  if (topic.severity === 'Critical' || topic.severity === 'Moderate') {
    recommendedActions.push(`Review lecture notes and study materials on "${topic.topic}".`);
    recommendedActions.push(`Practice additional questions on this topic.`);
  }
  if (topic.severity === 'Critical') {
    recommendedActions.push(`Schedule a consultation with your ${topic.courseName} faculty.`);
  }
  recommendedActions.push(`Ask the AI Learning Assistant to explain "${topic.topic}".`);
  recommendedActions.push(`Review your previous assessment answers for this topic.`);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-secondary font-mono">{topic.courseId}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>{topic.courseName}</span>
            </div>
            <h2 className="modal-title font-display" style={{ marginTop: '0.25rem' }}>{topic.topic}</h2>
          </div>

          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Performance Overview */}
          <div className="topic-perf-overview-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span className="font-mono text-dark-grey" style={{ fontSize: '0.85rem' }}>Current Topic Mastery:</span>
              <span className="font-mono font-bold" style={{ fontSize: '0.9rem', color: severityColor }}>
                {topic.scorePercent}%
              </span>
            </div>
            <ProgressBar progress={topic.scorePercent} />

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.825rem', flexWrap: 'wrap' }}>
              <div>
                <span className="text-dark-grey font-mono">Severity: </span>
                <span className="font-bold" style={{ color: severityColor }}>{topic.severity}</span>
              </div>
              <div>
                <span className="text-dark-grey font-mono">Correct: </span>
                <span className="font-bold text-success">{topic.correctAnswers}</span>
              </div>
              <div>
                <span className="text-dark-grey font-mono">Wrong: </span>
                <span className="font-bold text-error">{topic.wrongAnswers}</span>
              </div>
              <div>
                <span className="text-dark-grey font-mono">Total: </span>
                <span className="font-bold">{topic.totalQuestions}</span>
              </div>
            </div>
          </div>

          {/* Recommended Actions */}
          <div style={{ marginTop: '1rem' }}>
            <h4 className="section-title font-display" style={{ fontSize: '0.95rem' }}>Recommended Actions</h4>
            <ul style={{ listStyleType: 'none', padding: 0, marginTop: '0.35rem' }}>
              {recommendedActions.map((act, idx) => (
                <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.35rem', color: 'var(--brand-black)' }}>
                  <CheckSquare size={15} className="text-orange" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={handleAskAI}>
            <HelpCircle size={16} />
            <span>Ask AI about this topic</span>
          </button>

          <button className="btn btn-primary" onClick={onClose}>
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
};
