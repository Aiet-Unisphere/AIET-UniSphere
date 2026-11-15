-- ============================================================
-- AIET-UNISPHERE - MIGRATION 00015: LEAVE ATTACHMENT METADATA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leave_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_attachments_request
  ON public.leave_attachments(leave_request_id);

CREATE INDEX IF NOT EXISTS idx_leave_attachments_student
  ON public.leave_attachments(student_id);

ALTER TABLE public.leave_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can manage own leave attachment metadata" ON public.leave_attachments;
CREATE POLICY "Students can manage own leave attachment metadata"
  ON public.leave_attachments FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.leave_requests lr
      WHERE lr.id = leave_attachments.leave_request_id
        AND lr.student_id = auth.uid()
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
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE lr.id = leave_attachments.leave_request_id
        AND p.role = 'HOD'
        AND p.account_status = 'ACTIVE'
        AND p.department_id = lr.department_id
    )
  );

DROP POLICY IF EXISTS "Admins can read leave attachment metadata" ON public.leave_attachments;
CREATE POLICY "Admins can read leave attachment metadata"
  ON public.leave_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.account_status = 'ACTIVE'
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('leave-attachments', 'leave-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Students can upload own leave attachments" ON storage.objects;
CREATE POLICY "Students can upload own leave attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'leave-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
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
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE la.storage_path = storage.objects.name
          AND (
            (p.role = 'HOD' AND p.account_status = 'ACTIVE' AND p.department_id = lr.department_id)
            OR (p.role = 'ADMIN' AND p.account_status = 'ACTIVE')
          )
      )
    )
  );

DROP POLICY IF EXISTS "Students can delete own leave attachments" ON storage.objects;
CREATE POLICY "Students can delete own leave attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'leave-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Attendance claims may use past dates; all other leave types remain future/today only.
CREATE OR REPLACE FUNCTION public.validate_leave_date_constraints()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end date cannot be before the start date.';
  END IF;

  IF NEW.leave_type NOT ILIKE '%attendance%'
     AND NEW.start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Leave start date cannot be in the past.';
  END IF;

  RETURN NEW;
END;
$$;
