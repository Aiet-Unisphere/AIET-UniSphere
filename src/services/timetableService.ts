/**
 * Real Timetable Service — reads from public.timetable_entries table
 */
import { supabase } from '../lib/supabase';

export interface TimetableEntry {
  id: string;
  department_id: string;
  course_id: string;
  course_name: string;
  course_code?: string | null;
  faculty_id?: string | null;
  faculty_name?: string | null;
  semester: number;
  section?: string | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room?: string | null;
  is_lab?: boolean;
  academic_year?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimetableConflict {
  type: 'faculty' | 'room' | 'section';
  entries: TimetableEntry[];
  description: string;
}

export const getDepartmentTimetable = async (
  departmentId?: string,
  semester?: number,
  section?: string
): Promise<TimetableEntry[]> => {
  let query = supabase
    .from('timetable_entries')
    .select('*')
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (departmentId) query = query.eq('department_id', departmentId);
  if (semester) query = query.eq('semester', semester);
  if (section) query = query.eq('section', section);

  const { data, error } = await query;
  if (error) {
    console.error('[timetableService] getDepartmentTimetable error:', error.message);
    return [];
  }
  return (data || []) as TimetableEntry[];
};

export const getStudentTimetable = async (
  semester?: number,
  section?: string
): Promise<TimetableEntry[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('department_id')
    .eq('id', user.id)
    .maybeSingle();

  return getDepartmentTimetable(profile?.department_id || undefined, semester, section);
};

export const getFacultyTimetable = async (facultyIdOverride?: string): Promise<TimetableEntry[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const targetFacultyId = facultyIdOverride || user.id;

  // 1. Fetch entries strictly assigned to this faculty member (faculty_id = targetFacultyId)
  const { data: directEntries, error } = await supabase
    .from('timetable_entries')
    .select('*')
    .eq('faculty_id', targetFacultyId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[timetableService] getFacultyTimetable error:', error.message);
  }

  const entries: TimetableEntry[] = ((directEntries || []) as TimetableEntry[]);
  const seenIds = new Set(entries.map(e => e.id));

  // 2. Role-scoped access: Only HOD and ADMIN are authorized for broader department/institutional access
  try {
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('department_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.department_id) {
      if (profile.role === 'HOD') {
        // HOD can view all entries for their assigned department
        const { data: deptEntries } = await supabase
          .from('timetable_entries')
          .select('*')
          .eq('department_id', profile.department_id)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true });

        if (deptEntries && deptEntries.length > 0) {
          for (const de of deptEntries as TimetableEntry[]) {
            if (!seenIds.has(de.id)) {
              entries.push(de);
              seenIds.add(de.id);
            }
          }
        }
      } else if (profile.role === 'ADMIN') {
        // ADMIN has institutional timetable visibility
        const { data: adminEntries } = await supabase
          .from('timetable_entries')
          .select('*')
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true });

        if (adminEntries && adminEntries.length > 0) {
          for (const ae of adminEntries as TimetableEntry[]) {
            if (!seenIds.has(ae.id)) {
              entries.push(ae);
              seenIds.add(ae.id);
            }
          }
        }
      }
      // For regular FACULTY: strictly direct assignments only. No name-based matching or department leakage.
    }
  } catch (err: any) {
    console.warn('[timetableService] Role-scoped timetable query skipped:', err?.message);
  }

  return entries;
};

export const CANONICAL_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const;

export type CanonicalWeekday = (typeof CANONICAL_WEEKDAYS)[number];

/**
 * Normalizes day string (e.g., 'wed', 'WEDNESDAY', 'Wednesday') to Title Case canonical weekday.
 */
export const normalizeWeekday = (dayStr: string): CanonicalWeekday | string => {
  if (!dayStr) return '';
  const trimmed = dayStr.trim().toLowerCase();
  for (const day of CANONICAL_WEEKDAYS) {
    const dayLower = day.toLowerCase();
    if (dayLower === trimmed || dayLower.startsWith(trimmed) || trimmed.startsWith(dayLower.slice(0, 3))) {
      return day;
    }
  }
  return dayStr.trim();
};

/**
 * Calculates a YYYY-MM-DD date string for a given target weekday within the same week (Monday-Sunday)
 * relative to the given reference date (YYYY-MM-DD).
 */
