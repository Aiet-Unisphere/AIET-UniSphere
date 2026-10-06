-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00033: ASSESSMENT REVIEW SYSTEM
-- Assessment Submission Tracking, Faculty Review & Student Answer Review
-- ============================================================

-- 1. RPC: get_faculty_assessment_submissions
-- Returns all eligible students (submitted, in-progress, pending) for a given assessment
CREATE OR REPLACE FUNCTION public.get_faculty_assessment_submissions(p_assessment_id UUID)
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  usn TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score NUMERIC,
  max_score NUMERIC,
  percentage NUMERIC,
  attempt_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT := public.get_auth_user_role();
  v_caller_dept UUID := public.get_auth_user_department_id();
  v_assessment RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_auth_user() THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF v_caller_role NOT IN ('FACULTY', 'HOD', 'ADMIN') THEN
    RAISE EXCEPTION '403 Forbidden: Faculty, HOD, or Admin access required.';
  END IF;

  SELECT a.id, a.course_id, a.course_code, a.department_id, a.total_marks, a.deadline
  INTO v_assessment
  FROM public.assessments a
  WHERE a.id = p_assessment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found.';
  END IF;

  IF v_caller_role <> 'ADMIN' AND v_assessment.department_id <> v_caller_dept THEN
    RAISE EXCEPTION '403 Forbidden: You are not authorized for assessments outside your department.';
  END IF;

  RETURN QUERY
  WITH eligible_students AS (
    -- Prefer explicit course enrollments if present
    SELECT DISTINCT p.id AS student_id,
                    COALESCE(p.full_name, p.email) AS student_name,
                    COALESCE(p.usn_or_employee_id, 'N/A') AS usn
    FROM public.profiles p
    JOIN public.course_enrollments ce ON ce.student_id = p.id
    WHERE p.role = 'STUDENT'
      AND ce.status = 'Active'
      AND (
        LOWER(ce.course_id) = LOWER(v_assessment.course_id)
        OR LOWER(ce.course_code) = LOWER(v_assessment.course_code)
        OR LOWER(ce.course_id) = LOWER(v_assessment.course_code)
        OR LOWER(ce.course_code) = LOWER(v_assessment.course_id)
      )

    UNION

    -- Fallback to all students in the department if no course enrollments exist for course
    SELECT p.id AS student_id,
           COALESCE(p.full_name, p.email) AS student_name,
           COALESCE(p.usn_or_employee_id, 'N/A') AS usn
    FROM public.profiles p
    WHERE p.role = 'STUDENT'
      AND p.department_id = v_assessment.department_id
      AND NOT EXISTS (
        SELECT 1 FROM public.course_enrollments ce2
        WHERE ce2.status = 'Active'
          AND (
            LOWER(ce2.course_id) = LOWER(v_assessment.course_id)
            OR LOWER(ce2.course_code) = LOWER(v_assessment.course_code)
          )
      )
  )
  SELECT 
    es.student_id,
    es.student_name,
    es.usn,
    COALESCE(
      aa.status,
      CASE 
        WHEN v_assessment.deadline IS NOT NULL AND NOW() > v_assessment.deadline THEN 'Pending'
        ELSE 'Pending'
      END
    ) AS status,
    aa.started_at,
    aa.submitted_at,
    aa.score,
    COALESCE(aa.max_score, v_assessment.total_marks::numeric) AS max_score,
    aa.percentage,
    aa.id AS attempt_id
  FROM eligible_students es
  LEFT JOIN public.assessment_attempts aa 
    ON aa.assessment_id = p_assessment_id AND aa.student_id = es.student_id
  ORDER BY 
    CASE 
      WHEN aa.status IN ('Submitted', 'Graded') THEN 1
      WHEN aa.status = 'In Progress' THEN 2
      WHEN aa.status = 'Abandoned' THEN 3
      ELSE 4
    END,
    es.student_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_faculty_assessment_submissions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_faculty_assessment_submissions(UUID) TO authenticated;


