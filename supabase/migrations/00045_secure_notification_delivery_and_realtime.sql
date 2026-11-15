-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00045: SECURE NOTIFICATION DELIVERY & REALTIME
-- Resolves Notification Forgery Vulnerability & Prepares Realtime Publication
-- ============================================================

-- 1. REALTIME PUBLICATION REGISTRATION (SAFE & REPEATABLE)
-- Adds public.notifications to supabase_realtime publication if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;

-- 2. TRIGGER ON LEAVE REQUESTS (SERVER-AUTHORITATIVE NOTIFICATIONS)
-- Automatically creates HOD notification and student confirmation upon submission
CREATE OR REPLACE FUNCTION public.notify_on_leave_request_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name TEXT;
  v_hod_id UUID;
  v_dept_id UUID;
BEGIN
  SELECT full_name, department_id INTO v_student_name, v_dept_id
  FROM public.profiles
  WHERE id = NEW.student_id;

  v_student_name := COALESCE(v_student_name, 'Student');
  v_dept_id := COALESCE(NEW.department_id, v_dept_id);

  v_hod_id := NEW.hod_id;
  IF v_hod_id IS NULL AND v_dept_id IS NOT NULL THEN
    SELECT id INTO v_hod_id
    FROM public.profiles
    WHERE department_id = v_dept_id AND role = 'HOD'
    LIMIT 1;
  END IF;

  -- 1. Notify HOD
  IF v_hod_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      short_message,
      full_message,
      source,
      category,
      type,
      related_link
    )
    SELECT
      v_hod_id,
      'New Leave Request Received',
      'Leave request from ' || v_student_name || ' (' || COALESCE(NEW.reference_id, NEW.id::text) || ')',
      v_student_name || ' submitted a ' || NEW.leave_type || ' request from ' || NEW.start_date || ' to ' || NEW.end_date || '.' || E'\nReason: ' || NEW.reason,
      'Student Portal',
      'Leave',
      'Request',
      '/hod/leave'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_hod_id
        AND n.title = 'New Leave Request Received'
        AND n.short_message LIKE '%' || COALESCE(NEW.reference_id, NEW.id::text) || '%'
    );
  END IF;

  -- 2. Notify Student
  INSERT INTO public.notifications (
    user_id,
    title,
    short_message,
    full_message,
    source,
    category,
    type,
    related_link
  )
  SELECT
    NEW.student_id,
    'Leave Request Submitted',
    'Your ' || NEW.leave_type || ' request (' || COALESCE(NEW.reference_id, NEW.id::text) || ') has been submitted and is pending HOD review.',
    'Leave submitted.' || E'\nType: ' || NEW.leave_type || E'\nDates: ' || NEW.start_date || ' to ' || NEW.end_date || E'\nStatus: PENDING',
    'Student Portal',
    'Leave',
    'Request',
    '/student/leave-requests'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.student_id
      AND n.title = 'Leave Request Submitted'
      AND n.short_message LIKE '%' || COALESCE(NEW.reference_id, NEW.id::text) || '%'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_leave_submission ON public.leave_requests;
CREATE TRIGGER trg_notify_on_leave_submission
  AFTER INSERT ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_leave_request_submitted();

