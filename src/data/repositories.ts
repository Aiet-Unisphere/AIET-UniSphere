export interface GitHubConnection {
  id: string;
  userId: string;
  githubUserId: string;
  githubUsername: string;
  avatarUrl?: string;
  accessToken?: string;
  scope?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GitHubRepositoryItem {
  id: number | string;
  dbId?: string;
  name: string;
  owner: string;
  fullName: string;
  visibility: 'Public' | 'Private';
  defaultBranch: string;
  selectedBranch: string;
  htmlUrl: string;
  starsCount: number;
  forksCount: number;
  description?: string;
  isSelected?: boolean;
}

export interface RepositoryInfo {
  id: string;
  name: string;
  owner: string;
  visibility: 'Public' | 'Private';
  defaultBranch: string;
  currentBranch: string;
  lastCommit: string;
  lastCommitSha?: string;
  lastCommitAuthor?: string;
  lastCommitDate?: string;
  status: 'Connected' | 'Not Connected' | 'Synced';
  githubConnected: boolean;
  githubUsername: string;
  starsCount: number;
  forksCount: number;
  cloneUrl: string;
  htmlUrl?: string;
}

export interface GitBranchItem {
  id: string;
  name: string;
  lastCommitMessage: string;
  updatedTime: string;
  author: string;
  sha?: string;
  isDefault?: boolean;
}

export interface GitCommitItem {
  id: string;
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  branch: string;
  avatar?: string;
  commitUrl?: string;
  filesChanged?: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
  }[];
}

export interface GitFileChange {
  modified: string[];
  added: string[];
  deleted: string[];
  renamed?: string[];
  diffs?: {
    filename: string;
    status: 'MODIFIED' | 'ADDED' | 'DELETED' | 'RENAMED';
    additions?: number;
    deletions?: number;
  }[];
}

export const mockWorkspaceFiles = [
  {
    name: 'src',
    type: 'folder',
    path: 'src',
    id: 'src',
    children: [
      {
        name: 'App.tsx',
        type: 'file',
        path: 'src/App.tsx',
        id: 'src/App.tsx',
        language: 'typescript',
        content: `import React from 'react';\n\nexport default function App() {\n  return <div>Welcome to AIET UniSphere Workspace</div>;\n}`
      },
      {
        name: 'index.css',
        type: 'file',
        path: 'src/index.css',
        id: 'src/index.css',
        language: 'css',
        content: `:root {\n  --brand-orange: #ff4f18;\n}`
      }
    ]
  },
  {
    name: 'README.md',
    type: 'file',
    path: 'README.md',
    id: 'README.md',
    language: 'markdown',
    content: `# AIET-UniSphere Workspace\n\nConnected to GitHub repository.`
  }
];
