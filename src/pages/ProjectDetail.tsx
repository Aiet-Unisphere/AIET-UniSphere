import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Terminal, 
  FolderGit2, 
  Code2,
  FileText
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { ProgressBar } from '../components/ProgressBar';
import { ProjectTask } from '../components/ProjectTask';
import { ProjectMilestone } from '../components/ProjectMilestone';
import { ProjectTeam } from '../components/ProjectTeam';
import { ProjectTimeline } from '../components/ProjectTimeline';
import type { Project, ProjectTask as ProjectTaskData, ProjectMilestone as ProjectMilestoneData } from '../services/projectService';
import { getProjectById, getProjectTasks, getProjectMilestones, toggleTaskStatus } from '../services/projectService';
import { getStatusBadgeClass } from '../components/ProjectCard';

type DetailTab = 'overview' | 'tasks' | 'milestones' | 'team' | 'resources' | 'activity';

export const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ProjectTaskData[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestoneData[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!id) {
        setError('Project not found.');
        return;
      }
      const projId = id;
      const proj = await getProjectById(projId);
      if (!proj) {
        setError("Unable to load project information.");
        return;
      }
      setProject(proj);

      const [taskData, msData] = await Promise.all([
        getProjectTasks(projId),
        getProjectMilestones(projId)
      ]);
      setTasks(taskData);
      setMilestones(msData);
    } catch (err) {
      setError("Unable to load project information.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const handleToggleTask = async (taskId: string) => {
    await toggleTaskStatus(taskId);
    if (!id) return;
    const taskData = await getProjectTasks(id);
    setTasks(taskData);
  };

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading project workspace details..." />
      </AppShell>
    );
  }

  if (error || !project) {
    return (
      <AppShell>
        <ErrorState message={error || "Project not found"} onRetry={fetchDetail} />
      </AppShell>
    );
  }

  const activityEvents = [
    { id: `project-${project.id}`, timestamp: project.created_at, title: 'Project created', description: project.description || undefined, type: 'milestone' as const },
    ...tasks.map(task => ({
      id: `task-${task.id}`,
      timestamp: task.updated_at,
      title: `Task ${task.status.toLowerCase()}: ${task.title}`,
      description: task.description || undefined,
      type: 'task' as const,
    })),
    ...milestones.map(milestone => ({
      id: `milestone-${milestone.id}`,
      timestamp: milestone.updated_at,
      title: `Milestone ${milestone.status.toLowerCase()}: ${milestone.title}`,
      description: milestone.description || undefined,
      type: 'milestone' as const,
    })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map(event => ({
    ...event,
    timeGroup: new Date(event.timestamp).toLocaleString(),
  }));

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div className="breadcrumbs">
            <span>Development</span>
            <span className="breadcrumbs-separator">/</span>
            <span 
              style={{ cursor: 'pointer', color: 'var(--brand-blue)' }} 
              onClick={() => navigate('/student/projects')}
            >
              Projects
            </span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{project.name}</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>{project.name}</h1>
            <span className={`badge ${getStatusBadgeClass(project.status)}`}>
              {project.status}
            </span>
          </div>
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary" 
            style={{ width: 'auto' }}
            onClick={() => navigate('/student/github')}
          >
            <FolderGit2 size={16} />
            Repository
          </button>
          
          <button 
            className="btn btn-primary" 
            style={{ width: 'auto' }}
            onClick={() => navigate(`/student/projects/${project.id}/workspace`)}
          >
            <Terminal size={16} />
            Open Workspace
          </button>
        </div>
      </div>

      {/* Top Banner Stats */}
      <div className="project-detail-banner-card">
        <div className="banner-stat-item">
          <span className="stat-lbl">Course / Subject</span>
          <span className="stat-val">{project.course_name || 'Independent project'}</span>
        </div>
        <div className="banner-stat-item">
          <span className="stat-lbl">Faculty Mentor</span>
          <span className="stat-val">{project.faculty_mentor || 'Not assigned'}</span>
        </div>
        <div className="banner-stat-item">
          <span className="stat-lbl">Target Deadline</span>
          <span className="stat-val font-mono">{project.deadline}</span>
        </div>
        <div className="banner-stat-item" style={{ flexGrow: 1, minWidth: '200px' }}>
          <span className="stat-lbl">Progress Breakdown</span>
          <div style={{ marginTop: '0.25rem' }}>
            <ProgressBar progress={project.progress} label={`${project.progress}% completed`} />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tab-filters-container" style={{ margin: '1.5rem 0' }}>
        {(['overview', 'tasks', 'milestones', 'team', 'resources', 'activity'] as DetailTab[]).map((tab) => (
          <button
            key={tab}
            className={`tab-filter-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            style={{ textTransform: 'capitalize' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="project-detail-grid">
          <div className="detail-main-col">
            <div className="card-box">
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                Project Overview & Architecture
              </h3>
              <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--brand-black)' }}>
                {project.description}
              </p>

              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Technology Stack
                </h4>
                <div className="project-tech-tags font-mono">
                  {project.technology.map(tech => (
                    <span key={tech} className="tech-chip">{tech}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="card-box" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem' }}>
                Current Milestone: <span style={{ color: 'var(--brand-orange)' }}>{milestones.find(ms => ms.status !== 'Completed')?.title || 'No pending milestone'}</span>
              </h3>
              <div className="milestones-list">
                {milestones.map(ms => (
                  <ProjectMilestone key={ms.id} milestone={ms} />
                ))}
              </div>
            </div>
          </div>

          <div className="detail-side-col">
            <div className="card-box">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>
                Project Team ({project.team_members.length})
              </h3>
              <ProjectTeam members={project.team_members} />
            </div>

            <div className="card-box" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                Quick Links & Workspace
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={() => navigate(`/student/projects/${project.id}/workspace`)}
                >
                  <Terminal size={16} /> Open Integrated Workspace
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => navigate('/student/github')}
                >
                  <FolderGit2 size={16} /> Git & Commits
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="card-box">
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
            Project Task Board
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {tasks.map(task => (
              <ProjectTask key={task.id} task={task} onToggle={handleToggleTask} />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'milestones' && (
        <div className="card-box">
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
            Project Milestones
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {milestones.map(ms => (
              <ProjectMilestone key={ms.id} milestone={ms} />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="card-box">
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
            Team Roster & Contributions
          </h3>
          <ProjectTeam members={project.team_members} />
        </div>
      )}

      {activeTab === 'resources' && (
        <div className="card-box">
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
            Resources & Documentation
          </h3>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <li className="resource-link-item">
              <FileText size={18} className="text-orange-icon" />
              <div>
                <a href="#readme" onClick={(e) => { e.preventDefault(); alert("Viewing README.md documentation."); }}>
                  Project Architecture Specification (README.md)
                </a>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Markdown · Updated 2 hours ago</span>
              </div>
            </li>
            <li className="resource-link-item">
              <Code2 size={18} className="text-blue-icon" />
              <div>
                <a href="#api-spec" onClick={(e) => { e.preventDefault(); alert("Viewing OpenAPI JSON schema."); }}>
                  REST API Endpoint Schema & OpenAPI 3.0
                </a>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>JSON · 45 KB</span>
              </div>
            </li>
          </ul>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="card-box">
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
            Project Activity Log
          </h3>
          <ProjectTimeline events={activityEvents} />
        </div>
      )}
    </AppShell>
  );
};

export default ProjectDetail;
