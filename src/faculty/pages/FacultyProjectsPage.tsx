import React, { useState, useEffect, useMemo } from 'react';
import { 
  FolderGit2, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar, 
  Users, 
  ExternalLink, 
  FileText, 
  Download, 
  Sparkles, 
  BookOpen, 
  Layers,
  X,
  Check
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { StatCard } from '../../components/StatCard';
import { ProgressBar } from '../../components/ProgressBar';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { useAuth } from '../../app/context/AuthContext';
import { 
  getFacultyMentoredProjects, 
  getProjectTasks, 
  getProjectMilestones, 
  getProjectResources, 
  updateProjectReviewStatus, 
  updateMilestoneStatus,
  type Project, 
  type ProjectMilestone as ProjectMilestoneData, 
  type ProjectTask as ProjectTaskData, 
  type ProjectResource,
  type FacultyProjectsStats
} from '../../services/projectService';
import { downloadStorageFile, STORAGE_BUCKETS } from '../../services/storageService';

type FilterTab = 'mentored' | 'department' | 'pending' | 'completed';
type DetailTab = 'overview' | 'milestones' | 'tasks' | 'resources';

export const FacultyProjectsPage: React.FC = () => {
  const { profile, user } = useAuth();

  const [mentoredProjects, setMentoredProjects] = useState<Project[]>([]);
  const [departmentProjects, setDepartmentProjects] = useState<Project[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<FacultyProjectsStats>({
    totalMentored: 0,
    totalDepartment: 0,
    pendingReview: 0,
    active: 0,
    completed: 0,
    onHold: 0,
  });

  const [activeTab, setActiveTab] = useState<FilterTab>('mentored');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Detail Modal State
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [tasks, setTasks] = useState<ProjectTaskData[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestoneData[]>([]);
  const [resources, setResources] = useState<ProjectResource[]>([]);
  
  // Status Review State
  const [reviewStatus, setReviewStatus] = useState<Project['status']>('Active');
  const [reviewProgress, setReviewProgress] = useState<number>(0);
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);
  const [reviewErrorMsg, setReviewErrorMsg] = useState<string | null>(null);

  // Load Projects from DB
  const loadProjects = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getFacultyMentoredProjects();
      setMentoredProjects(response.mentoredProjects);
      setDepartmentProjects(response.departmentProjects);
      setAllProjects(response.allProjects);
      setStats(response.stats);

      // Default to department tab if caller has no assigned mentored projects yet
      if (response.mentoredProjects.length === 0 && response.allProjects.length > 0) {
        setActiveTab('department');
      }
    } catch (err: any) {
      console.error('[FacultyProjectsPage] Load error:', err);
      setErrorMessage(err?.message || 'Failed to load projects. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Open Detail Modal
  const handleOpenDetail = async (project: Project, initialTab: DetailTab = 'overview') => {
    setSelectedProject(project);
    setDetailTab(initialTab);
    setReviewStatus(project.status);
    setReviewProgress(project.progress);
    setReviewSuccessMsg(null);
    setReviewErrorMsg(null);
    setIsDetailLoading(true);

    try {
      const [tList, mList, rList] = await Promise.all([
        getProjectTasks(project.id).catch(() => []),
        getProjectMilestones(project.id).catch(() => []),
        getProjectResources(project.id).catch(() => []),
      ]);
      setTasks(tList);
      setMilestones(mList);
      setResources(rList);
    } catch (err) {
      console.error('[FacultyProjectsPage] Detail load error:', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Close Detail Modal
  const handleCloseDetail = () => {
    setSelectedProject(null);
    setReviewSuccessMsg(null);
    setReviewErrorMsg(null);
  };

  // Save Project Review
  const handleSaveReview = async () => {
    if (!selectedProject) return;
    setIsReviewSaving(true);
    setReviewSuccessMsg(null);
    setReviewErrorMsg(null);

    try {
      const updated = await updateProjectReviewStatus(selectedProject.id, reviewStatus, reviewProgress);
      setSelectedProject(updated);
      setReviewSuccessMsg(`Project status updated to "${updated.status}" (${updated.progress}% complete).`);
      
      // Refresh list
      await loadProjects();
    } catch (err: any) {
      console.error('[FacultyProjectsPage] Review save error:', err);
      setReviewErrorMsg(err?.message || 'Failed to update project status.');
    } finally {
      setIsReviewSaving(false);
    }
  };

  // Update Milestone Status
  const handleMilestoneStatusChange = async (milestoneId: string, nextStatus: ProjectMilestoneData['status']) => {
    try {
      const updatedMs = await updateMilestoneStatus(milestoneId, nextStatus);
      setMilestones((prev) => prev.map((m) => (m.id === milestoneId ? updatedMs : m)));
    } catch (err: any) {
      console.error('[FacultyProjectsPage] Milestone update error:', err);
      alert(`Could not update milestone: ${err?.message || 'Server error'}`);
    }
  };

  // Download project resource
  const handleDownloadResource = async (res: ProjectResource) => {
    try {
      if (res.source === 'storage' && res.storagePath) {
        await downloadStorageFile(STORAGE_BUCKETS.PROJECT_FILES, res.storagePath, res.name);
      } else if (res.content) {
        const blob = new Blob([res.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      console.error('[FacultyProjectsPage] Resource download error:', err);
      alert(`Failed to download resource: ${err?.message || 'Unknown error'}`);
    }
  };

  // Check if caller is mentor
  const isCallerMentor = (project: Project): boolean => {
    const callerName = (profile?.full_name || '').trim().toLowerCase();
    const callerEmail = (profile?.email || user?.email || '').trim().toLowerCase();
    const mentor = (project.faculty_mentor || '').trim().toLowerCase();
    if (!mentor) return false;
    if (callerEmail && mentor === callerEmail) return true;
    if (callerName && (mentor === callerName || mentor.includes(callerName) || callerName.includes(mentor))) return true;
    return false;
  };

  // Filter Projects by Active Tab, Search, Type, Status
  const filteredProjects = useMemo(() => {
    let list: Project[] = [];
    if (activeTab === 'mentored') {
      list = mentoredProjects;
    } else if (activeTab === 'department') {
      list = allProjects;
    } else if (activeTab === 'pending') {
      list = allProjects.filter((p) => p.status === 'Pending Review');
    } else if (activeTab === 'completed') {
      list = allProjects.filter((p) => p.status === 'Completed');
    }

    return list.filter((p) => {
      // Search matching
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.course_name || '').toLowerCase().includes(q) ||
        (p.faculty_mentor || '').toLowerCase().includes(q) ||
        p.technology.some((t) => t.toLowerCase().includes(q)) ||
        p.team_members.some((m) => m.name.toLowerCase().includes(q));

      // Type matching
      const matchesType = selectedType === 'All' || p.project_type === selectedType;

      // Status matching
      const matchesStatus = selectedStatus === 'All' || p.status === selectedStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [activeTab, mentoredProjects, allProjects, searchQuery, selectedType, selectedStatus]);

  const getStatusBadge = (status: Project['status']) => {
    switch (status) {
      case 'Active':
        return <span className="badge badge-active">{status}</span>;
      case 'Completed':
        return <span className="badge badge-graded">{status}</span>;
      case 'Pending Review':
        return <span className="badge badge-pending">{status}</span>;
      case 'Upcoming':
        return <span className="badge badge-upcoming">{status}</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  const getMilestoneStatusBadge = (status: ProjectMilestoneData['status']) => {
    switch (status) {
      case 'Completed':
        return <span className="badge badge-graded">{status}</span>;
      case 'In Progress':
        return <span className="badge badge-active">{status}</span>;
      case 'Overdue':
        return <span className="badge badge-danger" style={{ backgroundColor: '#EF4444', color: '#fff' }}>{status}</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  if (isLoading) {
    return (
      <FacultyAppShell>
        <LoadingState message="Loading faculty project mentoring module..." />
      </FacultyAppShell>
    );
  }

  if (errorMessage) {
    return (
      <FacultyAppShell>
        <ErrorState message={errorMessage} onRetry={loadProjects} />
      </FacultyAppShell>
    );
  }

  return (
    <FacultyAppShell>
      <div className="faculty-projects-page" style={{ paddingBottom: '2.5rem' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <FolderGit2 size={26} style={{ color: 'var(--brand-burgundy)' }} />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--brand-black)' }}>
              Project Mentoring & Capstones
            </h1>
          </div>
          <p style={{ margin: 0, color: 'var(--brand-dark-grey)', fontSize: '0.95rem' }}>
            Review, supervise, and mentor student capstone, technical, and departmental engineering projects.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="stat-grid" style={{ marginBottom: '1.75rem' }}>
          <StatCard
            title="Mentored by Me"
            value={stats.totalMentored}
            icon={<Sparkles size={20} style={{ color: 'var(--brand-burgundy)' }} />}
            subtitle="Projects assigned to you"
          />
          <StatCard
            title="Department Projects"
            value={stats.totalDepartment}
            icon={<FolderGit2 size={20} style={{ color: 'var(--brand-burgundy)' }} />}
            subtitle="Scoped to your department"
          />
          <StatCard
            title="Pending Review"
            value={stats.pendingReview}
            icon={<Clock size={20} style={{ color: '#D97706' }} />}
            subtitle="Awaiting faculty evaluation"
          />
          <StatCard
            title="Completed"
            value={stats.completed}
            icon={<CheckCircle2 size={20} style={{ color: '#059669' }} />}
            subtitle="Successfully finalized"
          />
        </div>

        {/* Navigation Tabs */}
        <div 
          className="dashboard-panel" 
          style={{ 
            marginBottom: '1.25rem', 
            padding: '0.5rem', 
            display: 'flex', 
            gap: '0.5rem', 
            flexWrap: 'wrap',
            borderRadius: '10px'
          }}
        >
          <button
            onClick={() => setActiveTab('mentored')}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeTab === 'mentored' ? 'var(--brand-burgundy)' : 'transparent',
              color: activeTab === 'mentored' ? '#fff' : 'var(--brand-black)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.15s ease'
            }}
          >
            <Sparkles size={16} />
            My Mentored Projects
            <span 
              style={{ 
                backgroundColor: activeTab === 'mentored' ? 'rgba(255,255,255,0.25)' : 'var(--brand-light-grey)', 
                color: activeTab === 'mentored' ? '#fff' : 'var(--brand-dark-grey)',
                padding: '0.1rem 0.45rem', 
                borderRadius: '12px', 
                fontSize: '0.75rem',
                fontWeight: 700 
              }}
            >
              {stats.totalMentored}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('department')}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeTab === 'department' ? 'var(--brand-burgundy)' : 'transparent',
              color: activeTab === 'department' ? '#fff' : 'var(--brand-black)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.15s ease'
            }}
          >
            <FolderGit2 size={16} />
            All Department Projects
            <span 
              style={{ 
                backgroundColor: activeTab === 'department' ? 'rgba(255,255,255,0.25)' : 'var(--brand-light-grey)', 
                color: activeTab === 'department' ? '#fff' : 'var(--brand-dark-grey)',
                padding: '0.1rem 0.45rem', 
                borderRadius: '12px', 
                fontSize: '0.75rem',
                fontWeight: 700 
              }}
            >
              {stats.totalDepartment}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeTab === 'pending' ? 'var(--brand-burgundy)' : 'transparent',
              color: activeTab === 'pending' ? '#fff' : 'var(--brand-black)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.15s ease'
            }}
          >
            <Clock size={16} />
            Pending Review
            {stats.pendingReview > 0 && (
              <span 
                style={{ 
                  backgroundColor: activeTab === 'pending' ? '#fff' : '#D97706', 
                  color: activeTab === 'pending' ? '#D97706' : '#fff',
                  padding: '0.1rem 0.45rem', 
                  borderRadius: '12px', 
                  fontSize: '0.75rem',
                  fontWeight: 700 
                }}
              >
                {stats.pendingReview}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeTab === 'completed' ? 'var(--brand-burgundy)' : 'transparent',
              color: activeTab === 'completed' ? '#fff' : 'var(--brand-black)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.15s ease'
            }}
          >
            <CheckCircle2 size={16} />
            Completed
            <span 
              style={{ 
                backgroundColor: activeTab === 'completed' ? 'rgba(255,255,255,0.25)' : 'var(--brand-light-grey)', 
                color: activeTab === 'completed' ? '#fff' : 'var(--brand-dark-grey)',
                padding: '0.1rem 0.45rem', 
                borderRadius: '12px', 
                fontSize: '0.75rem',
                fontWeight: 700 
              }}
            >
              {stats.completed}
            </span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="header-search" style={{ flexGrow: 1, minWidth: '260px', width: 'auto' }}>
              <Search size={16} className="header-search-icon" />
              <input 
                type="text" 
                placeholder="Search by project name, tech stack, student or mentor..."
                className="header-search-input"
                style={{ width: '100%' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={16} style={{ color: 'var(--brand-dark-grey)' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Type:</span>
              <select 
                className="header-search-input" 
                style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.85rem', cursor: 'pointer' }}
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="All">All Types</option>
                <option value="Capstone">Capstone</option>
                <option value="Mini">Mini Project</option>
                <option value="Research">Research</option>
                <option value="Team">Team</option>
                <option value="Personal">Personal</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Status:</span>
              <select 
                className="header-search-input" 
                style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.85rem', cursor: 'pointer' }}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Pending Review">Pending Review</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
                <option value="Upcoming">Upcoming</option>
              </select>
            </div>
          </div>
        </div>

        {/* Project Cards Grid */}
        {filteredProjects.length === 0 ? (
          <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <FolderGit2 size={44} style={{ color: 'var(--brand-dark-grey)', margin: '0 auto 0.75rem auto' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--brand-black)', marginBottom: '0.5rem' }}>
              No projects found
            </h3>
            <p style={{ color: 'var(--brand-dark-grey)', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
              {searchQuery || selectedType !== 'All' || selectedStatus !== 'All'
                ? 'No projects match your current search and filter criteria. Try resetting the filters.'
                : activeTab === 'mentored'
                ? 'You do not have any student projects currently assigned to you for mentorship. Browse "All Department Projects" to review ongoing department work.'
                : 'No projects registered in this department yet.'}
            </p>
            {(searchQuery || selectedType !== 'All' || selectedStatus !== 'All') && (
              <button 
                className="btn btn-secondary" 
                style={{ width: 'auto', padding: '0.45rem 1rem', fontSize: '0.85rem' }}
                onClick={() => {
                  setSearchQuery('');
                  setSelectedType('All');
                  setSelectedStatus('All');
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', 
              gap: '1.25rem' 
            }}
          >
            {filteredProjects.map((project) => {
              const isCallerProjectMentor = isCallerMentor(project);

              return (
                <div 
                  key={project.id} 
                  className="project-card-item"
                  style={{
                    backgroundColor: 'var(--brand-white)',
                    border: isCallerProjectMentor ? '1px solid rgba(139, 21, 56, 0.35)' : '1px solid var(--brand-light-grey)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <div>
                    {/* Top Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {getStatusBadge(project.status)}
                        <span className="project-type-tag" style={{ fontSize: '0.75rem' }}>
                          {project.project_type}
                        </span>
                        {isCallerProjectMentor && (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.25rem',
                              backgroundColor: 'rgba(139, 21, 56, 0.08)',
                              color: 'var(--brand-burgundy)',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: 700
                            }}
                          >
                            <Sparkles size={11} /> Mentored by You
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calendar size={13} />
                        Due: {project.deadline || 'No deadline'}
                      </span>
                    </div>

                    {/* Title & Description */}
                    <h3 
                      style={{ 
                        fontSize: '1.15rem', 
                        fontWeight: 700, 
                        color: 'var(--brand-black)', 
                        marginBottom: '0.4rem',
                        lineHeight: 1.3
                      }}
                    >
                      {project.name}
                    </h3>
                    <p 
                      style={{ 
                        fontSize: '0.85rem', 
                        color: 'var(--brand-dark-grey)', 
                        marginBottom: '0.85rem',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {project.description || 'No project description provided.'}
                    </p>

                    {/* Meta info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--brand-dark-grey)' }}>Course:</span>
                        <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{project.course_name || 'Independent Project'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--brand-dark-grey)' }}>Faculty Mentor:</span>
                        <span style={{ fontWeight: 600, color: isCallerProjectMentor ? 'var(--brand-burgundy)' : 'var(--brand-black)' }}>
                          {project.faculty_mentor || 'Unassigned'}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: '0.85rem' }}>
                      <ProgressBar progress={project.progress} label={`Progress: ${project.progress}%`} />
                    </div>

                    {/* Tech Chips */}
                    {project.technology && project.technology.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.85rem' }}>
                        {project.technology.slice(0, 4).map((tech) => (
                          <span key={tech} className="tech-chip" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                            {tech}
                          </span>
                        ))}
                        {project.technology.length > 4 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', alignSelf: 'center' }}>
                            +{project.technology.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div 
                    style={{ 
                      borderTop: '1px solid var(--brand-light-grey)', 
                      paddingTop: '0.85rem', 
                      marginTop: '0.5rem', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center' 
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
                      <Users size={14} />
                      {project.team_members.length} member{project.team_members.length !== 1 ? 's' : ''}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
                        onClick={() => handleOpenDetail(project, 'overview')}
                      >
                        Review & Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Project Detail & Review Modal */}
        {selectedProject && (
          <div 
            className="modal-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem'
            }}
            onClick={handleCloseDetail}
          >
            <div 
              className="modal-content dashboard-panel"
              style={{
                maxWidth: '840px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                backgroundColor: 'var(--brand-white)',
                borderRadius: '12px',
                padding: '1.75rem',
                position: 'relative',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    {getStatusBadge(selectedProject.status)}
                    <span className="project-type-tag">{selectedProject.project_type}</span>
                    {selectedProject.course_name && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
                        {selectedProject.course_name}
                      </span>
                    )}
                  </div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--brand-black)' }}>
                    {selectedProject.name}
                  </h2>
                </div>
                <button
                  onClick={handleCloseDetail}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--brand-dark-grey)',
                    padding: '0.4rem',
                    borderRadius: '6px'
                  }}
                  aria-label="Close details"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Tabs */}
              <div 
                style={{ 
                  display: 'flex', 
                  gap: '0.5rem', 
                  borderBottom: '1px solid var(--brand-light-grey)', 
                  marginBottom: '1.5rem',
                  paddingBottom: '0.5rem'
                }}
              >
                <button
                  onClick={() => setDetailTab('overview')}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: detailTab === 'overview' ? 'var(--brand-burgundy)' : 'transparent',
                    color: detailTab === 'overview' ? '#fff' : 'var(--brand-dark-grey)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Overview & Review
                </button>
                <button
                  onClick={() => setDetailTab('milestones')}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: detailTab === 'milestones' ? 'var(--brand-burgundy)' : 'transparent',
                    color: detailTab === 'milestones' ? '#fff' : 'var(--brand-dark-grey)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  Milestones ({milestones.length})
                </button>
                <button
                  onClick={() => setDetailTab('tasks')}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: detailTab === 'tasks' ? 'var(--brand-burgundy)' : 'transparent',
                    color: detailTab === 'tasks' ? '#fff' : 'var(--brand-dark-grey)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  Tasks ({tasks.length})
                </button>
                <button
                  onClick={() => setDetailTab('resources')}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: detailTab === 'resources' ? 'var(--brand-burgundy)' : 'transparent',
                    color: detailTab === 'resources' ? '#fff' : 'var(--brand-dark-grey)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  Documents & Files ({resources.length})
                </button>
              </div>

              {/* Tab 1: Overview & Review */}
              {detailTab === 'overview' && (
                <div>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--brand-black)' }}>
                      Project Description
                    </h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {selectedProject.description || 'No description entered by the project owner.'}
                    </p>
                  </div>

                  {/* GitHub Repo */}
                  {selectedProject.github_repo_url && (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--brand-black)' }}>
                        GitHub Repository
                      </h4>
                      <a 
                        href={selectedProject.github_repo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          color: 'var(--brand-burgundy)',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          textDecoration: 'underline'
                        }}
                      >
                        <ExternalLink size={14} />
                        {selectedProject.github_repo_url}
                      </a>
                    </div>
                  )}

                  {/* Team Members */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--brand-black)' }}>
                      Project Team Members ({selectedProject.team_members.length})
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                      {selectedProject.team_members.map((member, idx) => (
                        <div 
                          key={idx}
                          style={{
                            padding: '0.75rem',
                            borderRadius: '8px',
                            backgroundColor: 'var(--brand-light-grey)',
                            border: '1px solid rgba(0,0,0,0.05)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--brand-black)' }}>
                              {member.name}
                            </span>
                            {member.isOwner && (
                              <span className="badge badge-active" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                                Owner / Lead
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                            {member.role || 'Contributor'} {member.contribution ? `• ${member.contribution}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mentor Evaluation & Status Review Form */}
                  <div 
                    style={{ 
                      padding: '1.25rem', 
                      borderRadius: '10px', 
                      backgroundColor: 'rgba(139, 21, 56, 0.04)', 
                      border: '1px solid rgba(139, 21, 56, 0.2)',
                      marginTop: '1.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <Sparkles size={18} style={{ color: 'var(--brand-burgundy)' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--brand-burgundy)' }}>
                        Faculty Mentor Review & Status Decision
                      </h4>
                    </div>
                    <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', marginBottom: '1rem' }}>
                      Review the student project deliverables and milestones, then transition status or update recorded progress.
                    </p>

                    {reviewSuccessMsg && (
                      <div 
                        style={{ 
                          padding: '0.6rem 0.85rem', 
                          borderRadius: '6px', 
                          backgroundColor: '#DEF7EC', 
                          color: '#03543F', 
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          marginBottom: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <Check size={16} />
                        {reviewSuccessMsg}
                      </div>
                    )}

                    {reviewErrorMsg && (
                      <div 
                        style={{ 
                          padding: '0.6rem 0.85rem', 
                          borderRadius: '6px', 
                          backgroundColor: '#FDE8E8', 
                          color: '#9B1C1C', 
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          marginBottom: '0.85rem'
                        }}
                      >
                        {reviewErrorMsg}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--brand-black)' }}>
                          Project Review Status:
                        </label>
                        <select
                          className="header-search-input"
                          style={{ width: '100%', padding: '0.5rem 0.85rem', fontSize: '0.875rem' }}
                          value={reviewStatus}
                          onChange={(e) => setReviewStatus(e.target.value as Project['status'])}
                        >
                          <option value="Active">Active (Approved / In Progress)</option>
                          <option value="Completed">Completed (Finalized & Approved)</option>
                          <option value="Pending Review">Pending Review</option>
                          <option value="On Hold">On Hold (Revisions Requested)</option>
                          <option value="Upcoming">Upcoming</option>
                        </select>
                      </div>

                      <div style={{ flex: '1 1 180px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--brand-black)' }}>
                          Progress ({reviewProgress}%):
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={reviewProgress}
                          onChange={(e) => setReviewProgress(Number(e.target.value))}
                          style={{ width: '100%', cursor: 'pointer' }}
                        />
                      </div>

                      <div>
                        <button
                          className="btn btn-primary"
                          style={{ width: 'auto', padding: '0.55rem 1.25rem', fontSize: '0.875rem' }}
                          onClick={handleSaveReview}
                          disabled={isReviewSaving}
                        >
                          {isReviewSaving ? 'Saving Review...' : 'Save Decision'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Milestones */}
              {detailTab === 'milestones' && (
                <div>
                  {isDetailLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--brand-dark-grey)' }}>
                      Loading project milestones...
                    </div>
                  ) : milestones.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--brand-dark-grey)' }}>
                      <Layers size={36} style={{ margin: '0 auto 0.5rem auto', color: 'var(--brand-dark-grey)' }} />
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>No milestones recorded for this project.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {milestones.map((milestone, idx) => (
                        <div 
                          key={milestone.id}
                          style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            border: '1px solid var(--brand-light-grey)',
                            backgroundColor: milestone.status === 'Completed' ? 'rgba(5, 150, 105, 0.04)' : '#fff',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem'
                          }}
                        >
                          <div style={{ flex: '1 1 300px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--brand-burgundy)' }}>
                                #{idx + 1}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--brand-black)' }}>
                                {milestone.title}
                              </span>
                              {getMilestoneStatusBadge(milestone.status)}
                            </div>
                            {milestone.description && (
                              <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', margin: '0 0 0.35rem 0' }}>
                                {milestone.description}
                              </p>
                            )}
                            <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', display: 'flex', gap: '1rem' }}>
                              <span>Due: {milestone.due_date || 'Not scheduled'}</span>
                              {milestone.completed_at && (
                                <span style={{ color: '#059669', fontWeight: 600 }}>
                                  Completed: {new Date(milestone.completed_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            {milestone.status !== 'Completed' ? (
                              <button
                                className="btn btn-secondary"
                                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderColor: '#059669', color: '#059669' }}
                                onClick={() => handleMilestoneStatusChange(milestone.id, 'Completed')}
                              >
                                <Check size={12} style={{ marginRight: '0.25rem' }} /> Mark Completed
                              </button>
                            ) : (
                              <button
                                className="btn btn-secondary"
                                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                onClick={() => handleMilestoneStatusChange(milestone.id, 'In Progress')}
                              >
                                Reopen Milestone
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Tasks */}
              {detailTab === 'tasks' && (
                <div>
                  {isDetailLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--brand-dark-grey)' }}>
                      Loading project tasks...
                    </div>
                  ) : tasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--brand-dark-grey)' }}>
                      <FileText size={36} style={{ margin: '0 auto 0.5rem auto', color: 'var(--brand-dark-grey)' }} />
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>No tasks created for this project yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {tasks.map((task) => (
                        <div 
                          key={task.id}
                          style={{
                            padding: '0.85rem',
                            borderRadius: '8px',
                            border: '1px solid var(--brand-light-grey)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.5rem'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--brand-black)' }}>
                                {task.title}
                              </span>
                              <span className={`badge ${task.status === 'Completed' ? 'badge-graded' : 'badge-secondary'}`} style={{ fontSize: '0.7rem' }}>
                                {task.status}
                              </span>
                              <span 
                                style={{ 
                                  fontSize: '0.7rem', 
                                  fontWeight: 700,
                                  color: task.priority === 'High' ? '#DC2626' : task.priority === 'Medium' ? '#D97706' : '#2563EB' 
                                }}
                              >
                                [{task.priority} Priority]
                              </span>
                            </div>
                            {task.description && (
                              <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', margin: '0 0 0.2rem 0' }}>
                                {task.description}
                              </p>
                            )}
                            <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', display: 'flex', gap: '0.75rem' }}>
                              {task.assigned_to && <span>Assigned to: {task.assigned_to}</span>}
                              {task.due_date && <span>Due: {task.due_date}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Documents & Resources */}
              {detailTab === 'resources' && (
                <div>
                  {isDetailLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--brand-dark-grey)' }}>
                      Loading project files & deliverables...
                    </div>
                  ) : resources.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--brand-dark-grey)' }}>
                      <FileText size={36} style={{ margin: '0 auto 0.5rem auto', color: 'var(--brand-dark-grey)' }} />
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>No project documents or artifacts uploaded yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {resources.map((res) => (
                        <div 
                          key={res.id}
                          style={{
                            padding: '0.85rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid var(--brand-light-grey)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.5rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <FileText size={20} style={{ color: 'var(--brand-burgundy)' }} />
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-black)' }}>
                                {res.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                                Type: {res.type} • {res.sizeBytes ? `${Math.round(res.sizeBytes / 1024)} KB` : 'File'} • {res.source === 'storage' ? 'Uploaded Artifact' : 'Workspace Code'}
                              </div>
                            </div>
                          </div>

                          <div>
                            <button
                              className="btn btn-secondary"
                              style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                              onClick={() => handleDownloadResource(res)}
                            >
                              <Download size={13} />
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </FacultyAppShell>
  );
};
