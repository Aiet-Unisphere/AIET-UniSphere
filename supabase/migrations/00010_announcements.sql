-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00010: ANNOUNCEMENTS SYSTEM
-- ============================================================

-- 1. Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Academic', 'Exam', 'Event', 'General')),
  content TEXT NOT NULL,
  target_audience TEXT NOT NULL CHECK (target_audience IN ('Students', 'Faculty', 'Students + Faculty')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_announcements_department ON public.announcements(department_id);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.announcements(target_audience);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- RLS policies for announcements
DROP POLICY IF EXISTS "Users can view announcements of their department" ON public.announcements;
CREATE POLICY "Users can view announcements of their department"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    -- HOD can view all department announcements (both drafts and published)
    (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
    -- Admin can view all
    OR public.get_auth_user_role() = 'ADMIN'
    -- Students and Faculty can only view published announcements targeted at them in their department
    OR (
      status = 'PUBLISHED'
      AND department_id = public.get_auth_user_department_id()
      AND (
        (public.get_auth_user_role() = 'STUDENT' AND target_audience IN ('Students', 'Students + Faculty'))
        OR (public.get_auth_user_role() = 'FACULTY' AND target_audience IN ('Faculty', 'Students + Faculty'))
      )
    )
  );

DROP POLICY IF EXISTS "HOD can manage announcements of their department" ON public.announcements;
CREATE POLICY "HOD can manage announcements of their department"
  ON public.announcements FOR ALL
  TO authenticated
  USING (
    public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id()
  )
  WITH CHECK (
    public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id()
  );

DROP POLICY IF EXISTS "Admin can manage all announcements" ON public.announcements;
CREATE POLICY "Admin can manage all announcements"
  ON public.announcements FOR ALL
  TO authenticated
  USING (public.get_auth_user_role() = 'ADMIN')
  WITH CHECK (public.get_auth_user_role() = 'ADMIN');


-- 2. Create announcement_reads table
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

-- Index for fast reads checking
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON public.announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_map ON public.announcement_reads(announcement_id, user_id);

-- Enable RLS
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- RLS policies for announcement_reads
DROP POLICY IF EXISTS "Users can view own read records" ON public.announcement_reads;
CREATE POLICY "Users can view own read records"
  ON public.announcement_reads FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own read records" ON public.announcement_reads;
CREATE POLICY "Users can insert own read records"
  ON public.announcement_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
