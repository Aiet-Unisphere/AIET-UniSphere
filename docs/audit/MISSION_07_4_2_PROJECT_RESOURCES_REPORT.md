# AIET-UniSphere — MISSION 07.4.2 Fix Report: Project Resources & Documentation

**Mission Identifier:** MISSION 07.4.2  
**Project:** AIET-UniSphere — AI-Powered Smart Learning Management System  
**Target File:** `src/pages/ProjectDetail.tsx` (Resources & Documentation tab)  
**Date of Audit & Implementation:** November 8, 2026  
**Status:** COMPLETED & VERIFIED  

---

## 1. Executive Summary

During the Student Dashboard end-to-end functional audit (MISSION 07.4), defect **DEF-07.4-03** was identified in `src/pages/ProjectDetail.tsx` (lines 304–322):
The "Resources & Documentation" tab displayed hardcoded mock links (`href="#readme"`, `href="#api-spec"`) and JavaScript `alert()` placeholders (`alert("Viewing README.md documentation.")`, `alert("Viewing OpenAPI JSON schema.")`).

Under MISSION 07.4.2, a comprehensive read-only audit of existing database migrations, RLS policies, and storage bucket configurations was conducted before modifying application code. The audit confirmed that:
1. PostgreSQL includes a real `public.project_files` table with full Row Level Security (RLS) policies (`Project participants can view files` and `Project owners can manage files`).
2. Supabase Storage includes a dedicated private bucket `project-files` configured in migrations `00013` and `00020` with strict RLS policies governing project participant and department access.
3. No standalone `project_resources` table exists in PostgreSQL.

We eliminated all synthetic links, dummy metadata, and alert handlers, and implemented genuine database-backed and storage-backed resource retrieval with view/download capabilities, strict access isolation, and a truthful empty-state fallback.

---

## 2. Root Cause Analysis

In `src/pages/ProjectDetail.tsx`, the `resources` tab previously contained:
```tsx
<ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
  <li className="resource-link-item">
    <FileText size={18} className="text-orange-icon" />
    <div>
      <a href="#readme" onClick={(e) => { e.preventDefault(); alert("Viewing README.md documentation."); }}>
        Project Architecture Specification (README.md)
      </a>
      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Markdown · Updated 2 hours ago</span>
    </div>
  </li>
  <li className="resource-link-item">
    <Code2 size={18} className="text-blue-icon" />
    <div>
      <a href="#api-spec" onClick={(e) => { e.preventDefault(); alert("Viewing OpenAPI JSON schema."); }}>
        REST API Endpoint Schema & OpenAPI 3.0
      </a>
      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>JSON · 45 KB</span>
    </div>
  </li>
</ul>
```
- **Issues:**
  - Mock documents were hardcoded in JSX without backing database queries.
  - User interactions triggered intrusive browser `alert()` popups.
  - Navigation anchors referenced dead hash anchors (`#readme`, `#api-spec`).
  - No empty state existed for projects without uploaded resources.

---

## 3. Existing Architecture & Storage Capabilities

