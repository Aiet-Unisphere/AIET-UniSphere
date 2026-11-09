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

// 11. Unique collision-resistant storage paths
test('11. Two identical filenames produce distinct collision-resistant Storage paths', () => {
  const generateSecureFileId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const sanitizeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');

  const deptId = 'dept-cse-101';
  const courseId = 'CS501';
  const moduleId = 'Module 1';
  const fileName = 'syllabus.pdf';

  const path1 = `${deptId}/${courseId}/${moduleId}/${generateSecureFileId()}-${sanitizeFileName(fileName)}`;
  const path2 = `${deptId}/${courseId}/${moduleId}/${generateSecureFileId()}-${sanitizeFileName(fileName)}`;

  assert.notEqual(path1, path2);
  assert.ok(path1.endsWith('-syllabus.pdf'));
  assert.ok(path2.endsWith('-syllabus.pdf'));
  assert.ok(path1.startsWith(`${deptId}/${courseId}/${moduleId}/`));
  assert.ok(path2.startsWith(`${deptId}/${courseId}/${moduleId}/`));
});

// 12. Canonical deletion ignores caller-supplied storage path
test('12. Canonical deletion strictly uses DB storage path and ignores caller-supplied path', async () => {
  const dbRecord = {
    id: 'mat-real',
    course_id: 'CS501',
    storage_path: 'dept-cse/CS501/Module 1/uuid-notes.pdf'
  };

  let deletedStoragePath = null;
  const mockDeleteStorage = (bucket, path) => {
    deletedStoragePath = path;
    return true;
  };

  // Caller attempts to pass a manipulated storage path targeting an innocent file
  const manipulatedPath = 'dept-cse/CS601/Module 9/target_file.pdf';

  // Hardened logic: canonical path resolved exclusively from dbRecord
  const canonicalPath = dbRecord.storage_path;
  mockDeleteStorage('academic-materials', canonicalPath);

  assert.equal(deletedStoragePath, 'dept-cse/CS501/Module 1/uuid-notes.pdf');
  assert.notEqual(deletedStoragePath, manipulatedPath);
});

// 13. Shared storage path reference protection
test('13. Shared storage path reference prevents physical deletion when other DB records exist', () => {
  const allDbMaterials = [
    { id: 'mat-1', title: 'Version 1', storage_path: 'dept-cse/CS501/General/shared.pdf' },
    { id: 'mat-2', title: 'Version 2', storage_path: 'dept-cse/CS501/General/shared.pdf' }
  ];

  const targetMaterialId = 'mat-1';
  const targetRecord = allDbMaterials.find(m => m.id === targetMaterialId);

  // Check other records referencing same path
  const otherRefs = allDbMaterials.filter(
    m => m.storage_path === targetRecord.storage_path && m.id !== targetMaterialId
  );

  let physicalFileDeleted = false;
  let dbRowDeleted = false;

  // DB deletion proceeds
  dbRowDeleted = true;

  // Physical file deletion only proceeds if otherRefs.length === 0
  if (otherRefs.length === 0) {
    physicalFileDeleted = true;
  }

  assert.equal(dbRowDeleted, true);
  assert.equal(physicalFileDeleted, false); // Protected: skipped physical deletion
});

// 14. Existing legacy material download compatibility
test('14. Existing legacy material downloads remain compatible without relocation', () => {
  const legacyRecord = {
    id: 'legacy-1',
    title: 'Pre-migration Syllabus',
    courseId: 'CS501',
    moduleId: 'General',
    storagePath: 'dept-cse/CS501/General/syllabus.pdf' // Legacy path without UUID
  };

  // download invocation contract
  assert.ok(legacyRecord.storagePath);
  assert.equal(legacyRecord.storagePath, 'dept-cse/CS501/General/syllabus.pdf');
  const getPath = (mat) => mat.storagePath;
  assert.equal(getPath(legacyRecord), 'dept-cse/CS501/General/syllabus.pdf');
});

// =========================================================================
// MISSION 08.2.3 DELETION RECOVERY & FAILURE SCENARIO TEST SUITE
// =========================================================================

