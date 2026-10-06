-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00032: FIX STUDENT QUESTION RETRIEVAL & SUBMISSION RPCs
-- ============================================================

-- 1. Update get_student_assessment_questions RPC to align with flexible course enrollment & department authorization
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
DECLARE
  v_student_id UUID := auth.uid();
  v_assessment RECORD;
BEGIN
  IF v_student_id IS NULL OR NOT public.is_active_auth_user() OR public.get_auth_user_role() <> 'STUDENT' THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;

  SELECT a.id, a.course_id, a.course_code, a.department_id, a.status
  INTO v_assessment
  FROM public.assessments a
  WHERE a.id = p_assessment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found.';
  END IF;

  IF v_assessment.status NOT IN ('Upcoming', 'Active') THEN
    RAISE EXCEPTION 'Assessment is not open.';
  END IF;

  IF v_assessment.department_id <> public.get_auth_user_department_id() THEN
    RAISE EXCEPTION 'Student is not authorized for this department assessment.';
  END IF;

  -- Validate course enrollment if explicit course enrollments exist for student
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

  -- Validate active attempt exists for student
  IF NOT EXISTS (
    SELECT 1 FROM public.assessment_attempts aa
    WHERE aa.assessment_id = p_assessment_id
      AND aa.student_id = v_student_id
      AND aa.status = 'In Progress'
  ) THEN
    RAISE EXCEPTION 'Start an assessment attempt before loading questions.';
  END IF;

  RETURN QUERY
  SELECT q.id,
         q.question_text,
         q.option_a,
         q.option_b,
         q.option_c,
         q.option_d,
         q.marks,
         q.question_order,
         COALESCE(t.name, 'General') AS topic_name
  FROM public.assessment_questions q
  LEFT JOIN public.assessment_topics t ON t.id = q.topic_id
  WHERE q.assessment_id = p_assessment_id
  ORDER BY q.question_order ASC, q.id ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_assessment_questions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_assessment_questions(UUID) TO authenticated;


-- 2. Update submit_assessment_attempt RPC with matching course enrollment & department authorization
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
BEGIN
  IF v_student_id IS NULL OR NOT public.is_active_auth_user() OR public.get_auth_user_role() <> 'STUDENT' THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;
  IF jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Answers must be a JSON array.';
  END IF;

  SELECT id, course_id, course_code, department_id, status, available_from, deadline, duration_minutes
  INTO v_assessment
  FROM public.assessments
  WHERE id = p_assessment_id;

  IF NOT FOUND OR v_assessment.status NOT IN ('Upcoming', 'Active') THEN
    RAISE EXCEPTION 'Assessment is not open for submission.';
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

  SELECT id, started_at, status INTO v_attempt
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id AND student_id = v_student_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'In Progress' THEN
    RAISE EXCEPTION 'Start an active assessment attempt before submitting.';
  END IF;

  FOR v_question IN
    SELECT q.id, q.correct_option, q.marks, q.topic_id
    FROM public.assessment_questions q
    WHERE q.assessment_id = p_assessment_id
    ORDER BY q.question_order, q.created_at
  LOOP
    v_question_count := v_question_count + 1;
    v_max_score := v_max_score + v_question.marks;
    v_selected_option := NULL;

    SELECT answer->>'selected_option' INTO v_selected_option
    FROM jsonb_array_elements(p_answers) answer
    WHERE answer->>'question_id' = v_question.id::text
    LIMIT 1;

    IF v_selected_option IS NULL THEN
      SELECT ans.selected_option INTO v_selected_option
      FROM public.assessment_answers ans
      WHERE ans.attempt_id = v_attempt.id AND ans.question_id = v_question.id;
    END IF;

    IF v_selected_option IS NOT NULL AND v_selected_option = v_question.correct_option THEN
      v_correct_count := v_correct_count + 1;
      v_score := v_score + v_question.marks;
    END IF;

    INSERT INTO public.assessment_answers (
      attempt_id, question_id, student_id, selected_option, is_correct, marks_earned
    ) VALUES (
      v_attempt.id, v_question.id, v_student_id, v_selected_option,
      (v_selected_option IS NOT NULL AND v_selected_option = v_question.correct_option),
      CASE WHEN (v_selected_option IS NOT NULL AND v_selected_option = v_question.correct_option) THEN v_question.marks ELSE 0 END
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_option = EXCLUDED.selected_option,
          is_correct = EXCLUDED.is_correct,
          marks_earned = EXCLUDED.marks_earned;
  END LOOP;

  IF v_max_score > 0 THEN
    v_percentage := ROUND((v_score / v_max_score) * 100, 2);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'topic', topic_summary.topic_name,
        'score', topic_summary.topic_score
      )
    ),
    '[]'::jsonb
  ) INTO v_topic_performance
  FROM (
    SELECT
      t.name AS topic_name,
      ROUND((SUM(CASE WHEN ans.is_correct THEN q.marks ELSE 0 END)::numeric / NULLIF(SUM(q.marks), 0)) * 100, 2) AS topic_score
    FROM public.assessment_questions q
    JOIN public.assessment_topics t ON t.id = q.topic_id
    LEFT JOIN public.assessment_answers ans ON ans.question_id = q.id AND ans.attempt_id = v_attempt.id
    WHERE q.assessment_id = p_assessment_id
      AND q.topic_id IS NOT NULL
    GROUP BY t.id, t.name
  ) topic_summary;

  UPDATE public.assessment_attempts
  SET
    submitted_at = NOW(),
    score = v_score,
    max_score = v_max_score,
    percentage = v_percentage,
    status = 'Submitted'
  WHERE id = v_attempt.id;

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
