# MISSION 09.2.4 — REMOTE SUPABASE LEAVE SCHEMA MISMATCH INVESTIGATION REPORT

**Project:** AIET-UniSphere  
**Target Environment:** Remote Supabase Production (`eddsaafwwmtfnjukxamx`)  
**Mission Phase:** Mission 09.2.4 (Read-Only Root Cause Analysis)  
**Date:** 2026-11-10  
**Status:** COMPLETE  
**Investigation Mode:** STRICTLY READ-ONLY  

---

## 1. Executive Summary & Root Cause

When a student attempts to submit a leave application, the user interface displays the following error:
```
Could not find the 'academic_year_snapshot' column of 'leave_requests' in the schema cache
```

### Primary Finding & Root Cause
**The error is caused by MISSING DATABASE MIGRATIONS on the remote Supabase instance, NOT a stale schema cache.**

Specifically:
1. Migrations `00041_leave_note_snapshots_and_remarks.sql` and `00042_leave_note_security_and_provenance.sql` have **never been applied** to the remote Supabase project (`eddsaafwwmtfnjukxamx`).
2. Per the explicit safety instructions in previous missions (Missions 08.2.2, 08.3.3, 09.2, 09.2.2, 09.2.3: *"Strictly local implementation. Do NOT deploy any migration or modify remote databases"*), migrations `00041` and `00042` were created and verified strictly against the isolated local PostgreSQL 16 cluster.
3. The remote database schema is currently halted at Migration `00036`.
4. The client application code (`src/services/leaveService.ts`) was updated in Mission 09.2 and Mission 09.2.2 to submit all 9 student academic snapshots and `snapshot_provenance`.
5. Because the client browser connects to the live remote URL configured in `.env` (`https://eddsaafwwmtfnjukxamx.supabase.co`), PostgREST queries the remote PostgreSQL catalog, encounters undefined columns (`SQLSTATE 42703`), and returns a 400 Bad Request.

---

## 2. Verification Checklist

| Verification Item | Result | Evidence / Technical Detail |
| :--- | :---: | :--- |
| **Is migration `00041` applied remotely?** | ❌ **NO** | `npx supabase migration list --remote` reports `{"local":"00041","remote":"","time":"00041"}` |
| **Is migration `00042` applied remotely?** | ❌ **NO** | `npx supabase migration list --remote` reports `{"local":"00042","remote":"","time":"00042"}` |
| **Does `academic_year_snapshot` exist remotely?** | ❌ **NO** | Direct REST probe returns HTTP 400: `{"code":"42703","message":"column leave_requests.academic_year_snapshot does not exist"}` |
| **Do all 9 snapshot & remarks columns exist?** | ❌ **NO** | All 9 columns return `SQLSTATE 42703 (undefined_column)` on the remote database. |
| **Does `snapshot_provenance` exist remotely?** | ❌ **NO** | Direct REST probe returns HTTP 400: `{"code":"42703","message":"column leave_requests.snapshot_provenance does not exist"}` |
| **Does frontend payload match remote schema?** | ❌ **NO** | Frontend submits 10 attributes introduced in migrations 00041/00042 that are absent on remote schema 00036. |
| **Is error due to missing migration or stale cache?** | **MISSING MIGRATION** | PostgREST schema cache is current; PostgreSQL physically lacks the columns. |

---

## 3. Detailed Inspection & Evidence

### 3.1 Remote Supabase Migration History
Running `npx supabase migration list --remote` against linked project `eddsaafwwmtfnjukxamx` produces:
```json
{
  "migrations": [
    {"local":"00001","remote":"00001","time":"00001"},
    ...
    {"local":"00035","remote":"00035","time":"00035"},
    {"local":"00036","remote":"00036","time":"00036"},
    {"local":"00037","remote":"","time":"00037"},
    {"local":"00038","remote":"","time":"00038"},
    {"local":"00039","remote":"","time":"00039"},
    {"local":"00040","remote":"","time":"00040"},
    {"local":"00041","remote":"","time":"00041"},
    {"local":"00042","remote":"","time":"00042"}
  ],
  "target": {
    "kind": "linked",
    "project_ref": "eddsaafwwmtfnjukxamx",
    "project_name": "aiet-unisphere",
    "environment": "production"
  }
}
```
**Finding:** The remote database has applied migrations up to `00036`. Migrations `00037`, `00038`, `00039`, `00040`, `00041`, and `00042` are pending and have never been executed on the production cluster.

---

### 3.2 Remote `public.leave_requests` Column Definitions
Probing the live PostgREST API on `https://eddsaafwwmtfnjukxamx.supabase.co/rest/v1/leave_requests` with the publishable API key reveals:

#### Existing Remote Columns (18 Columns):
- `id`
- `reference_id`
- `student_id`
- `department_id`
- `hod_id`
- `leave_type`
- `reason`
- `start_date`
- `end_date`
- `status`
- `rejection_reason`
- `reviewed_by`
- `reviewed_at`
- `created_at`
- `supporting_doc_path`
- `supporting_doc_name`
- `supporting_doc_size`
- `supporting_doc_type`

