import React from 'react';
import { 
  FolderGit2, 
  GitBranch, 
  Clock, 
  Star, 
  GitFork, 
  ExternalLink,
  Lock,
  Globe,
  CheckCircle2,
  XCircle,
  FolderSync
} from 'lucide-react';
import type { RepositoryInfo } from '../data/repositories';

interface RepositoryCardProps {
  repository: RepositoryInfo;
  onToggleConnect?: () => void;
  onChangeRepository?: () => void;
}

export const RepositoryCard: React.FC<RepositoryCardProps> = ({
  repository,
  onToggleConnect,
  onChangeRepository
}) => {
  return (
    <div className="repo-card-container">
      <div className="repo-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="repo-icon-box">
            <FolderGit2 size={24} style={{ color: 'var(--brand-orange)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-black)' }}>
                {repository.name}
              </h3>
              <span className="badge badge-secondary" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                {repository.visibility === 'Public' ? <Globe size={11} /> : <Lock size={11} />}
                {repository.visibility}
              </span>
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>
              Owner: <strong>{repository.owner}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {repository.githubConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span className="badge badge-graded" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={13} /> Connected
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>
                GitHub: <strong>{repository.githubUsername}</strong>
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span className="badge badge-overdue" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <XCircle size={13} /> Not Connected
              </span>
              <span style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '0.15rem' }}>
                GitHub authentication failed
              </span>
            </div>
          )}

          {repository.githubConnected && onChangeRepository && (
            <button 
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={onChangeRepository}
              title="Select different GitHub repository"
            >
              <FolderSync size={15} />
              Switch Repo
            </button>
          )}

          {onToggleConnect && (
            <button 
              className={`btn ${repository.githubConnected ? 'btn-secondary' : 'btn-primary'}`}
              style={{ width: 'auto', padding: '0.45rem 1rem', fontSize: '0.85rem' }}
              onClick={onToggleConnect}
            >
              {repository.githubConnected ? 'Disconnect' : 'Connect GitHub'}
            </button>
          )}
        </div>
      </div>

      <div className="repo-card-meta-bar">
        <div className="meta-pill">
          <GitBranch size={14} className="meta-icon" />
          <span>Active Branch: <strong>{repository.currentBranch}</strong></span>
        </div>
        <div className="meta-pill">
          <Clock size={14} className="meta-icon" />
          <span>Last Commit: <strong>{repository.lastCommit}</strong></span>
        </div>
        <div className="meta-pill">
          <Star size={14} className="meta-icon" />
          <span>{repository.starsCount} stars</span>
        </div>
        <div className="meta-pill">
          <GitFork size={14} className="meta-icon" />
          <span>{repository.forksCount} forks</span>
        </div>
      </div>

      <div className="repo-card-actions font-mono">
        <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
          {repository.cloneUrl || `https://github.com/${repository.owner}/${repository.name}.git`}
        </span>

        <a 
          href={repository.htmlUrl || `https://github.com/${repository.owner}/${repository.name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
        >
          <ExternalLink size={14} />
          View Repository
        </a>
      </div>
    </div>
  );
};
