CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p.account_status = 'ACTIVE' THEN p.role ELSE NULL END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_department_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p.account_status = 'ACTIVE' THEN p.department_id ELSE NULL END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_auth_user_department_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_user_department_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND p_user_id = auth.uid()
      AND public.is_active_auth_user()
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Users can manage own projects" ON public.user_projects;
CREATE POLICY "Authorized users can view scoped projects"
  ON public.user_projects FOR SELECT TO authenticated
  USING (
    public.is_active_auth_user()
    AND (
      owner_id = auth.uid()
      OR public.is_project_member(id, auth.uid())
      OR public.get_auth_user_role() = 'ADMIN'
      OR (
        public.get_auth_user_role() IN ('FACULTY', 'HOD')
        AND department_id = public.get_auth_user_department_id()
      )
    )
  );

CREATE POLICY "Students create own department projects"
  ON public.user_projects FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND department_id = public.get_auth_user_department_id()
    AND (
      public.get_auth_user_role() = 'STUDENT'
      OR public.get_auth_user_role() = 'ADMIN'
    )
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_status = 'ACTIVE')
  );

CREATE POLICY "Owners and Admin update projects"
  ON public.user_projects FOR UPDATE TO authenticated
  USING (public.is_active_auth_user() AND (owner_id = auth.uid() OR public.get_auth_user_role() = 'ADMIN'))
  WITH CHECK (
    (owner_id = auth.uid() AND department_id = public.get_auth_user_department_id())
    OR public.get_auth_user_role() = 'ADMIN'
  );

CREATE POLICY "Owners and Admin delete projects"
  ON public.user_projects FOR DELETE TO authenticated
  USING (public.is_active_auth_user() AND (owner_id = auth.uid() OR public.get_auth_user_role() = 'ADMIN'));

DROP POLICY IF EXISTS "Project participants can view members" ON public.project_members;
DROP POLICY IF EXISTS "Project owners can manage members" ON public.project_members;
CREATE POLICY "Project participants and department staff view members"
  ON public.project_members FOR SELECT TO authenticated
  USING (
    (public.is_active_auth_user() AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id
        AND (
          p.owner_id = auth.uid()
          OR public.is_project_member(p.id, auth.uid())
          OR public.get_auth_user_role() = 'ADMIN'
          OR (
            public.get_auth_user_role() IN ('FACULTY', 'HOD')
            AND p.department_id = public.get_auth_user_department_id()
          )
        )
    )
  );

CREATE POLICY "Project owners manage members"
  ON public.project_members FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (SELECT 1 FROM public.user_projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  )
  WITH CHECK (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (SELECT 1 FROM public.user_projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Project participants can view tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Project owners can manage tasks" ON public.project_tasks;
CREATE POLICY "Project participants and department staff view tasks"
  ON public.project_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id
        AND (
          p.owner_id = auth.uid()
          OR public.is_project_member(p.id, auth.uid())
          OR public.get_auth_user_role() = 'ADMIN'
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND p.department_id = public.get_auth_user_department_id())
        )
    )
  );
CREATE POLICY "Project owners and members manage tasks"
  ON public.project_tasks FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()))
    )
  )
  WITH CHECK (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Project participants can view milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Project owners can manage milestones" ON public.project_milestones;
CREATE POLICY "Project participants and department staff view milestones"
  ON public.project_milestones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id
        AND (
          p.owner_id = auth.uid()
          OR public.is_project_member(p.id, auth.uid())
          OR public.get_auth_user_role() = 'ADMIN'
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND p.department_id = public.get_auth_user_department_id())
        )
    )
  );
CREATE POLICY "Project owners and members manage milestones"
  ON public.project_milestones FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()))
    )
  )
  WITH CHECK (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Project participants can view files" ON public.project_files;
DROP POLICY IF EXISTS "Project owners can manage files" ON public.project_files;
CREATE POLICY "Project participants and department staff view project files"
  ON public.project_files FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id
        AND (
          p.owner_id = auth.uid()
          OR public.is_project_member(p.id, auth.uid())
          OR public.get_auth_user_role() = 'ADMIN'
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND p.department_id = public.get_auth_user_department_id())
        )
    )
  );
CREATE POLICY "Project owners and members manage project files"
  ON public.project_files FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()))
    )
  )
  WITH CHECK (
    public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can view student documents" ON storage.objects;
CREATE POLICY "Owners HOD department and Admin view student documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND public.is_active_auth_user()
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_auth_user_role() = 'ADMIN'
      OR (
        public.get_auth_user_role() = 'HOD'
        AND (
          EXISTS (
            SELECT 1 FROM public.leave_requests lr
            WHERE lr.supporting_doc_path = storage.objects.name
              AND lr.department_id = public.get_auth_user_department_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.student_service_requests sr
            WHERE sr.attachment_path = storage.objects.name
              AND sr.department_id = public.get_auth_user_department_id()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Students can upload own documents" ON storage.objects;
CREATE POLICY "Active students upload own documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-documents'
    AND public.is_active_auth_user()
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'STUDENT' AND p.account_status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete project files" ON storage.objects;
CREATE POLICY "Project participants and department staff view project objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.is_active_auth_user()
    AND EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.owner_id = auth.uid()
          OR public.is_project_member(p.id, auth.uid())
          OR public.get_auth_user_role() = 'ADMIN'
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND p.department_id = public.get_auth_user_department_id())
        )
    )
  );
CREATE POLICY "Project participants upload own project objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND public.is_active_auth_user()
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()) OR public.get_auth_user_role() = 'ADMIN')
    )
  );
CREATE POLICY "Project participants update own project objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.is_active_auth_user()
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()) OR public.get_auth_user_role() = 'ADMIN')
    )
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND public.is_active_auth_user()
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
CREATE POLICY "Project participants delete own project objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.is_active_auth_user()
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR public.get_auth_user_role() = 'ADMIN'
    )
    AND EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (p.owner_id = auth.uid() OR public.is_project_member(p.id, auth.uid()) OR public.get_auth_user_role() = 'ADMIN')
    )
  );