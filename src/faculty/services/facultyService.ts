import { supabase } from '../../lib/supabase';
import { getFacultyCourses } from '../../services/courseService';
import type {
  FacultyProfile,
  TodayClass,
  PendingWorkItem,
  StudentAlertItem,
  FacultyActivityItem
} from '../data/facultyData';

export interface FacultyDashboardData {
  profile: FacultyProfile;
  stats: {
    myCoursesCount: number;
    studentsCount: number;
    todaysClassesCount: number;
    pendingEvaluationsCount: number;
    activeAssignmentsCount: number;
    attendanceAlertsCount: number;
  };
  todaysClasses: TodayClass[];
  pendingWork: PendingWorkItem[];
  studentAlerts: StudentAlertItem[];
  recentActivities: FacultyActivityItem[];
}

export const getFacultyProfile = async (): Promise<FacultyProfile> => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Authenticated faculty session required.');
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, email, designation, department:departments(name)')
      .eq('id', user.id)
      .single();
    if (error || !data) {
      return {
        id: user.id,
        name: user.email?.split('@')[0] || 'Faculty Member',
        title: 'Designation not specified',
        department: 'Department not assigned',
        email: user.email || '',
        office: 'Not recorded',
        academicYear: 'Not set',
      };
    }
    return {
      id: data.id,
      name: data.full_name || data.email,
      title: data.designation || 'Designation not specified',
      department: data.department?.name || 'Department not assigned',
      email: data.email,
      office: 'Not recorded',
      academicYear: 'Not set',
    };
  } catch (err: any) {
    console.warn('[facultyService] Profile lookup fallback:', err?.message);
    const { data: { user } } = await supabase.auth.getUser();
    return {
      id: user?.id || '',
      name: user?.email?.split('@')[0] || 'Faculty Member',
      title: 'Designation not specified',
      department: 'Department not assigned',
      email: user?.email || '',
      office: 'Not recorded',
      academicYear: 'Not set',
    };
  }
};

