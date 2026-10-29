import React, { useEffect, useState, useCallback } from 'react';
import { Clock, CalendarCheck, AlertCircle, BookOpen } from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../app/context/AuthContext';
import {
  getFacultyTimetable,
  subscribeToTimetable,
  type TimetableEntry,
} from '../../services/timetableService';
import { TimetableCalendar } from '../../components/TimetableCalendar';

export const FacultyTimetablePage: React.FC = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<TimetableEntry[]>([]);

  const loadTimetable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!user) {
        setSchedule([]);
        setLoading(false);
        return;
      }

      // Security: derive target faculty identity strictly from authenticated Supabase session
      const entries = await getFacultyTimetable(user.id);
      setSchedule(entries);
    } catch (err: unknown) {
      console.error('[FacultyTimetablePage] load error:', err);
      setError('Unable to load your teaching timetable. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTimetable();
  }, [loadTimetable]);

  // Real-time subscription to timetable changes
  useEffect(() => {
    const unsubscribe = subscribeToTimetable(() => {
      loadTimetable();
    });
    return () => {
      unsubscribe();
    };
  }, [loadTimetable]);

  const uniqueCoursesCount = new Set(schedule.map(e => e.course_code || e.course_id)).size;
  const labSessionsCount = schedule.filter(e => e.is_lab).length;

  return (
    <FacultyAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">FACULTY ACADEMICS</span>
          <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Faculty Class Schedule & Timetable
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>
            Interactive teaching timetable, lecture slots, and lab locations for {profile?.full_name || 'Faculty'}
          </p>
        </div>
      </div>

      {/* Summary Stat Badges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card-box" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.6rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '8px' }}>
            <CalendarCheck size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Weekly Class Slots</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{schedule.length} Sessions</h3>
          </div>
        </div>

        <div className="card-box" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.6rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '8px' }}>
            <BookOpen size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Teaching Courses</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{uniqueCoursesCount} Courses</h3>
          </div>
        </div>

        <div className="card-box" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.6rem', backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', borderRadius: '8px' }}>
            <Clock size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Practical / Labs</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{labSessionsCount} Labs</h3>
          </div>
        </div>
      </div>

      {loading && schedule.length === 0 ? (
        <LoadingState message="Loading your teaching timetable..." />
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={16} color="var(--brand-danger)" />
          <span style={{ fontSize: '0.875rem', color: 'var(--brand-danger)' }}>{error}</span>
        </div>
      ) : schedule.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No Timetable Slots Assigned"
          description="You currently have no class slots assigned in the timetable. Please check back later or contact your HOD / Department Coordinator."
        />
      ) : (
        <TimetableCalendar
          entries={schedule}
          role="FACULTY"
          currentUserId={user?.id}
          canManage={false}
          emptyMessage="No teaching sessions scheduled for this period."
        />
      )}
    </FacultyAppShell>
  );
};

export default FacultyTimetablePage;
