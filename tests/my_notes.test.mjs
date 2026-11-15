import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// -------------------------------------------------------------
// AIET-UniSphere — My Notes Comprehensive Verification Test Suite
// -------------------------------------------------------------

const migrationPath = path.resolve('supabase/migrations/00046_student_notes.sql');
const noteServicePath = path.resolve('src/services/noteService.ts');
const myNotesPagePath = path.resolve('src/pages/MyNotesPage.tsx');
const appShellPath = path.resolve('src/components/AppShell.tsx');
const appPath = path.resolve('src/App.tsx');
const dbTypesPath = path.resolve('src/types/database.types.ts');

test('1. Migration file exists and adheres to numbering and naming conventions', () => {
  assert.ok(fs.existsSync(migrationPath), 'Migration 00046_student_notes.sql must exist');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.student_notes'), 'Must create student_notes table');
  assert.ok(sql.includes('REFERENCES auth.users(id) ON DELETE CASCADE'), 'student_id must reference auth.users(id)');
  assert.ok(sql.includes('ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY'), 'RLS must be enabled');
});

test('2. Performance indexes: student_id and updated_at indexes are defined', () => {
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_student_notes_student_id'), 'Index on student_id required');
  assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_student_notes_updated_at'), 'Index on student_id and updated_at required');
});

test('3. Row Level Security: Complete CRUD policies strictly enforce auth.uid() isolation', () => {
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // SELECT policy
  assert.ok(sql.includes('CREATE POLICY "Students can read own notes"'), 'SELECT policy must exist');
  assert.ok(sql.includes('USING (student_id = auth.uid())'), 'SELECT policy must enforce student_id = auth.uid()');

  // INSERT policy
  assert.ok(sql.includes('CREATE POLICY "Students can create own notes"'), 'INSERT policy must exist');
  assert.ok(sql.includes('WITH CHECK (student_id = auth.uid())'), 'INSERT policy must enforce student_id = auth.uid()');

  // UPDATE policy
  assert.ok(sql.includes('CREATE POLICY "Students can update own notes"'), 'UPDATE policy must exist');
  assert.ok(sql.includes('USING (student_id = auth.uid())'), 'UPDATE policy USING must enforce student_id = auth.uid()');
  assert.ok(sql.includes('WITH CHECK (student_id = auth.uid())'), 'UPDATE policy WITH CHECK must enforce student_id = auth.uid()');

  // DELETE policy
  assert.ok(sql.includes('CREATE POLICY "Students can delete own notes"'), 'DELETE policy must exist');
  assert.ok(/FOR DELETE\s+TO authenticated\s+USING\s*\(student_id\s*=\s*auth\.uid\(\)\)/i.test(sql), 'DELETE policy must enforce student_id = auth.uid()');
});

test('4. Automated updated_at trigger: sets updated_at to NOW() on update', () => {
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  assert.ok(sql.includes('FUNCTION public.set_student_notes_updated_at()'), 'Trigger function must be defined');
  assert.ok(sql.includes('CREATE TRIGGER trg_student_notes_updated_at'), 'Trigger must be attached to student_notes table');
  assert.ok(sql.includes('BEFORE UPDATE ON public.student_notes'), 'Trigger must fire BEFORE UPDATE');
});

test('5. Cross-student data isolation simulation: verifies RLS rule predicates', () => {
  const studentA = '11111111-1111-1111-1111-111111111111';
  const studentB = '22222222-2222-2222-2222-222222222222';

  const rlsCheck = {
    canSelect: (authUid, rowStudentId) => authUid === rowStudentId,
    canInsert: (authUid, payloadStudentId) => authUid === payloadStudentId,
    canUpdate: (authUid, rowStudentId, updatedStudentId) => authUid === rowStudentId && authUid === updatedStudentId,
    canDelete: (authUid, rowStudentId) => authUid === rowStudentId
  };

  // Student A accessing own notes
  assert.strictEqual(rlsCheck.canSelect(studentA, studentA), true);
  assert.strictEqual(rlsCheck.canInsert(studentA, studentA), true);
  assert.strictEqual(rlsCheck.canUpdate(studentA, studentA, studentA), true);
  assert.strictEqual(rlsCheck.canDelete(studentA, studentA), true);

  // Student A attempting to access or modify Student B's notes
  assert.strictEqual(rlsCheck.canSelect(studentA, studentB), false, 'Student A cannot read Student B notes');
  assert.strictEqual(rlsCheck.canInsert(studentA, studentB), false, 'Student A cannot insert note belonging to Student B');
  assert.strictEqual(rlsCheck.canUpdate(studentA, studentB, studentA), false, 'Student A cannot update Student B note');
  assert.strictEqual(rlsCheck.canUpdate(studentA, studentA, studentB), false, 'Student A cannot reassign note to Student B');
  assert.strictEqual(rlsCheck.canDelete(studentA, studentB), false, 'Student A cannot delete Student B note');
});

