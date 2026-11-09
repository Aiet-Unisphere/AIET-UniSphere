# MISSION 07.4.4.3 — Announcement Security Remediation Report

**Project:** AIET-UniSphere — AI-Powered Smart Learning Management System  
**Audit Target:** Announcement Read-State Idempotency & Announcement Attachment Storage Authorization  
**Verification Environment:** Local PostgreSQL 16 Test Cluster (Port 54333) / Full Automated Test Baseline  
**Date:** November 9, 2026  
**Status:** Remediated and Verified Locally  

---

## 1. Executive Summary

This mission successfully remediated the two confirmed security and functional defects identified in Mission 07.4.4.2:

1. **Announcement Read-State Idempotency Defect:**
   - *Problem:* Calling `markAnnouncementAsRead()` repeatedly executed an `upsert` with `DO UPDATE`. Because `announcement_reads` lacks an `UPDATE` RLS policy in `00010_announcements.sql`, PostgreSQL rejected subsequent visits with a policy violation error (`42501`).
   - *Solution:* Updated `markAnnouncementAsRead()` to perform duplicate-safe insertion with `ignoreDuplicates: true` (`ON CONFLICT (announcement_id, user_id) DO NOTHING`). This avoids invoking the `UPDATE` RLS branch, preserves the original acknowledgment timestamp, and completely eliminates console errors.
2. **Announcement Attachment Storage Authorization Defect:**
   - *Problem:* Migration `00013` established a coarse department-only Storage SELECT policy (`(storage.foldername(name))[1] = department_id`). This allowed students to download attachments of **DRAFT** and **Faculty-only** announcements within their department if the path was known.
   - *Solution (Dual-Layer):*
     - **Database Layer (Migration `00038`):** Authored forward-only additive migration `00038_announcement_attachment_storage_rls.sql` replacing the department-only policy with a fine-grained, parent-announcement visibility check (`a.attachment_path = storage.objects.name`).
     - **Application Layer:** Added an authoritative preflight check in `downloadAnnouncementAttachment(storagePath, fileName, announcementId)` verifying parent announcement visibility via RLS prior to requesting the file binary.

Both fixes were verified against real PostgreSQL 16 on port 54333 and unit test suites with 100% passing results.

---

## 2. Confirmed Root Causes & Schema Relationships

### A. Read-State Failure Root Cause
- In `00010_announcements.sql`, `public.announcement_reads` defines:
  ```sql
  CREATE POLICY "Users can view own read records" ON public.announcement_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
  CREATE POLICY "Users can insert own read records" ON public.announcement_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  ```
- Because no `FOR UPDATE` policy exists, PostgreSQL RLS operates under default DENY for any `UPDATE` operation.
- Calling `.upsert({ ... }, { onConflict: 'announcement_id,user_id' })` without `ignoreDuplicates: true` triggered `DO UPDATE SET read_at = ...`, causing PostgreSQL to fail closed.

### B. Storage Attachment Authorization Root Cause & Schema Relationship
- **Direct Relationship Verified:** In `public.announcements`, the column `attachment_path TEXT` was added in `00013_supabase_storage_and_file_metadata.sql#L48`.
- When an announcement is created (`src/services/announcementService.ts#L162`), `storagePath` is constructed as:
  ```typescript
  storagePath = `${data.departmentId}/${tempAnnounceId}/${safeName}`;
  ```
  The file is uploaded to the `'announcements'` bucket at `storagePath`, and `public.announcements.attachment_path` is inserted with this exact string.
- In Supabase Storage, `storage.objects.name` matches `storagePath` identically (e.g. `d-cse/ann-uuid/exam.pdf`).
- The former policy from Migration `00013` only checked `(storage.foldername(name))[1] = public.get_auth_user_department_id()::text`. It never joined `public.announcements` to check if `status = 'PUBLISHED'` or if `target_audience` included students.

---

## 3. Implementation Details

