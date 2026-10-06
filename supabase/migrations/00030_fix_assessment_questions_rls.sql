-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00030: FIX ASSESSMENT QUESTIONS & TOPICS RLS
-- ============================================================

-- Safely drop stale/restrictive policies on public.assessment_questions
DROP POLICY IF EXISTS "Assessment staff can view questions" ON public.assessment_questions;
DROP POLICY IF EXISTS "Assessment staff can manage draft questions" ON public.assessment_questions;
DROP POLICY IF EXISTS "Assessment owners and department managers can view questions" ON public.assessment_questions;
DROP POLICY IF EXISTS "Assessment owners and department managers can manage questions" ON public.assessment_questions;
DROP POLICY IF EXISTS "Faculty can manage assessment questions" ON public.assessment_questions;
DROP POLICY IF EXISTS "Authorized users can view assessment questions" ON public.assessment_questions;

-- 1. SELECT Policy for staff on assessment_questions
CREATE POLICY "Assessment staff can view questions"
  ON public.assessment_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_questions.assessment_id
        AND (
          a.created_by = auth.uid()
          OR (
            public.get_auth_user_role() IN ('FACULTY', 'HOD')
            AND a.department_id = public.get_auth_user_department_id()
          )
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

-- 2. ALL (INSERT, UPDATE, DELETE) Policy for authorized staff on assessment_questions
CREATE POLICY "Assessment staff can manage questions"
  ON public.assessment_questions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_questions.assessment_id
        AND (
          a.created_by = auth.uid()
          OR (
            public.get_auth_user_role() IN ('FACULTY', 'HOD')
            AND a.department_id = public.get_auth_user_department_id()
          )
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
          OR (
            public.get_auth_user_role() IN ('FACULTY', 'HOD')
            AND a.department_id = public.get_auth_user_department_id()
          )
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

-- Safely drop stale/restrictive policies on public.assessment_topics
DROP POLICY IF EXISTS "Assessment staff can manage draft topics" ON public.assessment_topics;
DROP POLICY IF EXISTS "Faculty can manage assessment topics" ON public.assessment_topics;

-- 3. ALL Policy for authorized staff on assessment_topics
CREATE POLICY "Assessment staff can manage topics"
  ON public.assessment_topics FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_topics.assessment_id
        AND (
          a.created_by = auth.uid()
          OR (
            public.get_auth_user_role() IN ('FACULTY', 'HOD')
            AND a.department_id = public.get_auth_user_department_id()
          )
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_topics.assessment_id
        AND (
          a.created_by = auth.uid()
          OR (
            public.get_auth_user_role() IN ('FACULTY', 'HOD')
            AND a.department_id = public.get_auth_user_department_id()
          )
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );
