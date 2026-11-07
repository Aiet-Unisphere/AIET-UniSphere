import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Terminal, 
  FolderGit2, 
  Code2,
  FileText,
  FolderDown,
  X
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { ProgressBar } from '../components/ProgressBar';
import { ProjectTask } from '../components/ProjectTask';
import { ProjectMilestone } from '../components/ProjectMilestone';
import { ProjectTeam } from '../components/ProjectTeam';
import { ProjectTimeline } from '../components/ProjectTimeline';
import type { 
  Project, 
  ProjectTask as ProjectTaskData, 
  ProjectMilestone as ProjectMilestoneData,
  ProjectResource
} from '../services/projectService';
import { 
  getProjectById, 
  getProjectTasks, 
  getProjectMilestones, 
  getProjectResources,
  toggleTaskStatus 
} from '../services/projectService';
import { downloadStorageFile, STORAGE_BUCKETS } from '../services/storageService';
import { getStatusBadgeClass } from '../components/ProjectCard';

type DetailTab = 'overview' | 'tasks' | 'milestones' | 'team' | 'resources' | 'activity';

export const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ProjectTaskData[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestoneData[]>([]);
  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [selectedResource, setSelectedResource] = useState<ProjectResource | null>(null);
  const [resourceActionError, setResourceActionError] = useState<string | null>(null);
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

      const [taskData, msData, resData] = await Promise.all([
        getProjectTasks(projId),
        getProjectMilestones(projId),
        getProjectResources(projId).catch(() => [])
      ]);
      setTasks(taskData);
      setMilestones(msData);
      setResources(resData);
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

  const handleOpenResource = (res: ProjectResource) => {
    setResourceActionError(null);
    setSelectedResource(res);
  };

  const handleDownloadResource = async (res: ProjectResource) => {
    setResourceActionError(null);
    try {
      if (res.source === 'workspace') {
        const blob = new Blob([res.content || ''], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (res.source === 'storage' && res.storagePath) {
        await downloadStorageFile(STORAGE_BUCKETS.PROJECT_FILES, res.storagePath, res.name);
      } else {
        throw new Error('File path is unavailable.');
      }
    } catch (err: any) {
      setResourceActionError(err?.message || 'Unable to download resource file.');
    }
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
            {tab === 'resources' ? `Resources (${resources.length})` : tab}
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
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem' }}>
                Upcoming Tasks
              </h3>
              <div className="task-list">
                {tasks.slice(0, 5).map(task => (
                  <ProjectTask key={task.id} task={task} onToggle={handleToggleTask} />
                ))}
              </div>
            </div>

            <div className="card-box" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem' }}>
                Team Members
              </h3>
              <ProjectTeam members={project.team_members} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="card-box">
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
            All Project Tasks ({tasks.length})
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
            Project Milestones ({milestones.length})
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              Resources & Documentation
            </h3>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => navigate(`/student/projects/${project.id}/workspace`)}
            >
              <Terminal size={14} />
              Open Workspace
            </button>
          </div>

          {resourceActionError && (
            <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 'var(--border-radius)', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.85rem' }}>
              {resourceActionError}
            </div>
          )}

          {resources.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
              <FileText size={36} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
              <h4 style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)', margin: 0 }}>
                No project resources or documentation uploaded yet
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.5rem', maxWidth: '480px', marginInline: 'auto' }}>
                Architecture specifications, README documentation, and files created in the project workspace will appear here.
              </p>
              <div style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}
                  onClick={() => navigate(`/student/projects/${project.id}/workspace`)}
                >
                  <Terminal size={14} />
                  Open Project Workspace
                </button>
              </div>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: 0 }}>
              {resources.map((res) => (
                <li key={res.id} className="resource-link-item" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    {res.name.endsWith('.md') || res.name.endsWith('.txt') ? (
                      <FileText size={20} className="text-orange-icon" />
                    ) : (
                      <Code2 size={20} className="text-blue-icon" />
                    )}
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
                        {res.name}
                      </h4>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
                        {res.type} · {res.sizeBytes ? `${(res.sizeBytes / 1024).toFixed(1)} KB` : 'Text Document'} · Updated {new Date(res.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      onClick={() => handleOpenResource(res)}
                      aria-label={`View ${res.name}`}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      onClick={() => handleDownloadResource(res)}
                      aria-label={`Download ${res.name}`}
                    >
                      <FolderDown size={14} />
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
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

      {/* Resource View Modal */}
      {selectedResource && (
        <div 
          className="modal-backdrop" 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1000, 
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' 
          }}
          onClick={() => setSelectedResource(null)}
        >
          <div 
            className="modal-content card-box" 
            style={{ 
              maxWidth: '680px', width: '100%', maxHeight: '80vh', 
              display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: 'var(--border-radius)', overflow: 'hidden' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                  {selectedResource.name}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                  {selectedResource.type} · Path: {selectedResource.path}
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedResource(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-dark-grey)' }}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, maxHeight: '50vh', backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)' }}>
              {selectedResource.content ? (
                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selectedResource.content}
                </pre>
              ) : (
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--brand-dark-grey)' }}>
                  Binary or external storage object. Click download to retrieve this resource.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.825rem' }} 
                onClick={() => setSelectedResource(null)}
              >
                Close
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} 
                onClick={() => handleDownloadResource(selectedResource)}
              >
                <FolderDown size={14} />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default ProjectDetail;
