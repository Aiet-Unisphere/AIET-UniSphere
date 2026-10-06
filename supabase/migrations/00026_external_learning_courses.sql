-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00026: EXTERNAL LEARNING & COURSE TRACKING MODULE
-- ============================================================

-- 1. TABLE: external_learning_courses
-- Represents external courses (Coursera, NPTEL, edX, Udemy, SWAYAM, etc.)
CREATE TABLE IF NOT EXISTS public.external_learning_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  provider_name TEXT,
  external_url TEXT NOT NULL,
  description TEXT,
  course_code TEXT,
  category TEXT,
  difficulty TEXT CHECK (difficulty IS NULL OR difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  estimated_hours NUMERIC CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_external_course_title_not_empty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT check_external_course_platform_not_empty CHECK (char_length(trim(platform)) > 0),
  CONSTRAINT check_external_course_url_not_empty CHECK (char_length(trim(external_url)) > 0)
);

-- Indexes for external_learning_courses
CREATE INDEX IF NOT EXISTS idx_ext_courses_created_by ON public.external_learning_courses(created_by);
CREATE INDEX IF NOT EXISTS idx_ext_courses_platform ON public.external_learning_courses(platform);
CREATE INDEX IF NOT EXISTS idx_ext_courses_is_active ON public.external_learning_courses(is_active);

-- Enable RLS
ALTER TABLE public.external_learning_courses ENABLE ROW LEVEL SECURITY;


-- 2. TABLE: external_course_assignments
-- Represents cohort/department assignments of external courses created by Faculty or HOD
CREATE TABLE IF NOT EXISTS public.external_course_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_course_id UUID NOT NULL REFERENCES public.external_learning_courses(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  department_id UUID NOT NULL REFERENCES public.departments(id),
  academic_course_id TEXT, -- Optional linkage to VTU academic course code (e.g. 22CSD71)
  semester INTEGER CHECK (semester IS NULL OR semester > 0),
  section TEXT,
  academic_year TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deadline TIMESTAMPTZ,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_assignment_deadline_after_assigned CHECK (deadline IS NULL OR deadline >= assigned_date::timestamptz)
);

-- Indexes for external_course_assignments
CREATE INDEX IF NOT EXISTS idx_ext_assign_course_id ON public.external_course_assignments(external_course_id);
CREATE INDEX IF NOT EXISTS idx_ext_assign_assigned_by ON public.external_course_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_ext_assign_dept_id ON public.external_course_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_ext_assign_academic_course ON public.external_course_assignments(academic_course_id);
CREATE INDEX IF NOT EXISTS idx_ext_assign_deadline ON public.external_course_assignments(deadline);
CREATE INDEX IF NOT EXISTS idx_ext_assign_status ON public.external_course_assignments(status);
CREATE INDEX IF NOT EXISTS idx_ext_assign_dept_sem_sec ON public.external_course_assignments(department_id, semester, section);

-- Enable RLS
ALTER TABLE public.external_course_assignments ENABLE ROW LEVEL SECURITY;


-- 3. TABLE: external_course_enrollments
-- Represents student assignment/enrollment into an external course assignment
CREATE TABLE IF NOT EXISTS public.external_course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.external_course_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_ext_enrollment_student UNIQUE (assignment_id, student_id)
);

-- Indexes for external_course_enrollments
CREATE INDEX IF NOT EXISTS idx_ext_enrollments_assignment ON public.external_course_enrollments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_ext_enrollments_student ON public.external_course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_ext_enrollments_status ON public.external_course_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_ext_enrollments_assign_student ON public.external_course_enrollments(assignment_id, student_id);

-- Enable RLS
ALTER TABLE public.external_course_enrollments ENABLE ROW LEVEL SECURITY;


