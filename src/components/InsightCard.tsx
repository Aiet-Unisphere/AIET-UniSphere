import React from 'react';
import { Award, AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';

// Supports both old PerformanceInsights format and new { strengths, gaps, recommendations } format
interface PerformanceInsightsFlexible {
  // Old format
  strongestArea?: { subject: string; score: number; details: string };
  needsAttention?: { subject: string; score: number; details: string };
  improving?: { subject: string; score: number; details: string };
  // New format
  strengths?: string[];
  gaps?: string[];
  recommendations?: string[];
}

interface InsightCardProps {
  insights: PerformanceInsightsFlexible;
}

export const InsightCard: React.FC<InsightCardProps> = ({ insights }) => {
  // Detect which format we're using
  const isNewFormat = insights.strengths !== undefined || insights.gaps !== undefined;

  if (isNewFormat) {
    // Render new list-based insight format
    const strengths = insights.strengths || [];
    const gaps = insights.gaps || [];
    const recommendations = insights.recommendations || [];

    return (
      <div className="performance-insights-container">
        <h3 className="section-title font-display mb-3">PERFORMANCE INSIGHTS</h3>

        <div className="insights-grid">
          {strengths.length > 0 && (
            <div className="insight-card-item strongest font-sans">
              <div className="insight-header">
                <div className="insight-icon-bg green-bg">
                  <Award size={18} className="text-success" />
                </div>
                <div>
                  <span className="insight-type-label font-mono">Strengths</span>
                  <h4 className="insight-subject">What You're Doing Well</h4>
                </div>
              </div>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {strengths.map((s, i) => (
                  <li key={i} style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {gaps.length > 0 && (
            <div className="insight-card-item attention font-sans">
              <div className="insight-header">
                <div className="insight-icon-bg red-bg">
                  <AlertTriangle size={18} className="text-error" />
                </div>
                <div>
                  <span className="insight-type-label font-mono">Needs Attention</span>
                  <h4 className="insight-subject">Areas to Improve</h4>
                </div>
              </div>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {gaps.map((g, i) => (
                  <li key={i} style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="insight-card-item improving font-sans">
              <div className="insight-header">
                <div className="insight-icon-bg orange-bg">
                  <CheckCircle size={18} className="text-orange" />
                </div>
                <div>
                  <span className="insight-type-label font-mono">Action Items</span>
                  <h4 className="insight-subject">Recommended Next Steps</h4>
                </div>
              </div>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {recommendations.map((r, i) => (
                  <li key={i} style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Legacy old format rendering
  return (
    <div className="performance-insights-container">
      <h3 className="section-title font-display mb-3">PERFORMANCE INSIGHTS</h3>

      <div className="insights-grid">
        {insights.strongestArea && (
          <div className="insight-card-item strongest font-sans">
            <div className="insight-header">
              <div className="insight-icon-bg green-bg">
                <Award size={18} className="text-success" />
              </div>
              <div>
                <span className="insight-type-label font-mono">Strongest Area</span>
                <h4 className="insight-subject">{insights.strongestArea.subject}</h4>
              </div>
            </div>
            <div className="insight-metric font-mono text-success">
              {insights.strongestArea.score}% avg
            </div>
            <p className="insight-details">{insights.strongestArea.details}</p>
          </div>
        )}

        {insights.needsAttention && (
          <div className="insight-card-item attention font-sans">
            <div className="insight-header">
              <div className="insight-icon-bg red-bg">
                <AlertTriangle size={18} className="text-error" />
              </div>
              <div>
                <span className="insight-type-label font-mono">Needs Attention</span>
                <h4 className="insight-subject">{insights.needsAttention.subject}</h4>
              </div>
            </div>
            <div className="insight-metric font-mono text-error">
              {insights.needsAttention.score}% avg
            </div>
            <p className="insight-details">{insights.needsAttention.details}</p>
          </div>
        )}

        {insights.improving && (
          <div className="insight-card-item improving font-sans">
            <div className="insight-header">
              <div className="insight-icon-bg orange-bg">
                <TrendingUp size={18} className="text-orange" />
              </div>
              <div>
                <span className="insight-type-label font-mono">Improving</span>
                <h4 className="insight-subject">{insights.improving.subject}</h4>
              </div>
            </div>
            <div className="insight-metric font-mono text-orange">
              {insights.improving.score}% score
            </div>
            <p className="insight-details">{insights.improving.details}</p>
          </div>
        )}
      </div>
    </div>
  );
};
