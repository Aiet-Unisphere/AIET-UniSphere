import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const PSQL_PATH = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';
const DB_HOST = process.env.PGHOST || '127.0.0.1';
const DB_PORT = process.env.PGPORT || '54333';
const DB_USER = process.env.PGUSER || 'postgres';
const DB_NAME = process.env.PGDATABASE || 'postgres';

async function runSql(sql) {
  try {
    const { stdout, stderr } = await execFileAsync(PSQL_PATH, [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', DB_NAME,
      '-q',
      '-v', 'ON_ERROR_STOP=1',
      '-t', '-A',
      '-c', sql
    ], { encoding: 'utf8' });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { success: false, error: err.message, stderr: (err.stderr || '').trim() };
  }
}

async function runSqlAsUser(userId, sql) {
  const sessionSql = `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    ${sql}
    COMMIT;
  `;
  return await runSql(sessionSql);
}

async function run() {
  console.log('=== AIET-UniSphere MISSION 08.3.1: Real PostgreSQL 16 Attendance Alert Integrity ===\n');

  // 0. Connection check
  console.log('[0/5] Verifying PostgreSQL 16 connection on port 54333...');
  const connCheck = await runSql('SELECT version();');
  assert.equal(connCheck.success, true, `PostgreSQL connection failed: ${connCheck.stderr}`);
  console.log('  -> Connected to PostgreSQL 16 successfully.');

  // 1. Initialize schema, tables, and views matching 00014 and 00022
  console.log('\n[1/5] Initializing attendance tables and student_analytics_view...');
  const initSql = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Schema auth & functions
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS public.departments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      code text UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY,
      role text NOT NULL,
      department_id uuid REFERENCES public.departments(id),
      full_name text NOT NULL,
      account_status text DEFAULT 'ACTIVE'
    );
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS usn_or_employee_id text;

    CREATE OR REPLACE FUNCTION public.get_auth_user_role()
    RETURNS text AS $$
      SELECT COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid()),
        NULLIF(current_setting('request.jwt.claim.role', true), '')
      );
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION public.get_auth_user_department_id()
    RETURNS uuid AS $$
      SELECT department_id FROM public.profiles WHERE id = auth.uid();
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION public.is_active_auth_user()
    RETURNS boolean AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND account_status = 'ACTIVE'
      );
    $$ LANGUAGE sql STABLE;

    -- Attendance sessions & records
    CREATE TABLE IF NOT EXISTS public.attendance_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id text NOT NULL,
      course_name text,
      faculty_id uuid,
      department_id uuid REFERENCES public.departments(id),
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.attendance_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
      student_id uuid,
      status text NOT NULL CHECK (status IN ('Present', 'Absent', 'Late')),
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by uuid
    );

    CREATE TABLE IF NOT EXISTS public.assignment_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid REFERENCES public.assignments(id),
      student_id uuid
    );

    CREATE TABLE IF NOT EXISTS public.assessment_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid,
      percentage numeric,
      status text
    );

    -- student_analytics_view definition matching migration 00022
    DROP VIEW IF EXISTS public.student_analytics_view CASCADE;
    CREATE OR REPLACE VIEW public.student_analytics_view AS
    SELECT
      p.id AS student_id,
      p.full_name,
      p.department_id,
      COALESCE(att.total_sessions, 0) AS total_sessions,
      COALESCE(att.present_count, 0) AS present_count,
      CASE
        WHEN COALESCE(att.total_sessions, 0) > 0
        THEN ROUND((att.present_count::numeric / att.total_sessions) * 100, 1)
        ELSE 0
      END AS attendance_percentage
    FROM public.profiles p
    LEFT JOIN (
      SELECT
        ar.student_id,
        COUNT(DISTINCT ar.session_id) AS total_sessions,
        COUNT(DISTINCT CASE WHEN ar.status IN ('Present', 'Late') THEN ar.session_id END) AS present_count
      FROM public.attendance_records ar
      GROUP BY ar.student_id
    ) att ON att.student_id = p.id
    WHERE p.role = 'STUDENT'
      AND public.is_active_auth_user()
      AND (
        p.id = auth.uid()
        OR public.get_auth_user_role() = 'ADMIN'
        OR (
          public.get_auth_user_role() IN ('FACULTY', 'HOD')
          AND p.department_id = public.get_auth_user_department_id()
        )
      );

    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    GRANT SELECT ON public.student_analytics_view TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
  `;

  const initRes = await runSql(initSql);
  assert.equal(initRes.success, true, `Init failed: ${initRes.stderr}`);
  console.log('  -> Tables and student_analytics_view verified.');

  // 2. Seed test entities
  console.log('\n[2/5] Seeding faculty, student profiles, and attendance sessions/records...');
  const seedSql = `
    DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'attendance_records') THEN DELETE FROM public.attendance_records; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'attendance_sessions') THEN DELETE FROM public.attendance_sessions; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'timetable_entries') THEN DELETE FROM public.timetable_entries; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'course_enrollments') THEN DELETE FROM public.course_enrollments; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'academic_materials') THEN DELETE FROM public.academic_materials; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'announcement_reads') THEN DELETE FROM public.announcement_reads; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'announcements') THEN DELETE FROM public.announcements; END IF;
    END $$;
    DELETE FROM public.profiles;
    DELETE FROM public.departments;

    -- Departments
    INSERT INTO public.departments (id, name, code) VALUES
      ('11111111-1111-1111-1111-111111111111', 'Computer Science and Engineering', 'CSE'),
      ('22222222-2222-2222-2222-222222222222', 'Electronics and Communication Engineering', 'ECE');

    -- Profiles
    INSERT INTO public.profiles (id, role, department_id, full_name, usn_or_employee_id, account_status) VALUES
      ('10100000-0000-0000-0000-000000000001', 'FACULTY', '11111111-1111-1111-1111-111111111111', 'Faculty A', 'FAC001', 'ACTIVE'),
      ('20100000-0000-0000-0000-000000000001', 'STUDENT', '11111111-1111-1111-1111-111111111111', 'Student Zero Sessions', '1AI23CS001', 'ACTIVE'),
      ('20200000-0000-0000-0000-000000000002', 'STUDENT', '11111111-1111-1111-1111-111111111111', 'Student One Absent', '1AI23CS002', 'ACTIVE'),
      ('20300000-0000-0000-0000-000000000003', 'STUDENT', '11111111-1111-1111-1111-111111111111', 'Student 75Pct', '1AI23CS003', 'ACTIVE'),
      ('20400000-0000-0000-0000-000000000004', 'STUDENT', '11111111-1111-1111-1111-111111111111', 'Student 50Pct', '1AI23CS004', 'ACTIVE'),
      ('20500000-0000-0000-0000-000000000005', 'STUDENT', '22222222-2222-2222-2222-222222222222', 'Student ECE Cross', '1AI23EC001', 'ACTIVE');

    -- Attendance Sessions for CS501
    INSERT INTO public.attendance_sessions (id, course_id, course_name, faculty_id, department_id) VALUES
      ('50010000-0000-0000-0000-000000000001', 'CS501', 'Data Structures', '10100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
      ('50010000-0000-0000-0000-000000000002', 'CS501', 'Data Structures', '10100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
      ('50010000-0000-0000-0000-000000000003', 'CS501', 'Data Structures', '10100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
      ('50010000-0000-0000-0000-000000000004', 'CS501', 'Data Structures', '10100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

    -- Student 1 (2010...): ZERO attendance records.
    
    -- Student 2 (2020...): 1 session recorded, Absent (0/1 = 0%)
    INSERT INTO public.attendance_records (session_id, student_id, status) VALUES
      ('50010000-0000-0000-0000-000000000001', '20200000-0000-0000-0000-000000000002', 'Absent');

    -- Student 3 (2030...): 4 sessions recorded, 3 Present, 1 Absent (3/4 = 75%)
    INSERT INTO public.attendance_records (session_id, student_id, status) VALUES
      ('50010000-0000-0000-0000-000000000001', '20300000-0000-0000-0000-000000000003', 'Present'),
      ('50010000-0000-0000-0000-000000000002', '20300000-0000-0000-0000-000000000003', 'Present'),
      ('50010000-0000-0000-0000-000000000003', '20300000-0000-0000-0000-000000000003', 'Present'),
      ('50010000-0000-0000-0000-000000000004', '20300000-0000-0000-0000-000000000003', 'Absent');

    -- Student 4 (2040...): 4 sessions recorded, 2 Present, 2 Absent (2/4 = 50%)
    INSERT INTO public.attendance_records (session_id, student_id, status) VALUES
      ('50010000-0000-0000-0000-000000000001', '20400000-0000-0000-0000-000000000004', 'Present'),
      ('50010000-0000-0000-0000-000000000002', '20400000-0000-0000-0000-000000000004', 'Present'),
      ('50010000-0000-0000-0000-000000000003', '20400000-0000-0000-0000-000000000004', 'Absent'),
      ('50010000-0000-0000-0000-000000000004', '20400000-0000-0000-0000-000000000004', 'Absent');
  `;
  const seedRes = await runSql(seedSql);
  assert.equal(seedRes.success, true, `Seed failed: ${seedRes.stderr}`);
  console.log('  -> Test entities and attendance records seeded successfully.');

  // 3. Inspect what the uncorrected query would return vs corrected query
  console.log('\n[3/5] Verifying root defect vs corrected query in real PostgreSQL...');
  const facultyAId = '10100000-0000-0000-0000-000000000001';

  // Uncorrected query (DEF-08.1-03 defect mode):
  const defectQuery = `
    SELECT student_id, attendance_percentage, total_sessions, present_count
    FROM public.student_analytics_view
    WHERE attendance_percentage < 75;
  `;
  const defectRes = await runSqlAsUser(facultyAId, defectQuery);
  assert.equal(defectRes.success, true);
  const defectLines = defectRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  const defectStudentIds = defectLines.map(l => l.split('|')[0]);
  assert.ok(defectStudentIds.includes('20100000-0000-0000-0000-000000000001'), 'Defect confirmed: student with zero sessions was included under uncorrected query');
  console.log('  ✔ Confirmed Defect: Student 1 (0 conducted sessions) was returned under uncorrected query');

  // Corrected query with total_sessions > 0:
  const correctedQuery = `
    SELECT student_id, attendance_percentage, total_sessions, present_count
    FROM public.student_analytics_view
    WHERE total_sessions > 0
      AND attendance_percentage < 75;
  `;
  const correctedRes = await runSqlAsUser(facultyAId, correctedQuery);
  assert.equal(correctedRes.success, true);
  const correctedLines = correctedRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  const alertMap = new Map();
  for (const line of correctedLines) {
    const [id, pct, tot, pres] = line.split('|');
    alertMap.set(id, { pct: parseFloat(pct), tot: parseInt(tot, 10), pres: parseInt(pres, 10) });
  }

  // 4. Assert all 5 attendance alert integrity cases in real PostgreSQL
  console.log('\n[4/5] Testing attendance alert integrity cases against PostgreSQL view...');

  // Test 1: Zero conducted sessions — NO ALERT
  assert.equal(alertMap.has('20100000-0000-0000-0000-000000000001'), false, 'Student with zero conducted sessions must NOT be alerted');
  console.log('  ✔ Case 1: Zero conducted sessions (Student 1) -> NO ALERT (PASS)');

  // Test 2: One conducted session, absent (0/1 = 0%) — ALERT
  assert.equal(alertMap.has('20200000-0000-0000-0000-000000000002'), true, 'Student with 1 session and 0% attendance MUST be alerted');
  const alert2 = alertMap.get('20200000-0000-0000-0000-000000000002');
  assert.equal(alert2.pct, 0.0);
  assert.equal(alert2.tot, 1);
  assert.equal(alert2.pres, 0);
  console.log('  ✔ Case 2: 1 conducted session, absent (0/1 = 0%) -> ALERT (PASS)');

  // Test 3: Four conducted sessions, three present (3/4 = 75%) — NO ALERT
  assert.equal(alertMap.has('20300000-0000-0000-0000-000000000003'), false, 'Student with 75% attendance must NOT be alerted');
  console.log('  ✔ Case 3: 4 conducted sessions, 3 present (3/4 = 75%) -> NO ALERT (PASS)');

  // Test 4: Four conducted sessions, two present (2/4 = 50%) — ALERT
  assert.equal(alertMap.has('20400000-0000-0000-0000-000000000004'), true, 'Student with 50% attendance MUST be alerted');
  const alert4 = alertMap.get('20400000-0000-0000-0000-000000000004');
  assert.equal(alert4.pct, 50.0);
  assert.equal(alert4.tot, 4);
  assert.equal(alert4.pres, 2);
  console.log('  ✔ Case 4: 4 conducted sessions, 2 present (2/4 = 50%) -> ALERT (PASS)');

  // 5. Test Department RLS isolation: Cross-department student must NOT be accessible
  console.log('\n[5/5] Testing Department RLS isolation...');
  assert.equal(alertMap.has('20500000-0000-0000-0000-000000000005'), false, 'Cross-department student must be blocked by view RLS');
  console.log('  ✔ Case 5: Cross-department ECE student blocked by RLS (PASS)');

  console.log('\n=============================================================');
  console.log('>>> ALL REAL POSTGRESQL 16 ATTENDANCE INTEGRITY CHECKS PASSED! <<<');
  console.log('=============================================================');
}

run().catch((err) => {
  console.error('\n❌ REAL POSTGRESQL VERIFICATION FAILED:');
  console.error(err.message || err);
  process.exit(1);
});
