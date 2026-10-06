-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00025: SECURE FACULTY TIMETABLE RLS
-- Enforces strict database-level isolation for faculty timetable entries.
-- ============================================================

-- 1. Drop old overly permissive SELECT policy on public.timetable_entries
DROP POLICY IF EXISTS "Department users can view timetable" ON public.timetable_entries;
DROP POLICY IF EXISTS "Role based timetable select access" ON public.timetable_entries;

-- 2. Create strict role-scoped SELECT policy for public.timetable_entries
-- - ADMIN: Full institutional timetable access.
-- - HOD: Department-level timetable access (department_id = get_auth_user_department_id()).
-- - STUDENT: Department-level timetable access (department_id = get_auth_user_department_id()).
-- - FACULTY: Strictly own assigned timetable entries (faculty_id = auth.uid()).
CREATE POLICY "Role based timetable select access"
  ON public.timetable_entries
  FOR SELECT
  TO authenticated
  USING (
    public.get_auth_user_role() = 'ADMIN'
    OR (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
    OR (public.get_auth_user_role() = 'STUDENT' AND department_id = public.get_auth_user_department_id())
    OR (public.get_auth_user_role() = 'FACULTY' AND faculty_id = auth.uid())
  );
