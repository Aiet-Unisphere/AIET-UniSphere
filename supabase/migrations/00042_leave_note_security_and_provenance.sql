-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00042: LEAVE NOTE SECURITY & PROVENANCE
-- ============================================================
-- Hardens review_leave_request execution privileges, introduces
-- snapshot provenance tracking (distinguishing submission-time snapshots
-- from retroactive backfills), and enforces strict INSERT constraints
-- on student leave submissions to prevent status or metadata forgery.

-- 1. HARDEN review_leave_request RPC EXECUTION PRIVILEGES
-- Revoke default PUBLIC and anon execution rights at the catalog level
REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) FROM anon;

-- Explicitly permit execution only for authenticated users (further authorized inside RPC)
GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 2. ADD SNAPSHOT PROVENANCE COLUMN TO LEAVE REQUESTS
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS snapshot_provenance TEXT DEFAULT 'SUBMISSION'
  CHECK (snapshot_provenance IN ('SUBMISSION', 'RETROACTIVE_BACKFILL', 'UNVERIFIED'));

-- Differentiate historical backfilled records from live submission snapshots
-- Records created before migration 00042 that had snapshot columns populated retroactively:
UPDATE public.leave_requests
SET snapshot_provenance = 'RETROACTIVE_BACKFILL'
WHERE student_name_snapshot IS NOT NULL
  AND (snapshot_provenance IS NULL OR snapshot_provenance = 'SUBMISSION')
  AND created_at < NOW() - INTERVAL '1 minute';

-- Records that have missing student snapshots are marked UNVERIFIED
UPDATE public.leave_requests
SET snapshot_provenance = 'UNVERIFIED'
WHERE student_name_snapshot IS NULL;

-- 3. HARDEN STUDENT INSERT RLS POLICY
-- Ensures students cannot forge approval status, review timestamps, or remarks
-- via direct PostgREST / Supabase REST API calls.
DROP POLICY IF EXISTS "Students can create leave requests" ON public.leave_requests;

CREATE POLICY "Students can create leave requests"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
    AND status = 'PENDING'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND approval_remarks IS NULL
    AND (snapshot_provenance = 'SUBMISSION' OR snapshot_provenance IS NULL)
  );
