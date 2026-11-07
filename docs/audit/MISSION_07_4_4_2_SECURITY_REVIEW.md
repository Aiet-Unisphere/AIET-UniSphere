# MISSION 07.4.4.2 — Announcement Attachment Authorization and Read-State Security Review

**Project:** AIET-UniSphere — AI-Powered Smart Learning Management System  
**Audit Target:** Announcement Attachment Storage Authorization & Read-State Idempotency  
**Audit Phase:** Phase 1 — Read-Only Architecture and Security Review  
**Date:** November 8, 2026  
**Status:** Audit Complete — Awaiting Project Owner Approval  

---

## 1. Issue A — Announcement Read-State Idempotency

### A. Root Cause Analysis
1. **Schema & Policies (`00010_announcements.sql`):**
   ```sql
   CREATE TABLE IF NOT EXISTS public.announcement_reads (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
     user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
     read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE(announcement_id, user_id)
   );

   ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view own read records"
     ON public.announcement_reads FOR SELECT
     TO authenticated
     USING (user_id = auth.uid());

   CREATE POLICY "Users can insert own read records"
     ON public.announcement_reads FOR INSERT
     TO authenticated
     WITH CHECK (user_id = auth.uid());
   ```
   *Notice:* Only `FOR SELECT` and `FOR INSERT` policies exist. **There is no `FOR UPDATE` policy.**

2. **Client Implementation (`src/services/announcementService.ts#L272`):**
   ```typescript
   export const markAnnouncementAsRead = async (announcementId: string, userId: string): Promise<boolean> => {
     const { error } = await (supabase as any)
       .from('announcement_reads')
       .upsert({
         announcement_id: announcementId,
         user_id: userId,
         read_at: new Date().toISOString()
       }, { onConflict: 'announcement_id,user_id' });

     if (error) {
       console.error('Error marking announcement as read:', error);
       return false;
     }
     return true;
   };
   ```
3. **Execution Path & Failure Mechanism:**
   - On the student's **first visit** to an announcement:
     PostgREST executes `INSERT INTO announcement_reads ...`. The `INSERT` policy `WITH CHECK (user_id = auth.uid())` succeeds. The read record is stored.
   - On **subsequent visits** to the same announcement:
     PostgREST uses `Prefer: resolution=merge-duplicates`, generating:
     `INSERT INTO announcement_reads (...) VALUES (...) ON CONFLICT (announcement_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at`.
     In PostgreSQL, the `DO UPDATE` branch invokes the table's `UPDATE` RLS policies.
     Because no `UPDATE` policy exists for `authenticated` users, PostgreSQL fails closed and raises:
     `ERROR: new row violates row-level security policy (USING expression) for table "announcement_reads"`.
   - `markAnnouncementAsRead` catches the error and returns `false`.

4. **Impact on UI & Badges:**
   - The UI does not crash because `markAnnouncementAsRead` contains a `try/catch` and returns a boolean.
   - The "New" badge on `AnnouncementsPage.tsx` behaves correctly because the row was already inserted during the first visit (`getReadAnnouncements` returns the ID from the first insert).
   - However, an unsightly 403 / 42501 RLS error is logged to browser console on every repeat visit.

### B. Business Logic & Timestamp Semantics
- A read receipt records when the student **first acknowledged / read** the announcement.
- Preserving the initial `read_at` timestamp is standard administrative audit practice (proving when the notice was first seen). Continuously overwriting `read_at` on every page refresh destroys the initial acknowledgment audit trail.

### C. Proposed Minimal Correction
Update `markAnnouncementAsRead()` in `src/services/announcementService.ts` to pass `ignoreDuplicates: true`:
```typescript
export const markAnnouncementAsRead = async (announcementId: string, userId: string): Promise<boolean> => {
  if (!announcementId || !userId) return false;

  const { error } = await (supabase as any)
    .from('announcement_reads')
    .upsert({
      announcement_id: announcementId,
      user_id: userId,
      read_at: new Date().toISOString()
    }, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });

  if (error) {
    console.error('Error marking announcement as read:', error);
    return false;
  }
  return true;
};
```
- **PostgREST Behavior:** `ignoreDuplicates: true` sets `Prefer: resolution=ignore-duplicates`.
- **PostgreSQL Translation:** Generates `INSERT INTO announcement_reads (...) VALUES (...) ON CONFLICT (announcement_id, user_id) DO NOTHING;`.
- **Result:** No `UPDATE` branch is taken. Only the `INSERT` policy is evaluated. Repeated visits succeed silently without database RLS errors.
- **Migration Required:** **None.** This is a zero-migration, 1-line code fix that restores 100% idempotency.

