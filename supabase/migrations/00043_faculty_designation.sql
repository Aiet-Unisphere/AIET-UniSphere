-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00043: DYNAMIC FACULTY DESIGNATION
-- ============================================================
-- Adds dynamic academic designation to public.profiles.
-- Supports:
-- 1. Persistent storage of official institutional titles (e.g. Professor & HOD,
--    Associate Professor, Assistant Professor, Lecturer).
-- 2. Clean fallback to NULL for existing student/admin/unassigned records.
-- 3. Idempotent forward-only execution.
-- ============================================================

DO $$
BEGIN
  -- 1. Add designation column to public.profiles if not already present
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'designation'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN designation TEXT;
  END IF;
END $$;

-- 2. Document column purpose
COMMENT ON COLUMN public.profiles.designation IS 
  'Academic designation / institutional faculty title (e.g., Professor & HOD, Associate Professor, Assistant Professor). Nullable; default fallback handled in presentation layer.';

