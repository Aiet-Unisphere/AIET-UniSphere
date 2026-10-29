import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Filter, Plus, X, Check, BookOpen, User } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import {
  getDepartmentTimetable,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  detectTimetableConflicts,
  subscribeToTimetable,
  type TimetableEntry,
  type TimetableConflict,
} from '../../services/timetableService';
import { ClockTimePicker } from '../../faculty/components/ClockTimePicker';
import { useAuth } from '../../app/context/AuthContext';
import { supabase } from '../../lib/supabase';
import { TimetableCalendar } from '../../components/TimetableCalendar';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const HODTimetablePage: React.FC = () => {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'student' | 'my'>('student');
  const [semFilter, setSemFilter] = useState('All');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [facultyFilter, setFacultyFilter] = useState('All');
  const [roomFilter, setRoomFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Department Dropdown Options
  const [facultyOptionsList, setFacultyOptionsList] = useState<{ id: string; name: string }[]>([]);

  // Form Fields
  const [formSemester, setFormSemester] = useState<number>(7);
  const [formSection, setFormSection] = useState<string>('A');
  const [formCourseCode, setFormCourseCode] = useState<string>('BCS701');
  const [formCourseName, setFormCourseName] = useState<string>('Distributed Systems');
  const [formFacultyId, setFormFacultyId] = useState<string>('');
  const [formFacultyName, setFormFacultyName] = useState<string>('');
  const [formDay, setFormDay] = useState<typeof DAYS[number]>('Monday');
  const [formTimeSlot, setFormTimeSlot] = useState<string>('09:00 AM - 10:00 AM');
  const [formRoom, setFormRoom] = useState<string>('LH-101');
  const [formIsLab, setFormIsLab] = useState<boolean>(false);

  const loadTimetable = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDepartmentTimetable(profile?.department_id || undefined);
      setEntries(data);
    } catch (err) {
      console.error("Error loading department timetable:", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.department_id]);

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

  // Load Department Faculty Options for Modal
  useEffect(() => {
    const fetchFaculty = async () => {
      if (!profile?.department_id) return;
      try {
        const { data } = await (supabase as any)
          .from('profiles')
          .select('id, full_name')
          .eq('department_id', profile.department_id)
          .in('role', ['FACULTY', 'HOD']);

        if (data) {
          setFacultyOptionsList(data.map((f: any) => ({ id: f.id, name: f.full_name || 'Faculty' })));
        }
      } catch (err) {
        console.error("Error loading faculty for timetable:", err);
      }
    };
    fetchFaculty();
  }, [profile?.department_id]);

  const openAddModal = () => {
    setEditingEntry(null);
    setFormError(null);
    setFormSemester(7);
    setFormSection('A');
    setFormCourseCode('BCS701');
    setFormCourseName('Distributed Systems');
    setFormFacultyId(profile?.id || '');
    setFormFacultyName(profile?.full_name || '');
    setFormDay('Monday');
    setFormTimeSlot('09:00 AM - 10:00 AM');
    setFormRoom('LH-101');
    setFormIsLab(false);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: TimetableEntry) => {
    setEditingEntry(entry);
    setFormError(null);
    setFormSemester(entry.semester);
    setFormSection(entry.section || '');
    setFormCourseCode(entry.course_code || entry.course_id);
    setFormCourseName(entry.course_name);
    setFormFacultyId(entry.faculty_id || '');
    setFormFacultyName(entry.faculty_name || '');
    setFormDay((DAYS.includes(entry.day_of_week as any) ? entry.day_of_week : 'Monday') as typeof DAYS[number]);
    setFormTimeSlot(`${entry.start_time} - ${entry.end_time}`);
    setFormRoom(entry.room || '');
    setFormIsLab(Boolean(entry.is_lab));
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this timetable entry?")) return;
    try {
      await deleteTimetableEntry(id);
      await loadTimetable();
    } catch (err: any) {
      alert(err.message || "Failed to delete timetable entry");
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const times = formTimeSlot.split(' - ');
    const startTime = times[0]?.trim() || '09:00 AM';
    const endTime = times[1]?.trim() || '10:00 AM';

    if (!formCourseName.trim()) {
      setFormError("Course name is required.");
      return;
    }

    if (!profile?.department_id) {
      setFormError("Your profile has no assigned department.");
      return;
    }

    // Pre-save Conflict Validation
    const candidateEntry: TimetableEntry = {
      id: editingEntry ? editingEntry.id : 'temp-id',
      department_id: profile.department_id,
      course_id: formCourseCode.trim(),
      course_name: formCourseName.trim(),
      course_code: formCourseCode.trim(),
      faculty_id: formFacultyId || null,
      faculty_name: formFacultyName || null,
      semester: Number(formSemester),
      section: formSection.trim() || null,
      day_of_week: formDay,
      start_time: startTime,
      end_time: endTime,
      room: formRoom.trim() || null,
      is_lab: formIsLab,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const simulatedEntries = editingEntry
      ? entries.map(e => e.id === editingEntry.id ? candidateEntry : e)
      : [...entries, candidateEntry];

    const detectedConflicts = detectTimetableConflicts(simulatedEntries);
    if (detectedConflicts.length > 0) {
      const relevantConflict = detectedConflicts.find(c => c.entries.some(e => e.id === candidateEntry.id));
      if (relevantConflict) {
        setFormError(`Scheduling Conflict: ${relevantConflict.description}`);
        return;
      }
    }

    setIsSaving(true);
    try {
      if (editingEntry) {
        await updateTimetableEntry(editingEntry.id, {
          department_id: profile.department_id,
          course_id: formCourseCode.trim(),
          course_name: formCourseName.trim(),
          course_code: formCourseCode.trim(),
          faculty_id: formFacultyId || null,
          faculty_name: formFacultyName || null,
          semester: Number(formSemester),
          section: formSection.trim() || null,
          day_of_week: formDay,
          start_time: startTime,
          end_time: endTime,
          room: formRoom.trim() || null,
          is_lab: formIsLab
        });
      } else {
        await createTimetableEntry({
          department_id: profile.department_id,
          course_id: formCourseCode.trim(),
          course_name: formCourseName.trim(),
          course_code: formCourseCode.trim(),
          faculty_id: formFacultyId || null,
          faculty_name: formFacultyName || null,
          semester: Number(formSemester),
          section: formSection.trim() || null,
          day_of_week: formDay,
          start_time: startTime,
          end_time: endTime,
          room: formRoom.trim() || null,
          is_lab: formIsLab
        });
      }

      setIsModalOpen(false);
      await loadTimetable();
    } catch (err: any) {
      setFormError(err.message || "Failed to save timetable slot.");
    } finally {
      setIsSaving(false);
    }
  };

  // Filter Logic
  const displayEntries = activeTab === 'my'
    ? entries.filter(e => e.faculty_id === profile?.id)
    : entries;

  const filteredEntries = displayEntries.filter((e) => {
    const matchesSem = semFilter === 'All' || e.semester === Number(semFilter);
    const matchesSection = sectionFilter === 'All' || (e.section || '').toLowerCase() === sectionFilter.toLowerCase();
    const matchesFaculty = facultyFilter === 'All' || (e.faculty_name || '').toLowerCase().includes(facultyFilter.toLowerCase());
    const matchesRoom = roomFilter === 'All' || (e.room || '').toLowerCase() === roomFilter.toLowerCase();
    return matchesSem && matchesSection && matchesFaculty && matchesRoom;
  });

  const conflicts: TimetableConflict[] = detectTimetableConflicts(entries);
  const semesterOptions = [...new Set(entries.map(entry => entry.semester))].sort((a, b) => a - b);
  const sectionOptions = [...new Set(entries.map(entry => entry.section).filter((sec): sec is string => Boolean(sec)))].sort();
  const facultyOptions = [...new Set(entries.map(entry => entry.faculty_name).filter((name): name is string => Boolean(name)))].sort();
  const roomOptions = [...new Set(entries.map(entry => entry.room).filter((room): room is string => Boolean(room)))].sort();

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">ACADEMIC GOVERNANCE</span>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Department Timetable Management
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            {profile?.department?.name || 'Department'} class schedules, faculty allocations, and room monitoring
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Add Slot Button */}
          <button
            onClick={openAddModal}
            className="btn btn-primary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            <span>Add Class Slot</span>
          </button>
        </div>
      </div>

      {/* Two Perspective Tabs: Student Timetable vs My Timetable */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid #E2E8F0', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('student')}
          className={`btn ${activeTab === 'student' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.85rem', padding: '0.45rem 1.1rem' }}
        >
          <BookOpen size={16} />
          <span>Department Student Timetable ({entries.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('my')}
          className={`btn ${activeTab === 'my' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.85rem', padding: '0.45rem 1.1rem' }}
        >
          <User size={16} />
          <span>My Timetable ({entries.filter(e => e.faculty_id === profile?.id).length})</span>
        </button>
      </div>

      {/* Conflicts Alert Warning Banner */}
      {conflicts.length > 0 && activeTab === 'student' && (
        <div className="dashboard-panel" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', padding: '0.85rem 1.1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <AlertTriangle size={20} style={{ color: '#991B1B', marginTop: '0.1rem', flexShrink: 0 }} />
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#991B1B', margin: 0 }}>
                ⚠ Scheduling Conflict Detected ({conflicts.length})
              </h3>
              {conflicts.map((conflict, idx) => (
                <p key={idx} style={{ fontSize: '0.825rem', color: '#B91C1C', marginTop: '0.2rem', margin: 0 }}>
                  {conflict.description}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="dashboard-panel" style={{ marginBottom: '1.25rem', padding: '0.85rem 1.1rem' }}>
        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
            <Filter size={14} />
            <span>Filters:</span>
          </div>

          <select 
            className="form-select font-sans"
            style={{ width: '140px', padding: '0.45rem 0.65rem', fontSize: '0.825rem' }}
            value={semFilter}
            onChange={(e) => setSemFilter(e.target.value)}
          >
            <option value="All">All Semesters</option>
            {semesterOptions.map(semester => <option key={semester} value={semester}>Semester {semester}</option>)}
          </select>

          <select 
            className="form-select font-sans"
            style={{ width: '130px', padding: '0.45rem 0.65rem', fontSize: '0.825rem' }}
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="All">All Sections</option>
            {sectionOptions.map(sec => <option key={sec} value={sec}>Section {sec}</option>)}
          </select>

          {activeTab === 'student' && (
            <select 
              className="form-select font-sans"
              style={{ width: '160px', padding: '0.45rem 0.65rem', fontSize: '0.825rem' }}
              value={facultyFilter}
              onChange={(e) => setFacultyFilter(e.target.value)}
            >
              <option value="All">All Faculty</option>
              {facultyOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          )}

          <select 
            className="form-select font-sans"
            style={{ width: '150px', padding: '0.45rem 0.65rem', fontSize: '0.825rem' }}
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
          >
            <option value="All">All Rooms / Labs</option>
            {roomOptions.map(room => <option key={room} value={room}>{room}</option>)}
          </select>
        </div>
      </div>

      {/* Main Interactive Calendar Schedule */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
          Loading Timetable...
        </div>
      ) : (
        <TimetableCalendar
          entries={filteredEntries}
          role="HOD"
          currentUserId={profile?.id}
          canManage={true}
          onEditEntry={openEditModal}
          onDeleteEntry={handleDelete}
          emptyMessage={
            activeTab === 'my'
              ? 'No classes assigned to you in the timetable.'
              : 'No timetable slots match the current filters. Click "+ Add Class Slot" to add a new slot.'
          }
        />
      )}

      {/* Add / Edit Timetable Slot Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                {editingEntry ? 'Edit Class Slot' : 'Add New Class Slot'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', marginBottom: '1rem' }}>
                <AlertTriangle size={16} color="#991B1B" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <span style={{ fontSize: '0.825rem', color: '#991B1B' }}>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveModal} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Day & Room */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Day of Week *
                  </label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value as any)}
                    className="form-input font-sans"
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.85rem' }}
                  >
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Room / Lab *
                  </label>
                  <input
                    type="text"
                    required
                    value={formRoom}
                    onChange={(e) => setFormRoom(e.target.value)}
                    placeholder="e.g. LH-101 or Lab-2"
                    className="form-input font-sans"
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Semester & Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Semester *
                  </label>
                  <select
                    value={formSemester}
                    onChange={(e) => setFormSemester(Number(e.target.value))}
                    className="form-input font-sans"
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.85rem' }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Section
                  </label>
                  <input
                    type="text"
                    value={formSection}
                    onChange={(e) => setFormSection(e.target.value)}
                    placeholder="e.g. A, B"
                    className="form-input font-sans"
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Course Code & Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Course Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCourseCode}
                    onChange={(e) => setFormCourseCode(e.target.value)}
                    placeholder="e.g. BCS701"
                    className="form-input font-sans"
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Course Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCourseName}
                    onChange={(e) => setFormCourseName(e.target.value)}
                    placeholder="e.g. Distributed Systems"
                    className="form-input font-sans"
                    style={{ width: '100%', padding: '0.55rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Faculty Instructor Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Faculty Instructor
                </label>
                <select
                  value={formFacultyId}
                  onChange={(e) => {
                    const fid = e.target.value;
                    setFormFacultyId(fid);
                    const selected = facultyOptionsList.find(f => f.id === fid);
                    if (selected) setFormFacultyName(selected.name);
                  }}
                  className="form-input font-sans"
                  style={{ width: '100%', padding: '0.55rem', fontSize: '0.85rem' }}
                >
                  <option value="">-- Select Faculty --</option>
                  {facultyOptionsList.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Session Time Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Session Time Slot * (Clock Selector)
                </label>
                <ClockTimePicker
                  value={formTimeSlot}
                  onChange={(val) => setFormTimeSlot(val)}
                />
              </div>

              {/* Is Lab Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="isLabCheck"
                  checked={formIsLab}
                  onChange={(e) => setFormIsLab(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isLabCheck" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)', cursor: 'pointer' }}>
                  This is a Practical / Laboratory session
                </label>
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                >
                  <Check size={16} />
                  <span>{isSaving ? 'Saving...' : editingEntry ? 'Update Slot' : 'Save Slot'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HODAppShell>
  );
};

export default HODTimetablePage;
