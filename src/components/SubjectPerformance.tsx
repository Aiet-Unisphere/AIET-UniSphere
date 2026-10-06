import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ProgressBar } from './ProgressBar';

interface SubjectPerformanceItem {
  id?: string;
  subject?: string;    // new service field
  name?: string;       // old data field
  code?: string;       // old data field
  courseId?: string;
  average?: number;    // old field (0-100)
  scorePercent?: number; // new field (0-100)
  grade?: string;
  trend?: 'Improving' | 'Needs Attention' | 'Stable';
  trendValue?: string;
  topicsAnalyzed?: number;
}

interface SubjectPerformanceProps {
  subjects: SubjectPerformanceItem[];
}

export const SubjectPerformance: React.FC<SubjectPerformanceProps> = ({ subjects }) => {
  const getTrendBadge = (trend: string | undefined, val: string) => {
    switch (trend) {
      case 'Improving':
        return (
          <span className="badge badge-active" style={{ fontSize: '0.75rem', gap: '0.2rem' }}>
            <TrendingUp size={13} />
            <span>Improving ({val})</span>
          </span>
        );
      case 'Needs Attention':
        return (
          <span className="badge badge-overdue" style={{ fontSize: '0.75rem', gap: '0.2rem' }}>
            <TrendingDown size={13} />
            <span>Needs Attention ({val})</span>
          </span>
        );
      case 'Stable':
      default:
        return (
          <span className="badge badge-secondary" style={{ fontSize: '0.75rem', gap: '0.2rem' }}>
            <Minus size={13} />
            <span>Stable ({val})</span>
          </span>
        );
    }
  };

  return (
    <div className="subject-performance-card">
      <div className="card-header-bar">
        <h3 className="card-title font-display">Subject Level Performance</h3>
        <span className="font-mono text-dark-grey" style={{ fontSize: '0.8rem' }}>
          {subjects.length} subjects
        </span>
      </div>

      {subjects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--brand-dark-grey)', fontSize: '0.875rem' }}>
          No subject performance data yet. Complete some assessments to see your performance breakdown.
        </div>
      ) : (
        <div className="subject-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Average Score</th>
                <th>Questions</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub, idx) => {
                const displayName = sub.subject || sub.name || 'Unknown Course';
                const displayCode = sub.code || sub.courseId || '';
                const avgScore = sub.scorePercent ?? sub.average ?? 0;
                const trendVal = sub.trendValue || `${avgScore}%`;

                return (
                  <tr key={sub.id || `${idx}-${displayName}`}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{displayName}</span>
                        {displayCode && (
                          <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>{displayCode}</span>
                        )}
                      </div>
                    </td>

                    <td style={{ width: '220px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span className="font-mono font-bold" style={{ fontSize: '0.85rem' }}>{avgScore}%</span>
                        <ProgressBar progress={avgScore} showPercentage={false} />
                      </div>
                    </td>

                    <td>
                      <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                        {sub.topicsAnalyzed ?? (sub.grade ? `Grade: ${sub.grade}` : '—')}
                        {sub.topicsAnalyzed !== undefined && ' topics'}
                      </span>
                    </td>

                    <td>
                      {getTrendBadge(sub.trend, trendVal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