-- 3. TRIGGER ON ANNOUNCEMENTS (SERVER-AUTHORITATIVE NOTIFICATIONS)
-- Fanned out strictly based on department_id and target_audience upon publication
CREATE OR REPLACE FUNCTION public.notify_on_announcement_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short_msg TEXT;
BEGIN
  IF NEW.status = 'PUBLISHED' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'PUBLISHED')) THEN
    v_short_msg := CASE 
      WHEN length(NEW.content) > 80 THEN substring(NEW.content FROM 1 FOR 77) || '...'
      ELSE NEW.content
    END;

    -- Fan out to students
    IF NEW.target_audience IN ('Students', 'Students + Faculty') THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        short_message,
        full_message,
        source,
        category,
        type,
        related_link
      )
      SELECT
        p.id,
        'New Notice: ' || NEW.title,
        v_short_msg,
        NEW.content,
        'Announcement',
        'Academic',
        'Announcement',
        '/student/announcements/' || NEW.id::text
      FROM public.profiles p
      WHERE p.department_id = NEW.department_id
        AND p.role = 'STUDENT'
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id
            AND n.related_link = '/student/announcements/' || NEW.id::text
        );
    END IF;

    -- Fan out to faculty (excluding author)
    IF NEW.target_audience IN ('Faculty', 'Students + Faculty') THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        short_message,
        full_message,
        source,
        category,
        type,
        related_link
      )
      SELECT
        p.id,
        'New Notice: ' || NEW.title,
        v_short_msg,
        NEW.content,
        'Announcement',
        'Academic',
        'Announcement',
        '/faculty/announcements'
      FROM public.profiles p
      WHERE p.department_id = NEW.department_id
        AND p.role = 'FACULTY'
        AND p.id <> NEW.created_by
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id
            AND n.related_link = '/faculty/announcements'
            AND n.title = 'New Notice: ' || NEW.title
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_announcement_published ON public.announcements;
CREATE TRIGGER trg_notify_on_announcement_published
  AFTER INSERT OR UPDATE OF status ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_announcement_published();

-- 4. TRIGGER ON ASSIGNMENTS (ENROLLED STUDENTS ONLY)
-- Fires only when assignment is published with Active status
CREATE OR REPLACE FUNCTION public.notify_on_assignment_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due_date TEXT;
  v_short_msg TEXT;
  v_full_msg TEXT;
  v_count INT;
BEGIN
  IF NEW.status = 'Active' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'Active')) THEN
    v_due_date := to_char(NEW.deadline, 'Mon DD, YYYY');
    v_short_msg := 'New assignment for ' || NEW.course_name || '. Due: ' || v_due_date;
    v_full_msg := 'A new assignment "' || NEW.title || '" has been published for ' || NEW.course_name || '.' ||
                  E'\nDue Date: ' || v_due_date ||
                  E'\nMarks: ' || NEW.marks ||
                  CASE WHEN NEW.instructions IS NOT NULL AND length(trim(NEW.instructions)) > 0 
                    THEN E'\nInstructions: ' || NEW.instructions 
                    ELSE '' 
                  END;

    INSERT INTO public.notifications (
      user_id,
      title,
      short_message,
      full_message,
      source,
      category,
      type,
      related_link
    )
    SELECT
      ce.student_id,
      'New Assignment: ' || NEW.title,
      v_short_msg,
      v_full_msg,
      'Faculty Portal',
      'Academic',
      'Assignment',
      '/student/assignments/' || NEW.id::text
    FROM public.course_enrollments ce
    WHERE (ce.course_id = NEW.course_id OR ce.course_code = NEW.course_id)
      AND ce.status = 'Active'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ce.student_id
          AND n.related_link = '/student/assignments/' || NEW.id::text
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count = 0 THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        short_message,
        full_message,
        source,
        category,
        type,
        related_link
      )
      SELECT
        p.id,
        'New Assignment: ' || NEW.title,
        v_short_msg,
        v_full_msg,
        'Faculty Portal',
        'Academic',
        'Assignment',
        '/student/assignments/' || NEW.id::text
      FROM public.profiles p
      WHERE p.department_id = NEW.department_id
        AND p.role = 'STUDENT'
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id
            AND n.related_link = '/student/assignments/' || NEW.id::text
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_assignment_published ON public.assignments;
CREATE TRIGGER trg_notify_on_assignment_published
  AFTER INSERT OR UPDATE OF status ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_assignment_published();

-- 5. TRIGGER ON ASSESSMENTS (ENROLLED STUDENTS ONLY)
-- Fires only when assessment is published (status Upcoming or Active, transitioning from Draft)
CREATE OR REPLACE FUNCTION public.notify_on_assessment_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_str TEXT;
  v_short_msg TEXT;
  v_full_msg TEXT;
  v_count INT;
