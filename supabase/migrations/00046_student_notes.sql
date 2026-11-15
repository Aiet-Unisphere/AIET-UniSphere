-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00046: STUDENT NOTES
-- ============================================================

-- 1. CREATE STUDENT NOTES TABLE
CREATE TABLE IF NOT EXISTS public.student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_student_notes_student_id ON public.student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_updated_at ON public.student_notes(student_id, updated_at DESC);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES — STRICT STUDENT ISOLATION

-- Select policy: Authenticated students can read only their own notes
DROP POLICY IF EXISTS "Students can read own notes" ON public.student_notes;
CREATE POLICY "Students can read own notes"
  ON public.student_notes
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- Insert policy: Authenticated students can create notes only for themselves
DROP POLICY IF EXISTS "Students can create own notes" ON public.student_notes;
CREATE POLICY "Students can create own notes"
  ON public.student_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Update policy: Authenticated students can update only their own notes
DROP POLICY IF EXISTS "Students can update own notes" ON public.student_notes;
CREATE POLICY "Students can update own notes"
  ON public.student_notes
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Delete policy: Authenticated students can delete only their own notes
DROP POLICY IF EXISTS "Students can delete own notes" ON public.student_notes;
CREATE POLICY "Students can delete own notes"
  ON public.student_notes
  FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

-- 5. AUTOMATIC UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.set_student_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_notes_updated_at ON public.student_notes;
CREATE TRIGGER trg_student_notes_updated_at
  BEFORE UPDATE ON public.student_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_student_notes_updated_at();

