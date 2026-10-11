-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00035: TIMETABLE CONCURRENCY GUARD
-- ============================================================
-- Purpose: Remediates Timetable Concurrency Race Conditions (F-05)
-- Enforces database-level transactional validation on timetable_entries
-- to prevent simultaneous double-booking of faculty, physical rooms,
-- or section cohorts during concurrent scheduling actions.
--
-- Security & Concurrency Controls:
-- 1. SECURITY DEFINER with empty search_path: Bypasses caller's RLS
--    during internal conflict detection so cross-department physical
--    room collisions (e.g. shared lecture halls) are fully visible.
-- 2. Native TIME parsing: Parses both 12-hour AM/PM ('09:00 AM', '01:00 PM')
--    and 24-hour military times ('09:00', '13:00') into PostgreSQL TIME
--    types, avoiding alphabetical string comparison bugs.
-- 3. Core SQL special forms (COALESCE, NULLIF) use standard unqualified syntax.
-- 4. Deterministic Transaction Advisory Locking: Acquires 64-bit advisory
--    locks on faculty, room, and section in strictly sorted ascending order
--    to eliminate concurrency race conditions and prevent deadlocks.
-- 5. Scope-aware: Checks academic_year and semester/section normalization.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_timetable_entry_concurrency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parsed_start pg_catalog.time;
  parsed_end pg_catalog.time;
  clean_start_text pg_catalog.text;
  clean_end_text pg_catalog.text;
  conflict_found RECORD;

  -- Advisory locking structures
  lock_keys bigint[] := '{}';
  sorted_locks bigint[];
  lock_id bigint;
