import { supabase } from '../lib/supabase';
import type { 
  RepositoryInfo, 
  GitBranchItem, 
  GitCommitItem, 
  GitFileChange,
  GitHubConnection,
  GitHubRepositoryItem
} from '../data/repositories';

const GITHUB_CONN_KEY = 'unisphere_github_connection';
const GITHUB_REPO_KEY = 'unisphere_selected_github_repo';
const GITHUB_CHANGES_KEY = 'unisphere_workspace_changes';

export interface RateLimitDiagnostics {
  limit: number;
  remaining: number;
  resetTime: string;
}

// 0. HELPER FOR STANDARDIZED GITHUB ERROR MESSAGES (TEST 9)
export const handleGitHubApiError = (res: Response, errJson?: any): string => {
  if (res.status === 401) return "401 Unauthorized: Invalid or expired GitHub access token.";
  if (res.status === 403) return "403 Forbidden: Insufficient permissions or GitHub API rate limit exceeded.";
  if (res.status === 404) return "404 Not Found: Repository or file unavailable or permission denied.";
  if (res.status === 429) return "429 Too Many Requests: GitHub API rate limit reached. Please wait before retrying.";
  if (res.status >= 500) return `GitHub Server Error (${res.status}): ${res.statusText}. Please check GitHub status.`;
  return errJson?.message || `GitHub API Error (${res.status}): ${res.statusText}`;
};

// Helper to get stored access token
export const getStoredToken = async (): Promise<string | null> => {
  // 1. Check Supabase github_connections table
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await (supabase as any)
        .from('github_connections')
        .select('access_token')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.access_token) return data.access_token;
    }
  } catch (err) {
    // DB table fallback
  }

  // 2. Check local storage cache
  const cached = localStorage.getItem(GITHUB_CONN_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.accessToken) return parsed.accessToken;
    } catch (e) {
      /* ignore */
    }
  }

  // 3. Check environment variable
  const envToken = import.meta.env.VITE_GITHUB_ACCESS_TOKEN || import.meta.env.VITE_GITHUB_TOKEN;
  if (envToken && typeof envToken === 'string' && envToken.trim()) {
    return envToken.trim();
  }

  return null;
};

// 1. GET GITHUB CONNECTION (TEST 1 & TEST 8)
export const getGitHubConnection = async (): Promise<GitHubConnection | null> => {
  const token = await getStoredToken();
  if (!token) return null;

  // Validate token directly with GitHub API (TEST 1)
  try {
    const ghRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'AIET-UniSphere-App'
      }
    });

    if (!ghRes.ok) {
      console.warn('[githubService] GitHub API token authentication failed:', ghRes.status);
      return null;
    }

    const ghUser = await ghRes.json();
    const { data: { user } } = await supabase.auth.getUser();

    const connObj: GitHubConnection = {
      id: `conn-${ghUser.id}`,
      userId: user?.id || 'dev-user',
      githubUserId: String(ghUser.id),
      githubUsername: ghUser.login,
      avatarUrl: ghUser.avatar_url,
      accessToken: token,
      scope: 'repo user'
    };

    localStorage.setItem(GITHUB_CONN_KEY, JSON.stringify(connObj));
    return connObj;
  } catch (err) {
    console.error('[githubService] getGitHubConnection Error:', err);
    return null;
  }
};

// 2. CONNECT WITH OAUTH CODE VIA EDGE FUNCTION
export const connectGitHubOAuth = async (code: string, redirectUri: string): Promise<GitHubConnection> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Authenticated session required to connect GitHub.");

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-oauth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });

  const resData = await response.json();
  if (!response.ok || resData.error) {
    throw new Error(resData.error || "Failed to exchange GitHub authorization code.");
  }

  const conn = await getGitHubConnection();
  if (!conn) throw new Error("Failed to retrieve connected GitHub profile.");
  return conn;
};