BEGIN
  -- Only notify when published (Upcoming or Active) and not already in a published state
  IF NEW.status IN ('Upcoming', 'Active') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status NOT IN ('Upcoming', 'Active'))) THEN
    v_date_str := to_char(NEW.assessment_date, 'Mon DD, YYYY');
    v_short_msg := 'Assessment scheduled for ' || NEW.course_name || '. Date: ' || v_date_str;
    v_full_msg := 'A new assessment "' || NEW.title || '" has been scheduled for ' || NEW.course_name || '.' ||
                  E'\nDate: ' || v_date_str || ' at ' || COALESCE(NEW.assessment_time, '10:00 AM') ||
                  E'\nDuration: ' || NEW.duration_minutes || ' minutes' ||
                  E'\nTotal Marks: ' || NEW.total_marks;

    INSERT INTO public.notifications (
      user_id,
      title,
      short_message,
      full_message,
      source,
      category,
      type,
      related_link
    )
    SELECT
      ce.student_id,
      'New Assessment Scheduled: ' || NEW.title,
      v_short_msg,
      v_full_msg,
      'Faculty Portal',
      'Academic',
      'Assessment',
      '/student/assessments/' || NEW.id::text
    FROM public.course_enrollments ce
    WHERE (ce.course_id = NEW.course_id OR ce.course_code = NEW.course_id)
      AND ce.status = 'Active'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ce.student_id
          AND n.related_link = '/student/assessments/' || NEW.id::text
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count = 0 THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        short_message,
        full_message,
        source,
        category,
        type,
        related_link
      )
      SELECT
        p.id,
        'New Assessment Scheduled: ' || NEW.title,
        v_short_msg,
        v_full_msg,
        'Faculty Portal',
        'Academic',
        'Assessment',
        '/student/assessments/' || NEW.id::text
      FROM public.profiles p
      LEFT JOIN public.student_profiles sp ON sp.profile_id = p.id
      WHERE p.department_id = NEW.department_id
        AND p.role = 'STUDENT'
        AND (NEW.semester IS NULL OR sp.semester = NEW.semester)
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id
            AND n.related_link = '/student/assessments/' || NEW.id::text
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_assessment_published ON public.assessments;
CREATE TRIGGER trg_notify_on_assessment_published
  AFTER INSERT OR UPDATE OF status ON public.assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_assessment_published();

-- 6. TRIGGER ON ATTENDANCE STATUS CHANGES
CREATE OR REPLACE FUNCTION public.notify_on_attendance_status_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      short_message,
      full_message,
      source,
      category,
      type,
      related_link
    )
    SELECT
      NEW.student_id,
      'Attendance Record Amended',
      'Your attendance status was updated to ' || NEW.status || '.',
      'Your attendance status was amended from ' || OLD.status || ' to ' || NEW.status || '.' || 
        CASE WHEN NEW.remarks IS NOT NULL AND length(trim(NEW.remarks)) > 0 THEN E'\nRemarks: ' || NEW.remarks ELSE '' END,
      'Faculty Portal',
      'Academic',
      'Attendance',
      '/student/attendance'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = NEW.student_id
        AND n.title = 'Attendance Record Amended'
        AND n.created_at >= (NOW() - INTERVAL '10 seconds')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_attendance_status_update ON public.attendance_records;
CREATE TRIGGER trg_notify_on_attendance_status_update
  AFTER UPDATE OF status ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_attendance_status_update();

-- Optional trigger on attendance_corrections (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendance_corrections') THEN
    CREATE OR REPLACE FUNCTION public.notify_on_attendance_correction()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      INSERT INTO public.notifications (
        user_id,
        title,
        short_message,
        full_message,
        source,
        category,
        type,
        related_link
      )
      SELECT
        NEW.student_id,
        'Attendance Record Amended',
        'Your attendance status was updated to ' || NEW.new_status || '.',
        'Your attendance status was amended from ' || NEW.previous_status || ' to ' || NEW.new_status || '.' || E'\nReason: ' || NEW.correction_reason,
        'Faculty Portal',
        'Academic',
        'Attendance',
        '/student/attendance'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = NEW.student_id
          AND n.title = 'Attendance Record Amended'
          AND n.created_at >= (NOW() - INTERVAL '10 seconds')
      );
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_on_attendance_correction ON public.attendance_corrections;
    CREATE TRIGGER trg_notify_on_attendance_correction
      AFTER INSERT ON public.attendance_corrections
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_attendance_correction();
  END IF;
