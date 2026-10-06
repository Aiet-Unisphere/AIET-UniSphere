import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FolderGit2, 
  GitBranch, 
  GitCommit, 
  GitPullRequest, 
  RefreshCw,
  Terminal,
  AlertTriangle,
  FolderSync,
  CheckCircle2,
  X,
  Gauge
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { RepositoryCard } from '../components/RepositoryCard';
import { BranchList } from '../components/BranchList';
import { CommitList } from '../components/CommitList';
import { ChangeList } from '../components/ChangeList';
import { CommitDetailModal } from '../components/CommitDetailModal';
import type { 
  RepositoryInfo, 
  GitBranchItem, 
  GitCommitItem, 
  GitFileChange,
  GitHubRepositoryItem,
  GitHubConnection
} from '../data/repositories';
import { 
  getGitHubConnection,
  getRepositoryInfo, 
  getBranches, 
  getCommits, 
  getCommitDetails,
  getGitChanges, 
  addCommit, 
  switchBranch, 
  disconnectGitHub,
  getUserRepositories,
  saveSelectedRepository,
  getSelectedRepository,
  syncRepository,
  clearWorkspaceChanges,
  getRateLimitDiagnostics,
  type RateLimitDiagnostics
} from '../services/githubService';
import { useAuth } from '../app/context/AuthContext';

type GitTab = 'overview' | 'branches' | 'commits' | 'changes';

