-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00028: ASSESSMENT TIMING & MCQ ENHANCEMENTS
-- ============================================================

-- 1. Add available_from and deadline TIMESTAMPTZ columns to public.assessments
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS available_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

-- Backfill available_from and deadline if null
UPDATE public.assessments
SET
  available_from = COALESCE(available_from, (assessment_date || ' 10:00:00')::timestamptz),
  deadline = COALESCE(deadline, ((COALESCE(due_date, assessment_date)) || ' 23:59:59')::timestamptz)
WHERE available_from IS NULL OR deadline IS NULL;

-- 2. Update RLS policy for students to view published assessments
DROP POLICY IF EXISTS "Users can view authorized published assessments" ON public.assessments;
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
        AND EXISTS (
          SELECT 1 FROM public.course_enrollments ce
          WHERE ce.course_id = assessments.course_id
            AND ce.student_id = auth.uid()
            AND ce.status = 'Active'
        )
      )
    )
  );

-- 3. Update start_assessment_attempt RPC to check available_from and deadline
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

  SELECT id, course_id, department_id, status, available_from, deadline, duration_minutes, assessment_date
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

  IF v_assessment.department_id <> public.get_auth_user_department_id()
    OR NOT EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.course_id = v_assessment.course_id
        AND ce.student_id = v_student_id
        AND ce.status = 'Active'
    ) THEN
    RAISE EXCEPTION 'Student is not enrolled in this assessment course.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.assessment_questions q WHERE q.assessment_id = p_assessment_id) THEN
    RAISE EXCEPTION 'Assessment has no questions.';
  END IF;

  SELECT id, started_at, status INTO v_attempt
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id AND student_id = v_student_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_attempt.status <> 'In Progress' THEN
      RAISE EXCEPTION 'Assessment attempt is already submitted.';
    END IF;
  ELSE
    INSERT INTO public.assessment_attempts (assessment_id, student_id, status)
    VALUES (p_assessment_id, v_student_id, 'In Progress')
    RETURNING id, started_at, status INTO v_attempt;
  END IF;

  -- Update status to Active if currently Upcoming
  IF v_assessment.status = 'Upcoming' THEN
    UPDATE public.assessments SET status = 'Active' WHERE id = p_assessment_id AND status = 'Upcoming';
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'started_at', v_attempt.started_at,
    'duration_minutes', v_assessment.duration_minutes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_assessment_attempt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_assessment_attempt(UUID) TO authenticated;