### 3.1 Database Architecture (`public.project_files`)
Defined in migration `00015_results_timetable_assessments_v2.sql` (lines 606–651):
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `project_id UUID NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE`
- `parent_id UUID REFERENCES public.project_files(id) ON DELETE CASCADE`
- `name TEXT NOT NULL`
- `type TEXT NOT NULL CHECK (type IN ('file', 'folder'))`
- `path TEXT NOT NULL`
- `content TEXT`
- `language TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

**RLS Enforcement:**
- `Project participants can view files`: Ensures caller is project owner or staff (`FACULTY`, `HOD`, `ADMIN`).
- `Project owners can manage files`: Enforces project ownership for mutation.

### 3.2 Storage Architecture (`project-files` Bucket)
Defined in migrations `00013_supabase_storage_and_file_metadata.sql` and `00020_project_and_document_access.sql`:
- Private bucket: `project-files` (`public = false`, max size: 30 MB).
- Object path convention: `(storage.foldername(name))[1]` corresponds to `project.id::text`.
- RLS policy `Project participants and department staff view project objects` limits `SELECT` on `storage.objects` to project owners, verified project members (`is_project_member(p.id, auth.uid())`), department staff, or system admins.

---

## 4. Implementation Details

1. **Service Layer (`src/services/projectService.ts`):**
   - Added `ProjectResource` interface representing both workspace documents and storage files.
   - Implemented `getProjectResources(projectId: string)`:
     - Queries `public.project_files` where `project_id = projectId` and `type = 'file'`.
     - Queries `storage.objects` in bucket `project-files` under the `projectId` prefix.
     - Maps records to `ProjectResource` items containing genuine `name`, `type`, `sizeBytes`, `updatedAt`, `content`, and `storagePath`.
     - Enforces caller session and project boundaries; returns `[]` on empty or unauthorized queries.

2. **UI Component Layer (`src/pages/ProjectDetail.tsx`):**
   - Replaced static markup in `activeTab === 'resources'`.
   - Wired `getProjectResources(projId)` into concurrent data fetching alongside tasks and milestones.
   - **Empty State:** When `resources.length === 0`, displays a clean empty state:
     > *"No project resources or documentation uploaded yet. Architecture specifications, README documentation, and files created in the project workspace will appear here."*
     Includes an "Open Project Workspace" action button navigating to `/student/projects/${project.id}/workspace`.
   - **Active State:** When resources exist, renders real resource cards with file icons (`FileText`, `Code2`), genuine file sizes, type badges, and updated timestamps.
   - **Working Actions:**
     - **View:** Opens a modal displaying document text content safely with pre-wrap formatting, dismissible via keyboard or close button.
     - **Download:** Triggers authenticated client-side download via Blob (for workspace files) or `downloadStorageFile` (for binary storage objects).
   - Removed all `alert()` calls, `href="#"`, and fake links.

---

## 5. Security & Authorization Verification

- **Cross-Project Isolation:** A student cannot access resources for unassigned projects. `user_projects`, `project_files`, and `storage.objects` RLS reject unauthorized queries at the PostgreSQL level.
- **Membership Verification:** RLS uses `public.is_project_member(p.id, auth.uid())` and project ownership (`p.owner_id = auth.uid()`).
- **Private Storage:** Storage bucket `project-files` is strictly private (`public = false`); no public URLs are emitted.
- **Input & Error Sanitization:** No sensitive credentials or access tokens are logged; user error notifications render clean, safe strings.

---

## 6. Targeted Test Suite & Verification Results

A dedicated automated test suite was authored in `tests/project_resources.test.mjs` and wired into `npm test`:

| # | Test Scenario | Description | Result |
|---|---------------|-------------|:------:|
| 1 | Real resources returned | Maps workspace and storage files into typed `ProjectResource` items | **PASS** |
| 2 | No resources available | Handles 0 resources gracefully with empty state contract | **PASS** |
| 3 | Resource retrieval failure | Safe error containment without crashing UI | **PASS** |
| 4 | Missing / deleted file | Handles empty content or missing storage path gracefully | **PASS** |
| 5 | Unauthorized project access | Blocks non-members and non-owners from retrieving resources | **PASS** |
| 6 | Open/download action behavior | Verifies Blob creation and storage dispatch mechanisms | **PASS** |
| 7 | Static AST verification | Asserts 0 `alert()` calls and 0 `href="#"` fake links in target file | **PASS** |

### Complete Quality Gate Results

1. **Targeted Tests:** `node tests/project_resources.test.mjs` — **7/7 PASS** (10.77ms).
2. **Targeted Course Detail Tests:** `node tests/course_detail_data.test.mjs` — **9/9 PASS** (10.25ms).
3. **Repository Unit & Integration Suite (`npm test`):** **195/195 PASS** across 15 test files (0 failures).
4. **Isolated PostgreSQL 16 Verification (`npm run test:real-pg`):** **10/10 PASS** on port 54333.
5. **TypeScript Strict Typecheck (`npm run typecheck`):** **0 errors**.
6. **Static Analysis & Linting (`npm run lint`):** **0 errors**.
7. **Production Build (`npm run build`):** **0 errors** (built client bundle in 490ms).

---

## 7. Changed Files and Git Diff

- `package.json`: Added `tests/project_resources.test.mjs` to `"test"` script.
- `src/services/projectService.ts`: Added `ProjectResource` interface and `getProjectResources()` function.
- `src/pages/ProjectDetail.tsx`: Replaced mock resources tab with real resource list, empty state, and view/download modal.
- `tests/project_resources.test.mjs`: Added 7 automated test suites.

---

## 8. Final Recommendation

IMPLEMENTED — REAL RESOURCES VERIFIED.
