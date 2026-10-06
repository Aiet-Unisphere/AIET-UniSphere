import React, { useState, useEffect } from 'react';
import { Sparkles, Filter } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { RecommendationCard } from '../components/RecommendationCard';
import type { RecommendationItem } from '../services/learningService';
import { getRecommendations } from '../services/learningService';

export const RecommendationsPage: React.FC = () => {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const data = await getRecommendations(categoryFilter);
      setRecommendations(data);
      setIsLoading(false);
    };
    loadData();
  }, [categoryFilter]);

  const categories = ['All', 'Courses', 'Topics', 'Practice', 'Assessments', 'Materials'];

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Intelligence</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Recommendations</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <Sparkles size={24} className="text-orange" />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>RECOMMENDED FOR YOU</h1>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Actionable learning steps curated based on recent assessment performance and topic practice gaps.
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="category-tabs-container" style={{ marginBottom: '1.25rem' }}>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`tab-item ${categoryFilter === cat ? 'active' : ''}`}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState message="Generating personalized learning recommendations..." />
      ) : recommendations.length === 0 ? (
        <EmptyState
          title="No Recommendations Available"
          message="No active recommendations for the selected category."
        />
      ) : (
        <div className="recommendations-grid">
          {recommendations.map((rec) => (
            <RecommendationCard key={rec.id} recommendation={rec} />
          ))}
        </div>
      )}
    </AppShell>
  );
};

export default RecommendationsPage;