-- 4. Update get_student_assessment_questions RPC
CREATE OR REPLACE FUNCTION public.get_student_assessment_questions(p_assessment_id UUID)
RETURNS TABLE (
  id UUID,
  question_text TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  marks INTEGER,
  question_order INTEGER,
  topic_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_auth_user() OR public.get_auth_user_role() <> 'STUDENT' THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;

  RETURN QUERY
  SELECT q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.marks, q.question_order, COALESCE(t.name, 'General') AS topic_name
  FROM public.assessment_questions q
  JOIN public.assessments a ON a.id = q.assessment_id
  JOIN public.course_enrollments ce
    ON ce.course_id = a.course_id AND ce.student_id = auth.uid() AND ce.status = 'Active'
  JOIN public.assessment_attempts aa
    ON aa.assessment_id = a.id AND aa.student_id = auth.uid() AND aa.status = 'In Progress'
  LEFT JOIN public.assessment_topics t ON t.id = q.topic_id
  WHERE a.id = p_assessment_id
    AND a.status IN ('Upcoming', 'Active')
    AND a.department_id = public.get_auth_user_department_id()
  ORDER BY q.question_order, q.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_assessment_questions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_assessment_questions(UUID) TO authenticated;

-- 5. Update submit_assessment_attempt RPC to allow submission if within time or auto-submitted
CREATE OR REPLACE FUNCTION public.submit_assessment_attempt(
  p_assessment_id UUID,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid();
  v_attempt RECORD;
  v_assessment RECORD;
  v_question RECORD;
  v_selected_option TEXT;
  v_score NUMERIC := 0;
  v_max_score NUMERIC := 0;
  v_correct_count INTEGER := 0;
  v_question_count INTEGER := 0;
  v_percentage NUMERIC := 0;
  v_topic_performance JSONB := '[]'::jsonb;
  v_time_expired BOOLEAN := FALSE;
BEGIN
  IF v_student_id IS NULL OR NOT public.is_active_auth_user() OR public.get_auth_user_role() <> 'STUDENT' THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;
  IF jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Answers must be a JSON array.';
  END IF;

  SELECT id, course_id, department_id, status, available_from, deadline, duration_minutes
  INTO v_assessment
  FROM public.assessments
  WHERE id = p_assessment_id;

  IF NOT FOUND OR v_assessment.status NOT IN ('Upcoming', 'Active') THEN
    RAISE EXCEPTION 'Assessment is not open for submission.';
  END IF;

  IF v_assessment.department_id <> public.get_auth_user_department_id()
    OR NOT EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.course_id = v_assessment.course_id AND ce.student_id = v_student_id AND ce.status = 'Active'
    ) THEN
    RAISE EXCEPTION 'Student is not enrolled in this assessment course.';
  END IF;

  SELECT id, started_at, status INTO v_attempt
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id AND student_id = v_student_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'In Progress' THEN
    RAISE EXCEPTION 'Start an active assessment attempt before submitting.';
  END IF;

  v_time_expired := NOW() > v_attempt.started_at + (v_assessment.duration_minutes * INTERVAL '1 minute');

  FOR v_question IN
    SELECT q.id, q.correct_option, q.marks
    FROM public.assessment_questions q
    WHERE q.assessment_id = p_assessment_id
    ORDER BY q.question_order, q.created_at
  LOOP
    v_question_count := v_question_count + 1;
    v_max_score := v_max_score + v_question.marks;
    v_selected_option := NULL;

    -- Pick option from p_answers if supplied, else existing saved answer
    SELECT answer->>'selected_option' INTO v_selected_option
    FROM jsonb_array_elements(p_answers) answer
    WHERE answer->>'question_id' = v_question.id::text
    LIMIT 1;

    IF v_selected_option IS NULL THEN
      SELECT ans.selected_option INTO v_selected_option
      FROM public.assessment_answers ans
      WHERE ans.attempt_id = v_attempt.id AND ans.question_id = v_question.id;
    END IF;

    IF v_selected_option = v_question.correct_option THEN
      v_correct_count := v_correct_count + 1;
      v_score := v_score + v_question.marks;
    END IF;

    INSERT INTO public.assessment_answers (
      attempt_id, question_id, student_id, selected_option, is_correct, marks_earned
    ) VALUES (
      v_attempt.id, v_question.id, v_student_id, v_selected_option,
      v_selected_option = v_question.correct_option,
      CASE WHEN v_selected_option = v_question.correct_option THEN v_question.marks ELSE 0 END
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_option = EXCLUDED.selected_option,
          is_correct = EXCLUDED.is_correct,
          marks_earned = EXCLUDED.marks_earned;
  END LOOP;

  IF v_max_score > 0 THEN v_percentage := ROUND((v_score / v_max_score) * 100, 2); END IF;

  UPDATE public.assessment_attempts
  SET submitted_at = NOW(),
      score = v_score,
      max_score = v_max_score,
      percentage = v_percentage,
      status = 'Submitted'
  WHERE id = v_attempt.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('topic', topic_name, 'score', topic_score)), '[]'::jsonb)
  INTO v_topic_performance
  FROM (
    SELECT COALESCE(t.name, 'General') AS topic_name,
      CASE WHEN SUM(q.marks) > 0 THEN ROUND((SUM(ans.marks_earned) / SUM(q.marks)) * 100, 2) ELSE 0 END AS topic_score
    FROM public.assessment_questions q
    LEFT JOIN public.assessment_topics t ON t.id = q.topic_id
    LEFT JOIN public.assessment_answers ans ON ans.question_id = q.id AND ans.attempt_id = v_attempt.id
    WHERE q.assessment_id = p_assessment_id
    GROUP BY COALESCE(t.name, 'General')
  ) topics;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'score', v_score,
    'max_score', v_max_score,
    'percentage', v_percentage,
    'correct_count', v_correct_count,
    'question_count', v_question_count,
    'topic_performance', v_topic_performance,
    'status', 'Submitted'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_assessment_attempt(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_assessment_attempt(UUID, JSONB) TO authenticated;

-- 6. Update save_assessment_answer RPC to check available_from / deadline window
CREATE OR REPLACE FUNCTION public.save_assessment_answer(
  p_assessment_id UUID,
  p_question_id UUID,
  p_selected_option TEXT
)
RETURNS VOID
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
  IF p_selected_option NOT IN ('A', 'B', 'C', 'D') THEN
    RAISE EXCEPTION 'Selected option is invalid.';
  END IF;

  SELECT id, course_id, department_id, status, available_from, deadline, duration_minutes
  INTO v_assessment
  FROM public.assessments
  WHERE id = p_assessment_id;

  IF NOT FOUND OR v_assessment.status NOT IN ('Upcoming', 'Active') THEN
    RAISE EXCEPTION 'Assessment is not open for answers.';
  END IF;
  IF v_assessment.department_id <> public.get_auth_user_department_id()
    OR NOT EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.course_id = v_assessment.course_id AND ce.student_id = v_student_id AND ce.status = 'Active'
    ) THEN
    RAISE EXCEPTION 'Student is not enrolled in this assessment course.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assessment_questions q
    WHERE q.id = p_question_id AND q.assessment_id = p_assessment_id
  ) THEN
    RAISE EXCEPTION 'Question does not belong to this assessment.';
  END IF;

  SELECT id, started_at, status INTO v_attempt
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id AND student_id = v_student_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'In Progress' THEN
    RAISE EXCEPTION 'An in-progress assessment attempt is required.';
  END IF;

  IF NOW() > v_attempt.started_at + (v_assessment.duration_minutes * INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Assessment time limit has expired.';
  END IF;

  INSERT INTO public.assessment_answers (
    attempt_id, question_id, student_id, selected_option, is_correct, marks_earned
  ) VALUES (
    v_attempt.id, p_question_id, v_student_id, p_selected_option, NULL, 0
  )
  ON CONFLICT (attempt_id, question_id) DO UPDATE
    SET selected_option = EXCLUDED.selected_option,
        is_correct = NULL,
        marks_earned = 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_assessment_answer(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_assessment_answer(UUID, UUID, TEXT) TO authenticated;
