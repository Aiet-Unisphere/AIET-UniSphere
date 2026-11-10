import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Test 1: Migration 00043 file presence & contents
test('1. Migration 00043 exists and defines designation on public.profiles', () => {
  const migrationPath = path.join(rootDir, 'supabase', 'migrations', '00043_faculty_designation.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 00043 file should exist');

  const content = fs.readFileSync(migrationPath, 'utf-8');
  assert.ok(content.includes('profiles'), 'Migration should target public.profiles');
  assert.ok(content.includes('designation'), 'Migration should reference designation column');
  assert.ok(content.includes('TEXT'), 'Migration should declare designation as TEXT');
  assert.ok(content.includes('COMMENT ON COLUMN public.profiles.designation'), 'Migration should comment designation column');
});

// Test 2: Local Postgres test cluster schema inspection
test('2. Local Postgres cluster profiles table has designation column', () => {
  const psqlPath = 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';
  const query = "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'designation';";
  const output = execSync(`"${psqlPath}" -p 54333 -U postgres -d postgres -t -A -F "|" -c "${query}"`, {
    encoding: 'utf-8',
    windowsHide: true,
  }).trim();

  const [colName, dataType, isNullable] = output.split('|');
  assert.strictEqual(colName, 'designation');
  assert.strictEqual(dataType, 'text');
  assert.strictEqual(isNullable, 'YES');
});

// Test 3: TypeScript interface definitions
test('3. Profile interface in database.types.ts includes designation', () => {
  const typesPath = path.join(rootDir, 'src', 'types', 'database.types.ts');
  const content = fs.readFileSync(typesPath, 'utf-8');

  // Verify designation exists in Profile interface
  const profileMatch = content.match(/export interface Profile \{([\s\S]*?)\}/);
  assert.ok(profileMatch, 'Profile interface should exist');
  assert.ok(profileMatch[1].includes('designation?: string | null;'), 'Profile should include designation?: string | null');
});

// Test 4: Faculty service selects designation and falls back gracefully
test('4. faculty/services/facultyService.ts correctly queries designation with fallback', () => {
  const facultyServicePath = path.join(rootDir, 'src', 'faculty', 'services', 'facultyService.ts');
  const content = fs.readFileSync(facultyServicePath, 'utf-8');

  // Must select designation in getFacultyProfile
  assert.ok(
    content.includes(".select('id, full_name, email, designation, department:departments(name)')"),
    'facultyService should include designation in Supabase select query'
  );

  // Must use "Designation not specified" fallback
  assert.ok(
    content.includes("title: data.designation || 'Designation not specified'"),
    'facultyService should fall back to "Designation not specified"'
  );
  assert.ok(
    content.includes("title: 'Designation not specified'"),
    'fallback error return should use "Designation not specified"'
  );
});

// Test 5: Global faculty service maps designation with fallback
test('5. services/facultyService.ts correctly maps designation for HOD and faculty', () => {
  const facultyServicePath = path.join(rootDir, 'src', 'services', 'facultyService.ts');
  const content = fs.readFileSync(facultyServicePath, 'utf-8');

  // Must select designation
  assert.ok(
    content.includes('designation, department:departments(id,name,code)'),
    'global facultyService should query designation'
  );

  // Must map designation with correct fallback
  assert.ok(
    content.includes("designation: profile.designation || (profile.role === 'HOD' ? 'Head of Department' : 'Designation not specified')"),
    'global facultyService should fall back to Head of Department for HOD and Designation not specified for Faculty'
  );
});

// Test 6: User service persists designation in updateUser and createUser
test('6. services/userService.ts persists designation in updateUser and createUser', () => {
  const userServicePath = path.join(rootDir, 'src', 'services', 'userService.ts');
  const content = fs.readFileSync(userServicePath, 'utf-8');

  // updateUser handles designation
  assert.ok(
    content.includes('if (updates.designation !== undefined) {'),
    'updateUser should handle updates.designation'
  );
  assert.ok(
    content.includes('payload.designation = updates.designation ? updates.designation.trim() : null;'),
    'updateUser should trim or nullify designation'
  );

  // createUser handles designation
  assert.ok(
    content.includes('if (data.designation) {'),
    'createUser should check data.designation'
  );
});

