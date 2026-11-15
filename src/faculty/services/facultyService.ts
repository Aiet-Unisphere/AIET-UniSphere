import { supabase } from '../../lib/supabase';
import { getFacultyCourses } from '../../services/courseService';
import { getFacultyAssignments } from '../../services/assignmentService';
import type { ExtendedAssignment } from '../../services/assignmentService';
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
    
    // Robust profile lookup with graceful fallback
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, email, designation, department:departments(name)')
      .eq('id', user.id)
      .maybeSingle();

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
      name: data.full_name || user.email?.split('@')[0] || 'Faculty Member',
      title: data.designation || 'Designation not specified',
      department: data.department?.name || 'Department not assigned',
      email: user.email || '',
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
  
  // 1. Fetch courses assigned to faculty (from timetable, enrollments, attendance, or department)
  let courses: any[] = [];
  try {
    courses = await getFacultyCourses();
  } catch (err: any) {
    console.warn('[facultyService] getFacultyCourses error fallback:', err?.message);
  }

  const courseIds = courses.map((c: any) => c.id).filter(Boolean);
  const courseCodes = courses.map((c: any) => c.code).filter(Boolean);

  // 2. Resolve distinct unique students taught across all allocated courses using canonical studentStatisticsService
  let studentsCount = 0;
  let studentIds: string[] = [];
  if (courses.length > 0) {
    try {
      const { getFacultyUniqueStudentMetrics } = await import('../../services/studentStatisticsService');
      const stats = await getFacultyUniqueStudentMetrics(user.id, courses);
      studentsCount = stats.uniqueStudentsCount;
      studentIds = stats.uniqueStudentIds || [];
    } catch (err: any) {
      console.warn('[facultyService] getFacultyUniqueStudentMetrics error:', err?.message);
    }
  }

  // 3. Institutional Timetable & Today's Classes using Asia/Kolkata (IST, UTC+5:30)
  const todayNameIST = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  }).format(new Date());

  const currentTimeIST = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());

  // 4. Fetch assignments, timetable, and attendance alerts concurrently
  const [facultyAssignments, timetableRes, attendanceRes] = await Promise.all([
    (async (): Promise<ExtendedAssignment[]> => {
      try {
        return await getFacultyAssignments();
      } catch (err: any) {
        console.warn('[facultyService] getFacultyAssignments error:', err?.message);
        return [];
      }
    })(),
    (async () => {
      try {
        const res = await (supabase as any)
          .from('timetable_entries')
          .select('*')
          .eq('faculty_id', user.id)
          .ilike('day_of_week', todayNameIST)
          .order('start_time', { ascending: true });
        return res.error ? { data: [] } : res;
      } catch (err: any) {
        console.warn('[facultyService] timetable query error:', err?.message);
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
      } catch (err: any) {
        console.warn('[facultyService] student_analytics_view query error:', err?.message);
        return { data: [] };
      }
    })()
  ]);

  // Derive today's classes
  const todayClasses: TodayClass[] = (timetableRes.data || []).map((entry: any) => {
    const status = currentTimeIST < entry.start_time ? 'Upcoming' : currentTimeIST <= entry.end_time ? 'Current' : 'Completed';
    return {
      id: entry.id,
      time: `${entry.start_time} - ${entry.end_time}`,
      courseCode: entry.course_code || entry.course_id,
      courseName: entry.course_name,
      department: profile.department,
      semester: Number(entry.semester || 0),
      room: entry.room || 'Not assigned',
      status,
    };
  });

  // Calculate pending evaluations and active assignments from authoritative faculty assignments
  const pendingWork: PendingWorkItem[] = facultyAssignments
    .filter((a) => {
      // Submission counts with pending grading
      const hasPending = (a as any).submittedCount !== undefined
        ? ((a as any).effectiveStatus === 'Pending' || ((a as any).submittedCount > 0 && a.status === 'Submitted'))
        : false;
      return hasPending;
    })
    .map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      courseName: assignment.courseName,
      pendingCount: (assignment as any).submittedCount || 1,
      type: 'assignment' as const,
      link: `/faculty/assignments/${assignment.id}`,
    }));

  // Direct check for pending submissions across faculty assignments
  let totalPendingSubmissions = 0;
  const assignmentIds = facultyAssignments.map((a) => a.id);
  if (assignmentIds.length > 0) {
    try {
      const { data: subsData } = await (supabase as any)
        .from('assignment_submissions')
        .select('assignment_id, status')
        .in('assignment_id', assignmentIds)
        .eq('status', 'Submitted');
      
      if (subsData) {
        totalPendingSubmissions = subsData.length;
        const pendingMap = new Map<string, number>();
        for (const sub of subsData) {
          pendingMap.set(sub.assignment_id, (pendingMap.get(sub.assignment_id) || 0) + 1);
        }

        // Re-align pendingWork with exact submission counts
        pendingWork.length = 0;
        for (const asgn of facultyAssignments) {
          const count = pendingMap.get(asgn.id) || 0;
          if (count > 0) {
            pendingWork.push({
              id: asgn.id,
              title: asgn.title,
              courseName: asgn.courseName,
              pendingCount: count,
              type: 'assignment',
              link: `/faculty/assignments/${asgn.id}`,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[facultyService] assignment_submissions count error:', err?.message);
    }
  }

  const activeAssignmentsCount = facultyAssignments.filter(
    (a) => a.effectiveStatus === 'Active' || a.effectiveStatus === 'Pending'
  ).length;

  // Process genuine attendance alerts (< 75% attendance with conducted sessions > 0)
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
        .select('id, full_name, usn_or_employee_id')
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
      studentName: student.full_name || 'Student',
      usn: student.usn_or_employee_id || 'Not recorded',
      type: 'Low Attendance',
      details: totalSessions > 0
        ? `Attendance at ${percentage}% (${presentCount}/${totalSessions} sessions conducted). Below institutional 75% threshold.`
        : 'Attendance is below institutional 75% threshold.',
      value: `${percentage}%`,
      severity: percentage < 60 ? 'high' : 'medium',
    };
  });

  // Fetch recent activities for this faculty member
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
        return res.error ? { data: [] } : res;
      } catch {
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
        return res.error ? { data: [] } : res;
      } catch {
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
        return res.error ? { data: [] } : res;
      } catch {
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
        return res.error ? { data: [] } : res;
      } catch {
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
        return res.error ? { data: [] } : res;
      } catch {
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
      studentsCount,
      todaysClassesCount: todayClasses.length,
      pendingEvaluationsCount: totalPendingSubmissions,
      activeAssignmentsCount,
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
