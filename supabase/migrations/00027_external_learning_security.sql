-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00027: EXTERNAL LEARNING SECURITY HARDENING (PHASE 3A)
-- ============================================================

-- 1. SECURITY DEFINER RPC: create_external_course_assignment_with_enrollment
-- Performs server-side cohort resolution and student auto-enrollment strictly from trusted database records.
CREATE OR REPLACE FUNCTION public.create_external_course_assignment_with_enrollment(
  p_external_course_id UUID,
  p_department_id UUID,
  p_academic_course_id TEXT DEFAULT NULL,
  p_semester INTEGER DEFAULT NULL,
  p_section TEXT DEFAULT NULL,
  p_academic_year TEXT DEFAULT NULL,
  p_required BOOLEAN DEFAULT false,
  p_assigned_date DATE DEFAULT CURRENT_DATE,
  p_deadline TIMESTAMPTZ DEFAULT NULL,
  p_instructions TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_dept_id UUID;
  v_assignment_id UUID;
  v_assignment RECORD;
  v_enrolled_count INTEGER := 0;
BEGIN
  v_role := public.get_auth_user_role();
  v_dept_id := public.get_auth_user_department_id();

  IF v_role NOT IN ('FACULTY', 'HOD', 'ADMIN') THEN
    RAISE EXCEPTION '403 Forbidden: Only faculty, HOD, or admin accounts can create assignments.';
  END IF;

  -- Validate department scope for Faculty and HOD
  IF v_role <> 'ADMIN' AND (v_dept_id IS NULL OR v_dept_id <> p_department_id) THEN
    RAISE EXCEPTION '403 Forbidden: You are not authorized to create assignments outside your designated department scope.';
  END IF;

  -- Insert assignment record
  INSERT INTO public.external_course_assignments (
    external_course_id,
    assigned_by,
    department_id,
    academic_course_id,
    semester,
    section,
    academic_year,
    required,
    assigned_date,
    deadline,
    instructions,
    status
  ) VALUES (
    p_external_course_id,
    auth.uid(),
    p_department_id,
    p_academic_course_id,
    p_semester,
    p_section,
    p_academic_year,
    COALESCE(p_required, false),
    COALESCE(p_assigned_date, CURRENT_DATE),
    p_deadline,
    p_instructions,
    'ACTIVE'
  ) RETURNING id INTO v_assignment_id;

  -- Auto-enroll eligible students strictly from trusted public.profiles database records
  INSERT INTO public.external_course_enrollments (
    assignment_id,
    student_id,
    status
  )
  SELECT
    v_assignment_id,
    p.id,
    'ASSIGNED'
  FROM public.profiles p
  WHERE p.role = 'STUDENT'
    AND COALESCE(p.account_status, 'ACTIVE') = 'ACTIVE'
    AND p.department_id = p_department_id
    AND (p_semester IS NULL OR p.semester = p_semester)
    AND (p_section IS NULL OR p_section = '' OR p.section = p_section)
  ON CONFLICT (assignment_id, student_id) DO NOTHING;

  GET DIAGNOSTICS v_enrolled_count = ROW_COUNT;

  SELECT * INTO v_assignment
  FROM public.external_course_assignments
  WHERE id = v_assignment_id;

  RETURN jsonb_build_object(
    'success', true,
    'assignment', row_to_json(v_assignment),
    'enrolled_count', v_enrolled_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_external_course_assignment_with_enrollment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_external_course_assignment_with_enrollment TO authenticated, service_role;


-- 2. HARDENED EVIDENCE VERIFICATION RPC: verify_external_course_evidence
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
    RAISE EXCEPTION '403 Forbidden: Only faculty, HOD, or admin can verify external learning evidence.';
  END IF;

  IF p_status NOT IN ('VERIFIED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid verification status. Must be VERIFIED or REJECTED.';
  END IF;

  IF p_status = 'REJECTED' AND (p_notes IS NULL OR trim(p_notes) = '') THEN
    RAISE EXCEPTION 'A verification note explaining the rejection reason is required.';
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
    RAISE EXCEPTION '403 Forbidden: Not authorized to verify evidence for another faculty/department assignment.';
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


-- 3. RLS POLICY HARDENING: external_course_enrollments
-- Prevent students from directly updating status to COMPLETED or CANCELLED
DROP POLICY IF EXISTS "Students can update own enrollment status; Staff can manage enrollments" ON public.external_course_enrollments;
CREATE POLICY "Students can update own enrollment status; Staff can manage enrollments"
  ON public.external_course_enrollments FOR UPDATE
  TO authenticated
  USING (
    (
      student_id = auth.uid()
      AND public.get_auth_user_role() = 'STUDENT'
    )
    OR public.get_auth_user_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.external_course_assignments a
      WHERE a.id = public.external_course_enrollments.assignment_id
        AND (
          a.assigned_by = auth.uid()
          OR (public.get_auth_user_role() IN ('FACULTY', 'HOD') AND a.department_id = public.get_auth_user_department_id())
        )
    )
  )
  WITH CHECK (
    (
      student_id = auth.uid()
      AND public.get_auth_user_role() = 'STUDENT'
      AND status IN ('ASSIGNED', 'IN_PROGRESS')
    )
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


-- 4. RLS POLICY HARDENING: external_course_progress
-- Prevent students from forging progress source to FACULTY_UPDATED or VERIFIED
DROP POLICY IF EXISTS "Students or Staff can insert progress" ON public.external_course_progress;
CREATE POLICY "Students or Staff can insert progress"
  ON public.external_course_progress FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      source = 'SELF_REPORTED'
      AND EXISTS (
        SELECT 1 FROM public.external_course_enrollments e
        WHERE e.id = enrollment_id AND e.student_id = auth.uid()
      )
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
  )
  WITH CHECK (
    (
      source = 'SELF_REPORTED'
      AND EXISTS (
        SELECT 1 FROM public.external_course_enrollments e
        WHERE e.id = public.external_course_progress.enrollment_id AND e.student_id = auth.uid()
      )
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


-- 5. STORAGE SECURITY HARDENING: external-learning-evidence
-- Prevent cross-department faculty/HOD from reading private evidence certificates
DROP POLICY IF EXISTS "Authorized users read external learning evidence" ON storage.objects;
CREATE POLICY "Authorized users read external learning evidence"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'external-learning-evidence'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_auth_user_role() = 'ADMIN'
      OR (
        public.get_auth_user_role() IN ('FACULTY', 'HOD')
        AND EXISTS (
          SELECT 1 FROM public.external_course_evidence ev
          JOIN public.external_course_enrollments e ON e.id = ev.enrollment_id
          JOIN public.external_course_assignments a ON a.id = e.assignment_id
          WHERE ev.certificate_storage_path = name
            AND (
              a.assigned_by = auth.uid()
              OR a.department_id = public.get_auth_user_department_id()
            )
        )
      )
    )
  );
