import React from 'react';

interface SemesterTrendItem {
  semester: number | string;
  averagePercent?: number;
  gpa?: number;
  target?: number;
}

interface PerformanceChartProps {
  trends: SemesterTrendItem[];
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ trends }) => {
  const maxVal = 100; // Use percentage scale (0-100)

  return (
    <div className="performance-chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Academic Performance Trend</h3>
          <p className="chart-subtitle">Semester-wise average performance percentage</p>
        </div>

        <div className="chart-legend font-mono">
          <span className="legend-item">
            <span className="legend-dot orange-dot" /> Actual Score
          </span>
          <span className="legend-item">
            <span className="legend-dot blue-dot" /> Target (75%)
          </span>
        </div>
      </div>

      {trends.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--brand-dark-grey)' }}>
          No semester trend data available yet.
        </div>
      ) : (
        <div className="chart-bars-container">
          {trends.map((item, idx) => {
            // Support both old (gpa, string semester) and new (averagePercent, number semester) formats
            const value = item.averagePercent ?? (item.gpa !== undefined ? (item.gpa / 10) * 100 : 0);
            const label = typeof item.semester === 'string'
              ? item.semester
              : `Sem ${item.semester}`;
            const heightPercent = Math.min(100, value);
            const isCurrent = typeof item.semester === 'string' && item.semester.includes('Current');
            const target = item.target ?? 75;

            return (
              <div key={idx} className="chart-bar-group">
                <span className="bar-value-label font-mono">{value.toFixed(1)}%</span>

                <div className="bar-track">
                  <div
                    className={`bar-fill ${isCurrent ? 'bar-current' : ''}`}
                    style={{ height: `${heightPercent}%` }}
                  />
                  <div
                    className="target-line"
                    style={{ bottom: `${(target / maxVal) * 100}%` }}
                    title={`Target: ${target}%`}
                  />
                </div>

                <span className={`bar-axis-label ${isCurrent ? 'font-bold' : ''}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