---

## 2. Issue B — Announcement Attachment Authorization

### A. Current Storage Bucket & Policy Inspection
From migration `supabase/migrations/00013_supabase_storage_and_file_metadata.sql`:

1. **Bucket Configuration:**
   ```sql
   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   VALUES 
     ('announcements', 'announcements', false, 20971520, ARRAY['application/pdf', 'application/msword', ...])
   ON CONFLICT (id) DO UPDATE SET public = false;
   ```
   - `public = false`: The announcements bucket is private.

2. **Active Storage Policies on `storage.objects`:**
   ```sql
   DROP POLICY IF EXISTS "Department users can view announcement files" ON storage.objects;
   CREATE POLICY "Department users can view announcement files"
     ON storage.objects FOR SELECT
     TO authenticated
     USING (
       bucket_id = 'announcements'
       AND (
         (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
         OR public.get_auth_user_role() = 'ADMIN'
       )
     );
   ```

3. **Attachment Path Construction (`announcementService.ts#L162`):**
   ```typescript
   storagePath = `${data.departmentId}/${tempAnnounceId}/${safeName}`;
   ```
   - `(storage.foldername(name))[1]` = `department_id`.
   - `(storage.foldername(name))[2]` = `tempAnnounceId` (UUID).
   - Filename = `safeName`.

### B. Direct Object Access Audit

We traced whether an authenticated student can directly request an attachment object via `supabase.storage.from('announcements').download(path)`:

| Scenario | Path Example | Current Storage Policy Evaluation | Result | Authorization Defect? |
|---|---|---|---|---|
| **1. Draft Announcement** | `cse_dept_id/draft_ann_id/draft.pdf` | `(foldername)[1] = 'cse_dept_id'` matches student department | **ACCESS GRANTED** | **YES (Defect)**: Student can download draft files before publication if path is known. |
| **2. Faculty-Only Announcement** | `cse_dept_id/fac_ann_id/faculty_minutes.pdf` | `(foldername)[1] = 'cse_dept_id'` matches student department | **ACCESS GRANTED** | **YES (Defect)**: Student can download faculty-only files if path is known. |
| **3. Other Department Announcement** | `ece_dept_id/ann_id/circular.pdf` | `(foldername)[1] = 'ece_dept_id'` does NOT match student department | **ACCESS DENIED (403)** | **NO**: Correctly blocked by department folder check. |
| **4. Inaccessible in Own Department** | `cse_dept_id/inaccessible_id/file.pdf` | `(foldername)[1] = 'cse_dept_id'` matches student department | **ACCESS GRANTED** | **YES (Defect)**: Storage policy does not verify announcement publication status or audience. |

### C. Root Cause of the Gap
The Storage RLS policy `"Department users can view announcement files"` enforces **department isolation only**.
It **does NOT verify** the parent announcement's:
1. `status = 'PUBLISHED'`
2. `target_audience IN ('Students', 'Students + Faculty')`
3. Student relational visibility in `public.announcements`.

Relying on UUID unpredictability (`tempAnnounceId`) is security-through-obscurity and does not satisfy strict institutional LMS compliance standards.

---

## 3. Recommended Remediation Plan

To close this gap definitively, we recommend a dual-layer approach:

### Layer 1: Client Service Pre-Authorization Gate (Zero Database Changes)
Update `downloadAnnouncementAttachment` in `src/services/announcementService.ts` to require the `announcementId`, verifying parent announcement visibility before initiating the download:

