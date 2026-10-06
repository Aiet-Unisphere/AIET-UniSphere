export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'Academic' | 'Exam' | 'Event' | 'General';
  departmentId: string;
  departmentName: string;
  createdBy: string;
  authorRole: 'HOD' | 'Faculty' | 'Admin';
  targetAudience: 'Students' | 'Faculty' | 'Students + Faculty';
  publishedAt: string;
  status: 'Published' | 'Draft';
  attachmentPath?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentType?: string;
}

export const mockAnnouncements: Announcement[] = [];
