<!-- markdownlint-disable MD033 MD041 -->

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,18&height=200&section=header&text=AIET%20UniSphere&fontSize=62&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=One%20platform.%20Every%20corner%20of%20campus.&descAlignY=60&descSize=20" alt="AIET UniSphere banner" width="100%" />

<p>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-Backend-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" /></a>
  <a href="https://reactrouter.com"><img src="https://img.shields.io/badge/React_Router-7-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white" alt="React Router" /></a>
</p>

<p>
  <img src="https://img.shields.io/github/last-commit/Aiet-Unisphere/AIET-UniSphere?style=flat-square&color=blueviolet" alt="Last commit" />
  <img src="https://img.shields.io/github/languages/top/Aiet-Unisphere/AIET-UniSphere?style=flat-square" alt="Top language" />
  <img src="https://img.shields.io/github/repo-size/Aiet-Unisphere/AIET-UniSphere?style=flat-square" alt="Repo size" />
  <img src="https://img.shields.io/github/issues/Aiet-Unisphere/AIET-UniSphere?style=flat-square" alt="Issues" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs welcome" />
  <img src="https://img.shields.io/badge/status-in%20development-orange?style=flat-square" alt="Status" />
</p>

<h3>A fast, modern campus platform for Alva's Institute of Engineering and Technology (AIET), built on React, TypeScript, Vite and Supabase.</h3>

<p>
  <a href="#-quick-start"><b>Quick Start</b></a> ·
  <a href="#-features"><b>Features</b></a> ·
  <a href="#-architecture"><b>Architecture</b></a> ·
  <a href="#-supabase-setup"><b>Supabase</b></a> ·
  <a href="#-deployment"><b>Deploy</b></a> ·
  <a href="#-contributing"><b>Contribute</b></a>
</p>

</div>

---

## 📑 Table of Contents

