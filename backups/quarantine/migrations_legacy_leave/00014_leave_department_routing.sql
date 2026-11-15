-- ============================================================
-- AIET-UNISPHERE - MIGRATION 00014: CURRENT DEPARTMENT ROUTING
-- ============================================================

-- Resolve the active HOD from the current department/profile relationship.
-- No auth user UUID is persisted in this function or migration.
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

-- Atomically resolve the student's current department and HOD, create the
-- request, and notify that exact current HOD.
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

-- Re-apply review authorization against the current active HOD profile.
CREATE OR REPLACE FUNCTION public.review_leave_request(
  p_leave_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_dept_id UUID;
  v_current_hod_id UUID;
  v_leave RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT role, department_id
    INTO v_caller_role, v_caller_dept_id
  FROM public.profiles
  WHERE id = v_caller_id
    AND account_status = 'ACTIVE';

  IF v_caller_role NOT IN ('HOD', 'ADMIN') THEN
    RAISE EXCEPTION 'Only active HODs or Administrators are authorized to review leave requests.';
  END IF;

  IF v_caller_role = 'HOD' THEN
    SELECT h.id INTO v_current_hod_id
    FROM public.get_department_hod(v_caller_dept_id) h;
    IF v_current_hod_id IS NULL OR v_current_hod_id <> v_caller_id THEN
      RAISE EXCEPTION 'Only the current HOD can review leave requests for this department.';
    END IF;
  END IF;

  SELECT * INTO v_leave
  FROM public.leave_requests
  WHERE id = p_leave_id;

  IF v_leave IS NULL THEN
    RAISE EXCEPTION 'Leave request not found.';
  END IF;

  IF v_caller_role = 'HOD' AND v_leave.department_id <> v_caller_dept_id THEN
    RAISE EXCEPTION 'ACCESS DENIED: You are only authorized to review leave requests for your department.';
  END IF;

  IF v_leave.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This leave request has already been reviewed (status: %). Only pending requests can be modified.', v_leave.status;
  END IF;

  IF p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid status. Must be APPROVED or REJECTED.';
  END IF;

  IF p_status = 'REJECTED' AND (p_rejection_reason IS NULL OR TRIM(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'Rejection reason is required when rejecting a leave request.';
  END IF;

  UPDATE public.leave_requests
  SET status = p_status,
      reviewed_by = v_caller_id,
      reviewed_at = NOW(),
      rejection_reason = CASE WHEN p_status = 'REJECTED' THEN TRIM(p_rejection_reason) ELSE NULL END
  WHERE id = p_leave_id;

  INSERT INTO public.notifications (
    user_id, title, short_message, full_message, source, category, type, related_link
  )
  VALUES (
    v_leave.student_id,
    CASE WHEN p_status = 'APPROVED' THEN 'Leave Request Approved' ELSE 'Leave Request Rejected' END,
    CASE WHEN p_status = 'APPROVED'
      THEN 'Your leave request ' || COALESCE(v_leave.reference_id, '') || ' has been approved.'
      ELSE 'Your leave request ' || COALESCE(v_leave.reference_id, '') || ' has been rejected.'
    END,
    CASE WHEN p_status = 'APPROVED'
      THEN 'Your ' || v_leave.leave_type || ' request (' || COALESCE(v_leave.reference_id, '') ||
        ') from ' || v_leave.start_date || ' to ' || v_leave.end_date || ' has been approved.'
      ELSE 'Your ' || v_leave.leave_type || ' request (' || COALESCE(v_leave.reference_id, '') ||
        ') was rejected. Reason: ' || TRIM(p_rejection_reason)
    END,
    'HOD Portal', 'Leave',
    CASE WHEN p_status = 'APPROVED' THEN 'Approval' ELSE 'Rejection' END,
    '/student/leave-requests'
  );

  RETURN jsonb_build_object(
    'success', true,
    'leave_id', p_leave_id,
    'status', p_status,
    'reviewed_by', v_caller_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT) TO authenticated;

-- Keep HOD visibility department-based and prevent updates through a stale
-- hod_id alone. The review RPC remains the authoritative approval path.
DROP POLICY IF EXISTS "Users can read relevant leave requests" ON public.leave_requests;
CREATE POLICY "Users can read relevant leave requests"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.account_status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'HOD'
        AND p.account_status = 'ACTIVE'
        AND p.department_id = leave_requests.department_id
    )
  );

DROP POLICY IF EXISTS "HODs can approve or reject leave requests" ON public.leave_requests;
CREATE POLICY "HODs can approve or reject leave requests"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.account_status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'HOD'
        AND p.account_status = 'ACTIVE'
        AND p.department_id = leave_requests.department_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.account_status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'HOD'
        AND p.account_status = 'ACTIVE'
        AND p.department_id = leave_requests.department_id
    )
  );
