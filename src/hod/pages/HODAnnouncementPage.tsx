import React, { useEffect, useState } from 'react';
import { Megaphone, Plus, Calendar, CheckCircle2, Clock, Trash2, Send, X, Users } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { StatCard } from '../../components/StatCard';
import { getDepartmentAnnouncements, createDepartmentAnnouncement, publishAnnouncement, deleteAnnouncement } from '../../services/announcementService';
import type { Announcement } from '../../data/announcements';
import { useAuth } from '../../app/context/AuthContext';
import { supabase } from '../../lib/supabase';

export const HODAnnouncementPage: React.FC = () => {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Recipient Counts
  const [studentCount, setStudentCount] = useState<number>(0);
  const [facultyCount, setFacultyCount] = useState<number>(0);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'Academic' | 'Exam' | 'Event' | 'General'>('Academic');
  const [targetAudience, setTargetAudience] = useState<'Students' | 'Faculty' | 'Students + Faculty'>('Students + Faculty');
  const [isDraft, setIsDraft] = useState(false);

  useEffect(() => {
    if (profile?.department_id) {
      loadAnnouncements();
      loadRecipientCounts();
    }
  }, [profile]);

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const data = await getDepartmentAnnouncements(profile?.department_id || undefined);
      setAnnouncements(data);
    } catch (err) {
      console.error("Error loading announcements:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecipientCounts = async () => {
    if (!profile?.department_id) return;
    try {
      const [studentsRes, facultyRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('department_id', profile.department_id)
          .eq('role', 'STUDENT'),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('department_id', profile.department_id)
          .eq('role', 'FACULTY')
      ]);

      setStudentCount(studentsRes.count || 0);
      setFacultyCount(facultyRes.count || 0);
    } catch (err) {
      console.error("Error loading recipient counts:", err);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !profile?.department_id || !profile?.id) return;

    try {
      await createDepartmentAnnouncement({
        title,
        content,
        category,
        departmentId: profile.department_id,
        createdBy: profile.id,
        targetAudience,
        status: isDraft ? 'Draft' : 'Published'
      });

      setActionSuccess(isDraft ? 'Announcement saved as Draft.' : 'Department Announcement published! Shared with Student & Faculty portals.');
      setIsCreateModalOpen(false);
      // Reset form
      setTitle('');
      setContent('');
      setIsDraft(false);
      setTargetAudience('Students + Faculty');
      setCategory('Academic');
      loadAnnouncements();
    } catch (err) {
      console.error("Error creating announcement:", err);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await publishAnnouncement(id);
      setActionSuccess('Announcement Published successfully. Visible across Student and Faculty portals.');
      loadAnnouncements();
    } catch (err) {
      console.error("Publish error:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this announcement?")) {
      try {
        await deleteAnnouncement(id);
        setActionSuccess('Announcement deleted.');
        loadAnnouncements();
      } catch (err) {
        console.error("Delete error:", err);
      }
    }
  };

  const publishedCount = announcements.filter(a => a.status === 'Published').length;
  const draftCount = announcements.filter(a => a.status === 'Draft').length;

  const getRecipientNumber = (audience: 'Students' | 'Faculty' | 'Students + Faculty') => {
    if (audience === 'Students') return studentCount;
    if (audience === 'Faculty') return facultyCount;
    return studentCount + facultyCount;
  };

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <span className="badge badge-active font-mono">COMMUNICATION</span>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Department Announcements & Notices
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            Publish official departmental notices, exam alerts, and academic updates
          </p>
        </div>

        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary font-sans"
        >
          <Plus size={16} />
          <span>Create Announcement</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="dashboard-panel" style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CheckCircle2 size={20} style={{ color: '#16A34A' }} />
          <div style={{ color: '#15803D', fontWeight: 600, fontSize: '0.9rem' }}>{actionSuccess}</div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          title="PUBLISHED NOTICES"
          value={publishedCount}
          subtitle="Visible to Department"
          icon={<Megaphone size={22} />}
        />
        <StatCard
          title="DRAFT NOTICES"
          value={draftCount}
          subtitle="Pending Publication"
          icon={<Clock size={22} />}
        />
        <StatCard
          title="DEPARTMENT SCOPE"
          value={`${studentCount + facultyCount} Recipients`}
          subtitle={`${studentCount} Students · ${facultyCount} Faculty`}
          icon={<Users size={22} />}
        />
      </div>

      {/* Main List */}
      <div className="dashboard-panel">
        <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>All Department Notices</h2>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            Loading Announcements...
          </div>
        ) : announcements.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <Megaphone size={36} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
            <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)' }}>No announcements published yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {announcements.map((anc) => (
              <div 
                key={anc.id}
                style={{
                  padding: '1.25rem',
                  backgroundColor: 'var(--brand-light-grey)',
                  borderRadius: 'var(--border-radius)',
                  border: '1px solid rgba(156, 163, 175, 0.2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Megaphone size={18} className="text-orange" />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0 }}>
                      {anc.title}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge badge-active font-mono" style={{ fontSize: '0.75rem' }}>{anc.category}</span>
                    <span className={`badge ${anc.status === 'Published' ? 'badge-active' : 'badge-pending'}`}>
                      {anc.status}
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.925rem', color: 'var(--brand-black)', lineHeight: 1.55, margin: '0.5rem 0 1rem 0' }}>
                  {anc.content}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(156, 163, 175, 0.15)', fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <span>By: <strong>{anc.createdBy}</strong> ({anc.authorRole})</span>
                    <span>Target: <strong style={{ color: anc.targetAudience === 'Students + Faculty' ? 'var(--brand-orange)' : 'inherit' }}>{anc.targetAudience}</strong> ({getRecipientNumber(anc.targetAudience)} recipients)</span>
                    <span className="font-mono">{anc.publishedAt}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {anc.status === 'Draft' && (
                      <button 
                        onClick={() => handlePublish(anc.id)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                      >
                        <Send size={12} /> Publish
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(anc.id)}
                      className="btn btn-secondary text-error"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Announcement Modal */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="dashboard-panel" style={{ width: '100%', maxWidth: '600px', backgroundColor: '#FFF', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow-lg)', padding: '1.75rem' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <div>
                <span className="badge badge-active font-mono">DEPARTMENT ANNOUNCEMENT</span>
                <h2 className="font-display" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem', margin: 0 }}>
                  Create New Notice
                </h2>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-dark-grey)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)', display: 'block', marginBottom: '0.35rem' }}>TITLE</label>
                <input 
                  type="text" 
                  className="form-input font-sans" 
                  placeholder="e.g., Mid-Semester Examination Schedule Revision"
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)', display: 'block', marginBottom: '0.35rem' }}>CATEGORY</label>
                  <select 
                    className="form-select font-sans" 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value as any)}
                  >
                    <option value="Academic">Academic</option>
                    <option value="Exam">Exam</option>
                    <option value="Event">Event</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)', display: 'block', marginBottom: '0.35rem' }}>TARGET AUDIENCE</label>
                  <select 
                    className="form-select font-sans" 
                    value={targetAudience} 
                    onChange={(e) => setTargetAudience(e.target.value as any)}
                  >
                    <option value="Students + Faculty">Students + Faculty</option>
                    <option value="Students">Students Only</option>
                    <option value="Faculty">Faculty Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)', display: 'block', marginBottom: '0.35rem' }}>ANNOUNCEMENT CONTENT</label>
                <textarea 
                  className="form-input font-sans" 
                  style={{ width: '100%', height: '110px', padding: '0.55rem', resize: 'vertical' }}
                  placeholder="Enter complete notice text..."
                  value={content} 
                  onChange={(e) => setContent(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input 
                  type="checkbox" 
                  id="draftCheck" 
                  checked={isDraft} 
                  onChange={(e) => setIsDraft(e.target.checked)} 
                />
                <label htmlFor="draftCheck" style={{ fontSize: '0.85rem', color: 'var(--brand-black)', cursor: 'pointer' }}>
                  Save as Draft (Do not publish immediately)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn btn-secondary font-sans">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary font-sans">
                  <Send size={16} />
                  <span>{isDraft ? 'Save Draft' : 'Publish Notice'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </HODAppShell>
  );
};

export default HODAnnouncementPage;
