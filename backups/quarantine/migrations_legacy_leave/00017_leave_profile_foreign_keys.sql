-- AIET-UNISPHERE - MIGRATION 00017: LEAVE PROFILE RELATIONSHIPS
-- Keep leave relationships addressable through the current public profile model.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'leave_requests_hod_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'leave_requests'
  ) THEN
    ALTER TABLE public.leave_requests DROP CONSTRAINT leave_requests_hod_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'leave_requests_reviewed_by_fkey'
      AND table_schema = 'public'
      AND table_name = 'leave_requests'
  ) THEN
    ALTER TABLE public.leave_requests DROP CONSTRAINT leave_requests_reviewed_by_fkey;
  END IF;

  ALTER TABLE public.leave_requests
    ADD CONSTRAINT leave_requests_hod_id_fkey
      FOREIGN KEY (hod_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT leave_requests_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
END $$;
