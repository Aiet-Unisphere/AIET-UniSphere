-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00040: ATTENDANCE CORRECTION WORKFLOW & HARDENING
-- Resolves DEF-08.1-02: Faculty Attendance Correction Workflow & Immutability
-- ============================================================

-- 1. CREATE IMMUTABLE ATTENDANCE CORRECTIONS LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL CHECK (previous_status IN ('Present', 'Absent', 'Late')),
  new_status TEXT NOT NULL CHECK (new_status IN ('Present', 'Absent', 'Late')),
  corrected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  correction_reason TEXT NOT NULL CHECK (length(trim(correction_reason)) >= 5 AND length(trim(correction_reason)) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_session ON public.attendance_corrections(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_record ON public.attendance_corrections(record_id);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_student ON public.attendance_corrections(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_created_at ON public.attendance_corrections(created_at);

ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;

-- 2. IMMUTABLE PROTECTION TRIGGER ON ATTENDANCE CORRECTIONS LEDGER
-- Completely blocks UPDATE and direct DELETE operations on the ledger
CREATE OR REPLACE FUNCTION public.prevent_attendance_corrections_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Attendance correction ledger entries are immutable and cannot be updated.';
  ELSIF TG_OP = 'DELETE' THEN
    -- Prevent direct deletion of ledger entries; allow foreign key cascades from session/record cleanup
    IF pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'Attendance correction ledger entries are immutable and cannot be deleted directly.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_attendance_corrections_mod ON public.attendance_corrections;
CREATE TRIGGER trg_prevent_attendance_corrections_mod
  BEFORE UPDATE OR DELETE ON public.attendance_corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_attendance_corrections_modification();

-- 3. PERMISSIONS & RLS POLICIES ON ATTENDANCE CORRECTIONS LEDGER
-- Deny direct INSERT/UPDATE/DELETE from authenticated and anon clients; mutations occur only via SECURITY DEFINER RPC
REVOKE INSERT, UPDATE, DELETE ON public.attendance_corrections FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.attendance_corrections TO authenticated;

DROP POLICY IF EXISTS "Users can view authorized attendance corrections" ON public.attendance_corrections;
CREATE POLICY "Users can view authorized attendance corrections"
  ON public.attendance_corrections FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.get_auth_user_role() = 'ADMIN'
    OR (
      EXISTS (
        SELECT 1 FROM public.attendance_sessions s
        WHERE s.id = public.attendance_corrections.session_id
          AND (
            s.faculty_id = auth.uid()
            OR (public.get_auth_user_role() = 'HOD' AND s.department_id = public.get_auth_user_department_id())
            OR (
              public.get_auth_user_role() = 'FACULTY'
              AND s.department_id = public.get_auth_user_department_id()
              AND (
                EXISTS (
                  SELECT 1 FROM public.course_enrollments ce
                  WHERE ce.faculty_id = auth.uid()
                    AND (ce.course_id = s.course_id OR ce.course_code = s.course_id)
                )
                OR EXISTS (
                  SELECT 1 FROM public.timetable_entries te
                  WHERE te.faculty_id = auth.uid()
                    AND (te.course_id = s.course_id OR te.course_code = s.course_id)
                )
              )
            )
          )
      )
    )
  );

-- 4. ATTENDANCE RECORD METADATA ENHANCEMENT
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_corrected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT DEFAULT NULL;

-- 5. ELIMINATE DIRECT UNAUTHORIZED WRITES (REVISE MIGRATION 00014 RLS)
-- Drop unsafe department-wide write policies
DROP POLICY IF EXISTS "Faculty can manage department attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Faculty can manage attendance records" ON public.attendance_records;

-- Only ADMIN can directly manage attendance tables via REST API; all faculty workflows use atomic RPCs
DROP POLICY IF EXISTS "Admin can manage attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Admin can manage attendance sessions"
  ON public.attendance_sessions FOR ALL
  TO authenticated
  USING (public.get_auth_user_role() = 'ADMIN')
  WITH CHECK (public.get_auth_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admin can manage attendance records" ON public.attendance_records;
CREATE POLICY "Admin can manage attendance records"
  ON public.attendance_records FOR ALL
  TO authenticated
  USING (public.get_auth_user_role() = 'ADMIN')
  WITH CHECK (public.get_auth_user_role() = 'ADMIN');

-- 6. IMMUTABLE FINALIZED SESSION METADATA TRIGGER
-- Blocks altering core academic metadata of recorded sessions
CREATE OR REPLACE FUNCTION public.enforce_attendance_session_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.course_id IS DISTINCT FROM OLD.course_id THEN
    RAISE EXCEPTION 'Finalized attendance session course_id is immutable.';
  END IF;
  IF NEW.session_date IS DISTINCT FROM OLD.session_date THEN
    RAISE EXCEPTION 'Finalized attendance session date is immutable.';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Attendance session ID is immutable.';
  END IF;
  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    RAISE EXCEPTION 'Attendance session department is immutable.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_attendance_session_immutability ON public.attendance_sessions;
CREATE TRIGGER trg_enforce_attendance_session_immutability
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_attendance_session_immutability();

-- 7. ATOMIC TRANSACTION RPC: correct_attendance_record_atomic
CREATE OR REPLACE FUNCTION public.correct_attendance_record_atomic(
  p_record_id UUID,
  p_new_status TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_dept UUID;
  v_rec RECORD;
  v_session RECORD;
  v_is_authorized BOOLEAN := FALSE;
  v_new_present INT;
  v_new_absent INT;
  v_new_late INT;
  v_new_total INT;
  v_clean_reason TEXT;
  v_result JSONB;
BEGIN
  -- 1. Explicit caller authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to correct attendance.';
  END IF;

  -- 2. Verify caller active status, role, and department
  SELECT role, department_id INTO v_caller_role, v_caller_dept
  FROM public.profiles
  WHERE id = v_caller_id AND account_status = 'ACTIVE';

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found or inactive.';
  END IF;

  IF v_caller_role = 'STUDENT' THEN
    RAISE EXCEPTION 'Unauthorized: Students are not permitted to correct attendance records.';
  END IF;

  IF v_caller_role NOT IN ('FACULTY', 'HOD', 'ADMIN') THEN
    RAISE EXCEPTION 'Unauthorized: Only faculty, HOD, and administrators can correct attendance.';
  END IF;

  -- 3. Input validation
  IF p_record_id IS NULL THEN
    RAISE EXCEPTION 'Attendance record ID is required.';
  END IF;

  IF p_new_status IS NULL OR p_new_status NOT IN ('Present', 'Absent', 'Late') THEN
    RAISE EXCEPTION 'Invalid attendance status "%". Supported statuses are Present, Absent, Late.', p_new_status;
  END IF;

  v_clean_reason := trim(p_reason);
  IF v_clean_reason IS NULL OR length(v_clean_reason) < 5 THEN
    RAISE EXCEPTION 'Correction reason must be at least 5 characters long.';
  END IF;
  IF length(v_clean_reason) > 500 THEN
    RAISE EXCEPTION 'Correction reason cannot exceed 500 characters.';
  END IF;

  -- 4. Lock and load attendance record
  SELECT * INTO v_rec
  FROM public.attendance_records
  WHERE id = p_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found.';
  END IF;

  -- 5. Lock and load parent attendance session
  SELECT * INTO v_session
  FROM public.attendance_sessions
  WHERE id = v_rec.session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent attendance session not found.';
  END IF;

  -- 6. Verify record and session integrity
  IF v_rec.session_id <> v_session.id THEN
    RAISE EXCEPTION 'Record session association mismatch.';
  END IF;

  -- 7. Strict Teaching-Assignment Authorization
  IF v_caller_role = 'ADMIN' THEN
    v_is_authorized := TRUE;
  ELSIF v_caller_role = 'HOD' THEN
    IF v_caller_dept IS NOT NULL AND v_caller_dept = v_session.department_id THEN
      v_is_authorized := TRUE;
    END IF;
  ELSIF v_caller_role = 'FACULTY' THEN
    -- Check if session creator
    IF v_session.faculty_id = v_caller_id THEN
      v_is_authorized := TRUE;
    -- Or assigned to course via course_enrollments or timetable_entries within the department
    ELSIF v_caller_dept IS NOT NULL AND v_caller_dept = v_session.department_id THEN
      IF EXISTS (
        SELECT 1 FROM public.course_enrollments ce
        WHERE ce.faculty_id = v_caller_id
          AND (ce.course_id = v_session.course_id OR ce.course_code = v_session.course_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.timetable_entries te
        WHERE te.faculty_id = v_caller_id
          AND (te.course_id = v_session.course_id OR te.course_code = v_session.course_id)
      ) THEN
        v_is_authorized := TRUE;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: You are not authorized to correct attendance for this course session.';
  END IF;

  -- 8. Idempotency Check: If record already has requested status, return safely without duplicate ledger entry
  IF v_rec.status = p_new_status THEN
    SELECT jsonb_build_object(
      'record_id', p_record_id,
      'session_id', v_session.id,
      'student_id', v_rec.student_id,
      'previous_status', v_rec.status,
      'new_status', p_new_status,
      'present_count', v_session.present_count,
      'absent_count', v_session.absent_count,
      'late_count', v_session.late_count,
      'total_students', v_session.total_students,
      'corrected_at', COALESCE(v_rec.updated_at, v_rec.created_at),
      'is_idempotent', true
    ) INTO v_result;
    RETURN v_result;
  END IF;

  -- 9. Update the attendance record
  UPDATE public.attendance_records
  SET
    status = p_new_status,
    remarks = v_clean_reason,
    updated_at = NOW(),
    is_corrected = TRUE,
    last_corrected_by = v_caller_id,
    correction_reason = v_clean_reason
  WHERE id = p_record_id;

  -- 10. Recalculate parent session counters atomically
  SELECT
    COUNT(*) FILTER (WHERE status = 'Present'),
    COUNT(*) FILTER (WHERE status = 'Absent'),
    COUNT(*) FILTER (WHERE status = 'Late'),
    COUNT(*)
  INTO v_new_present, v_new_absent, v_new_late, v_new_total
  FROM public.attendance_records
  WHERE session_id = v_session.id;

  UPDATE public.attendance_sessions
  SET
    present_count = v_new_present,
    absent_count = v_new_absent,
    late_count = v_new_late,
    total_students = v_new_total
  WHERE id = v_session.id;

  -- 11. Insert into immutable attendance_corrections ledger
  INSERT INTO public.attendance_corrections (
    session_id,
    record_id,
    student_id,
    previous_status,
    new_status,
    corrected_by,
    correction_reason,
    created_at
  ) VALUES (
    v_session.id,
    p_record_id,
    v_rec.student_id,
    v_rec.status,
    p_new_status,
    v_caller_id,
    v_clean_reason,
    NOW()
  );

  -- 12. Central system audit logging (safe insert into public.audit_logs if table exists)
  BEGIN
    INSERT INTO public.audit_logs (
      actor_id,
      actor_role,
      action,
      entity_type,
      entity_id,
      description,
      metadata
    ) VALUES (
      v_caller_id,
      v_caller_role,
      'ATTENDANCE_CORRECTED',
      'attendance_records',
      p_record_id::text,
      format('Attendance for student %s changed from %s to %s', v_rec.student_id, v_rec.status, p_new_status),
      jsonb_build_object(
        'session_id', v_session.id,
        'course_id', v_session.course_id,
        'previous_status', v_rec.status,
        'new_status', p_new_status,
        'reason', v_clean_reason
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 13. Construct and return response JSON
  SELECT jsonb_build_object(
    'record_id', p_record_id,
    'session_id', v_session.id,
    'student_id', v_rec.student_id,
    'previous_status', v_rec.status,
    'new_status', p_new_status,
    'present_count', v_new_present,
    'absent_count', v_new_absent,
    'late_count', v_new_late,
    'total_students', v_new_total,
    'corrected_at', NOW(),
    'is_idempotent', false
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 8. RPC EXECUTION GRANTS
REVOKE EXECUTE ON FUNCTION public.correct_attendance_record_atomic(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_attendance_record_atomic(UUID, TEXT, TEXT) TO authenticated;

-- 9. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
