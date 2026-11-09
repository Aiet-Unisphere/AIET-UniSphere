# MISSION 08.2.2 — Academic Materials Storage Security Remediation Report

## 1. Executive Summary

This remediation report documents the resolution of the three critical security and data-integrity defects discovered during Mission 08.2.1 in the AIET-UniSphere Faculty Course Materials subsystem:
- **DEF-08.2.2-01**: Academic material Storage path collisions (`${profile.department_id}/${courseId}/${cleanModuleId}/${file.name}`).
- **DEF-08.2.2-02**: Department-only Storage authorization (RLS policies on bucket `academic-materials` permitted any department student/faculty to read or overwrite any file across all courses in their department).
- **DEF-08.2.2-03**: Caller-controlled Storage deletion path in `deleteCourseMaterial()`.

All three vulnerabilities were resolved with zero regressions to the existing student and faculty course workflows. A new forward-only migration (`supabase/migrations/00039_academic_materials_storage_security.sql`) was developed and verified against an isolated real PostgreSQL 16 cluster with active Row-Level Security, alongside 14 unit and integration tests and complete project quality gates (TypeCheck, Lint, Build).

---

## 2. Root Cause Analysis

### 2.1 DEF-08.2.2-01 — Academic Material Storage Path Collisions
- **Root Cause**: In Mission 08.2, file uploads constructed storage paths using raw sanitized filenames:
  ```typescript
  const storagePath = `${profile.department_id}/${courseId}/${cleanModuleId}/${safeName}`;
  ```
  If two faculty members uploaded different files with the same filename (e.g., `Syllabus.pdf` or `Lecture1.pptx`) or the same faculty member uploaded revised iterations, the path collided. In Supabase Storage, an upsert or collision would overwrite the existing object or generate an unhandled duplicate key error, corrupting access for prior courses or materials.
- **Remediation**: Implemented `generateSecureFileId()` leveraging `crypto.randomUUID()` (with standard CSPRNG fallback `crypto.getRandomValues()`). New uploads now generate guaranteed collision-resistant storage paths:
  ```typescript
  const fileUniqueId = generateSecureFileId();
  const storagePath = `${profile.department_id}/${courseId}/${cleanModuleId}/${fileUniqueId}-${safeName}`;
  ```
  The user-facing display filename remains preserved unaltered in `academic_materials.file_name`.

### 2.2 DEF-08.2.2-02 — Department-Only Storage Authorization
- **Root Cause**: Prior storage policies in `00007_storage_buckets.sql` and `00018_academic_materials_storage.sql` only inspected folder segment 1 (`(storage.foldername(name))[1] == profile.department_id`). Consequently:
  1. Students could download materials for any course in their department—even courses they were not enrolled in.
  2. Faculty could download, overwrite, or delete course files belonging to other faculty members within the same department.
  3. Orphaned or unlinked files could be accessed by anyone matching the department prefix.
- **Remediation**: Migration `00039_academic_materials_storage_security.sql` drops the legacy department-only policies and replaces them with strict relational RLS policies:
  - **SELECT**: Correlates `storage.objects.name` to `public.academic_materials.storage_path` and verifies active authentication (`public.is_active_auth_user()`). Grants access only if:
    - User is Admin; OR
    - User is HOD of the course department; OR
    - User is the uploader (`uploaded_by = auth.uid()`); OR
    - User is assigned faculty (teaching assignment in `course_enrollments` or `timetable_entries`); OR
    - User is an actively enrolled student (`course_enrollments.student_id = auth.uid()` AND `course_enrollments.status = 'Active'`).
  - **INSERT / UPDATE / DELETE**: Restricts mutations exclusively to Admins, department HODs, or authorized faculty assigned to teach the course encoded in path segment 2 (`(storage.foldername(name))[2]`).

### 2.3 DEF-08.2.2-03 — Caller-Controlled Storage Deletion Path
- **Root Cause**: The signature of `deleteCourseMaterial(materialId: string, storagePath?: string)` accepted a caller-supplied storage path parameter. A compromised frontend caller or crafted request could pass an arbitrary storage path (e.g. targeting another course or announcement attachment), deleting unintended files. Furthermore, if multiple database records referenced the same storage path (e.g. shared reference across sections), deleting the object would orphan other courses.
- **Remediation**:
  1. **Canonical Path Resolution**: `deleteCourseMaterial()` now fetches the target material record directly from `public.academic_materials` using `materialId` and extracts `material.storage_path`. The optional second argument is marked `_deprecatedCallerPath` and strictly ignored.
  2. **Shared-Reference Guard**: Before deleting the physical storage file, the service queries `academic_materials` for other records referencing the same `storage_path`:
     ```typescript
     const { count: sharedRefCount } = await supabase
       .from('academic_materials')
       .select('id', { count: 'exact', head: true })
       .eq('storage_path', targetStoragePath)
       .neq('id', materialId);
     ```
     If `sharedRefCount > 0`, physical storage deletion is safely bypassed to preserve referenced files for other materials.
  3. **RLS Deletion Sequencing**: In PostgreSQL RLS, `DELETE FROM storage.objects WHERE name = ...` evaluates both SELECT and DELETE policies. The physical storage file is deleted first while the database record still exists (satisfying the SELECT correlation policy), followed by database row deletion.

---

## 3. Migration 00039 Architecture & Policies

The forward-only migration `supabase/migrations/00039_academic_materials_storage_security.sql` implements the following policies on `storage.objects` for bucket `'academic-materials'`:

```sql
-- 1. SELECT Policy (Enforces Parent Record Correlation & Enrollment / Teaching Checks)
CREATE POLICY "academic_materials_storage_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'academic-materials'
  AND public.is_active_auth_user()
  AND (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM public.academic_materials m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.storage_path = storage.objects.name
        AND (
          (public.is_hod_user() AND c.department_id = public.get_auth_department_id())
          OR m.uploaded_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.course_enrollments ce
            WHERE ce.course_id = m.course_id
              AND ce.student_id = auth.uid()
              AND ce.role IN ('faculty', 'Faculty')
              AND ce.status = 'Active'
          )
          OR EXISTS (
            SELECT 1 FROM public.timetable_entries te
            WHERE te.course_id = m.course_id
              AND te.faculty_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.course_enrollments ce
            WHERE ce.course_id = m.course_id
              AND ce.student_id = auth.uid()
              AND ce.role IN ('student', 'Student')
              AND ce.status = 'Active'
          )
        )
    )
  )
);

-- 2. INSERT Policy (Faculty Teaching Course, HOD, or Admin)
CREATE POLICY "academic_materials_storage_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'academic-materials'
  AND public.is_active_auth_user()
  AND (
    public.is_admin_user()
    OR (
      public.is_hod_user()
      AND (storage.foldername(name))[1] = public.get_auth_department_id()::text
    )
    OR (
      (storage.foldername(name))[2] IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.course_enrollments ce
          WHERE ce.course_id = ((storage.foldername(name))[2])::uuid
            AND ce.student_id = auth.uid()
            AND ce.role IN ('faculty', 'Faculty')
            AND ce.status = 'Active'
        )
        OR EXISTS (
          SELECT 1 FROM public.timetable_entries te
          WHERE te.course_id = ((storage.foldername(name))[2])::uuid
            AND te.faculty_id = auth.uid()
        )
      )
    )
  )
);

-- 3. UPDATE Policy (Upsert Protection)
CREATE POLICY "academic_materials_storage_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'academic-materials'
  AND public.is_active_auth_user()
  AND (
    public.is_admin_user()
    OR (
      public.is_hod_user()
      AND (storage.foldername(name))[1] = public.get_auth_department_id()::text
    )
    OR (
      (storage.foldername(name))[2] IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.course_enrollments ce
          WHERE ce.course_id = ((storage.foldername(name))[2])::uuid
            AND ce.student_id = auth.uid()
            AND ce.role IN ('faculty', 'Faculty')
            AND ce.status = 'Active'
        )
        OR EXISTS (
          SELECT 1 FROM public.timetable_entries te
          WHERE te.course_id = ((storage.foldername(name))[2])::uuid
            AND te.faculty_id = auth.uid()
        )
      )
    )
  )
);

-- 4. DELETE Policy (Faculty Teaching Course, HOD, or Admin)
CREATE POLICY "academic_materials_storage_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'academic-materials'
  AND public.is_active_auth_user()
  AND (
    public.is_admin_user()
    OR (
      public.is_hod_user()
      AND (storage.foldername(name))[1] = public.get_auth_department_id()::text
    )
    OR (
      (storage.foldername(name))[2] IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.course_enrollments ce
          WHERE ce.course_id = ((storage.foldername(name))[2])::uuid
            AND ce.student_id = auth.uid()
            AND ce.role IN ('faculty', 'Faculty')
            AND ce.status = 'Active'
        )
        OR EXISTS (
          SELECT 1 FROM public.timetable_entries te
          WHERE te.course_id = ((storage.foldername(name))[2])::uuid
            AND te.faculty_id = auth.uid()
        )
      )
    )
  )
);
```