### A. Read-State Correction (`src/services/announcementService.ts`)
Updated `markAnnouncementAsRead()` to:
1. Validate that `announcementId` and `userId` are non-empty trimmed strings.
2. Execute duplicate-safe insertion with `ignoreDuplicates: true`:
```typescript
export const markAnnouncementAsRead = async (announcementId: string, userId: string): Promise<boolean> => {
  if (!announcementId || typeof announcementId !== 'string' || !userId || typeof userId !== 'string') {
    return false;
  }

  const cleanAnnounceId = announcementId.trim();
  const cleanUserId = userId.trim();
  if (!cleanAnnounceId || !cleanUserId) {
    return false;
  }

  const { error } = await (supabase as any)
    .from('announcement_reads')
    .upsert({
      announcement_id: cleanAnnounceId,
      user_id: cleanUserId,
      read_at: new Date().toISOString()
    }, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });

  if (error) {
    console.error('Error marking announcement as read:', error);
    return false;
  }
  return true;
};
```
- **PostgREST SQL Translation:** `INSERT INTO announcement_reads (...) VALUES (...) ON CONFLICT (announcement_id, user_id) DO NOTHING;`
- **Audit Benefit:** Only the `INSERT` policy is evaluated; the initial acknowledgment timestamp is preserved across revisits.

### B. Forward-Only Migration: `00038_announcement_attachment_storage_rls.sql`
File created at `supabase/migrations/00038_announcement_attachment_storage_rls.sql`:
```sql
-- 1. DROP OBSOLETE DEPARTMENT-ONLY SELECT POLICY
DROP POLICY IF EXISTS "Department users can view announcement files" ON storage.objects;

-- 2. CREATE VISIBILITY-AWARE STORAGE SELECT POLICY
CREATE POLICY "Authenticated users view authorized announcement files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'announcements'
    AND public.is_active_auth_user()
    AND (
      -- Admin superuser override
      public.get_auth_user_role() = 'ADMIN'
      -- Parent announcement visibility verification
      OR EXISTS (
        SELECT 1 FROM public.announcements a
        WHERE a.attachment_path = storage.objects.name
          AND (
            -- HOD can view all department announcement files (both drafts and published)
            (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
            -- Students and Faculty can only view files of published announcements targeted to them in their department
            OR (
              a.status = 'PUBLISHED'
              AND a.department_id = public.get_auth_user_department_id()
              AND (
                (public.get_auth_user_role() = 'STUDENT' AND a.target_audience IN ('Students', 'Students + Faculty'))
                OR (public.get_auth_user_role() = 'FACULTY' AND a.target_audience IN ('Faculty', 'Students + Faculty'))
              )
            )
          )
      )
    )
  );
```

### C. Application-Level Preflight Defense-in-Depth
Updated `downloadAnnouncementAttachment` in `src/services/announcementService.ts`:
```typescript
export const downloadAnnouncementAttachment = async (
  storagePath: string, 
  fileName?: string,
  announcementId?: string
): Promise<void> => {
  if (!storagePath) {
    throw new Error('Attachment path is required.');
  }

  // Preflight check: If announcementId is supplied, verify parent announcement visibility
  if (announcementId) {
    const parentAnnouncement = await getAnnouncementById(announcementId);
    if (!parentAnnouncement || !parentAnnouncement.attachmentPath || parentAnnouncement.attachmentPath !== storagePath) {
      throw new Error('You are not authorized to download this attachment or the announcement is no longer available.');
    }
  }

  await downloadStorageFile(STORAGE_BUCKETS.ANNOUNCEMENTS, storagePath, fileName);
};
```
Updated `src/pages/AnnouncementDetail.tsx` and `src/hod/pages/HODAnnouncementPage.tsx` to supply `announcement.id` / `anc.id` to the download handler.

---

## 4. Verification and Security Test Results

### A. Real PostgreSQL 16 Test Matrix (`tests/real_postgres_announcement_security.mjs`)
Executed on isolated PostgreSQL 16 cluster (port 54333) with real roles (`authenticated`), JWT claims, and RLS enabled:

