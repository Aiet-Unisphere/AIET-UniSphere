export interface LeaveRequest {
  id: string;
  dbId?: string;
  requesterId: string;
  requesterName: string;
  requesterUsnOrEmpId: string;
  requesterRole: 'STUDENT' | 'FACULTY';
  requesterEmail?: string;
  departmentId: string;
  departmentName?: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: string;
  reviewedBy?: string;
  reviewerName?: string;
  remark?: string;
  supportingDocument?: string;
  supportingDocPath?: string;
  supportingDocName?: string;
  supportingDocSize?: number;
  supportingDocType?: string;
  semester?: string | number | null;
  cgpa?: string | number | null;
  attendancePercent?: string | number | null;
}

export const mockLeaveRequests: LeaveRequest[] = [];
