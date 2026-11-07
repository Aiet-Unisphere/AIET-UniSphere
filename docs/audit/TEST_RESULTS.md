# AIET-UniSphere — Quality Assurance & Test Execution Report

**Audit Date:** November 7, 2026  
**Auditor Role:** QA Lead & Senior Full-Stack Architect  
**Node.js Version:** v24.19.0  
**Package Manager:** npm v11.17.0  
**Operating System:** Windows 11  

---

## 1. Test & Build Execution Summary

| Command | Status | Exit Code | Summary of Finding |
| :--- | :--- | :--- | :--- |
| `npm install` | ✅ **SUCCESS** | 0 | Installed 36 packages (including `pg-mem`). Audited 78 packages cleanly. |
| `npm run typecheck` | ❌ **FAIL** | 1 | TypeScript compiler error in `src/hod/pages/HODSealManager.tsx:3`. |
| `npm run lint` | ❌ **FAIL** | 1 | Oxlint reported **11 errors** and **243 warnings** across 267 files. |
| `npm test` | ✅ **PASS** | 0 | All **10 suites (133 unit tests)** passed in 335ms after `pg-mem` installed. |
| `npm run build` | ❌ **FAIL** | 1 | Build halted by `tsc -b` failure before Vite production bundling could complete. |
| `npx vite build` (Direct) | ✅ **PASS** | 0 | Bundled 2,028 modules into production chunks in 3.60s without bundling errors. |

---

## 2. Distinction: Missing Environment Dependencies vs. Application Defects

### 2.1 Missing Environment Dependency (Resolved)
- **Symptom:** Initial run of `npm test` failed with:
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg-mem' imported from tests\postgres_sql_execution.test.mjs`
- **Root Cause:** `pg-mem` was declared in `package.json` (`"devDependencies": { "pg-mem": "^3.0.14" }`), but the local `node_modules` folder had not been updated since the package was added.
- **Classification:** **Environment / Setup Dependency**, not an application code defect. Running `npm install` fully resolved this issue.

### 2.2 Actual Application Code Defects (Unresolved Blockers)
1. **TypeScript Type Resolution Failure in `HODSealManager.tsx`**
2. **React Rules-of-Hooks Violation in `CreateExternalCourseModal.tsx`**
3. **243 Oxlint Code Quality Warnings across Application Source**

---

## 3. Detailed Failure Diagnostics

### 3.1 Failure 1: TypeScript Compilation Failure (`npm run typecheck`)
- **Command:** `npm run typecheck` (`tsc -b --pretty false`)
- **Exit Code:** `1`
- **Error Output:**
  ```text
  src/hod/pages/HODSealManager.tsx(3,10): error TS2724: '"../../services/departmentService"' has no exported member named 'updateDepartmentSeal'. Did you mean 'updateDepartment'?
  ```
- **File Path:** `src/hod/pages/HODSealManager.tsx`
- **Line Number:** 3
- **Defect Analysis:**
  Line 3 attempts to import:
  ```typescript
  import { updateDepartmentSeal } from '../../services/departmentService';
  ```
  `departmentService.ts` contains `getActiveDepartments`, `getAllDepartments`, `getDepartmentById`, `createDepartment`, and `updateDepartment`, but **never implemented `updateDepartmentSeal`**.
  Furthermore, `HODSealManager.tsx` is an untracked, unrouted component left in the repository tree. Because `tsconfig.app.json` includes `src/**/*`, TypeScript analyzes all files in the directory regardless of whether they are routed in `App.tsx`.
- **Impact:** **BLOCKS ALL BUILDS.** `npm run build` executes `tsc -b && vite build`. Because `tsc -b` exits with code 1, the production bundle is never produced in CI.

---

