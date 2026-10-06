/**
 * AIET-UniSphere - AI Layer Shared Types
 * Defines interfaces for Gemini requests/responses, academic context, and intent classification.
 */

export type AIProvider = 'gemini' | 'openai';

export type UserRole = 'STUDENT' | 'FACULTY' | 'HOD' | 'ADMIN';

export type AcademicIntent =
  | 'GENERAL'
  | 'COURSE'
  | 'ASSIGNMENT'
  | 'ATTENDANCE'
  | 'ASSESSMENT'
  | 'RESULT'
  | 'STUDY_PLAN'
  | 'LEARNING_GAP'
  | 'TIMETABLE'
  | 'MATERIAL'
  | 'ANNOUNCEMENT'
  | 'NOTIFICATION'
  | 'LEAVE'
  | 'PROFILE'
  | 'PROJECT'
  | 'QUIZ'
  | 'INSTITUTIONAL_RAG'
  | 'COMBINED_RAG'
  | 'GENERAL_ACADEMIC';

export interface EnrolledCourseSummary {
  courseName: string;
  courseCode?: string;
  facultyName?: string;
  credits?: number;
  semester?: number;
}

export interface AssignmentSummary {
  id: string;
  title: string;
  courseName: string;
  deadline: string;
  marks: number;
  status: 'Pending' | 'Submitted' | 'Graded';
  score?: number | null;
}

export interface AssessmentSummary {
  id: string;
  title: string;
  courseName: string;
  assessmentDate: string;
  durationMinutes: number;
  totalMarks: number;
  status: string;
  userScore?: number | null;
  percentage?: number | null;
}

export interface LearningGapSummary {
  topic: string;
  course: string;
  scorePercent: number;
}

export interface TimetableEntrySummary {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  courseName: string;
  room?: string;
  isLab?: boolean;
}

export interface AnnouncementSummary {
  title: string;
  category: string;
  content: string;
  publishedAt?: string;
}

export interface SkillSummary {
  name: string;
  level: string;
  levelPercent: number;
  category: string;
}

/** Phase 1: Leave request summary for AI context */
export interface LeaveRequestSummary {
  referenceId: string;
  leaveType: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  rejectionReason?: string | null;
}

/** Phase 1: Notification summary for AI context */
export interface NotificationSummary {
  title: string;
  shortMessage: string;
  source: string;
  category: string;
  isRead: boolean;
  createdAt: string;
}

export interface DocumentCitation {
  documentId: string;
  title: string;
  documentType: string;
  version: string;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface UserContext {
  userId: string;
  role: UserRole;
  fullName: string;
  email: string;
  departmentName?: string;
  semester?: number;
  cgpa?: number;
  intent: AcademicIntent;
  courseFilter?: string;

  // Student specific data
  enrolledCourses?: EnrolledCourseSummary[];
  attendancePercent?: number;
  totalSessionsAttended?: number;
  totalSessionsHeld?: number;
  pendingAssignments?: AssignmentSummary[];
  recentSubmissions?: AssignmentSummary[];
  upcomingAssessments?: AssessmentSummary[];
  recentAssessmentResults?: AssessmentSummary[];
  learningGaps?: LearningGapSummary[];
  timetable?: TimetableEntrySummary[];
  announcements?: AnnouncementSummary[];
  skills?: SkillSummary[];
  academicMaterials?: Array<{ title: string; courseId: string; fileType: string }>;

  // Phase 1 additions
  leaveRequests?: LeaveRequestSummary[];
  recentNotifications?: NotificationSummary[];
  usn?: string;

  // Phase 2 additions: Institutional Knowledge RAG Context
  ragChunks?: Array<{
    documentTitle: string;
    documentType: string;
    version: string;
    pageNumber?: number | null;
    sectionTitle?: string | null;
    content: string;
  }>;
  citations?: DocumentCitation[];

  // Faculty specific data
  teachingCourses?: string[];
  pendingGradingCount?: number;
  facultySchedule?: TimetableEntrySummary[];

  // HOD specific data
  departmentStudentCount?: number;
  departmentFacultyCount?: number;
  departmentAnnouncements?: AnnouncementSummary[];

  // Admin specific data
  systemStatus?: string;
}

export interface GenerateRequest {
  systemPrompt: string;
  userMessage: string;
  history?: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResponse {
  text: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  provider: 'gemini' | 'openai';
  model: string;
}

export interface AIChatRequestBody {
  message: string;
  conversationId?: string | null;
  courseContext?: string | null;
  courseContextId?: string | null;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface AIChatResponseBody {
  success: boolean;
  reply: string;
  message: string;
  conversationId: string;
  provider: string;
  tokensUsed?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  intent?: AcademicIntent;
  citations?: DocumentCitation[];
}

