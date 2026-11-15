-- Run in the Supabase SQL editor with a read-only database role.
-- These queries report current data only; they do not modify users or mappings.

-- DEPARTMENTS
SELECT
  d.id AS department_id,
  d.name AS department_name,
  d.code,
  d.status AS department_status,
  h.full_name AS current_hod,
  h.id AS hod_user_id,
  h.account_status AS hod_status
FROM public.departments d
LEFT JOIN LATERAL (
  SELECT p.id, p.full_name, p.account_status
  FROM public.profiles p
  WHERE p.department_id = d.id
    AND p.role = 'HOD'
    AND p.account_status = 'ACTIVE'
  ORDER BY p.created_at DESC
  LIMIT 1
) h ON TRUE
ORDER BY d.code NULLS LAST, d.name;

-- STUDENTS
SELECT
  p.full_name AS student,
  p.id AS student_user_id,
  d.name AS department,
  p.department_id,
  p.account_status AS student_status,
  CASE
    WHEN p.department_id IS NULL THEN 'INVALID: missing department'
    WHEN d.id IS NULL THEN 'INVALID: department does not exist'
    WHEN d.status <> 'ACTIVE' THEN 'INVALID: department inactive'
    ELSE 'VALID'
  END AS mapping_status
FROM public.profiles p
LEFT JOIN public.departments d ON d.id = p.department_id
WHERE p.role = 'STUDENT'
ORDER BY p.full_name;

-- LEAVE ROUTING
SELECT
  lr.reference_id,
  student.full_name AS student,
  d.code AS student_department,
  expected_hod.full_name AS expected_hod,
  routed_hod.full_name AS actual_hod,
  CASE
    WHEN expected_hod.id IS NULL THEN 'INVALID: department has no active HOD'
    WHEN lr.department_id <> student.department_id THEN 'INVALID: department mismatch'
    WHEN lr.hod_id IS DISTINCT FROM expected_hod.id THEN 'INVALID: stale HOD routing'
    ELSE 'VALID'
  END AS routing_status
FROM public.leave_requests lr
JOIN public.profiles student ON student.id = lr.student_id
LEFT JOIN public.departments d ON d.id = lr.department_id
LEFT JOIN public.profiles routed_hod ON routed_hod.id = lr.hod_id
LEFT JOIN LATERAL (
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.department_id = student.department_id
    AND p.role = 'HOD'
    AND p.account_status = 'ACTIVE'
  ORDER BY p.created_at DESC
  LIMIT 1
) expected_hod ON TRUE
ORDER BY lr.created_at DESC;