END $$;

-- 7. PROJECT MEMBER NOTIFICATION RPC (VERIFIED PROJECT MEMBERSHIP ONLY)
CREATE OR REPLACE FUNCTION public.notify_project_members(
  p_project_id UUID,
  p_title TEXT,
  p_short_message TEXT,
  p_full_message TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_team_members JSONB;
  v_sender_id UUID;
  v_recipient_count INT := 0;
  v_is_member BOOLEAN := FALSE;
  v_member_rec RECORD;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT owner_id, team_members
  INTO v_owner_id, v_team_members
  FROM public.user_projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found with ID %', p_project_id;
  END IF;

  IF v_owner_id = v_sender_id THEN
    v_is_member := TRUE;
  ELSIF v_team_members IS NOT NULL THEN
    FOR v_member_rec IN SELECT * FROM jsonb_array_elements(v_team_members) LOOP
      IF (v_member_rec.value->>'userId')::uuid = v_sender_id THEN
        v_is_member := TRUE;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Access Denied: You are not an authorized member of project %', p_project_id;
  END IF;

  -- Notify owner if owner is not the sender
  IF v_owner_id IS NOT NULL AND v_owner_id <> v_sender_id THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      short_message,
      full_message,
      source,
      category,
      type,
      related_link
    )
    SELECT
      v_owner_id,
      p_title,
      p_short_message,
      COALESCE(p_full_message, p_short_message),
      'Projects',
      'Projects',
      'Project',
      '/student/projects/' || p_project_id::text
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_owner_id
        AND n.related_link = '/student/projects/' || p_project_id::text
        AND n.title = p_title
        AND n.created_at >= (NOW() - INTERVAL '15 seconds')
    );

    IF FOUND THEN
      v_recipient_count := v_recipient_count + 1;
    END IF;
  END IF;

  -- Notify team members in JSONB array
  IF v_team_members IS NOT NULL THEN
    FOR v_member_rec IN SELECT * FROM jsonb_array_elements(v_team_members) LOOP
      DECLARE
        v_uid UUID;
      BEGIN
        v_uid := (v_member_rec.value->>'userId')::uuid;
        IF v_uid IS NOT NULL AND v_uid <> v_sender_id AND v_uid <> COALESCE(v_owner_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
          INSERT INTO public.notifications (
            user_id,
            title,
            short_message,
            full_message,
            source,
            category,
            type,
            related_link
          )
          SELECT
            v_uid,
            p_title,
            p_short_message,
            COALESCE(p_full_message, p_short_message),
            'Projects',
            'Projects',
            'Project',
            '/student/projects/' || p_project_id::text
          WHERE NOT EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.user_id = v_uid
              AND n.related_link = '/student/projects/' || p_project_id::text
              AND n.title = p_title
              AND n.created_at >= (NOW() - INTERVAL '15 seconds')
          );

          IF FOUND THEN
            v_recipient_count := v_recipient_count + 1;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Ignore malformed userId elements
      END;
    END LOOP;
  END IF;

  RETURN v_recipient_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_project_members(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 8. RESTRICT DIRECT INSERT ACCESS ON PUBLIC.NOTIFICATIONS (PREVENT FORGERY)
-- Revoke direct INSERT from client roles
REVOKE INSERT ON public.notifications FROM authenticated, anon, PUBLIC;

-- Drop permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can send notifications" ON public.notifications;

-- Explicit deny policy for INSERT to authenticated role
DROP POLICY IF EXISTS "Deny direct user notification insertion" ON public.notifications;
CREATE POLICY "Deny direct user notification insertion"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (false);
