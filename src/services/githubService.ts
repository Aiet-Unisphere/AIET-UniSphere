import { supabase } from '../lib/supabase';
import type { 
  RepositoryInfo, 
  GitBranchItem, 
  GitCommitItem, 
  GitFileChange,
  GitHubConnection,
  GitHubRepositoryItem
} from '../data/repositories';

export interface RateLimitDiagnostics {
  limit: number;
  remaining: number;
  resetTime: string;
}

async function githubApiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input.toString(), 'https://api.github.com');
  if (url.origin !== 'https://api.github.com') throw new Error('Unsupported GitHub API host.');
  let body: unknown;
  if (typeof init?.body === 'string') {
    try { body = JSON.parse(init.body); } catch { throw new Error('Invalid GitHub request payload.'); }
  }

  const { data, error } = await supabase.functions.invoke('github-api', {
    body: { path: `${url.pathname}${url.search}`, method: init?.method || 'GET', body },
  });
  if (error) throw new Error(`GitHub request failed: ${error.message}`);
  const status = Number(data?.status || 500);
  const responseBody = status === 204 || status === 304 ? null : JSON.stringify(data?.body ?? {});
  return new Response(responseBody, { status, headers: { 'Content-Type': 'application/json' } });
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
export const hasGitHubConnection = async (): Promise<boolean> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify session: ${authError.message}`);
  if (!user) return false;
  const { data, error } = await (supabase as any)
    .from('github_connections')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load GitHub connection: ${error.message}`);
  return Boolean(data);
};

// 1. GET GITHUB CONNECTION (TEST 1 & TEST 8)
export const getGitHubConnection = async (): Promise<GitHubConnection | null> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify session: ${authError.message}`);
  if (!user) return null;
  const { data, error } = await (supabase as any)
    .from('github_connections')
    .select('id, github_user_id, github_username, avatar_url, scope, created_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load GitHub connection: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    userId: user.id,
    githubUserId: data.github_user_id,
    githubUsername: data.github_username,
    avatarUrl: data.avatar_url,
    scope: data.scope,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
};

// 2. CONNECT WITH OAUTH CODE VIA EDGE FUNCTION
export const connectGitHubOAuth = async (code: string, redirectUri: string): Promise<GitHubConnection> => {
  const { data, error } = await supabase.functions.invoke('github-oauth', { body: { code, redirect_uri: redirectUri } });
  if (error || !data?.success) throw new Error(data?.error || error?.message || 'Failed to exchange GitHub authorization code.');

  const conn = await getGitHubConnection();
  if (!conn) throw new Error("Failed to retrieve connected GitHub profile.");
  return conn;
};

// 3. DISCONNECT GITHUB
export const disconnectGitHub = async (): Promise<void> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated session required to disconnect GitHub.');
  const { error } = await (supabase as any).from('github_connections').delete().eq('user_id', user.id);
  if (error) throw new Error(`Failed to disconnect GitHub: ${error.message}`);
};

// 5. FETCH USER ACCESSIBLE REPOSITORIES FROM GITHUB API (TEST 2)
export const getUserRepositories = async (): Promise<GitHubRepositoryItem[]> => {
  const token = await hasGitHubConnection();
  if (!token) return [];

  const res = await githubApiFetch('https://api.github.com/user/repos?sort=updated&per_page=100&type=all', {
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
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated session required to select a repository.');
  const connection = await getGitHubConnection();
  if (!connection) throw new Error('Connect GitHub before selecting a repository.');
  const { error: clearError } = await (supabase as any)
    .from('github_repositories')
    .update({ is_selected: false })
    .eq('user_id', user.id);
  if (clearError) throw new Error(`Failed to clear previous repository selection: ${clearError.message}`);

  const { data, error } = await (supabase as any)
    .from('github_repositories')
    .upsert({
      connection_id: connection.id,
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
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,owner,name' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to save repository selection: ${error?.message || 'No record returned.'}`);
  repo.dbId = data.id;
};

