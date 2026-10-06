-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00014: ATTENDANCE SESSIONS, RECORDS, ATOMIC RPC & RLS (HARDENED)
-- ============================================================

-- 1. CREATE ATTENDANCE SESSIONS TABLE
-- Preserves historical sessions on department/faculty deletion via ON DELETE SET NULL
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  faculty_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  session_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  section TEXT,
  semester INT,
  total_students INT NOT NULL DEFAULT 0,
  present_count INT NOT NULL DEFAULT 0,
  absent_count INT NOT NULL DEFAULT 0,
  late_count INT NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_dept ON public.attendance_sessions(department_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_faculty ON public.attendance_sessions(faculty_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_course ON public.attendance_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON public.attendance_sessions(session_date);

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- 2. CREATE ATTENDANCE RECORDS TABLE
-- Preserves historical records on student account deletion via ON DELETE SET NULL
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_session_student UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON public.attendance_records(status);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES FOR ATTENDANCE SESSIONS
DROP POLICY IF EXISTS "Department users can view attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Department users can view attendance sessions"
  ON public.attendance_sessions FOR SELECT
  TO authenticated
  USING (
    department_id = public.get_auth_user_department_id()
    OR public.get_auth_user_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "Faculty can manage department attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Faculty can manage department attendance sessions"
  ON public.attendance_sessions FOR ALL
  TO authenticated
  USING (
    ((department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD')) OR faculty_id = auth.uid())
    OR public.get_auth_user_role() = 'ADMIN'
  )
  WITH CHECK (
    ((department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD')) OR faculty_id = auth.uid())
    OR public.get_auth_user_role() = 'ADMIN'
  );

-- 4. RLS POLICIES FOR ATTENDANCE RECORDS
DROP POLICY IF EXISTS "Users can view relevant attendance records" ON public.attendance_records;
CREATE POLICY "Users can view relevant attendance records"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = public.attendance_records.session_id
        AND (s.department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD', 'ADMIN'))
    )
    OR public.get_auth_user_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "Faculty can manage attendance records" ON public.attendance_records;
CREATE POLICY "Faculty can manage attendance records"
  ON public.attendance_records FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = public.attendance_records.session_id
        AND ((s.department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD')) OR s.faculty_id = auth.uid())
    )
    OR public.get_auth_user_role() = 'ADMIN'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = public.attendance_records.session_id
        AND ((s.department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD')) OR s.faculty_id = auth.uid())
    )
    OR public.get_auth_user_role() = 'ADMIN'
  );

-- 5. ATOMIC RPC FUNCTION TO RECORD ATTENDANCE SESSION AND RECORDS (HARDENED)
CREATE OR REPLACE FUNCTION public.record_attendance_session_atomic(
  p_course_id TEXT,
  p_course_name TEXT,
  p_session_date DATE,
  p_start_time TEXT,
  p_end_time TEXT,
  p_section TEXT,
  p_semester INT,
  p_remarks TEXT,
  p_records JSONB,
  p_department_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_dept_id UUID;
  v_target_dept_id UUID;
  v_dept_active BOOLEAN;
  v_session_id UUID;
  v_total INT := 0;
  v_present INT := 0;
  v_absent INT := 0;
  v_late INT := 0;
  v_rec JSONB;
  v_student_id UUID;
  v_status TEXT;
  v_rec_remarks TEXT;
  v_student_ids UUID[] := ARRAY[]::UUID[];
  v_valid_student_count INT := 0;
  v_result JSONB;
BEGIN
  -- 1. Explicit caller authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record attendance.';
  END IF;

  -- 2. Load caller profile and role
  SELECT role, department_id 
  INTO v_caller_role, v_caller_dept_id
  FROM public.profiles 
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- 3. Strict role authorization check (Reject STUDENT)
  IF v_caller_role = 'STUDENT' THEN
    RAISE EXCEPTION 'Students are not authorized to create or modify attendance sessions.';
  END IF;

  IF v_caller_role NOT IN ('FACULTY', 'HOD', 'ADMIN') THEN
    RAISE EXCEPTION 'Unauthorized: Only faculty, HOD, and administrators can record attendance sessions.';
  END IF;

  -- 4. Enforce & validate target department
  IF v_caller_role IN ('FACULTY', 'HOD') THEN
    IF v_caller_dept_id IS NULL THEN
      RAISE EXCEPTION 'Faculty or HOD must be assigned to an active department to record attendance.';
    END IF;
    v_target_dept_id := v_caller_dept_id;
  ELSIF v_caller_role = 'ADMIN' THEN
    v_target_dept_id := COALESCE(p_department_id, v_caller_dept_id);
    IF v_target_dept_id IS NULL THEN
      RAISE EXCEPTION 'Administrator must specify a target department for the attendance session.';
    END IF;
  END IF;

  -- 5. Verify target department exists and is active
  SELECT (status = 'ACTIVE') INTO v_dept_active
  FROM public.departments
  WHERE id = v_target_dept_id;

  IF v_dept_active IS NULL OR NOT v_dept_active THEN
    RAISE EXCEPTION 'Target department does not exist or is currently inactive.';
  END IF;

  -- 6. Validate input parameters
  IF p_course_id IS NULL OR TRIM(p_course_id) = '' THEN
    RAISE EXCEPTION 'Course ID/Code is required.';
  END IF;
  IF p_course_name IS NULL OR TRIM(p_course_name) = '' THEN
    RAISE EXCEPTION 'Course Name is required.';
  END IF;
  IF p_session_date IS NULL THEN
    RAISE EXCEPTION 'Session date is required.';
  END IF;
  IF p_start_time IS NULL OR TRIM(p_start_time) = '' THEN
    RAISE EXCEPTION 'Start time is required.';
  END IF;
  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
    RAISE EXCEPTION 'Attendance records payload must be a JSON array.';
  END IF;

  -- 7. Validate records payload, check duplicates and valid statuses
  FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    v_student_id := (v_rec->>'student_id')::UUID;
    IF v_student_id IS NULL THEN
      RAISE EXCEPTION 'Invalid or missing student_id in attendance record.';
    END IF;

    -- Reject duplicate student_id in payload
    IF v_student_id = ANY(v_student_ids) THEN
      RAISE EXCEPTION 'Duplicate student_id % found in attendance records payload.', v_student_id;
    END IF;

    v_student_ids := array_append(v_student_ids, v_student_id);

    v_status := v_rec->>'status';
    IF v_status = 'Present' THEN
      v_present := v_present + 1;
    ELSIF v_status = 'Absent' THEN
      v_absent := v_absent + 1;
    ELSIF v_status = 'Late' THEN
      v_late := v_late + 1;
    ELSE
      RAISE EXCEPTION 'Invalid attendance status "%" for student %', v_status, v_student_id;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  -- 8. Verify EVERY student_id exists, has role STUDENT, and belongs to v_target_dept_id
  IF v_total > 0 THEN
    SELECT COUNT(*) INTO v_valid_student_count
    FROM public.profiles
    WHERE id = ANY(v_student_ids)
      AND role = 'STUDENT'
      AND department_id = v_target_dept_id;

    IF v_valid_student_count <> v_total THEN
      RAISE EXCEPTION 'One or more students are invalid, not registered with role STUDENT, or do not belong to the target department.';
    END IF;
  END IF;

  -- 9. Insert Session Header (No fake defaults: section and semester are saved as provided or NULL)
  INSERT INTO public.attendance_sessions (
    department_id,
    faculty_id,
    course_id,
    course_name,
    session_date,
    start_time,
    end_time,
    section,
    semester,
    total_students,
    present_count,
    absent_count,
    late_count,
    remarks
  ) VALUES (
    v_target_dept_id,
    v_caller_id,
    TRIM(p_course_id),
    TRIM(p_course_name),
    p_session_date,
    TRIM(p_start_time),
    NULLIF(TRIM(p_end_time), ''),
    NULLIF(TRIM(p_section), ''),
    p_semester,
    v_total,
    v_present,
    v_absent,
    v_late,
    NULLIF(TRIM(p_remarks), '')
  ) RETURNING id INTO v_session_id;

  -- 10. Insert All Student Attendance Records Atomically
  FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    v_student_id := (v_rec->>'student_id')::UUID;
    v_status := v_rec->>'status';
    v_rec_remarks := NULLIF(TRIM(v_rec->>'remarks'), '');

    INSERT INTO public.attendance_records (
      session_id,
      student_id,
      status,
      remarks
    ) VALUES (
      v_session_id,
      v_student_id,
      v_status,
      v_rec_remarks
    )
    ON CONFLICT (session_id, student_id) DO UPDATE
    SET status = EXCLUDED.status, remarks = EXCLUDED.remarks;
  END LOOP;

  -- 11. Return JSON representation of created session
  SELECT jsonb_build_object(
    'id', s.id,
    'department_id', s.department_id,
    'faculty_id', s.faculty_id,
    'course_id', s.course_id,
    'course_name', s.course_name,
    'session_date', s.session_date,
    'start_time', s.start_time,
    'end_time', s.end_time,
    'section', s.section,
    'semester', s.semester,
    'total_students', s.total_students,
    'present_count', s.present_count,
    'absent_count', s.absent_count,
    'late_count', s.late_count,
    'remarks', s.remarks,
    'created_at', s.created_at
  ) INTO v_result
  FROM public.attendance_sessions s
  WHERE s.id = v_session_id;

  RETURN v_result;
END;
$$;

-- 6. RPC PERMISSIONS HARDENING
REVOKE EXECUTE ON FUNCTION public.record_attendance_session_atomic(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, INT, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_attendance_session_atomic(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, INT, TEXT, JSONB, UUID) TO authenticated;

-- 7. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
