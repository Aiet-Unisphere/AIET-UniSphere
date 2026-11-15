import React, { useState, useRef, useEffect } from 'react';
import { Clock, Check, AlertCircle } from 'lucide-react';
import type { TimetableEntry } from '../../services/timetableService';

interface TimetableSlotPickerProps {
  value: string; // e.g. "09:00 AM - 10:00 AM"
  onChange: (timeString: string, entry?: TimetableEntry) => void;
  availableEntries: TimetableEntry[];
  selectedEntry?: TimetableEntry | null;
  disabled?: boolean;
  emptyReasonMessage?: string;
}

export const TimetableSlotPicker: React.FC<TimetableSlotPickerProps> = ({
  value,
  onChange,
  availableEntries,
  selectedEntry,
  disabled = false,
  emptyReasonMessage
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelectSlot = (entry: TimetableEntry) => {
    const timeStr = `${entry.start_time} - ${entry.end_time}`;
    onChange(timeStr, entry);
    setIsOpen(false);
  };

  const displayText = value || (selectedEntry ? `${selectedEntry.start_time} - ${selectedEntry.end_time}` : 'Select Scheduled Slot');

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
          borderRadius: '8px',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
          <Clock size={16} style={{ color: 'var(--brand-blue)', flexShrink: 0 }} />
          <span style={{ 
            fontWeight: 600, 
            fontSize: '0.875rem', 
            color: selectedEntry || value ? '#0F172A' : '#64748B',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {displayText}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, flexShrink: 0, marginLeft: '0.5rem' }}>
          Change Slot ▾
        </span>
      </button>

      {/* Popover / Dropdown Menu */}
      {isOpen && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 1000,
            backgroundColor: '#FFFFFF',
            borderRadius: '10px',
            boxShadow: '0 12px 24px -4px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid #CBD5E1',
            width: '320px',
            maxWidth: '90vw',
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.03em' }}>
              Scheduled Timetable Slots ({availableEntries.length})
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '0.85rem', fontWeight: 700, padding: 0 }}
            >
              ✕
            </button>
          </div>

          {availableEntries.length === 0 ? (
            <div style={{ padding: '1rem 0.5rem', textAlign: 'center', color: '#64748B' }}>
              <AlertCircle size={24} style={{ margin: '0 auto 0.5rem', color: '#D97706', opacity: 0.8 }} />
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                No Timetable Slots Found
              </div>
              <div style={{ fontSize: '0.725rem', marginTop: '0.25rem', lineHeight: 1.4, color: '#64748B' }}>
                {emptyReasonMessage || 'No periods are scheduled for this course on this weekday for your faculty account.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '220px', overflowY: 'auto' }}>
              {availableEntries.map((entry) => {
                const slotStr = `${entry.start_time} - ${entry.end_time}`;
                const isSelected = selectedEntry?.id === entry.id || value === slotStr;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleSelectSlot(entry)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '6px',
                      border: isSelected ? '1.5px solid #0B53A0' : '1px solid #E2E8F0',
                      backgroundColor: isSelected ? '#EFF6FF' : '#F8FAFC',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.1s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={13} style={{ color: isSelected ? '#0B53A0' : '#64748B' }} />
                        <span style={{ fontSize: '0.825rem', fontWeight: isSelected ? 800 : 600, color: isSelected ? '#0B53A0' : '#1E293B', fontFamily: 'monospace' }}>
                          {slotStr}
                        </span>
                        {entry.is_lab && (
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#92400E' }}>
                            LAB
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.725rem', color: '#64748B', marginTop: '0.15rem' }}>
                        {entry.section ? `Section ${entry.section}` : 'All Sections'}
                        {entry.semester ? ` • Sem ${entry.semester}` : ''}
                        {entry.room ? ` • ${entry.room}` : ''}
                      </div>
                    </div>
                    {isSelected && (
                      <Check size={16} style={{ color: '#0B53A0', flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsOpen(false)}
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimetableSlotPicker;