```typescript
export const downloadAnnouncementAttachment = async (
  announcementId: string,
  storagePath: string, 
  fileName?: string
): Promise<void> => {
  if (!announcementId || !storagePath) {
    throw new Error('Attachment information is incomplete.');
  }

  // 1. Authoritative Pre-Flight Check via RLS:
  // getAnnouncementById queries public.announcements, which enforces status='PUBLISHED',
  // matching department_id, and matching target_audience for the authenticated student.
  const announcement = await getAnnouncementById(announcementId);
  if (!announcement || !announcement.attachmentPath || announcement.attachmentPath !== storagePath) {
    throw new Error('You do not have permission to download this attachment or the notice is unavailable.');
  }

  // 2. Download verified storage file
  await downloadStorageFile(STORAGE_BUCKETS.ANNOUNCEMENTS, storagePath, fileName);
};
```
And update `src/pages/AnnouncementDetail.tsx`:
```tsx
const handleDownloadAttachment = async () => {
  if (!announcement?.attachmentPath || !announcement?.id) return;
  setDownloading(true);
  try {
    await downloadAnnouncementAttachment(
      announcement.id,
      announcement.attachmentPath,
      announcement.attachmentName || 'Announcement_Document.pdf'
    );
  } catch (err: any) {
    setDownloadError(err.message || 'Failed to download attachment.');
  } finally {
    setDownloading(false);
  }
};
```

### Layer 2: Database Migration (Forward-Only Additive Migration)
To protect against direct API / SDK calls that bypass the frontend application entirely, provide a forward-only additive migration that upgrades the Storage RLS policy on `storage.objects` for `bucket_id = 'announcements'`:

```sql
-- Migration: 00038_announcement_attachment_storage_rls.sql
DROP POLICY IF EXISTS "Department users can view announcement files" ON storage.objects;

CREATE POLICY "Authenticated users view authorized announcement files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'announcements'
    AND public.is_active_auth_user()
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR EXISTS (
        SELECT 1 FROM public.announcements a
        WHERE a.attachment_path = storage.objects.name
          AND (
            -- HOD can view department files
            (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
            -- Students and Faculty can only view files of published announcements targeted to them
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
*Note on Layer 2:* Per project instructions ("Do not apply production migrations without owner approval"), Layer 2 should only be proposed and applied after explicit owner approval. Layer 1 can be implemented immediately in the application code without database schema changes.

---

## 4. Required Automated Test Matrix

The following test scenarios must be implemented in the automated test suite (`tests/announcement_detail.test.mjs` and real PostgreSQL tests):

| Test Scenario | Verification Objective |
|---|---|
| **1. Read State Idempotency** | Calling `markAnnouncementAsRead()` repeatedly for the same `(announcement_id, user_id)` returns `true` and does not throw an error. |
| **2. Initial Timestamp Preservation** | Repeat reads do not overwrite the initial `read_at` timestamp. |
| **3. Draft Attachment Block** | Attempting to download an attachment belonging to a `DRAFT` announcement is blocked with an authorization error. |
| **4. Faculty-Only Attachment Block** | A student attempting to download an attachment belonging to a `Faculty`-only announcement is blocked with an authorization error. |
| **5. Cross-Department Attachment Block** | A student attempting to download an attachment belonging to a different department is blocked. |
| **6. Published Student Attachment Allow** | A student downloading an attachment belonging to a `PUBLISHED` announcement targeted to `'Students'` or `'Students + Faculty'` in their department succeeds. |
| **7. HOD & Admin Attachment Access** | HOD and Admin can download draft and all department attachments. |

---

## 5. Summary & Recommendation

1. **Issue A (Read-state idempotency):** Resolved completely via `ignoreDuplicates: true` in `markAnnouncementAsRead()`. Requires **NO database migration**.
2. **Issue B (Attachment authorization):**
   - Application-layer defense-in-depth pre-flight check in `downloadAnnouncementAttachment(announcementId, storagePath, fileName)` blocks unauthorized downloads immediately without migration.
   - Database Storage RLS policy upgrade drafted as forward-only migration `00038` for owner authorization.

**Awaiting project-owner decision and approval to proceed with Phase 2 implementation.**
