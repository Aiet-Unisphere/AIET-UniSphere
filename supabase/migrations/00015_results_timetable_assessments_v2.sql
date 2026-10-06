-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00015: RESULTS, TIMETABLE, ASSESSMENTS V2,
-- AI CONVERSATIONS, SKILLS, ACHIEVEMENTS, PROJECTS (FULL SUPABASE),
-- STUDENT SERVICES CATALOG, AUDIT LOGS, AND COURSE ENROLLMENTS
-- ============================================================

-- =============================================================
-- SECTION 1: RESULTS / GRADES SYSTEM
-- =============================================================

CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_code TEXT,
  semester INTEGER NOT NULL,
  academic_year TEXT,
  internal_marks NUMERIC,
  external_marks NUMERIC,
  total_marks NUMERIC,
  max_marks NUMERIC DEFAULT 100,
  grade TEXT,
  grade_points NUMERIC,
  credits INTEGER DEFAULT 3,
  status TEXT DEFAULT 'Pass' CHECK (status IN ('Pass', 'Fail', 'Absent', 'Withheld')),
  result_type TEXT DEFAULT 'Regular' CHECK (result_type IN ('Regular', 'Arrear', 'Improvement')),
  entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_student_course_semester_result UNIQUE (student_id, course_id, semester, result_type)
);

CREATE INDEX IF NOT EXISTS idx_results_student ON public.results(student_id);
CREATE INDEX IF NOT EXISTS idx_results_department ON public.results(department_id);
CREATE INDEX IF NOT EXISTS idx_results_semester ON public.results(semester);
CREATE INDEX IF NOT EXISTS idx_results_course ON public.results(course_id);

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can read own results"
  ON public.results FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
    OR (
      public.get_auth_user_role() IN ('FACULTY', 'HOD')
      AND department_id = public.get_auth_user_department_id()
    )
  );

