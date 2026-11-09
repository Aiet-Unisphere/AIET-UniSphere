-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00038: ANNOUNCEMENT ATTACHMENT STORAGE RLS
-- ============================================================
--
-- PURPOSE:
-- Upgrades Storage Row-Level Security for the 'announcements' bucket.
-- Replaces the coarse department-only SELECT policy from Migration 00013 with a
-- fine-grained, announcement-visibility-aware policy.
--
-- PREVIOUS DEFECT:
-- The previous policy ("Department users can view announcement files") only checked:
--   (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
-- This allowed students to download attachments of:
--   1. DRAFT announcements within their department before publication.
--   2. Faculty-only announcements within their department.
--
-- REMEDIATION:
-- Links attachment objects directly to their parent announcement record in public.announcements
-- via attachment_path = storage.objects.name.
-- Enforces exact visibility alignment:
--   - Storage object MUST correspond to a valid parent announcement.
--   - Inactive accounts are denied access (public.is_active_auth_user()).
--   - ADMIN users retain full access.
--   - HOD users retain full access to their department announcements (draft and published).
--   - Students and Faculty can ONLY access attachments for PUBLISHED announcements
--     within their own department where they belong to target_audience.
--
-- ============================================================

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

