REVOKE SELECT ON TABLE public.github_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  user_id,
  github_user_id,
  github_username,
  avatar_url,
  token_type,
  scope,
  created_at,
  updated_at
) ON TABLE public.github_connections TO authenticated;