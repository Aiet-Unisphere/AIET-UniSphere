/**
 * AIET-UniSphere - MISSION 08.2.2 Real PostgreSQL 16 Academic Materials Security Test Suite
 * 
 * Verifies real database RLS behavior on PostgreSQL 16:
 * - Academic materials Storage access matrix (Migration 00039)
 * - Faculty teaching assignment boundaries (assigned vs unassigned same-dept faculty)
 * - Student enrollment access boundaries (enrolled vs non-enrolled students)
 * - Cross-department isolation
 * - INSERT, UPDATE, and DELETE authorization on storage.objects
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
  const fullSql = `
    BEGIN;
    SET ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claims" = '{"sub": "${userId}"}';
    ${sql}
    COMMIT;
  `;
  return await runSql(fullSql);
}

async function run() {
  console.log('=== AIET-UniSphere MISSION 08.2.2: Real PostgreSQL 16 Academic Materials Storage Security ===\n');

  // 0. Preflight Connection Probe
  const probe = await runSql('SELECT version();');
  if (!probe.success) {
    throw new Error(
      `ENVIRONMENT PREREQUISITE NOT MET: Unable to connect to PostgreSQL at ${DB_HOST}:${DB_PORT}.\n` +
      `Error details: ${probe.stderr || probe.error}`
    );
  }
  console.log('[0/5] PostgreSQL 16 connection verified on port ' + DB_PORT);

  // 1. Setup Mock Schema & Roles
  console.log('[1/5] Initializing schemas, helper functions, and database objects...');
  const initSql = `
    CREATE SCHEMA IF NOT EXISTS storage;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE
      parts text[];
    BEGIN
      parts := string_to_array(name, '/');
      IF array_length(parts, 1) > 1 THEN
        RETURN parts[1:array_length(parts, 1) - 1];
      ELSE
        RETURN ARRAY[]::text[];
      END IF;
    END;
    $$;

    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    CREATE TABLE IF NOT EXISTS public.departments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      code text NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY,
      role text NOT NULL,
      department_id uuid REFERENCES public.departments(id),
      account_status text NOT NULL DEFAULT 'ACTIVE'
    );

    CREATE OR REPLACE FUNCTION public.get_auth_user_role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT role FROM public.profiles WHERE id = auth.uid();
    $$;

    CREATE OR REPLACE FUNCTION public.get_auth_user_department_id() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT department_id FROM public.profiles WHERE id = auth.uid();
    $$;

    CREATE OR REPLACE FUNCTION public.is_active_auth_user() RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT COALESCE((SELECT account_status = 'ACTIVE' FROM public.profiles WHERE id = auth.uid()), false);
    $$;

    CREATE TABLE IF NOT EXISTS public.course_enrollments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid,
      course_id text NOT NULL,
      course_code text,
      department_id uuid REFERENCES public.departments(id),
      faculty_id uuid,
      status text DEFAULT 'Active'
    );
    ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view course enrollments" ON public.course_enrollments;
    CREATE POLICY "Users can view course enrollments" ON public.course_enrollments FOR SELECT TO authenticated USING (true);

    CREATE TABLE IF NOT EXISTS public.timetable_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      department_id uuid REFERENCES public.departments(id),
      course_id text NOT NULL,
      course_code text,
      faculty_id uuid
    );
    ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view timetable entries" ON public.timetable_entries;
    CREATE POLICY "Users can view timetable entries" ON public.timetable_entries FOR SELECT TO authenticated USING (true);

    CREATE TABLE IF NOT EXISTS public.academic_materials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      course_id text NOT NULL,
      module_id text DEFAULT 'General',
      storage_path text NOT NULL,
      file_name text NOT NULL,
      department_id uuid REFERENCES public.departments(id),
      uploaded_by uuid,
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE public.academic_materials ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view academic materials in department" ON public.academic_materials;
    CREATE POLICY "Users can view academic materials in department"
      ON public.academic_materials FOR SELECT
      TO authenticated
      USING (
        department_id = public.get_auth_user_department_id()
        OR public.get_auth_user_role() = 'ADMIN'
      );

    DROP POLICY IF EXISTS "Faculty and HOD can manage academic materials" ON public.academic_materials;
    CREATE POLICY "Faculty and HOD can manage academic materials"
      ON public.academic_materials FOR ALL
      TO authenticated
      USING (
        (department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
        OR public.get_auth_user_role() = 'ADMIN'
      )
      WITH CHECK (
        (department_id = public.get_auth_user_department_id() AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
        OR public.get_auth_user_role() = 'ADMIN'
      );

    CREATE TABLE IF NOT EXISTS public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id UUID,
      actor_email TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      description TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admin can view audit logs" ON public.audit_logs;
    CREATE POLICY "Admin can view audit logs"
      ON public.audit_logs FOR SELECT
      TO authenticated
      USING (public.get_auth_user_role() = 'ADMIN');

    DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
    CREATE POLICY "Authenticated users can insert audit logs"
      ON public.audit_logs FOR INSERT
      TO authenticated
      WITH CHECK (true);

    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT USAGE ON SCHEMA storage TO authenticated, anon;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO authenticated, anon;
  `;
  const initRes = await runSql(initSql);
  assert.equal(initRes.success, true, `Schema init failed: ${initRes.stderr}`);
  console.log('  -> Schemas and functions verified.');

  // 2. Apply Migration 00039
  console.log('\n[2/5] Applying Migration 00039: Academic Materials Storage Security...');
  const migRes = await runSql(`
    DROP POLICY IF EXISTS "Department users can view academic materials" ON storage.objects;
    DROP POLICY IF EXISTS "Faculty can upload academic materials" ON storage.objects;
    DROP POLICY IF EXISTS "Faculty can delete academic materials" ON storage.objects;
    DROP POLICY IF EXISTS "Authorized users view academic materials" ON storage.objects;
    DROP POLICY IF EXISTS "Authorized faculty upload academic materials" ON storage.objects;
    DROP POLICY IF EXISTS "Authorized faculty update academic materials" ON storage.objects;
    DROP POLICY IF EXISTS "Authorized faculty delete academic materials" ON storage.objects;

    CREATE POLICY "Authorized users view academic materials"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'academic-materials'
        AND public.is_active_auth_user()
        AND (
          public.get_auth_user_role() = 'ADMIN'
          OR EXISTS (
            SELECT 1 FROM public.academic_materials m
            WHERE m.storage_path = storage.objects.name
              AND (
                (public.get_auth_user_role() = 'HOD' AND m.department_id = public.get_auth_user_department_id())
                OR (public.get_auth_user_role() = 'FACULTY' AND m.uploaded_by = auth.uid())
                OR (
                  public.get_auth_user_role() = 'FACULTY'
                  AND m.department_id = public.get_auth_user_department_id()
                  AND (
                    EXISTS (
                      SELECT 1 FROM public.course_enrollments ce
                      WHERE ce.faculty_id = auth.uid()
                        AND (ce.course_id = m.course_id OR ce.course_code = m.course_id)
                    )
                    OR EXISTS (
                      SELECT 1 FROM public.timetable_entries te
                      WHERE te.faculty_id = auth.uid()
                        AND (te.course_id = m.course_id OR te.course_code = m.course_id)
                    )
                  )
                )
                OR (
                  public.get_auth_user_role() = 'STUDENT'
                  AND m.department_id = public.get_auth_user_department_id()
                  AND EXISTS (
                    SELECT 1 FROM public.course_enrollments ce
                    WHERE ce.student_id = auth.uid()
                      AND (ce.course_id = m.course_id OR ce.course_code = m.course_id)
                      AND ce.status = 'Active'
                  )
                )
              )
          )
        )
      );

    CREATE POLICY "Authorized faculty upload academic materials"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'academic-materials'
        AND public.is_active_auth_user()
        AND (
          public.get_auth_user_role() = 'ADMIN'
          OR (
            (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
            AND (
              public.get_auth_user_role() = 'HOD'
              OR (
                public.get_auth_user_role() = 'FACULTY'
                AND (
                  EXISTS (
                    SELECT 1 FROM public.course_enrollments ce
                    WHERE ce.faculty_id = auth.uid()
                      AND (ce.course_id = (storage.foldername(name))[2] OR ce.course_code = (storage.foldername(name))[2])
                  )
                  OR EXISTS (
                    SELECT 1 FROM public.timetable_entries te
                    WHERE te.faculty_id = auth.uid()
                      AND (te.course_id = (storage.foldername(name))[2] OR te.course_code = (storage.foldername(name))[2])
                  )
                )
              )
            )
          )
        )
      );

    CREATE POLICY "Authorized faculty update academic materials"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'academic-materials'
        AND public.is_active_auth_user()
        AND (
          public.get_auth_user_role() = 'ADMIN'
          OR (
            (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
            AND (
              public.get_auth_user_role() = 'HOD'
              OR (
                public.get_auth_user_role() = 'FACULTY'
                AND (
                  EXISTS (
                    SELECT 1 FROM public.course_enrollments ce
                    WHERE ce.faculty_id = auth.uid()
                      AND (ce.course_id = (storage.foldername(name))[2] OR ce.course_code = (storage.foldername(name))[2])
                  )
                  OR EXISTS (
                    SELECT 1 FROM public.timetable_entries te
                    WHERE te.faculty_id = auth.uid()
                      AND (te.course_id = (storage.foldername(name))[2] OR te.course_code = (storage.foldername(name))[2])
                  )
                )
              )
            )
          )
        )
      );

    CREATE POLICY "Authorized faculty delete academic materials"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'academic-materials'
        AND public.is_active_auth_user()
        AND (
          public.get_auth_user_role() = 'ADMIN'
          OR (
            (storage.foldername(name))[1] = public.get_auth_user_department_id()::text
            AND (
              public.get_auth_user_role() = 'HOD'
              OR (
                public.get_auth_user_role() = 'FACULTY'
                AND (
                  EXISTS (
                    SELECT 1 FROM public.course_enrollments ce
                    WHERE ce.faculty_id = auth.uid()
                      AND (ce.course_id = (storage.foldername(name))[2] OR ce.course_code = (storage.foldername(name))[2])
                  )
                  OR EXISTS (
                    SELECT 1 FROM public.timetable_entries te
                    WHERE te.faculty_id = auth.uid()
                      AND (te.course_id = (storage.foldername(name))[2] OR te.course_code = (storage.foldername(name))[2])
                  )
                )
              )
            )
          )
        )
      );
  `);
  assert.equal(migRes.success, true, `Migration 00039 failed to apply: ${migRes.stderr}`);
  console.log('  -> Migration 00039 applied cleanly with 0 SQL errors.');

  // 3. Seed test entities
  console.log('\n[3/5] Seeding test departments, faculty assignments, student enrollments, and storage objects...');
  const seedSql = `
    DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'attendance_records') THEN DELETE FROM public.attendance_records; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'attendance_sessions') THEN DELETE FROM public.attendance_sessions; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'announcement_reads') THEN DELETE FROM public.announcement_reads; END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'announcements') THEN DELETE FROM public.announcements; END IF;
    END $$;
    DELETE FROM public.academic_materials;
    DELETE FROM public.timetable_entries;
    DELETE FROM public.course_enrollments;
    DELETE FROM public.profiles;
    DELETE FROM public.departments;
    DELETE FROM storage.objects WHERE bucket_id = 'academic-materials';
    INSERT INTO storage.buckets (id, name, public) VALUES ('academic-materials', 'academic-materials', false)
      ON CONFLICT (id) DO NOTHING;

    -- Departments
    INSERT INTO public.departments (id, name, code) VALUES
      ('11111111-1111-1111-1111-111111111111', 'Computer Science and Engineering', 'CSE'),
      ('22222222-2222-2222-2222-222222222222', 'Electronics and Communication Engineering', 'ECE');

    -- Users
    INSERT INTO public.profiles (id, role, department_id, full_name, account_status) VALUES
      ('10100000-0000-0000-0000-000000000001', 'FACULTY', '11111111-1111-1111-1111-111111111111', 'Faculty A', 'ACTIVE'), -- Faculty A (teaches CS501)
      ('10200000-0000-0000-0000-000000000002', 'FACULTY', '11111111-1111-1111-1111-111111111111', 'Faculty B', 'ACTIVE'), -- Faculty B (same dept, unassigned)
      ('10300000-0000-0000-0000-000000000003', 'FACULTY', '22222222-2222-2222-2222-222222222222', 'Faculty C', 'ACTIVE'), -- Faculty C (cross dept ECE)
      ('20100000-0000-0000-0000-000000000001', 'STUDENT', '11111111-1111-1111-1111-111111111111', 'Student A', 'ACTIVE'), -- Student A (enrolled in CS501)
      ('20200000-0000-0000-0000-000000000002', 'STUDENT', '11111111-1111-1111-1111-111111111111', 'Student B', 'ACTIVE'), -- Student B (same dept, not enrolled in CS501)
      ('20300000-0000-0000-0000-000000000003', 'STUDENT', '22222222-2222-2222-2222-222222222222', 'Student C', 'ACTIVE'), -- Student C (cross dept)
      ('30100000-0000-0000-0000-000000000001', 'HOD',     '11111111-1111-1111-1111-111111111111', 'HOD CSE',   'ACTIVE'), -- HOD CSE
      ('40100000-0000-0000-0000-000000000001', 'ADMIN',   '11111111-1111-1111-1111-111111111111', 'Admin',     'ACTIVE'), -- Admin
      ('99900000-0000-0000-0000-000000000001', 'FACULTY', '11111111-1111-1111-1111-111111111111', 'Inactive',  'LOCKED'); -- Inactive Faculty

    -- Teaching assignments & enrollments
    INSERT INTO public.course_enrollments (id, student_id, course_id, course_code, department_id, faculty_id, status) VALUES
      ('00010000-0000-0000-0000-000000000001', '20100000-0000-0000-0000-000000000001', 'CS501', 'CS501', '11111111-1111-1111-1111-111111111111', '10100000-0000-0000-0000-000000000001', 'Active'),
      ('00020000-0000-0000-0000-000000000002', '20200000-0000-0000-0000-000000000002', 'CS502', 'CS502', '11111111-1111-1111-1111-111111111111', '10200000-0000-0000-0000-000000000002', 'Active');

    -- Storage object and linked academic_materials record
    INSERT INTO storage.objects (id, bucket_id, name, owner) VALUES
      ('00030000-0000-0000-0000-000000000001', 'academic-materials', '11111111-1111-1111-1111-111111111111/CS501/Module 1/uuid-lecture1.pdf', '10100000-0000-0000-0000-000000000001'),
      ('00040000-0000-0000-0000-000000000002', 'academic-materials', '11111111-1111-1111-1111-111111111111/CS501/Module 1/orphan-unlinked.pdf', '10100000-0000-0000-0000-000000000001');

    INSERT INTO public.academic_materials (id, title, course_id, module_id, storage_path, file_name, department_id, uploaded_by) VALUES
      ('00050000-0000-0000-0000-000000000001', 'Lecture 1 Slides', 'CS501', 'Module 1', '11111111-1111-1111-1111-111111111111/CS501/Module 1/uuid-lecture1.pdf', 'lecture1.pdf', '11111111-1111-1111-1111-111111111111', '10100000-0000-0000-0000-000000000001');
  `;
  const seedRes = await runSql(seedSql);
  assert.equal(seedRes.success, true, `Seed failed: ${seedRes.stderr}`);
  console.log('  -> Seed data established.');

  // 4. Verify Storage SELECT Access Matrix
  console.log('\n[4/5] Verifying Storage SELECT Access Matrix against Migration 00039 RLS...');
  const canSelectObject = async (userId, objectName) => {
    const res = await runSqlAsUser(userId, `SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'academic-materials' AND name = '${objectName}';`);
    assert.equal(res.success, true, `Query failed: ${res.stderr}`);
    const lastLine = res.stdout.split('\n').map(l => l.trim()).filter(Boolean).pop();
    return parseInt(lastLine, 10) === 1;
  };

  const objValid = '11111111-1111-1111-1111-111111111111/CS501/Module 1/uuid-lecture1.pdf';
  const objOrphan = '11111111-1111-1111-1111-111111111111/CS501/Module 1/orphan-unlinked.pdf';

  // Test 1: Assigned Faculty can view
  assert.equal(await canSelectObject('10100000-0000-0000-0000-000000000001', objValid), true, 'Assigned faculty must be able to view course material');
  console.log('  ✔ Assigned Faculty A (teaches CS501): ALLOW');

  // Test 2: Same-department UNASSIGNED faculty is DENIED (Resolves DEF-08.2.2-02)
  assert.equal(await canSelectObject('10200000-0000-0000-0000-000000000002', objValid), false, 'Same-department unassigned faculty must be DENIED access');
  console.log('  ✔ Same-Department Unassigned Faculty B: DENY (DEF-08.2.2-02 resolved)');

  // Test 3: Cross-department faculty is DENIED
  assert.equal(await canSelectObject('10300000-0000-0000-0000-000000000003', objValid), false, 'Cross-department faculty must be DENIED access');
  console.log('  ✔ Cross-Department Faculty C: DENY');

  // Test 4: Enrolled student can view
  assert.equal(await canSelectObject('20100000-0000-0000-0000-000000000001', objValid), true, 'Enrolled student must be able to view course material');
  console.log('  ✔ Enrolled Student A: ALLOW');

  // Test 5: Same-department NON-enrolled student is DENIED
  assert.equal(await canSelectObject('20200000-0000-0000-0000-000000000002', objValid), false, 'Non-enrolled student in same department must be DENIED access');
  console.log('  ✔ Non-Enrolled Student B: DENY');

  // Test 6: Cross-department student is DENIED
  assert.equal(await canSelectObject('20300000-0000-0000-0000-000000000003', objValid), false, 'Cross-department student must be DENIED access');
  console.log('  ✔ Cross-Department Student C: DENY');

  // Test 7: HOD of the department can view
  assert.equal(await canSelectObject('30100000-0000-0000-0000-000000000001', objValid), true, 'Department HOD must be able to view materials');
  console.log('  ✔ Department HOD: ALLOW');

  // Test 8: Admin can view
  assert.equal(await canSelectObject('40100000-0000-0000-0000-000000000001', objValid), true, 'Admin must have superuser access');
  console.log('  ✔ Admin: ALLOW');

  // Test 9: Inactive account is DENIED
  assert.equal(await canSelectObject('99900000-0000-0000-0000-000000000001', objValid), false, 'Inactive user must be DENIED access');
  console.log('  ✔ Inactive Account: DENY');

  // Test 10: Orphaned storage object without parent record is DENIED
  assert.equal(await canSelectObject('10100000-0000-0000-0000-000000000001', objOrphan), false, 'Orphaned storage object without parent record must be DENIED');
  console.log('  ✔ Orphaned Storage Object (unlinked): DENY');

  // 5. Verify Storage INSERT and DELETE Boundaries
  console.log('\n[5/5] Verifying Storage INSERT & DELETE Authorization Matrix...');
  const canInsertObject = async (userId, targetPath) => {
    const res = await runSqlAsUser(userId, `
      INSERT INTO storage.objects (id, bucket_id, name, owner) 
      VALUES (gen_random_uuid(), 'academic-materials', '${targetPath}', '${userId}');
    `);
    return res.success;
  };

  const canDeleteObject = async (userId, targetPath) => {
    const res = await runSqlAsUser(userId, `
      DELETE FROM storage.objects 
      WHERE bucket_id = 'academic-materials' AND name = '${targetPath}';
    `);
    // Check if delete actually affected rows
    return res.success;
  };

  // Insert tests
  const newPathAssigned = '11111111-1111-1111-1111-111111111111/CS501/Module 2/uuid-new.pdf';
  const newPathUnassigned = '11111111-1111-1111-1111-111111111111/CS999/Module 1/uuid-fail.pdf';

  assert.equal(await canInsertObject('10100000-0000-0000-0000-000000000001', newPathAssigned), true, 'Assigned faculty must be able to upload');
  console.log('  ✔ Assigned Faculty INSERT to assigned course: ALLOW');

  assert.equal(await canInsertObject('10200000-0000-0000-0000-000000000002', newPathAssigned), false, 'Unassigned faculty must NOT be able to upload to CS501');
  console.log('  ✔ Unassigned Faculty INSERT to CS501: DENY');

  assert.equal(await canInsertObject('20100000-0000-0000-0000-000000000001', newPathAssigned), false, 'Student must NOT be able to upload');
  console.log('  ✔ Student INSERT: DENY');

  // Link uploaded object to an academic_materials row to establish parent relationship
  await runSql(`
    INSERT INTO public.academic_materials (id, title, course_id, module_id, storage_path, file_name, department_id, uploaded_by) 
    VALUES ('00060000-0000-0000-0000-000000000001', 'New Material', 'CS501', 'Module 2', '${newPathAssigned}', 'new.pdf', '11111111-1111-1111-1111-111111111111', '10100000-0000-0000-0000-000000000001');
  `);

  // Delete tests
  assert.equal(await canDeleteObject('10200000-0000-0000-0000-000000000002', newPathAssigned), true); // SQL executes with RLS
  // Check row still exists because unassigned faculty delete was filtered out by RLS:
  const checkRemain = await runSql(`SELECT count(*)::int FROM storage.objects WHERE name = '${newPathAssigned}';`);
  const countRemain = parseInt(checkRemain.stdout.split('\n').map(l => l.trim()).filter(Boolean).pop(), 10);
  assert.equal(countRemain, 1, 'Unassigned faculty DELETE must not remove object');
  console.log('  ✔ Unassigned Faculty DELETE: BLOCKED BY RLS');

  // Assigned faculty delete actually removes it
  await runSqlAsUser('10100000-0000-0000-0000-000000000001', `DELETE FROM storage.objects WHERE name = '${newPathAssigned}';`);
  const checkRemoved = await runSql(`SELECT count(*)::int FROM storage.objects WHERE name = '${newPathAssigned}';`);
  const countRemoved = parseInt(checkRemoved.stdout.split('\n').map(l => l.trim()).filter(Boolean).pop(), 10);
  assert.equal(countRemoved, 0, 'Assigned faculty DELETE must remove object');
  console.log('  ✔ Assigned Faculty DELETE: ALLOW');

  // MISSION 08.2.3: Real PostgreSQL Deletion Recovery & Database-Level RLS Verification
  console.log('\n[6/6] Verifying Mission 08.2.3 Deletion Recovery & Database RLS...');

  // A. Verify student cannot delete academic_materials row
  await runSqlAsUser('20100000-0000-0000-0000-000000000001', `DELETE FROM public.academic_materials WHERE id = '00060000-0000-0000-0000-000000000001';`);
  const checkStudentDbDel = await runSql(`SELECT count(*)::int FROM public.academic_materials WHERE id = '00060000-0000-0000-0000-000000000001';`);
  const countAfterStudent = parseInt(checkStudentDbDel.stdout.split('\n').map(l => l.trim()).filter(Boolean).pop(), 10);
  assert.equal(countAfterStudent, 1, 'Student must not be able to delete academic_materials row');
  console.log('  ✔ Student DELETE on public.academic_materials: BLOCKED BY RLS');

  // B. Verify cross-department faculty cannot delete academic_materials row
  await runSqlAsUser('10300000-0000-0000-0000-000000000003', `DELETE FROM public.academic_materials WHERE id = '00060000-0000-0000-0000-000000000001';`);
  const checkCrossDeptDel = await runSql(`SELECT count(*)::int FROM public.academic_materials WHERE id = '00060000-0000-0000-0000-000000000001';`);
  const countAfterCross = parseInt(checkCrossDeptDel.stdout.split('\n').map(l => l.trim()).filter(Boolean).pop(), 10);
  assert.equal(countAfterCross, 1, 'Cross-department faculty must not be able to delete academic_materials row');
  console.log('  ✔ Cross-Department Faculty DELETE on public.academic_materials: BLOCKED BY RLS');

  // C. Verify assigned faculty CAN delete academic_materials row
  await runSqlAsUser('10100000-0000-0000-0000-000000000001', `DELETE FROM public.academic_materials WHERE id = '00060000-0000-0000-0000-000000000001';`);
  const checkFacDel = await runSql(`SELECT count(*)::int FROM public.academic_materials WHERE id = '00060000-0000-0000-0000-000000000001';`);
  const countAfterFac = parseInt(checkFacDel.stdout.split('\n').map(l => l.trim()).filter(Boolean).pop(), 10);
  assert.equal(countAfterFac, 0, 'Assigned faculty must be able to delete academic_materials row');
  console.log('  ✔ Assigned Faculty DELETE on public.academic_materials: ALLOW');

  // D. Verify authenticated user can insert failure recovery audit log into public.audit_logs
  const auditRes = await runSqlAsUser('10100000-0000-0000-0000-000000000001', `
    INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, description, metadata)
    VALUES (
      '10100000-0000-0000-0000-000000000001',
      'FACULTY',
      'ACADEMIC_MATERIAL_DELETE_FAILED',
      'academic_materials',
      '00060000-0000-0000-0000-000000000001',
      'Test deletion recovery audit log',
      '{"storage_path": "11111111-1111-1111-1111-111111111111/CS501/Module 2/uuid-new.pdf", "retries": 3}'::jsonb
    );
  `);
  assert.equal(auditRes.success, true, `Audit log insertion failed: ${auditRes.stderr}`);
  const checkAudit = await runSql(`SELECT count(*)::int FROM public.audit_logs WHERE action = 'ACADEMIC_MATERIAL_DELETE_FAILED';`);
  const countAudit = parseInt(checkAudit.stdout.split('\n').map(l => l.trim()).filter(Boolean).pop(), 10);
  assert.ok(countAudit >= 1, 'Audit log entry must exist in public.audit_logs');
  console.log('  ✔ Authenticated User INSERT to public.audit_logs: ALLOW');

  // E. Verify PostgreSQL RLS behavior: deleting an orphan storage object without parent record is blocked by SELECT policy
  const orphanObj = '11111111-1111-1111-1111-111111111111/CS501/Module 1/orphan-unlinked.pdf';
  await runSqlAsUser('10100000-0000-0000-0000-000000000001', `DELETE FROM storage.objects WHERE name = '${orphanObj}';`);
  const checkOrphan = await runSql(`SELECT count(*)::int FROM storage.objects WHERE name = '${orphanObj}';`);
  const countOrphan = parseInt(checkOrphan.stdout.split('\n').map(l => l.trim()).filter(Boolean).pop(), 10);
  assert.equal(countOrphan, 1, 'Orphan object without parent record must be invisible to non-admin DELETE');
  console.log('  ✔ Orphan storage object without parent record protected from non-admin DELETE: CONFIRMED');

  console.log('\n=============================================================');
  console.log('>>> ALL REAL POSTGRESQL 16 ACADEMIC MATERIALS CHECKS PASSED! <<<');
  console.log('=============================================================');
}

run().catch((err) => {
  console.error('\n❌ REAL POSTGRESQL VERIFICATION FAILED:');
  console.error(err.message || err);
  process.exit(1);
});
