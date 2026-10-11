-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00034: SECURE PUBLIC SIGNUP TRIGGER
-- ============================================================
-- Purpose: Remediates Privilege Escalation Vulnerability (F-03)
-- Ensures that all public self-registrations via auth.users ALWAYS
-- assign the 'STUDENT' role, strictly ignoring any client-supplied
-- role metadata in raw_user_meta_data.
--
-- Staff accounts ('FACULTY', 'HOD', 'ADMIN') can ONLY be provisioned
-- by authorized Administrators through the server-side
-- admin-provision-user Edge Function using privileged credentials.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Strict institutional security policy:
  -- Public self-registration ALWAYS creates a 'STUDENT' role.
  -- User-supplied metadata (raw_user_meta_data->>'role') is strictly IGNORED
  -- to prevent privilege escalation to FACULTY, HOD, or ADMIN.
  
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
    NEW.raw_user_meta_data->>'usn_or_employee_id',
    'STUDENT',
    'ACTIVE',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- If profile exists, ensure public registration cannot alter role or status
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger to auth.users if not already active
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure execution permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role;
