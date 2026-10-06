import React, { useState, useRef, useEffect } from 'react';
import { Clock, Check, X } from 'lucide-react';

interface ClockTimePickerProps {
  value: string; // e.g. "09:00 AM - 10:00 AM" or "09:00 AM"
  onChange: (timeString: string) => void;
  disabled?: boolean;
}

export const ClockTimePicker: React.FC<ClockTimePickerProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'start' | 'end'>('start');
  const [selectionType, setSelectionType] = useState<'hour' | 'minute'>('hour');

  // Parse current value
  const parseTime = (str: string) => {
    const parts = str.split(' - ');
    const startStr = parts[0] || '09:00 AM';
    const endStr = parts[1] || '10:00 AM';

    const parseSingle = (s: string) => {
      const match = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        return {
          hour: parseInt(match[1], 10),
          minute: parseInt(match[2], 10),
          period: (match[3].toUpperCase() as 'AM' | 'PM')
        };
      }
      return { hour: 9, minute: 0, period: 'AM' as const };
    };

    return {
      start: parseSingle(startStr),
      end: parseSingle(endStr)
    };
  };

  const parsed = parseTime(value || '09:00 AM - 10:00 AM');
  const [startTime, setStartTime] = useState(parsed.start);
  const [endTime, setEndTime] = useState(parsed.end);

  useEffect(() => {
    if (value) {
      const p = parseTime(value);
      setStartTime(p.start);
      setEndTime(p.end);
    }
  }, [value]);

  const modalRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentTarget = mode === 'start' ? startTime : endTime;
  const setCurrentTarget = (updater: (prev: typeof startTime) => typeof startTime) => {
    if (mode === 'start') {
      setStartTime(prev => {
        const next = updater(prev);
        emitChange(next, endTime);
        return next;
      });
    } else {
      setEndTime(prev => {
        const next = updater(prev);
        emitChange(startTime, next);
        return next;
      });
    }
  };

  const formatSingle = (t: typeof startTime) => {
    const h = t.hour.toString().padStart(2, '0');
    const m = t.minute.toString().padStart(2, '0');
    return `${h}:${m} ${t.period}`;
  };

  const emitChange = (st: typeof startTime, et: typeof endTime) => {
    onChange(`${formatSingle(st)} - ${formatSingle(et)}`);
  };

  // Clock dial geometry
  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const getHandRotation = () => {
    if (selectionType === 'hour') {
      const h = currentTarget.hour % 12;
      return h * 30 + currentTarget.minute * 0.5; // (hour % 12) * 30 + minute * 0.5
    } else {
      return currentTarget.minute * 6; // minute * 6
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Button / Display */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="form-input font-sans"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 0.85rem',
          backgroundColor: disabled ? '#F8FAFC' : '#FFFFFF',
          cursor: disabled ? 'not-allowed' : 'pointer',
          border: '1px solid #CBD5E1',
          borderRadius: '6px',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={16} style={{ color: 'var(--brand-blue)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>
            {value || '09:00 AM - 10:00 AM'}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
          Change Slot ▾
        </span>
      </button>

      {/* Clock Popup Modal */}
      {isOpen && (
        <div
          ref={modalRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 1000,
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            border: '1px solid #E2E8F0',
            width: '320px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem'
          }}
        >
          {/* Header Switcher: Start Time vs End Time */}
          <div style={{ display: 'flex', borderRadius: '8px', backgroundColor: '#F1F5F9', padding: '3px' }}>
            <button
              type="button"
              onClick={() => { setMode('start'); setSelectionType('hour'); }}
              style={{
                flex: 1,
                padding: '0.4rem 0.5rem',
                fontSize: '0.775rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px',
                backgroundColor: mode === 'start' ? '#FFFFFF' : 'transparent',
                color: mode === 'start' ? 'var(--brand-blue)' : '#64748B',
                boxShadow: mode === 'start' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer'
              }}
            >
              Start: {formatSingle(startTime)}
            </button>
            <button
              type="button"
              onClick={() => { setMode('end'); setSelectionType('hour'); }}
              style={{
                flex: 1,
                padding: '0.4rem 0.5rem',
                fontSize: '0.775rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px',
                backgroundColor: mode === 'end' ? '#FFFFFF' : 'transparent',
                color: mode === 'end' ? 'var(--brand-blue)' : '#64748B',
                boxShadow: mode === 'end' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer'
              }}
            >
              End: {formatSingle(endTime)}
            </button>
          </div>

          {/* Time Display & Hour/Minute Toggle & AM/PM */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '1.5rem', fontWeight: 800 }}>
              <button
                type="button"
                onClick={() => setSelectionType('hour')}
                style={{
                  background: selectionType === 'hour' ? 'rgba(11, 83, 160, 0.1)' : 'none',
                  border: 'none',
                  color: selectionType === 'hour' ? 'var(--brand-blue)' : '#334155',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                {currentTarget.hour.toString().padStart(2, '0')}
              </button>
              <span>:</span>
              <button
                type="button"
                onClick={() => setSelectionType('minute')}
                style={{
                  background: selectionType === 'minute' ? 'rgba(11, 83, 160, 0.1)' : 'none',
                  border: 'none',
                  color: selectionType === 'minute' ? 'var(--brand-blue)' : '#334155',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                {currentTarget.minute.toString().padStart(2, '0')}
              </button>
            </div>

            {/* AM / PM Toggle */}
            <div style={{ display: 'flex', gap: '0.25rem', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setCurrentTarget(prev => ({ ...prev, period: 'AM' }))}
                style={{
                  padding: '0.3rem 0.6rem',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: currentTarget.period === 'AM' ? 'var(--brand-blue)' : '#FFFFFF',
                  color: currentTarget.period === 'AM' ? '#FFFFFF' : '#64748B',
                  cursor: 'pointer'
                }}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setCurrentTarget(prev => ({ ...prev, period: 'PM' }))}
                style={{
                  padding: '0.3rem 0.6rem',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: currentTarget.period === 'PM' ? 'var(--brand-blue)' : '#FFFFFF',
                  color: currentTarget.period === 'PM' ? '#FFFFFF' : '#64748B',
                  cursor: 'pointer'
                }}
              >
                PM
              </button>
            </div>
          </div>

          {/* Clock Dial Canvas / Interactive Circle */}
          <div
            style={{
              position: 'relative',
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              backgroundColor: '#F8FAFC',
              border: '2px solid #E2E8F0',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* Center Pivot */}
            <div
              style={{
                position: 'absolute',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--brand-blue)',
                zIndex: 5
              }}
            />

            {/* Clock Hand */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '2px',
                height: '70px',
                marginLeft: '-1px',
                marginTop: '-70px',
                backgroundColor: 'var(--brand-blue)',
                transformOrigin: 'bottom center',
                transform: `rotate(${getHandRotation()}deg)`,
                zIndex: 4,
                transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {/* Hand Head Pointer Tip */}
              <div
                style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--brand-blue)',
                  opacity: 0.25,
                  pointerEvents: 'none'
                }}
              />
            </div>

            {/* Clock Numbers / Dial Items */}
            {selectionType === 'hour'
              ? hours.map((h) => {
                  const degreesFromTop = (h % 12) * 30;
                  const rad = (degreesFromTop * Math.PI) / 180;
                  const radius = 75; // px from center
                  const x = radius * Math.sin(rad);
                  const y = -radius * Math.cos(rad);
                  const isSelected = currentTarget.hour === h;

                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setCurrentTarget(prev => ({ ...prev, hour: h }));
                        setSelectionType('minute');
                      }}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: isSelected ? 'var(--brand-blue)' : 'transparent',
                        color: isSelected ? '#FFFFFF' : '#1E293B',
                        fontSize: '0.8rem',
                        fontWeight: isSelected ? 800 : 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 6,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {h}
                    </button>
                  );
                })
              : minutes.map((m) => {
                  const degreesFromTop = m * 6;
                  const rad = (degreesFromTop * Math.PI) / 180;
                  const radius = 75;
                  const x = radius * Math.sin(rad);
                  const y = -radius * Math.cos(rad);
                  const isSelected = currentTarget.minute === m;

                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setCurrentTarget(prev => ({ ...prev, minute: m }));
                        if (mode === 'start') {
                          setMode('end');
                          setSelectionType('hour');
                        }
                      }}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: isSelected ? 'var(--brand-blue)' : 'transparent',
                        color: isSelected ? '#FFFFFF' : '#1E293B',
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? 800 : 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 6,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {m.toString().padStart(2, '0')}
                    </button>
                  );
                })}
          </div>

          {/* Preset Quick Slots */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem' }}>
            {[
              '09:00 AM - 10:00 AM',
              '10:00 AM - 11:00 AM',
              '11:15 AM - 12:15 PM',
              '02:00 PM - 03:00 PM',
              '03:00 PM - 04:00 PM'
            ].map(slot => (
              <button
                key={slot}
                type="button"
                onClick={() => {
                  onChange(slot);
                  const p = parseTime(slot);
                  setStartTime(p.start);
                  setEndTime(p.end);
                  setIsOpen(false);
                }}
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  border: value === slot ? '1px solid var(--brand-blue)' : '1px solid #E2E8F0',
                  backgroundColor: value === slot ? 'rgba(11, 83, 160, 0.08)' : '#F8FAFC',
                  color: value === slot ? 'var(--brand-blue)' : '#475569',
                  cursor: 'pointer'
                }}
              >
                {slot.split(' - ')[0]}
              </button>
            ))}
          </div>

          {/* Done Button */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsOpen(false)}
            style={{ width: '100%', padding: '0.45rem', fontSize: '0.8rem', justifyContent: 'center' }}
          >
            <Check size={14} />
            <span>Apply Time Slot</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ClockTimePicker;
