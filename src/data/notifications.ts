export type NotificationType = 
  | 'Assignment' 
  | 'Assessment' 
  | 'Attendance' 
  | 'Leave' 
  | 'Announcement' 
  | 'Course' 
  | 'Project' 
  | 'Faculty' 
  | 'System';

export type NotificationCategory = 'Academic' | 'Projects' | 'System' | 'Leave';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  shortMessage: string;
  fullMessage: string;
  time: string;
  timestamp: string;
  isRead: boolean;
  priority?: 'high' | 'medium' | 'low';
  source: string;
  relatedLink?: string;
  relatedItem?: {
    type: string;
    id: string;
    title: string;
  };
}

export const mockNotifications: NotificationItem[] = [];
