import React from 'react';
import { BookOpen, Eye } from 'lucide-react';
import type { FacultyAssignmentSummaryItem } from '../../services/externalLearningService';

interface HODExternalLearningAssignmentsProps {
  assignments: FacultyAssignmentSummaryItem[];
  onSelectAssignment: (assignment: FacultyAssignmentSummaryItem) => void;
  onAssignNewCourse?: () => void;
}

export const HODExternalLearningAssignments: React.FC<HODExternalLearningAssignmentsProps> = ({
  assignments,
  onSelectAssignment,
  onAssignNewCourse
}) => {
  if (!assignments || assignments.length === 0) {
    return (
      <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <BookOpen size={40} style={{ color: 'var(--brand-dark-grey)', margin: '0 auto 0.75rem auto' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--brand-black)' }}>
          No external learning assignments in this department.
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem', marginBottom: '1rem' }}>
          No active MOOC assignments have been issued to cohorts in your department yet.
        </p>
        {onAssignNewCourse && (
          <button className="btn btn-primary" onClick={onAssignNewCourse}>
            Assign Course to Cohort
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
            <th style={{ padding: '1rem 1.25rem' }}>External Course & Platform</th>
            <th style={{ padding: '1rem 1.25rem' }}>Cohort / Sem</th>
            <th style={{ padding: '1rem 1.25rem' }}>Academic Year</th>
            <th style={{ padding: '1rem 1.25rem' }}>Type</th>
            <th style={{ padding: '1rem 1.25rem' }}>Students</th>
            <th style={{ padding: '1rem 1.25rem' }}>In Progress</th>
            <th style={{ padding: '1rem 1.25rem' }}>Completed</th>
            <th style={{ padding: '1rem 1.25rem' }}>Pending Ev.</th>
            <th style={{ padding: '1rem 1.25rem' }}>Deadline</th>
            <th style={{ padding: '1rem 1.25rem' }}>Status</th>
            <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((item) => {
            const isClosed = item.assignment.status === 'CLOSED';
            const deadlineDate = item.assignment.deadline ? new Date(item.assignment.deadline) : null;
            const isOverdue = deadlineDate && deadlineDate < new Date() && item.completedCount < item.enrolledStudentsCount;

            return (
              <tr key={item.assignment.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                <td style={{ padding: '1rem 1.25rem' }}>
                  <div>
                    <span className="badge badge-graded" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>
                      {item.course.platform}
                    </span>
                    <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.9rem' }}>
                      {item.course.title}
                    </div>
                    {item.assignment.academic_course_id && (
                      <span style={{ fontSize: '0.725rem', color: '#4B5563' }}>
                        Subj Code: {item.assignment.academic_course_id}
                      </span>
                    )}
                  </div>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>
                    Sem {item.assignment.semester || 'All'} {item.assignment.section ? `(${item.assignment.section})` : ''}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{ fontSize: '0.825rem', color: '#4B5563' }}>
                    {item.assignment.academic_year || '2026–27'}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: item.assignment.required ? '#FEF3C7' : '#F3F4F6',
                    color: item.assignment.required ? '#92400E' : '#374151'
                  }}>
                    {item.assignment.required ? 'REQUIRED' : 'OPTIONAL'}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--brand-black)' }}>
                    {item.enrolledStudentsCount}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--brand-blue)' }}>
                    {item.inProgressCount}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{ fontWeight: 700, color: '#059669' }}>
                    {item.completedCount}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{ fontWeight: 700, color: item.pendingVerificationCount ? '#DC2626' : '#6B7280' }}>
                    {item.pendingVerificationCount}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.8rem', color: isOverdue ? '#DC2626' : '#4B5563', fontWeight: isOverdue ? 700 : 500 }}>
                    {deadlineDate ? deadlineDate.toLocaleDateString() : 'No deadline'}
                    {isOverdue && <span style={{ display: 'block', fontSize: '0.7rem' }}>OVERDUE</span>}
                  </div>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span className={`badge ${isClosed ? 'badge-cancelled' : 'badge-active'}`}>
                    {item.assignment.status}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                  <button
                    onClick={() => onSelectAssignment(item)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                  >
                    <Eye size={14} />
                    <span>Analytics</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
