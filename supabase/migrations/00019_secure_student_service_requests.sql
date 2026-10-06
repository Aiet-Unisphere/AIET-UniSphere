CREATE OR REPLACE FUNCTION public.is_active_auth_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.account_status = 'ACTIVE'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_auth_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_auth_user() TO authenticated, service_role;

DROP POLICY IF EXISTS "Students can view and manage own service requests" ON public.student_service_requests;
DROP POLICY IF EXISTS "HOD and Admin can review department service requests" ON public.student_service_requests;
DROP POLICY IF EXISTS "HOD and Admin can update department service requests" ON public.student_service_requests;

CREATE POLICY "Students and authorized staff can view service requests"
  ON public.student_service_requests FOR SELECT
  TO authenticated
  USING (
    public.is_active_auth_user()
    AND (
      student_id = auth.uid()
      OR public.get_auth_user_role() = 'ADMIN'
      OR (
        public.get_auth_user_role() = 'HOD'
        AND department_id = public.get_auth_user_department_id()
      )
    )
  );

CREATE POLICY "Active students can submit own service requests"
  ON public.student_service_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'Pending'
    AND department_id = public.get_auth_user_department_id()
    AND public.get_auth_user_role() = 'STUDENT'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.account_status = 'ACTIVE'
        AND p.department_id = student_service_requests.department_id
    )
    AND EXISTS (
      SELECT 1 FROM public.service_catalog sc
      WHERE sc.id::text = student_service_requests.service_type_id
        AND sc.is_active = TRUE
    )
  );

CREATE POLICY "HOD and Admin can review service requests"
  ON public.student_service_requests FOR UPDATE
  TO authenticated
  USING (
    public.is_active_auth_user()
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR (
        public.get_auth_user_role() = 'HOD'
        AND department_id = public.get_auth_user_department_id()
      )
    )
  )
  WITH CHECK (
    public.is_active_auth_user()
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR (
        public.get_auth_user_role() = 'HOD'
        AND department_id = public.get_auth_user_department_id()
      )
    )
  );

CREATE POLICY "Admin can delete service requests"
  ON public.student_service_requests FOR DELETE
  TO authenticated
  USING (public.is_active_auth_user() AND public.get_auth_user_role() = 'ADMIN');