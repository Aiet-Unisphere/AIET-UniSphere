import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { connectGitHubOAuth, validateGitHubOAuthState } from '../services/githubService';

export const GitHubCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const incomingState = searchParams.get('state');
      const oauthError = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // 1. Handle user cancellation or GitHub OAuth rejection
      if (oauthError) {
        if (oauthError === 'access_denied') {
          setError('GitHub authorization was cancelled by the user.');
        } else {
          setError(`GitHub authorization rejected: ${errorDescription || oauthError}`);
        }
        return;
      }

      // 2. Validate cryptographic OAuth state (CSRF mitigation)
      if (!validateGitHubOAuthState(incomingState)) {
        setError('OAuth security validation failed: State parameter mismatch or expired session. Please return to the Git / GitHub page and initiate the connection again.');
        return;
      }

      // 3. Ensure authorization code is present
      if (!code) {
        setError('Missing authorization code from GitHub callback URL.');
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/student/github/callback`;
        await connectGitHubOAuth(code, redirectUri);
        navigate('/student/github', { replace: true });
      } catch (e: any) {
        setError(e.message || 'Failed to complete GitHub authorization.');
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
