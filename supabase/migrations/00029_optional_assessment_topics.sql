-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00029: OPTIONAL ASSESSMENT TOPICS
-- ============================================================

-- 1. Update submit_assessment_attempt RPC to filter out questions without topics from topic_performance
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
    SELECT t.name AS topic_name,
      CASE WHEN SUM(q.marks) > 0 THEN ROUND((SUM(ans.marks_earned) / SUM(q.marks)) * 100, 2) ELSE 0 END AS topic_score
    FROM public.assessment_questions q
    JOIN public.assessment_topics t ON t.id = q.topic_id
    LEFT JOIN public.assessment_answers ans ON ans.question_id = q.id AND ans.attempt_id = v_attempt.id
    WHERE q.assessment_id = p_assessment_id AND q.topic_id IS NOT NULL
    GROUP BY t.name
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

-- 2. Update get_student_assessment_result RPC
CREATE OR REPLACE FUNCTION public.get_student_assessment_result(p_assessment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt RECORD;
  v_correct_count INTEGER;
  v_question_count INTEGER;
  v_topics JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_auth_user() OR public.get_auth_user_role() <> 'STUDENT' THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;

  SELECT id, score, max_score, percentage, status INTO v_attempt
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id AND student_id = auth.uid();
  IF NOT FOUND OR v_attempt.status NOT IN ('Submitted', 'Graded') THEN
    RAISE EXCEPTION 'A submitted assessment result is not available.';
  END IF;

  SELECT COUNT(*) FILTER (WHERE ans.is_correct IS TRUE), COUNT(*)
  INTO v_correct_count, v_question_count
  FROM public.assessment_answers ans
  WHERE ans.attempt_id = v_attempt.id AND ans.student_id = auth.uid();

  SELECT COALESCE(jsonb_agg(jsonb_build_object('topic', topic_name, 'score', topic_score)), '[]'::jsonb)
  INTO v_topics
  FROM (
    SELECT t.name AS topic_name,
      CASE WHEN SUM(q.marks) > 0 THEN ROUND((SUM(ans.marks_earned) / SUM(q.marks)) * 100, 2) ELSE 0 END AS topic_score
    FROM public.assessment_questions q
    JOIN public.assessment_topics t ON t.id = q.topic_id
    LEFT JOIN public.assessment_answers ans ON ans.question_id = q.id AND ans.attempt_id = v_attempt.id
    WHERE q.assessment_id = p_assessment_id AND q.topic_id IS NOT NULL
    GROUP BY t.name
  ) topics;

  RETURN jsonb_build_object(
    'score', v_attempt.score,
    'max_score', v_attempt.max_score,
    'percentage', v_attempt.percentage,
    'correct_count', COALESCE(v_correct_count, 0),
    'question_count', COALESCE(v_question_count, 0),
    'topic_performance', v_topics,
    'status', v_attempt.status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_assessment_result(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_assessment_result(UUID) TO authenticated;
