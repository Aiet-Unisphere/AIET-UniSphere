import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '../components/AppShell';
import { Clock, CalendarCheck, MapPin, AlertCircle, FlaskConical } from 'lucide-react';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../app/context/AuthContext';
import { getStudentProfile } from '../services/studentService';
import {
  getDepartmentTimetable,
  subscribeToTimetable,
  type TimetableEntry,
} from '../services/timetableService';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const dayColorMap: Record<string, string> = {
  Monday: '#3b82f6',
  Tuesday: '#8b5cf6',
  Wednesday: '#f59e0b',
  Thursday: '#10b981',
  Friday: '#ef4444',
  Saturday: '#ec4899',
};

export const TimetablePage: React.FC = () => {
  const { profile: authProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<TimetableEntry[]>([]);
  const [studentSemester, setStudentSemester] = useState<number | null>(null);
  const [studentSection, setStudentSection] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<string>(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    return DAYS.includes(today) ? today : 'Monday';
  });
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  const loadTimetable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profData = await getStudentProfile();
      const sem = profData?.semester ?? null;
      const sec = (profData as any)?.section ?? null;
      setStudentSemester(sem);
      setStudentSection(sec);

      if (!authProfile?.department_id) {
        setSchedule([]);
        setLoading(false);
        return;
      }

      const entries = await getDepartmentTimetable(
        authProfile.department_id,
        sem || undefined,
        sec || undefined
      );
      setSchedule(entries);
    } catch (err: unknown) {
      console.error('[TimetablePage] load error:', err);
      setError('Unable to load timetable. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [authProfile?.department_id]);

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

  return (
    <AppShell>
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Academics</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Timetable</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            {studentSemester ? `Semester ${studentSemester}${studentSection ? ` Section ${studentSection}` : ''} Timetable` : 'Class Timetable'}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Daily lecture schedules, lab locations, and faculty allocations
          </p>
        </div>

        {/* View mode toggle */}
        {schedule.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn ${viewMode === 'day' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              onClick={() => setViewMode('day')}
            >
              Day View
            </button>
            <button
              className={`btn ${viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              onClick={() => setViewMode('week')}
            >
              Week View
            </button>
          </div>
        )}
      </div>

      {loading && schedule.length === 0 ? (
        <LoadingState message="Loading your class timetable..." />
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={16} color="var(--brand-danger)" />
          <span style={{ fontSize: '0.875rem', color: 'var(--brand-danger)' }}>{error}</span>
        </div>
      ) : schedule.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No Timetable Configured"
          description={`No timetable has been configured for ${studentSemester ? `Semester ${studentSemester}` : 'your semester'}${studentSection ? ` Section ${studentSection}` : ''} yet. Please check back later or contact your department.`}
        />
      ) : viewMode === 'day' ? (
        <>
          {/* Day Selector */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {DAYS.map(day => (
              <button
                key={day}
                className={`btn ${activeDay === day ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  width: 'auto',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  opacity: activeDays.includes(day) ? 1 : 0.5,
                  borderLeft: activeDay === day ? `3px solid ${dayColorMap[day]}` : undefined,
                }}
                onClick={() => setActiveDay(day)}
              >
                {day.substring(0, 3)}
              </button>
            ))}
          </div>

          {/* Day Schedule */}
          <div className="card-box">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CalendarCheck size={18} className="text-orange-icon" />
              {activeDay} Schedule
            </h3>

            {filteredSchedule.length === 0 ? (
              <p style={{ color: 'var(--brand-dark-grey)', textAlign: 'center', padding: '2rem' }}>
                No classes scheduled for {activeDay}.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredSchedule.map((item) => (
                  <TimetableCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Week View */
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
                <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', textAlign: 'center', padding: '1rem' }}>
                  No classes scheduled
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(groupedByDay[day] || []).map((item) => (
                    <TimetableCard key={item.id} item={item} compact />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
};

interface TimetableCardProps {
  item: TimetableEntry;
  compact?: boolean;
}

const TimetableCard: React.FC<TimetableCardProps> = ({ item, compact = false }) => (
  <div className="timetable-row-card" style={{ opacity: item.is_lab ? 0.95 : 1 }}>
    <div className="time-badge font-mono" style={{ flexShrink: 0 }}>
      <Clock size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
      {item.start_time} – {item.end_time}
    </div>
    <div style={{ flexGrow: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h4 style={{ fontSize: compact ? '0.875rem' : '1rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0 }}>
          {item.course_code ? `${item.course_code} – ` : ''}{item.course_name}
        </h4>
        {item.is_lab && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', borderRadius: '0.25rem', padding: '0.1rem 0.35rem' }}>
            <FlaskConical size={10} />
            Lab
          </span>
        )}
      </div>
      {!compact && (
        <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', margin: '0.125rem 0 0' }}>
          {item.faculty_name ? `${item.faculty_name}` : 'Faculty TBD'}
        </p>
      )}
    </div>
    {item.room && (
      <div className="room-badge" style={{ flexShrink: 0 }}>
        <MapPin size={13} />
        {item.room}
      </div>
    )}
  </div>
);

export default TimetablePage;
