-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00013: DEPARTMENT SEAL + LEAVE PDF STORAGE
-- ============================================================

-- 1) Add seal_url to departments
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS seal_url TEXT;

-- 2) Add pdf_url and verification_id to leave_requests
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_id TEXT;

-- 3) Make verification_id unique so QR verification points to single record
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_requests_verification_id ON public.leave_requests (verification_id);

-- 4) Notes: Create two storage buckets in Supabase Storage
--    - department-seals (public read ok): store department seals under {department_id}/{filename}
--    - leave-pdfs (private): store generated approved PDF files under {department_id}/{leave_request_id}.pdf
--    Apply storage policies so only HOD/admin can upload to department-seals and only server-side functions / allowed roles can write to leave-pdfs.

-- 5) Add index to speed PDF lookups
CREATE INDEX IF NOT EXISTS idx_leave_requests_pdf_url ON public.leave_requests (pdf_url);

-- 6) No RLS changes required here; seal_url is reference metadata. Ensure any public read of seals is acceptable for your institution.
