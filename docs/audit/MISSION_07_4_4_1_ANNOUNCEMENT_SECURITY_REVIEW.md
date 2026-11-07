# MISSION 07.4.4.1 — Announcement Authorization and RLS Security Review

**Project:** AIET-UniSphere — AI-Powered Smart Learning Management System  
**Audit Target:** Announcement Authorization, Row-Level Security (RLS), and Storage Security  
**Audit Mode:** Read-Only Security Inspection  
**Date:** November 8, 2026  
**Status:** Complete  

---

## 1. Executive Summary

An independent, read-only security audit was conducted on the Mission 07.4.4 announcement detail and navigation implementation. 

### Key Findings
1. **Database-Level Visibility Boundary:** The `announcements` table has Row-Level Security (RLS) strictly enabled via migration `00010_announcements.sql`. Student queries are restricted at the database level to published announcements within their own department targeted to students. Guessing another department's announcement UUID yields `0` rows at the PostgreSQL level.
2. **Frontend Defense-in-Depth:** Client-side checks in `AnnouncementDetail.tsx` act as secondary defense-in-depth; the primary and authoritative security boundary is PostgreSQL RLS.
3. **Route Authorization Alignment:** The `/student/announcements/:id` route in `App.tsx` is protected by `RoleGuard` restricted to `['STUDENT', 'ADMIN']`, which aligns with the database RLS policies.
4. **Storage Object Isolation:** The `announcements` bucket is private (`public = false`). Storage RLS on `storage.objects` strictly validates the first folder path against `public.get_auth_user_department_id()::text`, preventing cross-department attachment downloads.
5. **Repeat Read RLS Policy Limitation:** While `announcement_reads` enforces `user_id = auth.uid()` on `INSERT` and `SELECT`, it lacks an `UPDATE` policy in `00010_announcements.sql`. An `upsert` with `DO UPDATE` on repeat visits causes PostgreSQL to reject the update. `markAnnouncementAsRead()` catches the error gracefully, but an enhancement to use `ignoreDuplicates: true` or an `UPDATE` policy is recommended.
6. **Test Quality Classification:** All 10 tests in `tests/announcement_detail.test.mjs` are classified as **pure logic or mocked unit tests**. Real database integration tests with PostgreSQL session roles remain a separate layer.

---

## 2. Announcement Visibility & Database RLS

### A. RLS Configuration
In migration `supabase/migrations/00010_announcements.sql`:
```sql
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view announcements of their department" ON public.announcements;
CREATE POLICY "Users can view announcements of their department"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    -- HOD can view all department announcements (both drafts and published)
    (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
    -- Admin can view all
    OR public.get_auth_user_role() = 'ADMIN'
    -- Students and Faculty can only view published announcements targeted at them in their department
    OR (
      status = 'PUBLISHED'
      AND department_id = public.get_auth_user_department_id()
      AND (
        (public.get_auth_user_role() = 'STUDENT' AND target_audience IN ('Students', 'Students + Faculty'))
        OR (public.get_auth_user_role() = 'FACULTY' AND target_audience IN ('Faculty', 'Students + Faculty'))
      )
    )
  );
```

### B. Helper Function Security
In migration `supabase/migrations/00020_project_and_document_access.sql`:
```sql
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p.account_status = 'ACTIVE' THEN p.role ELSE NULL END
  FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_department_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p.account_status = 'ACTIVE' THEN p.department_id ELSE NULL END
  FROM public.profiles p WHERE p.id = auth.uid();
$$;
```
Both helper functions are `SECURITY DEFINER`, pin `search_path = public`, and assert that the account status is `'ACTIVE'`. Inactive or locked accounts evaluate to `NULL`, immediately causing RLS evaluations to fail closed.

### C. Verification Against Specific Attack Vectors
1. **Can students retrieve draft announcements?**
   - **No.** The third policy branch requires `status = 'PUBLISHED'`. Draft announcements return 0 rows.
