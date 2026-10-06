import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { User, Phone, Calendar, MapPin, Save, AlertCircle, CheckCircle2, ShieldCheck, BookOpen, UserCheck, Camera, Upload } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';
import { getStudentFullProfile, updateStudentProfile, uploadUserAvatar, getUserAvatarSignedUrl } from '../services/studentService';

export const StudentProfilePage: React.FC = () => {
  const { profile: authProfile, user, refreshProfile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editable fields
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [semester, setSemester] = useState<string>('');
  const [academicYear, setAcademicYear] = useState('');
  const [cgpa, setCgpa] = useState<string>('');

  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getStudentFullProfile();
      if (data?.studentProfile) {
        const sp = data.studentProfile;
        setPhone(sp.phone || '');
        setDob(sp.date_of_birth || '');
        setGender(sp.gender || '');
        setAddress(sp.address || '');
        setCity(sp.city || '');
        setState(sp.state || '');
        setPincode(sp.pincode || '');
        setParentName(sp.parent_name || '');
        setParentPhone(sp.parent_phone || '');
        setSemester(sp.semester != null ? String(sp.semester) : '');
        setAcademicYear(sp.academic_year || '');
        setCgpa(sp.cgpa != null ? String(sp.cgpa) : '');
      }

      const currentAvatarPath = authProfile?.avatar_path || authProfile?.avatar_url;
      if (currentAvatarPath) {
        const signed = await getUserAvatarSignedUrl(currentAvatarPath);
        setAvatarSignedUrl(signed);
      }
    } catch (err) {
      console.error("Error loading student profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [authProfile?.avatar_path, authProfile?.avatar_url]);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setAvatarPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile || !user?.id) return;
    setUploadingAvatar(true);
    setErrorMsg(null);
    try {
      const result = await uploadUserAvatar(avatarFile);
      setSuccessMsg("Profile photo uploaded and updated successfully.");
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      if (refreshProfile) {
        await refreshProfile();
      }
      setAvatarSignedUrl(result.signedUrl);
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      setErrorMsg(err.message || "Failed to upload avatar photo.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      await updateStudentProfile({
        phone,
        date_of_birth: dob,
        gender,
        address,
        city,
        state,
        pincode,
        parent_name: parentName,
        parent_phone: parentPhone,
        semester: semester ? parseInt(semester, 10) : undefined,
        academic_year: academicYear,
        cgpa: cgpa ? parseFloat(cgpa) : undefined
      });
      setSuccessMsg("Student academic & personal profile updated successfully.");
      if (refreshProfile) {
        await refreshProfile();
      }
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile details.");
    } finally {
      setSubmitting(false);
    }
  };

  const isProfileIncomplete = !phone || !semester;

  return (
    <AppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="breadcrumbs">
          <span>Student Portal</span>
          <span className="breadcrumbs-separator">/</span>
          <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>My Academic Profile</span>
        </div>
        <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.2rem', marginBottom: 0 }}>
          Student Academic Profile
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
          Manage your verified contact details, guardian info, and academic standing.
        </p>
      </div>

      {isProfileIncomplete && !loading && (
        <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertCircle size={20} style={{ color: '#D97706' }} />
            <div>
              <div style={{ fontWeight: 700, color: '#92400E', fontSize: '0.9rem' }}>Your student profile is incomplete</div>
              <div style={{ fontSize: '0.8rem', color: '#B45309' }}>Please enter your contact details and current semester information below.</div>
            </div>
          </div>
        </div>
      )}

      {successMsg && (
        <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
          Loading profile information...
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* SECTION 0: PROFILE PHOTO / AVATAR */}
          <div className="dashboard-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '0.75rem' }}>
              <Camera size={20} style={{ color: 'var(--brand-orange)' }} />
              <h2 className="panel-title font-display" style={{ margin: 0 }}>Student Profile Photo</h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: '#E2E8F0',
                border: '3px solid var(--brand-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {avatarPreviewUrl || avatarSignedUrl ? (
                  <img 
                    src={avatarPreviewUrl || avatarSignedUrl || ''} 
                    alt="Student Avatar" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                ) : (
                  <User size={42} style={{ color: '#94A3B8' }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--brand-black)', marginBottom: '0.25rem' }}>
                  Upload Verified Photo
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginBottom: '0.75rem' }}>
                  Allowed formats: PNG, JPEG, WEBP. Max file size: 5MB. Stored securely in Supabase Storage.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <input 
                    type="file" 
                    accept="image/png,image/jpeg,image/webp" 
                    onChange={handleAvatarFileChange} 
                    style={{ fontSize: '0.85rem' }} 
                  />
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={handleUploadAvatar}
                      disabled={uploadingAvatar}
                      className="btn btn-primary font-sans"
                      style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                    >
                      <Upload size={14} />
                      <span>{uploadingAvatar ? 'Uploading...' : 'Save Photo'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 1: SYSTEM MANAGED IDENTITY */}
          <div className="dashboard-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '0.75rem' }}>
              <ShieldCheck size={20} style={{ color: 'var(--brand-blue)' }} />
              <h2 className="panel-title font-display" style={{ margin: 0 }}>System-Managed Account Identity</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label className="form-label font-sans" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>FULL NAME</label>
                <input 
                  type="text" 
                  disabled 
                  value={authProfile?.full_name || 'N/A'}
                  className="form-input font-sans"
                  style={{ backgroundColor: 'var(--brand-light-grey)', cursor: 'not-allowed' }}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>EMAIL ADDRESS</label>
                <input 
                  type="text" 
                  disabled 
                  value={user?.email || authProfile?.email || 'N/A'}
                  className="form-input font-sans"
                  style={{ backgroundColor: 'var(--brand-light-grey)', cursor: 'not-allowed' }}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>USN / STUDENT ID</label>
                <input 
                  type="text" 
                  disabled 
                  value={authProfile?.usn_or_employee_id || 'N/A'}
                  className="form-input font-sans font-mono"
                  style={{ backgroundColor: 'var(--brand-light-grey)', cursor: 'not-allowed', fontWeight: 700 }}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>ROLE</label>
                <input 
                  type="text" 
                  disabled 
                  value={authProfile?.role || 'STUDENT'}
                  className="form-input font-sans font-bold"
                  style={{ backgroundColor: 'var(--brand-light-grey)', cursor: 'not-allowed', color: 'var(--brand-orange)' }}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>DEPARTMENT</label>
                <input 
                  type="text" 
                  disabled 
                  value={authProfile?.department?.name || 'Department not assigned'}
                  className="form-input font-sans font-bold"
                  style={{ backgroundColor: 'var(--brand-light-grey)', cursor: 'not-allowed', color: 'var(--brand-blue)' }}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>ACCOUNT STATUS</label>
                <input 
                  type="text" 
                  disabled 
                  value={authProfile?.account_status || 'ACTIVE'}
                  className="form-input font-sans"
                  style={{ backgroundColor: 'var(--brand-light-grey)', cursor: 'not-allowed' }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: PERSONAL & CONTACT INFORMATION */}
          <div className="dashboard-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '0.75rem' }}>
              <User size={20} style={{ color: 'var(--brand-orange)' }} />
              <h2 className="panel-title font-display" style={{ margin: 0 }}>Personal & Contact Details</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Phone Number</label>
                <input 
                  type="text"
                  placeholder="+91 98765 43210"
                  className="form-input font-sans"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Date of Birth</label>
                <input 
                  type="date"
                  className="form-input font-sans"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Gender</label>
                <select 
                  className="form-input font-sans"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Residential Address</label>
                <input 
                  type="text"
                  placeholder="Street Address / Room / Hostel..."
                  className="form-input font-sans"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div>
                  <label className="form-label font-sans" style={{ fontWeight: 600 }}>City</label>
                  <input 
                    type="text"
                    placeholder="e.g. Moodabidri"
                    className="form-input font-sans"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label font-sans" style={{ fontWeight: 600 }}>State</label>
                  <input 
                    type="text"
                    placeholder="e.g. Karnataka"
                    className="form-input font-sans"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label font-sans" style={{ fontWeight: 600 }}>Pincode</label>
                  <input 
                    type="text"
                    placeholder="574227"
                    className="form-input font-sans"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: ACADEMIC DETAILS */}
          <div className="dashboard-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '0.75rem' }}>
              <BookOpen size={20} style={{ color: 'var(--brand-blue)' }} />
              <h2 className="panel-title font-display" style={{ margin: 0 }}>Academic Details</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Current Semester</label>
                <select 
                  className="form-input font-sans"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                >
                  <option value="">Select Semester</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                    <option key={s} value={s}>Semester {s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Academic Year</label>
                <input 
                  type="text"
                  placeholder="e.g. 2025–2026"
                  className="form-input font-sans"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Cumulative GPA (CGPA)</label>
                <input 
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  placeholder="e.g. 8.25"
                  className="form-input font-sans"
                  value={cgpa}
                  onChange={(e) => setCgpa(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: PARENT / GUARDIAN INFORMATION */}
          <div className="dashboard-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', paddingBottom: '0.75rem' }}>
              <UserCheck size={20} style={{ color: 'var(--brand-black)' }} />
              <h2 className="panel-title font-display" style={{ margin: 0 }}>Parent / Guardian Information</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Parent / Guardian Name</label>
                <input 
                  type="text"
                  placeholder="Full Name of Parent/Guardian"
                  className="form-input font-sans"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>Parent / Guardian Phone</label>
                <input 
                  type="text"
                  placeholder="+91 98765 00000"
                  className="form-input font-sans"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button 
              type="submit" 
              className="btn btn-primary font-sans"
              disabled={submitting}
              style={{ minWidth: '160px', justifyContent: 'center' }}
            >
              <Save size={16} />
              <span>{submitting ? 'Saving Profile...' : 'Save Profile'}</span>
            </button>
          </div>

        </form>
      )}
    </AppShell>
  );
};

export default StudentProfilePage;
