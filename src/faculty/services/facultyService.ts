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
      .select('id, full_name, email, department:departments(name)')
      .eq('id', user.id)
      .single();
    if (error || !data) {
      return {
        id: user.id,
        name: user.email?.split('@')[0] || 'Faculty Member',
        title: 'Faculty Member',
        department: 'Department not assigned',
        email: user.email || '',
        office: 'Not recorded',
        academicYear: 'Not set',
      };
    }
    return {
      id: data.id,
      name: data.full_name || data.email,
      title: data.designation || 'Faculty Member',
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
      title: 'Faculty Member',
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
          .select('student_id, attendance_percentage')
          .in('student_id', studentIds)
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

  const lowAttendanceRows = attendanceRes.data || [];
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

  const attendanceByStudent = new Map<string, number>(lowAttendanceRows.map((row: any) => [row.student_id, Number(row.attendance_percentage)]));
  const studentAlerts: StudentAlertItem[] = (lowAttendanceProfiles || []).map((student: any) => {
    const percentage = attendanceByStudent.get(student.id) || 0;
    return {
      id: student.id,
      studentName: student.full_name || student.email,
      usn: student.usn_or_employee_id || 'Not recorded',
      type: 'Low Attendance',
      details: 'Attendance is below the institutional 75% threshold.',
      value: `${percentage}%`,
      severity: percentage < 60 ? 'high' : 'medium',
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
    recentActivities: [],
  };
};
