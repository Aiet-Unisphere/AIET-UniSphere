-- AIET-UNISPHERE - MIGRATION 00016: CURRENT HOD LEAVE ACCESS
-- Keep leave visibility and attachment access aligned with the current HOD mapping.

DROP POLICY IF EXISTS "Users can read relevant leave requests" ON public.leave_requests;
CREATE POLICY "Users can read relevant leave requests"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.account_status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1
      FROM public.get_department_hod(leave_requests.department_id) current_hod
      WHERE current_hod.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "HODs can approve or reject leave requests" ON public.leave_requests;
CREATE POLICY "HODs can approve or reject leave requests"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.account_status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1
      FROM public.get_department_hod(leave_requests.department_id) current_hod
      WHERE current_hod.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.account_status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1
      FROM public.get_department_hod(leave_requests.department_id) current_hod
      WHERE current_hod.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "HODs can read department attachment metadata" ON public.leave_attachments;
CREATE POLICY "HODs can read department attachment metadata"
  ON public.leave_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leave_requests lr
      JOIN public.get_department_hod(lr.department_id) current_hod
        ON current_hod.id = auth.uid()
      WHERE lr.id = leave_attachments.leave_request_id
    )
  );

DROP POLICY IF EXISTS "Users can read authorized leave attachments" ON storage.objects;
CREATE POLICY "Users can read authorized leave attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'leave-attachments'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.leave_attachments la
        JOIN public.leave_requests lr ON lr.id = la.leave_request_id
        JOIN public.get_department_hod(lr.department_id) current_hod
          ON current_hod.id = auth.uid()
        WHERE la.storage_path = storage.objects.name
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'ADMIN'
          AND p.account_status = 'ACTIVE'
      )
    )
  );