<details>
<summary>Click to expand</summary>

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [Supabase Setup](#-supabase-setup)
- [Scripts](#-scripts)
- [Code Quality](#-code-quality)
- [Deployment](#-deployment)
- [Continuous Integration](#-continuous-integration)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [Security](#-security)
- [FAQ & Troubleshooting](#-faq--troubleshooting)
- [License](#-license)
- [Acknowledgements](#-acknowledgements)

</details>

---

## 🎯 Overview

Campus information is usually scattered across notice boards, group chats and separate portals. **AIET UniSphere** aims to bring it together in one responsive web app.

It is a single-page application (SPA) with a typed React frontend and **Supabase** as the backend, which provides Postgres, authentication, storage and realtime features without a custom server to maintain.

| | |
|---|---|
| 🧑‍🎓 **For** | Students, faculty and campus administrators at AIET |
| ⚡ **Built for** | Speed (Vite), safety (TypeScript, Row Level Security) and easy deployment (static hosting) |
| 🧩 **Designed to** | Be modular, so new campus services can be added as routes and Supabase tables |

---

## ✨ Features

> The sections below describe the platform's capabilities and the foundation already in place. Keep this list in sync with what ships.

<table>
<tr>
<td width="50%" valign="top">

### 🔐 Authentication
Secure sign-up, login and session handling powered by Supabase Auth, with JWT-based sessions.

### 🗄️ Managed Database
Postgres schema, migrations and policies versioned in the [`supabase/`](./supabase) folder.

### 🛡️ Row Level Security
Access rules are enforced in the database, so the browser never has to be trusted.

</td>
<td width="50%" valign="top">

### 🧭 Seamless Navigation
Client-side routing with React Router v7 for instant page transitions and deep-linkable URLs.

### 🎨 Clean, Responsive UI
Built with React 19 and [Lucide](https://lucide.dev) icons. Works on phones, tablets and desktops.

### ⚡ Developer Experience
Vite HMR, strict TypeScript and Oxlint give instant feedback while you code.

</td>
</tr>
</table>

---

## 🛠 Tech Stack

| Layer | Technology | Why |
|:--|:--|:--|
| **UI framework** | [React 19](https://react.dev) | Component model, modern concurrent features |
| **Language** | [TypeScript 6](https://www.typescriptlang.org) | Type safety across the whole codebase |
| **Build tool** | [Vite 8](https://vite.dev) + `@vitejs/plugin-react` | Near-instant dev server and optimized builds |
| **Routing** | [React Router DOM 7](https://reactrouter.com) | Declarative client-side routing |
| **Backend (BaaS)** | [Supabase](https://supabase.com) via `@supabase/supabase-js` | Auth, Postgres, storage, realtime |
| **Icons** | [Lucide React](https://lucide.dev) | Consistent, lightweight icon set |
| **Linting** | [Oxlint](https://oxc.rs) | Rust-powered, extremely fast linter |

---

## 🏗 Architecture

### System overview

```mermaid
flowchart LR
    U([👤 User Browser]) -->|loads static bundle| CDN[Static Host<br/>Netlify / Vercel]
    U <-->|HTTPS + JWT| SB

    subgraph SB [Supabase Project]
        direction TB
        AUTH[🔐 Auth]
        DB[(🗄️ Postgres + RLS)]
        STO[📦 Storage]
        RT[⚡ Realtime]
    end

    CDN -.serves.-> APP[React SPA<br/>Vite build]
    APP --> U
```

### Request flow

```mermaid
sequenceDiagram
    participant B as Browser (React SPA)
    participant A as Supabase Auth
    participant D as Postgres (RLS)

    B->>A: Sign in (email / provider)
    A-->>B: Session + JWT
    B->>D: Query with JWT (supabase-js)
    D->>D: Evaluate RLS policies for auth.uid()
    D-->>B: Only rows the user is allowed to see
```

**How it fits together**

1. The browser downloads the static Vite bundle from any static host.
2. `@supabase/supabase-js` creates a client from the project URL and publishable (anon) key.
3. Users authenticate with Supabase Auth and receive a JWT.
4. Every query carries that JWT, and **Row Level Security** policies decide what each user can read or write.

---

## 📂 Project Structure

```text
AIET-UniSphere/
├── public/                  # Static assets served as-is
├── src/                     # Application source code
├── supabase/                # Supabase config, migrations and policies
├── .env.example             # Template for required environment variables
├── .gitignore
├── .oxlintrc.json           # Oxlint configuration
├── index.html               # Vite HTML entry point
├── package.json             # Dependencies and npm scripts
├── tsconfig.json            # TypeScript project references
├── tsconfig.app.json        # TypeScript config for app code
├── tsconfig.node.json       # TypeScript config for Vite / Node tooling
└── vite.config.ts           # Vite configuration
```

<details>
<summary><b>Suggested layout inside <code>src/</code></b> (adapt to your codebase)</summary>

```text
src/
├── components/     # Reusable UI components
├── pages/          # Route-level pages
├── lib/            # Supabase client and shared helpers
├── hooks/          # Custom React hooks
├── types/          # Shared TypeScript types
└── main.tsx        # Application entry point
```

</details>

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Check |
|:--|:--|:--|
| Node.js | 20+ (22 LTS recommended) | `node -v` |
| npm | 10+ | `npm -v` |
| Supabase account | free tier is enough | [supabase.com](https://supabase.com) |

### Run it locally

```bash
# 1. Clone
git clone https://github.com/Aiet-Unisphere/AIET-UniSphere.git
cd AIET-UniSphere

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
#    then open .env and add your Supabase URL and key

# 4. Start the dev server
npm run dev
```

Open **http://localhost:5173** and you're running. 🎉

> 💡 **Windows (PowerShell):** use `Copy-Item .env.example .env` instead of `cp`.

---

## 🔑 Environment Variables

Create a `.env` file in the project root. It is git-ignored, so never commit it.

```env
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

| Variable | Required | Description |
|:--|:--:|:--|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Publishable (anon) key from your Supabase project |

📍 Find both in **Supabase Dashboard → Project Settings → API**.

> [!WARNING]
> Vite exposes every variable prefixed with `VITE_` to the browser. Only use the **publishable/anon** key here. Never put a `service_role` key in a `VITE_` variable.

<details>
<summary><b>Example Supabase client</b> (<code>src/lib/supabase.ts</code>)</summary>

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(url, key)
```

</details>

---

## 🗄 Supabase Setup

The [`supabase/`](./supabase) folder holds the database definition for the project.

**1. Create a project** at [supabase.com](https://supabase.com) and copy the URL and publishable key into `.env`.

**2. Apply the schema**, using one of these options:

<details open>
<summary><b>Option A: Supabase CLI (recommended)</b></summary>

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

</details>

<details>
<summary><b>Option B: SQL Editor</b></summary>

Open the SQL files in `supabase/` and run them in order in the Supabase **SQL Editor**.

</details>

**3. Configure Auth** in **Authentication → Providers** by enabling the sign-in methods you need.

**4. Add redirect URLs** in **Authentication → URL Configuration**:

```text
http://localhost:5173
https://your-production-domain.com
```

<details>
<summary><b>Row Level Security pattern</b> (example)</summary>

Always enable RLS on tables that hold user data:

```sql
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);
```

</details>

---

## 📜 Scripts

| Command | What it does |
|:--|:--|
| `npm run dev` | Starts the Vite dev server with hot module replacement |
| `npm run build` | Type-checks with `tsc -b`, then builds to `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run lint` | Lints the project with Oxlint |

---

## 🧹 Code Quality

- **Strict TypeScript** using project references (`tsconfig.app.json` and `tsconfig.node.json`).
- **Oxlint** configured in [`.oxlintrc.json`](./.oxlintrc.json).
- **Pre-PR check:**

  ```bash
  npm run lint && npm run build
  ```

<details>
<summary><b>Enable type-aware linting</b> (recommended for production)</summary>

Install `oxlint-tsgolint` and update `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": { "typeAware": true },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

</details>

---

## ☁️ Deployment

`npm run build` outputs a static site to `dist/`, so it can be hosted almost anywhere.

| Setting | Value |
|:--|:--|
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Because the app uses client-side routing, add an SPA fallback so deep links and page refreshes don't return 404.

<details>
<summary><b>Netlify</b></summary>

Create `public/_redirects`:

```text
/*    /index.html   200
```

</details>

<details>
<summary><b>Vercel</b></summary>

Create `vercel.json` in the project root:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

</details>

After deploying, add the production URL to Supabase **Authentication → URL Configuration**.

---

## 🔄 Continuous Integration

Add this workflow at `.github/workflows/ci.yml` to lint and build every push and pull request:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
        env:
          VITE_SUPABASE_URL: https://placeholder.supabase.co
          VITE_SUPABASE_PUBLISHABLE_KEY: placeholder-key
```

---

## 🗺 Roadmap

- [x] Project scaffold with React, TypeScript and Vite
- [x] Supabase integration and environment configuration
- [x] Linting with Oxlint
- [ ] Complete authentication flow
- [ ] Role-based access (student, faculty, admin)
- [ ] Announcements and events module
- [ ] Notifications
- [ ] Automated tests and CI pipeline
- [ ] Accessibility and performance audit
- [ ] Dark mode

Have an idea? [Open a feature request](https://github.com/Aiet-Unisphere/AIET-UniSphere/issues/new).

---

## 🤝 Contributing

Contributions make open source great, and they are very welcome.

1. **Fork** the repository.
2. **Create a branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Commit** using [Conventional Commits](https://www.conventionalcommits.org):
   ```bash
   git commit -m "feat: add event listing page"
   ```
4. **Verify:** `npm run lint && npm run build`
5. **Push** and open a **Pull Request**.

| Prefix | Use for |
|:--|:--|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |
| `chore:` | Tooling, dependencies, config |

<details>
<summary><b>Pull request checklist</b></summary>

- [ ] Code builds with `npm run build`
- [ ] Lint passes with `npm run lint`
- [ ] No secrets or `.env` files committed
- [ ] New database changes include a migration in `supabase/`
- [ ] UI changes checked on mobile and desktop

</details>

For larger changes, please [open an issue](https://github.com/Aiet-Unisphere/AIET-UniSphere/issues) first to discuss the approach.

---

## 🔒 Security

- Never commit `.env` files or any `service_role` key.
- Enable **Row Level Security** on every table that stores user data.
- Found a vulnerability? Please **do not open a public issue**. Contact the maintainers privately instead.

---

## 🩺 FAQ & Troubleshooting

<details>
<summary><b>Blank page, with <code>supabaseUrl is required</code> in the console</b></summary>

Your `.env` file is missing or a variable name is wrong. Fix it, then **restart** `npm run dev`, because Vite only reads env files on startup.

</details>

<details>
<summary><b>Login redirects to the wrong URL</b></summary>

Add your local and production URLs in Supabase **Authentication → URL Configuration**.

</details>

<details>
<summary><b>404 when refreshing a page after deploying</b></summary>

Add the SPA fallback rule from the [Deployment](#-deployment) section.

</details>

<details>
<summary><b>Queries return empty data or <code>permission denied</code></b></summary>

Check that RLS policies exist for the table and that you are signed in. With RLS enabled and no policies, nothing is readable.

</details>

<details>
<summary><b>TypeScript errors after pulling new changes</b></summary>

Run `npm install` to sync dependencies, then restart your editor's TypeScript server.

</details>

---

## 📄 License

Add a `LICENSE` file to the repository root (for example the [MIT License](https://choosealicense.com/licenses/mit/)) and reference it here.

---

## 🙏 Acknowledgements

- [React](https://react.dev), [Vite](https://vite.dev) and [React Router](https://reactrouter.com)
- [Supabase](https://supabase.com) for the backend platform
- [Lucide](https://lucide.dev) for the icon set
- [Oxc](https://oxc.rs) for the Oxlint linter
- [Shields.io](https://shields.io) and [Capsule Render](https://github.com/kyechan99/capsule-render) for badges and banner
- **Alva's Institute of Engineering and Technology (AIET)**

---

<div align="center">

### ⭐ If this project helps you, give it a star!

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,18&height=100&section=footer" alt="footer" width="100%" />

</div>
