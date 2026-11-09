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
  reviewedAt?: string | null;
  remark?: string;
  approvalRemarks?: string | null;
  supportingDocument?: string;
  supportingDocPath?: string;
  supportingDocName?: string;
  supportingDocSize?: number;
  supportingDocType?: string;
  semester?: string | number | null;
  cgpa?: string | number | null;
  attendancePercent?: string | number | null;
  // Snapshot properties
  studentNameSnapshot?: string;
  studentUsnSnapshot?: string;
  branchSnapshot?: string;
  sectionSnapshot?: string;
  semesterSnapshot?: number | string | null;
  academicYearSnapshot?: string | null;
  studentPhoneSnapshot?: string | null;
  parentPhoneSnapshot?: string | null;
  snapshotProvenance?: 'SUBMISSION' | 'RETROACTIVE_BACKFILL' | 'UNVERIFIED';
}

export const mockLeaveRequests: LeaveRequest[] = [];