2. **Are department restrictions enforced at the database level?**
   - **Yes.** `department_id = public.get_auth_user_department_id()` is evaluated by PostgreSQL. A student cannot view another department's notice.
3. **Are audience restrictions enforced at the database level?**
   - **Yes.** For role `'STUDENT'`, the policy enforces `target_audience IN ('Students', 'Students + Faculty')`. Announcements targeted strictly to `'Faculty'` return 0 rows for students.
4. **Can a student query another department's announcement by guessing its UUID?**
   - **No.** A direct query `SELECT * FROM announcements WHERE id = '<foreign-uuid>'` runs against the RLS `USING` clause. If `department_id` does not match, PostgreSQL returns empty results (`data: null`).
5. **Is frontend authorization improperly relied upon as the security boundary?**
   - **No.** `src/pages/AnnouncementDetail.tsx` (lines 53–67) checks status and department solely as defense-in-depth and user experience feedback. The underlying Supabase client runs with the user's JWT, making PostgreSQL RLS the authoritative security boundary.

---

## 3. Read / Unread Authorization (`announcement_reads`)

### A. Schema & RLS Definition
In migration `00010_announcements.sql`:
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

### B. Security Analysis
1. **Can students read other students' read records?**
   - **No.** The SELECT policy enforces `user_id = auth.uid()`. Cross-student queries return 0 rows.
2. **Can students mark another student's announcement as read?**
   - **No.** The INSERT policy specifies `WITH CHECK (user_id = auth.uid())`. Attempting to insert a row where `user_id != auth.uid()` is rejected with a PostgreSQL RLS violation.
3. **Can the read operation bypass announcement visibility restrictions?**
   - **No.** While a student could theoretically insert an `announcement_id` into `announcement_reads`, `announcement_reads` contains no content, title, or metadata. Furthermore, `AnnouncementDetail.tsx` only invokes `markAnnouncementAsRead` after `getAnnouncementById(id)` successfully returns data. If RLS blocks the announcement query, marking as read is never executed.
4. **Handling of Duplicate Reads (Technical Observation):**
   - In `announcementService.ts#L272`:
     ```typescript
     export const markAnnouncementAsRead = async (announcementId: string, userId: string): Promise<boolean> => {
       const { error } = await (supabase as any)
         .from('announcement_reads')
         .upsert({
           announcement_id: announcementId,
           user_id: userId,
           read_at: new Date().toISOString()
         }, { onConflict: 'announcement_id,user_id' });
       if (error) { ... return false; }
       return true;
     };
     ```
   - **Observation:** `00010_announcements.sql` defines `FOR SELECT` and `FOR INSERT` policies, but **no `FOR UPDATE` policy**.
   - When a student visits an announcement the first time, `INSERT` succeeds.
   - When the student revisits, the `ON CONFLICT (announcement_id, user_id) DO UPDATE` branch triggers PostgreSQL to check for an `UPDATE` policy. Since none exists, PostgreSQL raises:
     `ERROR: new row violates row-level security policy (USING expression) for table "announcement_reads"`.
   - `markAnnouncementAsRead` catches this error and returns `false`, preventing UI crashes.
   - **Recommended Correction:** In `announcementService.ts`, pass `ignoreDuplicates: true` (`INSERT ... ON CONFLICT DO NOTHING`) so that repeat views succeed without invoking the missing `UPDATE` branch, or add an `UPDATE` policy in a future migration.

---

## 4. Route Authorization (`src/App.tsx`)

### A. Route Declaration
In `src/App.tsx`:
```tsx
<Route 
  path="/student/announcements/:id" 
  element={
    <RoleGuard allowedRoles={['STUDENT', 'ADMIN']}>
      <AnnouncementDetail />
    </RoleGuard>
  } 
/>
```

### B. Role Evaluation
1. **Is ADMIN access intentional?**
   - **Yes.** Across AIET-UniSphere, `ADMIN` has diagnostic and supervisory oversight across all student and faculty views. In `00010_announcements.sql`, Admin has explicit `ALL` permissions.
