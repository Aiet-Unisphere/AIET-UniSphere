ALTER TABLE public.assessments DROP CONSTRAINT IF EXISTS assessments_status_check;
ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_status_check
  CHECK (status IN ('Draft', 'Upcoming', 'Active', 'Completed', 'Closed'));
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS question_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.assessments a
SET question_count = (
  SELECT COUNT(*) FROM public.assessment_questions q WHERE q.assessment_id = a.id
);

CREATE OR REPLACE FUNCTION public.refresh_assessment_question_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assessment_id UUID := COALESCE(NEW.assessment_id, OLD.assessment_id);
BEGIN
  UPDATE public.assessments a
  SET question_count = (
    SELECT COUNT(*) FROM public.assessment_questions q WHERE q.assessment_id = v_assessment_id
  )
  WHERE a.id = v_assessment_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS refresh_assessment_question_count ON public.assessment_questions;
CREATE TRIGGER refresh_assessment_question_count
  AFTER INSERT OR DELETE ON public.assessment_questions
  FOR EACH ROW EXECUTE FUNCTION public.refresh_assessment_question_count();

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
        AND EXISTS (
          SELECT 1 FROM public.course_enrollments ce
          WHERE ce.course_id = assessments.course_id
            AND ce.student_id = auth.uid()
            AND ce.status = 'Active'
        )
      )
    )
  );