export const getDateForWeekdayInWeek = (targetWeekday: string, refDateStr: string): string => {
  const normTarget = normalizeWeekday(targetWeekday);
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const targetIndex = weekdays.indexOf(normTarget);
  if (targetIndex === -1) return refDateStr;

  const parts = refDateStr.trim().split('-');
  if (parts.length !== 3) return refDateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const refDate = new Date(Date.UTC(year, month, day, 12, 0, 0));

  // In JS Date, getUTCDay() gives 0 for Sunday, 1 for Monday, ..., 6 for Saturday.
  const jsDay = refDate.getUTCDay();
  // Map to 0 for Monday ... 6 for Sunday
  const refIndex = jsDay === 0 ? 6 : jsDay - 1;

  const dayDiff = targetIndex - refIndex;
  const targetDate = new Date(refDate.getTime() + dayDiff * 24 * 60 * 60 * 1000);
  
  return targetDate.toISOString().slice(0, 10);
};

/**
 * Normalizes date to institutional timezone (Asia/Kolkata) weekday name.
 * Handles Date objects and YYYY-MM-DD string inputs deterministically without UTC date shifting.
 */
export const getDayOfWeekIST = (dateInput: string | Date): string => {
  let targetDate: Date;
  if (typeof dateInput === 'string') {
    // If format is YYYY-MM-DD, parse year, month, day directly to avoid midnight UTC shift
    const parts = dateInput.trim().split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      // Construct UTC date centered at midday to be immune to timezone boundary wrap
      targetDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
    } else {
      targetDate = new Date(dateInput);
    }
  } else {
    targetDate = dateInput;
  }

  const rawDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  }).format(targetDate);

  return normalizeWeekday(rawDay);
};

export type TimetableMismatchReason =
  | 'NO_FACULTY_ENTRIES'
  | 'COURSE_NOT_IN_TIMETABLE'
  | 'NO_SESSION_ON_DAY'
  | 'SECTION_SEMESTER_MISMATCH'
  | null;

export interface TimetableResolutionResult {
  matchingSessions: TimetableEntry[];
  dayOfWeek: string;
  allCourseSessions: TimetableEntry[];
  scheduledDaysForCourse: string[];
  reasonIfNotMatched: TimetableMismatchReason;
  detailedMessage: string;
}

export interface ResolveScheduledSessionsParams {
  date: string | Date;
  courseIdentifier?: string;
  section?: string | null;
  semester?: number | null;
  facultyIdOverride?: string;
  preloadedEntries?: TimetableEntry[];
}

/**
 * Authoritative shared timetable resolution function for both Attendance and Timetable modules.
 * Resolves assigned sessions, course matching, weekday scheduling, and section/semester alignment.
 */
