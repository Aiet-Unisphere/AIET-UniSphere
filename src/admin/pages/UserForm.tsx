import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { AdminAppShell } from '../components/AdminAppShell';
import { createUser, updateUser, getUserById } from '../../services/userService';
import { getActiveDepartments } from '../../services/departmentService';
import type { UserRole } from '../../shared/types/user';
import type { Department } from '../../types/database.types';

export const UserForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  // Form Field States
  const [role, setRole] = useState<UserRole>('STUDENT');
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designation, setDesignation] = useState('');

  // Dynamic Departments State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);

  // Password fields with visibility toggles
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Error & Submission State
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditMode);

  useEffect(() => {
    const fetchDepts = async () => {
      setDepartmentsLoading(true);
      const depts = await getActiveDepartments();
      setDepartments(depts);
      setDepartmentsLoading(false);
    };
    fetchDepts();

    if (isEditMode && id) {
      const loadUser = async () => {
        const u = await getUserById(id);
        if (u) {
          setRole(u.role === 'ADMIN' ? 'STUDENT' : u.role);
          setName(u.name);
          setUserId(u.userId);
          setEmail(u.email);
          setDepartmentId(u.departmentId || '');
          setDesignation(u.designation || '');
        }
        setLoading(false);
      };
      loadUser();
    }
  }, [id, isEditMode]);

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!name.trim()) errs.name = 'Full Name is required';
    if (!userId.trim()) {
      errs.userId = role === 'STUDENT' ? 'USN / Student ID is required' : 'Employee ID is required';
    }
    if (!email.trim()) errs.email = 'Email address is required';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Invalid email address format';

    if (!departmentId) {
      errs.departmentId = 'Department selection is required';
    }

    if (!isEditMode) {
      if (!password) errs.password = 'Password is required';
      else if (password.length < 6) errs.password = 'Password must be at least 6 characters';

      if (password !== confirmPassword) {
        errs.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setSuccessMessage(null);

    if (!validate()) return;

    const selectedDept = departments.find(d => d.id === departmentId);
    const deptName = selectedDept ? selectedDept.name : 'Department';

    setSubmitting(true);
    try {
      if (isEditMode && id) {
        await updateUser(id, {
          role,
          name,
          userId,
          email,
          departmentId,
          departmentName: deptName,
          designation: (role === 'FACULTY' || role === 'HOD') ? (designation.trim() || undefined) : undefined,
          status: 'Active'
        });
        setSuccessMessage('User profile updated successfully.');
      } else {
        await createUser({
          role,
          name,
          userId,
          email,
          password,
          departmentId,
          departmentName: deptName,
          designation: (role === 'FACULTY' || role === 'HOD') ? (designation.trim() || undefined) : undefined,
          status: 'Active'
        });
        setSuccessMessage('User account created successfully.');
      }

      setTimeout(() => {
        navigate('/admin/users');
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to provision user account.';
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AdminAppShell>
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
          Loading Form...
        </div>
      </AdminAppShell>
    );
  }

  return (
    <AdminAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => navigate('/admin/users')} className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <span className="badge badge-active font-mono" style={{ backgroundColor: 'var(--brand-black)', color: '#FFF' }}>
            {isEditMode ? 'EDIT USER ACCOUNT' : 'CREATE USER ACCOUNT'}
          </span>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            {isEditMode ? `Edit User: ${name}` : 'Provision New Application User'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
            {isEditMode ? 'Update user account identity details' : 'Provision authentication identity for Student, Faculty, or HOD'}
          </p>
        </div>
      </div>

      {/* Main Form Container */}
      <div className="dashboard-panel" style={{ maxWidth: '640px', margin: '0 auto' }}>
        {serverError && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 'var(--border-radius)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <AlertCircle size={18} />
            <span>{serverError}</span>
          </div>
        )}

        {successMessage && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: 'var(--border-radius)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          
          {/* Role Selector Tabs (STUDENT, FACULTY, HOD ONLY) */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="form-label font-sans" style={{ fontWeight: 700, marginBottom: '0.5rem', display: 'block' }}>
              SELECT APPLICATION ROLE *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {(['STUDENT', 'FACULTY', 'HOD'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`btn ${role === r ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    padding: '0.65rem 0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    justifyContent: 'center',
                    backgroundColor: role === r ? (r === 'HOD' ? '#4C1D95' : r === 'FACULTY' ? 'var(--brand-blue)' : 'var(--brand-orange)') : undefined
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields Stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
            
            {/* Full Name */}
            <div>
              <label className="form-label font-sans" style={{ fontWeight: 600 }}>Full Name *</label>
              <input 
                type="text"
                placeholder="e.g. John Smith"
                className="form-input font-sans"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>{errors.name}</span>}
            </div>

            {/* USN / Employee ID */}
            <div>
              <label className="form-label font-sans" style={{ fontWeight: 600 }}>
                {role === 'STUDENT' ? 'USN / Student ID *' : 'Employee ID *'}
              </label>
              <input 
                type="text"
                placeholder={role === 'STUDENT' ? 'e.g. 4AI21DS001' : 'e.g. EMP-DS-05'}
                className="form-input font-sans font-mono"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
              {errors.userId && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>{errors.userId}</span>}
            </div>

            {/* Email Address */}
            <div>
              <label className="form-label font-sans" style={{ fontWeight: 600 }}>Email Address *</label>
              <input 
                type="email"
                placeholder="user@example.test"
                className="form-input font-sans"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>{errors.email}</span>}
            </div>

            {/* Department Selection Dropdown */}
            <div>
              <label className="form-label font-sans" style={{ fontWeight: 600 }}>Department *</label>
              <select
                className="form-input font-sans"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={departmentsLoading || departments.length === 0}
                style={{ backgroundColor: 'var(--brand-white)', cursor: 'pointer' }}
              >
                <option value="">
                  {departmentsLoading ? 'Loading departments...' : 'Select Department'}
                </option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} {dept.code ? `(${dept.code})` : ''}
                  </option>
                ))}
              </select>
              {departments.length === 0 && !departmentsLoading && (
                <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>
                  No active departments available.
                </span>
              )}
              {errors.departmentId && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>{errors.departmentId}</span>}
            </div>

            {/* Academic Designation (Faculty & HOD only) */}
            {(role === 'FACULTY' || role === 'HOD') && (
              <div>
                <label className="form-label font-sans" style={{ fontWeight: 600 }}>
                  Academic Designation (Optional)
                </label>
                <input 
                  type="text"
                  placeholder={role === 'HOD' ? 'e.g. Professor & HOD' : 'e.g. Assistant Professor, Associate Professor, Professor'}
                  className="form-input font-sans"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem', display: 'block' }}>
                  Official institutional title displayed on academic profile and documents.
                </span>
              </div>
            )}

            {/* Password Fields for New User Provisioning */}
            {!isEditMode && (
              <>
                <div>
                  <label className="form-label font-sans" style={{ fontWeight: 600 }}>Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="form-input font-sans"
                      style={{ paddingRight: '2.5rem' }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand-dark-grey)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>{errors.password}</span>}
                </div>

                <div>
                  <label className="form-label font-sans" style={{ fontWeight: 600 }}>Confirm Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="form-input font-sans"
                      style={{ paddingRight: '2.5rem' }}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand-dark-grey)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.confirmPassword && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>{errors.confirmPassword}</span>}
                </div>
              </>
            )}

          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(156, 163, 175, 0.2)', paddingTop: '1.25rem' }}>
            <button 
              type="button" 
              onClick={() => navigate('/admin/users')} 
              className="btn btn-secondary font-sans"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary font-sans"
              disabled={submitting}
            >
              <Save size={16} />
              <span>{submitting ? 'Processing...' : (isEditMode ? 'Save Changes' : 'Create User Account')}</span>
            </button>
          </div>

        </form>
      </div>
    </AdminAppShell>
  );
};

export default UserForm;

