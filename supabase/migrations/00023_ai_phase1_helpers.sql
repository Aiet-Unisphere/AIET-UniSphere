-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00023: AI PHASE 1 QUERY HELPERS
-- ============================================================
-- These RPCs are used by the ai-chat Edge Function for Phase 1
-- internal database queries. Each function:
--   1. Validates caller authentication
--   2. Validates caller role
--   3. Enforces data ownership (student_id = auth.uid())
--   4. Returns JSONB for structured context building
--
-- SECURITY: No arbitrary SQL execution is possible.
-- All queries are predefined and scoped to the authenticated user.
-- ============================================================

-- ============================================================
-- RPC 1: get_my_leave_summary
-- Returns the authenticated student's own leave requests.
-- Students can only see their own leave requests.
-- HODs/Admins are NOT expected to use this via the AI layer
-- (they have their own portal views).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_leave_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_status TEXT;
  v_result JSONB;
BEGIN
  -- 1. Require authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: You must be signed in to access leave request information.';
  END IF;

  -- 2. Validate caller profile & account status
  SELECT role, account_status
  INTO v_caller_role, v_caller_status
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User profile not found.';
  END IF;

  IF v_caller_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Your account is not currently active.';
  END IF;

  -- 3. Students only — Faculty/HOD/Admin have their own portal views
  IF v_caller_role <> 'STUDENT' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: This function is only available to students. Faculty and HOD should use their department portal.';
  END IF;

  -- 4. Fetch strictly own leave requests (student_id = auth.uid())
  SELECT jsonb_agg(
    jsonb_build_object(
      'reference_id', lr.reference_id,
      'leave_type', lr.leave_type,
      'reason', lr.reason,
      'start_date', lr.start_date,
      'end_date', lr.end_date,
      'status', lr.status,
      'created_at', lr.created_at,
      'rejection_reason', lr.rejection_reason,
      'reviewed_at', lr.reviewed_at
    )
    ORDER BY lr.created_at DESC
  )
  INTO v_result
  FROM public.leave_requests lr
  WHERE lr.student_id = v_caller_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_leave_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_leave_summary() TO authenticated;


-- ============================================================
-- RPC 2: get_my_attendance_summary
-- Returns per-course attendance breakdown for the authenticated student.
-- Aggregates attendance_records joined with attendance_sessions.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_attendance_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_status TEXT;
  v_result JSONB;
BEGIN
  -- 1. Require authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: You must be signed in to access attendance information.';
  END IF;

  -- 2. Validate caller profile & account status
  SELECT role, account_status
  INTO v_caller_role, v_caller_status
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User profile not found.';
  END IF;

  IF v_caller_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Your account is not currently active.';
  END IF;

  -- 3. Students only for own attendance
  IF v_caller_role <> 'STUDENT' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: This function is only available to students.';
  END IF;

  -- 4. Aggregate per-course attendance (student_id = auth.uid() enforced)
  SELECT jsonb_agg(
    jsonb_build_object(
      'course_id', s.course_id,
      'course_name', s.course_name,
      'total_sessions', COUNT(DISTINCT ar.session_id),
      'present_count', COUNT(DISTINCT CASE WHEN ar.status IN ('Present', 'Late') THEN ar.session_id END),
      'absent_count', COUNT(DISTINCT CASE WHEN ar.status = 'Absent' THEN ar.session_id END),
      'attendance_percentage', CASE
        WHEN COUNT(DISTINCT ar.session_id) > 0
        THEN ROUND((COUNT(DISTINCT CASE WHEN ar.status IN ('Present', 'Late') THEN ar.session_id END)::numeric / COUNT(DISTINCT ar.session_id)) * 100, 1)
        ELSE 0
      END
    )
  )
  INTO v_result
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE ar.student_id = v_caller_id
  GROUP BY s.course_id, s.course_name;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_attendance_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_attendance_summary() TO authenticated;


-- ============================================================
-- RELOAD POSTGREST SCHEMA CACHE
-- ============================================================
NOTIFY pgrst, 'reload schema';
