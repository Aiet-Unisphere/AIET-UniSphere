import React, { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { ProjectCard } from '../components/ProjectCard';
import { CreateProjectModal } from '../components/CreateProjectModal';
import type { Project, CreateProjectPayload } from '../services/projectService';
import { getPersonalProjects, createProject } from '../services/projectService';

export const MyProjectsList: React.FC = () => {
  const [personalProjects, setPersonalProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchMyProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPersonalProjects();
      setPersonalProjects(data);
    } catch (err) {
      setError("Unable to load your personal projects. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMyProjects();
  }, []);

  const handleCreateProject = async (payload: CreateProjectPayload) => {
    await createProject(payload);
    await fetchMyProjects();
  };

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading your personal projects..." />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <ErrorState message={error} onRetry={fetchMyProjects} />
      </AppShell>
    );
  }

  const filteredProjects = personalProjects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.technology.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Development</span>
            <span className="breadcrumbs-separator">/</span>
            <span>Projects</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>My Projects</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>My Projects</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Projects created or owned by you in AIET-UniSphere
          </p>
        </div>

        <button 
          className="btn btn-primary"
          style={{ width: 'auto' }}
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Plus size={16} />
          Create Project
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="header-search" style={{ display: 'flex', width: '360px', maxWidth: '100%' }}>
          <Search size={16} className="header-search-icon" />
          <input 
            type="text" 
            className="header-search-input" 
            placeholder="Search my projects by name or technology stack..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search my projects"
          />
        </div>

        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-dark-grey)' }}>
          Showing {filteredProjects.length} personal project{filteredProjects.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Projects Grid or Empty State */}
      {filteredProjects.length === 0 ? (
        <EmptyState 
          title="You don't have any projects."
          message={searchQuery ? `No personal projects matching "${searchQuery}".` : "Start your engineering journey by creating your first project."}
          actionLabel="Create Project"
          onAction={() => setIsCreateModalOpen(true)}
        />
      ) : (
        <div className="projects-grid">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateProject}
      />
    </AppShell>
  );
};

export default MyProjectsList;