export const getSelectedRepository = async (): Promise<GitHubRepositoryItem | null> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify session: ${authError.message}`);
  if (!user) return null;
  const { data, error } = await (supabase as any)
    .from('github_repositories')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_selected', true)
    .maybeSingle();
  if (error) throw new Error(`Unable to load selected repository: ${error.message}`);
  if (!data) return null;
  return {
    id: data.github_repository_id || data.id,
    dbId: data.id,
    name: data.name,
    owner: data.owner,
    fullName: data.full_name,
    visibility: data.is_private ? 'Private' : 'Public',
    defaultBranch: data.default_branch,
    selectedBranch: data.selected_branch,
    htmlUrl: data.html_url,
    starsCount: 0,
    forksCount: 0,
  };
};

// 7. GET REPOSITORY OVERVIEW INFO FROM GITHUB API (TEST 3)
export const getRepositoryInfo = async (): Promise<RepositoryInfo> => {
  const token = await hasGitHubConnection();
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

  const repoRes = await githubApiFetch(`https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.name}`, {
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

  const commitRes = await githubApiFetch(`https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.name}/commits/${activeBranch}`, {
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
  const token = await hasGitHubConnection();
  const repo = await getSelectedRepository();
  if (!token || !repo) return [];

  const res = await githubApiFetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/branches`, {
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
        const cRes = await githubApiFetch(b.commit.url, {
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
  const token = await hasGitHubConnection();
  const repo = await getSelectedRepository();
  if (!token || !repo) return [];

  const activeBranch = repo.selectedBranch || repo.defaultBranch || 'main';

  const res = await githubApiFetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits?sha=${activeBranch}&per_page=30`, {
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
  const token = await hasGitHubConnection();
  const repo = await getSelectedRepository();
  if (!token || !repo) return null;

  const res = await githubApiFetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits/${sha}`, {
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
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify session: ${authError.message}`);
  if (!user || !repo?.dbId) return { modified: [], added: [], deleted: [], renamed: [] };

  const { data, error } = await (supabase as any)
    .from('github_workspace_changes')
    .select('file_path, status')
    .eq('user_id', user.id)
    .eq('repository_id', repo.dbId);
  if (error) throw new Error(`Unable to load workspace changes: ${error.message}`);

  const modified: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const renamed: string[] = [];
  (data || []).forEach((row: any) => {
    if (row.status === 'MODIFIED') modified.push(row.file_path);
    else if (row.status === 'ADDED') added.push(row.file_path);
    else if (row.status === 'DELETED') deleted.push(row.file_path);
    else if (row.status === 'RENAMED') renamed.push(row.file_path);
  });
  return { modified, added, deleted, renamed };
};

export const recordWorkspaceFileChange = async (
  filePath: string,
  content: string,
  status: 'MODIFIED' | 'ADDED' | 'DELETED' | 'RENAMED',
  originalContent?: string
): Promise<void> => {
  const repo = await getSelectedRepository();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !repo) throw new Error('Select a repository before recording workspace changes.');
  const { error } = await (supabase as any)
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
  if (error) throw new Error(`Failed to persist workspace change: ${error.message}`);

  const changes = await getGitChanges();
  if (status === 'MODIFIED' && !changes.modified.includes(filePath)) changes.modified.push(filePath);
  if (status === 'ADDED' && !changes.added.includes(filePath)) changes.added.push(filePath);
  if (status === 'DELETED' && !changes.deleted.includes(filePath)) changes.deleted.push(filePath);
  if (status === 'RENAMED' && !changes.renamed?.includes(filePath)) {
    changes.renamed = [...(changes.renamed || []), filePath];
  }

};

export const clearWorkspaceChanges = async (repositoryId?: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authenticated session required to clear workspace changes.');
  let query = (supabase as any).from('github_workspace_changes').delete().eq('user_id', user.id);
  if (repositoryId) query = query.eq('repository_id', repositoryId);
  const { error } = await query;
  if (error) throw new Error(`Failed to clear workspace changes: ${error.message}`);
};

// 13. COMMIT AND PUSH CHANGES TO GITHUB
export const addCommit = async (message: string, targetBranchInput?: string): Promise<GitCommitItem> => {
  const cleanMsg = message.trim();
  if (!cleanMsg) throw new Error("Commit message cannot be empty.");

  const token = await hasGitHubConnection();
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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !repo.dbId) throw new Error('Authenticated GitHub repository session required.');
  const { data: persistedChanges, error: changesError } = await (supabase as any)
    .from('github_workspace_changes')
    .select('file_path, status, content')
    .eq('user_id', user.id)
    .eq('repository_id', repo.dbId);
  if (changesError) throw new Error(`Unable to load saved workspace content: ${changesError.message}`);
  const changeByPath = new Map<string, { status: string; content: string | null }>(
    (persistedChanges || []).map((change: any) => [change.file_path, { status: change.status, content: change.content }])
  );

  for (const filePath of filePaths) {
    const apiPath = filePath.replace(/^\//, '');
    const change = changeByPath.get(filePath);
    if (!change) throw new Error(`Saved workspace data for ${filePath} is missing.`);

    if (changes.deleted.includes(filePath)) {
      const fileRes = await githubApiFetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${apiPath}?ref=${targetBranch}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AIET-UniSphere-App'
        }
      });

      if (fileRes.ok) {
        const fileData = await fileRes.json();
        const deleteRes = await githubApiFetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${apiPath}`, {
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
      const checkRes = await githubApiFetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${apiPath}?ref=${targetBranch}`, {
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

      const rawContent = change.content;
      if (rawContent === null) throw new Error(`Saved content for ${filePath} is missing.`);
      const base64Content = btoa(unescape(encodeURIComponent(rawContent)));

      const putRes = await githubApiFetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${apiPath}`, {
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

  await clearWorkspaceChanges(repo.dbId);
  const latestCommits = await getCommits();
  if (!latestCommits[0]) throw new Error('GitHub accepted the change, but the new commit could not be verified. Refresh commits to confirm.');
  return latestCommits[0];
};

// 14. FETCH / SYNC WITH GITHUB (TEST 7)
export const syncRepository = async (): Promise<{
  synced: boolean;
  remoteUpdated: boolean;
  conflict: boolean;
  remoteCommitMessage?: string;
}> => {
  const token = await hasGitHubConnection();
  const repo = await getSelectedRepository();
  if (!token || !repo) {
    throw new Error("Connect your GitHub account to sync repositories.");
  }

  const activeBranch = repo.selectedBranch || repo.defaultBranch || 'main';

  const commitRes = await githubApiFetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits/${activeBranch}`, {
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
  const token = await hasGitHubConnection();
  if (!token) throw new Error('Connect GitHub before loading repository files.');

  const res = await githubApiFetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`, {
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

  const data = await res.json();
  return data.tree || [];
};

export const getRemoteFileContent = async (owner: string, repoName: string, path: string, branch: string): Promise<string> => {
  const token = await hasGitHubConnection();
  if (!token) throw new Error('Connect GitHub before loading repository files.');

  const res = await githubApiFetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${branch}`, {
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
  const token = await hasGitHubConnection();
  if (!token) return null;

  try {
    const res = await githubApiFetch('https://api.github.com/rate_limit', {
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