BEGIN
  -- 1. Temporal validation & normalization
  clean_start_text := pg_catalog.btrim(NEW.start_time);
  clean_end_text := pg_catalog.btrim(NEW.end_time);

  BEGIN
    parsed_start := clean_start_text::pg_catalog.time;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid timetable start_time format: "%". Expected formats: "09:00 AM" or "09:00".', NEW.start_time
      USING ERRCODE = '22007'; -- invalid_datetime_format
  END;

  BEGIN
    parsed_end := clean_end_text::pg_catalog.time;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid timetable end_time format: "%". Expected formats: "10:00 AM" or "10:00".', NEW.end_time
      USING ERRCODE = '22007'; -- invalid_datetime_format
  END;

  IF parsed_start >= parsed_end THEN
    RAISE EXCEPTION 'Invalid timetable interval: start_time (%) must be strictly before end_time (%).',
      NEW.start_time, NEW.end_time
      USING ERRCODE = '22000'; -- data_exception
  END IF;

  -- 2. Collect resource keys for deterministic transaction-level advisory locking
  -- Faculty resource lock
  IF NEW.faculty_id IS NOT NULL THEN
    lock_keys := pg_catalog.array_append(
      lock_keys,
      pg_catalog.hashtext('tt_fac:' || NEW.faculty_id::pg_catalog.text || ':' || NEW.day_of_week || ':' || COALESCE(NEW.academic_year, ''))::bigint
    );
  END IF;

  -- Physical room resource lock
  IF NEW.room IS NOT NULL AND pg_catalog.btrim(NEW.room) <> '' THEN
    lock_keys := pg_catalog.array_append(
      lock_keys,
      pg_catalog.hashtext('tt_room:' || pg_catalog.lower(pg_catalog.btrim(NEW.room)) || ':' || NEW.day_of_week || ':' || COALESCE(NEW.academic_year, ''))::bigint
    );
  END IF;

  -- Department semester section cohort lock
  IF NEW.section IS NOT NULL AND pg_catalog.btrim(NEW.section) <> '' THEN
    lock_keys := pg_catalog.array_append(
      lock_keys,
      pg_catalog.hashtext('tt_sec:' || NEW.department_id::pg_catalog.text || ':' || NEW.semester::pg_catalog.text || ':' || pg_catalog.lower(pg_catalog.btrim(NEW.section)) || ':' || NEW.day_of_week || ':' || COALESCE(NEW.academic_year, ''))::bigint
    );
  END IF;

  -- Acquire locks in strictly sorted ascending order to mathematically guarantee deadlock-free concurrency
  IF pg_catalog.cardinality(lock_keys) > 0 THEN
    SELECT pg_catalog.array_agg(DISTINCT k ORDER BY k ASC)
    INTO sorted_locks
    FROM pg_catalog.unnest(lock_keys) AS k;

    IF sorted_locks IS NOT NULL THEN
      FOREACH lock_id IN ARRAY sorted_locks LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(lock_id);
      END LOOP;
    END IF;
  END IF;

  -- 3. Faculty double-booking check (Scoped across academic year)
  IF NEW.faculty_id IS NOT NULL THEN
    SELECT id, course_name, day_of_week, start_time, end_time, room INTO conflict_found
    FROM public.timetable_entries
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::pg_catalog.uuid)
      AND faculty_id = NEW.faculty_id
      AND day_of_week = NEW.day_of_week
      AND COALESCE(academic_year, '') = COALESCE(NEW.academic_year, '')
      AND parsed_start < pg_catalog.btrim(end_time)::pg_catalog.time
      AND pg_catalog.btrim(start_time)::pg_catalog.time < parsed_end
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Faculty scheduling conflict: Faculty is already scheduled for % on % (% - %) in room %.',
        conflict_found.course_name, conflict_found.day_of_week, conflict_found.start_time, conflict_found.end_time, COALESCE(conflict_found.room, 'N/A')
        USING ERRCODE = '23P01'; -- exclusion_violation
    END IF;
  END IF;

  -- 4. Physical room double-booking check (Cross-department institutional visibility)
  IF NEW.room IS NOT NULL AND pg_catalog.btrim(NEW.room) <> '' THEN
    SELECT id, course_name, day_of_week, start_time, end_time, faculty_name INTO conflict_found
    FROM public.timetable_entries
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::pg_catalog.uuid)
      AND pg_catalog.lower(pg_catalog.btrim(room)) = pg_catalog.lower(pg_catalog.btrim(NEW.room))
      AND day_of_week = NEW.day_of_week
      AND COALESCE(academic_year, '') = COALESCE(NEW.academic_year, '')
      AND parsed_start < pg_catalog.btrim(end_time)::pg_catalog.time
      AND pg_catalog.btrim(start_time)::pg_catalog.time < parsed_end
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Room double-booking conflict: Room % is already reserved for % on % (% - %).',
        NEW.room, conflict_found.course_name, conflict_found.day_of_week, conflict_found.start_time, conflict_found.end_time
        USING ERRCODE = '23P01'; -- exclusion_violation
    END IF;
  END IF;

  -- 5. Section cohort double-booking check
  IF NEW.section IS NOT NULL AND pg_catalog.btrim(NEW.section) <> '' THEN
    SELECT id, course_name, day_of_week, start_time, end_time INTO conflict_found
    FROM public.timetable_entries
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::pg_catalog.uuid)
      AND department_id = NEW.department_id
      AND semester = NEW.semester
      AND pg_catalog.lower(pg_catalog.btrim(section)) = pg_catalog.lower(pg_catalog.btrim(NEW.section))
      AND day_of_week = NEW.day_of_week
      AND COALESCE(academic_year, '') = COALESCE(NEW.academic_year, '')
      AND parsed_start < pg_catalog.btrim(end_time)::pg_catalog.time
      AND pg_catalog.btrim(start_time)::pg_catalog.time < parsed_end
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Section scheduling conflict: Semester % Section % already has class % on % (% - %).',
        NEW.semester, NEW.section, conflict_found.course_name, conflict_found.day_of_week, conflict_found.start_time, conflict_found.end_time
        USING ERRCODE = '23P01'; -- exclusion_violation
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to timetable_entries for both INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_validate_timetable_concurrency ON public.timetable_entries;
CREATE TRIGGER trg_validate_timetable_concurrency
  BEFORE INSERT OR UPDATE ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_timetable_entry_concurrency();

-- Restrict function execution: Only authenticated database roles and service_role require execute
REVOKE ALL ON FUNCTION public.validate_timetable_entry_concurrency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_timetable_entry_concurrency() FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_timetable_entry_concurrency() TO authenticated, service_role;
