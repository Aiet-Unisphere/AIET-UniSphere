import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen, 
  CalendarCheck, 
  Bell, 
  ChevronLeft,
  ChevronRight,
  Search, 
  LogOut, 
  UserCheck,
  GraduationCap,
  ChevronDown,
  FileCheck,
  Award,
  Clock,
  Megaphone,
  BarChart2,
  Sparkles,
  User
} from 'lucide-react';
import { AuthLogo } from '../../components/AuthLogo';

import { useAuth } from '../../app/context/AuthContext';
import { getUnreadNotificationsCount } from '../../services/notificationService';
import { getSignedUrl, STORAGE_BUCKETS } from '../../services/storageService';

import { UserAvatar } from '../../components/UserAvatar';

interface HODAppShellProps {
  children: React.ReactNode;
}

// Module-level state to persist sidebar collapse/expand state during route navigation
let globalHODSidebarState: boolean | null = null;

export const HODAppShell: React.FC<HODAppShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile, user } = useAuth();
  const hodName = profile?.full_name || user?.email?.split('@')[0] || 'Head of Department';
  const deptDisplayName = profile?.department?.name || 'Department not assigned';
  const hodEmail = profile?.email || user?.email || 'N/A';
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (globalHODSidebarState !== null) return globalHODSidebarState;
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const profileRef = useRef<HTMLDivElement>(null);
  const avatarPath = profile?.avatar_path || profile?.avatar_url;

  useEffect(() => {
    let isMounted = true;
    const loadAvatar = async () => {
      if (avatarPath) {
        const url = await getSignedUrl(STORAGE_BUCKETS.AVATARS, avatarPath, 86400);
        if (isMounted) setAvatarUrl(url);
      } else {
        if (isMounted) setAvatarUrl(null);
      }
    };
    loadAvatar();
    return () => { isMounted = false; };
  }, [avatarPath]);

  const fetchUnreadCount = async () => {
    try {
      const count = await getUnreadNotificationsCount();
      setUnreadNotifications(count);
    } catch (e) {
      console.error('[HODAppShell] Failed to fetch unread notifications count:', e);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const handleUpdate = () => fetchUnreadCount();
    window.addEventListener('notifications_updated', handleUpdate);
    return () => window.removeEventListener('notifications_updated', handleUpdate);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      globalHODSidebarState = next;
      return next;
    });
  };

  const handleNavClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
      globalHODSidebarState = false;
    }
  };

  const handleLogout = async () => {
    if (confirm("Are you sure you want to sign out from the HOD Portal?")) {
      await signOut();
      navigate('/login/faculty');
    }
  };

  const navDashboard = [
    { label: 'Dashboard', path: '/hod/dashboard', icon: <LayoutDashboard size={18} /> }
  ];

  const navDeptManagement = [
    { label: 'Faculty', path: '/hod/faculty', icon: <UserCheck size={18} /> },
    { label: 'Students', path: '/hod/students', icon: <GraduationCap size={18} /> },
    { label: 'Courses', path: '/hod/courses', icon: <BookOpen size={18} /> },
    { label: 'Attendance', path: '/hod/attendance', icon: <CalendarCheck size={18} /> }
  ];

  const navAcademicGovernance = [
    { label: 'Leave & Approvals', path: '/hod/leave', icon: <FileCheck size={18} /> },
    { label: 'Assessments', path: '/hod/assessments', icon: <Award size={18} /> },
    { label: 'Results', path: '/hod/results', icon: <Award size={18} /> },
    { label: 'Timetable', path: '/hod/timetable', icon: <Clock size={18} /> },
    { label: 'Announcements', path: '/hod/announcements', icon: <Megaphone size={18} /> },
    { label: 'Analytics & Reports', path: '/hod/analytics', icon: <BarChart2 size={18} /> },
    { label: 'AI Assistant', path: '/hod/ai-assistant', icon: <Sparkles size={18} /> }
  ];

  // Helper to format page title from current pathname
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/hod/dashboard')) return 'HOD Dashboard';
    if (path.includes('/hod/faculty')) return 'Faculty Management';
    if (path.includes('/hod/students')) return 'Student Registry';
    if (path.includes('/hod/courses')) return 'Department Courses';
    if (path.includes('/hod/attendance')) return 'Attendance Governance';
    if (path.includes('/hod/leave')) return 'Leave & Approvals';
    if (path.includes('/hod/assessments')) return 'Assessment Oversight';
    if (path.includes('/hod/results')) return 'Academic Results';
    if (path.includes('/hod/timetable')) return 'Department Timetable';
    if (path.includes('/hod/announcements')) return 'Announcements';
    if (path.includes('/hod/analytics')) return 'Analytics & Reports';
    if (path.includes('/hod/ai-assistant')) return 'HOD AI Assistant';
    return 'HOD Portal';
  };

  return (
    <div className={`app-shell student-theme ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      {/* Mobile Sidebar Overlay */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} 
        onClick={() => {
          setIsSidebarOpen(false);
          globalHODSidebarState = false;
        }}
        aria-hidden="true"
      ></div>

      {/* Unified Fixed Sidebar */}
      <aside className={`app-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
        {/* Logo Container */}
        <div className="app-sidebar-logo-container">
          <AuthLogo compact subtext="" />
        </div>

        {/* Navigation Section Group */}
        <nav className="app-sidebar-nav">
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Dashboard</div>
            <div className="app-sidebar-menu">
              {navDashboard.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) => `app-sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>

          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Department Management</div>
            <div className="app-sidebar-menu">
              {navDeptManagement.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`) ? 'active' : ''
                    }`
                  }
                  onClick={handleNavClick}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>

          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Academic Governance</div>
            <div className="app-sidebar-menu">
              {navAcademicGovernance.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`) ? 'active' : ''
                    }`
                  }
                  onClick={handleNavClick}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer — Sign Out */}
        <div style={{ padding: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            onClick={handleLogout}
            className="app-sidebar-link"
            title="Sign Out"
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              justifyContent: 'flex-start',
              textAlign: 'left'
            }}
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Layout Area */}
      <div className={`app-main ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
        {/* Sticky Header Topbar */}
        <header className="app-header">
          {/* Header Left: Toggle Button & Title */}
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button 
              className="sidebar-toggle-btn" 
              onClick={toggleSidebar}
              aria-label={isSidebarOpen ? "Collapse navigation menu" : "Expand navigation menu"}
              title={isSidebarOpen ? "Collapse navigation" : "Expand navigation"}
            >
              {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span className="badge badge-graded" style={{ fontSize: '0.75rem' }}>{profile?.department?.code || profile?.department?.name || 'DEPARTMENT'}</span>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0, fontFamily: 'var(--font-display)' }}>
                {getPageTitle()}
              </h2>
            </div>
          </div>

          {/* Search Bar & User Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {/* Global Search Bar */}
            <div className="header-search" style={{ position: 'relative', width: '280px' }}>
              <Search size={16} className="header-search-icon" />
              <input 
                type="text" 
                placeholder="Search faculty, students, courses..."
                className="header-search-input"
              />
            </div>

            {/* Notification Bell */}
            <button 
              className="header-action-btn"
              onClick={() => navigate('/hod/notifications')}
              title="Department Notifications"
              style={{ position: 'relative' }}
            >
              <Bell size={20} />
              {unreadNotifications > 0 && (
                <span 
                  className="notification-badge"
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    backgroundColor: 'var(--brand-orange)',
                    color: '#ffffff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    borderRadius: '50%',
                    minWidth: '16px',
                    height: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 2px'
                  }}
                >
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>

            {/* Profile Dropdown */}
            <div className="profile-menu-container" ref={profileRef}>
              <button
                className="profile-trigger"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                aria-expanded={isProfileOpen}
                aria-label="Open profile menu"
              >
                <UserAvatar
                  name={hodName}
                  avatarPath={profile?.avatar_path || profile?.avatar_url}
                  size="sm"
                />
                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-black)', lineHeight: 1.2 }}>
                    {hodName}
                  </span>
                  <span style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)' }}>
                    HOD · {deptDisplayName}
                  </span>
                </div>
                <ChevronDown size={14} style={{ color: 'var(--brand-dark-grey)' }} />
              </button>

              {/* Profile Menu Dropdown */}
              {isProfileOpen && (
                <div className="profile-dropdown" style={{ minWidth: '220px' }}>
                  <div className="dropdown-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--brand-orange)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                      {avatarUrl ? (
                        <img 
                          src={avatarUrl} 
                          alt={hodName} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={() => setAvatarUrl(null)}
                        />
                      ) : (
                        (hodName.split(' ').map((n: string) => n[0]).join('')).substring(0, 2)
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-black)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {hodName}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {hodEmail}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: '0.35rem 0' }}>
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setIsProfileOpen(false);
                        navigate('/hod/profile');
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 1rem', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: '0.875rem', color: 'var(--brand-black)', fontWeight: 600 }}
                    >
                      <User size={16} />
                      <span>Profile</span>
                    </button>

                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setIsProfileOpen(false);
                        handleLogout();
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 1rem', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: '0.875rem', color: 'var(--color-error)', fontWeight: 600 }}
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Main Content Area */}
        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default HODAppShell;