export const GitGithubPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [repo, setRepo] = useState<RepositoryInfo | null>(null);
  const [branches, setBranches] = useState<GitBranchItem[]>([]);
  const [commits, setCommits] = useState<GitCommitItem[]>([]);
  const [changes, setChanges] = useState<GitFileChange | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitDiagnostics | null>(null);
  
  const [activeTab, setActiveTab] = useState<GitTab>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Modals & Conflict state
  const [selectedCommitDetail, setSelectedCommitDetail] = useState<GitCommitItem | null>(null);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [userRepos, setUserRepos] = useState<GitHubRepositoryItem[]>([]);
  const [conflictState, setConflictState] = useState<{ remoteMsg?: string } | null>(null);

  const fetchGitData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const conn = await getGitHubConnection();
      setConnection(conn);

      if (!conn) {
        setRepo({
          id: 'not-connected',
          name: 'No Repository Selected',
          owner: 'N/A',
          visibility: 'Public',
          defaultBranch: 'main',
          currentBranch: 'main',
          lastCommit: 'GitHub authentication failed or not connected',
          status: 'Not Connected',
          githubConnected: false,
          githubUsername: '',
          starsCount: 0,
          forksCount: 0,
          cloneUrl: ''
        });
        setBranches([]);
        setCommits([]);
        setChanges({ modified: [], added: [], deleted: [] });
        return;
      }

      // Check selected repository
      let selected = await getSelectedRepository();
      if (!selected) {
        const repos = await getUserRepositories();
        setUserRepos(repos);
        if (repos.length > 0) {
          selected = repos[0];
          await saveSelectedRepository(selected);
        }
      }

      if (selected) {
        const repoData = await getRepositoryInfo();
        setRepo(repoData);

        const [branchData, commitData, changeData, limitData] = await Promise.all([
          getBranches(),
          getCommits(),
          getGitChanges(),
          getRateLimitDiagnostics()
        ]);
        setBranches(branchData);
        setCommits(commitData);
        setChanges(changeData);
        setRateLimit(limitData);
      }
    } catch (err: any) {
      console.error('[GitGithubPage] Load error:', err);
      setError(err.message || "Unable to load Git repository data from GitHub.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGitData();
  }, [fetchGitData]);

  // Connect GitHub Handler
  const handleConnectGitHub = async () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    if (clientId) {
      const redirectUri = `${window.location.origin}/student/github/callback`;
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo%20user%20read:user&state=${user?.id || ''}`;
      window.location.href = authUrl;
    } else {
      setError('GitHub OAuth is not configured. Set VITE_GITHUB_CLIENT_ID and deploy the github-oauth Edge Function.');
    }
  };

  const handleDisconnect = async () => {
    if (confirm("Disconnect GitHub account from UniSphere?")) {
      await disconnectGitHub();
      await fetchGitData();
    }
  };

  // Open repository picker
  const handleOpenRepoSelector = async () => {
    try {
      setIsLoading(true);
      const repos = await getUserRepositories();
      setUserRepos(repos);
      setShowRepoModal(true);
    } catch (e: any) {
      alert("Unable to fetch repository list from GitHub.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRepository = async (repoItem: GitHubRepositoryItem) => {
    await saveSelectedRepository(repoItem);
    setShowRepoModal(false);
    setStatusMessage(`Switched active repository to ${repoItem.fullName}`);
    setTimeout(() => setStatusMessage(null), 3000);
    await fetchGitData();
  };

  const handleSelectBranch = async (branchName: string) => {
    try {
      setIsLoading(true);
      const updatedRepo = await switchBranch(branchName);
      setRepo(updatedRepo);
      const [branchData, commitData] = await Promise.all([
        getBranches(),
        getCommits()
      ]);
      setBranches(branchData);
      setCommits(commitData);
    } catch (e: any) {
      alert("Failed to switch branch: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async (message: string) => {
    try {
      await addCommit(message);
      setStatusMessage("Changes committed successfully to GitHub!");
      setTimeout(() => setStatusMessage(null), 4000);
      await fetchGitData();
    } catch (err: any) {
      alert(`GitHub Commit Error: ${err.message}`);
    }
  };

  const handleFetchSync = async () => {
    setIsLoading(true);
    setError(null);
    setConflictState(null);
    try {
      const syncRes = await syncRepository();
      if (syncRes.conflict) {
        setConflictState({ remoteMsg: syncRes.remoteCommitMessage });
      } else {
        setStatusMessage("Repository fetched & synchronized with GitHub.");
        setTimeout(() => setStatusMessage(null), 3000);
      }
      await fetchGitData();
    } catch (err: any) {
      setError(err.message || "Fetch / Sync failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInspectCommit = async (commitItem: GitCommitItem) => {
    try {
      const detailed = await getCommitDetails(commitItem.hash);
      setSelectedCommitDetail(detailed || commitItem);
    } catch (e) {
      setSelectedCommitDetail(commitItem);
    }
  };

  if (isLoading && !repo) {
    return (
      <AppShell>
        <LoadingState message="Connecting to GitHub repository API..." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Development</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Git / GitHub</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Git & GitHub Integration</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Version control, branches, commit history, file diffs, and live GitHub synchronization
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {rateLimit && (
            <div className="font-mono" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Gauge size={14} className="text-orange-icon" />
              <span>Rate Limit: <strong>{rateLimit.remaining}</strong> / {rateLimit.limit}</span>
            </div>
          )}

          <button 
            className="btn btn-secondary"
            style={{ width: 'auto' }}
            onClick={handleFetchSync}
            disabled={!connection}
          >
            <RefreshCw size={15} />
            Fetch / Sync
          </button>
          
          <button 
            className="btn btn-primary"
            style={{ width: 'auto' }}
            onClick={() => navigate('/student/project-workspace')}
          >
            <Terminal size={15} />
            Open IDE Workspace
          </button>
        </div>
      </div>

      {/* Status or Error Banner */}
      {statusMessage && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', color: '#166534', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={16} />
          {statusMessage}
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', color: '#991B1B', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Remote Conflict Banner */}
      {conflictState && (
        <div style={{ padding: '1rem', backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400E', fontWeight: 700, marginBottom: '0.5rem' }}>
            <AlertTriangle size={18} />
            Remote changes detected on GitHub
          </div>
          <p style={{ fontSize: '0.85rem', color: '#B45309', marginBottom: '0.75rem' }}>
            The remote repository branch has updated commits. You have local uncommitted changes in your workspace.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" style={{ width: 'auto', fontSize: '0.8rem' }} onClick={() => setActiveTab('commits')}>
              View remote changes
            </button>
            <button className="btn btn-secondary" style={{ width: 'auto', fontSize: '0.8rem' }} onClick={() => setConflictState(null)}>
              Keep local changes
            </button>
            <button className="btn" style={{ width: 'auto', fontSize: '0.8rem', backgroundColor: '#DC2626', color: '#FFF' }} onClick={async () => {
              await clearWorkspaceChanges();
              setConflictState(null);
              await fetchGitData();
            }}>
              Reload from GitHub (Overwrite local)
            </button>
          </div>
        </div>
      )}

      {/* Repository Main Info Card */}
      {repo && (
        <RepositoryCard 
          repository={repo}
          onToggleConnect={connection ? handleDisconnect : handleConnectGitHub}
          onChangeRepository={handleOpenRepoSelector}
        />
      )}

      {/* Tabs */}
      <div className="tab-filters-container" style={{ margin: '1.5rem 0' }}>
        <button
          className={`tab-filter-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <FolderGit2 size={15} /> Overview
        </button>
        
        <button
          className={`tab-filter-btn ${activeTab === 'branches' ? 'active' : ''}`}
          onClick={() => setActiveTab('branches')}
        >
          <GitBranch size={15} /> Branches ({branches.length})
        </button>

        <button
          className={`tab-filter-btn ${activeTab === 'commits' ? 'active' : ''}`}
          onClick={() => setActiveTab('commits')}
        >
          <GitCommit size={15} /> Commits ({commits.length})
        </button>

        <button
          className={`tab-filter-btn ${activeTab === 'changes' ? 'active' : ''}`}
          onClick={() => setActiveTab('changes')}
        >
          <GitPullRequest size={15} /> Uncommitted Changes
        </button>
      </div>

      {/* Tab Contents */}
      {changes && (
        <>
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <ChangeList changes={changes} onCommit={handleCommit} />
              <CommitList commits={commits.slice(0, 3)} />
              <BranchList 
                branches={branches} 
                currentBranch={repo?.currentBranch || 'main'} 
                onSelectBranch={handleSelectBranch} 
              />
            </div>
          )}

          {activeTab === 'branches' && (
            <BranchList 
              branches={branches} 
              currentBranch={repo?.currentBranch || 'main'} 
              onSelectBranch={handleSelectBranch} 
            />
          )}

          {activeTab === 'commits' && (
            <div onClick={(e: any) => {
              const row = e.target.closest('.commit-row-card');
              if (row) {
                const commitHash = row.querySelector('.commit-hash-chip')?.textContent;
                const match = commits.find(c => c.shortHash === commitHash || c.hash === commitHash);
                if (match) handleInspectCommit(match);
              }
            }}>
              <CommitList commits={commits} />
            </div>
          )}

          {activeTab === 'changes' && (
            <ChangeList changes={changes} onCommit={handleCommit} />
          )}
        </>
      )}

      {/* Commit Details Modal */}
      <CommitDetailModal
        commit={selectedCommitDetail}
        onClose={() => setSelectedCommitDetail(null)}
      />

      {/* Repository Selection Modal */}
      {showRepoModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '550px', padding: '1.5rem', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FolderSync size={18} /> Select GitHub Repository ({userRepos.length})
              </h3>
              <button className="ide-btn-icon" onClick={() => setShowRepoModal(false)}>
                <X size={18} />
              </button>
            </div>

            {userRepos.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)' }}>
                No accessible repositories found for your GitHub account.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {userRepos.map((r) => (
                  <div
                    key={r.id}
                    style={{ padding: '0.75rem 1rem', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: r.name === repo?.name ? 'var(--bg-subtle)' : '#FFF' }}
                    onClick={() => handleSelectRepository(r)}
                  >
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--brand-black)' }}>{r.fullName}</h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                        Default branch: {r.defaultBranch} • {r.visibility}
                      </span>
                    </div>
                    <button className="btn btn-secondary font-mono" style={{ width: 'auto', fontSize: '0.75rem' }}>
                      Select
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </AppShell>
  );
};

export default GitGithubPage;