-- 2. RPC: get_faculty_attempt_review
-- Returns question-by-question review for an attempt (Faculty/HOD/Admin view)
CREATE OR REPLACE FUNCTION public.get_faculty_attempt_review(p_attempt_id UUID)
RETURNS TABLE (
  attempt_id UUID,
  assessment_id UUID,
  student_id UUID,
  student_name TEXT,
  usn TEXT,
  attempt_status TEXT,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score NUMERIC,
  max_score NUMERIC,
  percentage NUMERIC,
  question_id UUID,
  question_text TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  selected_option TEXT,
  correct_option TEXT,
  is_correct BOOLEAN,
  marks_earned NUMERIC,
  max_marks INTEGER,
  question_order INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT := public.get_auth_user_role();
  v_caller_dept UUID := public.get_auth_user_department_id();
  v_attempt RECORD;
  v_assessment RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_auth_user() THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF v_caller_role NOT IN ('FACULTY', 'HOD', 'ADMIN') THEN
    RAISE EXCEPTION '403 Forbidden: Faculty, HOD, or Admin access required.';
  END IF;

  SELECT aa.* INTO v_attempt
  FROM public.assessment_attempts aa
  WHERE aa.id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment attempt not found.';
  END IF;

  SELECT a.* INTO v_assessment
  FROM public.assessments a
  WHERE a.id = v_attempt.assessment_id;

  IF v_caller_role <> 'ADMIN' AND v_assessment.department_id <> v_caller_dept THEN
    RAISE EXCEPTION '403 Forbidden: You are not authorized to review attempts outside your department.';
  END IF;

  RETURN QUERY
  SELECT 
    v_attempt.id AS attempt_id,
    v_assessment.id AS assessment_id,
    v_attempt.student_id,
    COALESCE(p.full_name, p.email) AS student_name,
    COALESCE(p.usn_or_employee_id, 'N/A') AS usn,
    v_attempt.status AS attempt_status,
    v_attempt.started_at,
    v_attempt.submitted_at,
    v_attempt.score,
    v_attempt.max_score,
    v_attempt.percentage,
    q.id AS question_id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    ans.selected_option,
    q.correct_option,
    COALESCE(ans.is_correct, FALSE) AS is_correct,
    COALESCE(ans.marks_earned, 0) AS marks_earned,
    q.marks AS max_marks,
    q.question_order
  FROM public.assessment_questions q
  JOIN public.profiles p ON p.id = v_attempt.student_id
  LEFT JOIN public.assessment_answers ans 
    ON ans.question_id = q.id AND ans.attempt_id = v_attempt.id
  WHERE q.assessment_id = v_assessment.id
  ORDER BY q.question_order ASC, q.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_faculty_attempt_review(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_faculty_attempt_review(UUID) TO authenticated;


-- 3. RPC: get_student_attempt_review
-- Allows a student to review THEIR OWN submitted attempt after submission
CREATE OR REPLACE FUNCTION public.get_student_attempt_review(p_attempt_id UUID)
RETURNS TABLE (
  attempt_id UUID,
  assessment_title TEXT,
  course_name TEXT,
  score NUMERIC,
  max_score NUMERIC,
  percentage NUMERIC,
  submitted_at TIMESTAMPTZ,
  question_id UUID,
  question_text TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  selected_option TEXT,
  correct_option TEXT,
  is_correct BOOLEAN,
  marks_earned NUMERIC,
  max_marks INTEGER,
  question_order INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid();
  v_attempt RECORD;
  v_assessment RECORD;
BEGIN
  IF v_student_id IS NULL OR NOT public.is_active_auth_user() OR public.get_auth_user_role() <> 'STUDENT' THEN
    RAISE EXCEPTION 'Active student authentication required.';
  END IF;

  SELECT aa.* INTO v_attempt
  FROM public.assessment_attempts aa
  WHERE aa.id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment attempt not found.';
  END IF;

  IF v_attempt.student_id <> v_student_id THEN
    RAISE EXCEPTION '403 Forbidden: You may only review your own assessment attempt.';
  END IF;

  IF v_attempt.status NOT IN ('Submitted', 'Graded') THEN
    RAISE EXCEPTION 'Answers are only available for review after submitting the assessment.';
  END IF;

  SELECT a.* INTO v_assessment
  FROM public.assessments a
  WHERE a.id = v_attempt.assessment_id;

  RETURN QUERY
  SELECT 
    v_attempt.id AS attempt_id,
    v_assessment.title AS assessment_title,
    v_assessment.course_name,
    v_attempt.score,
    v_attempt.max_score,
    v_attempt.percentage,
    v_attempt.submitted_at,
    q.id AS question_id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    ans.selected_option,
    q.correct_option,
    COALESCE(ans.is_correct, FALSE) AS is_correct,
    COALESCE(ans.marks_earned, 0) AS marks_earned,
    q.marks AS max_marks,
    q.question_order
  FROM public.assessment_questions q
  LEFT JOIN public.assessment_answers ans 
    ON ans.question_id = q.id AND ans.attempt_id = v_attempt.id
  WHERE q.assessment_id = v_assessment.id
  ORDER BY q.question_order ASC, q.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_attempt_review(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_attempt_review(UUID) TO authenticated;
