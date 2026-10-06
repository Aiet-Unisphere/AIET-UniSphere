export interface AIMessageItem {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  quickActionLabel?: string;
}

export interface AIConversation {
  id: string;
  title: string;
  date: string;
  courseContext: string;
  messages: AIMessageItem[];
}

export interface QuickActionItem {
  id: string;
  label: string;
  prompt: string;
  iconName: string;
}

export const mockCourseContexts = [
  'All Courses',
  'Database Management Systems',
  'Operating Systems',
  'Computer Networks',
  'Artificial Intelligence'
];

export const mockQuickActions: QuickActionItem[] = [
  {
    id: 'qa-1',
    label: 'Explain a topic',
    prompt: 'Explain normal forms (1NF, 2NF, 3NF, BCNF) with clear examples.',
    iconName: 'BookOpen'
  },
  {
    id: 'qa-2',
    label: 'Summarize material',
    prompt: 'Summarize the key concepts of Process Synchronization and Semaphores in OS.',
    iconName: 'FileText'
  },
  {
    id: 'qa-3',
    label: 'Generate practice questions',
    prompt: 'Generate 3 multiple-choice practice questions on TCP vs UDP protocols.',
    iconName: 'HelpCircle'
  },
  {
    id: 'qa-4',
    label: 'Prepare for an exam',
    prompt: 'Give me a 15-minute quick revision guide for the upcoming AI & Neural Networks assessment.',
    iconName: 'Award'
  }
];

export const mockConversations: AIConversation[] = [];