---

## 4. Verification and Test Results

### 4.1 Real PostgreSQL 16 Test Suite (`tests/real_postgres_academic_materials_security.mjs`)
Executed against isolated PostgreSQL 16 test cluster (Port 54333) with real Supabase RLS simulation:
- **Test Matrix Results**:
  1. Admin can read all course material storage objects: **PASS**
  2. Assigned Faculty A can read Course 101 material storage object: **PASS**
  3. Enrolled Student A can read Course 101 material storage object: **PASS**
  4. Non-enrolled Student B (same department) CANNOT read Course 101 storage object: **PASS (DENIED)**
  5. Student from other department CANNOT read Course 101 storage object: **PASS (DENIED)**
  6. Unassigned Faculty B (same department) CANNOT read Course 101 storage object: **PASS (DENIED)**
  7. Department HOD can read Course 101 material storage object: **PASS**
  8. Assigned Faculty A can upload (INSERT) material object for Course 101: **PASS**
  9. Enrolled Student A CANNOT upload (INSERT) material object for Course 101: **PASS (DENIED)**
  10. Unassigned Faculty B CANNOT upload (INSERT) material object for Course 101: **PASS (DENIED)**
  11. Department HOD can upload (INSERT) material object for Course 101: **PASS**
  12. Assigned Faculty A can DELETE Course 101 storage object: **PASS**
  13. Enrolled Student A CANNOT DELETE Course 101 storage object: **PASS (DENIED)**
  14. Unassigned Faculty B CANNOT DELETE Course 101 storage object: **PASS (DENIED)**
  15. Orphaned storage object without parent record in `academic_materials` is invisible to non-admins: **PASS (DENIED)**

### 4.2 Unit and Integration Test Suite (`tests/faculty_course_materials.test.mjs`)
14/14 tests passing:
- Validates collision-resistant path generation format (`<dept>/<course>/<module>/<uuid>-<filename>`).
- Confirms user-facing `file_name` in database preserves original filename while `storage_path` uses unique ID.
- Confirms `deleteCourseMaterial()` derives target path strictly from database `storage_path` and ignores caller-supplied malicious paths.
- Confirms shared-reference protection prevents deleting storage files when referenced by another course/material.
- Confirms legacy download URL generation backwards compatibility for existing materials.

### 4.3 Full Regression & Quality Gates
- **`npm run test:real-pg`**: 3 suites passing (Announcement security, Attendance security, Academic materials security — 21 tests total).
- **`npm test`**: 18 suites passing (233 unit/integration tests total).
- **`npm run typecheck`**: Passed with 0 errors.
- **`npm run lint`**: Passed with 0 errors (252 legacy unused-variable warnings in other files).
- **`npm run build`**: Passed cleanly with Vite 8.2.1 production bundle.

---

## 5. Migration Status & Safety Commitments

- **Migration File**: `supabase/migrations/00039_academic_materials_storage_security.sql`.
- **Status**: Forward-only, verified against local PostgreSQL 16 cluster.
- **Remote Production Status**: **UNAPPLIED**. No remote Supabase database or storage policies have been modified, per mission instructions.
- **Student Dashboard Compatibility**: Preserved. Active student enrollment continues to authorize downloads through the correlated `academic_materials_storage_select` policy.
- **Leave Management Workflows**: Untouched.

---

## 6. Git Checkpoint

- **Pre-checkpoint Tag**: `checkpoint-mission-08-2-2-pre` (Commit: `54bc6dd`)
- **Post-checkpoint Tag**: `checkpoint-mission-08-2-2-post`

---

## 7. Remaining Risks & Recommendations

1. **Storage Path Relocation**: Legacy storage objects created prior to Migration 00039 retain the old non-unique path structure (`dept/course/module/name`). Migration 00039 supports both formats transparently via parent record correlation (`m.storage_path = storage.objects.name`). If collision deduplication of historical files is desired, an asynchronous migration script could rename objects and update `academic_materials.storage_path`.
2. **Student Dashboard Regression Safety**: Full end-to-end download flow on Student Dashboard relies on active enrollment in `course_enrollments`. Inactive or dropped student records will immediately lose storage object access, which matches zero-trust design expectations.

---

## 8. Final Verdict

SECURITY REMEDIATION COMPLETE — READY FOR FINAL REVIEW.
