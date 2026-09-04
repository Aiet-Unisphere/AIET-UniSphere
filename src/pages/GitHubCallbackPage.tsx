import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { connectGitHubOAuth } from '../services/githubService';

export const GitHubCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const err = searchParams.get('error_description') || searchParams.get('error');

      if (err) {
        setError(`GitHub authorization rejected: ${err}`);
        return;
      }

      if (!code) {
        setError("Missing authorization code from GitHub callback URL.");
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/student/github/callback`;
        await connectGitHubOAuth(code, redirectUri);
        navigate('/student/github', { replace: true });
      } catch (e: any) {
        setError(e.message || "Failed to complete GitHub authorization.");
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <AppShell>
        <ErrorState message={error} onRetry={() => navigate('/student/github')} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <LoadingState message="Connecting your GitHub account to AIET-UniSphere..." />
    </AppShell>
  );
};

export default GitHubCallbackPage;
