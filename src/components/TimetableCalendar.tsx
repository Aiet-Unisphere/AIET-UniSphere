import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  User, 
  BookOpen, 
  FlaskConical, 
  X, 
  Pencil, 
  Trash2, 
  CalendarDays,
  Coffee,
  UtensilsCrossed
} from 'lucide-react';
import type { TimetableEntry } from '../services/timetableService';

export const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type TimetableDay = typeof TIMETABLE_DAYS[number];

export interface TimetableCalendarProps {
  entries: TimetableEntry[];
  role: 'STUDENT' | 'FACULTY' | 'HOD';
  currentUserId?: string;
  onEditEntry?: (entry: TimetableEntry) => void;
  onDeleteEntry?: (id: string, e: React.MouseEvent) => void;
  canManage?: boolean;
  emptyMessage?: string;
}

// Convert "09:00 AM", "01:30 PM", "9:00", "13:00", "9:00am", "09:50 AM" into minutes from midnight (0 to 1440)
export const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 9 * 60;
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return 9 * 60;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
};

// Course color palette generator based on subject name or code
const COURSE_PALETTES = [
  { bg: 'rgba(255, 79, 24, 0.08)', border: '#ff4f18', text: '#9a2c0a', badge: '#ff4f18', pill: 'rgba(255, 79, 24, 0.15)' }, // Orange
  { bg: 'rgba(11, 83, 160, 0.08)', border: '#0b53a0', text: '#07366b', badge: '#0b53a0', pill: 'rgba(11, 83, 160, 0.15)' }, // Blue
  { bg: 'rgba(16, 185, 129, 0.08)', border: '#10b981', text: '#065f46', badge: '#10b981', pill: 'rgba(16, 185, 129, 0.15)' }, // Emerald
  { bg: 'rgba(139, 92, 246, 0.08)', border: '#8b5cf6', text: '#5b21b6', badge: '#8b5cf6', pill: 'rgba(139, 92, 246, 0.15)' }, // Purple
  { bg: 'rgba(245, 158, 11, 0.08)', border: '#f59e0b', text: '#92400e', badge: '#f59e0b', pill: 'rgba(245, 158, 11, 0.15)' }, // Amber
  { bg: 'rgba(236, 72, 153, 0.08)', border: '#ec4899', text: '#9d174d', badge: '#ec4899', pill: 'rgba(236, 72, 153, 0.15)' }, // Pink
  { bg: 'rgba(6, 182, 212, 0.08)', border: '#06b6d4', text: '#155e75', badge: '#06b6d4', pill: 'rgba(6, 182, 212, 0.15)' }, // Cyan
  { bg: 'rgba(99, 102, 241, 0.08)', border: '#6366f1', text: '#3730a3', badge: '#6366f1', pill: 'rgba(99, 102, 241, 0.15)' }, // Indigo
];

const getCoursePalette = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COURSE_PALETTES.length;
  return COURSE_PALETTES[index];
};

export interface PositionedTimetableEntry extends TimetableEntry {
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  startMins: number;
  endMins: number;
}

