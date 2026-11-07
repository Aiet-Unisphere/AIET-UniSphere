# AIET-UniSphere — Current Project Status Report

**Audit Date:** November 7, 2026  
**Auditor Roles:** Senior Full-Stack Architect, Supabase Security Engineer, QA Lead  
**Repository Working Directory:** `c:\Users\Mahesh M\Projects\AIET-UniSphere`  
**Linked Supabase Project:** `aiet-unisphere (eddsaafwwmtfnjukxamx)` (Production)  

---

## 1. Executive Summary

AIET-UniSphere is an institutional enterprise ERP and academic management portal designed for Alva's Institute of Engineering & Technology (AIET). The platform is designed around four primary user personas: **Student**, **Faculty**, **Head of Department (HOD)**, and **Institutional Administrator**.

The codebase is built on **React 19.2.8**, **Vite 8.2.0**, **TypeScript 6.0.2**, **Tailwind CSS**, and **Supabase (PostgreSQL + Auth + Storage + Deno Edge Functions)**.

### Current Overall Health: **AMBER / BLOCKED IN PRODUCTION CI**
While core domain services and automated unit test suites are substantive (133/133 tests passing locally once dependencies are installed), the repository currently cannot pass `npm run build` or `npm run typecheck` due to orphaned untracked code, and contains critical production synchronization gaps between the repository and the linked Supabase cloud environment.

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           CURRENT STATUS MATRIX                        │
  ├───────────────────────┬──────────────┬─────────────────────────────────┤
  │ Quality Gate          │ Status       │ Primary Reason                  │
  ├───────────────────────┼──────────────┼─────────────────────────────────┤
  │ TypeScript Typecheck  │ ❌ FAILING   │ Missing export in departmentSvc │
  │ Linting (Oxlint)      │ ❌ FAILING   │ 11 Rules-of-Hooks violations    │
  │ Automated Unit Tests  │ ⚠️ PASS (133)│ Requires `npm install` (pg-mem) │
  │ Production Build      │ ❌ FAILING   │ Blocked by `tsc -b` failure     │
  │ Vite Bundler Only     │ ✅ PASS      │ 2028 modules transformed cleanly│
  │ Remote DB Migrations  │ ⚠️ DIVERGED  │ 00033-00035 missing on remote   │
  │ Remote Edge Functions │ ⚠️ INCOMPLETE│ 6 of 9 functions undeployed     │
  └───────────────────────┴──────────────┴─────────────────────────────────┘
```

---

## 2. Technology Stack & Architectural Overview

### 2.1 Core Framework & Tooling
- **Frontend Framework:** React 19.2.8 with `react-dom` 19.2.8
- **Language:** TypeScript 6.0.2 running in build project mode (`tsc -b`)
- **Build Tool:** Vite 8.2.0 (ESM-only module configuration)
- **Routing:** React Router v7 (`react-router-dom` 7.18.2) with lazy-loaded route chunking and Role Guards
- **Styling:** Vanilla CSS design system variables combined with utility classes
- **Icons:** `lucide-react` 1.31.0
- **Linter:** `oxlint` 1.75.0
- **Testing Engine:** Node.js native test runner (`node:test`, `node:assert`) with `pg-mem` for in-memory PostgreSQL engine simulation

### 2.2 Backend & Data Layer
- **Database Engine:** PostgreSQL 15+ hosted on Supabase Cloud
- **Client SDK:** `@supabase/supabase-js` 2.112.3
- **Authentication:** Supabase Auth (GoTrue) combined with `public.profiles` role synchronization
- **Storage Subsystem:** Supabase Storage (10 storage buckets defined: `avatars`, `assignment-files`, `assignment-submissions`, `assessment-files`, `announcement-files`, `academic-materials`, `student-documents`, `project-files`, `institutional-documents`, `external-learning-evidence`)
- **Serverless Compute:** Deno-based Supabase Edge Functions (`admin-provision-user`, `ai-chat`, `ingest-document`, `github-oauth`, `github-api`, `identifier-login`, `local-llm-analyze`, `generate-leave-pdf`, `get-signed-url`)
- **External AI Integration:** Oracle Cloud FastAPI Local LLM Gateway with dual-fallback to Gemini / OpenAI APIs

---

## 3. Git & Workspace Architecture State

A critical discrepancy exists between the git index and the workspace filesystem.

### 3.1 Untracked File Artifacts
Inspection of `git status` reveals 15 untracked files actively residing in the repository tree:
1. `src/hod/pages/HODSealManager.tsx` — **Fatal compilation blocker**: references non-existent `updateDepartmentSeal` from `src/services/departmentService.ts`. Not referenced in router.
2. `src/pages/VerifyLeavePage.tsx` — Orphaned unrouted page referencing dead endpoint `https://YOUR_SUPABASE_STORAGE_URL/` and undeployed Edge Function `get-signed-url`.
3. `supabase/diagnostics/leave_routing_report.sql` — Diagnostic script.
4. `supabase/functions/generate-leave-pdf/` — Edge Function for PDF generation (untracked and undeployed).
5. `supabase/functions/get-signed-url/` — Edge Function for secure signed URL generation (untracked and undeployed).
6. `supabase/migrations/00010_leave_date_validation.sql` through `00019_repair_submit_leave_request_rpc.sql` (10 SQL files) — **Major version collision**: duplicate migration prefixes that collide with the tracked migration chain.