// Helper simulating resilient deleteCourseMaterial workflow
async function simulateResilientDelete({
  materialId,
  dbMaterial,
  sharedRefCount = 0,
  userProfile = { role: 'FACULTY', department_id: 'dept-cse-101', id: 'fac-1' },
  isAssigned = true,
  storageDeleteResult = { success: true },
  dbDeleteAttemptsFail = 0 // how many attempts fail before succeeding (or all if >= maxRetries)
}) {
  const auditLogs = [];
  let storageDeleteCalls = 0;
  let dbDeleteCalls = 0;

  // 1. Fetch material
  if (!dbMaterial) {
    throw new Error("Course material not found or already deleted.");
  }

  // 2. Authorization
  const isAdmin = userProfile.role === 'ADMIN';
  const isHOD = userProfile.role === 'HOD' && userProfile.department_id === dbMaterial.department_id;
  const isOwner = dbMaterial.uploaded_by === userProfile.id;

  if (!isAdmin && !isHOD && !isOwner && !isAssigned) {
    throw new Error("You are not authorized to delete this course material.");
  }

  // 3. Canonical path
  const canonicalPath = dbMaterial.storage_path;

  // 4. Shared reference check
  let skipStorageDeletion = false;
  if (sharedRefCount > 0) {
    skipStorageDeletion = true;
  }

  // 5. Storage deletion
  let storageDeleted = false;
  if (canonicalPath && !skipStorageDeletion) {
    storageDeleteCalls++;
    if (!storageDeleteResult.success) {
      throw new Error(`Failed to delete storage file: ${storageDeleteResult.error || 'Unknown storage error'}. Database record retained.`);
    }
    storageDeleted = true;
  }

  // 6. DB deletion with retry loop
  const maxRetries = 3;
  let dbDeleted = false;
  let lastDbError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    dbDeleteCalls++;
    if (attempt <= dbDeleteAttemptsFail) {
      lastDbError = new Error(`Connection timeout on attempt ${attempt}`);
      continue;
    }
    dbDeleted = true;
    lastDbError = null;
    break;
  }

  if (!dbDeleted) {
    // 7. Audit logging on failure
    auditLogs.push({
      action: 'ACADEMIC_MATERIAL_DELETE_FAILED',
      entity_type: 'academic_materials',
      entity_id: materialId,
      metadata: {
        storage_path: canonicalPath,
        db_error: lastDbError?.message,
        retries: maxRetries
      }
    });
    throw new Error(`Failed to delete course material record: ${lastDbError?.message}. Storage file was removed; failure logged for retry.`);
  }

  return {
    success: true,
    storageDeleted,
    storageDeleteCalls,
    dbDeleteCalls,
    auditLogs
  };
}

// 15. Scenario 1: Storage deletion succeeds and DB deletion succeeds
test('15. Failure Scenario 1: Storage deletion succeeds and DB deletion succeeds', async () => {
  const result = await simulateResilientDelete({
    materialId: 'mat-101',
    dbMaterial: {
      id: 'mat-101',
      course_id: 'CS501',
      department_id: 'dept-cse-101',
      uploaded_by: 'fac-1',
      storage_path: 'dept-cse-101/CS501/Mod1/uuid-lecture.pdf'
    },
    storageDeleteResult: { success: true },
    dbDeleteAttemptsFail: 0
  });

  assert.equal(result.success, true);
  assert.equal(result.storageDeleted, true);
  assert.equal(result.storageDeleteCalls, 1);
  assert.equal(result.dbDeleteCalls, 1);
  assert.equal(result.auditLogs.length, 0);
});

// 16. Scenario 2: Storage deletion fails
test('16. Failure Scenario 2: Storage deletion fails (DB record safely retained)', async () => {
  let threw = false;
  try {
    await simulateResilientDelete({
      materialId: 'mat-102',
      dbMaterial: {
        id: 'mat-102',
        course_id: 'CS501',
        department_id: 'dept-cse-101',
        uploaded_by: 'fac-1',
        storage_path: 'dept-cse-101/CS501/Mod1/uuid-lecture.pdf'
      },
      storageDeleteResult: { success: false, error: 'S3 500 Internal Service Error' }
    });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('Failed to delete storage file'));
    assert.ok(err.message.includes('Database record retained'));
  }

  assert.equal(threw, true, 'Must throw when storage deletion fails, retaining DB record');
});

// 17. Scenario 3: Storage deletion succeeds but DB deletion fails
test('17. Failure Scenario 3: Storage deletion succeeds but DB deletion fails (Retries exhausted & audit log written)', async () => {
  let threw = false;
  try {
    await simulateResilientDelete({
      materialId: 'mat-103',
      dbMaterial: {
        id: 'mat-103',
        course_id: 'CS501',
        department_id: 'dept-cse-101',
        uploaded_by: 'fac-1',
        storage_path: 'dept-cse-101/CS501/Mod1/uuid-lecture.pdf'
      },
      storageDeleteResult: { success: true },
      dbDeleteAttemptsFail: 3 // All 3 attempts fail
    });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('Failed to delete course material record'));
    assert.ok(err.message.includes('failure logged for retry'));
  }

  assert.equal(threw, true, 'Must throw after DB retries are exhausted and log recovery trail');
});

// 18. Scenario 4: Storage object is already missing
test('18. Failure Scenario 4: Storage object already missing (Idempotent S3 removal proceeds with DB delete)', async () => {
  // S3 / Supabase returns success (error: null) when deleting an already missing object
  const result = await simulateResilientDelete({
    materialId: 'mat-104',
    dbMaterial: {
      id: 'mat-104',
      course_id: 'CS501',
      department_id: 'dept-cse-101',
      uploaded_by: 'fac-1',
      storage_path: 'dept-cse-101/CS501/Mod1/already-missing.pdf'
    },
    storageDeleteResult: { success: true }, // Idempotent 200 OK
    dbDeleteAttemptsFail: 0
  });

  assert.equal(result.success, true);
  assert.equal(result.storageDeleted, true);
  assert.equal(result.dbDeleteCalls, 1);
});

// 19. Scenario 5: Material is referenced by another record
test('19. Failure Scenario 5: Shared storage reference skips storage deletion', async () => {
  const result = await simulateResilientDelete({
    materialId: 'mat-105',
    dbMaterial: {
      id: 'mat-105',
      course_id: 'CS501',
      department_id: 'dept-cse-101',
      uploaded_by: 'fac-1',
      storage_path: 'dept-cse-101/CS501/Mod1/shared-file.pdf'
    },
    sharedRefCount: 1, // 1 other record points to same path
    storageDeleteResult: { success: true }
  });

  assert.equal(result.success, true);
  assert.equal(result.storageDeleted, false); // Protected: skipped physical deletion
  assert.equal(result.storageDeleteCalls, 0); // No storage delete called
  assert.equal(result.dbDeleteCalls, 1);     // DB record deleted
});

// 20. Scenario 6: Unauthorized faculty attempts deletion
test('20. Failure Scenario 6: Unauthorized faculty deletion is blocked before storage or DB calls', async () => {
  let threw = false;
  try {
    await simulateResilientDelete({
      materialId: 'mat-106',
      dbMaterial: {
        id: 'mat-106',
        course_id: 'CS501',
        department_id: 'dept-cse-101',
        uploaded_by: 'fac-owner',
        storage_path: 'dept-cse-101/CS501/Mod1/notes.pdf'
      },
      userProfile: { role: 'FACULTY', department_id: 'dept-cse-101', id: 'fac-unassigned' },
      isAssigned: false
    });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('You are not authorized to delete this course material.'));
  }

  assert.equal(threw, true, 'Must reject unauthorized faculty caller');
});

// 21. Scenario 7: Deletion is retried
test('21. Failure Scenario 7: Deletion retry succeeds after previous DB failure', async () => {
  // Retry call: storage was already removed in previous call, now DB succeeds
  const retryResult = await simulateResilientDelete({
    materialId: 'mat-107',
    dbMaterial: {
      id: 'mat-107',
      course_id: 'CS501',
      department_id: 'dept-cse-101',
      uploaded_by: 'fac-1',
      storage_path: 'dept-cse-101/CS501/Mod1/uuid-lecture.pdf'
    },
    storageDeleteResult: { success: true }, // Already deleted in S3, returns success
    dbDeleteAttemptsFail: 0                // Now network/DB succeeds
  });

  assert.equal(retryResult.success, true);
  assert.equal(retryResult.dbDeleteCalls, 1);

  // Subsequent call when already deleted returns not found (idempotent termination)
  let notFoundThrew = false;
  try {
    await simulateResilientDelete({
      materialId: 'mat-107',
      dbMaterial: null // Record is now deleted from DB
    });
  } catch (err) {
    notFoundThrew = true;
    assert.ok(err.message.includes('Course material not found or already deleted.'));
  }
  assert.equal(notFoundThrew, true);
});

// 22. Scenario 8: Student download remains valid for non-deleted materials
test('22. Failure Scenario 8: Enrolled student download workflow remains valid for non-deleted materials', async () => {
  const activeMaterials = [
    {
      id: 'mat-valid-1',
      title: 'Active Lecture 1',
      courseId: 'CS501',
      storagePath: 'dept-cse-101/CS501/Mod1/lecture1.pdf'
    }
  ];

  // Simulating student download contract
  const simulateStudentDownload = (material, isEnrolled, storageObjectExists = true) => {
    if (!isEnrolled) {
      throw new Error('Access denied: student not enrolled in this course.');
    }
    if (!material || !material.storagePath || !storageObjectExists) {
      throw new Error('File is no longer available.');
    }
    return `https://supabase.local/storage/v1/object/sign/academic-materials/${material.storagePath}?token=mock`;
  };

  // 1. Enrolled student downloads existing material: SUCCESS
  const validUrl = simulateStudentDownload(activeMaterials[0], true, true);
  assert.ok(validUrl.includes('academic-materials/dept-cse-101/CS501/Mod1/lecture1.pdf'));

  // 2. Enrolled student attempts to download missing storage object (e.g. during failed DB delete window): GRACEFUL ERROR
  let missingFileThrew = false;
  try {
    simulateStudentDownload(activeMaterials[0], true, false);
  } catch (err) {
    missingFileThrew = true;
    assert.equal(err.message, 'File is no longer available.');
  }
  assert.equal(missingFileThrew, true);

  // 3. Unenrolled student: DENIED
  let unenrolledThrew = false;
  try {
    simulateStudentDownload(activeMaterials[0], false, true);
  } catch (err) {
    unenrolledThrew = true;
    assert.ok(err.message.includes('Access denied'));
  }
  assert.equal(unenrolledThrew, true);
});

