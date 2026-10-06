/**
 * AIET-UniSphere — External Learning Platform Neutral Integration Contract (Phase 3C)
 *
 * Defines abstract types and interface definitions for future server-side platform synchronization
 * adapters (e.g. Coursera, NPTEL, edX, Udemy, SWAYAM).
 *
 * IMPORTANT: No active network implementations exist in Phase 3C.
 * Official synchronization remains conditional on enterprise provider authorization and credentials.
 */

export type ExternalPlatformIdentifier = 'COURSERA' | 'NPTEL' | 'SWAYAM' | 'EDX' | 'UDEMY' | 'OTHER';

export interface ExternalPlatformCourseMetadata {
  platformCourseId: string;
  platformSlug: string;
  title: string;
  description?: string;
  providerName?: string;
  externalUrl: string;
  estimatedHours?: number;
}

export interface ExternalPlatformLearnerIdentity {
  uniSphereStudentId: string;
  externalUserId?: string;
  learnerEmail: string;
  organizationId?: string;
}

export interface ExternalPlatformEnrollmentStatus {
  externalEnrollmentId?: string;
  uniSphereStudentId: string;
  platformCourseId: string;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  enrolledAt?: string;
  completedAt?: string;
}

export interface ExternalPlatformProgressReport {
  uniSphereStudentId: string;
  platformCourseId: string;
  progressPercent: number;
  completedModules?: number;
  totalModules?: number;
  completedQuizzes?: number;
  totalQuizzes?: number;
  lastActivityAt?: string;
  source: 'EXTERNAL_API';
}

export interface ExternalPlatformCredentialInfo {
  uniSphereStudentId: string;
  platformCourseId: string;
  credentialId?: string;
  credentialUrl?: string;
  issuedAt?: string;
  verificationStatus: 'VERIFIED' | 'PENDING';
}

export interface ExternalLearningPlatformAdapter {
  readonly platform: ExternalPlatformIdentifier;
  resolveCourse(courseSlugOrId: string): Promise<ExternalPlatformCourseMetadata>;
  resolveLearner(uniSphereStudentId: string, email: string): Promise<ExternalPlatformLearnerIdentity | null>;
  getEnrollment(learner: ExternalPlatformLearnerIdentity, courseId: string): Promise<ExternalPlatformEnrollmentStatus | null>;
  getProgress(learner: ExternalPlatformLearnerIdentity, courseId: string): Promise<ExternalPlatformProgressReport | null>;
  getCompletion(learner: ExternalPlatformLearnerIdentity, courseId: string): Promise<ExternalPlatformCredentialInfo | null>;
}