DROP POLICY IF EXISTS "Assessment owners and department managers can view questions" ON public.assessment_questions;
DROP POLICY IF EXISTS "Assessment owners and department managers can manage questions" ON public.assessment_questions;
CREATE POLICY "Assessment staff can view questions"
  ON public.assessment_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_id
        AND (
          a.created_by = auth.uid()
          OR (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );
CREATE POLICY "Assessment staff can manage draft questions"
  ON public.assessment_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_id
        AND a.status = 'Draft'
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
      WHERE a.id = assessment_id
        AND a.status = 'Draft'
        AND (
          a.created_by = auth.uid()
          OR (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

DROP POLICY IF EXISTS "Faculty can manage assessment topics" ON public.assessment_topics;
CREATE POLICY "Assessment staff can manage draft topics"
  ON public.assessment_topics FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_id
        AND a.status = 'Draft'
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
      WHERE a.id = assessment_id
        AND a.status = 'Draft'
        AND (
          a.created_by = auth.uid()
          OR (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_assessment_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'Draft' AND (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.course_id IS DISTINCT FROM OLD.course_id
    OR NEW.course_name IS DISTINCT FROM OLD.course_name
    OR NEW.course_code IS DISTINCT FROM OLD.course_code
    OR NEW.assessment_date IS DISTINCT FROM OLD.assessment_date
    OR NEW.assessment_time IS DISTINCT FROM OLD.assessment_time
    OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.total_marks IS DISTINCT FROM OLD.total_marks
    OR NEW.instructions IS DISTINCT FROM OLD.instructions
  ) THEN
    RAISE EXCEPTION 'Published assessment details are immutable.';
  END IF;

  IF OLD.status = 'Draft' AND NEW.status NOT IN ('Draft', 'Upcoming') THEN
    RAISE EXCEPTION 'Draft assessments must be published before they can be opened or closed.';
  END IF;
  IF OLD.status = 'Upcoming' AND NEW.status NOT IN ('Upcoming', 'Draft', 'Active', 'Closed') THEN
    RAISE EXCEPTION 'Invalid assessment state transition.';
  END IF;
  IF OLD.status = 'Active' AND NEW.status NOT IN ('Active', 'Closed') THEN
    RAISE EXCEPTION 'Active assessments can only remain active or be closed.';
  END IF;
  IF OLD.status IN ('Closed', 'Completed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Closed assessments cannot be reopened.';
  END IF;

  IF NEW.status = 'Upcoming' AND NOT EXISTS (
    SELECT 1 FROM public.assessment_questions q WHERE q.assessment_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'An assessment needs at least one question before publication.';
  END IF;

  IF NEW.status = 'Draft' AND EXISTS (
    SELECT 1 FROM public.assessment_attempts aa WHERE aa.assessment_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'An assessment with attempts cannot be unpublished.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_assessment_lifecycle ON public.assessments;
CREATE TRIGGER enforce_assessment_lifecycle
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_lifecycle();

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

  SELECT id, course_id, department_id, status, assessment_date, duration_minutes
  INTO v_assessment
  FROM public.assessments
  WHERE id = p_assessment_id;
  IF NOT FOUND OR v_assessment.status <> 'Active' OR v_assessment.assessment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Assessment is not open for attempts.';
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

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'started_at', v_attempt.started_at,
    'duration_minutes', v_assessment.duration_minutes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_assessment_attempt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_assessment_attempt(UUID) TO authenticated;

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
         q.marks, q.question_order, t.name
  FROM public.assessment_questions q
  JOIN public.assessments a ON a.id = q.assessment_id
  JOIN public.course_enrollments ce
    ON ce.course_id = a.course_id AND ce.student_id = auth.uid() AND ce.status = 'Active'
  JOIN public.assessment_attempts aa
    ON aa.assessment_id = a.id AND aa.student_id = auth.uid() AND aa.status = 'In Progress'
  LEFT JOIN public.assessment_topics t ON t.id = q.topic_id
  WHERE a.id = p_assessment_id
    AND a.status = 'Active'
    AND a.assessment_date <= CURRENT_DATE
    AND a.department_id = public.get_auth_user_department_id()
  ORDER BY q.question_order, q.created_at;
END;
$$;

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

  SELECT id, course_id, department_id, status, assessment_date, duration_minutes
  INTO v_assessment
  FROM public.assessments
  WHERE id = p_assessment_id;
  IF NOT FOUND OR v_assessment.status <> 'Active' OR v_assessment.assessment_date > CURRENT_DATE THEN
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

  IF NOT v_time_expired AND (EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_answers) answer
    WHERE (answer->>'selected_option') IS NOT NULL
      AND (answer->>'selected_option') NOT IN ('A', 'B', 'C', 'D')
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_answers) answer
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessment_questions q
      WHERE q.id = (answer->>'question_id')::UUID AND q.assessment_id = p_assessment_id
    )
  ) OR (
    SELECT COUNT(*) FROM jsonb_array_elements(p_answers)
  ) <> (
    SELECT COUNT(DISTINCT answer->>'question_id') FROM jsonb_array_elements(p_answers) answer
  )) THEN
    RAISE EXCEPTION 'One or more submitted answers are invalid.';
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
    IF v_time_expired THEN
      SELECT ans.selected_option INTO v_selected_option
      FROM public.assessment_answers ans
      WHERE ans.attempt_id = v_attempt.id AND ans.question_id = v_question.id;
    ELSE
      SELECT answer->>'selected_option' INTO v_selected_option
      FROM jsonb_array_elements(p_answers) answer
      WHERE answer->>'question_id' = v_question.id::text
      LIMIT 1;
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
  SET submitted_at = NOW(), score = v_score, max_score = v_max_score,
      percentage = v_percentage, status = 'Submitted'
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

  SELECT id, course_id, department_id, status, assessment_date, duration_minutes
  INTO v_assessment
  FROM public.assessments
  WHERE id = p_assessment_id;
  IF NOT FOUND OR v_assessment.status <> 'Active' OR v_assessment.assessment_date > CURRENT_DATE THEN
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
    SELECT COALESCE(t.name, 'General') AS topic_name,
      CASE WHEN SUM(q.marks) > 0 THEN ROUND((SUM(ans.marks_earned) / SUM(q.marks)) * 100, 2) ELSE 0 END AS topic_score
    FROM public.assessment_questions q
    LEFT JOIN public.assessment_topics t ON t.id = q.topic_id
    LEFT JOIN public.assessment_answers ans ON ans.question_id = q.id AND ans.attempt_id = v_attempt.id
    WHERE q.assessment_id = p_assessment_id
    GROUP BY COALESCE(t.name, 'General')
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