import React from 'react';
import { Sparkles } from 'lucide-react';

interface AIInsightCardProps {
  insight: string;
  suggestedFocus: string;
}

export const AIInsightCard: React.FC<AIInsightCardProps> = ({ insight, suggestedFocus }) => {
  return (
    <div className="ai-insight-card">
      <div className="ai-badge">
        <Sparkles size={15} />
        <span>AI Academic Insight</span>
      </div>
      <p className="ai-insight-text">
        {insight}
      </p>
      <div style={{ marginTop: '0.35rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255, 79, 24, 0.12)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand-dark-grey)', letterSpacing: '0.05em' }}>
          Suggested Focus:
        </span>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-orange)' }}>
          {suggestedFocus}
        </span>
      </div>
    </div>
  );
};
export default AIInsightCard;