export const resolveScheduledSessions = async (
  params: ResolveScheduledSessionsParams
): Promise<TimetableResolutionResult> => {
  const {
    date,
    courseIdentifier,
    section,
    semester,
    facultyIdOverride,
    preloadedEntries
  } = params;

  const entries: TimetableEntry[] = preloadedEntries !== undefined
    ? preloadedEntries
    : await getFacultyTimetable(facultyIdOverride);

  const dayOfWeek = getDayOfWeekIST(date);
  const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

  // 1. Check if any timetable entries exist for this faculty
  if (!entries || entries.length === 0) {
    return {
      matchingSessions: [],
      dayOfWeek,
      allCourseSessions: [],
      scheduledDaysForCourse: [],
      reasonIfNotMatched: 'NO_FACULTY_ENTRIES',
      detailedMessage: 'No institutional timetable entries are assigned to your faculty profile in the database.'
    };
  }

  // 2. Filter by course identifier if provided
  let allCourseSessions: TimetableEntry[] = entries;
  let cleanCode = '';

  if (courseIdentifier && courseIdentifier.trim() !== '') {
    const rawTrimmed = courseIdentifier.trim();
    const parenMatch = rawTrimmed.match(/\(([^)]+)\)/);
    cleanCode = (parenMatch ? parenMatch[1].trim() : (rawTrimmed.split(' ')[0] || rawTrimmed)).trim().toLowerCase();
    const cleanName = (parenMatch ? rawTrimmed.slice(0, parenMatch.index).trim() : rawTrimmed).toLowerCase();
    const rawLower = rawTrimmed.toLowerCase();
    const normClean = cleanCode.replace(/[^a-z0-9]/g, '');
    const normName = cleanName.replace(/[^a-z0-9]/g, '');

    allCourseSessions = entries.filter(e => {
      const eCode = (e.course_code || '').trim().toLowerCase();
      const eId = (e.course_id || '').trim().toLowerCase();
      const eName = (e.course_name || '').trim().toLowerCase();
      const normECode = eCode.replace(/[^a-z0-9]/g, '');
      const normEId = eId.replace(/[^a-z0-9]/g, '');
      const normEName = eName.replace(/[^a-z0-9]/g, '');

      return (
        eCode === cleanCode ||
        eId === cleanCode ||
        eCode === rawLower ||
        eId === rawLower ||
        (normClean && normECode === normClean) ||
        (normClean && normEId === normClean) ||
        (normClean.length >= 3 && normECode.includes(normClean)) ||
        (normClean.length >= 3 && normEId.includes(normClean)) ||
        (normName.length >= 3 && normEName.includes(normName)) ||
        (cleanCode.length >= 3 && eCode.includes(cleanCode)) ||
        (cleanCode.length >= 3 && eId.includes(cleanCode)) ||
        (cleanName.length >= 3 && eName.includes(cleanName))
      );
    });

    if (allCourseSessions.length === 0) {
      return {
        matchingSessions: [],
        dayOfWeek,
        allCourseSessions: [],
        scheduledDaysForCourse: [],
        reasonIfNotMatched: 'COURSE_NOT_IN_TIMETABLE',
        detailedMessage: `No timetable entries found for course "${cleanCode.toUpperCase()}" assigned to your faculty profile in the database. Please ensure your Department HOD or Admin has scheduled this course and assigned your faculty account as the instructor in the HOD Timetable Management portal.`
      };
    }
  }

  // 3. Determine all days this course meets
  const scheduledDaysForCourse = Array.from(
    new Set(allCourseSessions.map(e => normalizeWeekday(e.day_of_week)).filter(Boolean))
  );

  // 4. Filter sessions for the target day of week
  const daySessions = allCourseSessions.filter(
    e => normalizeWeekday(e.day_of_week) === dayOfWeek
  );

  if (daySessions.length === 0) {
    const daysListStr = scheduledDaysForCourse.length > 0
      ? scheduledDaysForCourse.join(', ')
      : 'other days';
    const displayCode = cleanCode ? cleanCode.toUpperCase() : 'This course';
    return {
      matchingSessions: [],
      dayOfWeek,
      allCourseSessions,
      scheduledDaysForCourse,
      reasonIfNotMatched: 'NO_SESSION_ON_DAY',
      detailedMessage: `${displayCode} is scheduled on [${daysListStr}], but has no periods scheduled on ${dayOfWeek} (${dateStr}).`
    };
  }

  // 5. Filter by section if specified
  let filtered = daySessions;
  if (section && section.trim() !== '') {
    const cleanSec = section.trim().toLowerCase();
    const secMatched = filtered.filter(e => (e.section || '').trim().toLowerCase() === cleanSec);
    if (secMatched.length > 0) {
      filtered = secMatched;
    } else {
      const availableSecs = Array.from(new Set(daySessions.map(s => s.section || 'All'))).join(', ');
      return {
        matchingSessions: [],
        dayOfWeek,
        allCourseSessions,
        scheduledDaysForCourse,
        reasonIfNotMatched: 'SECTION_SEMESTER_MISMATCH',
        detailedMessage: `${cleanCode ? cleanCode.toUpperCase() : 'This course'} is scheduled on ${dayOfWeek}, but for Section(s) [${availableSecs}] rather than Section ${section.trim()}.`
      };
    }
  }

  // 6. Filter by semester if specified
  if (semester != null && semester !== ('' as any)) {
    const numSem = Number(semester);
    const semMatched = filtered.filter(e => e.semester === numSem);
    if (semMatched.length > 0) {
      filtered = semMatched;
    } else {
      const availableSems = Array.from(new Set(daySessions.map(s => `Sem ${s.semester}`))).join(', ');
      return {
        matchingSessions: [],
        dayOfWeek,
        allCourseSessions,
        scheduledDaysForCourse,
        reasonIfNotMatched: 'SECTION_SEMESTER_MISMATCH',
        detailedMessage: `${cleanCode ? cleanCode.toUpperCase() : 'This course'} is scheduled on ${dayOfWeek}, but for [${availableSems}] rather than Semester ${numSem}.`
      };
    }
  }

  return {
    matchingSessions: filtered,
    dayOfWeek,
    allCourseSessions,
    scheduledDaysForCourse,
    reasonIfNotMatched: null,
    detailedMessage: `Found ${filtered.length} scheduled session(s) on ${dayOfWeek}.`
  };
};