-- 4. TABLE: external_course_progress
-- Stores progress snapshots separately from enrollment (1 row per enrollment)
CREATE TABLE IF NOT EXISTS public.external_course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.external_course_enrollments(id) ON DELETE CASCADE,
  progress_percent NUMERIC NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  completed_modules INTEGER CHECK (completed_modules IS NULL OR completed_modules >= 0),
  total_modules INTEGER CHECK (total_modules IS NULL OR total_modules >= 0),
  completed_quizzes INTEGER CHECK (completed_quizzes IS NULL OR completed_quizzes >= 0),
  total_quizzes INTEGER CHECK (total_quizzes IS NULL OR total_quizzes >= 0),
  completed_assignments INTEGER CHECK (completed_assignments IS NULL OR completed_assignments >= 0),
  total_assignments INTEGER CHECK (total_assignments IS NULL OR total_assignments >= 0),
  last_activity_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'SELF_REPORTED' CHECK (source IN ('SELF_REPORTED', 'FACULTY_UPDATED', 'VERIFIED', 'EXTERNAL_API')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_ext_progress_enrollment UNIQUE (enrollment_id),
  CONSTRAINT check_ext_progress_modules CHECK (completed_modules IS NULL OR total_modules IS NULL OR completed_modules <= total_modules),
  CONSTRAINT check_ext_progress_quizzes CHECK (completed_quizzes IS NULL OR total_quizzes IS NULL OR completed_quizzes <= total_quizzes),
  CONSTRAINT check_ext_progress_assignments CHECK (completed_assignments IS NULL OR total_assignments IS NULL OR completed_assignments <= total_assignments)
);

-- Index for external_course_progress
CREATE INDEX IF NOT EXISTS idx_ext_progress_enrollment ON public.external_course_progress(enrollment_id);

-- Enable RLS
ALTER TABLE public.external_course_progress ENABLE ROW LEVEL SECURITY;


-- 5. TABLE: external_course_evidence
-- Stores completion evidence submitted by students for verification
CREATE TABLE IF NOT EXISTS public.external_course_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.external_course_enrollments(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('CERTIFICATE', 'CREDENTIAL_URL', 'CREDENTIAL_ID', 'OTHER')),
  certificate_storage_path TEXT,
  credential_url TEXT,
  credential_id TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_ext_evidence_has_source CHECK (
    certificate_storage_path IS NOT NULL OR credential_url IS NOT NULL OR credential_id IS NOT NULL
  )
);

-- Indexes for external_course_evidence
CREATE INDEX IF NOT EXISTS idx_ext_evidence_enrollment ON public.external_course_evidence(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_ext_evidence_verification ON public.external_course_evidence(verification_status);
CREATE INDEX IF NOT EXISTS idx_ext_evidence_verified_by ON public.external_course_evidence(verified_by);

-- Enable RLS
ALTER TABLE public.external_course_evidence ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- AUTOMATIC UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_external_learning_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all five tables
DROP TRIGGER IF EXISTS trg_ext_courses_updated_at ON public.external_learning_courses;
CREATE TRIGGER trg_ext_courses_updated_at
  BEFORE UPDATE ON public.external_learning_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_external_learning_updated_at();

DROP TRIGGER IF EXISTS trg_ext_assign_updated_at ON public.external_course_assignments;
CREATE TRIGGER trg_ext_assign_updated_at
  BEFORE UPDATE ON public.external_course_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_external_learning_updated_at();

DROP TRIGGER IF EXISTS trg_ext_enrollments_updated_at ON public.external_course_enrollments;
CREATE TRIGGER trg_ext_enrollments_updated_at
  BEFORE UPDATE ON public.external_course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_external_learning_updated_at();

DROP TRIGGER IF EXISTS trg_ext_progress_updated_at ON public.external_course_progress;
CREATE TRIGGER trg_ext_progress_updated_at
  BEFORE UPDATE ON public.external_course_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_external_learning_updated_at();

DROP TRIGGER IF EXISTS trg_ext_evidence_updated_at ON public.external_course_evidence;
CREATE TRIGGER trg_ext_evidence_updated_at
  BEFORE UPDATE ON public.external_course_evidence
  FOR EACH ROW EXECUTE FUNCTION public.set_external_learning_updated_at();


-- ============================================================
-- RLS POLICIES FOR ALL 5 TABLES
-- ============================================================

-- ------------------------------------------------------------
-- POLICIES FOR external_learning_courses
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read active or accessible external courses" ON public.external_learning_courses;
CREATE POLICY "Users can read active or accessible external courses"
  ON public.external_learning_courses FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR created_by = auth.uid()
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );

