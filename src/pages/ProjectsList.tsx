import React, { useState, useEffect } from 'react';
import { Search, Plus } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectStats } from '../components/ProjectStats';
import { CreateProjectModal } from '../components/CreateProjectModal';
import type { Project, CreateProjectPayload } from '../services/projectService';
import { getProjects, getProjectStats, createProject } from '../services/projectService';

export const ProjectsList: React.FC = () => {

  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState({ active: 0, completed: 0, pendingReview: 0, upcoming: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting
  const [selectedCategory, setSelectedCategory] = useState<string>('All Projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'deadline' | 'progress'>('recent');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchProjectData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [projData, statsData] = await Promise.all([
        getProjects(),
        getProjectStats()
      ]);
      setProjects(projData);
      setStats(statsData);
    } catch (err) {
      setError("Unable to load project information. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, []);

  const handleCreateProject = async (payload: CreateProjectPayload) => {
    await createProject(payload);
    await fetchProjectData();
  };

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading engineering project portal..." />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <ErrorState message={error} onRetry={fetchProjectData} />
      </AppShell>
    );
  }

  const categories: string[] = ['All Projects', 'Team Projects', 'Completed Projects'];

  // Filtering
  let filteredProjects = projects.filter((project) => {
    // Category match
    const matchesCategory = selectedCategory === 'All Projects' ||
      (selectedCategory === 'Team Projects' && project.project_type === 'Team') ||
      (selectedCategory === 'Completed Projects' && project.status === 'Completed');

    // Search query match
    const matchesSearch = 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.course_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.faculty_mentor || '').toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesStatus = filterStatus === 'all' || project.status === filterStatus;

    // Type filter
    const matchesType = filterType === 'all' || project.project_type === filterType;

    return matchesCategory && matchesSearch && matchesStatus && matchesType;
  });

  // Sorting
  filteredProjects.sort((a, b) => {
    if (sortBy === 'progress') {
      return b.progress - a.progress;
    }
    if (sortBy === 'deadline') {
      return new Date(a.deadline || '9999-12-31').getTime() - new Date(b.deadline || '9999-12-31').getTime();
    }
    return 0; // Recent default
  });

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Development</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Projects</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Project Portal</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Engineering project management, milestones, teams, and developer workspaces
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

      {/* Summary Stats */}
      <ProjectStats 
        activeCount={stats.active}
        completedCount={stats.completed}
        pendingReviewCount={stats.pendingReview}
        upcomingCount={stats.upcoming}
      />

      {/* Category Tabs */}
      <div className="tab-filters-container">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`tab-filter-btn ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            <span>{cat}</span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="header-search" style={{ display: 'flex', width: '320px', maxWidth: '100%' }}>
          <Search size={16} className="header-search-icon" />
          <input 
            type="text" 
            className="header-search-input" 
            placeholder="Search by project name, course, mentor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search projects"
          />
        </div>

        <div className="filter-controls-group">
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)' }}>Status:</label>
          <select 
            className="filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Completed">Completed</option>
            <option value="Upcoming">Upcoming</option>
          </select>

          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', marginLeft: '0.5rem' }}>Type:</label>
          <select 
            className="filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="Team">Team</option>
            <option value="Mini">Mini</option>
            <option value="Capstone">Capstone</option>
            <option value="Research">Research</option>
            <option value="Personal">Personal</option>
          </select>

          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', marginLeft: '0.5rem' }}>Sort:</label>
          <select 
            className="filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="recent">Recent</option>
            <option value="deadline">Deadline</option>
            <option value="progress">Progress</option>
          </select>
        </div>
      </div>

      {/* Projects Grid or Empty State */}
      {filteredProjects.length === 0 ? (
        <EmptyState 
          title="No projects yet"
          message={searchQuery ? `No projects matching "${searchQuery}".` : "You don't have any projects assigned or created yet."}
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

export default ProjectsList;