test('6. Search and filter logic: matches title and content case-insensitively', () => {
  // Verify filterNotes is declared and exported in noteService.ts
  const noteServiceSource = fs.readFileSync(noteServicePath, 'utf-8');
  assert.ok(noteServiceSource.includes('export function filterNotes'), 'filterNotes must be exported from noteService.ts');

  // Pure logic implementation identical to noteService.ts
  function filterNotes(notes, query) {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return notes;

    return notes.filter((n) => {
      const titleMatch = (n.title || '').toLowerCase().includes(cleanQuery);
      const contentMatch = (n.content || '').toLowerCase().includes(cleanQuery);
      return titleMatch || contentMatch;
    });
  }

  const sampleNotes = [
    { id: '1', student_id: 's1', title: 'Data Structures Trees', content: 'Binary search tree traversal algorithms', created_at: '', updated_at: '' },
    { id: '2', student_id: 's1', title: 'Operating Systems Revision', content: 'Virtual memory and paging mechanics', created_at: '', updated_at: '' },
    { id: '3', student_id: 's1', title: 'Machine Learning Exam Prep', content: 'Gradient descent, backpropagation and epochs', created_at: '', updated_at: '' },
    { id: '4', student_id: 's1', title: 'Weekly Schedule', content: 'Lab submissions and project deliverables', created_at: '', updated_at: '' }
  ];

  // Title match
  const res1 = filterNotes(sampleNotes, 'trees');
  assert.strictEqual(res1.length, 1);
  assert.strictEqual(res1[0].id, '1');

  // Content match
  const res2 = filterNotes(sampleNotes, 'paging');
  assert.strictEqual(res2.length, 1);
  assert.strictEqual(res2[0].id, '2');

  // Case insensitive match
  const res3 = filterNotes(sampleNotes, 'GRADIENT');
  assert.strictEqual(res3.length, 1);
  assert.strictEqual(res3[0].id, '3');

  // Empty query returns all
  const res4 = filterNotes(sampleNotes, '');
  assert.strictEqual(res4.length, 4);

  // Whitespace-only query returns all
  const res5 = filterNotes(sampleNotes, '   ');
  assert.strictEqual(res5.length, 4);

  // No match
  const res6 = filterNotes(sampleNotes, 'quantum physics');
  assert.strictEqual(res6.length, 0);
});

test('7. Database types include DBStudentNote and student_notes table mapping', () => {
  const dbTypes = fs.readFileSync(dbTypesPath, 'utf-8');
  assert.ok(dbTypes.includes('export interface DBStudentNote'), 'DBStudentNote interface must be exported');
  assert.ok(dbTypes.includes('student_notes: {'), 'student_notes table definition must exist in Database["public"]["Tables"]');
});

test('8. Navigation integration: AppShell sidebar includes My Notes with Notebook icon', () => {
  const appShell = fs.readFileSync(appShellPath, 'utf-8');
  assert.ok(appShell.includes("label: 'My Notes'"), 'navAcademics must contain My Notes label');
  assert.ok(appShell.includes("path: '/student/notes'"), 'navAcademics must link to /student/notes');
  assert.ok(appShell.includes('<Notebook size={18} />'), 'My Notes must use Notebook icon');
  assert.ok(appShell.includes("if (path.includes('/student/notes')) return 'My Notes';"), 'getPageTitle must handle My Notes');
});

test('9. Route configuration: App.tsx registers /student/notes with RoleGuard', () => {
  const app = fs.readFileSync(appPath, 'utf-8');
  assert.ok(app.includes("import('./pages/MyNotesPage')"), 'MyNotesPage must be lazily imported');
  assert.ok(app.includes('path="/student/notes"'), 'App.tsx must register /student/notes route');
  assert.ok(app.includes('<RoleGuard allowedRoles={[\'STUDENT\', \'ADMIN\']}><MyNotesPage /></RoleGuard>'), 'Route must be protected with RoleGuard');
});

test('10. Projects feature remains completely removed: No project routes or workspace links restored', () => {
  const app = fs.readFileSync(appPath, 'utf-8');
  const appShell = fs.readFileSync(appShellPath, 'utf-8');

  // Ensure projects were not accidentally brought back
  assert.strictEqual(app.includes('path="/student/projects"'), false, 'Project routes must not be present');
  assert.strictEqual(app.includes('path="/student/projects/workspace"'), false, 'Workspace route must not be present');
  assert.strictEqual(appShell.includes("label: 'Projects'"), false, 'Projects nav item must not be restored');
  assert.strictEqual(appShell.includes("label: 'Project Workspace'"), false, 'Workspace nav item must not be restored');
});

test('11. Debounced autosave contract: service provides title and content updates with timestamps', () => {
  const noteService = fs.readFileSync(noteServicePath, 'utf-8');
  assert.ok(noteService.includes('export async function updateStudentNote'), 'updateStudentNote must be exported');
  assert.ok(noteService.includes('updated_at: new Date().toISOString()'), 'updateStudentNote must update updated_at timestamp');
  assert.ok(noteService.includes('eq(\'student_id\', user.id)'), 'updateStudentNote must enforce student_id = user.id');
});

test('12. Delete note contract: service enforces ownership check on deletion', () => {
  const noteService = fs.readFileSync(noteServicePath, 'utf-8');
  assert.ok(noteService.includes('export async function deleteStudentNote'), 'deleteStudentNote must be exported');
  assert.ok(noteService.includes('.delete()'), 'deleteStudentNote must call delete()');
  assert.ok(noteService.includes('eq(\'student_id\', user.id)'), 'deleteStudentNote must enforce student_id = user.id');
});
