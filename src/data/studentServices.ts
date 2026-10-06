export interface ServiceTypeItem {
  id: string;
  title: string;
  description: string;
  iconName: string;
  estimatedTime: string;
  requiredDocs: boolean;
  category: 'Certificates' | 'Academic Records' | 'Financial' | 'Library' | 'Administration' | 'Facilities' | 'Sports' | 'Academic' | 'Grievance' | 'General';
}

export interface ServiceTimelineStep {
  step: string;
  status: 'completed' | 'current' | 'upcoming';
  date?: string;
  note?: string;
}

export interface ServiceRequestItem {
  id: string;
  requestType: string;
  serviceTypeId: string;
  subject: string;
  description: string;
  submittedDate: string;
  lastUpdatedDate: string;
  status: 'Pending' | 'In Review' | 'Rejected' | 'Resolved';
  timeline: ServiceTimelineStep[];
  attachmentName?: string;
  attachmentPath?: string;
  attachmentSize?: number;
  remarks?: string;
}

export interface CreateServiceRequestPayload {
  serviceTypeId: string;
  requestType: string;
  subject: string;
  description: string;
  attachmentName?: string;
  attachmentSize?: number;
  file?: File;
}

