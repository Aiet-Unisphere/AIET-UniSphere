import React, { useState, useEffect } from 'react';
import { Award, Layers, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import type { StudentSkillProfile, StudentSkill } from '../services/skillService';
import { getSkillPassport, computeAndSyncSkills } from '../services/skillService';
import { ProgressBar } from '../components/ProgressBar';

export const SkillPassportPage: React.FC = () => {
  const [profile, setProfile] = useState<StudentSkillProfile | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    const data = await getSkillPassport();
    setProfile(data);
    setIsLoading(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await computeAndSyncSkills();
    await loadData();
    setIsSyncing(false);
  };

  useEffect(() => { loadData(); }, []);

  const allCategories = profile ? ['All', ...Object.keys(profile.skillsByCategory)] : ['All'];

  const displayedSkills: StudentSkill[] = profile
    ? (activeCategory === 'All'
        ? profile.skills
        : profile.skillsByCategory[activeCategory] || [])
    : [];

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Expert': return 'var(--brand-orange)';
      case 'Advanced': return '#10b981';
      case 'Intermediate': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case 'Expert': return 'badge-overdue';
      case 'Advanced': return 'badge-active';
      case 'Intermediate': return 'badge-graded';
      default: return 'badge-secondary';
    }
  };

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Career & Skills</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Skill Passport</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Student Skill Passport</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Technical skills derived from your assessments, projects, and academic activity.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.5rem 1rem' }}
          onClick={handleSync}
          disabled={isSyncing}
        >
          <RefreshCw size={15} className={isSyncing ? 'spin' : ''} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Skills'}</span>
        </button>
      </div>

      {isLoading ? (
        <LoadingState message="Loading skill passport..." />
      ) : !profile || profile.totalSkills === 0 ? (
        <EmptyState
          title="No Skills Found Yet"
          message="Complete assessments and create projects to earn and sync your skills. Click 'Sync Skills' to compute your skill profile."
          actionLabel="Sync Now"
          onAction={handleSync}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Stats Summary */}
          <div className="stats-grid">
            <div className="card-box" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Award size={24} className="text-orange" />
                <div>
                  <div className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Total Skills</div>
                  <div className="font-mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--brand-orange)' }}>
                    {profile.totalSkills}
                  </div>
                </div>
              </div>
            </div>
            <div className="card-box" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Layers size={24} className="text-blue" />
                <div>
                  <div className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Categories</div>
                  <div className="font-mono font-bold" style={{ fontSize: '1.5rem', color: '#3b82f6' }}>
                    {Object.keys(profile.skillsByCategory).length}
                  </div>
                </div>
              </div>
            </div>
            {profile.topSkills[0] && (
              <div className="card-box" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Award size={24} className="text-orange" />
                  <div>
                    <div className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Top Skill</div>
                    <div className="font-bold" style={{ fontSize: '0.95rem' }}>{profile.topSkills[0].name}</div>
                    <div className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>
                      {profile.topSkills[0].level_percent}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Category Tabs */}
          <div className="category-tabs-container">
            {allCategories.map((cat) => (
              <button
                key={cat}
                className={`tab-item ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
                {cat !== 'All' && profile.skillsByCategory[cat] && (
                  <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem', opacity: 0.7 }}>
                    ({profile.skillsByCategory[cat].length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Skills Grid */}
          <div className="skills-grid">
            {displayedSkills.map((skill) => (
              <div key={skill.id} className="card-box" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                      {skill.name}
                    </h4>
                    <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>
                      {skill.category}
                    </span>
                  </div>
                  <span className={`badge ${getLevelBadgeClass(skill.level)} font-mono`} style={{ fontSize: '0.7rem' }}>
                    {skill.level}
                  </span>
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Proficiency</span>
                    <span className="font-mono font-bold" style={{ fontSize: '0.8rem', color: getLevelColor(skill.level) }}>
                      {skill.level_percent}%
                    </span>
                  </div>
                  <ProgressBar progress={skill.level_percent} showPercentage={false} />
                </div>

                {skill.evidence_source && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }} className="font-mono text-dark-grey">
                    Source: {skill.evidence_source}
                    {skill.evidence_id && ` — ${skill.evidence_id}`}
                  </div>
                )}

                <div style={{ marginTop: '0.5rem', fontSize: '0.7rem' }} className="font-mono text-dark-grey">
                  Last updated: {new Date(skill.last_updated).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default SkillPassportPage;
