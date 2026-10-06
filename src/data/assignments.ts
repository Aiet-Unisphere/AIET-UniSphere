export interface Assignment {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  deadline: string;
  marks: number;
  status: 'Pending' | 'Submitted' | 'Graded' | 'Overdue';
  instructions: string;
  resources: string[];
  rubric: string[];
  storagePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  submittedFile?: {
    name: string;
    submittedAt: string;
    storagePath?: string;
    fileSize?: number;
    mimeType?: string;
  };
  grade?: {
    score: number;
    feedback: string;
    gradedBy: string;
  };
}

export const mockAssignments: Assignment[] = [];