### 3.2 Failure 2: Oxlint Rules-of-Hooks Violations (`npm run lint`)
- **Command:** `npx oxlint --quiet`
- **Exit Code:** `1`
- **Error Count:** 11 Errors (all in a single component)
- **File Path:** `src/faculty/components/CreateExternalCourseModal.tsx`
- **Lines:** 16–30
- **Exact Diagnostics:**
  ```text
  x react-hooks(rules-of-hooks): React Hook "useState" is called conditionally. React Hooks must be called in the exact same order in every component render.
    ,-[src/faculty/components/CreateExternalCourseModal.tsx:18:29]
 16 |   if (!isOpen) return null;
 17 | 
 18 |   const [title, setTitle] = useState('');
    :                             ^^^^^^|^^^^^
    :                                   `-- This Hook call is not reachable on every render path.
 19 |   const [platform, setPlatform] = useState('Coursera');
 20 |   const [providerName, setProviderName] = useState('');
 21 |   const [externalUrl, setExternalUrl] = useState('');
 22 |   const [description, setDescription] = useState('');
 23 |   const [courseCode, setCourseCode] = useState('');
 24 |   const [category, setCategory] = useState('Computer Science');
 25 |   const [difficulty, setDifficulty] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>('BEGINNER');
 26 |   const [estimatedHours, setEstimatedHours] = useState<string>('20');
 27 | 
 28 |   const [isSubmitting, setIsSubmitting] = useState(false);
 29 |   const [errorMessage, setErrorMessage] = useState<string | null>(null);
  ```
- **Defect Analysis:**
  The component placed an early return `if (!isOpen) return null;` on line 16, prior to declaring the component's 11 state hooks. When `isOpen` toggles from false to true or vice versa, the number and order of hooks called during rendering changes.
- **Impact:** Causes React to throw a runtime error in production: *"Rendered fewer hooks than expected"*, crashing the UI component tree whenever a user opens or closes the modal.

---

### 3.3 Failure 3: Code Quality Warnings Summary (`npm run lint`)
- **Warning Count:** 243 warnings
- **Top Categories:**
  1. `eslint(no-unused-vars)`: 178 instances of unused imports, unread state variables, and unused error catch variables (e.g., `src/admin/pages/UserList.tsx:31:22` `setDeptFilter`, `src/pages/StudentDashboard.tsx:54:14` `err`).
  2. `react-hooks(exhaustive-deps)`: 38 instances of missing dependency arrays in `useEffect` hooks (e.g., `src/admin/pages/UserList.tsx:55:6` missing `fetchUsers`, `src/pages/StudentDashboard.tsx:64:6` missing `refreshProfile`).
  3. `react(only-export-components)`: 27 instances of exporting constants or helper functions from component files, interfering with Vite React Fast Refresh (e.g., `src/components/TimetableCalendar.tsx:20` `TIMETABLE_DAYS`, `parseTimeToMinutes`).

---

## 4. Automated Unit Test Suite Breakdown (`npm test`)

The test command runs 10 test suites sequentially via Node.js native test runner:

```bash
node tests/ai_assistant.test.mjs && \
node tests/analytics_ai_contracts.test.mjs && \
node tests/local_llm_boundary.test.mjs && \
node tests/local_llm_gateway_integration.test.mjs && \
node tests/external_learning_student.test.mjs && \
node tests/external_learning_faculty.test.mjs && \
node tests/external_learning_hod.test.mjs && \
node tests/external_learning_security.test.mjs && \
node tests/security_signup_and_concurrency.test.mjs && \
node tests/postgres_sql_execution.test.mjs
```

### Suite Execution Details

| Suite # | Test Suite File | Tests Passed | Tests Failed | Execution Time | Scope Tested |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | `ai_assistant.test.mjs` | **20** | 0 | 30.6 ms | Phase 1 & 2 RAG, intent classification, prompt injection defenses, citation generation, vector dimension enforcement (384-dim). |
| **2** | `analytics_ai_contracts.test.mjs` | **9** | 0 | 23.9 ms | Student/Faculty/HOD analytics AI contracts, credential leakage protection, canonical calculations preservation. |
| **3** | `local_llm_boundary.test.mjs` | **13** | 0 | 23.6 ms | Request/response contracts, SQL/HTML injection protection, timeout handling, error typing (`LLM_UNAVAILABLE`, `LLM_INVALID_RESPONSE`). |
| **4** | `local_llm_gateway_integration.test.mjs` | **22** | 0 | 28.5 ms | Oracle Cloud FastAPI gateway integration, auth verification, bearer token validation, payload sanitize. |
| **5** | `external_learning_student.test.mjs` | **7** | 0 | 12.1 ms | Student external course catalog view, self-enrollment, evidence submission. |
| **6** | `external_learning_faculty.test.mjs` | **6** | 0 | 11.4 ms | Faculty MOOC creation contract, department assignment, evidence verification workflow. |
| **7** | `external_learning_hod.test.mjs` | **10** | 0 | 15.2 ms | HOD department-wide MOOC analytics, completion matrix, mandatory rejection note enforcement. |
| **8** | `external_learning_security.test.mjs` | **23** | 0 | 25.9 ms | Department scoping, cross-department access denial, evidence tampering prevention, forged progress source rejection. |
| **9** | `security_signup_and_concurrency.test.mjs` | **19** | 0 | 22.6 ms | Public signup role overriding to STUDENT (00034), time format parsing (00035), cross-department room collision detection. |
| **10** | `postgres_sql_execution.test.mjs` | **4** | 0 | 149.6 ms | PostgreSQL in-memory engine validation (`pg-mem`), COALESCE expressions, migration 00034 & 00035 query syntax verification. |
| **TOTAL** | **10 Test Suites** | **133** | **0** | **323.4 ms** | **100% Pass Rate** |

---

## 5. Direct Vite Bundler Test (`npx vite build`)

To verify whether the application codebase can bundle successfully when typechecking is bypassed, a standalone Vite production build was executed.

- **Outcome:** **SUCCESS**
- **Modules Transformed:** 2,028 modules
- **Build Time:** 3.60 seconds
- **Output Artifacts:**
  - `dist/index.html` (0.73 kB)
  - `dist/assets/index-wDZM-cfs.css` (65.15 kB)
  - `dist/assets/index-e0muppxE.js` (234.94 kB)
  - `dist/assets/AuthContext-DFGMHCOF.js` (261.22 kB)
  - 50+ code-split vendor and page chunk files

*Architectural Conclusion:* The core application JavaScript/JSX bundling graph is healthy. There are no circular module dependencies or broken assets. The build failure is entirely attributable to the untracked file `HODSealManager.tsx` triggering a fatal TypeScript compilation stop during `tsc -b`.

