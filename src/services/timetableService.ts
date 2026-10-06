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

  const { data, error } = await supabase
    .from('timetable_entries')
    .select('*')
    .eq('faculty_id', targetFacultyId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[timetableService] getFacultyTimetable error:', error.message);
    return [];
  }
  return (data || []) as TimetableEntry[];
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
