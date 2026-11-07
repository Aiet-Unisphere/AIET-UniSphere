import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Megaphone, 
  Calendar, 
  User, 
  Building2, 
  Users, 
  Paperclip, 
  Download, 
  CheckCircle2, 
  Tag, 
  AlertCircle 
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { 
  getAnnouncementById, 
  downloadAnnouncementAttachment, 
  markAnnouncementAsRead 
} from '../services/announcementService';
import type { Announcement } from '../data/announcements';
import { useAuth } from '../app/context/AuthContext';

export const AnnouncementDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Attachment download state
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isRead, setIsRead] = useState(false);

  const fetchAnnouncement = async () => {
    if (!id) {
      setError("No announcement ID provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getAnnouncementById(id);
      if (!data) {
        setError("Announcement not found or is no longer available.");
        return;
      }

      // Authorization guard: Student can only view PUBLISHED announcements
      if (profile?.role === 'STUDENT' && data.status !== 'Published') {
        setError("This announcement has not been published yet.");
        return;
      }

      // Department scoping check: If user has a department, ensure it matches
      if (profile?.department_id && data.departmentId && profile.department_id !== data.departmentId) {
        // Admin can view any, but students only view their own department's
        if (profile.role !== 'ADMIN') {
          setError("You do not have access to announcements from this department.");
          return;
        }
      }

      setAnnouncement(data);

      // Mark as read for authenticated student
      if (profile?.id) {
        await markAnnouncementAsRead(data.id, profile.id);
        setIsRead(true);
      }
    } catch (err: any) {
      console.error("Error fetching announcement details:", err);
      setError("Unable to load announcement details. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncement();
  }, [id, profile?.id]);

  const handleDownloadAttachment = async () => {
    if (!announcement?.attachmentPath) return;

    setDownloading(true);
    setDownloadError(null);

    try {
      await downloadAnnouncementAttachment(
        announcement.attachmentPath,
        announcement.attachmentName || 'Announcement_Document.pdf'
      );
    } catch (err: any) {
      console.error("Error downloading attachment:", err);
      setDownloadError(err.message || "Failed to download announcement attachment. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <LoadingState message="Loading announcement details..." />
      </AppShell>
    );
  }

  if (error || !announcement) {
    return (
      <AppShell>
        <div style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
          <button 
            onClick={() => navigate('/student/announcements')}
            className="btn btn-secondary font-sans"
            style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.825rem', gap: '0.35rem' }}
          >
            <ArrowLeft size={16} /> Back to Announcements
          </button>
        </div>
        <ErrorState 
          message={error || "Announcement not found."} 
          onRetry={fetchAnnouncement} 
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Back button & Breadcrumbs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button 
          onClick={() => navigate('/student/announcements')}
          className="btn btn-secondary font-sans"
          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <ArrowLeft size={16} /> Back to Announcements
        </button>

        <div className="breadcrumbs" style={{ margin: 0 }}>
          <span>Communication</span>
          <span className="breadcrumbs-separator">/</span>
          <span 
            onClick={() => navigate('/student/announcements')}
            style={{ cursor: 'pointer', color: 'var(--brand-blue, #0b53a0)' }}
          >
            Announcements
          </span>
          <span className="breadcrumbs-separator">/</span>
          <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Detail</span>
        </div>
      </div>

      {/* Main Notice Box */}
      <div className="card-box" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Header Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand-orange, #f97316)'
              }}>
                <Megaphone size={22} />
              </div>
              <span className="badge badge-active font-mono" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                {announcement.category}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {isRead && (
                <span style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.3rem', 
                  fontSize: '0.75rem', 
                  color: '#166534', 
                  backgroundColor: '#DCFCE7',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontWeight: 600
                }}>
                  <CheckCircle2 size={13} /> Read
                </span>
              )}
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--brand-dark-grey)',
                backgroundColor: '#F1F5F9',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                fontWeight: 600
              }}>
                Target: {announcement.targetAudience}
              </span>
            </div>
          </div>

          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-black)', lineHeight: 1.3, margin: 0 }}>
            {announcement.title}
          </h1>
        </div>

        {/* Metadata Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          padding: '1rem',
          backgroundColor: '#F8FAFC',
          borderRadius: 'var(--border-radius, 8px)',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Building2 size={16} style={{ color: 'var(--brand-blue, #0b53a0)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', textTransform: 'uppercase', fontWeight: 600 }}>Department</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)' }}>{announcement.departmentName}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <User size={16} style={{ color: 'var(--brand-blue, #0b53a0)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', textTransform: 'uppercase', fontWeight: 600 }}>Published By</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                {announcement.createdBy} ({announcement.authorRole})
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Calendar size={16} style={{ color: 'var(--brand-blue, #0b53a0)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', textTransform: 'uppercase', fontWeight: 600 }}>Published At</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)' }} className="font-mono">
                {announcement.publishedAt}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Users size={16} style={{ color: 'var(--brand-blue, #0b53a0)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', textTransform: 'uppercase', fontWeight: 600 }}>Audience</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                {announcement.targetAudience}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.025em' }}>
            Notice Content
          </h2>
          <div style={{
            fontSize: '1rem',
            lineHeight: 1.65,
            color: 'var(--brand-black)',
            whiteSpace: 'pre-wrap',
            padding: '1.25rem',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--border-radius, 8px)',
            border: '1px solid #E2E8F0'
          }}>
            {announcement.content}
          </div>
        </div>

        {/* Supporting Attachment Section */}
        {announcement.attachmentPath && (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.025em' }}>
              Official Attachment / Circular
            </h2>
            <div style={{
              padding: '1rem 1.25rem',
              backgroundColor: '#EFF6FF',
              borderRadius: 'var(--border-radius, 8px)',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  backgroundColor: '#DBEAFE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563EB',
                  flexShrink: 0
                }}>
                  <Paperclip size={18} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1E40AF', wordBreak: 'break-all' }}>
                    {announcement.attachmentName || 'Announcement_Document.pdf'}
                  </span>
                  {announcement.attachmentSize && (
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {(announcement.attachmentSize / (1024 * 1024)).toFixed(2)} MB
                      {announcement.attachmentType ? ` • ${announcement.attachmentType}` : ''}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={downloading}
                onClick={handleDownloadAttachment}
                className="btn btn-secondary font-sans"
                style={{
                  fontSize: '0.825rem',
                  padding: '0.45rem 0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  backgroundColor: '#FFFFFF',
                  color: '#1E40AF',
                  borderColor: '#93C5FD'
                }}
              >
                <Download size={15} />
                <span>{downloading ? 'Downloading...' : 'Download Attachment'}</span>
              </button>
            </div>

            {downloadError && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.6rem 0.85rem',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '6px',
                color: '#991B1B',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <AlertCircle size={15} />
                <span>{downloadError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default AnnouncementDetail;