---

## 4. Subsystem Health & Operational Verification

### 4.1 Authentication & Session Subsystem
- **Standard Email Sign-In:** Fully functional and points to live Supabase Auth.
- **USN / Employee ID Sign-In:** **BROKEN on Live Backend**.
  - *Root Cause:* Migration `00016_secure_identifier_login.sql` revoked public execution of `get_email_by_identifier` RPC for security hardening.
  - `authService.ts` was refactored to invoke the `identifier-login` Edge Function.
  - However, `identifier-login` has **never been deployed to the remote Supabase project**.
  - Any user entering a USN or Employee ID in production receives an invocation error.
- **Student Public Signup:**
  - *Local Status:* Hardened via migration `00034_secure_public_signup_trigger.sql` so that self-registration can never escalate roles beyond `STUDENT`.
  - *Remote Status:* **VULNERABLE**. Migration `00034` has not been applied to the production Supabase database. The remote trigger `00001` only blocks `ADMIN`, permitting client-supplied metadata `role: 'FACULTY'` or `role: 'HOD'` to create elevated accounts.

### 4.2 Local LLM & Analytics Integration
- **Contracts and Security Assertions:** 100% verified locally via `tests/local_llm_boundary.test.mjs` and `tests/local_llm_gateway_integration.test.mjs`.
- **Edge Deployment:** Edge Function `local-llm-analyze` is implemented in `supabase/functions/local-llm-analyze/` but **not deployed to Supabase remote**. Invoking local analytics from the live UI results in a 404 Edge Function response.

### 4.3 Git & GitHub Workspace Integration
- **Frontend UI:** `GitGithubPage.tsx`, `ProjectWorkspace.tsx`, and `githubService.ts` are implemented.
- **Edge Functions:** Neither `github-oauth` nor `github-api` are deployed on the live backend.
- **Live Status:** GitHub OAuth login and remote repository synchronization are completely inoperable against the live backend.

### 4.4 Timetable & Scheduling Subsystem
- **Frontend UI:** `TimetableCalendar.tsx`, `HODTimetablePage.tsx`, `FacultyTimetablePage.tsx`, `TimetablePage.tsx`.
- **Database Logic:** Concurrency guard, slot overlap detection, cross-department room collision protection, and deterministic advisory locking are implemented in `00035_timetable_concurrency_guard.sql`.
- **Live Status:** Migration `00035` is unapplied on the remote database. High-concurrency conflict detection on live production falls back to unsecured basic queries.

### 4.5 External Learning & Course Verification
- **Frontend UI:** `CreateExternalCourseModal.tsx` violates React Rules of Hooks (oxlint failure).
- **Backend RPC:** `verify_external_course_evidence` and `create_external_course_assignment_with_enrollment` are implemented in migration `00026`/`00027` and deployed to remote.
- **Test Status:** 23/23 security tests pass locally in `tests/external_learning_security.test.mjs`.

---

## 5. Summary of Architectural Risks

1. **Broken Build Pipeline:** The continuous deployment pipeline cannot produce build artifacts because `tsc -b` fails on `HODSealManager.tsx`.
2. **Untracked Duplicate Migrations:** Untracked SQL migrations `00010` to `00019` in `supabase/migrations/` conflict with existing numbered migrations. If automated Supabase CLI commands run, migration history could become irreversibly corrupted.
3. **Privilege Escalation in Production:** The absence of migration `00034` in production leaves the public signup endpoint open to role tampering.
4. **Missing Production Edge Functions:** 6 Edge Functions (`identifier-login`, `github-oauth`, `github-api`, `local-llm-analyze`, `generate-leave-pdf`, `get-signed-url`) are missing in production, paralyzing USN login, GitHub tooling, local AI analytics, and leave verification.

