import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../../types/database.types';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ children, allowedRoles }) => {
  const { session, role, profile, isLoading } = useAuth();
  const location = useLocation();

  // 1. App loading state while checking session/profile
  if (isLoading) {
    return (
      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh',
          backgroundColor: 'var(--brand-page-bg, #f8fafc)',
          color: 'var(--brand-dark-grey, #334155)',
          fontFamily: 'system-ui, sans-serif'
        }}
      >
        <div 
          style={{
            width: '36px',
            height: '36px',
            border: '3px solid rgba(11, 83, 160, 0.15)',
            borderTopColor: 'var(--brand-blue, #0b53a0)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '1rem'
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: '0.875rem', fontWeight: 500, margin: 0 }}>Verifying session...</p>
      </div>
    );
  }

  // 2. Unauthenticated check
  if (!session) {
    // Redirect unauthenticated user to entry login
    const loginTarget = location.pathname.startsWith('/admin') 
      ? '/login/admin' 
      : location.pathname.startsWith('/faculty') || location.pathname.startsWith('/hod')
      ? '/login/faculty'
      : '/login/student';
      
    return <Navigate to={loginTarget} state={{ from: location }} replace />;
  }

  // 3. Role authorization check (STRICTLY database profile role linked to authenticated user UUID)
  const activeRole: UserRole | null = profile?.role || role || null;

  // If session is present but activeRole is still loading, wait for hydration instead of redirecting to /
  if (!activeRole) {
    return (
      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh',
          backgroundColor: 'var(--brand-page-bg, #f8fafc)',
          color: 'var(--brand-dark-grey, #334155)',
          fontFamily: 'system-ui, sans-serif'
        }}
      >
        <div 
          style={{
            width: '36px',
            height: '36px',
            border: '3px solid rgba(11, 83, 160, 0.15)',
            borderTopColor: 'var(--brand-blue, #0b53a0)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '1rem'
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: '0.875rem', fontWeight: 500, margin: 0 }}>Verifying permissions...</p>
      </div>
    );
  }

  const isAuthorized = allowedRoles.includes(activeRole);

  if (!isAuthorized) {
    if (activeRole === 'STUDENT') return <Navigate to="/student/dashboard" replace />;
    if (activeRole === 'FACULTY') return <Navigate to="/faculty/dashboard" replace />;
    if (activeRole === 'HOD') return <Navigate to="/hod/dashboard" replace />;
    if (activeRole === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Deprecated: Role determination is handled strictly via Supabase Auth UUID -> public.profiles.id
export const setSessionRole = (_newRole: UserRole) => {};
export const getSessionRole = (): UserRole => 'STUDENT';

