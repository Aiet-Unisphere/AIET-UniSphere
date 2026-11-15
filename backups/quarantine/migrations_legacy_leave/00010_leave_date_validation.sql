-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00010: LEAVE DATE VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_leave_date_constraints()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Leave start date cannot be in the past.';
  END IF;

  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end date cannot be before the start date.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_date_validation ON public.leave_requests;

CREATE TRIGGER trg_leave_date_validation
BEFORE INSERT OR UPDATE OF start_date, end_date
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.validate_leave_date_constraints();