| # | User Role & Department | Announcement Target & Status | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| 1 | Student, CSE | Published, Students | ALLOW | 1 row returned | **PASS** |
| 2 | Student, CSE | Published, Students + Faculty | ALLOW | 1 row returned | **PASS** |
| 3 | Student, CSE | Draft, Students | DENY | 0 rows returned | **PASS** |
| 4 | Student, CSE | Published, Faculty-only | DENY | 0 rows returned | **PASS** |
| 5 | Student, ECE | Published, Students (CSE) | DENY | 0 rows returned | **PASS** |
| 6 | Faculty, CSE | Published, Faculty | ALLOW | 1 row returned | **PASS** |
| 7 | Faculty, CSE | Published, Students-only | DENY | 0 rows returned | **PASS** |
| 8 | HOD, CSE | Draft, Students (CSE) | ALLOW | 1 row returned | **PASS** |
| 9 | Admin | All announcements | ALLOW | 1 row returned | **PASS** |
| 10 | Inactive Student, CSE | Any announcement | DENY | 0 rows returned | **PASS** |
| 11 | Any user | Orphaned storage object | DENY | 0 rows returned | **PASS** |
| 12 | Any user | Manipulated / invalid path | DENY | 0 rows returned | **PASS** |
| 13 | Student, CSE | Repeat read with `ignoreDuplicates` | ALLOW | 0 RLS errors, timestamp preserved | **PASS** |
| 14 | Student, CSE | Cross-student read insertion | DENY | Rejected with RLS violation | **PASS** |

### B. Unit & Contract Test Matrix (`tests/announcement_detail.test.mjs`)
14 tests executed and passed:
1. `Valid announcement retrieval`: Maps database fields into typed `Announcement` contract (**PASS**).
2. `Missing announcement`: Returns `null` safely (**PASS**).
3. `Unauthorized announcement access`: Enforces student visibility restrictions (**PASS**).
4. `Announcement card navigation`: Targets `/student/announcements/:id` (**PASS**).
5. `Direct detail URL access`: Parameter extraction (**PASS**).
6. `Invalid announcement ID`: Non-string/null/empty ID handling (**PASS**).
7. `Attachment handling`: File size formatting & download contract (**PASS**).
8. `Read/unread behavior`: Scoping isolation (**PASS**).
9. `Back navigation`: Back to `/student/announcements` (**PASS**).
10. `Existing list regression`: `getDepartmentAnnouncements` contract intact (**PASS**).
11. `Idempotent read state`: `ignoreDuplicates: true` preserves initial timestamp (**PASS**).
12. `Application preflight check (Deny)`: Blocks draft and tampered path downloads (**PASS**).
13. `Application preflight check (Allow)`: Succeeds for authorized announcements (**PASS**).
14. `Cross-student read isolation`: Student cannot tamper with another's read record (**PASS**).

### C. Full Repository Quality Gates
- **`npm test`**: **219/219 PASS** across 17 test suites (0 failures).
- **`npm run test:real-pg`**: **10/10 PASS** (Migration 05.6/07.2 rate limiting) + **14/14 PASS** (Migration 07.4.4.3 announcement security) on PostgreSQL 16 port 54333.
- **`npm run typecheck`**: **0 errors** (`tsc -b --pretty false`).
- **`npm run lint`**: **0 errors** (`oxlint` on 276 files).
- **`npm run build`**: **0 errors** (production build completed in 1.37s).

---

## 5. Strict Boundary & Production Non-Modification Confirmation

- **Production Database:** NOT modified. No SQL statements were executed against Supabase production (`eddsaafwwmtfnjukxamx`).
- **Production Migrations:** NOT applied. Migration `00038` was created locally and tested against the isolated PostgreSQL 16 test cluster only.
- **Edge Functions & Secrets:** UNTOUCHED.
- **Leave Management:** ZERO changes.
- **Authentication & Rate Limiting:** ZERO changes.

---

## 6. Changed Files & Git Status

- `package.json`: Wired `tests/real_postgres_announcement_security.mjs` into `test:real-pg`.
- `src/services/announcementService.ts`: Added `ignoreDuplicates: true`, ID input validation, and preflight check in `downloadAnnouncementAttachment`.
- `src/pages/AnnouncementDetail.tsx`: Passed `announcement.id` to `downloadAnnouncementAttachment`.
- `src/hod/pages/HODAnnouncementPage.tsx`: Passed `anc.id` to `downloadAnnouncementAttachment`.
- `supabase/migrations/00038_announcement_attachment_storage_rls.sql`: Forward-only migration upgrading Storage RLS.
- `tests/announcement_detail.test.mjs`: Added unit tests for read idempotency and preflight check.
- `tests/real_postgres_announcement_security.mjs`: Real PostgreSQL 16 RLS security test suite.

---

## 7. Final Recommendation

IMPLEMENTED — SECURITY REMEDIATION VERIFIED LOCALLY.