CREATE POLICY "Faculty/HOD can insert results"
  ON public.results FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
    AND (
      department_id = public.get_auth_user_department_id()
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

CREATE POLICY "Faculty/HOD can update results"
  ON public.results FOR UPDATE
  TO authenticated
  USING (
    (entered_by = auth.uid() OR public.get_auth_user_role() IN ('HOD', 'ADMIN'))
    AND (
      department_id = public.get_auth_user_department_id()
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );


-- =============================================================
-- SECTION 2: TIMETABLE
-- =============================================================

CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_code TEXT,
  faculty_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  faculty_name TEXT,
  semester INTEGER NOT NULL,
  section TEXT,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT,
  is_lab BOOLEAN DEFAULT FALSE,
  academic_year TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timetable_department ON public.timetable_entries(department_id);
CREATE INDEX IF NOT EXISTS idx_timetable_faculty ON public.timetable_entries(faculty_id);
CREATE INDEX IF NOT EXISTS idx_timetable_semester ON public.timetable_entries(semester);
CREATE INDEX IF NOT EXISTS idx_timetable_day ON public.timetable_entries(day_of_week);

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Department users can view timetable"
  ON public.timetable_entries FOR SELECT
  TO authenticated
  USING (
    department_id = public.get_auth_user_department_id()
    OR public.get_auth_user_role() = 'ADMIN'
  );

CREATE POLICY "HOD and Admin can manage timetable"
  ON public.timetable_entries FOR ALL
  TO authenticated
  USING (
    (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
    OR public.get_auth_user_role() = 'ADMIN'
  )
  WITH CHECK (
    (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
    OR public.get_auth_user_role() = 'ADMIN'
  );


-- =============================================================
-- SECTION 3: ASSESSMENT ENHANCEMENTS — TOPICS, QUESTIONS, ATTEMPTS
-- =============================================================

CREATE TABLE IF NOT EXISTS public.assessment_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_topics_assessment ON public.assessment_topics(assessment_id);
ALTER TABLE public.assessment_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Department users can view assessment topics"
  ON public.assessment_topics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = public.assessment_topics.assessment_id
        AND (
          a.department_id = public.get_auth_user_department_id()
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

CREATE POLICY "Faculty can manage assessment topics"
  ON public.assessment_topics FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = public.assessment_topics.assessment_id
        AND (a.created_by = auth.uid() OR public.get_auth_user_role() IN ('HOD', 'ADMIN'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = public.assessment_topics.assessment_id
        AND (a.created_by = auth.uid() OR public.get_auth_user_role() IN ('HOD', 'ADMIN'))
    )
  );


CREATE TABLE IF NOT EXISTS public.assessment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.assessment_topics(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  marks INTEGER NOT NULL DEFAULT 1,
  question_order INTEGER DEFAULT 0,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_questions_assessment ON public.assessment_questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_topic ON public.assessment_questions(topic_id);
ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view assessment questions"
  ON public.assessment_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = public.assessment_questions.assessment_id
        AND (
          a.department_id = public.get_auth_user_department_id()
          OR public.get_auth_user_role() = 'ADMIN'
        )
    )
  );

CREATE POLICY "Faculty can manage assessment questions"
  ON public.assessment_questions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = public.assessment_questions.assessment_id
        AND (a.created_by = auth.uid() OR public.get_auth_user_role() IN ('HOD', 'ADMIN'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = public.assessment_questions.assessment_id
        AND (a.created_by = auth.uid() OR public.get_auth_user_role() IN ('HOD', 'ADMIN'))
    )
  );


CREATE TABLE IF NOT EXISTS public.assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  time_taken_seconds INTEGER,
  score NUMERIC,
  max_score NUMERIC,
  percentage NUMERIC,
  status TEXT NOT NULL DEFAULT 'In Progress' CHECK (status IN ('In Progress', 'Submitted', 'Graded', 'Abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_student_assessment_attempt UNIQUE (assessment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_attempts_assessment ON public.assessment_attempts(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_student ON public.assessment_attempts(student_id);
ALTER TABLE public.assessment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own assessment attempts"
  ON public.assessment_attempts FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR (
      public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
      AND EXISTS (
        SELECT 1 FROM public.assessments a
        WHERE a.id = public.assessment_attempts.assessment_id
          AND (a.department_id = public.get_auth_user_department_id() OR public.get_auth_user_role() = 'ADMIN')
      )
    )
  );

CREATE POLICY "Students can create their own attempts"
  ON public.assessment_attempts FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update their own in-progress attempts"
  ON public.assessment_attempts FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );


CREATE TABLE IF NOT EXISTS public.assessment_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.assessment_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_option TEXT CHECK (selected_option IN ('A', 'B', 'C', 'D')),
  is_correct BOOLEAN,
  marks_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_attempt_question_answer UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_answers_attempt ON public.assessment_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_assessment_answers_student ON public.assessment_answers(student_id);
CREATE INDEX IF NOT EXISTS idx_assessment_answers_question ON public.assessment_answers(question_id);
ALTER TABLE public.assessment_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own assessment answers"
  ON public.assessment_answers FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );

CREATE POLICY "Students can insert their own answers"
  ON public.assessment_answers FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());


-- =============================================================
-- SECTION 4: AI CONVERSATIONS AND MESSAGES
-- =============================================================

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  course_context TEXT,
  model_provider TEXT DEFAULT 'gemini',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON public.ai_conversations(user_id);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own AI conversations"
  ON public.ai_conversations FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON public.ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user ON public.ai_messages(user_id);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own AI messages"
  ON public.ai_messages FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- =============================================================
-- SECTION 5: STUDENT SKILLS AND ACHIEVEMENTS
-- =============================================================

CREATE TABLE IF NOT EXISTS public.student_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Technical',
  level TEXT NOT NULL DEFAULT 'Beginner' CHECK (level IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
  level_percent INTEGER NOT NULL DEFAULT 0 CHECK (level_percent >= 0 AND level_percent <= 100),
  evidence_source TEXT,
  evidence_id TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_student_skill UNIQUE (student_id, name)
);

CREATE INDEX IF NOT EXISTS idx_student_skills_student ON public.student_skills(student_id);
ALTER TABLE public.student_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own skills"
  ON public.student_skills FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );

CREATE POLICY "System can manage student skills"
  ON public.student_skills FOR ALL
  TO authenticated
  USING (student_id = auth.uid() OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'))
  WITH CHECK (student_id = auth.uid() OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'));


CREATE TABLE IF NOT EXISTS public.student_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Academic',
  icon TEXT DEFAULT 'trophy',
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence_type TEXT,
  evidence_id TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_student_achievement UNIQUE (student_id, name)
);

CREATE INDEX IF NOT EXISTS idx_student_achievements_student ON public.student_achievements(student_id);
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own achievements"
  ON public.student_achievements FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );

CREATE POLICY "System can manage student achievements"
  ON public.student_achievements FOR ALL
  TO authenticated
  USING (student_id = auth.uid() OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'))
  WITH CHECK (student_id = auth.uid() OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'));


-- =============================================================
-- SECTION 6: PROJECTS (FULL SUPABASE BACKEND)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.user_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT DEFAULT 'Personal' CHECK (project_type IN ('Personal', 'Team', 'Capstone', 'Research', 'Mini')),
  course_name TEXT,
  technology JSONB DEFAULT '[]'::jsonb,
  team_members JSONB DEFAULT '[]'::jsonb,
  deadline DATE,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'On Hold', 'Pending Review', 'Upcoming')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  github_repo_url TEXT,
  faculty_mentor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_projects_owner ON public.user_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_department ON public.user_projects(department_id);
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own projects"
  ON public.user_projects FOR ALL
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );


CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Team Member',
  contribution TEXT,
  is_owner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_project_member UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project participants can view members"
  ON public.project_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_members.project_id
        AND (p.owner_id = auth.uid() OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'))
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Project owners can manage members"
  ON public.project_members FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_members.project_id AND p.owner_id = auth.uid()
    )
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_members.project_id AND p.owner_id = auth.uid()
    )
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );


CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  priority TEXT DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  status TEXT DEFAULT 'Todo' CHECK (status IN ('Todo', 'In Progress', 'Completed', 'Blocked')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  task_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON public.project_tasks(project_id);
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project participants can view tasks"
  ON public.project_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_tasks.project_id
        AND (p.owner_id = auth.uid() OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'))
    )
  );

CREATE POLICY "Project owners can manage tasks"
  ON public.project_tasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_tasks.project_id AND p.owner_id = auth.uid()
    )
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_tasks.project_id AND p.owner_id = auth.uid()
    )
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );


CREATE TABLE IF NOT EXISTS public.project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Overdue')),
  milestone_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON public.project_milestones(project_id);
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project participants can view milestones"
  ON public.project_milestones FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_milestones.project_id
        AND (p.owner_id = auth.uid() OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'))
    )
  );

CREATE POLICY "Project owners can manage milestones"
  ON public.project_milestones FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_milestones.project_id AND p.owner_id = auth.uid()
    )
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_milestones.project_id AND p.owner_id = auth.uid()
    )
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );


CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.project_files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('file', 'folder')),
  path TEXT NOT NULL,
  content TEXT,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON public.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_parent ON public.project_files(parent_id);
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project participants can view files"
  ON public.project_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_files.project_id
        AND (p.owner_id = auth.uid() OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'))
    )
  );

CREATE POLICY "Project owners can manage files"
  ON public.project_files FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_files.project_id AND p.owner_id = auth.uid()
    )
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects p
      WHERE p.id = public.project_files.project_id AND p.owner_id = auth.uid()
    )
    OR public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
  );


-- =============================================================
-- SECTION 7: STUDENT SERVICES CATALOG
-- =============================================================

