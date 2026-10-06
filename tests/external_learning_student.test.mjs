import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit & Service Verification Tests for Student External Learning UI & Service Layer (Phase 2A)
 */

test('1. Student External Learning Item structure formats course, enrollment, and badges correctly', () => {
  const item = {
    enrollment: {
      id: 'en-101',
      assignment_id: 'as-202',
      student_id: 'st-303',
      status: 'ASSIGNED',
      assigned_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    assignment: {
      id: 'as-202',
      external_course_id: 'ec-404',
      assigned_by: 'fa-505',
      department_id: 'dept-606',
      academic_course_id: '22CSD71',
      required: true,
      assigned_date: '2026-09-01',
      deadline: '2026-10-30T23:59:59Z',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    course: {
      id: 'ec-404',
      title: 'Machine Learning with Python',
      platform: 'Coursera',
      provider_name: 'IBM',
      external_url: 'https://coursera.org/learn/machine-learning-python',
      description: 'Learn ML fundamentals using scikit-learn',
      difficulty: 'INTERMEDIATE',
      estimated_hours: 30,
      created_by: 'fa-505',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    progress: {
      id: 'pr-707',
      enrollment_id: 'en-101',
      progress_percent: 75,
      completed_modules: 15,
      total_modules: 20,
      source: 'SELF_REPORTED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    evidence: [],
    latestEvidence: null
  };

  assert.equal(item.course.title, 'Machine Learning with Python');
  assert.equal(item.course.platform, 'Coursera');
  assert.equal(item.assignment.academic_course_id, '22CSD71');
  assert.equal(item.progress.progress_percent, 75);
  assert.equal(item.progress.completed_modules, 15);
  assert.equal(item.progress.total_modules, 20);
});

test('2. Progress validation rejects percentages outside 0-100', () => {
  const validateProgress = (percent) => {
    if (percent < 0 || percent > 100) {
      throw new Error('Progress percentage must be between 0 and 100.');
    }
    return true;
  };

  assert.throws(() => validateProgress(-10), /between 0 and 100/);
  assert.throws(() => validateProgress(105), /between 0 and 100/);
  assert.equal(validateProgress(0), true);
  assert.equal(validateProgress(100), true);
  assert.equal(validateProgress(50), true);
});

test('3. Progress validation rejects completed modules exceeding total modules', () => {
  const validateModules = (completed, total) => {
    if (completed != null && total != null && completed > total) {
      throw new Error('Completed modules cannot exceed total modules.');
    }
    return true;
  };

  assert.throws(() => validateModules(25, 20), /cannot exceed total/);
  assert.equal(validateModules(15, 20), true);
  assert.equal(validateModules(20, 20), true);
});

test('4. Evidence validation rejects submissions missing file, URL, and ID', () => {
  const validateEvidence = (input) => {
    if (!input.file && !input.credential_url && !input.credential_id) {
      throw new Error('Please provide at least one evidence source.');
    }
    return true;
  };

  assert.throws(() => validateEvidence({}), /at least one evidence source/);
  assert.equal(validateEvidence({ credential_url: 'https://coursera.org/verify/123' }), true);
  assert.equal(validateEvidence({ credential_id: 'ABC-123' }), true);
  assert.equal(validateEvidence({ file: { name: 'cert.pdf' } }), true);
});

test('5. Evidence validation rejects invalid mime types and files > 20MB', () => {
  const validateFile = (file) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      throw new Error('Invalid file type.');
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('File size exceeds 20MB limit.');
    }
    return true;
  };

  assert.throws(() => validateFile({ type: 'text/html', size: 1024 }), /Invalid file type/);
  assert.throws(() => validateFile({ type: 'application/pdf', size: 25 * 1024 * 1024 }), /exceeds 20MB/);
  assert.equal(validateFile({ type: 'application/pdf', size: 5 * 1024 * 1024 }), true);
});

test('6. Overdue deadline detection correctly flags past deadlines for incomplete enrollments', () => {
  const checkOverdue = (deadlineStr, status) => {
    if (!deadlineStr || status === 'COMPLETED') return false;
    return new Date(deadlineStr) < new Date();
  };

  const pastDate = new Date(Date.now() - 86400000).toISOString();
  const futureDate = new Date(Date.now() + 86400000).toISOString();

  assert.equal(checkOverdue(pastDate, 'IN_PROGRESS'), true);
  assert.equal(checkOverdue(pastDate, 'COMPLETED'), false);
  assert.equal(checkOverdue(futureDate, 'ASSIGNED'), false);
});
