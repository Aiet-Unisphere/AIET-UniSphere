/**
 * AIET-UniSphere - MISSION 07.4.4.3 Real PostgreSQL 16 Announcement Security Test Suite
 * 
 * Verifies real database RLS behavior on PostgreSQL 16:
 * - Announcement visibility matrix
 * - Storage attachment visibility matrix (Migration 00038)
 * - Read-state idempotency & initial timestamp preservation
 * - Cross-student read-record insertion rejection
 */

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
  // Sets authenticated role and Supabase auth context (request.jwt.claim.sub)
  const fullSql = `
    SET ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claims" = '{"sub": "${userId}"}';
    ${sql}
  `;
  return await runSql(fullSql);
}

async function run() {
  console.log('=== AIET-UniSphere MISSION 07.4.4.3: Real PostgreSQL 16 Security Verification ===\n');

  // 0. Preflight Connection Probe
  const probe = await runSql('SELECT version();');
  if (!probe.success) {
    throw new Error(
      `ENVIRONMENT PREREQUISITE NOT MET: Unable to connect to PostgreSQL at ${DB_HOST}:${DB_PORT}.\n` +
      `Ensure an isolated PostgreSQL instance is running on port ${DB_PORT}.\n` +
      `Error details: ${probe.stderr || probe.error}`
    );
  }
  console.log('[0/6] PostgreSQL 16 connection verified on port ' + DB_PORT);

  // 1. Setup Mock Schema & Roles
  console.log('[1/6] Initializing schemas, helper functions, and database objects...');
  const initSql = `
    -- Schema storage
    CREATE SCHEMA IF NOT EXISTS storage;

    -- Roles
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;

    -- auth.uid() function mock for PostgreSQL test environment
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    -- Departments table
    CREATE TABLE IF NOT EXISTS public.departments (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE
    );

    -- Profiles table
    CREATE TABLE IF NOT EXISTS public.profiles (
      id UUID PRIMARY KEY,
      department_id UUID REFERENCES public.departments(id),
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      account_status TEXT NOT NULL DEFAULT 'ACTIVE'
    );

    -- Helper functions matching Migration 00019 & 00020
    CREATE OR REPLACE FUNCTION public.get_auth_user_role()
    RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT CASE WHEN p.account_status = 'ACTIVE' THEN p.role ELSE NULL END
      FROM public.profiles p WHERE p.id = auth.uid();
    $$;

    CREATE OR REPLACE FUNCTION public.get_auth_user_department_id()
    RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT CASE WHEN p.account_status = 'ACTIVE' THEN p.department_id ELSE NULL END
      FROM public.profiles p WHERE p.id = auth.uid();
    $$;

    CREATE OR REPLACE FUNCTION public.is_active_auth_user()
    RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.account_status = 'ACTIVE'
      );
    $$;

    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;
    GRANT EXECUTE ON FUNCTION public.get_auth_user_role() TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.get_auth_user_department_id() TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.is_active_auth_user() TO authenticated, service_role;

    -- Announcements table
    CREATE TABLE IF NOT EXISTS public.announcements (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('Academic', 'Exam', 'Event', 'General')),
      content TEXT NOT NULL,
      target_audience TEXT NOT NULL CHECK (target_audience IN ('Students', 'Faculty', 'Students + Faculty')),
      created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ,
      attachment_path TEXT,
      attachment_name TEXT,
      attachment_size BIGINT,
      attachment_type TEXT
    );

    ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view announcements of their department" ON public.announcements;
    CREATE POLICY "Users can view announcements of their department"
      ON public.announcements FOR SELECT
      TO authenticated
      USING (
        (public.get_auth_user_role() = 'HOD' AND department_id = public.get_auth_user_department_id())
        OR public.get_auth_user_role() = 'ADMIN'
        OR (
          status = 'PUBLISHED'
          AND department_id = public.get_auth_user_department_id()
          AND (
            (public.get_auth_user_role() = 'STUDENT' AND target_audience IN ('Students', 'Students + Faculty'))
            OR (public.get_auth_user_role() = 'FACULTY' AND target_audience IN ('Faculty', 'Students + Faculty'))
          )
        )
      );

    -- announcement_reads table
    CREATE TABLE IF NOT EXISTS public.announcement_reads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(announcement_id, user_id)
    );

    ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view own read records" ON public.announcement_reads;
    CREATE POLICY "Users can view own read records"
      ON public.announcement_reads FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can insert own read records" ON public.announcement_reads;
    CREATE POLICY "Users can insert own read records"
      ON public.announcement_reads FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());

    -- Storage mock table
    CREATE TABLE IF NOT EXISTS storage.objects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id TEXT NOT NULL,
      name TEXT NOT NULL,
      owner UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    -- Grants
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT USAGE ON SCHEMA storage TO authenticated, anon;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;
    GRANT SELECT ON storage.objects TO authenticated;
  `;

  const setupRes = await runSql(initSql);
  assert.equal(setupRes.success, true, `Schema setup failed: ${setupRes.stderr}`);
  console.log('  -> Schemas public & storage initialized with RLS enabled.');

  // 2. Apply Migration 00038
  console.log('\n[2/6] Applying Migration 00038: Storage Visibility RLS Policy...');
  const migRes = await runSql(`
    -- 1. DROP OBSOLETE DEPARTMENT-ONLY SELECT POLICY
    DROP POLICY IF EXISTS "Department users can view announcement files" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users view authorized announcement files" ON storage.objects;

    -- 2. CREATE VISIBILITY-AWARE STORAGE SELECT POLICY
    CREATE POLICY "Authenticated users view authorized announcement files"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'announcements'
        AND public.is_active_auth_user()
        AND (
          public.get_auth_user_role() = 'ADMIN'
          OR EXISTS (
            SELECT 1 FROM public.announcements a
            WHERE a.attachment_path = storage.objects.name
              AND (
                (public.get_auth_user_role() = 'HOD' AND a.department_id = public.get_auth_user_department_id())
                OR (
                  a.status = 'PUBLISHED'
                  AND a.department_id = public.get_auth_user_department_id()
                  AND (
                    (public.get_auth_user_role() = 'STUDENT' AND a.target_audience IN ('Students', 'Students + Faculty'))
                    OR (public.get_auth_user_role() = 'FACULTY' AND a.target_audience IN ('Faculty', 'Students + Faculty'))
                  )
                )
              )
          )
        )
      );
  `);
  assert.equal(migRes.success, true, `Migration 00038 execution failed: ${migRes.stderr}`);
  console.log('  -> Migration 00038 applied cleanly with 0 SQL errors.');

  // 3. Seed Test Matrix Entities
  console.log('\n[3/6] Seeding departments, profiles, announcements, and storage objects...');
  const seedSql = `
    DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'attendance_records') THEN
        DELETE FROM public.attendance_records;
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'attendance_sessions') THEN
        DELETE FROM public.attendance_sessions;
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'course_enrollments') THEN
        DELETE FROM public.course_enrollments;
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'academic_materials') THEN
        DELETE FROM public.academic_materials;
      END IF;
    END $$;
    DELETE FROM storage.objects;
    DELETE FROM public.announcement_reads;
    DELETE FROM public.announcements;
    DELETE FROM public.profiles;
    DELETE FROM public.departments;

    -- Departments
    INSERT INTO public.departments (id, name, code) VALUES
      ('10000000-0000-0000-0000-000000000001', 'Computer Science and Engineering', 'CSE'),
      ('10000000-0000-0000-0000-000000000002', 'Electronics and Communication Engineering', 'ECE');

    -- Profiles
    INSERT INTO public.profiles (id, department_id, full_name, role, account_status) VALUES
      ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'Student CSE Active', 'STUDENT', 'ACTIVE'),
      ('22222222-2222-2222-2222-222222222222', '10000000-0000-0000-0000-000000000002', 'Student ECE Active', 'STUDENT', 'ACTIVE'),
      ('33333333-3333-3333-3333-333333333333', '10000000-0000-0000-0000-000000000001', 'Faculty CSE Active', 'FACULTY', 'ACTIVE'),
      ('44444444-4444-4444-4444-444444444444', '10000000-0000-0000-0000-000000000001', 'HOD CSE Active', 'HOD', 'ACTIVE'),
      ('55555555-5555-5555-5555-555555555555', '10000000-0000-0000-0000-000000000001', 'Admin Active', 'ADMIN', 'ACTIVE'),
      ('66666666-6666-6666-6666-666666666666', '10000000-0000-0000-0000-000000000001', 'Student CSE Inactive', 'STUDENT', 'INACTIVE');

    -- Announcements
    INSERT INTO public.announcements 
      (id, title, category, content, target_audience, created_by, department_id, status, attachment_path, attachment_name)
    VALUES
      -- 1. CSE Published Students
      ('a0000000-0000-0000-0000-000000000001', 'Exam Schedule', 'Exam', 'Exam schedule', 'Students', 
       '44444444-4444-4444-4444-444444444444', '10000000-0000-0000-0000-000000000001', 'PUBLISHED',
       '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000001/exams.pdf', 'exams.pdf'),

      -- 2. CSE Published Students + Faculty
      ('a0000000-0000-0000-0000-000000000002', 'Campus Fest', 'Event', 'Fest announcement', 'Students + Faculty',
       '44444444-4444-4444-4444-444444444444', '10000000-0000-0000-0000-000000000001', 'PUBLISHED',
       '10000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000002/fest.pdf', 'fest.pdf'),

      -- 3. CSE Draft
      ('a0000000-0000-0000-0000-000000000003', 'Confidential Draft', 'Academic', 'Draft notes', 'Students',
       '44444444-4444-4444-4444-444444444444', '10000000-0000-0000-0000-000000000001', 'DRAFT',
       '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000003/draft.pdf', 'draft.pdf'),

      -- 4. CSE Faculty Only
      ('a0000000-0000-0000-0000-000000000004', 'Faculty Meeting', 'General', 'Faculty only', 'Faculty',
       '44444444-4444-4444-4444-444444444444', '10000000-0000-0000-0000-000000000001', 'PUBLISHED',
       '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000004/meeting.pdf', 'meeting.pdf'),

      -- 5. ECE Published Students
      ('a0000000-0000-0000-0000-000000000005', 'ECE Lab Schedule', 'Academic', 'ECE only', 'Students',
       '22222222-2222-2222-2222-222222222222', '10000000-0000-0000-0000-000000000002', 'PUBLISHED',
       '10000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000005/lab.pdf', 'lab.pdf');

    -- Storage Objects
    INSERT INTO storage.objects (bucket_id, name) VALUES
      ('announcements', '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000001/exams.pdf'),
      ('announcements', '10000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000002/fest.pdf'),
      ('announcements', '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000003/draft.pdf'),
      ('announcements', '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000004/meeting.pdf'),
      ('announcements', '10000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000005/lab.pdf'),
      ('announcements', '10000000-0000-0000-0000-000000000001/orphan/orphaned.pdf');
  `;
  const seedRes = await runSql(seedSql);
  assert.equal(seedRes.success, true, `Seed failed: ${seedRes.stderr}`);
  console.log('  -> Seed data established successfully.');

  // 4. Test Storage Authorization Matrix under PostgreSQL RLS
  console.log('\n[4/6] Verifying Storage Authorization Matrix against Migration 00038 RLS...');

  const studentCSE = '11111111-1111-1111-1111-111111111111';
  const studentECE = '22222222-2222-2222-2222-222222222222';
  const facultyCSE = '33333333-3333-3333-3333-333333333333';
  const hodCSE = '44444444-4444-4444-4444-444444444444';
  const admin = '55555555-5555-5555-5555-555555555555';
  const inactiveStudent = '66666666-6666-6666-6666-666666666666';

  const checkAccess = async (userId, path) => {
    const res = await runSqlAsUser(userId, `
      SELECT COUNT(*) FROM storage.objects 
      WHERE bucket_id = 'announcements' AND name = '${path}';
    `);
    assert.equal(res.success, true, `Query failed: ${res.stderr}`);
    return parseInt(res.stdout.split('\n').pop().trim(), 10) === 1;
  };

  const pathPubStud = '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000001/exams.pdf';
  const pathPubBoth = '10000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000002/fest.pdf';
  const pathDraft = '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000003/draft.pdf';
  const pathFac = '10000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000004/meeting.pdf';
  const pathECE = '10000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000005/lab.pdf';
  const pathOrphan = '10000000-0000-0000-0000-000000000001/orphan/orphaned.pdf';

  // Matrix tests
  assert.equal(await checkAccess(studentCSE, pathPubStud), true, 'Student CSE must access Published Students attachment');
  console.log('  ✔ Student, same department -> Published, Students: ALLOW');

  assert.equal(await checkAccess(studentCSE, pathPubBoth), true, 'Student CSE must access Published Students+Faculty attachment');
  console.log('  ✔ Student, same department -> Published, Students + Faculty: ALLOW');

  assert.equal(await checkAccess(studentCSE, pathDraft), false, 'Student CSE must be DENIED draft attachment');
  console.log('  ✔ Student, same department -> Draft: DENY');

  assert.equal(await checkAccess(studentCSE, pathFac), false, 'Student CSE must be DENIED faculty-only attachment');
  console.log('  ✔ Student, same department -> Faculty-only: DENY');

  assert.equal(await checkAccess(studentCSE, pathECE), false, 'Student CSE must be DENIED foreign department attachment');
  console.log('  ✔ Student, another department -> Published, Students: DENY');

  assert.equal(await checkAccess(facultyCSE, pathFac), true, 'Faculty CSE must access Published Faculty attachment');
  console.log('  ✔ Faculty, same department -> Published, Faculty: ALLOW');

  assert.equal(await checkAccess(facultyCSE, pathPubStud), false, 'Faculty CSE must be DENIED students-only attachment');
  console.log('  ✔ Faculty, same department -> Students-only: DENY');

  assert.equal(await checkAccess(hodCSE, pathDraft), true, 'HOD CSE must access draft attachment in own department');
  console.log('  ✔ HOD, own department -> Draft announcement attachment: ALLOW');

  assert.equal(await checkAccess(admin, pathDraft), true, 'Admin must access draft attachment');
  assert.equal(await checkAccess(admin, pathECE), true, 'Admin must access any department attachment');
  console.log('  ✔ Admin -> All attachments: ALLOW');

  assert.equal(await checkAccess(inactiveStudent, pathPubStud), false, 'Inactive account must be DENIED any attachment');
  console.log('  ✔ Inactive account -> Any announcement: DENY');

  assert.equal(await checkAccess(studentCSE, pathOrphan), false, 'Orphaned storage object without announcement must be DENIED');
  console.log('  ✔ Missing parent announcement (orphaned object) -> DENY');

  assert.equal(await checkAccess(studentCSE, 'non-existent/path/fake.pdf'), false, 'Manipulated non-existent path -> DENY');
  console.log('  ✔ Invalid / manipulated storage path -> DENY');

  // 5. Test Read-State Idempotency & RLS Execution
  console.log('\n[5/6] Verifying announcement_reads Idempotency and RLS constraints...');

  const annId = 'a0000000-0000-0000-0000-000000000001';

  // First insert: using ON CONFLICT DO NOTHING (ignoreDuplicates: true)
  const firstInsert = await runSqlAsUser(studentCSE, `
    INSERT INTO public.announcement_reads (announcement_id, user_id, read_at)
    VALUES ('${annId}', '${studentCSE}', '2026-11-01 10:00:00+00')
    ON CONFLICT (announcement_id, user_id) DO NOTHING;
  `);
  assert.equal(firstInsert.success, true, `First insert failed: ${firstInsert.stderr}`);
  console.log('  ✔ Initial announcement read record created successfully.');

  // Repeated insert with ignoreDuplicates (ON CONFLICT DO NOTHING): must succeed without RLS violation
  const repeatInsert = await runSqlAsUser(studentCSE, `
    INSERT INTO public.announcement_reads (announcement_id, user_id, read_at)
    VALUES ('${annId}', '${studentCSE}', '2026-11-09 12:00:00+00')
    ON CONFLICT (announcement_id, user_id) DO NOTHING;
  `);
  assert.equal(repeatInsert.success, true, `Repeat insert failed: ${repeatInsert.stderr}`);
  console.log('  ✔ Repeated read with ON CONFLICT DO NOTHING succeeded without RLS error.');

  // Verify first read_at timestamp remains unchanged (Nov 1, not Nov 9)
  const tsCheck = await runSqlAsUser(studentCSE, `
    SELECT to_char(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') FROM public.announcement_reads 
    WHERE announcement_id = '${annId}' AND user_id = '${studentCSE}';
  `);
  assert.equal(tsCheck.success, true);
  const recordedTs = tsCheck.stdout.split('\n').pop().trim();
  assert.equal(recordedTs, '2026-11-01 10:00:00', `Expected initial UTC timestamp 2026-11-01 10:00:00 to be preserved, got ${recordedTs}`);
  console.log('  ✔ First read_at timestamp is preserved (' + recordedTs + ' UTC).');

  // Verify cross-student insertion restriction (Student CSE tries to insert for Student ECE)
  const crossStudentInsert = await runSqlAsUser(studentCSE, `
    INSERT INTO public.announcement_reads (announcement_id, user_id, read_at)
    VALUES ('${annId}', '${studentECE}', NOW())
    ON CONFLICT (announcement_id, user_id) DO NOTHING;
  `);
  assert.equal(crossStudentInsert.success, false, 'Cross-student read insertion must fail');
  assert.equal(crossStudentInsert.stderr.includes('row-level security policy'), true, 'Error must cite RLS policy violation');
  console.log('  ✔ Cross-student read-record insertion strictly blocked by PostgreSQL RLS.');

  // 6. Summary
  console.log('\n=============================================================');
  console.log('>>> ALL REAL POSTGRESQL 16 ANNOUNCEMENT SECURITY CHECKS PASSED! <<<');
  console.log('=============================================================');
}

run().catch((err) => {
  console.error('\nFAILED WITH ERROR:\n', err);
  process.exit(1);
});