DROP POLICY IF EXISTS "Faculty, HOD, and Admin can create external courses" ON public.external_learning_courses;
CREATE POLICY "Faculty, HOD, and Admin can create external courses"
  ON public.external_learning_courses FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );

DROP POLICY IF EXISTS "Creator or Admin can update external courses" ON public.external_learning_courses;
CREATE POLICY "Creator or Admin can update external courses"
  ON public.external_learning_courses FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
  );


-- ------------------------------------------------------------
-- POLICIES FOR external_course_assignments
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read relevant external course assignments" ON public.external_course_assignments;
CREATE POLICY "Users can read relevant external course assignments"
  ON public.external_course_assignments FOR SELECT
  TO authenticated
  USING (
    assigned_by = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
    OR (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
    OR (public.get_auth_user_role() = 'FACULTY' AND department_id = public.get_auth_user_department_id())
    OR (
      public.get_auth_user_role() = 'STUDENT'
      AND department_id = public.get_auth_user_department_id()
      AND status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "Faculty, HOD, and Admin can create external assignments" ON public.external_course_assignments;
CREATE POLICY "Faculty, HOD, and Admin can create external assignments"
  ON public.external_course_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND department_id = public.get_auth_user_department_id())
    )
  );

DROP POLICY IF EXISTS "Assigner, HOD, or Admin can update external assignments" ON public.external_course_assignments;
CREATE POLICY "Assigner, HOD, or Admin can update external assignments"
  ON public.external_course_assignments FOR UPDATE
  TO authenticated
  USING (
    assigned_by = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
    OR (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
  );


-- ------------------------------------------------------------
-- POLICIES FOR external_course_enrollments
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read authorized external enrollments" ON public.external_course_enrollments;
CREATE POLICY "Users can read authorized external enrollments"
  ON public.external_course_enrollments FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.external_course_assignments a
      WHERE a.id = public.external_course_enrollments.assignment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
        )
    )
  );

DROP POLICY IF EXISTS "Faculty, HOD, Admin, or Student can create enrollments" ON public.external_course_enrollments;
CREATE POLICY "Faculty, HOD, Admin, or Student can create enrollments"
  ON public.external_course_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Students self-enrolling into an active department assignment
    (
      student_id = auth.uid()
      AND public.get_auth_user_role() = 'STUDENT'
      AND EXISTS (
        SELECT 1 FROM public.external_course_assignments a
        WHERE a.id = assignment_id
          AND a.department_id = public.get_auth_user_department_id()
          AND a.status = 'ACTIVE'
      )
    )
    -- Faculty/HOD/Admin creating student enrollments
    OR EXISTS (
      SELECT 1 FROM public.external_course_assignments a
      WHERE a.id = assignment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

DROP POLICY IF EXISTS "Students can update own enrollment status; Staff can manage enrollments" ON public.external_course_enrollments;
CREATE POLICY "Students can update own enrollment status; Staff can manage enrollments"
  ON public.external_course_enrollments FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.external_course_assignments a
      WHERE a.id = public.external_course_enrollments.assignment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
        )
    )
  );


-- ------------------------------------------------------------
-- POLICIES FOR external_course_progress
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read relevant external course progress" ON public.external_course_progress;
CREATE POLICY "Users can read relevant external course progress"
  ON public.external_course_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      WHERE e.id = public.external_course_progress.enrollment_id
        AND e.student_id = auth.uid()
    )
    OR public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      JOIN public.external_course_assignments a ON a.id = e.assignment_id
      WHERE e.id = public.external_course_progress.enrollment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
        )
    )
  );

DROP POLICY IF EXISTS "Students or Staff can insert progress" ON public.external_course_progress;
CREATE POLICY "Students or Staff can insert progress"
  ON public.external_course_progress FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      WHERE e.id = enrollment_id AND e.student_id = auth.uid()
    )
    OR public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      JOIN public.external_course_assignments a ON a.id = e.assignment_id
      WHERE e.id = enrollment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
        )
    )
  );

DROP POLICY IF EXISTS "Students or Staff can update progress" ON public.external_course_progress;
CREATE POLICY "Students or Staff can update progress"
  ON public.external_course_progress FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      WHERE e.id = public.external_course_progress.enrollment_id AND e.student_id = auth.uid()
    )
    OR public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      JOIN public.external_course_assignments a ON a.id = e.assignment_id
      WHERE e.id = public.external_course_progress.enrollment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
        )
    )
  );


