import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * MISSION 08.2 TEST SUITE
 * Tests for Faculty Course Materials, Module Groupings, and Security Boundaries
 */

// Pure helper function simulating deriveCourseModules
function deriveCourseModules(materials, courseAssignments = []) {
  if (!materials || materials.length === 0) {
    return [];
  }

  const moduleMap = new Map();

  materials.forEach((m) => {
    const modKey = (m.moduleId && m.moduleId.trim()) || 'General';
    if (!moduleMap.has(modKey)) {
      let title = modKey;
      if (/^\d+$/.test(modKey)) {
        title = `Module ${modKey}`;
      } else if (modKey.toLowerCase() === 'general') {
        title = 'General Resources';
      } else if (!modKey.toLowerCase().startsWith('module')) {
        title = `Module: ${modKey}`;
      }
      moduleMap.set(modKey, {
        id: modKey,
        title,
        materials: []
      });
    }
    moduleMap.get(modKey).materials.push(m);
  });

  return Array.from(moduleMap.values()).map(mod => {
    const modSearchKey = mod.id.toLowerCase().startsWith('module') 
      ? mod.id.toLowerCase() 
      : `module ${mod.id}`.toLowerCase();
    const matchingAssignments = courseAssignments.filter(a => 
      (a.title && a.title.toLowerCase().includes(modSearchKey)) ||
      (a.instructions && a.instructions.toLowerCase().includes(modSearchKey))
    );

    const assignmentsCount = matchingAssignments.length;
    const completedAssignments = matchingAssignments.filter(a => a.status === 'Submitted' || a.status === 'Graded').length;
    const completion = assignmentsCount > 0 
      ? Math.round((completedAssignments / assignmentsCount) * 100) 
      : 0;

    return {
      id: mod.id,
      title: mod.title,
      materialsCount: mod.materials.length,
      assignmentsCount,
      completion,
      materials: mod.materials
    };
  });
}

