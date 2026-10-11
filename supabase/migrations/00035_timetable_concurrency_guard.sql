-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00035: TIMETABLE CONCURRENCY GUARD
-- ============================================================
-- Purpose: Remediates Timetable Concurrency Race Conditions (F-05)
-- Enforces database-level transactional validation on timetable_entries
-- to prevent simultaneous double-booking of faculty, physical rooms,
-- or section cohorts during concurrent scheduling actions.
-- Compatible with text-formatted start_time and end_time (e.g. '09:00', '10:00').
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_timetable_entry_concurrency()
RETURNS TRIGGER AS $$
DECLARE
  conflict_found RECORD;
BEGIN
  -- Basic temporal validation
  IF NEW.start_time >= NEW.end_time THEN
    RAISE EXCEPTION 'Invalid timetable entry: start_time (%) must be strictly before end_time (%).',
      NEW.start_time, NEW.end_time
      USING ERRCODE = '22000';
  END IF;

  -- 1. Faculty double-booking check
  IF NEW.faculty_id IS NOT NULL THEN
    SELECT id, course_name, day_of_week, start_time, end_time, room INTO conflict_found
    FROM public.timetable_entries
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND faculty_id = NEW.faculty_id
      AND day_of_week = NEW.day_of_week
      AND NEW.start_time < end_time
      AND start_time < NEW.end_time
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Faculty scheduling conflict: Faculty is already scheduled for % on % (% - %) in room %.',
        conflict_found.course_name, conflict_found.day_of_week, conflict_found.start_time, conflict_found.end_time, COALESCE(conflict_found.room, 'N/A')
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  -- 2. Room double-booking check
  IF NEW.room IS NOT NULL AND TRIM(NEW.room) <> '' THEN
    SELECT id, course_name, day_of_week, start_time, end_time, faculty_name INTO conflict_found
    FROM public.timetable_entries
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND LOWER(TRIM(room)) = LOWER(TRIM(NEW.room))
      AND day_of_week = NEW.day_of_week
      AND NEW.start_time < end_time
      AND start_time < NEW.end_time
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Room double-booking conflict: Room % is already reserved for % on % (% - %).',
        NEW.room, conflict_found.course_name, conflict_found.day_of_week, conflict_found.start_time, conflict_found.end_time
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  -- 3. Section cohort double-booking check
  IF NEW.section IS NOT NULL AND TRIM(NEW.section) <> '' THEN
    SELECT id, course_name, day_of_week, start_time, end_time INTO conflict_found
    FROM public.timetable_entries
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND department_id = NEW.department_id
      AND semester = NEW.semester
      AND LOWER(TRIM(section)) = LOWER(TRIM(NEW.section))
      AND day_of_week = NEW.day_of_week
      AND NEW.start_time < end_time
      AND start_time < NEW.end_time
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Section scheduling conflict: Semester % Section % already has class % on % (% - %).',
        NEW.semester, NEW.section, conflict_found.course_name, conflict_found.day_of_week, conflict_found.start_time, conflict_found.end_time
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to timetable_entries
DROP TRIGGER IF EXISTS trg_validate_timetable_concurrency ON public.timetable_entries;
CREATE TRIGGER trg_validate_timetable_concurrency
  BEFORE INSERT OR UPDATE ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_timetable_entry_concurrency();

GRANT EXECUTE ON FUNCTION public.validate_timetable_entry_concurrency() TO authenticated, service_role;