/**
 * Retrieves scheduled timetable sessions for a faculty member filtered by date, course, section, and semester.
 * Delegates to the unified resolveScheduledSessions for consistency.
 */
export const getScheduledSessionsForDate = async (
  dateString: string,
  courseIdentifier?: string,
  section?: string | null,
  semester?: number | null,
  facultyIdOverride?: string
): Promise<TimetableEntry[]> => {
  const result = await resolveScheduledSessions({
    date: dateString,
    courseIdentifier,
    section,
    semester,
    facultyIdOverride
  });
  return result.matchingSessions;
};

export const getTodaysTimetable = async (): Promise<TimetableEntry[]> => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = days[new Date().getDay()];

  const { data, error } = await supabase
    .from('timetable_entries')
    .select('*')
    .eq('day_of_week', today)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[timetableService] getTodaysTimetable error:', error.message);
    return [];
  }
  return (data || []) as TimetableEntry[];
};

export const createTimetableEntry = async (
  entry: Omit<TimetableEntry, 'id' | 'created_at' | 'updated_at'>
): Promise<TimetableEntry> => {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await (supabase as any)
    .from('timetable_entries')
    .insert({ ...entry, created_by: user?.id })
    .select()
    .single();

  if (error) throw new Error(`Failed to create timetable entry: ${error.message}`);
  return data as TimetableEntry;
};

export const updateTimetableEntry = async (
  id: string,
  updates: Partial<TimetableEntry>
): Promise<TimetableEntry> => {
  const { data, error } = await (supabase as any)
    .from('timetable_entries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update timetable entry: ${error.message}`);
  return data as TimetableEntry;
};

export const deleteTimetableEntry = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('timetable_entries')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete timetable entry: ${error.message}`);
};

export const detectTimetableConflicts = (entries: TimetableEntry[]): TimetableConflict[] => {
  const conflicts: TimetableConflict[] = [];

  const timesOverlap = (start1: string, end1: string, start2: string, end2: string): boolean => {
    return start1 < end2 && start2 < end1;
  };

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      if (a.day_of_week !== b.day_of_week) continue;
      if (!timesOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) continue;

      // Faculty double booking
      if (a.faculty_id && b.faculty_id && a.faculty_id === b.faculty_id) {
        conflicts.push({
          type: 'faculty',
          entries: [a, b],
          description: `${a.faculty_name || 'Faculty'} is scheduled for two classes at the same time on ${a.day_of_week}`,
        });
      }

      // Room double booking
      if (a.room && b.room && a.room === b.room) {
        conflicts.push({
          type: 'room',
          entries: [a, b],
          description: `Room ${a.room} is double-booked on ${a.day_of_week}`,
        });
      }

      // Section double booking
      if (a.semester === b.semester && a.section && b.section && a.section === b.section) {
        conflicts.push({
          type: 'section',
          entries: [a, b],
          description: `Semester ${a.semester} Section ${a.section} has overlapping classes on ${a.day_of_week}`,
        });
      }
    }
  }

  return conflicts;
};

export const subscribeToTimetable = (onUpdate: () => void): (() => void) => {
  try {
    const channel = (supabase as any)
      .channel('public:timetable_entries_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timetable_entries' },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      (supabase as any).removeChannel(channel);
    };
  } catch (err) {
    console.error('Failed to setup timetable realtime subscription:', err);
    return () => {};
  }
};
