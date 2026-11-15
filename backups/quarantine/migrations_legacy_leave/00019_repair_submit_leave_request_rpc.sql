-- ============================================================
-- AIET-UNISPHERE - MIGRATION 00019: REPAIR LEAVE SUBMISSION RPC
-- ============================================================
-- Recreate the submission RPC for environments where migration 00014 was
-- partially applied or the function was removed during schema maintenance.

CREATE OR REPLACE FUNCTION public.get_department_hod(p_department_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  department_id UUID,
  account_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.role, p.department_id, p.account_status
  FROM public.profiles p
  JOIN public.departments d ON d.id = p.department_id
  WHERE p.role = 'HOD'
    AND p.department_id = p_department_id
    AND p.account_status = 'ACTIVE'
    AND d.status = 'ACTIVE'
  ORDER BY p.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_department_hod(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_leave_request(
  p_leave_type TEXT,
  p_reason TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid();
  v_department_id UUID;
  v_hod_id UUID;
  v_request public.leave_requests;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF trim(COALESCE(p_leave_type, '')) = '' OR trim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Leave type and reason are required.';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start date and end date are required.';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Leave end date cannot be before the start date.';
  END IF;

  IF p_leave_type NOT ILIKE '%attendance%' AND p_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Leave start date cannot be in the past.';
  END IF;

  SELECT p.department_id
    INTO v_department_id
  FROM public.profiles p
  JOIN public.departments d ON d.id = p.department_id
  WHERE p.id = v_student_id
    AND p.role = 'STUDENT'
    AND p.account_status = 'ACTIVE'
    AND d.status = 'ACTIVE';

  IF v_department_id IS NULL THEN
    RAISE EXCEPTION 'Your profile is not associated with a valid department. Please contact the administrator.';
  END IF;

  SELECT h.id
    INTO v_hod_id
  FROM public.get_department_hod(v_department_id) h;

  IF v_hod_id IS NULL THEN
    RAISE EXCEPTION 'No HOD is currently assigned to your department. Please contact the administrator.';
  END IF;

  INSERT INTO public.leave_requests (
    student_id, department_id, hod_id, leave_type, reason,
    start_date, end_date, status
  )
  VALUES (
    v_student_id, v_department_id, v_hod_id, trim(p_leave_type), trim(p_reason),
    p_start_date, p_end_date, 'PENDING'
  )
  RETURNING * INTO v_request;

  INSERT INTO public.notifications (
    user_id, title, short_message, full_message, source, category, type, related_link
  )
  SELECT
    v_hod_id,
    'New Leave Request Received',
    'New leave request ' || v_request.reference_id || ' requires your review.',
    'A student from your department submitted a ' || v_request.leave_type ||
      ' request from ' || v_request.start_date || ' to ' || v_request.end_date || '.',
    'Student Portal', 'Leave', 'Request', '/hod/leave-requests'
  WHERE EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_hod_id AND role = 'HOD' AND account_status = 'ACTIVE'
  );

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_leave_request(TEXT, TEXT, DATE, DATE) TO authenticated;