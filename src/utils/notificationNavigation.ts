/**
 * Safely resolves notification target destinations according to user role.
 * Prevents unauthorized redirection or broken routes.
 */
export const resolveNotificationRoute = (relatedLink?: string, userRole?: string): string => {
  if (!relatedLink) {
    if (userRole === 'HOD') return '/hod/notifications';
    if (userRole === 'FACULTY') return '/faculty/notifications';
    return '/student/notifications';
  }

  // If the user is HOD:
  if (userRole === 'HOD') {
    if (relatedLink.includes('/leave')) return '/hod/leave';
    if (relatedLink.includes('/announcements')) return '/hod/announcements';
    if (relatedLink.includes('/assessments')) return '/hod/assessments';
    if (relatedLink.includes('/attendance')) return '/hod/attendance';
  }

  // If the user is Faculty:
  if (userRole === 'FACULTY') {
    if (relatedLink.includes('/announcements')) return '/faculty/announcements';
    if (relatedLink.includes('/attendance')) return '/faculty/attendance';
    if (relatedLink.includes('/assignments')) {
      // If student assignment detail /student/assignments/:id, redirect to faculty assignments list
      return '/faculty/assignments';
    }
    if (relatedLink.includes('/assessments')) {
      return '/faculty/assessments';
    }
    if (relatedLink.includes('/projects')) {
      return '/faculty/projects';
    }
  }

  return relatedLink;
};

