# AIET-UniSphere Code Studio — Project Import Guide

## Overview

AIET-UniSphere Code Studio provides an intuitive, high-speed import workflow allowing engineering students to bring local codebases, laboratory assignments, and capstone repositories directly into their cloud workspace.

---

## 1. Supported Import Methods

Students can import projects via two primary methods directly from the **Code Studio Landing Page** or from within any active workspace:

### Method A: Local Folder Import
- **How it works:** Uses the browser's native `webkitdirectory` file picker or drag-and-drop.
- **Workflow:**
  1. Click **"Import Existing Project"** on the Code Studio home screen or **"Import"** in the top workspace toolbar.
  2. Choose the **"Local Folder"** tab.
  3. Click **"Choose Local Folder"** and select your project's root folder from your computer.
  4. The import engine analyzes your directory structure and displays a real-time statistics preview.

### Method B: ZIP Archive Upload
- **How it works:** Extracts standard compressed archives (`.zip`) in memory without uploading unprocessed files.
- **Workflow:**
  1. Open the **"Import Existing Project"** modal and select the **"ZIP Archive"** tab.
  2. Drag and drop your `.zip` archive or click **"Choose ZIP Archive"**.
  3. The engine unpacks the archive, verifies all relative paths, and populates the project preview.

---

## 2. Automatic Technology Detection

UniSphere Code Studio automatically inspects project contents to configure the appropriate runtime environment:

| Technology Stack | Manifest / Marker Files | Inferred Language | Default Build System |
|---|---|---|---|
| **React (Vite)** | `package.json` with `react` + `vite.config.ts/js` | TypeScript / JavaScript | Vite (`npm run dev`) |
| **Node.js** | `package.json` | JavaScript / TypeScript | npm |
| **Python Standard** | `*.py` files | Python | Standard interpreter (`python3`) |
| **Python Flask / FastAPI / Django** | `requirements.txt` with framework dependency | Python | pip |
| **Java Maven** | `pom.xml` | Java | Maven (`mvn compile`) |
| **Java Standard** | `*.java` files | Java | javac |
| **C / C++** | `*.c`, `*.cpp`, `CMakeLists.txt` | C / C++ | gcc / g++ / CMake |
| **Web Frontend** | `index.html`, `style.css`, `app.js` | HTML / CSS / JS | Sandboxed Web Preview |

---

## 3. Intelligent Exclusion Rules

To ensure performance, save cloud storage, and prevent accidental disclosure of sensitive credentials, the import engine automatically excludes the following patterns:

| Category | Excluded Patterns | Reason |
|---|---|---|
| **Secrets & Keys** | `.env`, `.env.*`, `id_rsa`, `id_ed25519`, `*.pem`, `*.key` | Protects API tokens, database credentials, and SSH keys. |
| **Dependencies** | `node_modules/` | Heavy third-party packages installed via package managers. |
| **Build Artifacts** | `dist/`, `build/`, `out/`, `target/classes/`, `.next/` | Compiled binaries and bundles that can be regenerated. |
| **Bytecode & Caches** | `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.cache/` | Ephemeral compiler bytecode and test caches. |
| **Version Control** | `.git/` | Local Git repository metadata (cloud versioning is handled in Studio). |
| **OS Metadata** | `.DS_Store`, `Thumbs.db`, `desktop.ini` | Operating system temporary metadata files. |

> [!NOTE]
> All excluded files are listed in an expandable **"Excluded Files & Folders"** disclosure within the Import Preview Modal so students have full transparency over what is omitted.

---

## 4. Browser File System Limitations & Sync Behavior

Modern web browsers enforce strict security sandboxes:
- **No Direct Local Disk Sync:** Web browsers do not permit web applications to silently modify files on the host computer's disk. Once imported, your project is stored securely in your personal **UniSphere Code Studio Cloud Workspace**.
- **Working Across Devices:** Because your workspace is stored in the UniSphere cloud database, you can log in from any computer in the campus lab or from home and resume working on your project immediately without USB drives.
- **Exporting Back to Local:** To take your finished work off the platform, open the **Academic Submission Mode** or click **Export Academic Submission ZIP** to download a clean, verified archive.

