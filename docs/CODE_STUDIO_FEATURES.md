# AIET-UniSphere Code Studio — Feature Guide & Academic Capabilities

## 1. Distinctive Academic Development Environment

AIET-UniSphere Code Studio combines modern web IDE capabilities with purpose-built academic development workflows. Engineered for engineering students and academic faculty, it bridges practical software engineering with academic rigor.

---

## 2. Core Workspace & Editor Features

### 2.1 Multi-Tab Monaco Editor
- Full-featured syntax highlighting for TypeScript, JavaScript, Python, Java, C, C++, HTML, CSS, JSON, and Markdown.
- **Multiple Open Tabs:** Switch between open files seamlessly, reorder tabs, or close inactive files.
- **Unsaved Changes (Dirty) Indicator:** Visual dot indicator highlighting modified tabs awaiting persistence.
- **Debounced Autosave (1500ms):** Automatically saves student work to the Supabase cloud database with zero user intervention.
- **Keyboard Shortcuts:**
  - `Ctrl + S`: Immediate save to cloud database.
  - `Ctrl + Enter`: Trigger compilation and execution.
  - `Ctrl + Shift + E`: Toggle File Explorer.
  - `Ctrl + Shift + F`: Open Search in Files.

### 2.2 Hierarchical File Explorer
- Nested folder tree supporting unlimited folder depths.
- Inline creation for new files and folders.
- Real-time file renaming with automatic child path cascading.
- Permanent deletion with confirmation dialog preventing accidental loss of source code.
- Language-specific color-coded icons (TypeScript, Python, Java, C++, HTML, JSON).

### 2.3 Live Search in Files
- Real-time search across file names and text contents.
- Direct click-to-open navigation from search results into the editor.

---

## 3. Academic Studio Suite

Accessed via the distinctive UniSphere Activity Bar on the left:

### 3.1 Project Intelligence & Tech Stack
- **Automated Stack Detection:** Identifies frameworks (React, Vite, Next.js, Flask, FastAPI, Django, Spring Boot) and build systems (npm, pip, maven, gcc).
- **Entry Point Mapping:** Automatically discovers the main entry file (`src/main.tsx`, `app.py`, `Main.java`) with one-click navigation.
- **Workspace Metrics:** Displays total source file count, lines of code, and file type distributions.

### 3.2 Project Health & Audit Dashboard
- **Academic Readiness Score (0–100%):** Evaluates codebase quality against academic submission standards.
- **Verification Criteria:**
  - `README.md` presence and completeness.
  - Academic integrity / Honor code declaration.
  - Valid entry point and build manifests.
  - Unit tests or test directory configuration.
  - Secret exposure detection (flags uncommitted `.env` or credential files).
- **Actionable Recommendations:** Provides one-click fixes such as *Generate Academic README in Studio*.

### 3.3 Academic Assistant & Viva Voce Defense Prep
- **Interactive Defense Q&A:** Dynamically synthesizes Viva Voce defense questions tailored to the detected language and architecture.
- **Curated Topics:** Covers runtime internals, memory management, garbage collection, design patterns, state flow, and algorithmic complexity.
- **Recommended Responses:** Provides structured, high-scoring technical defense answers to prepare students for viva evaluations.

### 3.4 Documentation Studio
- **Academic README Generator:** Generates standardized institutional documentation including Project Abstract, Objectives, Architecture, Directory Breakdown, and Academic Declarations.
- **Editable Markdown:** Students can customize the title, author, and abstract in real-time.
- **One-Click Workspace Sync:** Instantly creates or updates `README.md` in the active project file tree.

### 3.5 Academic Submission Mode
- **Pre-Submission Checklist:** Verifies documentation, code integrity, and secret exclusions prior to final submission.
- **Student Metadata Capture:** Records student name, University Seat Number (USN), department, and semester.
- **Automated Archive Export:** Generates a standardized `.zip` archive via `fflate` containing:
  - All source files and assets.
  - Sanitized directory hierarchy (excluding build caches and secrets).
  - Verifiable `submission-manifest.json` detailing export timestamp, student credentials, and manifest file hashes.

### 3.6 Team & Collaboration
- Displays authenticated student author credentials and academic privileges.
- Links to Project Details for managing collaborators, milestones, and tasks.

---

## 4. Execution & Diagnostic Engine

### 4.1 Multi-Language Execution
- Runs Python 3, Node.js, Java (Temurin), C (GCC), and C++ (G++) in sandboxed ephemeral containers.
- Standard output and standard error are streamed live into the bottom console.

### 4.2 Diagnostic Problem Parsing
- Compiler errors from `javac`, `gcc`, `g++`, and Python tracebacks are automatically parsed into structured problem objects (file, line number, column, message).
- Clicking a diagnostic item in the **Problems** tab navigates the editor directly to the offending line.

### 4.3 HTML Web Application Preview
- Provides an isolated sandboxed iframe for web projects.
- Includes responsive viewport toggles: **Desktop**, **Tablet**, and **Mobile**.

