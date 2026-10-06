/**
 * AIET-UniSphere Phase 1 — Internal AI Query Registry
 *
 * This registry defines SAFE OPERATIONS only. It is NOT a query executor.
 * Each entry maps a query intent to its:
 *   - Allowed roles
 *   - Data source (existing table/view/RPC)
 *   - Handler (existing service function or Edge Function)
 *   - Required authentication
 *   - Example natural language triggers
 *
 * SECURITY PRINCIPLE:
 *   User → Intent Classification → Registry Entry → Predefined Handler → RLS-protected DB
 *
 * The AI CANNOT:
 *   - Execute arbitrary SQL
 *   - Access another user's data
 *   - Bypass RLS policies
 *   - Modify attendance, leave status, or grades
 *
 * All data access goes through the ai-chat Edge Function which:
 *   1. Validates the JWT session
 *   2. Checks account_status = 'ACTIVE'
 *   3. Calls buildUserAcademicContext() with user-scoped client
 *   4. All Supabase queries run under the authenticated user's JWT (RLS enforced)
 */

// ============================================================
// TYPES
// ============================================================

export type QueryType =
  | 'GET_MY_PROFILE'
  | 'GET_MY_ATTENDANCE'
  | 'GET_MY_SUBJECTS'
  | 'GET_MY_ASSIGNMENTS'
  | 'GET_MY_PENDING_ASSIGNMENTS'
  | 'GET_MY_ANNOUNCEMENTS'
  | 'GET_MY_NOTIFICATIONS'
  | 'GET_MY_LEAVE_REQUESTS'
  | 'GET_MY_LEAVE_STATUS';

export type AllowedRole = 'STUDENT' | 'FACULTY' | 'HOD' | 'ADMIN';

export type DataSource =
  | 'profiles + student_profiles'
  | 'attendance_records + attendance_sessions + student_analytics_view'
  | 'course_enrollments'
  | 'assignments + assignment_submissions'
  | 'announcements'
  | 'notifications'
  | 'leave_requests';

export type HandlerType = 'edge_function_context' | 'rpc';

/**
 * A Phase 1 query registry entry.
 * Defines metadata about what data is accessed, how, and by whom.
 * This does NOT execute queries — it documents the safe operation.
 */
export interface QueryRegistryEntry {
  /** Unique identifier for this query type */
  queryType: QueryType;

  /** Human-readable description of what this query retrieves */
  description: string;

  /** Which roles are permitted to execute this query */
  allowedRoles: AllowedRole[];

  /** Whether this query requires an authenticated session */
  requiresAuthentication: true;

  /** The database table(s) or view(s) queried */
  dataSource: DataSource;

  /**
   * How the query is executed:
   * - 'edge_function_context': via buildUserAcademicContext() in the ai-chat Edge Function
   * - 'rpc': via a predefined SECURITY DEFINER RPC
   */
  handlerType: HandlerType;

  /**
   * The specific handler: edge function module function name or RPC name.
   * This is for documentation — the actual call is in the Edge Function.
   */
  handler: string;

  /** Example natural language phrases that trigger this query */
  exampleTriggers: string[];

  /**
   * The AcademicIntent value that maps to this query.
   * Used by classifyIntent() in context.ts.
   */
  intentMapping: string;

  /** Notes for future developers */
  notes?: string;
}

// ============================================================
// PHASE 1 QUERY REGISTRY
// ============================================================

