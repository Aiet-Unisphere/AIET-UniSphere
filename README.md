# AIET-UniSphere

AIET-UniSphere is a role-based academic management and learning application built with React, TypeScript, Vite, Supabase Auth, PostgreSQL, Storage, and Edge Functions.

## Local Setup

Requirements: Node.js 20+, npm, and a Supabase project.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_GITHUB_CLIENT_ID` if GitHub OAuth is enabled.
3. Start the app with `npm run dev`.

Only `VITE_` values are available to browser code. AI provider keys, GitHub OAuth secrets, and the Supabase service-role key must remain Edge Function secrets.

## Architecture

- React routes and role guards are in `src/App.tsx` and `src/app/guards`.
- Supabase browser access is initialized in `src/lib/supabase.ts`.
- Feature persistence is organized in `src/services`.
- PostgreSQL schema changes are additive SQL files under `supabase/migrations`.
- Privileged account provisioning, AI requests, GitHub OAuth, and GitHub API access run through Supabase Edge Functions.

## Supabase Setup

Link the CLI to the intended project, then apply migrations in order:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

The current additive work includes migrations `00016_secure_identifier_login.sql`, `00017_secure_assessment_attempts.sql`, and `00018_restrict_github_token_access.sql`; earlier schema migrations are also required. Do not edit already-applied migration history.

Configure server secrets without a `VITE_` prefix:

```powershell
npx supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=<provider-key> GITHUB_CLIENT_ID=<oauth-client-id> GITHUB_CLIENT_SECRET=<oauth-client-secret> SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

For OpenAI, set `AI_PROVIDER=openai` and `OPENAI_API_KEY`; `OPENAI_MODEL` and `GEMINI_MODEL` are optional. The AI Edge Function selects the only configured provider when `AI_PROVIDER` is omitted.

Deploy the Edge Functions:

```powershell
npx supabase functions deploy identifier-login --no-verify-jwt
npx supabase functions deploy admin-provision-user
npx supabase functions deploy ai-chat
npx supabase functions deploy github-oauth
npx supabase functions deploy github-api
```

The `identifier-login` function intentionally accepts unauthenticated requests so it can authenticate USN/employee-ID credentials; it validates the account and password server-side and returns only an Auth session. GitHub and AI tokens are read only by server-side functions.

## Commands

```powershell
npm run dev
npm run typecheck
npm run lint
npm run build
node --env-file=.env.local check_db_schema.mjs
```

The schema check verifies Supabase connectivity and that the legacy anonymous email lookup is blocked. It does not apply migrations or exercise role-specific RLS workflows.

## GitHub OAuth

Register the callback URL `<app-origin>/student/github/callback` with the GitHub OAuth application. Set the client ID in `VITE_GITHUB_CLIENT_ID`; configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as Supabase secrets. Repository API calls are proxied by `github-api`, and the GitHub access token is never returned to the browser.

## Verification Limitations

The automated local checks cover TypeScript, Vite bundling, and Oxlint. They do not replace applying migrations to a staging project, testing RLS with each role, configuring provider/OAuth secrets, or exercising live auth, storage, assessment, and GitHub workflows. See [PROJECT_COMPLETION.md](PROJECT_COMPLETION.md) for implemented slices and remaining work.