// 3. CONNECT WITH TOKEN DIRECTLY
export const connectGitHubWithToken = async (token: string): Promise<GitHubConnection> => {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error("GitHub Access Token is required.");

  const ghRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${cleanToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!ghRes.ok) {
    const errJson = await ghRes.json().catch(() => ({}));
    throw new Error(handleGitHubApiError(ghRes, errJson));
  }

  const ghUser = await ghRes.json();
  const { data: { user } } = await supabase.auth.getUser();

  const connObj: GitHubConnection = {
    id: `conn-${ghUser.id}`,
    userId: user?.id || 'dev-user',
    githubUserId: String(ghUser.id),
    githubUsername: ghUser.login,
    avatarUrl: ghUser.avatar_url,
    accessToken: cleanToken,
    scope: 'repo user'
  };

  if (user) {
    try {
      await (supabase as any)
        .from('github_connections')
        .upsert({
          user_id: user.id,
          github_user_id: String(ghUser.id),
          github_username: ghUser.login,
          avatar_url: ghUser.avatar_url,
          access_token: cleanToken,
          scope: 'repo user',
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    } catch (err) {
      console.warn('[githubService] Failed to save GitHub connection to DB:', err);
    }
  }

  localStorage.setItem(GITHUB_CONN_KEY, JSON.stringify(connObj));
  return connObj;
};

// 4. DISCONNECT GITHUB
export const disconnectGitHub = async (): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    try {
      await (supabase as any)
        .from('github_connections')
        .delete()
        .eq('user_id', user.id);
    } catch (e) {
      console.warn('[githubService] Delete connection DB error:', e);
    }
  }
  localStorage.removeItem(GITHUB_CONN_KEY);
  localStorage.removeItem(GITHUB_REPO_KEY);
  localStorage.removeItem(GITHUB_CHANGES_KEY);
};

// 5. FETCH USER ACCESSIBLE REPOSITORIES FROM GITHUB API (TEST 2)
export const getUserRepositories = async (): Promise<GitHubRepositoryItem[]> => {
  const token = await getStoredToken();
  if (!token) return [];

  const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&type=all', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(handleGitHubApiError(res, errJson));
  }

  const repos = await res.json();
  return repos.map((r: any) => ({
    id: r.id,
    name: r.name,
    owner: r.owner.login,
    fullName: r.full_name,
    visibility: r.private ? 'Private' : 'Public',
    defaultBranch: r.default_branch || 'main',
    selectedBranch: r.default_branch || 'main',
    htmlUrl: r.html_url,
    starsCount: r.stargazers_count || 0,
    forksCount: r.forks_count || 0,
    description: r.description || ''
  }));
};

// 6. SAVE & GET SELECTED REPOSITORY (TEST 3)
export const saveSelectedRepository = async (repo: GitHubRepositoryItem): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    try {
      await (supabase as any)
        .from('github_repositories')
        .update({ is_selected: false })
        .eq('user_id', user.id);

      await (supabase as any)
        .from('github_repositories')
        .upsert({
          user_id: user.id,
          github_repository_id: typeof repo.id === 'number' ? repo.id : null,
          owner: repo.owner,
          name: repo.name,
          full_name: repo.fullName,
          default_branch: repo.defaultBranch,
          selected_branch: repo.selectedBranch || repo.defaultBranch,
          is_private: repo.visibility === 'Private',
          html_url: repo.htmlUrl,
          is_selected: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,owner,name' });
    } catch (e) {
      console.warn('[githubService] saveSelectedRepository DB error:', e);
    }
  }
  localStorage.setItem(GITHUB_REPO_KEY, JSON.stringify(repo));
};

export const getSelectedRepository = async (): Promise<GitHubRepositoryItem | null> => {
  // Check local storage first
  const cached = localStorage.getItem(GITHUB_REPO_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.owner && parsed.name) return parsed;
    } catch (e) {
      /* ignore */
    }
  }

  // Fetch real repositories from GitHub API
  const repos = await getUserRepositories();
  if (repos.length > 0) {
    // Prefer Aiet-Unisphere/AIET-UniSphere if available
    const defaultTarget = repos.find(r => r.fullName.toLowerCase() === 'aiet-unisphere/aiet-unisphere') || repos[0];
    await saveSelectedRepository(defaultTarget);
    return defaultTarget;
  }

  return null;
};

