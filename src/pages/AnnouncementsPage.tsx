import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Megaphone, Calendar } from 'lucide-react';
import { getDepartmentAnnouncements } from '../services/announcementService';
import type { Announcement } from '../data/announcements';
import { useAuth } from '../app/context/AuthContext';

export const AnnouncementsPage: React.FC = () => {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      if (!profile?.department_id) return;
      try {
        const data = await getDepartmentAnnouncements(profile.department_id);
        setAnnouncements(data);
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
          announcements.map((anc) => (
            <div key={anc.id} className="card-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <Megaphone size={18} className="text-orange-icon" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{anc.title}</h3>
              </div>
              <p style={{ fontSize: '0.95rem', color: 'var(--brand-black)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                {anc.content}
              </p>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                <span>From: <strong>{anc.createdBy} ({anc.authorRole})</strong></span>
                <span className="font-mono"><Calendar size={12} style={{ display: 'inline', marginRight: '0.2rem' }} />{anc.publishedAt}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
};
export default AnnouncementsPage;
