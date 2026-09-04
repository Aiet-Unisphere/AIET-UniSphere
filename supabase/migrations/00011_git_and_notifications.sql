-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00011: REAL GITHUB INTEGRATION & NOTIFICATIONS CLEANUP
-- ============================================================

-- 1. GITHUB CONNECTIONS TABLE
CREATE TABLE IF NOT EXISTS public.github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_user_id TEXT,
  github_username TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'bearer',
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_github_connection UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_github_connections_user ON public.github_connections(user_id);
ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own github connection" ON public.github_connections;
CREATE POLICY "Users can manage their own github connection"
  ON public.github_connections FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- 2. GITHUB REPOSITORIES MAPPING TABLE
CREATE TABLE IF NOT EXISTS public.github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.github_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_repository_id BIGINT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  selected_branch TEXT NOT NULL DEFAULT 'main',
  is_private BOOLEAN DEFAULT FALSE,
  html_url TEXT,
  is_selected BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_github_repo UNIQUE (user_id, owner, name)
);

CREATE INDEX IF NOT EXISTS idx_github_repos_user ON public.github_repositories(user_id);
CREATE INDEX IF NOT EXISTS idx_github_repos_selected ON public.github_repositories(user_id, is_selected);
ALTER TABLE public.github_repositories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own github repositories" ON public.github_repositories;
CREATE POLICY "Users can manage their own github repositories"
  ON public.github_repositories FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- 3. GITHUB WORKSPACE CHANGES TABLE (UNCOMMITTED CHANGES)
CREATE TABLE IF NOT EXISTS public.github_workspace_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repository_id UUID REFERENCES public.github_repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT,
  original_content TEXT,
  status TEXT NOT NULL CHECK (status IN ('MODIFIED', 'ADDED', 'DELETED', 'RENAMED')),
  old_file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_repo_filepath UNIQUE (user_id, repository_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_workspace_changes_user ON public.github_workspace_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_changes_repo ON public.github_workspace_changes(repository_id);
ALTER TABLE public.github_workspace_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own workspace changes" ON public.github_workspace_changes;
CREATE POLICY "Users can manage their own workspace changes"
  ON public.github_workspace_changes FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- 4. NOTIFICATIONS TABLE INDEXES & RLS POLICY FOR READ NOTIFICATION DELETION
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);

-- Security: Students can ONLY delete their own READ notifications.
-- Unread notifications cannot be deleted by RLS or UI.
DROP POLICY IF EXISTS "Users can delete own read notifications" ON public.notifications;
CREATE POLICY "Users can delete own read notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND is_read = true
  );