export const getFacultyDashboardData = async (): Promise<FacultyDashboardData> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authenticated faculty session required.');

  const profile = await getFacultyProfile();
  
  let courses: any[] = [];
  try {
    courses = await getFacultyCourses();
  } catch (err: any) {
    console.warn('[facultyService] getFacultyCourses error fallback:', err?.message);
  }

  const todayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

  const [assignmentsRes, timetableRes, enrollmentsRes] = await Promise.all([
    (async () => {
      try {
        const res = await (supabase as any)
          .from('assignments')
          .select('id, title, course_id, course_name, deadline, status')
          .eq('created_by', user.id)
          .order('deadline', { ascending: true });
        return res.error ? { data: [] } : res;
      } catch {
        return { data: [] };
      }
    })(),
    (async () => {
      try {
        const res = await (supabase as any)
          .from('timetable_entries')
          .select('*')
          .eq('faculty_id', user.id)
          .eq('day_of_week', todayName)
          .order('start_time', { ascending: true });
        return res.error ? { data: [] } : res;
      } catch {
        return { data: [] };
      }
    })(),
    (async () => {
      try {
        const res = await (supabase as any)
          .from('course_enrollments')
          .select('student_id')
          .eq('faculty_id', user.id)
          .eq('status', 'Active');
        return res.error ? { data: [] } : res;
      } catch {
        return { data: [] };
      }
    })()
  ]);

  const assignments = assignmentsRes.data || [];
  const assignmentIds = assignments.map((assignment: any) => assignment.id);
  const studentIds = [...new Set((enrollmentsRes.data || []).map((enrollment: any) => enrollment.student_id))];

  const [submissionsRes, attendanceRes] = await Promise.all([
    (async () => {
      if (!assignmentIds.length) return { data: [] };
      try {
        const res = await (supabase as any)
          .from('assignment_submissions')
          .select('assignment_id, status')
          .in('assignment_id', assignmentIds);
        return res.error ? { data: [] } : res;
      } catch {
        return { data: [] };
      }
    })(),
    (async () => {
      if (!studentIds.length) return { data: [] };
      try {
        const res = await (supabase as any)
          .from('student_analytics_view')
          .select('student_id, attendance_percentage, total_sessions, present_count')
          .in('student_id', studentIds)
          .gt('total_sessions', 0)
          .lt('attendance_percentage', 75);
        return res.error ? { data: [] } : res;
      } catch {
        return { data: [] };
      }
    })()
  ]);

  const pendingByAssignment = new Map<string, number>();
  for (const submission of submissionsRes.data || []) {
    if (submission.status === 'Submitted') {
      pendingByAssignment.set(submission.assignment_id, (pendingByAssignment.get(submission.assignment_id) || 0) + 1);
    }
  }
  const pendingWork: PendingWorkItem[] = assignments
    .map((assignment: any) => ({
      id: assignment.id,
      title: assignment.title,
      courseName: assignment.course_name,
      pendingCount: pendingByAssignment.get(assignment.id) || 0,
      type: 'assignment' as const,
      link: `/faculty/assignments/${assignment.id}`,
    }))
    .filter((item: PendingWorkItem) => item.pendingCount > 0);

  const todayClasses: TodayClass[] = (timetableRes.data || []).map((entry: any) => {
    const now = new Date().toTimeString().slice(0, 8);
    const status = now < entry.start_time ? 'Upcoming' : now <= entry.end_time ? 'Current' : 'Completed';
    return {
      id: entry.id,
      time: `${entry.start_time} - ${entry.end_time}`,
      courseCode: entry.course_code || entry.course_id,
      courseName: entry.course_name,
      department: profile.department,
      semester: Number(entry.semester),
      room: entry.room || 'Not assigned',
      status,
    };
  });

  // Strictly filter for genuine attendance alerts: student must have conducted sessions (> 0) and attendance < 75%
  const lowAttendanceRows = (attendanceRes.data || []).filter((row: any) => {
    const totalSessions = Number(row.total_sessions || 0);
    const percentage = Number(row.attendance_percentage ?? 0);
    return totalSessions > 0 && percentage < 75;
  });
  const lowAttendanceIds = lowAttendanceRows.map((row: any) => row.student_id);
  let lowAttendanceProfiles: any[] = [];
  if (lowAttendanceIds.length) {
    try {
      const res = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email, usn_or_employee_id')
        .in('id', lowAttendanceIds);
      if (!res.error && res.data) lowAttendanceProfiles = res.data;
    } catch (err: any) {
      console.warn('[facultyService] student profile alert query error:', err?.message);
    }
  }

  const attendanceByStudent = new Map<string, { percentage: number; totalSessions: number; presentCount: number }>(
    lowAttendanceRows.map((row: any) => [
      row.student_id, 
      {
        percentage: Number(row.attendance_percentage),
        totalSessions: Number(row.total_sessions || 0),
        presentCount: Number(row.present_count || 0),
      }
    ])
  );
  const studentAlerts: StudentAlertItem[] = (lowAttendanceProfiles || []).map((student: any) => {
    const attInfo = attendanceByStudent.get(student.id);
    const percentage = attInfo ? attInfo.percentage : 0;
    const totalSessions = attInfo ? attInfo.totalSessions : 0;
    const presentCount = attInfo ? attInfo.presentCount : 0;
    return {
      id: student.id,
      studentName: student.full_name || student.email,
      usn: student.usn_or_employee_id || 'Not recorded',
      type: 'Low Attendance',
      details: totalSessions > 0
        ? `Attendance at ${percentage}% (${presentCount}/${totalSessions} sessions conducted). Below the institutional 75% threshold.`
        : 'Attendance is below the institutional 75% threshold.',
      value: `${percentage}%`,
      severity: percentage < 60 ? 'high' : 'medium',
    };
  });

  // Fetch real recent activities for the authenticated faculty member
  const [
    recentAssignmentsRes,
    recentAttendanceRes,
    recentAssessmentsRes,
    recentGradedRes,
    recentAnnouncementsRes
  ] = await Promise.all([
    (async () => {
      try {
        const res = await (supabase as any)
          .from('assignments')
          .select('id, title, course_name, created_at')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        if (res.error) {
          console.warn('[facultyService] Error querying assignments activities:', res.error.message);
          return { data: [] };
        }
        return res;
      } catch (err: any) {
        console.warn('[facultyService] Unexpected error querying assignments activities:', err?.message);
        return { data: [] };
      }
    })(),
    (async () => {
      try {
        const res = await (supabase as any)
          .from('attendance_sessions')
          .select('id, course_name, present_count, total_students, created_at')
          .eq('faculty_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        if (res.error) {
          console.warn('[facultyService] Error querying attendance activities:', res.error.message);
          return { data: [] };
        }
        return res;
      } catch (err: any) {
        console.warn('[facultyService] Unexpected error querying attendance activities:', err?.message);
        return { data: [] };
      }
    })(),
    (async () => {
      try {
        const res = await (supabase as any)
          .from('assessments')
          .select('id, title, course_name, created_at')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        if (res.error) {
          console.warn('[facultyService] Error querying assessments activities:', res.error.message);
          return { data: [] };
        }
        return res;
      } catch (err: any) {
        console.warn('[facultyService] Unexpected error querying assessments activities:', err?.message);
        return { data: [] };
      }
    })(),
    (async () => {
      if (!assignmentIds.length) return { data: [] };
      try {
        const res = await (supabase as any)
          .from('assignment_submissions')
          .select('id, marks, graded_at, status, submitted_at, assignments(title, course_name)')
          .in('assignment_id', assignmentIds)
          .order('submitted_at', { ascending: false })
          .limit(5);
        if (res.error) {
          console.warn('[facultyService] Error querying submissions activities:', res.error.message);
          return { data: [] };
        }
        return res;
      } catch (err: any) {
        console.warn('[facultyService] Unexpected error querying submissions activities:', err?.message);
        return { data: [] };
      }
    })(),
    (async () => {
      try {
        const res = await (supabase as any)
          .from('announcements')
          .select('id, title, created_at')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        if (res.error) {
          console.warn('[facultyService] Error querying announcements activities:', res.error.message);
          return { data: [] };
        }
        return res;
      } catch (err: any) {
        console.warn('[facultyService] Unexpected error querying announcements activities:', err?.message);
        return { data: [] };
      }
    })()
  ]);

  const rawActivities: Array<{
    id: string;
    isoDate: string;
    description: string;
    category: 'Assignment' | 'Attendance' | 'Evaluation' | 'System';
  }> = [];

  const seenIds = new Set<string>();

  for (const asgn of recentAssignmentsRes.data || []) {
    if (asgn.created_at && !seenIds.has(`asgn-${asgn.id}`)) {
      seenIds.add(`asgn-${asgn.id}`);
      rawActivities.push({
        id: `asgn-${asgn.id}`,
        isoDate: asgn.created_at,
        description: `Created assignment "${asgn.title}" for ${asgn.course_name || 'assigned course'}`,
        category: 'Assignment',
      });
    }
  }

  for (const att of recentAttendanceRes.data || []) {
    if (att.created_at && !seenIds.has(`att-${att.id}`)) {
      seenIds.add(`att-${att.id}`);
      rawActivities.push({
        id: `att-${att.id}`,
        isoDate: att.created_at,
        description: `Recorded attendance for ${att.course_name} (${att.present_count || 0}/${att.total_students || 0} present)`,
        category: 'Attendance',
      });
    }
  }

  for (const asmt of recentAssessmentsRes.data || []) {
    if (asmt.created_at && !seenIds.has(`asmt-${asmt.id}`)) {
      seenIds.add(`asmt-${asmt.id}`);
      rawActivities.push({
        id: `asmt-${asmt.id}`,
        isoDate: asmt.created_at,
        description: `Scheduled assessment "${asmt.title}" for ${asmt.course_name || 'assigned course'}`,
        category: 'Evaluation',
      });
    }
  }

  for (const sub of recentGradedRes.data || []) {
    const asgnObj = Array.isArray(sub.assignments) ? sub.assignments[0] : sub.assignments;
    const asgnTitle = asgnObj?.title || 'coursework';
    if (sub.status === 'Graded' && sub.graded_at && !seenIds.has(`sub-graded-${sub.id}`)) {
      seenIds.add(`sub-graded-${sub.id}`);
      rawActivities.push({
        id: `sub-graded-${sub.id}`,
        isoDate: sub.graded_at,
        description: `Evaluated submission for "${asgnTitle}" (${sub.marks ?? 0} marks awarded)`,
        category: 'Evaluation',
      });
    } else if (sub.submitted_at && !seenIds.has(`sub-received-${sub.id}`)) {
      seenIds.add(`sub-received-${sub.id}`);
      rawActivities.push({
        id: `sub-received-${sub.id}`,
        isoDate: sub.submitted_at,
        description: `Received student submission for "${asgnTitle}"`,
        category: 'Assignment',
      });
    }
  }

  for (const ann of recentAnnouncementsRes.data || []) {
    if (ann.created_at && !seenIds.has(`ann-${ann.id}`)) {
      seenIds.add(`ann-${ann.id}`);
      rawActivities.push({
        id: `ann-${ann.id}`,
        isoDate: ann.created_at,
        description: `Published announcement: "${ann.title}"`,
        category: 'System',
      });
    }
  }

  const recentActivities: FacultyActivityItem[] = rawActivities
    .sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime())
    .slice(0, 8)
    .map((item) => {
      const { day, timestamp } = formatFacultyActivityDay(item.isoDate);
      return {
        id: item.id,
        timestamp,
        day,
        description: item.description,
        category: item.category,
      };
    });

  return {
    profile,
    stats: {
      myCoursesCount: courses.length,
      studentsCount: studentIds.length,
      todaysClassesCount: todayClasses.length,
      pendingEvaluationsCount: pendingWork.reduce((total, item) => total + item.pendingCount, 0),
      activeAssignmentsCount: assignments.filter((assignment: any) => !['Completed', 'Closed'].includes(assignment.status)).length,
      attendanceAlertsCount: studentAlerts.length,
    },
    todaysClasses: todayClasses,
    pendingWork,
    studentAlerts,
    recentActivities,
  };
};

/**
 * Helper to calculate relative calendar day and formatted time for faculty activity log
 */
export function formatFacultyActivityDay(isoDateStr: string, now: Date = new Date()): {
  day: 'Today' | 'Yesterday' | 'Earlier';
  timestamp: string;
} {
  const date = new Date(isoDateStr);
  const timestamp = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffTime = nowDate.getTime() - targetDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let day: 'Today' | 'Yesterday' | 'Earlier' = 'Earlier';
  if (diffDays <= 0) {
    day = 'Today';
  } else if (diffDays === 1) {
    day = 'Yesterday';
  }

  return { day, timestamp };
}
