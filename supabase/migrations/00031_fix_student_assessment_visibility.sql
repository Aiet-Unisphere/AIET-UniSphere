-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00031: FIX STUDENT ASSESSMENT VISIBILITY RLS & RPC
-- ============================================================

-- 1. Update SELECT RLS Policy on public.assessments for Student Department & Course Visibility
DROP POLICY IF EXISTS "Users can view authorized published assessments" ON public.assessments;
DROP POLICY IF EXISTS "Users can view assessments of their department" ON public.assessments;

CREATE POLICY "Users can view authorized published assessments"
  ON public.assessments FOR SELECT TO authenticated
  USING (
    public.is_active_auth_user()
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR (
        public.get_auth_user_role() = 'HOD'
        AND department_id = public.get_auth_user_department_id()
      )
      OR created_by = auth.uid()
      OR (
        public.get_auth_user_role() = 'STUDENT'
        AND department_id = public.get_auth_user_department_id()
        AND status IN ('Upcoming', 'Active', 'Closed', 'Completed')
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.course_enrollments ce
            WHERE ce.student_id = auth.uid() AND ce.status = 'Active'
          )
          OR EXISTS (
            SELECT 1 FROM public.course_enrollments ce
            WHERE ce.student_id = auth.uid()
              AND ce.status = 'Active'
              AND (
                LOWER(ce.course_id) = LOWER(assessments.course_id)
                OR LOWER(ce.course_code) = LOWER(assessments.course_code)
                OR LOWER(ce.course_id) = LOWER(assessments.course_code)
                OR LOWER(ce.course_code) = LOWER(assessments.course_id)
              )
          )
        )
      )
    )
  );

-- 2. Update start_assessment_attempt RPC with matching robust course enrollment & timing checks
CREATE OR REPLACE FUNCTION public.start_assessment_attempt(p_assessment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid();
  v_assessment RECORD;
  v_attempt RECORD;
BEGIN
  IF v_student_id IS NULL OR NOT public.is_active_auth_user() OR public.get_auth_user_role() <> 'STUDENT' THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;

  SELECT id, course_id, course_code, department_id, status, available_from, deadline, duration_minutes, assessment_date
  INTO v_assessment
  FROM public.assessments
  WHERE id = p_assessment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found.';
  END IF;

  IF v_assessment.status NOT IN ('Upcoming', 'Active') THEN
    RAISE EXCEPTION 'Assessment is not open for attempts.';
  END IF;

  IF v_assessment.available_from IS NOT NULL AND NOW() < v_assessment.available_from THEN
    RAISE EXCEPTION 'Assessment is not available yet.';
  END IF;

  IF v_assessment.deadline IS NOT NULL AND NOW() > v_assessment.deadline THEN
    RAISE EXCEPTION 'Assessment deadline has passed.';
  END IF;

  IF v_assessment.department_id <> public.get_auth_user_department_id() THEN
    RAISE EXCEPTION 'Student is not authorized for this department assessment.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.course_enrollments ce WHERE ce.student_id = v_student_id AND ce.status = 'Active') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.student_id = v_student_id
        AND ce.status = 'Active'
        AND (
          LOWER(ce.course_id) = LOWER(v_assessment.course_id)
          OR LOWER(ce.course_code) = LOWER(v_assessment.course_code)
          OR LOWER(ce.course_id) = LOWER(v_assessment.course_code)
          OR LOWER(ce.course_code) = LOWER(v_assessment.course_id)
        )
    ) THEN
      RAISE EXCEPTION 'Student is not enrolled in this assessment course.';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.assessment_questions q WHERE q.assessment_id = p_assessment_id) THEN
    RAISE EXCEPTION 'Assessment has no questions.';
  END IF;

  SELECT id, started_at, status INTO v_attempt
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id AND student_id = v_student_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_attempt.status IN ('Submitted', 'Graded') THEN
      RAISE EXCEPTION 'Assessment has already been submitted.';
    END IF;

    RETURN jsonb_build_object(
      'attempt_id', v_attempt.id,
      'started_at', v_attempt.started_at,
      'duration_minutes', COALESCE(v_assessment.duration_minutes, 60),
      'reused', true
    );
  END IF;

  INSERT INTO public.assessment_attempts (
    assessment_id,
    student_id,
    started_at,
    status
  ) VALUES (
    p_assessment_id,
    v_student_id,
    NOW(),
    'In Progress'
  )
  RETURNING id, started_at INTO v_attempt;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'started_at', v_attempt.started_at,
    'duration_minutes', COALESCE(v_assessment.duration_minutes, 60),
    'reused', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_assessment_attempt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_assessment_attempt(UUID) TO authenticated;
