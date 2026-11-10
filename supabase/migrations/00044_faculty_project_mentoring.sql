-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00044: FACULTY PROJECT MENTORING RLS
-- ============================================================
-- Enables Department Faculty and HOD to:
-- 1. Review and update project status/progress for projects in their department.
-- 2. Review and manage project milestone verification in their department.
-- 3. Strictly enforces departmental scoping and prevents cross-department mutations.
-- ============================================================

-- 1. UPDATE POLICY FOR user_projects
DROP POLICY IF EXISTS "Owners and Admin update projects" ON public.user_projects;
DROP POLICY IF EXISTS "Owners, Staff, and Admin update projects" ON public.user_projects;

CREATE POLICY "Owners, Staff, and Admin update projects"
  ON public.user_projects FOR UPDATE TO authenticated
  USING (
    public.is_active_auth_user()
    AND (
      owner_id = auth.uid()
      OR public.get_auth_user_role() = 'ADMIN'
      OR (
        public.get_auth_user_role() IN ('FACULTY', 'HOD')
        AND department_id = public.get_auth_user_department_id()
      )
    )
  )
  WITH CHECK (
    (
      owner_id = auth.uid()
      AND department_id = public.get_auth_user_department_id()
    )
    OR public.get_auth_user_role() = 'ADMIN'
    OR (
      public.get_auth_user_role() IN ('FACULTY', 'HOD')
      AND department_id = public.get_auth_user_department_id()
    )
  );

-- 2. ALL/UPDATE POLICY FOR project_milestones
DROP POLICY IF EXISTS "Project owners and members manage milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Project owners, members, and department staff manage milestones" ON public.project_milestones;

CREATE POLICY "Project owners, members, and department staff manage milestones"
  ON public.project_milestones FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id
        AND (
          p.owner_id = auth.uid()
          OR public.is_project_member(p.id, auth.uid())
          OR (
            public.get_auth_user_role() IN ('FACULTY', 'HOD')
            AND p.department_id = public.get_auth_user_department_id()
          )
        )
    )
  )
  WITH CHECK (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id
        AND (
          p.owner_id = auth.uid()
          OR public.is_project_member(p.id, auth.uid())
          OR (
            public.get_auth_user_role() IN ('FACULTY', 'HOD')
            AND p.department_id = public.get_auth_user_department_id()
          )
        )
    )
  );

-- 3. Document policy additions
COMMENT ON TABLE public.user_projects IS 
  'Student academic and technical projects scoped to department, with faculty mentorship and administrative oversight.';