export const TimetableCalendar: React.FC<TimetableCalendarProps> = ({
  entries,
  role: _role,
  currentUserId: _currentUserId,
  onEditEntry,
  onDeleteEntry,
  canManage = false,
  emptyMessage = "No class sessions scheduled for this period."
}) => {
  // Selected event modal details
  const [activeModalEntry, setActiveModalEntry] = useState<TimetableEntry | null>(null);

  // Time grid parameters: 8:00 AM to 6:00 PM standard collegiate hours
  const START_HOUR = 8;
  const END_HOUR = 18;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const HOUR_HEIGHT = 68; // px per hour slot: exactly 1.133px per minute

  // Institutional Institutional Recess Breaks (AIET Academic Standard)
  // 10:40 AM to 11:00 AM (20 mins Tea Break)
  // 12:40 PM to 01:40 PM (60 mins Lunch Break)
  const INSTITUTION_BREAKS = useMemo(() => [
    {
      id: 'tea-break',
      name: 'Tea Break',
      startMins: 10 * 60 + 40, // 640
      endMins: 11 * 60,        // 660 (20m)
      timeRange: '10:40 AM – 11:00 AM',
      icon: 'coffee',
      bg: 'rgba(241, 245, 249, 0.85)',
      border: '#CBD5E1',
      textColor: '#475569'
    },
    {
      id: 'lunch-break',
      name: 'Lunch Break',
      startMins: 12 * 60 + 40, // 760
      endMins: 13 * 60 + 40,   // 820 (60m)
      timeRange: '12:40 PM – 01:40 PM',
      icon: 'utensils',
      bg: 'rgba(254, 243, 199, 0.45)',
      border: '#FDE68A',
      textColor: '#92400E'
    }
  ], []);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      slots.push({
        hour: h,
        label: `${displayHour.toString().padStart(2, '0')}:00 ${period}`,
        shortLabel: `${displayHour}:00 ${period}`
      });
    }
    return slots;
  }, [START_HOUR, END_HOUR]);

  // Current day name string
  const currentDayName = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  }, []);

  // Compute positioned entries with overlap resolution and precise pixel scaling
  const positionedEntriesByDay = useMemo(() => {
    const map: Record<string, PositionedTimetableEntry[]> = {};
    TIMETABLE_DAYS.forEach(d => { map[d] = []; });

    const gridStartMins = START_HOUR * 60;
    const gridEndMins = END_HOUR * 60;

    TIMETABLE_DAYS.forEach(day => {
      const dayEntries = entries.filter(e => e.day_of_week === day);
      if (dayEntries.length === 0) return;

      // Map with calculated minutes
      const parsed = dayEntries.map(e => {
        const startMins = parseTimeToMinutes(e.start_time);
        const endMins = Math.max(startMins + 15, parseTimeToMinutes(e.end_time));
        return { entry: e, startMins, endMins };
      });

      // Sort primarily by start time ascending, then by duration descending
      parsed.sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

      // Overlap cluster detection (Google Calendar algorithm)
      const clusters: (typeof parsed)[] = [];
      let currentCluster: typeof parsed = [];
      let clusterEnd = -1;

      parsed.forEach(item => {
        if (currentCluster.length === 0) {
          currentCluster.push(item);
          clusterEnd = item.endMins;
        } else if (item.startMins < clusterEnd) {
          // Overlaps with current cluster
          currentCluster.push(item);
          clusterEnd = Math.max(clusterEnd, item.endMins);
        } else {
          // New cluster
          clusters.push(currentCluster);
          currentCluster = [item];
          clusterEnd = item.endMins;
        }
      });
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }

      // Assign column slots within each cluster
      const dayPositioned: PositionedTimetableEntry[] = [];

      clusters.forEach(cluster => {
        const columns: number[] = []; // track the endMins of each sub-column
        const assigned: { item: typeof parsed[0]; colIndex: number }[] = [];

        cluster.forEach(item => {
          let placed = false;
          for (let i = 0; i < columns.length; i++) {
            if (item.startMins >= columns[i]) {
              columns[i] = item.endMins;
              assigned.push({ item, colIndex: i });
              placed = true;
              break;
            }
          }
          if (!placed) {
            columns.push(item.endMins);
            assigned.push({ item, colIndex: columns.length - 1 });
          }
        });

        const numCols = Math.max(1, columns.length);
        const colWidthPercent = 100 / numCols;

        assigned.forEach(({ item, colIndex }) => {
          // Calculate top and height based on the exact grid start
          const clampedStart = Math.max(gridStartMins, item.startMins);
          const clampedEnd = Math.min(gridEndMins, item.endMins);
          const topMins = Math.max(0, clampedStart - gridStartMins);
          const durationMins = Math.max(25, clampedEnd - clampedStart);

          const topPx = (topMins / 60) * HOUR_HEIGHT;
          const heightPx = Math.max(28, (durationMins / 60) * HOUR_HEIGHT);

          dayPositioned.push({
            ...item.entry,
            topPx,
            heightPx,
            leftPercent: colIndex * colWidthPercent,
            widthPercent: colWidthPercent,
            startMins: item.startMins,
            endMins: item.endMins,
          });
        });
      });

      map[day] = dayPositioned;
    });

    return map;
  }, [entries, START_HOUR, END_HOUR, HOUR_HEIGHT]);

  // Unique course list for Legend
  const uniqueCourses = useMemo(() => {
    const seen = new Map<string, { code: string; name: string; isLab: boolean }>();
    entries.forEach(e => {
      const key = e.course_code || e.course_name;
      if (!seen.has(key)) {
        seen.set(key, {
          code: e.course_code || e.course_id,
          name: e.course_name,
          isLab: Boolean(e.is_lab)
        });
      }
    });
    return Array.from(seen.values()).slice(0, 8); // Top 8 in legend
  }, [entries]);

  return (
    <div className="timetable-calendar-container" style={{ width: '100%' }}>
      {/* 1. Course Color Legend & Recess Schedule Notice */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          gap: '0.85rem', 
          flexWrap: 'wrap', 
          marginBottom: '0.85rem',
          padding: '0.45rem 0.85rem',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          fontSize: '0.75rem'
        }}
      >
        {/* Left: Course Legend Items */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Course Legend:
          </span>
          {uniqueCourses.map(course => {
            const palette = getCoursePalette(course.code || course.name);
            return (
              <span
                key={course.code || course.name}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: palette.bg,
                  border: `1px solid ${palette.border}`,
                  color: palette.text,
                  fontWeight: 600
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: palette.badge }} />
                <span>{course.code}</span>
                {course.isLab && (
                  <span style={{ fontSize: '0.65rem', opacity: 0.85, fontWeight: 700 }}>[LAB]</span>
                )}
              </span>
            );
          })}
        </div>

        {/* Right: Institutional Break Timings Note */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#475569', fontWeight: 600 }}>
            <Coffee size={13} style={{ color: '#D97706' }} />
            <span>Tea Break: <strong>10:40 – 11:00 AM</strong></span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#92400E', fontWeight: 600 }}>
            <UtensilsCrossed size={13} style={{ color: '#D97706' }} />
            <span>Lunch Break: <strong>12:40 – 1:40 PM</strong></span>
          </span>
        </div>
      </div>

      {/* 3. Empty State Check */}
      {entries.length === 0 ? (
        <div 
          className="dashboard-panel"
          style={{ 
            padding: '3.5rem 2rem', 
            textAlign: 'center', 
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #CBD5E1'
          }}
        >
          <CalendarDays size={40} style={{ margin: '0 auto 0.65rem', color: '#94A3B8' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.35rem' }}>
            No Class Sessions Found
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', maxWidth: '420px', margin: '0 auto' }}>
            {emptyMessage}
          </p>
        </div>
      ) : (
        /* ============================================================ */
        /* WEEK VIEW — Interactive Seamless Time-Grid Matrix            */
        /* ============================================================ */
        <div 
          className="timetable-week-matrix"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #CBD5E1',
            overflowX: 'auto',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)'
          }}
        >
          <div style={{ minWidth: '880px' }}>
            {/* Day Header Row: Identical 72px + 6 columns */}
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: '72px repeat(6, 1fr)',
                borderBottom: '2px solid #CBD5E1',
                backgroundColor: '#F8FAFC'
              }}
            >
              {/* Top-Left Time Axis Corner Cell */}
              <div 
                style={{ 
                  boxSizing: 'border-box',
                  padding: '0.75rem 0.5rem', 
                  borderRight: '1px solid #E2E8F0', 
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--brand-dark-grey)',
                  textTransform: 'uppercase'
                }}
              >
                Time
              </div>

              {/* Day Headers (Mon - Sat) */}
              {TIMETABLE_DAYS.map((day) => {
                const isToday = currentDayName === day;
                const dayEntries = entries.filter(e => e.day_of_week === day);
                return (
                  <div 
                    key={day}
                    style={{
                      boxSizing: 'border-box',
                      padding: '0.75rem 0.5rem',
                      borderRight: day !== 'Saturday' ? '1px solid #E2E8F0' : 'none',
                      textAlign: 'center',
                      backgroundColor: isToday ? 'rgba(255, 79, 24, 0.06)' : 'transparent',
                      borderTop: isToday ? '3px solid var(--brand-orange)' : '3px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                      <span 
                        style={{ 
                          fontSize: '0.875rem', 
                          fontWeight: isToday ? 800 : 700, 
                          color: isToday ? 'var(--brand-orange)' : 'var(--brand-black)' 
                        }}
                      >
                        {day}
                      </span>
                      {isToday && (
                        <span 
                          style={{ 
                            fontSize: '0.65rem', 
                            padding: '0.1rem 0.35rem', 
                            borderRadius: '4px', 
                            backgroundColor: 'var(--brand-orange)', 
                            color: '#FFF', 
                            fontWeight: 800 
                          }}
                        >
                          TODAY
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem', display: 'block' }}>
                      {dayEntries.length} {dayEntries.length === 1 ? 'class' : 'classes'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Time Grid Body with Perfectly Aligned Rows */}
            <div 
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: '72px repeat(6, 1fr)',
                height: `${TOTAL_HOURS * HOUR_HEIGHT}px`
              }}
            >
              {/* Left Fixed Time Axis: Hour labels sit exactly on the row boundary */}
              <div 
                style={{ 
                  boxSizing: 'border-box',
                  borderRight: '1px solid #E2E8F0',
                  backgroundColor: '#F8FAFC',
                  userSelect: 'none',
                  position: 'relative'
                }}
              >
                {timeSlots.map((slot, idx) => (
                  <div 
                    key={slot.hour}
                    style={{
                      boxSizing: 'border-box',
                      height: `${HOUR_HEIGHT}px`,
                      borderBottom: idx < timeSlots.length - 1 ? '1px solid #E2E8F0' : 'none',
                      position: 'relative'
                    }}
                  >
                    {/* Hour label positioned flush with the top border boundary */}
                    <div 
                      style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '8px',
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: '#64748B',
                        backgroundColor: '#F8FAFC',
                        padding: '0 2px'
                      }}
                    >
                      {slot.shortLabel}
                    </div>

                    {/* Half-hour 30m marker dot */}
                    <div
                      style={{
                        position: 'absolute',
                        top: `${HOUR_HEIGHT / 2}px`,
                        right: '8px',
                        width: '4px',
                        height: '1px',
                        backgroundColor: '#CBD5E1'
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {TIMETABLE_DAYS.map((day, colIdx) => {
                const isToday = currentDayName === day;
                const dayPositioned = positionedEntriesByDay[day] || [];

                return (
                  <div 
                    key={day}
                    style={{
                      boxSizing: 'border-box',
                      position: 'relative',
                      borderRight: colIdx < 5 ? '1px solid #E2E8F0' : 'none',
                      backgroundColor: isToday ? 'rgba(255, 79, 24, 0.02)' : 'transparent',
                      height: `${TOTAL_HOURS * HOUR_HEIGHT}px`
                    }}
                  >
                    {/* Continuous Hour grid guidelines */}
                    {timeSlots.map((slot, idx) => (
                      <div 
                        key={slot.hour}
                        style={{
                          boxSizing: 'border-box',
                          height: `${HOUR_HEIGHT}px`,
                          borderBottom: idx < timeSlots.length - 1 ? '1px solid #E2E8F0' : 'none',
                          position: 'relative'
                        }}
                      >
                        {/* Half-hour subtle dashed guideline */}
                        <div 
                          style={{
                            position: 'absolute',
                            top: `${HOUR_HEIGHT / 2}px`,
                            left: 0,
                            right: 0,
                            borderBottom: '1px dashed #F1F5F9'
                          }}
                        />
                      </div>
                    ))}

                    {/* Institutional Tea & Lunch Break Indicators on the grid */}
                    {INSTITUTION_BREAKS.map((brk) => {
                      const gridStartMins = START_HOUR * 60;
                      const topPx = ((brk.startMins - gridStartMins) / 60) * HOUR_HEIGHT;
                      const heightPx = ((brk.endMins - brk.startMins) / 60) * HOUR_HEIGHT;

                      return (
                        <div
                          key={brk.id}
                          title={`${brk.name} (${brk.timeRange})`}
                          style={{
                            boxSizing: 'border-box',
                            position: 'absolute',
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                            left: '1px',
                            right: '1px',
                            backgroundColor: brk.bg,
                            borderTop: `1px dashed ${brk.border}`,
                            borderBottom: `1px dashed ${brk.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem',
                            color: brk.textColor,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            pointerEvents: 'none',
                            zIndex: 5,
                            opacity: 0.9
                          }}
                        >
                          {brk.icon === 'coffee' ? <Coffee size={11} /> : <UtensilsCrossed size={11} />}
                          <span>{brk.name} ({brk.timeRange})</span>
                        </div>
                      );
                    })}

                    {/* Positioned Events for This Day */}
                    {dayPositioned.map((entry) => {
                      const palette = getCoursePalette(entry.course_code || entry.course_name);

                      return (
                        <div
                          key={entry.id}
                          onClick={() => setActiveModalEntry(entry)}
                          style={{
                            boxSizing: 'border-box',
                            position: 'absolute',
                            top: `${entry.topPx + 1}px`,
                            height: `${Math.max(26, entry.heightPx - 2)}px`,
                            left: `calc(${entry.leftPercent}% + 2px)`,
                            width: `calc(${entry.widthPercent}% - 4px)`,
                            backgroundColor: palette.bg,
                            borderLeft: `3px solid ${palette.border}`,
                            borderTop: '1px solid rgba(0,0,0,0.08)',
                            borderRight: '1px solid rgba(0,0,0,0.08)',
                            borderBottom: '1px solid rgba(0,0,0,0.08)',
                            borderRadius: '5px',
                            padding: '0.25rem 0.45rem',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            zIndex: 10,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-start'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.09)';
                            e.currentTarget.style.zIndex = '25';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                            e.currentTarget.style.zIndex = '10';
                          }}
                        >
                          {/* Top: Course Code & Lab Tag */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.2rem', marginBottom: '0.05rem' }}>
                            <span 
                              className="font-mono"
                              style={{ 
                                fontSize: '0.72rem', 
                                fontWeight: 800, 
                                color: palette.text,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {entry.course_code || entry.course_id}
                            </span>
                            {entry.is_lab && (
                              <span 
                                style={{ 
                                  fontSize: '0.6rem', 
                                  padding: '0.05rem 0.25rem', 
                                  borderRadius: '3px', 
                                  backgroundColor: '#EDE9FE', 
                                  color: '#7C3AED', 
                                  fontWeight: 700 
                                }}
                              >
                                LAB
                              </span>
                            )}
                          </div>

                          {/* Course Name */}
                          <div 
                            style={{ 
                              fontSize: '0.78rem', 
                              fontWeight: 700, 
                              color: 'var(--brand-black)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              lineHeight: 1.15
                            }}
                          >
                            {entry.course_name}
                          </div>

                          {/* Time & Room Details (shown if block has sufficient height) */}
                          {entry.heightPx >= 46 && (
                            <div 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.35rem', 
                                fontSize: '0.68rem', 
                                color: 'var(--brand-dark-grey)', 
                                marginTop: '0.12rem',
                                flexWrap: 'wrap'
                              }}
                            >
                              <span className="font-mono">{entry.start_time}–{entry.end_time}</span>
                              {entry.room && (
                                <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>
                                  • {entry.room}
                                </span>
                              )}
                              {entry.section && (
                                <span>Sec {entry.section}</span>
                              )}
                            </div>
                          )}

                          {/* Faculty Name (shown if height allows) */}
                          {entry.heightPx >= 70 && entry.faculty_name && (
                            <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              Prof. {entry.faculty_name}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Event Detail Modal */}
      {activeModalEntry && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
          onClick={() => setActiveModalEntry(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '480px',
              padding: '1.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <div>
                <span className="badge badge-active font-mono" style={{ marginBottom: '0.35rem', display: 'inline-block' }}>
                  CLASS SESSION DETAILS
                </span>
                <h3 className="font-display" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
                  {activeModalEntry.course_name}
                </h3>
              </div>
              <button
                onClick={() => setActiveModalEntry(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Course Code</span>
                  <span className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--brand-blue)' }}>
                    {activeModalEntry.course_code || activeModalEntry.course_id}
                  </span>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Type</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: activeModalEntry.is_lab ? '#7C3AED' : 'var(--brand-black)' }}>
                    {activeModalEntry.is_lab ? 'Lab Practical' : 'Theory Lecture'}
                  </span>
                </div>
              </div>

              <div style={{ padding: '0.75rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748B', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <Clock size={14} /> Schedule Timing
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--brand-black)' }}>
                  {activeModalEntry.day_of_week}, {activeModalEntry.start_time} – {activeModalEntry.end_time}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748B', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                    <MapPin size={14} /> Location
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--brand-black)' }}>
                    {activeModalEntry.room || 'To Be Assigned'}
                  </div>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748B', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                    <BookOpen size={14} /> Cohort
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--brand-black)' }}>
                    Semester {activeModalEntry.semester} {activeModalEntry.section ? `(Sec ${activeModalEntry.section})` : ''}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.75rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748B', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <User size={14} /> Instructor
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--brand-black)' }}>
                  {activeModalEntry.faculty_name || 'Faculty allocation pending'}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
              {canManage && onEditEntry && (
                <button
                  onClick={() => {
                    const e = activeModalEntry;
                    setActiveModalEntry(null);
                    onEditEntry(e);
                  }}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Pencil size={14} /> Edit Slot
                </button>
              )}
              {canManage && onDeleteEntry && (
                <button
                  onClick={(e) => {
                    const id = activeModalEntry.id;
                    setActiveModalEntry(null);
                    onDeleteEntry(id, e);
                  }}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--brand-danger)' }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <button
                onClick={() => setActiveModalEntry(null)}
                className="btn btn-primary"
                style={{ padding: '0.5rem 1.25rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
