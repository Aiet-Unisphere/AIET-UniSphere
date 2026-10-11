-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00034: SECURE PUBLIC SIGNUP TRIGGER
-- ============================================================
-- Purpose: Remediates Privilege Escalation Vulnerability (F-03)
-- Ensures that all public self-registrations via auth.users ALWAYS
-- assign the 'STUDENT' role, strictly ignoring any client-supplied
-- role metadata in raw_user_meta_data.
--
-- Security Controls:
-- 1. Hardcodes 'STUDENT' role on all public new user creations.
-- 2. Uses empty search_path with fully qualified object references
--    to prevent search-path injection attacks.
-- 3. Core SQL special forms (COALESCE, NULLIF) use standard unqualified syntax.
-- 4. Restores backward-compatible fallback from usn_or_employee_id to usn.
-- 5. ON CONFLICT DO UPDATE strictly preserves existing staff roles and
--    account status during profile synchronization.
-- 6. Revokes public/anon execute access so only privileged auth workers run it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Strict institutional security policy:
  -- Public self-registration ALWAYS creates a 'STUDENT' role.
  -- User-supplied metadata (raw_user_meta_data->>'role') is strictly IGNORED
  -- to prevent privilege escalation to FACULTY, HOD, or ADMIN.
  -- Staff roles ('FACULTY', 'HOD', 'ADMIN') can ONLY be provisioned by
  -- authorized Administrators through the secure admin-provision-user Edge Function.

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    usn_or_employee_id,
    role,
    account_status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(
      NEW.raw_user_meta_data->>'usn_or_employee_id',
      NEW.raw_user_meta_data->>'usn',
      NULL
    ),
    'STUDENT',
    'ACTIVE',
    pg_catalog.now(),
    pg_catalog.now()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- If profile already exists (e.g. pre-provisioned staff or idempotent trigger),
    -- ensure public registration CANNOT alter role, account_status, or department_id.
    email = EXCLUDED.email,
    full_name = COALESCE(
      NULLIF(EXCLUDED.full_name, ''),
      public.profiles.full_name
    ),
    usn_or_employee_id = COALESCE(
      public.profiles.usn_or_employee_id,
      EXCLUDED.usn_or_employee_id
    ),
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

-- Ensure trigger is properly bound to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Restrict function execution: Only privileged auth daemon / postgres needs execute
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- Grant execution to Supabase Auth admin role (GoTrue) if present in the environment
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin';
  END IF;
END $$;
