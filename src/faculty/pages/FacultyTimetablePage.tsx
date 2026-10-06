import React, { useEffect, useState, useCallback } from 'react';
import { Clock, CalendarCheck, MapPin, AlertCircle, FlaskConical, Filter, BookOpen } from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../app/context/AuthContext';
import {
  getFacultyTimetable,
  subscribeToTimetable,
  type TimetableEntry,
} from '../../services/timetableService';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const dayColorMap: Record<string, string> = {
  Monday: '#3b82f6',
  Tuesday: '#8b5cf6',
  Wednesday: '#f59e0b',
  Thursday: '#10b981',
  Friday: '#ef4444',
  Saturday: '#ec4899',
};

export const FacultyTimetablePage: React.FC = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<TimetableEntry[]>([]);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [activeDay, setActiveDay] = useState<typeof DAYS[number]>(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    return (DAYS.includes(today as any) ? today : 'Monday') as typeof DAYS[number];
  });

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

  const filteredSchedule = viewMode === 'day'
    ? schedule.filter(e => e.day_of_week === activeDay)
    : schedule;

  const groupedByDay: Record<string, TimetableEntry[]> = {};
  if (viewMode === 'week') {
    for (const day of DAYS) {
      groupedByDay[day] = schedule.filter(e => e.day_of_week === day);
    }
  }

  const activeDays = DAYS.filter(d => schedule.some(e => e.day_of_week === d));
  const uniqueCoursesCount = new Set(schedule.map(e => e.course_code || e.course_id)).size;
  const todaysClassesCount = schedule.filter(e => e.day_of_week === activeDay).length;

  return (
    <FacultyAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">FACULTY ACADEMICS</span>
          <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Faculty Class Schedule & Timetable
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>
            Assigned lecture sessions, lab allocations, and room assignments for {profile?.full_name || 'Faculty'}
          </p>
        </div>

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn ${viewMode === 'day' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: 'auto', padding: '0.45rem 1rem', fontSize: '0.85rem' }}
            onClick={() => setViewMode('day')}
          >
            Day View
          </button>
          <button
            className={`btn ${viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: 'auto', padding: '0.45rem 1rem', fontSize: '0.85rem' }}
            onClick={() => setViewMode('week')}
          >
            Weekly View
          </button>
        </div>
      </div>

      {/* Summary Stat Badges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card-box" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.6rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '8px' }}>
            <Clock size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Selected Day Sessions</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{todaysClassesCount} Sessions</h3>
          </div>
        </div>

        <div className="card-box" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.6rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '8px' }}>
            <CalendarCheck size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Total Weekly Sessions</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{schedule.length} Slots</h3>
          </div>
        </div>

        <div className="card-box" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.6rem', backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', borderRadius: '8px' }}>
            <BookOpen size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Assigned Courses</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{uniqueCoursesCount} Courses</h3>
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
      ) : viewMode === 'day' ? (
        <>
          {/* Day Selector Bar */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.825rem', color: 'var(--brand-dark-grey)', fontWeight: 700, marginRight: '0.5rem' }}>
              <Filter size={14} />
              <span>Select Day:</span>
            </div>
            {DAYS.map(day => (
              <button
                key={day}
                className={`btn ${activeDay === day ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  width: 'auto',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  opacity: activeDays.includes(day) ? 1 : 0.5,
                  borderLeft: activeDay === day ? `3px solid ${dayColorMap[day]}` : undefined,
                }}
                onClick={() => setActiveDay(day)}
              >
                {day}
              </button>
            ))}
          </div>

          {/* Day Schedule Panel */}
          <div className="card-box">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CalendarCheck size={18} className="text-orange-icon" />
              {activeDay}'s Assigned Classes
            </h3>

            {filteredSchedule.length === 0 ? (
              <p style={{ color: 'var(--brand-dark-grey)', textAlign: 'center', padding: '2.5rem', fontSize: '0.9rem' }}>
                No classes scheduled for {activeDay}.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredSchedule.map((item) => (
                  <FacultyTimetableCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Week View Grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {DAYS.map(day => (
            <div key={day} className="card-box">
              <h3 style={{
                fontSize: '1rem',
                fontWeight: 700,
                marginBottom: '1rem',
                color: dayColorMap[day],
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dayColorMap[day] }} />
                {day}
              </h3>
              {(groupedByDay[day] || []).length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', textAlign: 'center', padding: '1.5rem' }}>
                  No classes scheduled
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(groupedByDay[day] || []).map((item) => (
                    <FacultyTimetableCard key={item.id} item={item} compact />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </FacultyAppShell>
  );
};

interface FacultyTimetableCardProps {
  item: TimetableEntry;
  compact?: boolean;
}

const FacultyTimetableCard: React.FC<FacultyTimetableCardProps> = ({ item, compact = false }) => (
  <div className="timetable-row-card" style={{ opacity: item.is_lab ? 0.95 : 1 }}>
    <div className="time-badge font-mono" style={{ flexShrink: 0 }}>
      <Clock size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
      {item.start_time} – {item.end_time}
    </div>

    <div style={{ flexGrow: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className="badge badge-active font-mono text-blue">{item.course_code || item.course_id}</span>
        <span className="badge badge-graded font-mono">SEM {item.semester}{item.section ? ` (${item.section})` : ''}</span>
        {item.is_lab && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', borderRadius: '0.25rem', padding: '0.1rem 0.35rem', fontWeight: 600 }}>
            <FlaskConical size={11} />
            Lab Session
          </span>
        )}
      </div>

      <h4 style={{ fontSize: compact ? '0.875rem' : '1rem', fontWeight: 700, color: 'var(--brand-black)', margin: '0.25rem 0 0' }}>
        {item.course_name}
      </h4>
    </div>

    {item.room && (
      <div className="room-badge" style={{ flexShrink: 0 }}>
        <MapPin size={13} style={{ color: 'var(--brand-orange)' }} />
        {item.room}
      </div>
    )}
  </div>
);

export default FacultyTimetablePage;
