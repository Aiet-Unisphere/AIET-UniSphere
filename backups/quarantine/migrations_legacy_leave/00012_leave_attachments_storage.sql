-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00012: LEAVE ATTACHMENTS STORAGE + COLUMN
-- ============================================================

-- 1) Add attachment_urls text[] column to leave_requests
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[];

-- 2) NOTE: Supabase Storage bucket creation is performed via the Supabase UI or Management API.
--    Please create a private bucket named `leave-attachments` in your Supabase project.
--    Recommended path convention: {student_id}/{leave_request_id}/{filename}

-- 3) Recommended storage RLS policy (example using Supabase storage policies):
--    -- Allow students to upload/read only files under their own user id prefix
--    -- The storage RLS policies must be applied via Supabase dashboard or Management API. Example policy:
--    -- CREATE POLICY "Students can manage own leave attachments"
--    --   ON storage.objects FOR ALL
--    --   TO authenticated
--    --   USING (
--    --     bucket_id = 'leave-attachments' AND (
--    --       (auth.uid() IS NOT NULL AND split_part(name, '/', 1) = auth.uid())
--    --       OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'HOD' /* additional dept checks in app logic */)
--    --     )
--    --   );

-- 4) Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_leave_requests_attachment_urls ON public.leave_requests USING GIN (attachment_urls);
