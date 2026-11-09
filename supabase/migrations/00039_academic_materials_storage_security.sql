-- ============================================================
-- AIET-UNISPHERE - MIGRATION 00039: ACADEMIC MATERIALS STORAGE SECURITY
-- ============================================================
--
-- PURPOSE:
-- Upgrades Storage Row-Level Security for the 'academic-materials' bucket.
-- Replaces coarse department-only policies from Migration 00013 with fine-grained,
-- course-authorization and parent-record-aware policies.
--
-- PREVIOUS DEFECT (DEF-08.2.2-02):
-- Migration 00013 allowed any faculty member in a department to SELECT, INSERT,
-- or DELETE any file in the 'academic-materials' bucket if the first path segment
-- matched their department_id, regardless of whether they taught the course.
--
-- REMEDIATION:
-- 1. SELECT:
--    - Storage object MUST correlate to a valid parent record in public.academic_materials.
--    - Inactive accounts are denied access (public.is_active_auth_user()).
--    - Admin has system-wide access.
--    - HOD can access materials for courses in their department.
--    - Faculty can access materials if:
--        a) They uploaded the material (m.uploaded_by = auth.uid())
--        b) OR they are assigned to teach the course (in course_enrollments or timetable_entries)
--    - Students can access materials ONLY if actively enrolled in that course (in course_enrollments).
--
-- 2. INSERT:
--    - Admin can insert into any folder.
--    - HOD can insert into their department folder ((storage.foldername(name))[1] = dept_id).
--    - Faculty can insert ONLY if:
--        a) First path segment is their department ((storage.foldername(name))[1] = dept_id)
--        b) AND they are assigned to teach the course in the second path segment ((storage.foldername(name))[2])
--
-- 3. UPDATE:
--    - Adds missing UPDATE policy for upsert safety:
--    - Admin, HOD of department, or assigned faculty for the course.
--
-- 4. DELETE:
--    - Admin has system-wide deletion authority.
--    - HOD can delete files within their department folder.
--    - Faculty can delete files ONLY if:
--        a) First path segment is their department
--        b) AND they are assigned to teach the course in the second path segment.
--
-- ============================================================

-- 1. DROP OBSOLETE DEPARTMENT-ONLY POLICIES
DROP POLICY IF EXISTS "Department users can view academic materials" ON storage.objects;
DROP POLICY IF EXISTS "Faculty can upload academic materials" ON storage.objects;
DROP POLICY IF EXISTS "Faculty can delete academic materials" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users view academic materials" ON storage.objects;
DROP POLICY IF EXISTS "Authorized faculty upload academic materials" ON storage.objects;
DROP POLICY IF EXISTS "Authorized faculty update academic materials" ON storage.objects;
DROP POLICY IF EXISTS "Authorized faculty delete academic materials" ON storage.objects;

-- 2. CREATE COURSE-AWARE STORAGE SELECT POLICY
CREATE POLICY "Authorized users view academic materials"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'academic-materials'
    AND public.is_active_auth_user()
    AND (
      -- Admin superuser override
      public.get_auth_user_role() = 'ADMIN'
      -- Parent record correlation and course authorization check
      OR EXISTS (
        SELECT 1 FROM public.academic_materials m
        WHERE m.storage_path = storage.objects.name
          AND (
            -- HOD can view materials within their department
            (public.get_auth_user_role() = 'HOD' AND m.department_id = public.get_auth_user_department_id())
            -- Faculty who uploaded the material
            OR (public.get_auth_user_role() = 'FACULTY' AND m.uploaded_by = auth.uid())
            -- Faculty assigned to teach the course
            OR (
              public.get_auth_user_role() = 'FACULTY'
              AND m.department_id = public.get_auth_user_department_id()
              AND (
                EXISTS (
                  SELECT 1 FROM public.course_enrollments ce
                  WHERE ce.faculty_id = auth.uid()
                    AND (ce.course_id = m.course_id OR ce.course_code = m.course_id)
                )
                OR EXISTS (
                  SELECT 1 FROM public.timetable_entries te
                  WHERE te.faculty_id = auth.uid()
                    AND (te.course_id = m.course_id OR te.course_code = m.course_id)
                )
              )
            )
            -- Students enrolled in the course
            OR (
              public.get_auth_user_role() = 'STUDENT'
              AND m.department_id = public.get_auth_user_department_id()
              AND EXISTS (
                SELECT 1 FROM public.course_enrollments ce
                WHERE ce.student_id = auth.uid()
                  AND (ce.course_id = m.course_id OR ce.course_code = m.course_id)
                  AND ce.status = 'Active'
              )
            )
          )
      )
    )
  );

-- 3. CREATE COURSE-AWARE STORAGE INSERT POLICY
CREATE POLICY "Authorized faculty upload academic materials"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'academic-materials'
    AND public.is_active_auth_user()
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR (
        (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
        AND (
          public.get_auth_user_role() = 'HOD'
          OR (
            public.get_auth_user_role() = 'FACULTY'
            AND (
              EXISTS (
                SELECT 1 FROM public.course_enrollments ce
                WHERE ce.faculty_id = auth.uid()
                  AND (ce.course_id = (storage.foldername(name))[2] OR ce.course_code = (storage.foldername(name))[2])
              )
              OR EXISTS (
                SELECT 1 FROM public.timetable_entries te
                WHERE te.faculty_id = auth.uid()
                  AND (te.course_id = (storage.foldername(name))[2] OR te.course_code = (storage.foldername(name))[2])
              )
            )
          )
        )
      )
    )
  );

-- 4. CREATE STORAGE UPDATE POLICY (FOR SAFE UPSERTS)
CREATE POLICY "Authorized faculty update academic materials"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'academic-materials'
    AND public.is_active_auth_user()
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR (
        (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
        AND (
          public.get_auth_user_role() = 'HOD'
          OR (
            public.get_auth_user_role() = 'FACULTY'
            AND (
              EXISTS (
                SELECT 1 FROM public.course_enrollments ce
                WHERE ce.faculty_id = auth.uid()
                  AND (ce.course_id = (storage.foldername(name))[2] OR ce.course_code = (storage.foldername(name))[2])
              )
              OR EXISTS (
                SELECT 1 FROM public.timetable_entries te
                WHERE te.faculty_id = auth.uid()
                  AND (te.course_id = (storage.foldername(name))[2] OR te.course_code = (storage.foldername(name))[2])
              )
            )
          )
        )
      )
    )
  );

-- 5. CREATE STORAGE DELETE POLICY (ROLLBACK AND REMOVAL SAFE)
CREATE POLICY "Authorized faculty delete academic materials"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'academic-materials'
    AND public.is_active_auth_user()
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR (
        (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
        AND (
          public.get_auth_user_role() = 'HOD'
          OR (
            public.get_auth_user_role() = 'FACULTY'
            AND (
              EXISTS (
                SELECT 1 FROM public.course_enrollments ce
                WHERE ce.faculty_id = auth.uid()
                  AND (ce.course_id = (storage.foldername(name))[2] OR ce.course_code = (storage.foldername(name))[2])
              )
              OR EXISTS (
                SELECT 1 FROM public.timetable_entries te
                WHERE te.faculty_id = auth.uid()
                  AND (te.course_id = (storage.foldername(name))[2] OR te.course_code = (storage.foldername(name))[2])
              )
            )
          )
        )
      )
    )
  );