CREATE TABLE IF NOT EXISTS public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  icon TEXT DEFAULT 'file-text',
  sla_hours INTEGER DEFAULT 72,
  is_active BOOLEAN DEFAULT TRUE,
  requires_attachment BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view service catalog"
  ON public.service_catalog FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Admin can manage service catalog"
  ON public.service_catalog FOR ALL
  TO authenticated
  USING (public.get_auth_user_role() = 'ADMIN')
  WITH CHECK (public.get_auth_user_role() = 'ADMIN');

INSERT INTO public.service_catalog (name, description, category, icon, sla_hours, requires_attachment)
VALUES
  ('Bonafide Certificate', 'Request an official bonafide certificate for your current enrollment.', 'Certificates', 'award', 48, false),
  ('Transfer Certificate', 'Request transfer certificate for college change or employment.', 'Certificates', 'file-text', 168, true),
  ('Transcript Request', 'Request official academic transcripts for all semesters.', 'Academic Records', 'clipboard', 72, false),
  ('Grade Card Copy', 'Request a copy of your official semester grade cards.', 'Academic Records', 'file', 48, false),
  ('Fee Receipt Duplicate', 'Request a duplicate copy of your fee receipt.', 'Financial', 'receipt', 24, false),
  ('Library Card', 'Request or renew your library membership card.', 'Library', 'book', 24, false),
  ('Identity Card Replacement', 'Request a replacement for lost or damaged identity card.', 'Administration', 'credit-card', 48, false),
  ('NOC Letter', 'Request a No Objection Certificate for internship, job or higher studies.', 'Certificates', 'check-circle', 72, false),
  ('Lab Access Request', 'Request access to specific laboratory facilities.', 'Facilities', 'settings', 24, false),
  ('Sports Certificate', 'Request a certificate for sports participation or achievement.', 'Sports', 'activity', 48, false)
ON CONFLICT DO NOTHING;


-- =============================================================
-- SECTION 8: AUDIT LOGS
-- =============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.get_auth_user_role() = 'ADMIN');

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- =============================================================
-- SECTION 9: COURSE ENROLLMENTS
-- =============================================================

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_code TEXT,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  faculty_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  faculty_name TEXT,
  semester INTEGER,
  academic_year TEXT,
  section TEXT,
  credits INTEGER DEFAULT 3,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Dropped', 'Completed')),
  CONSTRAINT unique_student_course_enrollment UNIQUE (student_id, course_id, semester)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_student ON public.course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_department ON public.course_enrollments(department_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_faculty ON public.course_enrollments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON public.course_enrollments(course_id);

ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own enrollments, faculty/hod view department enrollments"
  ON public.course_enrollments FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR (
      public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN')
      AND (
        department_id = public.get_auth_user_department_id()
        OR public.get_auth_user_role() = 'ADMIN'
        OR faculty_id = auth.uid()
      )
    )
  );

