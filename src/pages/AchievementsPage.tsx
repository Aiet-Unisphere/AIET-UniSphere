import React, { useState, useEffect } from 'react';
import { Award, Trophy } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { AchievementCard } from '../components/AchievementCard';
import { AchievementDetailModal } from '../components/AchievementDetailModal';
import type { StudentAchievement } from '../services/skillService';
import { getAchievements, computeAndSyncAchievements } from '../services/skillService';

export const AchievementsPage: React.FC = () => {
  const [achievements, setAchievements] = useState<StudentAchievement[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<StudentAchievement | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await computeAndSyncAchievements();
        const data = await getAchievements(undefined, categoryFilter);
        setAchievements(data);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [categoryFilter]);

  const categories = ['All', 'Academic', 'Projects', 'Technical', 'Competitions', 'Certifications'];

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Career & Skills</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Achievements</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <Trophy size={24} className="text-orange" />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>STUDENT ACHIEVEMENTS</h1>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Academic milestones, hackathon awards, project certifications, and attendance recognition.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
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
        <LoadingState message="Fetching student achievements record..." />
      ) : achievements.length === 0 ? (
        <EmptyState
          title="No Achievements Found"
          message="No achievements match the selected category filter."
        />
      ) : (
        <div className="achievements-grid">
          {achievements.map((ach) => (
            <AchievementCard
              key={ach.id}
              achievement={ach}
              onOpenDetail={setSelectedAchievement}
            />
          ))}
        </div>
      )}

      {/* Achievement Detail Modal */}
      <AchievementDetailModal
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievement(null)}
      />
    </AppShell>
  );
};

export default AchievementsPage;
