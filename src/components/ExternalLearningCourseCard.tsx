import React from 'react';
import { ExternalLink, Clock, Award, FileText, CheckCircle2, AlertCircle, Info, RefreshCw } from 'lucide-react';
import type { StudentExternalLearningItem } from '../services/externalLearningService';
import { ProgressBar } from './ProgressBar';

interface ExternalLearningCourseCardProps {
  item: StudentExternalLearningItem;
  onOpenDetails: (item: StudentExternalLearningItem) => void;
  onOpenProgressModal: (item: StudentExternalLearningItem) => void;
  onOpenEvidenceModal: (item: StudentExternalLearningItem) => void;
  onViewCertificate: (storagePath: string) => void;
}

export const ExternalLearningCourseCard: React.FC<ExternalLearningCourseCardProps> = ({
  item,
  onOpenDetails,
  onOpenProgressModal,
  onOpenEvidenceModal,
  onViewCertificate
}) => {
  const { enrollment, assignment, course, progress, latestEvidence } = item;

  // Deadline calculations
  const now = new Date();
  const deadlineDate = assignment?.deadline ? new Date(assignment.deadline) : null;
  const isOverdue = deadlineDate ? (deadlineDate < now && enrollment.status !== 'COMPLETED') : false;

  const formatDeadline = () => {
    if (!deadlineDate) return 'No deadline';
    return deadlineDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Progress calculations
  const progressPercent = progress ? Number(progress.progress_percent) : 0;
  const hasModules = progress && progress.total_modules != null && progress.total_modules > 0;

  // Status badges
  const getEnrollmentBadgeClass = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'badge-graded';
      case 'IN_PROGRESS': return 'badge-submitted';
      case 'OVERDUE': return 'badge-overdue';
      case 'CANCELLED': return 'badge-closed';
      default: return 'badge-active';
    }
  };

  const getEvidenceBadge = () => {
    if (!latestEvidence) {
      return { label: 'No Evidence', className: 'badge-closed', icon: AlertCircle };
    }
    switch (latestEvidence.verification_status) {
      case 'VERIFIED':
        return { label: 'Verified', className: 'badge-graded', icon: CheckCircle2 };
      case 'REJECTED':
        return { label: 'Rejected', className: 'badge-overdue', icon: AlertCircle };
      case 'PENDING':
      default:
        return { label: 'Pending Verification', className: 'badge-submitted', icon: Clock };
    }
  };

  const evidenceBadge = getEvidenceBadge();
  const EvidenceIcon = evidenceBadge.icon;

  const handleContinueCourse = () => {
    if (!course?.external_url) return;
    window.open(course.external_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="course-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
      {/* Header Info */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span className="course-code-badge" style={{ backgroundColor: '#EEF2FF', color: '#4F46E5', fontWeight: 600 }}>
              {course.platform || 'MOOC'}
            </span>
            {assignment?.academic_course_id && (
              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#F3F4F6', color: '#374151', fontWeight: 500 }}>
                Linked: {assignment.academic_course_id}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <span className={`badge ${assignment?.required ? 'badge-overdue' : 'badge-active'}`} style={{ fontSize: '0.725rem' }}>
              {assignment?.required ? 'Required' : 'Optional'}
            </span>
            <span className={`badge ${getEnrollmentBadgeClass(isOverdue ? 'OVERDUE' : enrollment.status)}`} style={{ fontSize: '0.725rem' }}>
              {isOverdue ? 'OVERDUE' : enrollment.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="course-card-title" style={{ marginTop: '0.625rem', fontSize: '1.1rem', lineHeight: '1.4' }}>
          {course.title}
        </h3>
        
        {course.provider_name && (
          <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>
            Provided by: <strong>{course.provider_name}</strong>
          </p>
        )}

        {course.description && (
          <p style={{ fontSize: '0.825rem', color: '#4B5563', marginTop: '0.4rem', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {course.description}
          </p>
        )}
      </div>

      {/* Metrics & Progress Section */}
      <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>
            Reported Progress
          </span>
          <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--brand-black)' }}>
            {progressPercent}%
            {hasModules && ` (${progress?.completed_modules} / ${progress?.total_modules} modules)`}
          </span>
        </div>
        <ProgressBar progress={progressPercent} />

        {/* Deadline & Verification status summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.625rem', fontSize: '0.775rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: isOverdue ? '#DC2626' : '#6B7280', fontWeight: isOverdue ? 600 : 500 }}>
            <Clock size={13} />
            {isOverdue ? 'Overdue: ' : 'Due: '}{formatDeadline()}
          </span>

          <span className={`badge ${evidenceBadge.className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem' }}>
            <EvidenceIcon size={12} />
            {evidenceBadge.label}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <button
          type="button"
          onClick={handleContinueCourse}
          className="btn btn-primary"
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.375rem' }}
        >
          <ExternalLink size={15} />
          Continue Course
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
          <button
            type="button"
            onClick={() => onOpenProgressModal(item)}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}
          >
            <RefreshCw size={13} />
            Update Progress
          </button>

          {latestEvidence?.verification_status === 'VERIFIED' && latestEvidence.certificate_storage_path ? (
            <button
              type="button"
              onClick={() => onViewCertificate(latestEvidence.certificate_storage_path!)}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem', backgroundColor: '#ECFDF5', color: '#047857', borderColor: '#A7F3D0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}
            >
              <Award size={13} />
              View Certificate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenEvidenceModal(item)}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}
            >
              <FileText size={13} />
              Submit Evidence
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenDetails(item)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--brand-black)',
            fontSize: '0.775rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '0.25rem',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.25rem',
            textDecoration: 'underline'
          }}
        >
          <Info size={13} />
          View Details & Instructions
        </button>
      </div>
    </div>
  );
};