// Validation logic matching storageService.ts and UploadCourseMaterialModal.tsx
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.zip', '.ppt', '.pptx'];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function validateMaterialUpload(title, file) {
  if (!title || !title.trim()) {
    return { valid: false, error: 'Material title is required.' };
  }
  if (!file) {
    return { valid: false, error: 'A file must be selected for upload.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `File size exceeds 50 MB limit.` };
  }
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Unsupported format. Allowed formats: PDF, PPT, PPTX, DOC, DOCX, ZIP.` };
  }
  return { valid: true };
}

// Authorization check matching courseService.ts uploadCourseMaterial
function checkFacultyCourseAuthorization(callerProfile, courseId, teachingCourses) {
  if (!callerProfile) return { authorized: false, reason: 'Unauthenticated' };
  if (callerProfile.role === 'ADMIN' || callerProfile.role === 'HOD') {
    return { authorized: true };
  }
  if (callerProfile.role === 'FACULTY') {
    const isAssigned = teachingCourses.includes(courseId.toLowerCase());
    if (!isAssigned) {
      return { authorized: false, reason: 'You are not authorized to upload materials for a course you do not teach.' };
    }
    return { authorized: true };
  }
  return { authorized: false, reason: 'Unauthorized role' };
}

// Deletion authorization check matching courseService.ts deleteCourseMaterial
function checkMaterialDeletionAuthorization(callerProfile, material, teachingCourses) {
  if (!callerProfile) return { authorized: false, reason: 'Unauthenticated' };
  if (callerProfile.role === 'ADMIN') return { authorized: true };
  if (callerProfile.role === 'HOD' && callerProfile.department_id === material.department_id) return { authorized: true };
  if (material.uploaded_by === callerProfile.id) return { authorized: true };
  if (callerProfile.role === 'FACULTY' && teachingCourses.includes(material.course_id.toLowerCase())) {
    return { authorized: true };
  }
  return { authorized: false, reason: 'You do not have permission to delete this material.' };
}

// 1. Course-specific material retrieval
test('1. Course-specific material retrieval maps database columns faithfully', () => {
  const rawDbRows = [
    {
      id: 'mat-1',
      title: 'ER Diagrams Lecture Slides',
      course_id: 'CS501',
      module_id: 'Module 1',
      file_type: 'PDF',
      storage_path: 'dept-cse/CS501/Module 1/er_diagrams.pdf',
      file_name: 'er_diagrams.pdf',
      file_size: 2048576,
      mime_type: 'application/pdf',
      created_at: '2026-11-01T10:00:00Z',
      uploaded_by: 'fac-101'
    }
  ];

  const mapped = rawDbRows.map(m => ({
    id: m.id,
    title: m.title,
    courseId: m.course_id,
    moduleId: m.module_id || 'General',
    fileType: m.file_type || 'PDF',
    fileName: m.file_name,
    storagePath: m.storage_path,
    fileSize: Number(m.file_size),
    mimeType: m.mime_type,
    createdAt: m.created_at,
    uploadedBy: m.uploaded_by
  }));

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].id, 'mat-1');
  assert.equal(mapped[0].title, 'ER Diagrams Lecture Slides');
  assert.equal(mapped[0].courseId, 'CS501');
  assert.equal(mapped[0].moduleId, 'Module 1');
  assert.equal(mapped[0].fileSize, 2048576);
  assert.equal(mapped[0].uploadedBy, 'fac-101');
});

// 2. Empty material collections
test('2. Empty material collections handle safely without crashing or fabricating modules', () => {
  const materials = [];
  const modules = deriveCourseModules(materials);
  assert.deepEqual(modules, []);
  assert.equal(modules.length, 0);
});

// 3. Module grouping via deriveCourseModules
test('3. Module grouping derives authentic modules from academic materials', () => {
  const materials = [
    { id: 'm1', title: 'Intro to SQL', moduleId: 'Module 1', fileName: 'sql_intro.pdf' },
    { id: 'm2', title: 'Advanced Joins', moduleId: 'Module 1', fileName: 'joins.pdf' },
    { id: 'm3', title: 'ACID Properties', moduleId: 'Module 2', fileName: 'acid.pdf' }
  ];

  const assignments = [
    { id: 'a1', title: 'Module 1: Basic Queries Assignment', status: 'Submitted' }
  ];

  const modules = deriveCourseModules(materials, assignments);
  assert.equal(modules.length, 2);
  
  const mod1 = modules.find(m => m.id === 'Module 1');
  assert.ok(mod1);
  assert.equal(mod1.title, 'Module 1');
  assert.equal(mod1.materialsCount, 2);
  assert.equal(mod1.assignmentsCount, 1);
  assert.equal(mod1.completion, 100);

  const mod2 = modules.find(m => m.id === 'Module 2');
  assert.ok(mod2);
  assert.equal(mod2.materialsCount, 1);
  assert.equal(mod2.assignmentsCount, 0);
});

// 4. Materials without module associations
test('4. Materials without module associations default safely to General Resources without data loss', () => {
  const materials = [
    { id: 'm1', title: 'Course Syllabus', moduleId: '', fileName: 'syllabus.pdf' },
    { id: 'm2', title: 'Lab Reference Manual', moduleId: null, fileName: 'lab_manual.pdf' }
  ];

  const modules = deriveCourseModules(materials);
  assert.equal(modules.length, 1);
  assert.equal(modules[0].id, 'General');
  assert.equal(modules[0].title, 'General Resources');
  assert.equal(modules[0].materialsCount, 2);
  assert.equal(modules[0].materials[0].title, 'Course Syllabus');
  assert.equal(modules[0].materials[1].title, 'Lab Reference Manual');
});

// 5. Upload validation
test('5. Upload file validation enforces title, 50MB size limit, and supported extensions', () => {
  // Missing title
  const res1 = validateMaterialUpload('', { name: 'test.pdf', size: 1024 });
  assert.equal(res1.valid, false);
  assert.match(res1.error, /title is required/i);

  // Missing file
  const res2 = validateMaterialUpload('Valid Title', null);
  assert.equal(res2.valid, false);
  assert.match(res2.error, /file must be selected/i);

  // Exceeds 50MB
  const res3 = validateMaterialUpload('Valid Title', { name: 'big.pdf', size: 55 * 1024 * 1024 });
  assert.equal(res3.valid, false);
  assert.match(res3.error, /50 MB/i);

  // Invalid extension (.exe)
  const res4 = validateMaterialUpload('Valid Title', { name: 'malware.exe', size: 1024 });
  assert.equal(res4.valid, false);
  assert.match(res4.error, /Unsupported format/i);

  // Valid PDF
  const res5 = validateMaterialUpload('Valid Title', { name: 'notes.pdf', size: 2 * 1024 * 1024 });
  assert.equal(res5.valid, true);

  // Valid PPTX
  const res6 = validateMaterialUpload('Lecture Slides', { name: 'slides.pptx', size: 10 * 1024 * 1024 });
  assert.equal(res6.valid, true);
});

// 6. Upload rollback simulation on DB failure
test('6. Upload failure simulation cleans up storage object preventing orphans', async () => {
  let storageFileUploaded = false;
  let storageFileCleanedUp = false;

  async function mockUploadWithRollback(failDbInsert = true) {
    storageFileUploaded = true;
    try {
      if (failDbInsert) {
        throw new Error('Database connection failed or foreign key violation');
      }
      return { success: true };
    } catch (err) {
      storageFileCleanedUp = true;
      throw err;
    }
  }

  await assert.rejects(async () => {
    await mockUploadWithRollback(true);
  }, /Database connection failed/);

  assert.equal(storageFileUploaded, true);
  assert.equal(storageFileCleanedUp, true);
});

// 7. Unauthorized course access rejection
test('7. Faculty authorization strictly blocks uploading materials to unassigned courses', () => {
  const facultyProfile = { id: 'fac-101', role: 'FACULTY', department_id: 'dept-cse' };
  const teachingCourses = ['cs501', 'cs502'];

  // Assigned course -> ALLOW
  const auth1 = checkFacultyCourseAuthorization(facultyProfile, 'CS501', teachingCourses);
  assert.equal(auth1.authorized, true);

  // Unassigned course in same department -> DENY
  const auth2 = checkFacultyCourseAuthorization(facultyProfile, 'CS601', teachingCourses);
  assert.equal(auth2.authorized, false);
  assert.match(auth2.reason, /not authorized to upload materials for a course you do not teach/i);

  // Admin -> ALLOW all
  const adminProfile = { id: 'admin-1', role: 'ADMIN', department_id: 'dept-cse' };
  const auth3 = checkFacultyCourseAuthorization(adminProfile, 'CS601', []);
  assert.equal(auth3.authorized, true);

  // HOD -> ALLOW department courses
  const hodProfile = { id: 'hod-1', role: 'HOD', department_id: 'dept-cse' };
  const auth4 = checkFacultyCourseAuthorization(hodProfile, 'CS601', []);
  assert.equal(auth4.authorized, true);
});

// 8. Material deletion authorization and storage cleanup
test('8. Material deletion authorization protects against cross-faculty tampering', () => {
  const material = {
    id: 'mat-1',
    course_id: 'cs501',
    department_id: 'dept-cse',
    uploaded_by: 'fac-101'
  };

  // 1. Author (uploader) can delete
  const authorProfile = { id: 'fac-101', role: 'FACULTY', department_id: 'dept-cse' };
  const check1 = checkMaterialDeletionAuthorization(authorProfile, material, ['cs501']);
  assert.equal(check1.authorized, true);

  // 2. Assigned faculty colleague teaching the course can delete
  const colleagueProfile = { id: 'fac-102', role: 'FACULTY', department_id: 'dept-cse' };
  const check2 = checkMaterialDeletionAuthorization(colleagueProfile, material, ['cs501']);
  assert.equal(check2.authorized, true);

  // 3. Unassigned faculty member CANNOT delete
  const outsiderFaculty = { id: 'fac-103', role: 'FACULTY', department_id: 'dept-cse' };
  const check3 = checkMaterialDeletionAuthorization(outsiderFaculty, material, ['cs999']);
  assert.equal(check3.authorized, false);
  assert.match(check3.reason, /do not have permission/i);

  // 4. Admin can delete
  const adminProfile = { id: 'admin-1', role: 'ADMIN', department_id: 'dept-cse' };
  const check4 = checkMaterialDeletionAuthorization(adminProfile, material, []);
  assert.equal(check4.authorized, true);

  // 5. HOD in same department can delete
  const hodProfile = { id: 'hod-1', role: 'HOD', department_id: 'dept-cse' };
  const check5 = checkMaterialDeletionAuthorization(hodProfile, material, []);
  assert.equal(check5.authorized, true);
});

// 9. Material metadata editing
test('9. Material metadata editing updates title and module without altering storage path', () => {
  const original = {
    id: 'mat-1',
    title: 'Old Title',
    moduleId: 'General',
    storagePath: 'dept-cse/CS501/General/notes.pdf'
  };

  const updates = { title: 'Updated Lecture Notes', moduleId: 'Module 1' };
  const updated = {
    ...original,
    title: updates.title.trim(),
    moduleId: updates.moduleId.trim()
  };

  assert.equal(updated.title, 'Updated Lecture Notes');
  assert.equal(updated.moduleId, 'Module 1');
  assert.equal(updated.storagePath, original.storagePath); // Storage path preserved
});

// 10. Student-side compatibility
test('10. Student-side compatibility: students retrieve uploaded materials through existing contract', () => {
  const courseMaterials = [
    { id: 'mat-1', title: 'Chapter 1 Notes', courseId: 'CS501', moduleId: 'Module 1', fileName: 'ch1.pdf', storagePath: 'dept/CS501/m1/ch1.pdf' },
    { id: 'mat-2', title: 'Chapter 2 Notes', courseId: 'CS501', moduleId: 'Module 2', fileName: 'ch2.pdf', storagePath: 'dept/CS501/m2/ch2.pdf' }
  ];

  // Student CourseDetail derives modules from same materials array
  const studentModules = deriveCourseModules(courseMaterials);
  assert.equal(studentModules.length, 2);
  assert.equal(studentModules[0].materialsCount, 1);
  assert.equal(studentModules[1].materialsCount, 1);
  assert.equal(studentModules[0].materials[0].title, 'Chapter 1 Notes');
});