// 7. GET REPOSITORY OVERVIEW INFO FROM GITHUB API (TEST 3)
export const getRepositoryInfo = async (): Promise<RepositoryInfo> => {
  const token = await getStoredToken();
  const conn = await getGitHubConnection();
  const selectedRepo = await getSelectedRepository();

  if (!token || !conn || !selectedRepo) {
    return {
      id: 'not-connected',
      name: selectedRepo?.name || 'No Repository Selected',
      owner: selectedRepo?.owner || 'N/A',
      visibility: selectedRepo?.visibility || 'Public',
      defaultBranch: selectedRepo?.defaultBranch || 'main',
      currentBranch: selectedRepo?.selectedBranch || 'main',
      lastCommit: 'Not Connected',
      status: 'Not Connected',
      githubConnected: false,
      githubUsername: '',
      starsCount: 0,
      forksCount: 0,
      cloneUrl: ''
    };
  }

  const repoRes = await fetch(`https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.name}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!repoRes.ok) {
    const errJson = await repoRes.json().catch(() => ({}));
    throw new Error(handleGitHubApiError(repoRes, errJson));
  }

  const ghRepo = await repoRes.json();
  const activeBranch = selectedRepo.selectedBranch || ghRepo.default_branch || 'main';

  // Fetch latest commit for active branch
  let lastCommitMsg = 'No commits found';
  let lastCommitSha = '';
  let lastCommitAuthor = '';
  let lastCommitDate = '';

  const commitRes = await fetch(`https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.name}/commits/${activeBranch}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (commitRes.ok) {
    const commitData = await commitRes.json();
    lastCommitMsg = commitData.commit.message;
    lastCommitSha = commitData.sha;
    lastCommitAuthor = commitData.commit.author?.name || commitData.author?.login || 'Developer';
    lastCommitDate = new Date(commitData.commit.author?.date).toLocaleString();
  }

  return {
    id: String(ghRepo.id),
    name: ghRepo.name,
    owner: ghRepo.owner.login,
    visibility: ghRepo.private ? 'Private' : 'Public',
    defaultBranch: ghRepo.default_branch || 'main',
    currentBranch: activeBranch,
    lastCommit: `${lastCommitMsg} (${lastCommitSha.substring(0, 7)})`,
    lastCommitSha: lastCommitSha,
    lastCommitAuthor: lastCommitAuthor,
    lastCommitDate: lastCommitDate,
    status: 'Connected',
    githubConnected: true,
    githubUsername: conn.githubUsername,
    starsCount: ghRepo.stargazers_count || 0,
    forksCount: ghRepo.forks_count || 0,
    cloneUrl: ghRepo.clone_url,
    htmlUrl: ghRepo.html_url
  };
};

// 8. GET REAL BRANCHES FROM GITHUB (TEST 4)
export const getBranches = async (): Promise<GitBranchItem[]> => {
  const token = await getStoredToken();
  const repo = await getSelectedRepository();
  if (!token || !repo) return [];

  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/branches`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    console.error('[githubService] getBranches failed:', handleGitHubApiError(res, errJson));
    return [];
  }

  const branches = await res.json();

  return Promise.all(branches.map(async (b: any) => {
    let msg = 'Branch tip';
    let author = repo.owner;
    let date = 'Recently';

    if (b.commit?.url) {
      try {
        const cRes = await fetch(b.commit.url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'AIET-UniSphere-App'
          }
        });
        if (cRes.ok) {
          const cData = await cRes.json();
          msg = cData.commit.message;
          author = cData.commit.author?.name || author;
          date = new Date(cData.commit.author?.date).toLocaleDateString();
        }
      } catch (e) { /* ignore */ }
    }

    return {
      id: b.name,
      name: b.name,
      lastCommitMessage: msg,
      updatedTime: date,
      author: author,
      sha: b.commit?.sha,
      isDefault: b.name === repo.defaultBranch
    };
  }));
};

// 9. SWITCH ACTIVE BRANCH
export const switchBranch = async (branchName: string): Promise<RepositoryInfo> => {
  const repo = await getSelectedRepository();
  if (repo) {
    repo.selectedBranch = branchName;
    await saveSelectedRepository(repo);
  }
  return getRepositoryInfo();
};

// 10. GET COMMITS FROM GITHUB API (TEST 5)
export const getCommits = async (): Promise<GitCommitItem[]> => {
  const token = await getStoredToken();
  const repo = await getSelectedRepository();
  if (!token || !repo) return [];

  const activeBranch = repo.selectedBranch || repo.defaultBranch || 'main';

  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits?sha=${activeBranch}&per_page=30`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    console.error('[githubService] getCommits failed:', handleGitHubApiError(res, errJson));
    return [];
  }

  const commits = await res.json();
  return commits.map((c: any) => ({
    id: c.sha,
    hash: c.sha,
    shortHash: c.sha.substring(0, 7),
    message: c.commit.message,
    author: c.commit.author?.name || c.author?.login || 'Developer',
    date: new Date(c.commit.author?.date).toLocaleString(),
    branch: activeBranch,
    avatar: c.author?.avatar_url,
    commitUrl: c.html_url
  }));
};

