CREATE OR REPLACE VIEW public.student_analytics_view AS
SELECT
  p.id AS student_id,
  p.full_name,
  p.department_id,
  COALESCE(att.total_sessions, 0) AS total_sessions,
  COALESCE(att.present_count, 0) AS present_count,
  CASE
    WHEN COALESCE(att.total_sessions, 0) > 0
    THEN ROUND((att.present_count::numeric / att.total_sessions) * 100, 1)
    ELSE 0
  END AS attendance_percentage,
  COALESCE(asgn.total_assignments, 0) AS total_assignments,
  COALESCE(asgn.submitted_count, 0) AS submitted_assignments,
  COALESCE(asmt.total_attempts, 0) AS total_assessment_attempts,
  COALESCE(asmt.avg_percentage, 0) AS avg_assessment_percentage
FROM public.profiles p
LEFT JOIN (
  SELECT
    ar.student_id,
    COUNT(DISTINCT ar.session_id) AS total_sessions,
    COUNT(DISTINCT CASE WHEN ar.status IN ('Present', 'Late') THEN ar.session_id END) AS present_count
  FROM public.attendance_records ar
  GROUP BY ar.student_id
) att ON att.student_id = p.id
LEFT JOIN (
  SELECT
    sub.student_id,
    COUNT(DISTINCT a.id) AS total_assignments,
    COUNT(DISTINCT sub.id) AS submitted_count
  FROM public.assignments a
  LEFT JOIN public.assignment_submissions sub ON sub.assignment_id = a.id
  GROUP BY sub.student_id
) asgn ON asgn.student_id = p.id
LEFT JOIN (
  SELECT
    aa.student_id,
    COUNT(*) AS total_attempts,
    ROUND(AVG(aa.percentage), 1) AS avg_percentage
  FROM public.assessment_attempts aa
  WHERE aa.status IN ('Submitted', 'Graded')
  GROUP BY aa.student_id
) asmt ON asmt.student_id = p.id
WHERE p.role = 'STUDENT'
  AND public.is_active_auth_user()
  AND (
    p.id = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
    OR (
      public.get_auth_user_role() IN ('FACULTY', 'HOD')
      AND p.department_id = public.get_auth_user_department_id()
    )
  );

CREATE OR REPLACE VIEW public.student_learning_gaps_view AS
SELECT
  aa.student_id,
  at.name AS topic_name,
  asm.course_name,
  asm.course_id,
  COUNT(aq.id) AS total_questions,
  COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) AS correct_answers,
  COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) AS wrong_answers,
  CASE
    WHEN COUNT(aq.id) > 0
    THEN ROUND((COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END)::numeric / COUNT(aq.id)) * 100, 1)
    ELSE 0
  END AS topic_score_percent
FROM public.assessment_attempts aa
JOIN public.assessment_answers ans ON ans.attempt_id = aa.id AND ans.student_id = aa.student_id
JOIN public.assessment_questions aq ON aq.id = ans.question_id
JOIN public.assessment_topics at ON at.id = aq.topic_id
JOIN public.assessments asm ON asm.id = aa.assessment_id
JOIN public.profiles student_profile ON student_profile.id = aa.student_id
WHERE aa.status IN ('Submitted', 'Graded')
  AND student_profile.role = 'STUDENT'
  AND public.is_active_auth_user()
  AND (
    aa.student_id = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
    OR (
      public.get_auth_user_role() IN ('FACULTY', 'HOD')
      AND asm.department_id = public.get_auth_user_department_id()
    )
  )
GROUP BY aa.student_id, at.name, asm.course_name, asm.course_id;

GRANT SELECT ON public.student_analytics_view TO authenticated;
GRANT SELECT ON public.student_learning_gaps_view TO authenticated;
NOTIFY pgrst, 'reload schema';