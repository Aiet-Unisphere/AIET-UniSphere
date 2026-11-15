import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppShell } from '../components/AppShell';
import { 
  Plus, 
  Search, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowLeft, 
  Clock, 
  Notebook, 
  RefreshCw,
  X 
} from 'lucide-react';
import { 
  getStudentNotes, 
  createStudentNote, 
  updateStudentNote, 
  deleteStudentNote, 
  filterNotes,
  type Note 
} from '../services/noteService';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const MyNotesPage: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Active note editor state
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Delete confirmation modal state
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Mobile navigation state: show list or editor
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');

  // Debounce save timer ref
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestEditRef = useRef<{ title: string; content: string; noteId: string | null }>({
    title: '',
    content: '',
    noteId: null
  });

  latestEditRef.current = {
    title: editTitle,
    content: editContent,
    noteId: activeNoteId
  };

  // Load all student notes on mount
  const loadNotes = useCallback(async (selectFirst = true) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getStudentNotes();
      setNotes(data);

      if (data.length > 0 && selectFirst) {
        const first = data[0];
        setActiveNoteId(first.id);
        setEditTitle(first.title);
        setEditContent(first.content);
        setSaveStatus('idle');
        setLastSavedAt(new Date(first.updated_at));
      } else if (data.length === 0) {
        setActiveNoteId(null);
        setEditTitle('');
        setEditContent('');
      }
    } catch (err: any) {
      console.error('[MyNotesPage] Failed to load notes:', err);
      setLoadError(err.message || 'Unable to load notes. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Synchronous flush of pending changes
  const flushPendingSave = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const { noteId, title, content } = latestEditRef.current;
    if (!noteId) return;

    const currentNote = notes.find((n) => n.id === noteId);
    if (currentNote && (currentNote.title !== title || currentNote.content !== content)) {
      try {
        setSaveStatus('saving');
        const updated = await updateStudentNote(noteId, { title, content });
        setNotes((prev) =>
          prev.map((n) => (n.id === noteId ? updated : n))
        );
        setSaveStatus('saved');
        setLastSavedAt(new Date());
      } catch (err: any) {
        console.error('[MyNotesPage] Flush save failed:', err);
        setSaveStatus('error');
        setSaveErrorMsg(err.message || 'Failed to save');
      }
    }
  };

  // Handle switching to a different note
  const handleSelectNote = async (note: Note) => {
    if (note.id === activeNoteId) {
      setMobileView('editor');
      return;
    }

    // Flush any pending unsaved edits for the previous note
    await flushPendingSave();

    setActiveNoteId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setSaveStatus('idle');
    setLastSavedAt(new Date(note.updated_at));
    setMobileView('editor');
  };

  // Create a new note
  const handleCreateNote = async () => {
    await flushPendingSave();

    try {
      setSaveStatus('saving');
      const newNote = await createStudentNote({
        title: 'Untitled Note',
        content: ''
      });

      setNotes((prev) => [newNote, ...prev]);
      setActiveNoteId(newNote.id);
      setEditTitle(newNote.title);
      setEditContent(newNote.content);
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      setMobileView('editor');
    } catch (err: any) {
      console.error('[MyNotesPage] Create failed:', err);
      alert(err.message || 'Unable to create note. Please try again.');
      setSaveStatus('error');
    }
  };

  // Schedule debounced autosave
  const triggerDebouncedSave = (newTitle: string, newContent: string) => {
    if (!activeNoteId) return;

    setSaveStatus('saving');
    setSaveErrorMsg(null);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const updated = await updateStudentNote(activeNoteId, {
          title: newTitle,
          content: newContent
        });

        // Update list in-place and sort by latest updated_at
        setNotes((prev) => {
          const filtered = prev.filter((n) => n.id !== activeNoteId);
          return [updated, ...filtered];
        });

        setSaveStatus('saved');
        setLastSavedAt(new Date());
      } catch (err: any) {
        console.error('[MyNotesPage] Autosave failed:', err);
        setSaveStatus('error');
        setSaveErrorMsg(err.message || 'Save failed. Click retry.');
      }
    }, 600);
  };

  // Title change handler
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEditTitle(val);
    triggerDebouncedSave(val, editContent);
  };

  // Content change handler
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditContent(val);
    triggerDebouncedSave(editTitle, val);
  };

  // Confirm and execute note deletion
  const handleConfirmDelete = async () => {
    if (!noteToDelete) return;
    setIsDeleting(true);

    try {
      await deleteStudentNote(noteToDelete.id);

      const remaining = notes.filter((n) => n.id !== noteToDelete.id);
      setNotes(remaining);

      if (activeNoteId === noteToDelete.id) {
        if (remaining.length > 0) {
          const next = remaining[0];
          setActiveNoteId(next.id);
          setEditTitle(next.title);
          setEditContent(next.content);
          setSaveStatus('idle');
          setLastSavedAt(new Date(next.updated_at));
        } else {
          setActiveNoteId(null);
          setEditTitle('');
          setEditContent('');
          setSaveStatus('idle');
          setMobileView('list');
        }
      }

      setNoteToDelete(null);
    } catch (err: any) {
      console.error('[MyNotesPage] Delete failed:', err);
      alert(err.message || 'Failed to delete note.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Manual retry save handler
  const handleRetrySave = () => {
    triggerDebouncedSave(editTitle, editContent);
  };

  // Filtered notes list based on search query
  const filteredNotes = filterNotes(notes, searchQuery);
  const activeNote = notes.find((n) => n.id === activeNoteId);

  // Format relative timestamp
  const formatTime = (dateStr?: string | Date | null) => {
    if (!dateStr) return '';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 30) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const wordCount = editContent.trim() ? editContent.trim().split(/\s+/).length : 0;
  const charCount = editContent.length;

  return (
    <AppShell>
      <div className="notes-page-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '1rem' }}>
        
        {/* Top Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0 }}>
              My Notes
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem', margin: 0 }}>
              Personal academic study notes, revisions, and lecture takeaways.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={handleCreateNote}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '8px'
              }}
            >
              <Plus size={16} />
              <span>New Note</span>
            </button>
          </div>
        </div>

        {/* Load Error Banner */}
        {loadError && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--color-error-bg)', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-error)', fontSize: '0.875rem' }}>
              <AlertCircle size={18} />
              <span>{loadError}</span>
            </div>
            <button onClick={() => loadNotes()} className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
              <RefreshCw size={14} style={{ marginRight: '0.25rem' }} /> Retry
            </button>
          </div>
        )}

        {/* Main Content Pane */}
        {loading ? (
          <LoadingState message="Loading your personal notes..." />
        ) : notes.length === 0 ? (
          <EmptyState
            icon={Notebook}
            title="No notes yet"
            description="Create your first study note to organize lecture summaries, revisions, and personal thoughts."
            actionLabel="Create First Note"
            onAction={handleCreateNote}
          />
        ) : (
          <div 
            className="notes-layout"
            style={{
              display: 'grid',
              gridTemplateColumns: '320px 1fr',
              gap: '1rem',
              flex: 1,
              minHeight: 0,
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              boxShadow: 'var(--box-shadow-sm)',
              overflow: 'hidden'
            }}
          >
            {/* LEFT SIDEBAR: Search + Notes List */}
            <div 
              className={`notes-sidebar-pane ${mobileView === 'editor' ? 'mobile-hidden' : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                overflow: 'hidden'
              }}
            >
              {/* Search Bar */}
              <div style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ position: 'relative' }}>
                  <Search 
                    size={16} 
                    style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-dark-grey)' }} 
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notes..."
                    style={{
                      width: '100%',
                      padding: '0.45rem 2rem 0.45rem 2.25rem',
                      fontSize: '0.85rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      outline: 'none'
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '0.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--brand-dark-grey)',
                        padding: '0.2rem'
                      }}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Notes List Scroll Area */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredNotes.length === 0 ? (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--brand-dark-grey)', fontSize: '0.85rem' }}>
                    <p style={{ margin: 0, fontWeight: 500 }}>No matching notes found</p>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: 'var(--brand-blue)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                ) : (
                  filteredNotes.map((note) => {
                    const isSelected = note.id === activeNoteId;
                    const previewText = note.content.trim() ? note.content.slice(0, 80) : 'No additional text';

                    return (
                      <div
                        key={note.id}
                        onClick={() => handleSelectNote(note)}
                        style={{
                          padding: '0.85rem 1rem',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#ffffff' : 'transparent',
                          borderLeft: isSelected ? '4px solid var(--brand-orange)' : '4px solid transparent',
                          transition: 'background-color 0.15s ease',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span 
                            style={{ 
                              fontWeight: isSelected ? 600 : 500, 
                              fontSize: '0.9rem', 
                              color: 'var(--brand-black)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {note.title.trim() || 'Untitled Note'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', flexShrink: 0 }}>
                            {formatTime(note.updated_at)}
                          </span>
                        </div>

                        <p 
                          style={{ 
                            fontSize: '0.8rem', 
                            color: 'var(--brand-dark-grey)', 
                            margin: '0.25rem 0 0 0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {previewText}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT PANE: Distraction-Free Note Editor */}
            <div 
              className={`notes-editor-pane ${mobileView === 'list' ? 'mobile-hidden' : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                backgroundColor: '#ffffff'
              }}
            >
              {activeNote ? (
                <>
                  {/* Editor Header Bar */}
                  <div 
                    style={{ 
                      padding: '0.75rem 1.25rem', 
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}
                  >
                    {/* Left: Mobile back button + Autosave indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button
                        className="mobile-back-btn"
                        onClick={() => {
                          flushPendingSave();
                          setMobileView('list');
                        }}
                        style={{
                          display: 'none', // Shown via CSS media query
                          alignItems: 'center',
                          gap: '0.25rem',
                          background: 'none',
                          border: 'none',
                          color: 'var(--brand-dark-grey)',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        <ArrowLeft size={16} />
                        <span>Notes</span>
                      </button>

                      {/* Autosave Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                        {saveStatus === 'saving' && (
                          <span style={{ color: 'var(--brand-dark-grey)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Loader2 size={14} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                            <span>Saving...</span>
                          </span>
                        )}
                        {saveStatus === 'saved' && (
                          <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <CheckCircle2 size={14} />
                            <span>Saved {lastSavedAt ? `at ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                          </span>
                        )}
                        {saveStatus === 'error' && (
                          <span style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <AlertCircle size={14} />
                            <span>{saveErrorMsg || 'Save error'}</span>
                            <button
                              onClick={handleRetrySave}
                              style={{ background: 'none', border: 'none', color: 'var(--brand-orange)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                            >
                              Retry
                            </button>
                          </span>
                        )}
                        {saveStatus === 'idle' && lastSavedAt && (
                          <span style={{ color: 'var(--brand-dark-grey)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Clock size={13} />
                            <span>Updated {formatTime(lastSavedAt)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions (Delete) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => setNoteToDelete(activeNote)}
                        className="btn btn-secondary"
                        style={{
                          padding: '0.4rem 0.65rem',
                          fontSize: '0.8rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          color: '#dc2626',
                          borderColor: '#fee2e2',
                          backgroundColor: '#fef2f2'
                        }}
                        title="Delete note"
                      >
                        <Trash2 size={14} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Title Input */}
                  <div style={{ padding: '1rem 1.25rem 0.5rem 1.25rem' }}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={handleTitleChange}
                      placeholder="Note Title..."
                      style={{
                        width: '100%',
                        fontSize: '1.4rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                        color: 'var(--brand-black)',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        padding: '0.25rem 0'
                      }}
                    />
                  </div>

                  {/* Metadata Bar */}
                  <div style={{ padding: '0 1.25rem 0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--brand-dark-grey)', borderBottom: '1px solid #f8fafc' }}>
                    <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                    <span>•</span>
                    <span>{charCount} characters</span>
                    <span>•</span>
                    <span>Created: {new Date(activeNote.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* Content Area */}
                  <div style={{ flex: 1, padding: '1rem 1.25rem', overflow: 'hidden' }}>
                    <textarea
                      value={editContent}
                      onChange={handleContentChange}
                      placeholder="Type your notes here... (Supports lecture notes, study outlines, exam preparation, and references)"
                      style={{
                        width: '100%',
                        height: '100%',
                        resize: 'none',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '0.95rem',
                        lineHeight: 1.6,
                        fontFamily: 'var(--font-sans)',
                        color: 'var(--brand-black)',
                        padding: 0
                      }}
                    />
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'var(--brand-dark-grey)' }}>
                  <Notebook size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                  <p style={{ fontWeight: 500, margin: 0 }}>Select a note from the left to view and edit</p>
                  <button
                    onClick={handleCreateNote}
                    className="btn btn-secondary"
                    style={{ marginTop: '1rem', fontSize: '0.85rem' }}
                  >
                    <Plus size={14} style={{ marginRight: '0.25rem' }} /> Create New Note
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {noteToDelete && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem'
            }}
          >
            <div 
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                padding: '1.5rem',
                maxWidth: '420px',
                width: '100%',
                boxShadow: 'var(--box-shadow-lg)'
              }}
            >
              <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--brand-black)' }}>
                Delete Note
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong>"{noteToDelete.title || 'Untitled Note'}"</strong>? This action cannot be undone.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setNoteToDelete(null)}
                  disabled={isDeleting}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="btn btn-primary"
                  style={{
                    backgroundColor: '#dc2626',
                    borderColor: '#dc2626',
                    fontSize: '0.85rem',
                    padding: '0.45rem 1rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  {isDeleting && <Loader2 size={14} className="spinner" />}
                  <span>{isDeleting ? 'Deleting...' : 'Delete Note'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Responsive Style Overrides */}
      <style>{`
        @media (max-width: 768px) {
          .notes-layout {
            grid-template-columns: 1fr !important;
          }
          .notes-sidebar-pane.mobile-hidden {
            display: none !important;
          }
          .notes-editor-pane.mobile-hidden {
            display: none !important;
          }
          .mobile-back-btn {
            display: inline-flex !important;
          }
        }
      `}</style>
    </AppShell>
  );
};

export default MyNotesPage;

