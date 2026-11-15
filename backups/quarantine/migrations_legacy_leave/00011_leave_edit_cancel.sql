-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00011: LEAVE EDIT + CANCEL
-- ============================================================

ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

CREATE OR REPLACE FUNCTION public.update_leave_request(
  p_leave_id UUID,
  p_leave_type TEXT,
  p_reason TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_leave RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_leave_type IS NULL OR TRIM(p_leave_type) = '' THEN
    RAISE EXCEPTION 'Leave type is required.';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required.';
  END IF;

  IF p_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Leave start date cannot be in the past.';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Leave end date cannot be before the start date.';
  END IF;

  SELECT * INTO v_leave
  FROM public.leave_requests
  WHERE id = p_leave_id
  FOR UPDATE;

  IF v_leave IS NULL THEN
    RAISE EXCEPTION 'Leave request not found.';
  END IF;

  IF v_leave.student_id <> v_caller_id THEN
    RAISE EXCEPTION 'You can only edit your own leave request.';
  END IF;

  IF v_leave.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This leave request is already reviewed and can no longer be edited.';
  END IF;

  UPDATE public.leave_requests
  SET
    leave_type = TRIM(p_leave_type),
    reason = TRIM(p_reason),
    start_date = p_start_date,
    end_date = p_end_date,
    reviewed_by = NULL,
    reviewed_at = NULL,
    rejection_reason = NULL
  WHERE id = p_leave_id;

  RETURN jsonb_build_object(
    'success', true,
    'leave_id', p_leave_id,
    'status', 'PENDING'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_leave_request(UUID, TEXT, TEXT, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_leave_request(
  p_leave_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_leave RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_leave
  FROM public.leave_requests
  WHERE id = p_leave_id
  FOR UPDATE;

  IF v_leave IS NULL THEN
    RAISE EXCEPTION 'Leave request not found.';
  END IF;

  IF v_leave.student_id <> v_caller_id THEN
    RAISE EXCEPTION 'You can only cancel your own leave request.';
  END IF;

  IF v_leave.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This leave request has already been reviewed and cannot be cancelled.';
  END IF;

  UPDATE public.leave_requests
  SET
    status = 'CANCELLED',
    reviewed_by = NULL,
    reviewed_at = NULL,
    rejection_reason = NULL
  WHERE id = p_leave_id;

  RETURN jsonb_build_object(
    'success', true,
    'leave_id', p_leave_id,
    'status', 'CANCELLED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_leave_request(UUID) TO authenticated;