-- ------------------------------------------------------------
-- POLICIES FOR external_course_evidence
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read authorized evidence" ON public.external_course_evidence;
CREATE POLICY "Users can read authorized evidence"
  ON public.external_course_evidence FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      WHERE e.id = public.external_course_evidence.enrollment_id
        AND e.student_id = auth.uid()
    )
    OR public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      JOIN public.external_course_assignments a ON a.id = e.assignment_id
      WHERE e.id = public.external_course_evidence.enrollment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
        )
    )
  );

DROP POLICY IF EXISTS "Students can submit own pending evidence" ON public.external_course_evidence;
CREATE POLICY "Students can submit own pending evidence"
  ON public.external_course_evidence FOR INSERT
  TO authenticated
  WITH CHECK (
    verification_status = 'PENDING'
    AND verified_by IS NULL
    AND verified_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      WHERE e.id = enrollment_id AND e.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can update own PENDING evidence; Staff can verify" ON public.external_course_evidence;
CREATE POLICY "Students can update own PENDING evidence; Staff can verify"
  ON public.external_course_evidence FOR UPDATE
  TO authenticated
  USING (
    (
      verification_status = 'PENDING'
      AND EXISTS (
        SELECT 1 FROM public.external_course_enrollments e
        WHERE e.id = public.external_course_evidence.enrollment_id AND e.student_id = auth.uid()
      )
    )
    OR public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.external_course_enrollments e
      JOIN public.external_course_assignments a ON a.id = e.assignment_id
      WHERE e.id = public.external_course_evidence.enrollment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
        )
    )
  );


-- ============================================================
-- VERIFICATION RPC FUNCTION (Faculty/HOD/Admin evidence approval)
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_external_course_evidence(
  p_evidence_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_dept_id UUID;
  v_evidence RECORD;
  v_assignment RECORD;
BEGIN
  v_role := public.get_auth_user_role();
  v_dept_id := public.get_auth_user_department_id();

  IF v_role NOT IN ('FACULTY', 'HOD', 'ADMIN') THEN
    RAISE EXCEPTION 'Only faculty, HOD, or admin can verify external learning evidence.';
  END IF;

  IF p_status NOT IN ('VERIFIED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid verification status. Must be VERIFIED or REJECTED.';
  END IF;

  SELECT ev.*, e.assignment_id, e.student_id
  INTO v_evidence
  FROM public.external_course_evidence ev
  JOIN public.external_course_enrollments e ON e.id = ev.enrollment_id
  WHERE ev.id = p_evidence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence record not found.';
  END IF;

  SELECT * INTO v_assignment
  FROM public.external_course_assignments
  WHERE id = v_evidence.assignment_id;

  IF v_role <> 'ADMIN' AND v_assignment.assigned_by <> auth.uid() AND v_assignment.department_id <> v_dept_id THEN
    RAISE EXCEPTION 'Not authorized to verify evidence for this assignment.';
  END IF;

  UPDATE public.external_course_evidence
  SET verification_status = p_status,
      verified_by = auth.uid(),
      verified_at = NOW(),
      verification_notes = COALESCE(p_notes, verification_notes),
      updated_at = NOW()
  WHERE id = p_evidence_id;

  IF p_status = 'VERIFIED' THEN
    UPDATE public.external_course_enrollments
    SET status = 'COMPLETED',
        completed_at = COALESCE(completed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_evidence.enrollment_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_external_course_evidence(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_external_course_evidence(UUID, TEXT, TEXT) TO authenticated, service_role;


-- ============================================================
-- STORAGE BUCKET & POLICIES (external-learning-evidence)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'external-learning-evidence',
  'external-learning-evidence',
  false,
  20971520, -- 20MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage RLS: Insert policy for students submitting evidence
DROP POLICY IF EXISTS "Students insert own external learning evidence" ON storage.objects;
CREATE POLICY "Students insert own external learning evidence"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'external-learning-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: Select policy for students and authorized staff
DROP POLICY IF EXISTS "Authorized users read external learning evidence" ON storage.objects;
CREATE POLICY "Authorized users read external learning evidence"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'external-learning-evidence'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
    )
  );
