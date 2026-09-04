import React from 'react';
import { X, GitCommit, User, Clock, ExternalLink, FileCode } from 'lucide-react';
import type { GitCommitItem } from '../data/repositories';

interface CommitDetailModalProps {
  commit: GitCommitItem | null;
  onClose: () => void;
}

export const CommitDetailModal: React.FC<CommitDetailModalProps> = ({ commit, onClose }) => {
  if (!commit) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
      <div className="dashboard-panel" style={{ width: '100%', maxWidth: '600px', padding: '1.5rem', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitCommit size={20} className="text-orange-icon" />
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
              Commit Details
            </h3>
          </div>
          <button className="ide-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--brand-black)', marginBottom: '0.5rem' }}>
            {commit.message}
          </h4>

          <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <span><User size={13} style={{ display: 'inline', marginRight: '0.25rem' }} />{commit.author}</span>
            <span><Clock size={13} style={{ display: 'inline', marginRight: '0.25rem' }} />{commit.date}</span>
            <span>SHA: <strong>{commit.hash}</strong></span>
          </div>

          {commit.commitUrl && (
            <a 
              href={commit.commitUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', width: 'auto' }}
            >
              <ExternalLink size={14} /> View on GitHub
            </a>
          )}
        </div>

        {commit.filesChanged && commit.filesChanged.length > 0 && (
          <div>
            <h5 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Changed Files ({commit.filesChanged.length})
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }} className="font-mono">
              {commit.filesChanged.map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '0.8rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FileCode size={14} />
                    {f.filename}
                  </span>
                  <span style={{ fontSize: '0.75rem' }}>
                    <span style={{ color: '#16A34A', marginRight: '0.5rem' }}>+{f.additions}</span>
                    <span style={{ color: '#DC2626' }}>-{f.deletions}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