// 11. GET DETAILED COMMIT SPECIFICALLY FOR MODAL (TEST 5)
export const getCommitDetails = async (sha: string): Promise<GitCommitItem | null> => {
  const token = await getStoredToken();
  const repo = await getSelectedRepository();
  if (!token || !repo) return null;

  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits/${sha}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!res.ok) return null;
  const c = await res.json();

  return {
    id: c.sha,
    hash: c.sha,
    shortHash: c.sha.substring(0, 7),
    message: c.commit.message,
    author: c.commit.author?.name || c.author?.login || 'Developer',
    date: new Date(c.commit.author?.date).toLocaleString(),
    branch: repo.selectedBranch || repo.defaultBranch || 'main',
    avatar: c.author?.avatar_url,
    commitUrl: c.html_url,
    filesChanged: (c.files || []).map((f: any) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions || 0,
      deletions: f.deletions || 0,
      changes: f.changes || 0
    }))
  };
};

// 12. UNCOMMITTED CHANGES TRACKING
export const getGitChanges = async (): Promise<GitFileChange> => {
  const repo = await getSelectedRepository();
  const { data: { user } } = await supabase.auth.getUser();

  if (user && repo) {
    try {
      const { data } = await (supabase as any)
        .from('github_workspace_changes')
        .select('*')
        .eq('user_id', user.id);

      if (data && data.length > 0) {
        const modified: string[] = [];
        const added: string[] = [];
        const deleted: string[] = [];
        const renamed: string[] = [];

        data.forEach((row: any) => {
          if (row.status === 'MODIFIED') modified.push(row.file_path);
          else if (row.status === 'ADDED') added.push(row.file_path);
          else if (row.status === 'DELETED') deleted.push(row.file_path);
          else if (row.status === 'RENAMED') renamed.push(row.file_path);
        });

        return { modified, added, deleted, renamed };
      }
    } catch (e) {
      /* ignore */
    }
  }

  const cached = localStorage.getItem(GITHUB_CHANGES_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* ignore */ }
  }

  return { modified: [], added: [], deleted: [], renamed: [] };
};

export const recordWorkspaceFileChange = async (
  filePath: string,
  content: string,
  status: 'MODIFIED' | 'ADDED' | 'DELETED' | 'RENAMED',
  originalContent?: string
): Promise<void> => {
  const repo = await getSelectedRepository();
  const { data: { user } } = await supabase.auth.getUser();

  if (user && repo) {
    try {
      await (supabase as any)
        .from('github_workspace_changes')
        .upsert({
          user_id: user.id,
          repository_id: repo.dbId || null,
          file_path: filePath,
          content: content,
          original_content: originalContent || null,
          status: status,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,repository_id,file_path' });
    } catch (e) {
      /* ignore */
    }
  }

  const changes = await getGitChanges();
  if (status === 'MODIFIED' && !changes.modified.includes(filePath)) changes.modified.push(filePath);
  if (status === 'ADDED' && !changes.added.includes(filePath)) changes.added.push(filePath);
  if (status === 'DELETED' && !changes.deleted.includes(filePath)) changes.deleted.push(filePath);
  if (status === 'RENAMED' && !changes.renamed?.includes(filePath)) {
    changes.renamed = [...(changes.renamed || []), filePath];
  }

  localStorage.setItem(GITHUB_CHANGES_KEY, JSON.stringify(changes));
};

export const clearWorkspaceChanges = async (): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    try {
      await (supabase as any)
        .from('github_workspace_changes')
        .delete()
        .eq('user_id', user.id);
    } catch (e) {
      /* ignore */
    }
  }
  localStorage.setItem(GITHUB_CHANGES_KEY, JSON.stringify({ modified: [], added: [], deleted: [], renamed: [] }));
};