#### Missing Remote Columns (10 Columns):
All columns declared in Migration `00041` and `00042` fail with PostgreSQL `SQLSTATE 42703`:
1. `academic_year_snapshot` -> `{"code":"42703","message":"column leave_requests.academic_year_snapshot does not exist"}`
2. `student_name_snapshot` -> `{"code":"42703","message":"column leave_requests.student_name_snapshot does not exist"}`
3. `student_usn_snapshot` -> `{"code":"42703","message":"column leave_requests.student_usn_snapshot does not exist"}`
4. `branch_snapshot` -> `{"code":"42703","message":"column leave_requests.branch_snapshot does not exist"}`
5. `section_snapshot` -> `{"code":"42703","message":"column leave_requests.section_snapshot does not exist"}`
6. `semester_snapshot` -> `{"code":"42703","message":"column leave_requests.semester_snapshot does not exist"}`
7. `student_phone_snapshot` -> `{"code":"42703","message":"column leave_requests.student_phone_snapshot does not exist"}`
8. `parent_phone_snapshot` -> `{"code":"42703","message":"column leave_requests.parent_phone_snapshot does not exist"}`
9. `approval_remarks` -> `{"code":"42703","message":"column leave_requests.approval_remarks does not exist"}`
10. `snapshot_provenance` -> `{"code":"42703","message":"column leave_requests.snapshot_provenance does not exist"}`

---

### 3.3 Remote RPC Function Signature Check
Probing the RPC endpoint `https://eddsaafwwmtfnjukxamx.supabase.co/rest/v1/rpc/review_leave_request`:
- Calling with 4 parameters (`p_leave_id`, `p_status`, `p_rejection_reason`, `p_approval_remarks`) returns:
  ```json
  {
    "code": "PGRST202",
    "message": "Could not find the function public.review_leave_request(p_approval_remarks, p_leave_id, p_rejection_reason, p_status) in the schema cache",
    "hint": "Perhaps you meant to call the function public.review_leave_request(p_leave_id, p_rejection_reason, p_status)"
  }
  ```
- Calling with the legacy 3 parameters (`p_leave_id`, `p_status`, `p_rejection_reason`) from Migration `00009` successfully reaches the function:
  ```json
  {
    "code": "P0001",
    "message": "Authentication required."
  }
  ```
**Finding:** The remote database is still hosting the obsolete 3-parameter function from Migration `00009`. It has not received the Migration `00041` overload drop and 4-parameter recreation.

---

### 3.4 PostgREST Schema Cache Status
- The PostgREST schema cache is **healthy and synchronized** with PostgreSQL.
- The schema cache accurately reflects that `academic_year_snapshot` is missing from `public.leave_requests` in the remote PostgreSQL catalog.
- Reloading the schema cache (`NOTIFY pgrst, 'reload schema'`) will **not** resolve the issue because the underlying physical database tables do not have these columns.

---

### 3.5 Frontend Payload in `src/services/leaveService.ts`
In `submitLeaveRequest()` (`src/services/leaveService.ts#L446-L474`):
```typescript
  const { data, error } = await (supabase as any)
    .from('leave_requests')
    .insert({
      id: tempLeaveId,
      student_id: user.id,
      department_id: studentProfile.department_id,
      hod_id: hodProfile.id,
      leave_type: payload.leaveType.trim(),
      reason: payload.reason.trim(),
      start_date: payload.startDate,
      end_date: payload.endDate,
      status: 'PENDING',
      supporting_doc_path: storagePath,
      supporting_doc_name: fileName,
      supporting_doc_size: fileSize,
      supporting_doc_type: mimeType,
      student_name_snapshot: studentProfile.full_name || 'Student',
      student_usn_snapshot: studentProfile.usn_or_employee_id || 'N/A',
      branch_snapshot: studentProfile.department?.name || 'Department',
      section_snapshot: payload.section?.trim() || null,
      semester_snapshot: studentAcademic?.semester || null,
      academic_year_snapshot: studentAcademic?.academic_year || null,
      student_phone_snapshot: payload.studentPhone?.trim() || studentAcademic?.phone || null,
      parent_phone_snapshot: payload.parentPhone?.trim() || studentAcademic?.parent_phone || null,
      snapshot_provenance: 'SUBMISSION'
    })
    .select('*')
    .single();
```
When `academic_year_snapshot` (or any snapshot field) is received by PostgREST against a table lacking that column, PostgREST throws the exact error reported by the student portal:
```
Could not find the 'academic_year_snapshot' column of 'leave_requests' in the schema cache
```

---

## 4. Recommended Corrective Actions

### Recommended Action (When Authorized to Deploy to Production)
To bring the remote Supabase database into full synchronization with the verified codebase, the pending migrations must be pushed to remote production:

```bash
# Verify pending migration dry-run:
npx supabase db push --dry-run

# Apply pending migrations 00037 through 00042 to remote production:
npx supabase db push
```

#### Why `npx supabase db push` is Safe:
1. All pending migrations (`00037` to `00042`) are strictly forward-only.
2. Migration `00041` uses `ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS ...` ensuring non-destructive additions.
3. Migration `00041` safely backfills existing historical rows from `profiles` and `student_profiles` using `COALESCE`.
4. Migration `00042` adds `snapshot_provenance` with check constraints and tightens student `INSERT` security.
5. All migrations have been verified across 6 automated suites on PostgreSQL 16 with zero errors.

### Interim Local Workaround (For Local Development Only)
If remote database changes remain restricted:
- Developers running the local frontend can either:
  1. Point `VITE_SUPABASE_URL` in `.env` to a local Supabase / PostgreSQL instance that has migrations 00041 and 00042 applied.
  2. Or, if testing against remote production without migrations, avoid testing leave submissions until the remote database is updated.

---

## 5. Investigation Sign-off

- **Root Cause Confirmed:** Missing migrations `00041` and `00042` on remote Supabase project `eddsaafwwmtfnjukxamx`.
- **System Integrity:** All inspections conducted in **STRICT READ-ONLY** mode. Zero remote database mutations, configuration updates, or source code edits were performed.

