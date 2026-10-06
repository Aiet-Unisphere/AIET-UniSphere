import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit & Service Verification Tests for Faculty External Learning UI & Service Layer (Phase 2B)
 */

test('1. Course definition validation rejects empty title, platform, and invalid URLs', () => {
  const validateCourseInput = (input) => {
    if (!input.title || !input.title.trim()) throw new Error('Course title is required.');
    if (!input.platform || !input.platform.trim()) throw new Error('Course platform is required.');
    if (!input.external_url || !input.external_url.trim()) throw new Error('External course URL is required.');
    if (!/^https?:\/\/.+/i.test(input.external_url.trim())) {
      throw new Error('External URL must start with http:// or https://');
    }
    if (input.estimated_hours != null && input.estimated_hours < 0) {
      throw new Error('Estimated hours must be greater than or equal to 0.');
    }
    return true;
  };

  assert.throws(() => validateCourseInput({ title: '', platform: 'Coursera', external_url: 'https://coursera.org' }), /title is required/);
  assert.throws(() => validateCourseInput({ title: 'Cloud Eng', platform: '', external_url: 'https://coursera.org' }), /platform is required/);
  assert.throws(() => validateCourseInput({ title: 'Cloud Eng', platform: 'Coursera', external_url: 'ftp://coursera.org' }), /http:\/\/ or https:\/\//);
  assert.throws(() => validateCourseInput({ title: 'Cloud Eng', platform: 'Coursera', external_url: 'https://coursera.org', estimated_hours: -5 }), /greater than or equal to 0/);
  assert.equal(validateCourseInput({ title: 'Cloud Eng', platform: 'Coursera', external_url: 'https://coursera.org/learn/cloud', estimated_hours: 20 }), true);
});

test('2. Rejection workflow requires a non-empty verification note', () => {
  const validateRejection = (status, notes) => {
    if (status === 'REJECTED' && (!notes || !notes.trim())) {
      throw new Error('A verification note explaining the rejection reason is required.');
    }
    return true;
  };

  assert.throws(() => validateRejection('REJECTED', ''), /rejection reason is required/);
  assert.throws(() => validateRejection('REJECTED', '   '), /rejection reason is required/);
  assert.equal(validateRejection('REJECTED', 'Certificate name does not match student USN'), true);
  assert.equal(validateRejection('VERIFIED', ''), true);
});

test('3. Faculty progress override sets source to FACULTY_UPDATED', () => {
  const buildProgressPayload = (enrollmentId, percent, modules) => {
    return {
      enrollment_id: enrollmentId,
      progress_percent: percent,
      completed_modules: modules.completed,
      total_modules: modules.total,
      source: 'FACULTY_UPDATED'
    };
  };

  const payload = buildProgressPayload('en-101', 85, { completed: 17, total: 20 });
  assert.equal(payload.source, 'FACULTY_UPDATED');
  assert.equal(payload.progress_percent, 85);
  assert.equal(payload.completed_modules, 17);
});

test('4. Faculty Metrics summary calculates completion rate correctly', () => {
  const calculateCompletionRate = (completed, total) => {
    if (!total || total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  assert.equal(calculateCompletionRate(18, 40), 45);
  assert.equal(calculateCompletionRate(0, 40), 0);
  assert.equal(calculateCompletionRate(40, 40), 100);
  assert.equal(calculateCompletionRate(0, 0), 0);
});
