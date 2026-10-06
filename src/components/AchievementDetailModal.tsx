import React from 'react';
import { X, Award, CheckCircle2, Calendar, FileText } from 'lucide-react';
import type { StudentAchievement } from '../services/skillService';

interface AchievementDetailModalProps {
  achievement: StudentAchievement | null;
  onClose: () => void;
}

export const AchievementDetailModal: React.FC<AchievementDetailModalProps> = ({ achievement, onClose }) => {
  if (!achievement) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="badge badge-active font-mono">{achievement.category}</span>
            <h2 className="modal-title font-display" style={{ marginTop: '0.25rem' }}>{achievement.name}</h2>
          </div>

          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="font-sans" style={{ fontSize: '0.95rem', color: 'var(--brand-black)', lineHeight: 1.5 }}>
            {achievement.description || 'Achievement verified from your academic records.'}
          </p>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', padding: '0.75rem', background: 'var(--brand-light-grey)', borderRadius: 'var(--border-radius)' }}>
            <div>
              <span className="text-dark-grey font-mono" style={{ fontSize: '0.75rem' }}>Date Unlocked:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                <Calendar size={14} className="text-orange" />
                <span className="font-mono font-bold" style={{ fontSize: '0.85rem' }}>{new Date(achievement.earned_at).toLocaleDateString()}</span>
              </div>
            </div>

            <div>
              <span className="text-dark-grey font-mono" style={{ fontSize: '0.75rem' }}>Status:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                <CheckCircle2 size={14} className="text-success" />
                <span className="font-mono font-bold text-success" style={{ fontSize: '0.85rem' }}>Unlocked</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <h4 className="section-title font-display" style={{ fontSize: '0.95rem', marginBottom: '0.35rem' }}>
              Verification & Evidence
            </h4>
            <div style={{ padding: '0.85rem', border: '1px border var(--brand-border)', borderRadius: 'var(--border-radius)', background: 'var(--brand-white)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>
                {achievement.evidence_type || 'Academic record'}{achievement.evidence_id ? `: ${achievement.evidence_id}` : ''}
              </p>
              {achievement.evidence_id && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText size={13} className="text-blue" />
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--brand-blue)' }}>
                    Related Context: {achievement.evidence_id}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
};
