import React, { useEffect, useState, useRef } from 'react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { 
  Camera, 
  User, 
  Mail, 
  ShieldCheck, 
  Building2, 
  BadgeCheck, 
  Calendar, 
  IdCard, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../../app/context/AuthContext';
import { uploadFile, getSignedUrl, STORAGE_BUCKETS, validateFile } from '../../services/storageService';
import { uploadAvatar } from '../../services/avatarService';
import { supabase } from '../../lib/supabase';

export const FacultyProfilePage: React.FC = () => {
  const { profile: authProfile, user, refreshProfile } = useAuth();
  
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarPath = authProfile?.avatar_path || authProfile?.avatar_url;

  useEffect(() => {
    let isMounted = true;
    const loadAvatarUrl = async () => {
      if (avatarPath) {
        const url = await getSignedUrl(STORAGE_BUCKETS.AVATARS, avatarPath, 86400);
        if (isMounted) setAvatarSignedUrl(url);
      } else {
        if (isMounted) setAvatarSignedUrl(null);
      }
    };
    loadAvatarUrl();
    return () => { isMounted = false; };
  }, [avatarPath]);

  const handleAvatarClick = () => {
    if (fileInputRef.current && !uploadingAvatar) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setStatusMsg(null);
    const validation = validateFile(file, STORAGE_BUCKETS.AVATARS);
    if (!validation.valid) {
      setStatusMsg({ type: 'error', text: validation.error || 'Invalid photo file.' });
      return;
    }

    setUploadingAvatar(true);
    try {
      const result = await uploadAvatar(file);

      // Refresh global AuthContext profile state
      if (refreshProfile) {
        await refreshProfile();
      }

      setAvatarSignedUrl(result.signedUrl);
      setStatusMsg({ type: 'success', text: 'Profile photo updated successfully!' });
      
      setTimeout(() => {
        setStatusMsg(null);
      }, 5000);
    } catch (err: any) {
      console.error('[FacultyProfilePage] Avatar upload error:', err);
      setStatusMsg({ type: 'error', text: err.message || 'Failed to upload profile photo.' });
    } finally {
      setUploadingAvatar(false);
      if (e.target) e.target.value = '';
    }
  };

  const fullName = authProfile?.full_name || user?.email?.split('@')[0] || 'Faculty Member';
  const email = authProfile?.email || user?.email || 'N/A';
  const employeeId = authProfile?.usn_or_employee_id || 'N/A';
  const deptName = authProfile?.department?.name || 'Department not assigned';
  const deptCode = authProfile?.department?.code || 'DEPT';
  const accountStatus = authProfile?.account_status || 'ACTIVE';
  const createdDate = authProfile?.created_at 
    ? new Date(authProfile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';

  const initials = (fullName.split(' ').map((n: string) => n[0]).join('')).substring(0, 2);

  return (
    <FacultyAppShell>
      {/* Page Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>FACULTY PORTAL</span>
          <span className="badge badge-graded font-mono" style={{ fontSize: '0.7rem' }}>{deptCode}</span>
        </div>
        <h1 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
          Faculty Profile
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
          Manage your personal academic identity, credentials, and institutional profile.
        </p>
      </div>

      {/* Feedback Banner */}
      {statusMsg && (
        <div 
          className={`alert-banner ${statusMsg.type === 'success' ? 'success' : 'error'}`} 
          style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem' }}
        >
          {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span style={{ fontSize: '0.85rem' }}>{statusMsg.text}</span>
        </div>
      )}

      {/* Main Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
        
        {/* Left Column: Avatar & Quick Summary Card */}
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1.5rem 1.25rem' }}>
          {/* Avatar Container */}
          <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto 1rem' }}>
            <div 
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: 'var(--brand-orange)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.85rem',
                fontWeight: 800,
                overflow: 'hidden',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
                border: '3px solid var(--brand-white)'
              }}
            >
              {avatarSignedUrl ? (
                <img 
                  src={avatarSignedUrl} 
                  alt={fullName} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setAvatarSignedUrl(null)}
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            {/* Camera Upload Trigger */}
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={uploadingAvatar}
              title="Upload new profile photo"
              style={{
                position: 'absolute',
                bottom: '0px',
                right: '0px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--brand-black)',
                color: '#ffffff',
                border: '2px solid #ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                transition: 'transform 0.15s ease'
              }}
            >
              {uploadingAvatar ? <Loader2 size={15} className="spinner" /> : <Camera size={15} />}
            </button>

            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }}
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
            />
          </div>

          <h2 className="font-display" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
            {fullName}
          </h2>
          
          <div style={{ marginTop: '0.35rem', display: 'flex', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="badge badge-active" style={{ fontSize: '0.725rem' }}>
              Faculty Member
            </span>
            <span className="badge badge-graded" style={{ fontSize: '0.725rem' }}>
              {deptCode}
            </span>
          </div>

          <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', marginTop: '0.5rem', marginBottom: '1rem' }}>
            {deptName}
          </p>

          <div style={{ borderTop: '1px solid rgba(156, 163, 175, 0.2)', paddingTop: '1rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.825rem' }}>
              <span style={{ color: 'var(--brand-dark-grey)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <IdCard size={14} /> Employee ID
              </span>
              <span className="font-mono" style={{ fontWeight: 700, color: 'var(--brand-black)', marginLeft: 'auto' }}>
                {employeeId}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.825rem' }}>
              <span style={{ color: 'var(--brand-dark-grey)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <BadgeCheck size={14} /> Account Status
              </span>
              <span className={`badge ${accountStatus === 'ACTIVE' ? 'badge-active' : 'badge-pending'}`} style={{ marginLeft: 'auto', fontSize: '0.675rem' }}>
                {accountStatus}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.825rem' }}>
              <span style={{ color: 'var(--brand-dark-grey)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Calendar size={14} /> Member Since
              </span>
              <span style={{ fontWeight: 600, color: 'var(--brand-black)', marginLeft: 'auto' }}>
                {createdDate}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Profile Attributes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Card 1: Personal & Academic Identity */}
          <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
            <div style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3 className="font-display" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <UserCheck size={18} className="text-orange" />
                <span>Academic Identity &amp; Information</span>
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Full Name
                </label>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
                  {fullName}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Official Email
                </label>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--brand-black)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Mail size={14} className="text-dark-grey" />
                  <span>{email}</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Employee ID / Staff Code
                </label>
                <div className="font-mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
                  {employeeId}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Academic Designation
                </label>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
                  Assistant / Associate Professor
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Governance & Permissions */}
          <div className="dashboard-panel" style={{ padding: '1.25rem' }}>
            <div style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3 className="font-display" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Building2 size={18} className="text-orange" />
                <span>Department Scope &amp; Role Permissions</span>
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assigned Department
                </label>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem' }}>
                  {deptName}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Role &amp; System Authorization
                </label>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShieldCheck size={16} className="text-orange" />
                  <span>Faculty Academic &amp; Grading Scope</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', backgroundColor: 'var(--brand-light-grey)', padding: '0.75rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)', fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
              <strong>Institutional Policy Note:</strong> Profile identity and course assignments are governed by department administration (`auth.uid()`). For updates to your employee ID or assigned courses, contact your Department Head or IT Admin.
            </div>
          </div>

        </div>

      </div>
    </FacultyAppShell>
  );
};

export default FacultyProfilePage;
