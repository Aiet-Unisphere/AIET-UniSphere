export interface AssessmentQuestion {
  id: string;
  text: string;
  options: string[];
  correctOptionIndex?: number;
  marks: number;
  topic?: string;
}

export interface Assessment {
  id: string;
  title: string;
  courseId: string;
  courseCode?: string;
  subjectCode?: string;
  courseName: string;
  semester?: number;
  date: string;
  dueDate?: string;
  availableFrom?: string;
  deadline?: string;
  time: string;
  duration: number; // in minutes
  durationMinutes?: number;
  status: 'Draft' | 'Upcoming' | 'Completed' | 'Active' | 'Graded' | 'Closed';
  questionsCount: number;
  instructions: string;
  totalMarks?: number;
  storagePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  questions?: AssessmentQuestion[];
  studentAnswers?: Record<string, number>;
  studentAttempt?: {
    id: string;
    status: 'In Progress' | 'Submitted' | 'Graded' | 'Abandoned';
    startedAt: string;
    submittedAt?: string;
    score?: number;
    maxScore?: number;
    percentage?: number;
  };
  result?: {
    score: number;
    percentage: number;
    correctCount: number;
    incorrectCount: number;
    topicPerformance: { topic: string; score: number }[];
  };
}

export const mockAssessments: Assessment[] = [];
