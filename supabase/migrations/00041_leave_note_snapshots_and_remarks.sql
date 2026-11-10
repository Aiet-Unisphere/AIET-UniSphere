-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00041: LEAVE NOTE SNAPSHOTS & REMARKS
-- ============================================================
-- Adds immutable snapshot columns for student academic identity,
-- section, contact numbers, and HOD approval remarks to ensure
-- tamper-proof physical leave note PDF generation matching official
-- AIET institutional records.

-- 1. ADD SNAPSHOT AND REMARKS COLUMNS TO LEAVE REQUESTS
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS student_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS student_usn_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS branch_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS section_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS semester_snapshot INT,
  ADD COLUMN IF NOT EXISTS academic_year_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS student_phone_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS approval_remarks TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_provenance TEXT DEFAULT 'SUBMISSION';

-- 2. BACKFILL HISTORICAL SNAPSHOTS FROM EXISTING PROFILES WHERE MISSING
UPDATE public.leave_requests lr
SET
  student_name_snapshot = COALESCE(lr.student_name_snapshot, p.full_name),
  student_usn_snapshot = COALESCE(lr.student_usn_snapshot, p.usn_or_employee_id),
  branch_snapshot = COALESCE(lr.branch_snapshot, d.name),
  semester_snapshot = COALESCE(lr.semester_snapshot, sp.semester),
  academic_year_snapshot = COALESCE(lr.academic_year_snapshot, sp.academic_year),
  student_phone_snapshot = COALESCE(lr.student_phone_snapshot, sp.phone),
  parent_phone_snapshot = COALESCE(lr.parent_phone_snapshot, sp.parent_phone)
FROM public.profiles p
LEFT JOIN public.departments d ON p.department_id = d.id
LEFT JOIN public.student_profiles sp ON p.id = sp.profile_id
WHERE lr.student_id = p.id
  AND (
    lr.student_name_snapshot IS NULL
    OR lr.student_usn_snapshot IS NULL
    OR lr.branch_snapshot IS NULL
  );

-- 3. DROP PREVIOUS 3-ARGUMENT review_leave_request FUNCTION IF EXISTS
DROP FUNCTION IF EXISTS public.review_leave_request(UUID, TEXT, TEXT);

-- 4. RECREATE review_leave_request WITH OPTIONAL p_approval_remarks
CREATE OR REPLACE FUNCTION public.review_leave_request(
  p_leave_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT DEFAULT NULL,
  p_approval_remarks TEXT DEFAULT NULL
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
  v_leave RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT role, department_id INTO v_caller_role, v_caller_dept_id
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('HOD', 'ADMIN') THEN
    RAISE EXCEPTION 'Only HODs or Administrators are authorized to review leave requests.';
  END IF;

  SELECT * INTO v_leave
  FROM public.leave_requests
  WHERE id = p_leave_id;

  IF v_leave IS NULL THEN
    RAISE EXCEPTION 'Leave request not found.';
  END IF;

  -- Security check: HOD can only review requests for their own department (ADMIN can review any)
  IF v_caller_role = 'HOD' AND (v_caller_dept_id IS NULL OR v_leave.department_id <> v_caller_dept_id) THEN
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
  SET
    status = p_status,
    reviewed_by = v_caller_id,
    reviewed_at = NOW(),
    rejection_reason = CASE WHEN p_status = 'REJECTED' THEN TRIM(p_rejection_reason) ELSE NULL END,
    approval_remarks = CASE WHEN p_status = 'APPROVED' THEN TRIM(p_approval_remarks) ELSE NULL END
  WHERE id = p_leave_id;

  -- Create Notification for the student
  INSERT INTO public.notifications (
    user_id,
    title,
    short_message,
    full_message,
    source,
    category,
    type,
    related_link
  ) VALUES (
    v_leave.student_id,
    CASE WHEN p_status = 'APPROVED' THEN 'Leave Request Approved' ELSE 'Leave Request Rejected' END,
    CASE 
      WHEN p_status = 'APPROVED' THEN 'Your leave request ' || COALESCE(v_leave.reference_id, '') || ' has been approved.'
      ELSE 'Your leave request ' || COALESCE(v_leave.reference_id, '') || ' has been rejected.'
    END,
    CASE 
      WHEN p_status = 'APPROVED' THEN 'Your ' || v_leave.leave_type || ' request (' || COALESCE(v_leave.reference_id, '') || ') from ' || v_leave.start_date || ' to ' || v_leave.end_date || ' has been approved by your HOD.'
      ELSE 'Your ' || v_leave.leave_type || ' request (' || COALESCE(v_leave.reference_id, '') || ') was rejected. Reason: ' || TRIM(p_rejection_reason)
    END,
    'HOD Portal',
    'Leave',
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

GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) TO authenticated;
