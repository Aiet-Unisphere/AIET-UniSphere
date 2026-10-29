import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '../components/AppShell';
import { CalendarCheck, AlertCircle } from 'lucide-react';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../app/context/AuthContext';
import { getStudentProfile } from '../services/studentService';
import {
  getDepartmentTimetable,
  subscribeToTimetable,
  type TimetableEntry,
} from '../services/timetableService';
import { TimetableCalendar } from '../components/TimetableCalendar';

export const TimetablePage: React.FC = () => {
  const { profile: authProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<TimetableEntry[]>([]);
  const [studentSemester, setStudentSemester] = useState<number | null>(null);
  const [studentSection, setStudentSection] = useState<string | null>(null);

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

  return (
    <AppShell>
      <div className="page-header-container" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div className="breadcrumbs">
            <span>Academics</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Timetable</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', margin: '0.2rem 0' }}>
            {studentSemester ? `Semester ${studentSemester}${studentSection ? ` Section ${studentSection}` : ''} Timetable` : 'Class Timetable'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', margin: 0 }}>
            Interactive weekly calendar schedule, lecture slots, and lab locations
          </p>
        </div>
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
      ) : (
        <TimetableCalendar
          entries={schedule}
          role="STUDENT"
          canManage={false}
          emptyMessage={`No scheduled sessions for Semester ${studentSemester || ''} ${studentSection || ''}.`}
        />
      )}
    </AppShell>
  );
};

export default TimetablePage;