2. **Is STUDENT access restricted?**
   - **Yes.** Unauthenticated requests are redirected to `/login/student`. `FACULTY` or `HOD` attempting to access this route are redirected by `RoleGuard` to `/faculty/dashboard` or `/hod/dashboard`.
3. **Is direct URL access protected?**
   - **Yes.** Even if an attacker pastes a direct URL, `RoleGuard` verifies the JWT session and profile role before mounting `AnnouncementDetail`. If mounted, the database query executes with the user's JWT, applying PostgreSQL RLS.

---

## 5. Attachment & Storage Security

### A. Bucket Configuration
In migration `00013_supabase_storage_and_file_metadata.sql`:
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('announcements', 'announcements', false, 20971520, ARRAY['application/pdf', 'application/msword', ...])
ON CONFLICT (id) DO UPDATE SET public = false;
```
- `public = false`: The announcements bucket is strictly **private**. Unauthenticated access is rejected.

### B. Storage RLS Policies
In migration `00013_supabase_storage_and_file_metadata.sql`:
```sql
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
- **Path Isolation:** Attachment paths are structured as `${data.departmentId}/${tempAnnounceId}/${safeName}`.
- `(storage.foldername(name))[1]` evaluates to the department UUID.
- If a student belonging to Department A attempts to download a file belonging to Department B, PostgreSQL Storage RLS fails and access is denied.
- `downloadStorageFile` in `storageService.ts` sanitizes paths (`replace(/^\/+/, '')`) and catches 403/404 errors, throwing `"File is no longer available."`.

---

## 6. Test Suite Quality & Classification

The 10 tests in `tests/announcement_detail.test.mjs` are classified as follows:

| Test # | Test Title | Classification | Target Scrutiny |
|---|---|---|---|
| 1 | Valid announcement retrieval | **Pure Logic** | `mapDBRowToAnnouncement` object mapper |
| 2 | Missing announcement | **Pure Logic** | Null handling in helper and access check |
| 3 | Unauthorized announcement access | **Pure Logic** | Client simulation of RLS rules |
| 4 | Announcement card navigation | **Pure Logic** | URL path string generator |
| 5 | Direct detail URL access | **Pure Logic** | RegExp parameter extractor |
| 6 | Invalid announcement ID | **Pure Logic** | Type and whitespace sanitizer |
| 7 | Attachment handling | **Mocked / Pure Logic** | File size formatter & caller contract |
| 8 | Read/unread behavior | **Mocked** | In-memory `Map` simulating DB store |
| 9 | Back navigation | **Pure Logic** | Constant route assertion |
| 10 | Existing list regression | **Pure Logic** | Array mapper contract |

### Quality Assessment
- **Honest Test Boundary:** None of these 10 tests connect to an active PostgreSQL instance with RLS enabled. They verify frontend mapper logic, defensive assertions, and mock isolation.
- **Production RLS Assurance:** Database-level security is guaranteed by PostgreSQL RLS policies in migrations `00010`, `00013`, and `00020`, rather than by mocked unit tests.
- **Future Test Recommendation:** Author a dedicated database-backed test in `tests/real_postgres_verification.mjs` verifying cross-department and draft announcement filtering under authenticated PostgreSQL roles.

---

## 7. Recommended Minimal Corrections

1. **`markAnnouncementAsRead()` in `src/services/announcementService.ts`:**
   Update the call to specify `ignoreDuplicates: true`:
   ```typescript
   await (supabase as any)
     .from('announcement_reads')
     .upsert({
       announcement_id: announcementId,
       user_id: userId,
       read_at: new Date().toISOString()
     }, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
   ```
   *Reason:* Avoids triggering PostgreSQL RLS error on repeat views due to missing `UPDATE` policy.
2. **Future Migration (Additive):**
   Add `CREATE POLICY "Users can update own read records" ON public.announcement_reads FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());` to allow timestamp refreshes on repeat views if desired.

---

## 8. Final Conclusion & Recommendation

APPROVED — database authorization and announcement visibility verified.
