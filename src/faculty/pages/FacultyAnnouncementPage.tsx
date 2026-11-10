import React, { useEffect, useState } from 'react';
import { 
  Megaphone, 
  Search, 
  Calendar, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  Eye, 
  Inbox, 
  Paperclip, 
  Download, 
  Loader2 
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { StatCard } from '../../components/StatCard';
import { 
  getDepartmentAnnouncements, 
  getReadAnnouncements, 
  markAnnouncementAsRead,
  downloadAnnouncementAttachment
} from '../../services/announcementService';
import type { Announcement } from '../../data/announcements';
import { useAuth } from '../../app/context/AuthContext';

export const FacultyAnnouncementPage: React.FC = () => {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unread' | 'Read'>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Academic' | 'Exam' | 'Event' | 'General'>('All');
  
  // Selected detail
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownload = async (anc: Announcement, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!anc.attachmentPath || downloadingId) return;

    setDownloadingId(anc.id);
    setDownloadError(null);

    try {
      await downloadAnnouncementAttachment(
        anc.attachmentPath,
        anc.attachmentName || 'Announcement_Document.pdf',
        anc.id
      );
    } catch (err: any) {
      console.error('[FacultyAnnouncementPage] Download error:', err);
      setDownloadError(err.message || 'Failed to download attachment. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (profile?.department_id && profile?.id) {
      loadData();
    }
  }, [profile]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [announcementsData, readList] = await Promise.all([
        getDepartmentAnnouncements(profile?.department_id || undefined),
        getReadAnnouncements(profile!.id)
      ]);
      
      // Filter out student-only announcements
      const facultyTargeted = announcementsData.filter(
        a => a.targetAudience === 'Faculty' || a.targetAudience === 'Students + Faculty'
      );

      setAnnouncements(facultyTargeted);
      setReadIds(readList);
    } catch (err) {
      console.error("Error loading faculty announcements:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAnnouncement = async (anc: Announcement) => {
    setSelectedAnnouncement(anc);
    setDownloadError(null);
    if (profile?.id && !readIds.includes(anc.id)) {
      const success = await markAnnouncementAsRead(anc.id, profile.id);
      if (success) {
        setReadIds(prev => [...prev, anc.id]);
      }
    }
  };

  // Filter announcements logic
  const filteredAnnouncements = announcements.filter(anc => {
    const matchesSearch = 
      anc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      anc.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const isRead = readIds.includes(anc.id);
    const matchesStatus = 
      statusFilter === 'All' ? true :
      statusFilter === 'Read' ? isRead : !isRead;

    const matchesCategory =
      categoryFilter === 'All' ? true : anc.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Calculate Metrics
  const totalCount = announcements.length;
  const unreadCount = announcements.filter(a => !readIds.includes(a.id)).length;
  const academicCount = announcements.filter(a => a.category === 'Academic' || a.category === 'Exam').length;
  const generalCount = announcements.filter(a => a.category === 'General' || a.category === 'Event').length;

  return (
    <FacultyAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span className="badge badge-active font-mono">COMMUNICATION</span>
        <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
          Faculty Announcements
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
          Official alerts, general updates, and notices from Department Head and Admin
        </p>
      </div>

      {/* KPI Cards */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          title="UNREAD NOTICES"
          value={unreadCount}
          subtitle={`Out of ${totalCount} announcements`}
          icon={<AlertCircle size={22} />}
        />
        <StatCard
          title="ACADEMIC & EXAMS"
          value={academicCount}
          subtitle="Department Updates"
          icon={<Megaphone size={22} />}
        />
        <StatCard
          title="EVENTS & GENERAL"
          value={generalCount}
          subtitle="Campus Announcements"
          icon={<CheckCircle2 size={22} />}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="dashboard-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-dark-grey)' }} />
            <input 
              type="text" 
              placeholder="Search announcements..." 
              className="form-input font-sans"
              style={{ paddingLeft: '2.25rem', width: '100%' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>Category:</span>
            <select 
              className="form-select font-sans"
              style={{ width: '130px', padding: '0.35rem 0.5rem' }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
            >
              <option value="All">All</option>
              <option value="Academic">Academic</option>
              <option value="Exam">Exam</option>
              <option value="Event">Event</option>
              <option value="General">General</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>Status:</span>
            <select 
              className="form-select font-sans"
              style={{ width: '120px', padding: '0.35rem 0.5rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="All">All</option>
              <option value="Unread">Unread</option>
              <option value="Read">Read</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="dashboard-panel">
        <h2 className="panel-title font-display" style={{ marginBottom: '1.25rem' }}>Notices & Circulars</h2>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            Loading announcements...
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <Inbox size={42} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
            <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)' }}>No announcements found</p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Try adjusting your search query or filters</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredAnnouncements.map((anc) => {
              const isRead = readIds.includes(anc.id);
              return (
                <div 
                  key={anc.id}
                  onClick={() => handleOpenAnnouncement(anc)}
                  style={{
                    padding: '1.25rem',
                    backgroundColor: isRead ? 'var(--brand-light-grey)' : '#FFF8F4',
                    borderRadius: 'var(--border-radius)',
                    border: isRead ? '1px solid rgba(156, 163, 175, 0.2)' : '1px solid rgba(249, 115, 22, 0.25)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isRead ? 'none' : '0 2px 8px rgba(249, 115, 22, 0.05)',
                    position: 'relative'
                  }}
                  className="announcement-item-card"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      {!isRead && (
                        <span 
                          style={{
                            width: '8px',
                            height: '8px',
                            backgroundColor: 'var(--brand-orange)',
                            borderRadius: '50%',
                            display: 'inline-block'
                          }}
                          title="Unread Notice"
                        />
                      )}
                      <h3 style={{ fontSize: '1.05rem', fontWeight: isRead ? 700 : 800, color: 'var(--brand-black)', margin: 0 }}>
                        {anc.title}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-active font-mono" style={{ fontSize: '0.75rem' }}>{anc.category}</span>
                      {!isRead && <span className="badge font-mono" style={{ backgroundColor: 'var(--brand-orange)', color: '#fff', fontSize: '0.7rem' }}>NEW</span>}
                    </div>
                  </div>

                  <p style={{ fontSize: '0.9rem', color: 'var(--brand-black)', lineHeight: 1.5, margin: '0.5rem 0 0.5rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {anc.content}
                  </p>

                  {/* Attachment Pill Indicator */}
                  {anc.attachmentPath && (
                    <div 
                      style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.4rem', 
                        margin: '0.25rem 0 0.75rem 0',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #DBEAFE',
                        fontSize: '0.8rem', 
                        color: '#1E40AF', 
                        fontWeight: 500,
                        maxWidth: '100%',
                        overflow: 'hidden'
                      }}
                      title={anc.attachmentName || 'Official Attachment Available'}
                    >
                      <Paperclip size={13} style={{ flexShrink: 0, color: '#2563EB' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {anc.attachmentName || 'Attachment available'}
                      </span>
                      {anc.attachmentSize && (
                        <span style={{ color: '#64748B', fontSize: '0.725rem', flexShrink: 0 }}>
                          ({formatFileSize(anc.attachmentSize)})
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(156, 163, 175, 0.12)', fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <span>Author: <strong>{anc.createdBy}</strong> ({anc.authorRole})</span>
                      <span>Target: <strong>{anc.targetAudience}</strong></span>
                      <span className="font-mono"><Calendar size={12} style={{ display: 'inline', marginRight: '0.2rem' }} />{anc.publishedAt}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--brand-orange)', fontWeight: 600 }}>
                      <span>View details</span>
                      <Eye size={12} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Announcement Detail Modal */}
      {selectedAnnouncement && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '600px', backgroundColor: '#FFF', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow-lg)', padding: '1.75rem' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <div>
                <span className="badge badge-active font-mono" style={{ marginRight: '0.5rem' }}>{selectedAnnouncement.category}</span>
                <span className="badge font-mono" style={{ backgroundColor: 'rgba(15, 23, 42, 0.08)', color: 'var(--brand-black)' }}>{selectedAnnouncement.targetAudience}</span>
                <h2 className="font-display" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.5rem', margin: 0 }}>
                  {selectedAnnouncement.title}
                </h2>
              </div>
              <button onClick={() => { setSelectedAnnouncement(null); setDownloadError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-dark-grey)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.95rem', color: 'var(--brand-black)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
                {selectedAnnouncement.content}
              </p>
            </div>

            {/* Supporting Attachment Section */}
            {selectedAnnouncement.attachmentPath && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--brand-dark-grey)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '0.5rem'
                }}>
                  Official Attachment / Circular
                </div>

                <div style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: '#F8FAFC',
                  borderRadius: 'var(--border-radius)',
                  border: '1px solid rgba(156, 163, 175, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '6px',
                      backgroundColor: '#EFF6FF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2563EB',
                      flexShrink: 0
                    }}>
                      <Paperclip size={16} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)', wordBreak: 'break-all' }}>
                        {selectedAnnouncement.attachmentName || 'Announcement_Document.pdf'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                        {selectedAnnouncement.attachmentSize ? formatFileSize(selectedAnnouncement.attachmentSize) : 'Document'}
                        {selectedAnnouncement.attachmentType ? ` • ${selectedAnnouncement.attachmentType}` : ''}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={downloadingId === selectedAnnouncement.id}
                    onClick={() => handleDownload(selectedAnnouncement)}
                    className="btn btn-secondary font-sans"
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.4rem 0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      width: 'auto'
                    }}
                  >
                    {downloadingId === selectedAnnouncement.id ? (
                      <>
                        <Loader2 size={14} className="spinner" />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        <span>Download Attachment</span>
                      </>
                    )}
                  </button>
                </div>

                {downloadError && (
                  <div style={{
                    marginTop: '0.65rem',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--border-radius)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--brand-danger)'
                  }}>
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{downloadError}</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid rgba(156, 163, 175, 0.2)', fontSize: '0.8rem', color: 'var(--brand-dark-grey)', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                Published By: <strong>{selectedAnnouncement.createdBy}</strong> ({selectedAnnouncement.authorRole})
              </div>
              <div className="font-mono">
                {selectedAnnouncement.publishedAt}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button 
                onClick={() => { setSelectedAnnouncement(null); setDownloadError(null); }} 
                className="btn btn-primary font-sans"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </FacultyAppShell>
  );
};

export default FacultyAnnouncementPage;