export const PHASE1_QUERY_REGISTRY: Readonly<QueryRegistryEntry[]> = [
  {
    queryType: 'GET_MY_PROFILE',
    description: "Retrieves the authenticated student's own profile: name, USN, email, department, semester, CGPA.",
    allowedRoles: ['STUDENT', 'FACULTY', 'HOD', 'ADMIN'],
    requiresAuthentication: true,
    dataSource: 'profiles + student_profiles',
    handlerType: 'edge_function_context',
    handler: 'buildUserAcademicContext → profiles + student_profiles query',
    exampleTriggers: [
      'What is my profile?',
      'Show my details',
      'What is my USN?',
      'What semester am I in?',
      'What is my CGPA?',
      'Who am I?',
    ],
    intentMapping: 'PROFILE',
    notes: 'Profile data is always included in the base context. No additional query needed for PROFILE intent.',
  },

  {
    queryType: 'GET_MY_ATTENDANCE',
    description: "Retrieves the authenticated student's overall attendance percentage and per-session records.",
    allowedRoles: ['STUDENT'],
    requiresAuthentication: true,
    dataSource: 'attendance_records + attendance_sessions + student_analytics_view',
    handlerType: 'edge_function_context',
    handler: 'buildUserAcademicContext → student_analytics_view query (student_id = auth.uid())',
    exampleTriggers: [
      'What is my attendance?',
      'Show my attendance percentage',
      'Am I at risk of attendance shortage?',
      'How many classes have I attended?',
      'Show my attendance record',
    ],
    intentMapping: 'ATTENDANCE',
    notes: 'student_analytics_view is RLS-protected and scoped to auth.uid(). Returns overall attendance_percentage, total_sessions, present_count.',
  },

  {
    queryType: 'GET_MY_SUBJECTS',
    description: "Retrieves the authenticated student's enrolled courses for the current semester.",
    allowedRoles: ['STUDENT'],
    requiresAuthentication: true,
    dataSource: 'course_enrollments',
    handlerType: 'edge_function_context',
    handler: 'buildUserAcademicContext → course_enrollments query (student_id = auth.uid(), status = Active)',
    exampleTriggers: [
      'What subjects do I have?',
      'List my enrolled courses',
      'Which courses am I taking?',
      'What are my subjects this semester?',
    ],
    intentMapping: 'COURSE',
    notes: 'course_enrollments RLS policy: student_id = auth.uid(). Returns course_name, course_code, faculty_name, semester.',
  },

  {
    queryType: 'GET_MY_ASSIGNMENTS',
    description: "Retrieves all assignments for the student's department, including submission status.",
    allowedRoles: ['STUDENT'],
    requiresAuthentication: true,
    dataSource: 'assignments + assignment_submissions',
    handlerType: 'edge_function_context',
    handler: 'buildUserAcademicContext → assignments query (department_id) + assignment_submissions (student_id = auth.uid())',
    exampleTriggers: [
      'Show my assignments',
      'What assignments do I have?',
      'List all my assignments',
    ],
    intentMapping: 'ASSIGNMENT',
    notes: 'assignments RLS: department_id match. assignment_submissions RLS: student_id = auth.uid(). The AI cross-references to determine submission status.',
  },

  {
    queryType: 'GET_MY_PENDING_ASSIGNMENTS',
    description: 'Retrieves assignments that the student has not yet submitted.',
    allowedRoles: ['STUDENT'],
    requiresAuthentication: true,
    dataSource: 'assignments + assignment_submissions',
    handlerType: 'edge_function_context',
    handler: 'buildUserAcademicContext → pendingAssignments derivation (filter: no submission or not-submitted)',
    exampleTriggers: [
      'Which assignments are pending?',
      'What homework do I have left?',
      'Show pending submissions',
      'What is my pending work?',
      'Which assignments are due?',
    ],
    intentMapping: 'ASSIGNMENT',
    notes: 'Derived from assignments not present in assignment_submissions for this student, or where status !== Submitted.',
  },

  {
    queryType: 'GET_MY_ANNOUNCEMENTS',
    description: 'Retrieves published department announcements targeted at students.',
    allowedRoles: ['STUDENT'],
    requiresAuthentication: true,
    dataSource: 'announcements',
    handlerType: 'edge_function_context',
    handler: "buildUserAcademicContext → announcements query (department_id, status=PUBLISHED, target_audience includes 'Students')",
    exampleTriggers: [
      'Show announcements',
      'What are the latest announcements?',
      'Any circulars from the department?',
      'Department notices',
    ],
    intentMapping: 'ANNOUNCEMENT',
    notes: "RLS policy: status='PUBLISHED' AND department_id = user's dept AND target_audience IN ('Students', 'Students + Faculty').",
  },

  {
    queryType: 'GET_MY_NOTIFICATIONS',
    description: "Retrieves the authenticated user's personal notification feed.",
    allowedRoles: ['STUDENT', 'FACULTY', 'HOD', 'ADMIN'],
    requiresAuthentication: true,
    dataSource: 'notifications',
    handlerType: 'edge_function_context',
    handler: 'buildUserAcademicContext → notifications query (user_id = auth.uid())',
    exampleTriggers: [
      'Show my notifications',
      "What's in my inbox?",
      'Any new alerts?',
      'Show unread messages',
      "What's new?",
    ],
    intentMapping: 'NOTIFICATION',
    notes: 'RLS policy: user_id = auth.uid(). Returns title, short_message, source, category, is_read, created_at. Max 8 recent.',
  },

  {
    queryType: 'GET_MY_LEAVE_REQUESTS',
    description: 'Retrieves all leave requests submitted by the authenticated student.',
    allowedRoles: ['STUDENT'],
    requiresAuthentication: true,
    dataSource: 'leave_requests',
    handlerType: 'edge_function_context',
    handler: 'buildUserAcademicContext → leave_requests query (student_id = auth.uid())',
    exampleTriggers: [
      'Show my leave requests',
      'List my leaves',
      'What leaves have I applied for?',
      'My leave applications',
    ],
    intentMapping: 'LEAVE',
    notes: 'RLS policy: student_id = auth.uid(). Returns reference_id, leave_type, reason, start_date, end_date, status.',
  },

  {
    queryType: 'GET_MY_LEAVE_STATUS',
    description: "Retrieves the status (PENDING/APPROVED/REJECTED) of the student's leave requests.",
    allowedRoles: ['STUDENT'],
    requiresAuthentication: true,
    dataSource: 'leave_requests',
    handlerType: 'edge_function_context',
    handler: 'buildUserAcademicContext → leave_requests query (student_id = auth.uid()) + status filter',
    exampleTriggers: [
      'What is the status of my leave request?',
      'Was my leave approved?',
      'Did the HOD approve my leave?',
      'Is my leave pending?',
      'Show my pending leaves',
    ],
    intentMapping: 'LEAVE',
    notes: 'Same data source as GET_MY_LEAVE_REQUESTS. The AI filters by status to answer status-specific questions.',
  },
] as const;