CREATE POLICY "HOD/Admin can manage enrollments"
  ON public.course_enrollments FOR ALL
  TO authenticated
  USING (
    (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
    OR public.get_auth_user_role() = 'ADMIN'
  )
  WITH CHECK (
    (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
    OR public.get_auth_user_role() = 'ADMIN'
  );

CREATE POLICY "Faculty can create enrollments for their courses"
  ON public.course_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    faculty_id = auth.uid()
    AND department_id = public.get_auth_user_department_id()
  );


-- =============================================================
-- SECTION 10: SERVER-SIDE ASSESSMENT GRADING RPC
-- =============================================================

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
  v_student_id UUID;
  v_attempt_id UUID;
  v_assessment_status TEXT;
  v_total_marks NUMERIC := 0;
  v_max_marks NUMERIC := 0;
  v_percentage NUMERIC := 0;
  v_answer JSONB;
  v_question RECORD;
  v_is_correct BOOLEAN;
  v_marks_earned NUMERIC;
BEGIN
  v_student_id := auth.uid();
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT status INTO v_assessment_status
  FROM public.assessments
  WHERE id = p_assessment_id;

  IF v_assessment_status NOT IN ('Active', 'Upcoming') THEN
    RAISE EXCEPTION 'Assessment is not available for submission.';
  END IF;

  SELECT id INTO v_attempt_id
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id AND student_id = v_student_id;

  IF v_attempt_id IS NULL THEN
    INSERT INTO public.assessment_attempts (assessment_id, student_id, status)
    VALUES (p_assessment_id, v_student_id, 'In Progress')
    RETURNING id INTO v_attempt_id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.assessment_attempts
      WHERE id = v_attempt_id AND status = 'Submitted'
    ) THEN
      RAISE EXCEPTION 'Assessment already submitted.';
    END IF;
  END IF;

  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    SELECT id, correct_option, marks
    INTO v_question
    FROM public.assessment_questions
    WHERE id = (v_answer->>'question_id')::UUID
      AND assessment_id = p_assessment_id;

    IF v_question.id IS NULL THEN
      CONTINUE;
    END IF;

    v_is_correct := (v_answer->>'selected_option') = v_question.correct_option;
    v_marks_earned := CASE WHEN v_is_correct THEN v_question.marks ELSE 0 END;
    v_total_marks := v_total_marks + v_marks_earned;
    v_max_marks := v_max_marks + v_question.marks;

    INSERT INTO public.assessment_answers (
      attempt_id, question_id, student_id, selected_option, is_correct, marks_earned
    ) VALUES (
      v_attempt_id,
      v_question.id,
      v_student_id,
      v_answer->>'selected_option',
      v_is_correct,
      v_marks_earned
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_option = EXCLUDED.selected_option,
          is_correct = EXCLUDED.is_correct,
          marks_earned = EXCLUDED.marks_earned;
  END LOOP;

  IF v_max_marks > 0 THEN
    v_percentage := ROUND((v_total_marks / v_max_marks) * 100, 2);
  END IF;

  UPDATE public.assessment_attempts
  SET
    submitted_at = NOW(),
    score = v_total_marks,
    max_score = v_max_marks,
    percentage = v_percentage,
    status = 'Submitted'
  WHERE id = v_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_total_marks,
    'max_score', v_max_marks,
    'percentage', v_percentage,
    'status', 'Submitted'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_assessment_attempt(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_assessment_attempt(UUID, JSONB) TO authenticated;


-- =============================================================
-- SECTION 11: ANALYTICS VIEW (DERIVED FROM REAL DATA)
-- =============================================================

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
    att2.student_id,
    COUNT(*) AS total_attempts,
    ROUND(AVG(att2.percentage), 1) AS avg_percentage
  FROM public.assessment_attempts att2
  WHERE att2.status = 'Submitted'
  GROUP BY att2.student_id
) asmt ON asmt.student_id = p.id
WHERE p.role = 'STUDENT';


CREATE OR REPLACE VIEW public.student_learning_gaps_view AS
SELECT
  aa.student_id,
  at.name AS topic_name,
  asm.course_name,
  asm.course_id,
  COUNT(aq.id) AS total_questions,
  COUNT(CASE WHEN ans.is_correct = true THEN 1 END) AS correct_answers,
  COUNT(CASE WHEN ans.is_correct = false THEN 1 END) AS wrong_answers,
  CASE
    WHEN COUNT(aq.id) > 0
    THEN ROUND((COUNT(CASE WHEN ans.is_correct = true THEN 1 END)::numeric / COUNT(aq.id)) * 100, 1)
    ELSE 0
  END AS topic_score_percent
FROM public.assessment_attempts aa
JOIN public.assessment_answers ans ON ans.attempt_id = aa.id AND ans.student_id = aa.student_id
JOIN public.assessment_questions aq ON aq.id = ans.question_id
JOIN public.assessment_topics at ON at.id = aq.topic_id
JOIN public.assessments asm ON asm.id = aa.assessment_id
WHERE aa.status = 'Submitted'
GROUP BY aa.student_id, at.name, asm.course_name, asm.course_id;

GRANT SELECT ON public.student_analytics_view TO authenticated;
GRANT SELECT ON public.student_learning_gaps_view TO authenticated;

NOTIFY pgrst, 'reload schema';
