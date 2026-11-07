import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Megaphone, Calendar, Paperclip, ArrowRight } from 'lucide-react';
import { getDepartmentAnnouncements, getReadAnnouncements } from '../services/announcementService';
import type { Announcement } from '../data/announcements';
import { useAuth } from '../app/context/AuthContext';

export const AnnouncementsPage: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      if (!profile?.department_id) return;
      try {
        const [data, reads] = await Promise.all([
          getDepartmentAnnouncements(profile.department_id),
          profile.id ? getReadAnnouncements(profile.id) : Promise.resolve([])
        ]);
        setAnnouncements(data);
        setReadIds(new Set(reads));
      } catch (err) {
        console.error("Error fetching announcements:", err);
      } finally {
        setLoading(false);
      }
    };

    if (profile?.department_id) {
      fetchAnnouncements();
    } else if (profile) {
      // If profile is loaded but no department
      setLoading(false);
    }
  }, [profile]);

  return (
    <AppShell>
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Communication</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Announcements</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Campus Announcements</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Official notices from college administration, departments, and event committees
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>Loading Announcements...</div>
        ) : announcements.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>No announcements available at this time.</div>
        ) : (
          announcements.map((anc) => {
            const isUnread = !readIds.has(anc.id);
            return (
              <div 
                key={anc.id} 
                className="card-box"
                style={{ cursor: 'pointer', transition: 'box-shadow 0.2s ease, transform 0.15s ease' }}
                onClick={() => navigate(`/student/announcements/${anc.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/student/announcements/${anc.id}`); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Megaphone size={18} className="text-orange-icon" />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{anc.title}</h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge badge-active font-mono" style={{ fontSize: '0.75rem' }}>
                      {anc.category}
                    </span>
                    {isUnread && (
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        backgroundColor: '#DBEAFE',
                        color: '#1E40AF'
                      }}>
                        New
                      </span>
                    )}
                  </div>
                </div>

                <p style={{ fontSize: '0.95rem', color: 'var(--brand-black)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {anc.content}
                </p>

                {anc.attachmentPath && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', fontSize: '0.8rem', color: '#2563EB', fontWeight: 500 }}>
                    <Paperclip size={14} />
                    <span>{anc.attachmentName || 'Attachment available'}</span>
                    {anc.attachmentSize && (
                      <span style={{ color: '#64748B', fontSize: '0.75rem' }}>
                        ({(anc.attachmentSize / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    )}
                  </div>
                )}

                <div style={{ 
                  marginTop: '1rem', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  flexWrap: 'wrap', 
                  gap: '1rem', 
                  fontSize: '0.8rem', 
                  color: 'var(--brand-dark-grey)', 
                  borderTop: '1px solid rgba(156, 163, 175, 0.15)', 
                  paddingTop: '0.75rem' 
                }}>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <span>From: <strong>{anc.createdBy} ({anc.authorRole})</strong></span>
                    <span className="font-mono"><Calendar size={12} style={{ display: 'inline', marginRight: '0.2rem' }} />{anc.publishedAt}</span>
                  </div>

                  <span style={{ color: 'var(--brand-blue, #0b53a0)', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    View details <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
};

export default AnnouncementsPage;
