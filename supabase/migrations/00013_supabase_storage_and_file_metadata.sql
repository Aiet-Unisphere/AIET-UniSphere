-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00013: SUPABASE STORAGE & FILE METADATA INTEGRATION
-- ============================================================

-- 1. PROVISION PRIVATE STORAGE BUCKETS
-- Insert standard buckets if they do not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('assignments', 'assignments', false, 20971520, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'image/jpeg', 'image/png']),
  ('submissions', 'submissions', false, 20971520, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'image/jpeg', 'image/png', 'text/plain', 'application/json']),
  ('assessments', 'assessments', false, 20971520, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'image/jpeg', 'image/png']),
  ('announcements', 'announcements', false, 20971520, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/jpeg', 'image/png', 'image/webp']),
  ('academic-materials', 'academic-materials', false, 52428800, ARRAY['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip']),
  ('student-documents', 'student-documents', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png']),
  ('project-files', 'project-files', false, 31457280, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = false;

-- 2. ADDITIVE METADATA COLUMNS TO EXISTING STRUCTURED TABLES
-- We strictly DO NOT delete, rename, or drop existing columns.

-- Profiles: avatar storage references
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Student Profiles: avatar storage references
ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;

-- Assignments: question paper / main assignment file attachment
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Assignment Submissions: uploaded submission file metadata
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Leave Requests: supporting document metadata
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS supporting_doc_path TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS supporting_doc_name TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS supporting_doc_size BIGINT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS supporting_doc_type TEXT;

-- Announcements: attachment metadata
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS attachment_type TEXT;


-- 3. ENSURE LEAVE_ATTACHMENTS TABLE AND POLICIES ARE PROPERLY CONFIGURED
CREATE TABLE IF NOT EXISTS public.leave_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_attachments_leave_req ON public.leave_attachments(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_attachments_student ON public.leave_attachments(student_id);
ALTER TABLE public.leave_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can insert own leave attachments" ON public.leave_attachments;
CREATE POLICY "Students can insert own leave attachments"
  ON public.leave_attachments FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Users can read relevant leave attachments" ON public.leave_attachments;
CREATE POLICY "Users can read relevant leave attachments"
  ON public.leave_attachments FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.leave_requests lr
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE lr.id = public.leave_attachments.leave_request_id
        AND (
          lr.hod_id = auth.uid()
          OR (lr.department_id = p.department_id AND p.role IN ('HOD', 'ADMIN'))
          OR p.role = 'ADMIN'
        )
    )
  );

DROP POLICY IF EXISTS "Students can delete own leave attachments" ON public.leave_attachments;
CREATE POLICY "Students can delete own leave attachments"
  ON public.leave_attachments FOR DELETE
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN')
  );


-- 4. CREATE ACADEMIC MATERIALS TABLE (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.academic_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  course_id TEXT NOT NULL,
  module_id TEXT DEFAULT 'General',
  file_type TEXT NOT NULL DEFAULT 'PDF',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_materials_course ON public.academic_materials(course_id);
CREATE INDEX IF NOT EXISTS idx_academic_materials_dept ON public.academic_materials(department_id);
ALTER TABLE public.academic_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view academic materials in department" ON public.academic_materials;
CREATE POLICY "Users can view academic materials in department"
  ON public.academic_materials FOR SELECT
  TO authenticated
  USING (
    department_id = public.get_auth_user_department_id()
    OR public.get_auth_user_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "Faculty and HOD can manage academic materials" ON public.academic_materials;
CREATE POLICY "Faculty and HOD can manage academic materials"
  ON public.academic_materials FOR ALL
  TO authenticated
  USING (
    (department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
    OR public.get_auth_user_role() = 'ADMIN'
  )
  WITH CHECK (
    (department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
    OR public.get_auth_user_role() = 'ADMIN'
  );


-- 5. CREATE ASSESSMENTS TABLE (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_code TEXT,
  semester INT DEFAULT 6,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL,
  due_date DATE,
  assessment_time TEXT DEFAULT '10:00 AM',
  duration_minutes INT NOT NULL DEFAULT 60,
  total_marks NUMERIC NOT NULL DEFAULT 50,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Active', 'Completed', 'Closed')),
  storage_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  questions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessments_course ON public.assessments(course_id);
CREATE INDEX IF NOT EXISTS idx_assessments_dept ON public.assessments(department_id);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view assessments of their department" ON public.assessments;
CREATE POLICY "Users can view assessments of their department"
  ON public.assessments FOR SELECT
  TO authenticated
  USING (
    department_id = public.get_auth_user_department_id()
    OR public.get_auth_user_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "Faculty can create and manage assessments" ON public.assessments;
CREATE POLICY "Faculty can create and manage assessments"
  ON public.assessments FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('HOD', 'ADMIN'))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('HOD', 'ADMIN'))
  );


-- 6. CREATE STUDENT SERVICE REQUESTS TABLE (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.student_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  service_type_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Review', 'Resolved', 'Rejected')),
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_size BIGINT,
  attachment_type TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_student ON public.student_service_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_dept ON public.student_service_requests(department_id);
ALTER TABLE public.student_service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view and manage own service requests" ON public.student_service_requests;
CREATE POLICY "Students can view and manage own service requests"
  ON public.student_service_requests FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "HOD and Admin can review department service requests" ON public.student_service_requests;
CREATE POLICY "HOD and Admin can review department service requests"
  ON public.student_service_requests FOR SELECT
  TO authenticated
  USING (
    (department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('HOD', 'ADMIN'))
    OR public.get_auth_user_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "HOD and Admin can update department service requests" ON public.student_service_requests;
CREATE POLICY "HOD and Admin can update department service requests"
  ON public.student_service_requests FOR UPDATE
  TO authenticated
  USING (
    (department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('HOD', 'ADMIN'))
    OR public.get_auth_user_role() = 'ADMIN'
  );


-- 7. CREATE ACADEMIC CALENDAR TABLE (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.academic_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'Academic',
  description TEXT,
  storage_path TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_calendar_date ON public.academic_calendar(event_date);
ALTER TABLE public.academic_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view academic calendar" ON public.academic_calendar;
CREATE POLICY "Everyone can view academic calendar"
  ON public.academic_calendar FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage academic calendar" ON public.academic_calendar;
CREATE POLICY "Admin can manage academic calendar"
  ON public.academic_calendar FOR ALL
  TO authenticated
  USING (public.get_auth_user_role() = 'ADMIN')
  WITH CHECK (public.get_auth_user_role() = 'ADMIN');


-- ============================================================
-- 8. SUPABASE STORAGE RLS POLICIES (storage.objects)
-- ============================================================

-- A. AVATARS BUCKET POLICIES
DROP POLICY IF EXISTS "Avatars are readable by authenticated users" ON storage.objects;
CREATE POLICY "Avatars are readable by authenticated users"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- B. ASSIGNMENTS BUCKET POLICIES
DROP POLICY IF EXISTS "Department users can view assignment files" ON storage.objects;
CREATE POLICY "Department users can view assignment files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'assignments'
    AND (
      (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "Faculty can upload assignment files" ON storage.objects;
CREATE POLICY "Faculty can upload assignment files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'assignments'
    AND (
      ((storage.foldername(name))[1] = public.get_auth_user_department_id()::text AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "Faculty can delete their assignment files" ON storage.objects;
CREATE POLICY "Faculty can delete their assignment files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assignments'
    AND (
      ((storage.foldername(name))[1] = public.get_auth_user_department_id()::text AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );


-- C. SUBMISSIONS BUCKET POLICIES
DROP POLICY IF EXISTS "Users can view authorized submissions" ON storage.objects;
CREATE POLICY "Users can view authorized submissions"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (
      -- Student can view their own submissions (folder 4 is student_id)
      (storage.foldername(name))[4] = auth.uid()::text
      -- Faculty/HOD in same department can view submissions
      OR (
        (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
        AND public.get_auth_user_role() IN ('FACULTY', 'HOD')
      )
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "Students can upload own submissions" ON storage.objects;
CREATE POLICY "Students can upload own submissions"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[4] = auth.uid()::text
    AND (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
  );

DROP POLICY IF EXISTS "Students can update own submissions" ON storage.objects;
CREATE POLICY "Students can update own submissions"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[4] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Students can delete own submissions" ON storage.objects;
CREATE POLICY "Students can delete own submissions"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (
      (storage.foldername(name))[4] = auth.uid()::text
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );


-- D. ASSESSMENTS BUCKET POLICIES
DROP POLICY IF EXISTS "Department users can view assessment files" ON storage.objects;
CREATE POLICY "Department users can view assessment files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'assessments'
    AND (
      (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "Faculty can upload assessment files" ON storage.objects;
CREATE POLICY "Faculty can upload assessment files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'assessments'
    AND (
      ((storage.foldername(name))[1] = public.get_auth_user_department_id()::text AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "Faculty can delete assessment files" ON storage.objects;
CREATE POLICY "Faculty can delete assessment files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assessments'
    AND (
      ((storage.foldername(name))[1] = public.get_auth_user_department_id()::text AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );


-- E. ANNOUNCEMENTS BUCKET POLICIES
DROP POLICY IF EXISTS "Department users can view announcement files" ON storage.objects;
CREATE POLICY "Department users can view announcement files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'announcements'
    AND (
      (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "HOD and Admin can upload announcement files" ON storage.objects;
CREATE POLICY "HOD and Admin can upload announcement files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'announcements'
    AND (
      ((storage.foldername(name))[1] = public.get_auth_user_department_id()::text AND public.get_auth_user_role() IN ('HOD', 'ADMIN'))
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "HOD and Admin can delete announcement files" ON storage.objects;
CREATE POLICY "HOD and Admin can delete announcement files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'announcements'
    AND (
      ((storage.foldername(name))[1] = public.get_auth_user_department_id()::text AND public.get_auth_user_role() IN ('HOD', 'ADMIN'))
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );


-- F. ACADEMIC MATERIALS BUCKET POLICIES
DROP POLICY IF EXISTS "Department users can view academic materials" ON storage.objects;
CREATE POLICY "Department users can view academic materials"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'academic-materials'
    AND (
      (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "Faculty can upload academic materials" ON storage.objects;
CREATE POLICY "Faculty can upload academic materials"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'academic-materials'
    AND (
      ((storage.foldername(name))[1] = public.get_auth_user_department_id()::text AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "Faculty can delete academic materials" ON storage.objects;
CREATE POLICY "Faculty can delete academic materials"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'academic-materials'
    AND (
      ((storage.foldername(name))[1] = public.get_auth_user_department_id()::text AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );


-- G. STUDENT DOCUMENTS BUCKET POLICIES (Leave documents & Service requests)
DROP POLICY IF EXISTS "Users can view student documents" ON storage.objects;
CREATE POLICY "Users can view student documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (
      -- Student can view own documents (folder 1 is student_id)
      (storage.foldername(name))[1] = auth.uid()::text
      -- HOD can view department student documents
      OR public.get_auth_user_role() IN ('HOD', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "Students can upload own documents" ON storage.objects;
CREATE POLICY "Students can upload own documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Students can delete own documents" ON storage.objects;
CREATE POLICY "Students can delete own documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );


-- H. PROJECT FILES BUCKET POLICIES
DROP POLICY IF EXISTS "Authenticated users can view project files" ON storage.objects;
CREATE POLICY "Authenticated users can view project files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'project-files');

DROP POLICY IF EXISTS "Users can upload project files" ON storage.objects;
CREATE POLICY "Users can upload project files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update project files" ON storage.objects;
CREATE POLICY "Users can update project files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete project files" ON storage.objects;
CREATE POLICY "Users can delete project files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR public.get_auth_user_role() = 'ADMIN'
    )
  );
