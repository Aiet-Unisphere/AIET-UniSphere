/**
 * AIET-UniSphere - Academic Context Builder & Intent Engine
 * Queries real database facts with strict user scoping and intent-aware minimum retrieval.
 */

import {
  UserContext,
  AcademicIntent,
  EnrolledCourseSummary,
  AssignmentSummary,
  AssessmentSummary,
  LearningGapSummary,
  TimetableEntrySummary,
  AnnouncementSummary,
  SkillSummary,
  LeaveRequestSummary,
  NotificationSummary,
} from "./types.ts";
import { retrieveInstitutionalKnowledge } from "./rag.ts";

/**
 * Classifies the incoming student/user query into an academic intent.
 */
export function classifyIntent(message: string, courseContext?: string): AcademicIntent {
  const text = message.toLowerCase();

  const isPersonalQuery = /\b(my|mine|i|am i|my attendance|my marks|my cgpa|my leave|my assignment|my result|my usn)\b/.test(text);
  const isInstitutionalQuery = /\b(vtu|rules?|regulations?|polic(y|ies)|criteria|requirement|eligibil(ity|le)|calendar|handbook|syllabus|exam rules?|examination rules?|internship policy|academic calendar|guidelines?)\b/.test(text);

  // Hybrid intent: combines personal facts with institutional policy comparison
  if (isPersonalQuery && isInstitutionalQuery) {
    return 'COMBINED_RAG';
  }

  if (/\b(quiz(zes)?|mcqs?|practice tests?|multiple choice|test me on|give me \d+ questions)\b/.test(text)) {
    return 'QUIZ';
  }
  if (/\b(study plans?|study schedules?|how (should|can) i study|what should i study|prepare for|revision schedules?)\b/.test(text)) {
    return 'STUDY_PLAN';
  }

  // Direct Institutional Knowledge / RAG query
  if (isInstitutionalQuery && !/\b(my attendance|my leave|my assignments?|my marks|my result|my profile)\b/.test(text)) {
    return 'INSTITUTIONAL_RAG';
  }

  if (/\b(attendances?|present|absent|shortages?|sessions? attended|bunk)\b/.test(text)) {
    return 'ATTENDANCE';
  }
  if (/\b(assignments?|homeworks?|submissions?|pending works?|deadlines?|due dates?)\b/.test(text)) {
    return 'ASSIGNMENT';
  }
  if (/\b(results?|marks?|scores?|grades?|cgpa|gpa|percentages?|ranks?)\b/.test(text)) {
    return 'RESULT';
  }
  if (/\b(assessments?|ia-1|ia-2|tests?|exams?|midterms?)\b/.test(text)) {
    return 'ASSESSMENT';
  }
  if (/\b(weak areas?|weakness(es)?|learning gaps?|lagging|topics? to improve|difficult topics?)\b/.test(text)) {
    return 'LEARNING_GAP';
  }
  if (/\b(timetables?|routines?|lectures?|class(es)? today|schedules? today|next class|rooms?)\b/.test(text)) {
    return 'TIMETABLE';
  }
  // Phase 1: Leave request intent
  if (/\b(leave|leaves|leave requests?|leave status|leave application|leave approval|leave pending|time off|sick leave|medical leave|personal leave|vacation|absence)\b/.test(text)) {
    return 'LEAVE';
  }
  // Phase 1: Notification intent
  if (/\b(notifications?|alerts?|updates?|messages?|inbox|unread|what.s new|any (news|messages|updates))\b/.test(text)) {
    return 'NOTIFICATION';
  }
  // Phase 1: Profile intent
  if (/\b(my profile|my details?|my info(rmation)?|my account|my usn|my semester|my cgpa|who am i|my name|my email|my department)\b/.test(text)) {
    return 'PROFILE';
  }
  if (/\b(announcements?|circulars?|notices?|news|updates? from (college|department|faculty))\b/.test(text)) {
    return 'ANNOUNCEMENT';
  }
  if (/\b(projects?|github|repos?|repositories|milestones?|capstones?)\b/.test(text)) {
    return 'PROJECT';
  }
  if (/\b(notes?|materials?|textbooks?|slides?|modules?)\b/.test(text)) {
    return 'MATERIAL';
  }
  if (courseContext && courseContext !== 'All Courses') {
    return 'COURSE';
  }

  return 'GENERAL_ACADEMIC';
}

/**
 * Builds authorized academic context for the authenticated user based on role and intent.
 */