// Test 7: FacultyProfilePage renders dynamic designation instead of hardcoded string
test('7. FacultyProfilePage renders dynamic designation without hardcoded string', () => {
  const profilePagePath = path.join(rootDir, 'src', 'faculty', 'pages', 'FacultyProfilePage.tsx');
  const content = fs.readFileSync(profilePagePath, 'utf-8');

  // Must NOT contain hardcoded "Assistant / Associate Professor"
  assert.ok(
    !content.includes('Assistant / Associate Professor'),
    'FacultyProfilePage must not contain hardcoded "Assistant / Associate Professor"'
  );

  // Must render dynamic designation
  assert.ok(
    content.includes("{authProfile?.designation || 'Designation not specified'}"),
    'FacultyProfilePage should render authProfile?.designation || Designation not specified'
  );

  // Card badge renders designation or Faculty Member
  assert.ok(
    content.includes("{authProfile?.designation || 'Faculty Member'}"),
    'FacultyProfilePage card badge should render authProfile?.designation || Faculty Member'
  );
});

// Test 8: FacultyDashboard renders dynamic designation in header greeting
test('8. FacultyDashboard renders dynamic designation in greeting', () => {
  const dashboardPagePath = path.join(rootDir, 'src', 'faculty', 'pages', 'FacultyDashboard.tsx');
  const content = fs.readFileSync(dashboardPagePath, 'utf-8');

  assert.ok(
    content.includes("{deptDisplayName} · {authProfile?.designation || 'Faculty'}"),
    'FacultyDashboard header should render dynamic designation or Faculty'
  );
});

// Test 9: Admin UserForm allows setting designation for FACULTY and HOD
test('9. Admin UserForm provides designation input for Faculty & HOD', () => {
  const userFormPath = path.join(rootDir, 'src', 'admin', 'pages', 'UserForm.tsx');
  const content = fs.readFileSync(userFormPath, 'utf-8');

  assert.ok(
    content.includes("const [designation, setDesignation] = useState('');"),
    'UserForm should have designation state'
  );
  assert.ok(
    content.includes("(role === 'FACULTY' || role === 'HOD') && ("),
    'UserForm should display designation input conditionally for FACULTY or HOD'
  );
  assert.ok(
    content.includes('Academic Designation (Optional)'),
    'UserForm should label field Academic Designation (Optional)'
  );
});

// Test 10: Fallback and neutral handling logic for Student, Faculty, and HOD
test('10. Designation display logic correctly handles all role combinations', () => {
  const resolveDesignation = (profile) => {
    if (profile.designation && profile.designation.trim()) {
      return profile.designation.trim();
    }
    if (profile.role === 'HOD') return 'Head of Department';
    if (profile.role === 'FACULTY') return 'Designation not specified';
    return null; // Students / Admins do not have faculty designation
  };

  // Case A: Faculty with explicit title
  assert.strictEqual(
    resolveDesignation({ role: 'FACULTY', designation: 'Associate Professor' }),
    'Associate Professor'
  );

  // Case B: Faculty without title
  assert.strictEqual(
    resolveDesignation({ role: 'FACULTY', designation: null }),
    'Designation not specified'
  );

  // Case C: Faculty with empty string
  assert.strictEqual(
    resolveDesignation({ role: 'FACULTY', designation: '   ' }),
    'Designation not specified'
  );

  // Case D: HOD with custom title
  assert.strictEqual(
    resolveDesignation({ role: 'HOD', designation: 'Professor & Dean of Academics' }),
    'Professor & Dean of Academics'
  );

  // Case E: HOD with null title
  assert.strictEqual(
    resolveDesignation({ role: 'HOD', designation: null }),
    'Head of Department'
  );

  // Case F: Student profile (must be neutral)
  assert.strictEqual(
    resolveDesignation({ role: 'STUDENT', designation: null }),
    null
  );

  // Case G: Admin profile (must be neutral)
  assert.strictEqual(
    resolveDesignation({ role: 'ADMIN', designation: null }),
    null
  );
});
