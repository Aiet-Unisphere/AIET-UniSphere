# AIET-UniSphere Code Studio — Architecture Specification

## 1. System Overview

**AIET-UniSphere Code Studio** is a browser-based academic development environment engineered specifically for engineering students, faculty evaluation, and collaborative project workflows. Rather than mimicking external commercial IDEs, Code Studio delivers an academic-first development experience integrating source code editing, live project intelligence, defense (viva voce) preparation, documentation authoring, and secure sandboxed execution.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AIET-UniSphere Web Application                      │
│                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────────────────────┐  │
│  │ WorkspaceActivityBar  │  │ WorkspaceHeader & Quick Toolbar       │  │
│  │ (UniSphere Suite)     │  │ (Project, Run/Stop, Import, Save)     │  │
│  ├───────────────────────┤  ├───────────────────┬───────────────────┤  │
│  │ Side Panel            │  │ Monaco Editor     │ Live HTML Preview │  │
│  │ - File Explorer       │  │ (Multi-tab,       │ (CSP Sandboxed,   │  │
│  │ - Project Intelligence│  │  Autosave,        │  Dynamic reload)  │  │
│  │ - Health & Audit      │  │  Syntax support)  │                   │  │
│  │ - Academic Assistant  │  ├───────────────────┴───────────────────┤  │
│  │ - Documentation Studio│  │ WorkspaceBottomPanel                  │  │
│  │ - Academic Submission │  │ (Execution Output, Diagnostics,       │  │
│  │ - Source Control      │  │  Interactive Terminal, Web Preview)   │  │
│  └───────────────────────┘  └───────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Supabase JWT & RLS
        ┌───────────────────────────┴───────────────────────────┐
        ▼                                                       ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│ Supabase Cloud Database       │       │ Secure Execution Service      │
│ - user_projects               │       │ (Node.js + Docker Sandbox)    │
│ - project_files (Tree/Content)│       │ - WebSocket Pre-Upgrade Auth  │
│ - project_milestones & tasks  │       │ - LanguageRunner (No-Shell)   │
│ - notifications & audit logs  │       │ - Ephemeral Container Runtime │
└───────────────────────────────┘       └───────────────────────────────┘
```

---

## 2. Key Components & Responsibilities

### 2.1 Frontend Studio Architecture
- **`src/pages/ProjectWorkspace.tsx`**: Central orchestrator managing workspace lifecycle, session persistence (`sessionStorage`), active open tabs, debounced autosave (1500ms), keyboard shortcuts (`Ctrl+S`, `Ctrl+Enter`), and modal prompts.
- **`src/components/WorkspaceEditor.tsx`**: High-performance Monaco Editor wrapper with automatic theme synchronization (`vs-dark` / `light`), cursor position tracking, syntax highlighting, and code diagnostic markers.
- **`src/components/WorkspaceActivityBar.tsx`**: Distinctive UniSphere activity navigator providing one-click access between Core Workspace tools, Academic Studio panels, and Source Control.
- **`src/components/WorkspaceAcademicPanels.tsx`**: Modular academic suite delivering:
  1. *Project Intelligence*: Technology detection, entry point discovery, and code distribution metrics.
  2. *Project Health & Audit*: Academic checklist, license verification, secret exposure detection, and 0–100% health scoring.
  3. *Academic Assistant*: Tailored Viva Voce defense questions and talking points dynamically generated for the detected technology stack.
  4. *Documentation Studio*: Structured academic README generator conforming to institutional standards with direct workspace synchronization.
  5. *Academic Submission Mode*: Pre-submission rubric auditor and one-click ZIP submission package exporter with verifiable `submission-manifest.json`.
  6. *Team & Collaboration*: Project ownership, collaborator roles, and academic privileges.
- **`src/components/WorkspaceFileExplorer.tsx`**: Hierarchical directory tree supporting nested folder expansion, inline file creation, renaming with path cascading, deletion guards, and language icon mapping.
- **`src/components/WorkspaceBottomPanel.tsx`**: Collapsible diagnostic and execution dock with Output Logs, Problem Navigator, Interactive Sandboxed Terminal, and HTML Preview.
- **`src/components/WorkspaceImportModal.tsx`**: Interactive multi-mode project importer supporting local directory drag-and-drop/selection (`webkitdirectory`) and ZIP archive extraction.

---

## 3. Project Import & Analysis Engine (`src/services/projectImportService.ts`)

The import engine allows students to bring existing offline academic code into UniSphere with automated inspection:
1. **Directory Traversal & ZIP Extraction**: Safely unpacks files using zero-dependency, memory-efficient `fflate`.
2. **Zip Slip Prevention**: Validates all relative file paths, rejecting any path traversal sequences (`..`), leading slashes, or drive letters.
3. **Automatic Exclusion Filter**: Excludes sensitive credentials (`.env`, `*.key`, `*.pem`, `id_rsa`) and heavy build caches (`node_modules/`, `dist/`, `build/`, `__pycache__/`, `.git/`, `.idea/`).
4. **Technology Detection Heuristics**: Inspects package manifests (`package.json`, `requirements.txt`, `pom.xml`) and directory structures to determine runtime, build tools, entry points, and language.
5. **Hierarchical Workspace Ingestion**: Reconstructs folder nodes in `project_files` with parent-child UUID references and bulk-inserts file contents in optimized batches.

---

## 4. Execution Service Architecture (`execution-service/`)

The sandboxed execution engine runs as an independent support daemon isolated from the main application host:
- **Pre-Upgrade WebSocket Authentication**: The HTTP server intercept upgrades (`server.on('upgrade')`) to cryptographically verify Supabase JWT tokens and student project authorization *before* establishing WebSocket connections.
- **Strict Rate Limiting & Concurrency**: Enforces a sliding-window rate limit (60 requests/minute per IP) and strict concurrency caps (1 execution per project, 2 concurrent runs per user, 10 global containers).
- **No-Shell Safe Execution (`execFileSync`)**: All Docker commands are dispatched using argument arrays via `child_process.execFileSync` without invoking `/bin/sh` or `cmd.exe`, preventing command injection vulnerabilities.
- **Ephemeral Container Sandbox**: Each run provisions an isolated container configured with:
  - `--network none` (complete outbound network block)
  - Memory limit: 256MB
  - CPU quota: 50% of 1 core
  - PIDs limit: 64 processes (fork-bomb prevention)
  - Execution timeout: 15 seconds with automatic `SIGKILL`
- **Output Buffering & Clean Exit**: Captures `stdout` and `stderr` up to 64KB buffers; automatically parses compiler error lines into structured IDE diagnostic objects.