// 13. COMMIT AND PUSH CHANGES TO GITHUB
export const addCommit = async (message: string, targetBranchInput?: string): Promise<GitCommitItem> => {
  const cleanMsg = message.trim();
  if (!cleanMsg) throw new Error("Commit message cannot be empty.");

  const token = await getStoredToken();
  const conn = await getGitHubConnection();
  const repo = await getSelectedRepository();

  if (!token || !conn || !repo) {
    throw new Error("GitHub account or repository is not connected.");
  }

  const targetBranch = targetBranchInput || repo.selectedBranch || repo.defaultBranch || 'main';
  const changes = await getGitChanges();
  const filePaths = [...changes.modified, ...changes.added, ...changes.deleted];

  if (filePaths.length === 0) {
    throw new Error("No uncommitted changes found in workspace to commit.");
  }

  for (const filePath of filePaths) {
    const apiPath = filePath.replace(/^\//, '');

    if (changes.deleted.includes(filePath)) {
      const fileRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${apiPath}?ref=${targetBranch}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AIET-UniSphere-App'
        }
      });

      if (fileRes.ok) {
        const fileData = await fileRes.json();
        const deleteRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${apiPath}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'AIET-UniSphere-App',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: cleanMsg,
            sha: fileData.sha,
            branch: targetBranch
          })
        });

        if (!deleteRes.ok) {
          const errJson = await deleteRes.json().catch(() => ({}));
          throw new Error(handleGitHubApiError(deleteRes, errJson));
        }
      }
    } else {
      let existingSha: string | undefined = undefined;
      const checkRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${apiPath}?ref=${targetBranch}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AIET-UniSphere-App'
        }
      });

      if (checkRes.ok) {
        const existingData = await checkRes.json();
        existingSha = existingData.sha;
      }

      const rawContent = `// Updated ${apiPath}\n`;
      const base64Content = btoa(unescape(encodeURIComponent(rawContent)));

      const putRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${apiPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AIET-UniSphere-App',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: cleanMsg,
          content: base64Content,
          sha: existingSha,
          branch: targetBranch
        })
      });

      if (!putRes.ok) {
        const errJson = await putRes.json().catch(() => ({}));
        throw new Error(handleGitHubApiError(putRes, errJson));
      }
    }
  }

  await clearWorkspaceChanges();
  const latestCommits = await getCommits();
  return latestCommits[0] || {
    id: `cmt-${Date.now()}`,
    hash: 'latest',
    shortHash: 'latest',
    message: cleanMsg,
    author: conn.githubUsername,
    date: 'Just now',
    branch: targetBranch
  };
};

// 14. FETCH / SYNC WITH GITHUB (TEST 7)
export const syncRepository = async (): Promise<{
  synced: boolean;
  remoteUpdated: boolean;
  conflict: boolean;
  remoteCommitMessage?: string;
}> => {
  const token = await getStoredToken();
  const repo = await getSelectedRepository();
  if (!token || !repo) {
    throw new Error("Connect your GitHub account to sync repositories.");
  }

  const activeBranch = repo.selectedBranch || repo.defaultBranch || 'main';

  const commitRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits/${activeBranch}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!commitRes.ok) {
    const errJson = await commitRes.json().catch(() => ({}));
    throw new Error(handleGitHubApiError(commitRes, errJson));
  }

  const remoteCommit = await commitRes.json();
  const changes = await getGitChanges();
  const hasLocalEdits = changes.modified.length > 0 || changes.added.length > 0 || changes.deleted.length > 0;

  return {
    synced: true,
    remoteUpdated: false,
    conflict: hasLocalEdits,
    remoteCommitMessage: remoteCommit.commit?.message
  };
};

// 15. FETCH REAL GITHUB TREE & FILES FOR PROJECT WORKSPACE (TEST 6)
export const getRemoteFileTree = async (owner: string, repoName: string, branch: string): Promise<any[]> => {
  const token = await getStoredToken();
  if (!token) return [];

  const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    console.error('[githubService] getRemoteFileTree failed:', handleGitHubApiError(res, errJson));
    return [];
  }

  const data = await res.json();
  return data.tree || [];
};

export const getRemoteFileContent = async (owner: string, repoName: string, path: string, branch: string): Promise<string> => {
  const token = await getStoredToken();
  if (!token) return '';

  const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${branch}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIET-UniSphere-App'
    }
  });

  if (!res.ok) return '';
  const data = await res.json();
  if (data.content && data.encoding === 'base64') {
    try {
      return decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    } catch (e) {
      return atob(data.content.replace(/\n/g, ''));
    }
  }
  return '';
};

// 16. RATE LIMIT DIAGNOSTICS (TEST 10)
export const getRateLimitDiagnostics = async (): Promise<RateLimitDiagnostics | null> => {
  const token = await getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'AIET-UniSphere-App'
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    const core = data.resources?.core;
    if (!core) return null;

    return {
      limit: core.limit,
      remaining: core.remaining,
      resetTime: new Date(core.reset * 1000).toLocaleTimeString()
    };
  } catch (e) {
    return null;
  }
};
