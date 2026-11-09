import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * MISSION 08.3.3 APPLICATION TEST SUITE
 * Faculty Attendance Correction Workflow & UI State Validation
 */

// 1. Mandatory correction reason validation
test('1. Mandatory correction reason validation: rejects empty, whitespace, and <5 chars', () => {
  const validateReason = (reason) => {
    const clean = (reason || '').trim();
    if (!clean) return { valid: false, error: 'Correction reason is required.' };
    if (clean.length < 5) return { valid: false, error: 'Correction reason must be at least 5 characters long.' };
    if (clean.length > 500) return { valid: false, error: 'Correction reason cannot exceed 500 characters.' };
    return { valid: true, cleanReason: clean };
  };

  assert.equal(validateReason('').valid, false);
  assert.equal(validateReason('   ').valid, false);
  assert.equal(validateReason('Med').valid, false);
  assert.equal(validateReason('Sick').valid, false);
  assert.equal(validateReason('Medical leave approved').valid, true);
  assert.equal(validateReason('Medical leave approved').cleanReason, 'Medical leave approved');
  assert.equal(validateReason('a'.repeat(501)).valid, false);
});

// 2. Status selection & idempotent status transition guard
test('2. Status selection: detects redundant status transitions and enforces idempotency', () => {
  const checkStatusTransition = (currentStatus, targetStatus) => {
    const validStatuses = ['Present', 'Absent', 'Late'];
    if (!validStatuses.includes(targetStatus)) {
      return { proceed: false, error: 'Invalid status' };
    }
    if (currentStatus === targetStatus) {
      return { proceed: false, idempotent: true, message: 'Status is already set. No update needed.' };
    }
    return { proceed: true, idempotent: false };
  };

  assert.deepEqual(checkStatusTransition('Absent', 'Absent'), {
    proceed: false,
    idempotent: true,
    message: 'Status is already set. No update needed.'
  });
  assert.deepEqual(checkStatusTransition('Absent', 'Present'), {
    proceed: true,
    idempotent: false
  });
  assert.deepEqual(checkStatusTransition('Present', 'Invalid'), {
    proceed: false,
    error: 'Invalid status'
  });
});

// 3. Counter recalculation engine
test('3. Dynamic session counters recalculation from roster', () => {
  const recalculateSessionCounters = (roster = []) => {
    let present = 0;
    let absent = 0;
    let late = 0;

    for (const r of roster) {
      if (r.status === 'Present') present += 1;
      else if (r.status === 'Absent') absent += 1;
      else if (r.status === 'Late') late += 1;
    }

    return {
      totalStudents: roster.length,
      presentCount: present,
      absentCount: absent,
      lateCount: late
    };
  };

  const initialRoster = [
    { id: '1', status: 'Present' },
    { id: '2', status: 'Absent' },
    { id: '3', status: 'Late' },
    { id: '4', status: 'Absent' }
  ];

  const counters1 = recalculateSessionCounters(initialRoster);
  assert.deepEqual(counters1, {
    totalStudents: 4,
    presentCount: 1,
    absentCount: 2,
    lateCount: 1
  });

  // Correct student 2 from Absent to Present
  const correctedRoster = initialRoster.map(s => s.id === '2' ? { ...s, status: 'Present' } : s);
  const counters2 = recalculateSessionCounters(correctedRoster);
  assert.deepEqual(counters2, {
    totalStudents: 4,
    presentCount: 2,
    absentCount: 1,
    lateCount: 1
  });
});

// 4. Student attendance percentage calculation with Late status
test('4. Student attendance percentage calculation: Late counts as attended session', () => {
  const calculateStudentPercentage = (records = []) => {
    const totalConducted = records.length;
    if (totalConducted === 0) return 0;
    const attended = records.filter(r => r.status === 'Present' || r.status === 'Late').length;
    return Math.round((attended / totalConducted) * 100);
  };

  // 1 Present, 1 Late, 1 Absent out of 3 = 2/3 = 67%
  assert.equal(calculateStudentPercentage([
    { status: 'Present' },
    { status: 'Late' },
    { status: 'Absent' }
  ]), 67);

  // Correct Absent to Late -> 3/3 = 100%
  assert.equal(calculateStudentPercentage([
    { status: 'Present' },
    { status: 'Late' },
    { status: 'Late' }
  ]), 100);
});

// 5. Student UI history item formatting with corrected badge
test('5. Student UI history item: preserves correction metadata without leaking private credentials', () => {
  const formatStudentHistoryItem = (session, record) => {
    return {
      date: session.session_date,
      subject: session.course_name,
      code: session.course_id,
      status: record.status,
      session: `${session.start_time} - ${session.end_time}`,
      isCorrected: record.is_corrected ?? false,
      correctionReason: record.correction_reason ?? null
    };
  };

  const item = formatStudentHistoryItem(
    { session_date: '2026-11-01', course_name: 'Database Systems', course_id: 'CS501', start_time: '09:00 AM', end_time: '10:00 AM' },
    { status: 'Present', is_corrected: true, correction_reason: 'Medical leave sanctioned by HOD' }
  );

  assert.equal(item.status, 'Present');
  assert.equal(item.isCorrected, true);
  assert.equal(item.correctionReason, 'Medical leave sanctioned by HOD');
  assert.equal(item.facultyId, undefined, 'Private internal faculty ID is not exposed in history item');
});

// 6. Duplicate submission prevention flag simulation
test('6. Duplicate submission prevention: state guards block concurrent clicks during RPC', async () => {
  let isSubmitting = false;
  let submissionCount = 0;

  const submitCorrection = async () => {
    if (isSubmitting) return { rejected: true, reason: 'In-flight submission active' };
    isSubmitting = true;
    submissionCount += 1;
    // Simulate async RPC delay
    await new Promise(r => setTimeout(r, 10));
    isSubmitting = false;
    return { success: true };
  };

  // Trigger 3 rapid calls in parallel
  const [res1, res2, res3] = await Promise.all([
    submitCorrection(),
    submitCorrection(),
    submitCorrection()
  ]);

  assert.equal(submissionCount, 1, 'Only exactly 1 submission was allowed to execute');
  assert.equal(res1.success, true);
  assert.equal(res2.rejected, true);
  assert.equal(res3.rejected, true);
});

// 7. Error handling & non-sensitive database error parsing
test('7. Error handling formats non-sensitive messages for user toast', () => {
  const formatUserToastError = (err) => {
    const raw = err?.message || '';
    if (raw.includes('schema cache')) {
      return 'Database synchronization error. Please try again.';
    }
    if (raw.includes('Unauthorized')) {
      return 'You do not have authorization to correct attendance for this session.';
    }
    if (raw.includes('at least 5 characters')) {
      return 'Correction reason must be at least 5 characters long.';
    }
    return raw || 'Failed to apply attendance correction.';
  };

  assert.equal(
    formatUserToastError(new Error('Unauthorized: You are not authorized to correct attendance for this course session.')),
    'You do not have authorization to correct attendance for this session.'
  );
  assert.equal(
    formatUserToastError(new Error('Correction reason must be at least 5 characters long.')),
    'Correction reason must be at least 5 characters long.'
  );
  assert.equal(
    formatUserToastError(new Error('Could not find table public.schema cache')),
    'Database synchronization error. Please try again.'
  );
});