export async function buildUserAcademicContext(
  userClient: any,
  user: { id: string; email?: string },
  profile: any,
  intent: AcademicIntent,
  courseFilter?: string,
  rawMessage?: string
): Promise<UserContext> {
  const role = profile.role || 'STUDENT';
  const deptName = profile?.departments?.name || undefined;
  const deptId = profile?.department_id;

  const baseContext: UserContext = {
    userId: user.id,
    role,
    fullName: profile.full_name || 'User',
    email: user.email || profile.email || '',
    departmentName: deptName,
    intent,
    courseFilter: courseFilter && courseFilter !== 'All Courses' ? courseFilter : undefined,
    usn: profile.usn_or_employee_id || undefined,
  };

  // -------------------------------------------------------------
  // STUDENT CONTEXT
  // -------------------------------------------------------------
  if (role === 'STUDENT') {
    // 1. Student Profile (Semester, CGPA)
    try {
      const { data: sp } = await userClient
        .from('student_profiles')
        .select('semester, cgpa')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (sp) {
        baseContext.semester = sp.semester || undefined;
        baseContext.cgpa = sp.cgpa !== null && sp.cgpa !== undefined ? Number(sp.cgpa) : undefined;
      }
    } catch (e) {
      console.warn("Could not fetch student_profiles:", e);
    }

    // 2. Enrolled Courses (Needed for almost all intents)
    try {
      let query = userClient
        .from('course_enrollments')
        .select('course_name, course_code, faculty_name, credits, semester')
        .eq('student_id', user.id)
        .eq('status', 'Active');

      if (baseContext.courseFilter) {
        query = query.ilike('course_name', `%${baseContext.courseFilter}%`);
      }

      const { data: enrollments } = await query.limit(10);
      if (enrollments && enrollments.length > 0) {
        baseContext.enrolledCourses = enrollments.map((e: any) => ({
          courseName: e.course_name,
          courseCode: e.course_code,
          facultyName: e.faculty_name,
          credits: e.credits,
          semester: e.semester,
        }));
      }
    } catch (e) {
      console.warn("Could not fetch course_enrollments:", e);
    }

    // 3. Attendance & High-Level Analytics (If Attendance, Study Plan, or General)
    if (intent === 'ATTENDANCE' || intent === 'STUDY_PLAN' || intent === 'GENERAL_ACADEMIC') {
      try {
        const { data: analytics } = await userClient
          .from('student_analytics_view')
          .select('attendance_percentage, total_sessions, present_count')
          .eq('student_id', user.id)
          .maybeSingle();

        if (analytics) {
          baseContext.attendancePercent = analytics.attendance_percentage !== null
            ? Number(analytics.attendance_percentage)
            : undefined;
          baseContext.totalSessionsHeld = analytics.total_sessions || 0;
          baseContext.totalSessionsAttended = analytics.present_count || 0;
        }
      } catch (e) {
        console.warn("Could not fetch student_analytics_view:", e);
      }
    }

    // 4. Assignments & Submissions (If Assignment, Study Plan, or General)
    if (intent === 'ASSIGNMENT' || intent === 'STUDY_PLAN' || intent === 'GENERAL_ACADEMIC') {
      try {
        if (deptId) {
          const { data: assignments } = await userClient
            .from('assignments')
            .select('id, title, course_name, deadline, marks')
            .eq('department_id', deptId)
            .gte('deadline', new Date().toISOString())
            .order('deadline', { ascending: true })
            .limit(5);

          if (assignments && assignments.length > 0) {
            // Check submission statuses for the student
            const assignmentIds = assignments.map((a: any) => a.id);
            const { data: submissions } = await userClient
              .from('assignment_submissions')
              .select('assignment_id, status, marks')
              .eq('student_id', user.id)
              .in('assignment_id', assignmentIds);

            const submittedMap = new Map((submissions || []).map((s: any) => [s.assignment_id, s]));

            baseContext.pendingAssignments = assignments
              .filter((a: any) => !submittedMap.has(a.id) || submittedMap.get(a.id)?.status !== 'Submitted')
              .map((a: any) => ({
                id: a.id,
                title: a.title,
                courseName: a.course_name,
                deadline: a.deadline,
                marks: a.marks,
                status: 'Pending',
              }));
          }
        }
      } catch (e) {
        console.warn("Could not fetch assignments:", e);
      }
    }

    // 5. Assessments & Results (If Assessment, Result, or Study Plan)
    if (intent === 'ASSESSMENT' || intent === 'RESULT' || intent === 'STUDY_PLAN') {
      try {
        if (deptId) {
          const { data: upcoming } = await userClient
            .from('assessments')
            .select('id, title, course_name, assessment_date, duration_minutes, total_marks, status')
            .eq('department_id', deptId)
            .gte('assessment_date', new Date().toISOString().split('T')[0])
            .order('assessment_date', { ascending: true })
            .limit(5);

          if (upcoming && upcoming.length > 0) {
            baseContext.upcomingAssessments = upcoming.map((a: any) => ({
              id: a.id,
              title: a.title,
              courseName: a.course_name,
              assessmentDate: a.assessment_date,
              durationMinutes: a.duration_minutes,
              totalMarks: a.total_marks,
              status: a.status,
            }));
          }
        }

        // Recent assessment results
        const { data: attempts } = await userClient
          .from('assessment_attempts')
          .select('assessment_id, score, total_marks, percentage, assessments(title, course_name)')
          .eq('student_id', user.id)
          .eq('status', 'Submitted')
          .order('submitted_at', { ascending: false })
          .limit(5);

        if (attempts && attempts.length > 0) {
          baseContext.recentAssessmentResults = attempts.map((att: any) => ({
            id: att.assessment_id,
            title: att.assessments?.title || 'Assessment',
            courseName: att.assessments?.course_name || 'Course',
            assessmentDate: '',
            durationMinutes: 0,
            totalMarks: att.total_marks,
            userScore: att.score,
            percentage: att.percentage,
            status: 'Completed',
          }));
        }
      } catch (e) {
        console.warn("Could not fetch assessments/results:", e);
      }
    }

    // 6. Learning Gaps (If Learning Gap, Study Plan, Quiz, or General)
    if (intent === 'LEARNING_GAP' || intent === 'STUDY_PLAN' || intent === 'QUIZ') {
      try {
        const { data: gaps } = await userClient
          .from('student_learning_gaps_view')
          .select('topic_name, course_name, topic_score_percent')
          .eq('student_id', user.id)
          .lt('topic_score_percent', 60)
          .limit(5);

        if (gaps && gaps.length > 0) {
          baseContext.learningGaps = gaps.map((g: any) => ({
            topic: g.topic_name,
            course: g.course_name,
            scorePercent: Number(g.topic_score_percent),
          }));
        }
      } catch (e) {
        console.warn("Could not fetch student_learning_gaps_view:", e);
      }
    }

    // 7. Timetable (If Timetable or Study Plan)
    if (intent === 'TIMETABLE' || intent === 'STUDY_PLAN') {
      try {
        if (deptId && baseContext.semester) {
          const { data: tt } = await userClient
            .from('timetable_entries')
            .select('day_of_week, start_time, end_time, course_name, room, is_lab')
            .eq('department_id', deptId)
            .eq('semester', baseContext.semester)
            .order('start_time', { ascending: true })
            .limit(15);

          if (tt && tt.length > 0) {
            baseContext.timetable = tt.map((item: any) => ({
              dayOfWeek: item.day_of_week,
              startTime: item.start_time,
              endTime: item.end_time,
              courseName: item.course_name,
              room: item.room,
              isLab: item.is_lab,
            }));
          }
        }
      } catch (e) {
        console.warn("Could not fetch timetable_entries:", e);
      }
    }

    // 8. Announcements (If Announcement, Notification, or General Academic)
    if (intent === 'ANNOUNCEMENT' || intent === 'GENERAL' || intent === 'NOTIFICATION' || intent === 'GENERAL_ACADEMIC') {
      try {
        if (deptId) {
          const { data: ann } = await userClient
            .from('announcements')
            .select('title, category, content, published_at')
            .eq('department_id', deptId)
            .eq('status', 'PUBLISHED')
            .order('published_at', { ascending: false })
            .limit(3);

          if (ann && ann.length > 0) {
            baseContext.announcements = ann.map((a: any) => ({
              title: a.title,
              category: a.category,
              content: a.content,
              publishedAt: a.published_at,
            }));
          }
        }
      } catch (e) {
        console.warn("Could not fetch announcements:", e);
      }
    }

    // 9. Skills & Achievements
    if (intent === 'GENERAL_ACADEMIC' || intent === 'STUDY_PLAN') {
      try {
        const { data: skills } = await userClient
          .from('student_skills')
          .select('name, category, level, level_percent')
          .eq('student_id', user.id)
          .limit(5);

        if (skills && skills.length > 0) {
          baseContext.skills = skills.map((s: any) => ({
            name: s.name,
            category: s.category,
            level: s.level,
            levelPercent: s.level_percent,
          }));
        }
      } catch (e) {
        console.warn("Could not fetch student_skills:", e);
      }
    }

    // ----------------------------------------------------------------
    // PHASE 1 ADDITIONS: Leave Requests & Notifications
    // All queries are scoped to auth.uid() — RLS enforces this at DB level.
    // ----------------------------------------------------------------

    // 10. Leave Requests (For LEAVE intent or GENERAL_ACADEMIC overview)
    if (intent === 'LEAVE' || intent === 'GENERAL_ACADEMIC') {
      try {
        const { data: leaves } = await userClient
          .from('leave_requests')
          .select('reference_id, leave_type, reason, start_date, end_date, status, created_at, rejection_reason')
          .eq('student_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (leaves && leaves.length > 0) {
          baseContext.leaveRequests = leaves.map((l: any) => ({
            referenceId: l.reference_id,
            leaveType: l.leave_type,
            reason: l.reason,
            startDate: l.start_date,
            endDate: l.end_date,
            status: l.status as 'PENDING' | 'APPROVED' | 'REJECTED',
            submittedAt: l.created_at,
            rejectionReason: l.rejection_reason || null,
          }));
        }
      } catch (e) {
        console.warn("Could not fetch leave_requests:", e);
      }
    }

    // 11. Recent Notifications (For NOTIFICATION intent or GENERAL_ACADEMIC overview)
    if (intent === 'NOTIFICATION' || intent === 'GENERAL_ACADEMIC') {
      try {
        const { data: notifs } = await userClient
          .from('notifications')
          .select('title, short_message, source, category, is_read, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8);

        if (notifs && notifs.length > 0) {
          baseContext.recentNotifications = notifs.map((n: any) => ({
            title: n.title,
            shortMessage: n.short_message,
            source: n.source || 'System',
            category: n.category || 'Academic',
            isRead: Boolean(n.is_read),
            createdAt: n.created_at,
          }));
        }
      } catch (e) {
        console.warn("Could not fetch notifications:", e);
      }
    }
  }

  // -------------------------------------------------------------
  // FACULTY CONTEXT
  // -------------------------------------------------------------
  if (role === 'FACULTY') {
    try {
      // Courses assigned to this faculty member
      const { data: enrollments } = await userClient
        .from('course_enrollments')
        .select('course_name')
        .eq('faculty_id', user.id)
        .limit(10);

      const uniqueCourses = [...new Set((enrollments || []).map((e: any) => e.course_name))];
      baseContext.teachingCourses = uniqueCourses as string[];

      // Teaching schedule
      const { data: schedule } = await userClient
        .from('timetable_entries')
        .select('day_of_week, start_time, end_time, course_name, room')
        .eq('faculty_id', user.id)
        .order('start_time', { ascending: true })
        .limit(10);

      if (schedule && schedule.length > 0) {
        baseContext.facultySchedule = schedule.map((s: any) => ({
          dayOfWeek: s.day_of_week,
          startTime: s.start_time,
          endTime: s.end_time,
          courseName: s.course_name,
          room: s.room,
        }));
      }
    } catch (e) {
      console.warn("Could not fetch faculty context:", e);
    }
  }

  // -------------------------------------------------------------
  // HOD CONTEXT
  // -------------------------------------------------------------
  if (role === 'HOD' && deptId) {
    try {
      const { count: studentCount } = await userClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', deptId)
        .eq('role', 'STUDENT');

      const { count: facultyCount } = await userClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', deptId)
        .eq('role', 'FACULTY');

      baseContext.departmentStudentCount = studentCount ?? 0;
      baseContext.departmentFacultyCount = facultyCount ?? 0;
    } catch (e) {
      console.warn("Could not fetch HOD context:", e);
    }
  }

  // -------------------------------------------------------------
  // ADMIN CONTEXT
  // -------------------------------------------------------------
  if (role === 'ADMIN') {
    baseContext.systemStatus = "Active - Full Administrative Privileges";
  }

  // -------------------------------------------------------------
  // PHASE 2: INSTITUTIONAL KNOWLEDGE RAG RETRIEVAL
  // Triggered for INSTITUTIONAL_RAG, COMBINED_RAG, MATERIAL, or GENERAL_ACADEMIC queries
  // -------------------------------------------------------------
  if (rawMessage && (intent === 'INSTITUTIONAL_RAG' || intent === 'COMBINED_RAG' || intent === 'MATERIAL' || intent === 'GENERAL_ACADEMIC')) {
    try {
      const ragResult = await retrieveInstitutionalKnowledge(userClient, rawMessage, {
        courseId: baseContext.courseFilter,
        matchThreshold: 0.65,
        matchCount: 4,
      });

      if (ragResult.success && ragResult.chunks.length > 0) {
        baseContext.ragChunks = ragResult.chunks.map(c => ({
          documentTitle: c.documentTitle,
          documentType: c.documentType,
          version: c.version,
          pageNumber: c.pageNumber,
          sectionTitle: c.sectionTitle,
          content: c.content,
        }));
        baseContext.citations = ragResult.citations;
      }
    } catch (e) {
      console.warn("Could not execute RAG retrieval:", e);
    }
  }

  return baseContext;
}
