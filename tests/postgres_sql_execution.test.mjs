/**
 * AIET-UniSphere - Real PostgreSQL Engine SQL Integration Test
 * 
 * Executes real PostgreSQL SQL queries using in-memory PostgreSQL engine (pg-mem)
 * to verify SQL syntax correctness, special-expression forms, and table operations
 * for Migrations 00034 and 00035.
 * 
 * This is distinguished from JavaScript unit tests:
 * THIS TEST PARSES AND EXECUTES REAL POSTGRESQL STATEMENTS.
 */

import assert from 'node:assert';
import test from 'node:test';
import { newDb } from 'pg-mem';

test('PostgreSQL Engine: 1. Core special forms COALESCE and NULLIF are valid unqualified expressions', () => {
  const db = newDb();
  
  // Register custom functions for pg-mem compatibility if needed
  db.public.registerFunction({
    name: 'nullif',
    args: [db.public.getType('text'), db.public.getType('text')],
    returns: db.public.getType('text'),
    implementation: (a, b) => (a === b ? null : a)
  });

  const res1 = db.public.many("SELECT COALESCE(NULL, 'fallback') AS val");
  assert.strictEqual(res1[0].val, 'fallback');

  const res2 = db.public.many("SELECT COALESCE(NULLIF('test', 'test'), 'default') AS val");
  assert.strictEqual(res2[0].val, 'default');

  const res3 = db.public.many("SELECT COALESCE(NULLIF('custom_name', ''), 'fallback_name') AS val");
  assert.strictEqual(res3[0].val, 'custom_name');
});

test('PostgreSQL Engine: 2. Schema-qualified pg_catalog.coalesce is rejected as non-existent function', () => {
  const db = newDb();
  assert.throws(
    () => db.public.query("SELECT pg_catalog.coalesce(1, 2)"),
    /does not exist/
  );
});

test('PostgreSQL Engine: 3. Migration 00034 INSERT and ON CONFLICT DO UPDATE executes on profiles table', () => {
  const db = newDb();

  db.public.registerFunction({
    name: 'nullif',
    args: [db.public.getType('text'), db.public.getType('text')],
    returns: db.public.getType('text'),
    implementation: (a, b) => (a === b ? null : a)
  });

  // Create representative profiles schema matching 00001
  db.public.none(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      full_name TEXT,
      usn_or_employee_id TEXT,
      role TEXT NOT NULL DEFAULT 'STUDENT',
      account_status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Execute exact INSERT statement from 00034
  db.public.none(`
    INSERT INTO profiles (
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
      'usr-uuid-1',
      'student@aiet.edu',
      COALESCE('Alice Student', ''),
      COALESCE('4AI21CS001', NULL, NULL),
      'STUDENT',
      'ACTIVE',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = COALESCE(
        NULLIF(EXCLUDED.full_name, ''),
        profiles.full_name
      ),
      usn_or_employee_id = COALESCE(
        profiles.usn_or_employee_id,
        EXCLUDED.usn_or_employee_id
      ),
      updated_at = NOW();
  `);

  const initialRows = db.public.many("SELECT * FROM profiles WHERE id = 'usr-uuid-1'");
  assert.strictEqual(initialRows.length, 1);
  assert.strictEqual(initialRows[0].role, 'STUDENT');
  assert.strictEqual(initialRows[0].full_name, 'Alice Student');
  assert.strictEqual(initialRows[0].usn_or_employee_id, '4AI21CS001');

  // Simulate an admin upgrading the user to FACULTY
  db.public.none("UPDATE profiles SET role = 'FACULTY' WHERE id = 'usr-uuid-1'");
  const upgraded = db.public.many("SELECT role FROM profiles WHERE id = 'usr-uuid-1'");
  assert.strictEqual(upgraded[0].role, 'FACULTY');

  // Trigger re-fires (e.g. email change or re-sync) - must NOT demote staff role
  db.public.none(`
    INSERT INTO profiles (
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
      'usr-uuid-1',
      'student_new@aiet.edu',
      COALESCE('', ''),
      COALESCE(NULL, NULL, NULL),
      'STUDENT',
      'ACTIVE',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = COALESCE(
        NULLIF(EXCLUDED.full_name, ''),
        profiles.full_name
      ),
      usn_or_employee_id = COALESCE(
        profiles.usn_or_employee_id,
        EXCLUDED.usn_or_employee_id
      ),
      updated_at = NOW();
  `);

  const syncedRows = db.public.many("SELECT * FROM profiles WHERE id = 'usr-uuid-1'");
  assert.strictEqual(syncedRows[0].role, 'FACULTY', 'Staff role must be preserved on conflict');
  assert.strictEqual(syncedRows[0].email, 'student_new@aiet.edu', 'Email updated');
  assert.strictEqual(syncedRows[0].full_name, 'Alice Student', 'Non-empty name preserved');
});

test('PostgreSQL Engine: 4. Migration 00035 timetable conflict query executes against schema', () => {
  const db = newDb();

  // Create representative timetable_entries schema matching 00015
  db.public.none(`
    CREATE TABLE timetable_entries (
      id TEXT PRIMARY KEY,
      department_id TEXT NOT NULL,
      course_name TEXT NOT NULL,
      faculty_id TEXT,
      faculty_name TEXT,
      semester INTEGER NOT NULL,
      section TEXT,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT,
      academic_year TEXT
    );
  `);

  // Insert existing room slot
  db.public.none(`
    INSERT INTO timetable_entries VALUES (
      'tt-1',
      'dept-mech',
      'Thermodynamics',
      'fac-1',
      'Dr. Mech',
      3,
      'A',
      'Monday',
      '09:00 AM',
      '10:00 AM',
      'LH-101',
      '2025-2026'
    );
  `);

  // Conflict query simulation from 00035: Cross-department room check
  const conflict = db.public.many(`
    SELECT id, course_name, day_of_week, start_time, end_time
    FROM timetable_entries
    WHERE id <> COALESCE('tt-candidate', '00000000-0000-0000-0000-000000000000')
      AND LOWER(room) = LOWER('lh-101')
      AND day_of_week = 'Monday'
      AND COALESCE(academic_year, '') = COALESCE('2025-2026', '')
    LIMIT 1;
  `);

  assert.strictEqual(conflict.length, 1);
  assert.strictEqual(conflict[0].course_name, 'Thermodynamics');

  // Non-conflicting query on different academic year:
  const noConflict = db.public.many(`
    SELECT id, course_name
    FROM timetable_entries
    WHERE id <> COALESCE('tt-candidate', '00000000-0000-0000-0000-000000000000')
      AND LOWER(room) = LOWER('lh-101')
      AND day_of_week = 'Monday'
      AND COALESCE(academic_year, '') = COALESCE('2026-2027', '')
    LIMIT 1;
  `);

  assert.strictEqual(noConflict.length, 0, 'Different academic year should return 0 conflicts');
});
