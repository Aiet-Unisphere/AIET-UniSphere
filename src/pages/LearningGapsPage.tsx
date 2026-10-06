import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Search, Sparkles } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { LearningGapCard } from '../components/LearningGapCard';
import { TopicDetailModal } from '../components/TopicDetailModal';
import type { TopicGapItem } from '../services/learningService';
import { getLearningGaps } from '../services/learningService';

export const LearningGapsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const topicParam = searchParams.get('topic');

  const [gaps, setGaps] = useState<TopicGapItem[]>([]);
  const [filteredGaps, setFilteredGaps] = useState<TopicGapItem[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TopicGapItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const data = await getLearningGaps();
      setGaps(data);
      setFilteredGaps(data);

      if (topicParam) {
        const found = data.find(g => g.id === topicParam);
        if (found) {
          setSelectedTopic(found);
        }
      }

      setIsLoading(false);
    };
    loadData();
  }, [topicParam]);

  useEffect(() => {
    let result = [...gaps];

    // Filter by severity (mapped from old status filter)
    if (statusFilter !== 'All') {
      const severityMap: Record<string, string> = {
        'needs practice': 'Critical',
        'needs review': 'Moderate',
        'moderate': 'Moderate',
        'strong': 'Minor',
      };
      const targetSeverity = severityMap[statusFilter.toLowerCase()];
      if (targetSeverity) {
        result = result.filter(g => g.severity === targetSeverity);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(g =>
        g.topic.toLowerCase().includes(q) ||
        g.courseName.toLowerCase().includes(q) ||
        g.courseId.toLowerCase().includes(q)
      );
    }

    setFilteredGaps(result);
  }, [searchQuery, statusFilter, gaps]);

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Intelligence</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Learning Gaps</span>
          </div>

          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Identified Learning Gaps</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Topics and sub-modules where additional practice, review, or study materials are recommended.
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="filter-search-container" style={{ marginBottom: '1.25rem' }}>
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input font-sans"
            placeholder="Search topic or course name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-select-wrapper">
          <select
            className="form-control filter-select font-sans"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="needs practice">Needs Practice</option>
            <option value="needs review">Needs Review</option>
            <option value="moderate">Moderate</option>
            <option value="strong">Strong</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Analyzing learning gaps and topic mastery..." />
      ) : filteredGaps.length === 0 ? (
        <EmptyState
          title="No Learning Gaps Found"
          message="No topic gaps match your filter settings."
        />
      ) : (
        <div className="learning-gaps-grid">
          {filteredGaps.map((gap) => (
            <LearningGapCard
              key={gap.id}
              gap={gap}
              onOpenDetail={setSelectedTopic}
            />
          ))}
        </div>
      )}

      {/* Topic Detail Modal */}
      <TopicDetailModal
        topic={selectedTopic}
        onClose={() => setSelectedTopic(null)}
      />
    </AppShell>
  );
};

export default LearningGapsPage;
