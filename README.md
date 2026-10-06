<div align="center">

# 🌐 AIET UniSphere

**A unified campus platform for Alva's Institute of Engineering and Technology (AIET), built with React, TypeScript, Vite and Supabase.**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20development-orange)

[Live Demo](#-live-demo) · [Features](#-features) · [Getting Started](#-getting-started) · [Project Structure](#-project-structure) · [Contributing](#-contributing)

</div>

---

## 📖 Table of Contents

- [About the Project](#-about-the-project)
- [Live Demo](#-live-demo)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Supabase Setup](#-supabase-setup)
- [Available Scripts](#-available-scripts)
- [Code Quality](#-code-quality)
- [Deployment](#-deployment)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)
- [Acknowledgements](#-acknowledgements)

---

## 📌 About the Project

**AIET UniSphere** is a web application that brings campus life at AIET into one place. It is a single-page application (SPA) built on a modern frontend stack, with **Supabase** providing authentication, database and storage.

> **Problem:** Campus information, announcements and student services are usually scattered across notice boards, group chats and separate portals.
>
> **Solution:** UniSphere gives students and staff a single, fast, responsive web interface backed by a managed Postgres database.

<!-- TODO: Replace the two lines above with 2–3 sentences about what UniSphere specifically does. -->

---

## 🚀 Live Demo

<!-- TODO: Add your deployed URL, e.g. Netlify / Vercel -->

| Environment | URL |
| ----------- | --- |
| Production  | _coming soon_ |

### Screenshots

<!-- TODO: Add screenshots to /public/screenshots and link them here -->

| Home | Dashboard |
| ---- | --------- |
| ![Home](public/screenshots/home.png) | ![Dashboard](public/screenshots/dashboard.png) |

---

## ✨ Features

<!-- TODO: Edit this list to match what is actually implemented. -->

- 🔐 **Authentication**: sign up, log in and session handling via Supabase Auth
- 🧭 **Client-side routing**: fast page transitions with React Router v7
- 🗄️ **Cloud database**: Postgres tables, policies and migrations managed in the `supabase/` folder
- 🎨 **Modern UI**: clean, responsive interface with [Lucide](https://lucide.dev) icons
- ⚡ **Instant dev experience**: Vite HMR and TypeScript type-checking
- 🧹 **Fast linting**: Oxlint for near-instant feedback
- 🔒 **Secure config**: secrets kept in environment variables, never committed

---

## 🛠 Tech Stack

| Layer            | Technology |
| ---------------- | ---------- |
| Framework        | [React 19](https://react.dev) |
| Language         | [TypeScript](https://www.typescriptlang.org) |
| Build tool       | [Vite](https://vite.dev) with `@vitejs/plugin-react` |
| Routing          | [React Router DOM v7](https://reactrouter.com) |
| Backend / BaaS   | [Supabase](https://supabase.com) (`@supabase/supabase-js`) |
| Icons            | [Lucide React](https://lucide.dev) |
| Linting          | [Oxlint](https://oxc.rs) |

---

## 🏗 Architecture

```text
┌──────────────────────────┐        HTTPS / WebSocket        ┌────────────────────────┐
│   React + TypeScript     │ ──────────────────────────────▶ │        Supabase        │
│   SPA (Vite build)       │                                 │  Auth · Postgres · RLS │
│                          │ ◀────────────────────────────── │  Storage · Realtime    │
│  React Router • Lucide   │        JSON / session JWT       │                        │
└──────────────────────────┘                                 └────────────────────────┘
```

1. The browser loads the static Vite bundle.
2. `@supabase/supabase-js` initialises a client using the project URL and publishable (anon) key.
3. Auth sessions are issued as JWTs; Row Level Security (RLS) policies in Postgres decide what each user can read or write.

---

## 📂 Project Structure

```text
AIET-UniSphere/
├── public/                 # Static assets served as-is
├── src/                    # Application source (components, pages, hooks, lib)
├── supabase/               # Supabase config, SQL migrations and policies
├── .env.example            # Template for required environment variables
├── .gitignore
├── .oxlintrc.json          # Oxlint configuration
├── index.html              # Vite HTML entry point
├── package.json            # Dependencies and npm scripts
├── tsconfig.json           # TypeScript project references
├── tsconfig.app.json       # TypeScript config for app code
├── tsconfig.node.json      # TypeScript config for Vite/Node tooling
└── vite.config.ts          # Vite configuration
```

<!-- TODO: Expand `src/` with your real sub-folders, for example:
src/
├── components/   # Reusable UI components
├── pages/        # Route-level pages
├── lib/          # Supabase client and helpers
├── hooks/        # Custom React hooks
└── main.tsx      # App entry
-->

---

## 🏁 Getting Started

### Prerequisites

- **Node.js** 20 or later (22 LTS recommended)
- **npm** 10 or later
- A free **[Supabase](https://supabase.com)** account and project

### 1. Clone the repository

```bash
git clone https://github.com/Aiet-Unisphere/AIET-UniSphere.git
cd AIET-UniSphere
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your Supabase credentials (see [Environment Variables](#-environment-variables)).

### 4. Start the development server

```bash
npm run dev
```

The app will be available at **http://localhost:5173** by default.

---

## 🔑 Environment Variables

Create a `.env` file in the project root (never commit it):

| Variable                        | Required | Description |
| ------------------------------- | :------: | ----------- |
| `VITE_SUPABASE_URL`             | ✅ | Your Supabase project URL, e.g. `https://xyzcompany.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Your Supabase publishable / anon key |

Where to find them: **Supabase Dashboard → Project Settings → API**.

> ⚠️ Vite exposes every variable prefixed with `VITE_` to the browser. Only use the **publishable/anon** key here. **Never** put the `service_role` key in a `VITE_` variable.

---

## 🗄 Supabase Setup

The `supabase/` directory holds the database definition for the project.

1. Create a new project at [supabase.com](https://supabase.com).
2. Copy the project URL and publishable key into your `.env`.
3. Apply the schema, using one of these approaches:

   **Option A: Supabase CLI (recommended)**

   ```bash
   npm install -g supabase        # or: npx supabase ...
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   **Option B: SQL Editor**

   Open the SQL files inside `supabase/` and run them in order in the Supabase **SQL Editor**.

4. In **Authentication → Providers**, enable the sign-in methods you want (Email, Google, etc.).
5. In **Authentication → URL Configuration**, add `http://localhost:5173` (and your production URL) to the allowed redirect URLs.

<!-- TODO: List your tables, e.g. profiles, announcements, events, and any storage buckets. -->

---

## 📜 Available Scripts

| Command           | Description |
| ----------------- | ----------- |
| `npm run dev`     | Start the Vite dev server with hot module replacement |
| `npm run build`   | Type-check with `tsc -b`, then create a production build in `dist/` |
| `npm run preview` | Serve the production build locally for testing |
| `npm run lint`    | Run Oxlint across the project |

---

## 🧹 Code Quality

- **TypeScript** is used in strict project-reference mode (`tsconfig.app.json` and `tsconfig.node.json`).
- **Oxlint** is configured in `.oxlintrc.json`. For stricter, type-aware linting, install `oxlint-tsgolint` and enable it:

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

- Run `npm run lint && npm run build` before opening a pull request.

---

## ☁️ Deployment

The build output is a static site in `dist/`, so it can be hosted almost anywhere.

### Netlify / Vercel

| Setting          | Value |
| ---------------- | ----- |
| Build command    | `npm run build` |
| Publish / output | `dist` |
| Env variables    | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Because the app uses client-side routing, add an SPA fallback so deep links don't 404:

**Netlify**: create `public/_redirects`:

```text
/*    /index.html   200
```

**Vercel**: create `vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

After deploying, add the production URL to Supabase **Authentication → URL Configuration**.

---

## 🗺 Roadmap

<!-- TODO: Replace with your real plans. -->

- [x] Project scaffold with React, TypeScript and Vite
- [x] Supabase integration
- [ ] Complete authentication flow
- [ ] Role-based access (student, faculty, admin)
- [ ] Announcements and events module
- [ ] Notifications
- [ ] Automated tests and CI pipeline
- [ ] Accessibility and performance audit

---

## 🤝 Contributing

Contributions are welcome!

1. **Fork** the repository
2. Create a feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org)
   ```bash
   git commit -m "feat: add event listing page"
   ```
4. Make sure `npm run lint` and `npm run build` pass
5. Push your branch and open a **Pull Request**

Please open an [issue](https://github.com/Aiet-Unisphere/AIET-UniSphere/issues) first for large changes so we can discuss the approach.

---

## 🩺 Troubleshooting

| Problem | Fix |
| ------- | --- |
| Blank page and `supabaseUrl is required` in the console | `.env` is missing or variable names are wrong. Restart `npm run dev` after editing `.env`. |
| Auth redirects to the wrong URL | Add your local and production URLs in Supabase **Authentication → URL Configuration**. |
| 404 on page refresh after deploy | Add the SPA fallback rule (see [Deployment](#-deployment)). |
| Data returns empty or `permission denied` | Check that RLS policies exist for the table and that you are signed in. |
| TypeScript errors after pulling | Run `npm install` to sync dependency versions. |

---

## 📄 License

<!-- TODO: Add a LICENSE file (MIT is a common choice) and update this section. -->

Distributed under the **MIT License**. See `LICENSE` for details.

---

## 🙏 Acknowledgements

- [React](https://react.dev), [Vite](https://vite.dev) and [React Router](https://reactrouter.com)
- [Supabase](https://supabase.com) for the backend platform
- [Lucide](https://lucide.dev) for the icon set
- [Oxc](https://oxc.rs) for the Oxlint linter
- Alva's Institute of Engineering and Technology (AIET), Mijar, Moodbidri

---

<div align="center">

Made with ❤️ by the **AIET UniSphere** team

⭐ Star this repo if you find it useful!

</div>