// ============================================================
// LOOKUP HELPERS
// ============================================================

/**
 * Returns registry entries allowed for a given role.
 * Used to determine what the AI may answer for a given user.
 */
export function getRegistryEntriesForRole(role: AllowedRole): QueryRegistryEntry[] {
  return PHASE1_QUERY_REGISTRY.filter(entry => entry.allowedRoles.includes(role));
}

/**
 * Returns the registry entry for a specific query type.
 */
export function getRegistryEntry(queryType: QueryType): QueryRegistryEntry | undefined {
  return PHASE1_QUERY_REGISTRY.find(entry => entry.queryType === queryType);
}

/**
 * Error categories for Phase 1 AI error handling.
 * User-facing messages should use these categories.
 */
export const AI_ERROR_CATEGORIES = {
  AUTHENTICATION_REQUIRED: 'You need to be signed in to access this information.',
  PERMISSION_DENIED: "You don't have permission to access this information.",
  DATA_NOT_FOUND: "I couldn't find the requested information.",
  INVALID_QUERY: 'I could not understand your request. Please rephrase.',
  DATABASE_ERROR: 'This information is currently unavailable in UniSphere.',
  AI_RESPONSE_ERROR: 'The AI assistant is temporarily unavailable. Please try again.',
} as const;

export type AIErrorCategory = keyof typeof AI_ERROR_CATEGORIES;
