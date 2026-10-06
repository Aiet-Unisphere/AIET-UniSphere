DROP POLICY IF EXISTS "Authorized users can view assessment questions" ON public.assessment_questions;
DROP POLICY IF EXISTS "Faculty can manage assessment questions" ON public.assessment_questions;
DROP POLICY IF EXISTS "Students can create their own attempts" ON public.assessment_attempts;
DROP POLICY IF EXISTS "Students can update their own in-progress attempts" ON public.assessment_attempts;
DROP POLICY IF EXISTS "Students can insert their own answers" ON public.assessment_answers;
DROP POLICY IF EXISTS "Students can view own assessment answers" ON public.assessment_answers;

CREATE POLICY "Assessment owners and department managers can view questions"
  ON public.assessment_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_questions.assessment_id
        AND (
          a.created_by = auth.uid()
          OR (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

CREATE POLICY "Assessment owners and department managers can manage questions"
  ON public.assessment_questions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_questions.assessment_id
        AND (
          a.created_by = auth.uid()
          OR (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_questions.assessment_id
        AND (
          a.created_by = auth.uid()
          OR (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

CREATE POLICY "Students and authorized staff can view assessment answers"
  ON public.assessment_answers FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.assessment_attempts aa
      JOIN public.assessments a ON a.id = aa.assessment_id
      WHERE aa.id = assessment_answers.attempt_id
        AND (
          a.created_by = auth.uid()
          OR (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

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
BEGIN
  IF v_student_id IS NULL
    OR public.get_auth_user_role() <> 'STUDENT'
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_student_id AND p.account_status = 'ACTIVE'
    ) THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;

  RETURN QUERY
  SELECT q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.marks, q.question_order, t.name
  FROM public.assessment_questions q
  JOIN public.assessments a ON a.id = q.assessment_id
  JOIN public.course_enrollments ce
    ON ce.course_id = a.course_id AND ce.student_id = v_student_id AND ce.status = 'Active'
  LEFT JOIN public.assessment_topics t ON t.id = q.topic_id
  WHERE a.id = p_assessment_id
    AND a.status IN ('Upcoming', 'Active')
    AND a.department_id = public.get_auth_user_department_id()
  ORDER BY q.question_order, q.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_assessment_questions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_assessment_questions(UUID) TO authenticated;

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
  v_attempt_id UUID;
  v_assessment RECORD;
  v_question RECORD;
  v_answer JSONB;
  v_selected_option TEXT;
  v_score NUMERIC := 0;
  v_max_score NUMERIC := 0;
  v_correct_count INTEGER := 0;
  v_question_count INTEGER := 0;
  v_percentage NUMERIC := 0;
  v_topic_performance JSONB := '[]'::jsonb;
BEGIN
  IF v_student_id IS NULL
    OR public.get_auth_user_role() <> 'STUDENT'
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_student_id AND p.account_status = 'ACTIVE'
    ) THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;

  IF jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Answers must be a JSON array.';
  END IF;

  SELECT a.id, a.course_id, a.department_id, a.status
  INTO v_assessment
  FROM public.assessments a
  WHERE a.id = p_assessment_id;

  IF NOT FOUND OR v_assessment.status NOT IN ('Upcoming', 'Active') THEN
    RAISE EXCEPTION 'Assessment is not available for submission.';
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

  IF NOT EXISTS (
    SELECT 1 FROM public.assessment_questions q WHERE q.assessment_id = p_assessment_id
  ) THEN
    RAISE EXCEPTION 'Assessment has no questions and cannot be submitted.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) answer
    WHERE (answer->>'selected_option') IS NOT NULL
      AND (answer->>'selected_option') NOT IN ('A', 'B', 'C', 'D')
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) answer
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessment_questions q
      WHERE q.id = (answer->>'question_id')::UUID
        AND q.assessment_id = p_assessment_id
    )
  ) THEN
    RAISE EXCEPTION 'One or more submitted answers are invalid.';
  END IF;

  SELECT id INTO v_attempt_id
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id AND student_id = v_student_id
  FOR UPDATE;

  IF v_attempt_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assessment_attempts aa
    WHERE aa.id = v_attempt_id AND aa.status = 'Submitted'
  ) THEN
    RAISE EXCEPTION 'Assessment already submitted.';
  END IF;

  IF v_attempt_id IS NULL THEN
    INSERT INTO public.assessment_attempts (assessment_id, student_id, status)
    VALUES (p_assessment_id, v_student_id, 'In Progress')
    RETURNING id INTO v_attempt_id;
  END IF;

  FOR v_question IN
    SELECT q.id, q.correct_option, q.marks
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

    IF v_selected_option = v_question.correct_option THEN
      v_correct_count := v_correct_count + 1;
      v_score := v_score + v_question.marks;
    END IF;

    INSERT INTO public.assessment_answers (
      attempt_id, question_id, student_id, selected_option, is_correct, marks_earned
    ) VALUES (
      v_attempt_id, v_question.id, v_student_id, v_selected_option,
      v_selected_option = v_question.correct_option,
      CASE WHEN v_selected_option = v_question.correct_option THEN v_question.marks ELSE 0 END
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_option = EXCLUDED.selected_option,
          is_correct = EXCLUDED.is_correct,
          marks_earned = EXCLUDED.marks_earned;
  END LOOP;

  IF v_max_score > 0 THEN
    v_percentage := ROUND((v_score / v_max_score) * 100, 2);
  END IF;

  UPDATE public.assessment_attempts
  SET submitted_at = NOW(), score = v_score, max_score = v_max_score,
      percentage = v_percentage, status = 'Submitted'
  WHERE id = v_attempt_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('topic', topic_name, 'score', topic_score)), '[]'::jsonb)
  INTO v_topic_performance
  FROM (
    SELECT COALESCE(t.name, 'General') AS topic_name,
      CASE WHEN SUM(q.marks) > 0
        THEN ROUND((SUM(ans.marks_earned) / SUM(q.marks)) * 100, 2)
        ELSE 0
      END AS topic_score
    FROM public.assessment_questions q
    LEFT JOIN public.assessment_topics t ON t.id = q.topic_id
    LEFT JOIN public.assessment_answers ans ON ans.question_id = q.id AND ans.attempt_id = v_attempt_id
    WHERE q.assessment_id = p_assessment_id
    GROUP BY COALESCE(t.name, 'General')
  ) topics;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
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