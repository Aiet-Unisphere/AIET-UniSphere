import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  CalendarCheck, 
  Clock,
  ClipboardList, 
  Award,
  Bell, 
  ChevronLeft,
  ChevronRight,
  Search, 
  LogOut, 
  User as UserIcon,
  ChevronDown,
  Megaphone,
  Sparkles
} from 'lucide-react';
import { AuthLogo } from '../../components/AuthLogo';
import { useAuth } from '../../app/context/AuthContext';
import { getUnreadNotificationsCount } from '../../services/notificationService';
import { getSignedUrl, STORAGE_BUCKETS } from '../../services/storageService';

import { UserAvatar } from '../../components/UserAvatar';

interface FacultyAppShellProps {
  children: React.ReactNode;
}

// Module-level state to persist sidebar collapse/expand state during route navigation
let globalFacultySidebarState: boolean | null = null;

export const FacultyAppShell: React.FC<FacultyAppShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile, user } = useAuth();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (globalFacultySidebarState !== null) return globalFacultySidebarState;
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  
  const profileRef = useRef<HTMLDivElement>(null);

  const avatarPath = profile?.avatar_path || profile?.avatar_url;

  // Load avatar signed URL when avatarPath changes
  useEffect(() => {
    let isMounted = true;
    const loadAvatar = async () => {
      if (avatarPath) {
        const url = await getSignedUrl(STORAGE_BUCKETS.AVATARS, avatarPath, 86400);
        if (isMounted) setAvatarSignedUrl(url);
      } else {
        if (isMounted) setAvatarSignedUrl(null);
      }
    };
    loadAvatar();
    return () => { isMounted = false; };
  }, [avatarPath]);

  // Load unread notification count & subscribe to updates
  useEffect(() => {
    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const count = await getUnreadNotificationsCount();
        if (isMounted) setUnreadNotifications(count);
      } catch (err) {
        console.error('[FacultyAppShell] Error loading unread notifications:', err);
      }
    };

    fetchUnread();

    const handleUpdate = () => fetchUnread();
    window.addEventListener('notifications_updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('notifications_updated', handleUpdate);
    };
  }, []);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      globalFacultySidebarState = next;
      return next;
    });
  };

  const handleNavClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
      globalFacultySidebarState = false;
    }
  };

  const handleLogout = async () => {
    if (confirm("Are you sure you want to sign out from Faculty Portal?")) {
      await signOut();
      navigate('/login/faculty');
    }
  };

  const navDashboard = [
    { label: 'Dashboard', path: '/faculty/dashboard', icon: <LayoutDashboard size={18} /> }
  ];

  const navAcademicManagement = [
    { label: 'My Courses', path: '/faculty/courses', icon: <BookOpen size={18} /> },
    { label: 'Students', path: '/faculty/students', icon: <Users size={18} /> },
    { label: 'Attendance', path: '/faculty/attendance', icon: <CalendarCheck size={18} /> },
    { label: 'Timetable', path: '/faculty/timetable', icon: <Clock size={18} /> },
    { label: 'Assignments', path: '/faculty/assignments', icon: <ClipboardList size={18} /> },
    { label: 'Assessments', path: '/faculty/assessments', icon: <Award size={18} /> },
    { label: 'AI Assistant', path: '/faculty/ai-assistant', icon: <Sparkles size={18} /> }
  ];

  const navCommunication = [
    { label: 'Announcements', path: '/faculty/announcements', icon: <Megaphone size={18} /> }
  ];

  // Helper to format page title from current pathname
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/faculty/dashboard')) return 'Faculty Dashboard';
    if (path.includes('/faculty/profile')) return 'Faculty Profile';
    if (path.includes('/faculty/notifications')) return 'Notifications & Alerts';
    if (path.includes('/faculty/courses/')) return 'Course Details';
    if (path.includes('/faculty/courses')) return 'My Courses';
    if (path.includes('/faculty/students/')) return 'Student Academic Profile';
    if (path.includes('/faculty/students')) return 'Student Management';
    if (path.includes('/faculty/attendance')) return 'Attendance Management';
    if (path.includes('/faculty/timetable')) return 'Faculty Timetable';
    if (path.includes('/faculty/assignments/')) return 'Assignment Details';
    if (path.includes('/faculty/assignments')) return 'Assignment Management';
    if (path.includes('/faculty/assessments/')) return 'Assessment Details';
    if (path.includes('/faculty/assessments')) return 'Assessment Management';
    if (path.includes('/faculty/announcements')) return 'Faculty Announcements';
    if (path.includes('/faculty/ai-assistant')) return 'Faculty AI Assistant';
    return 'Faculty Portal';
  };

  const fullName = profile?.full_name || user?.email?.split('@')[0] || 'Faculty Member';
  const initials = (fullName.split(' ').map((n: string) => n[0]).join('')).substring(0, 2);

  return (
    <div className={`app-shell student-theme ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      {/* Sidebar overlay for mobile */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} 
        onClick={() => {
          setIsSidebarOpen(false);
          globalFacultySidebarState = false;
        }}
        aria-hidden="true"
      ></div>

      {/* Sidebar Component */}
      <aside className={`app-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="app-sidebar-logo-container">
          <AuthLogo compact subtext="" />
        </div>
        
        <nav className="app-sidebar-nav">
          {/* DASHBOARD */}
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

          {/* ACADEMIC MANAGEMENT */}
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Academic Management</div>
            <div className="app-sidebar-menu">
              {navAcademicManagement.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || (item.path !== '/faculty/dashboard' && location.pathname.startsWith(item.path)) ? 'active' : ''
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

          {/* COMMUNICATION */}
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Communication</div>
            <div className="app-sidebar-menu">
              {navCommunication.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || location.pathname.startsWith(item.path) ? 'active' : ''
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

        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
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

      {/* Main Area */}
      <div className={`app-main ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
        {/* Top Header */}
        <header className="app-header" style={{ height: '64px', minHeight: '64px' }}>
          <div className="header-left">
            <button 
              className="sidebar-toggle-btn" 
              onClick={toggleSidebar}
              aria-label={isSidebarOpen ? "Collapse navigation menu" : "Expand navigation menu"}
              title={isSidebarOpen ? "Collapse navigation" : "Expand navigation"}
            >
              {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{getPageTitle()}</h2>
          </div>

          {/* Desktop Search */}
          <div className="header-search">
            <Search size={16} className="header-search-icon" />
            <input 
              type="text" 
              className="header-search-input" 
              placeholder="Search courses, students..." 
              aria-label="Global search input"
            />
          </div>

          <div className="header-right">
            {/* Notifications button */}
            <button 
              className="header-action-btn" 
              aria-label="View notifications"
              onClick={() => navigate('/faculty/notifications')}
              title="Open Notifications"
            >
              <Bell size={18} />
              {unreadNotifications > 0 && <span className="notification-badge"></span>}
            </button>

            {/* Profile Dropdown */}
            <div className="profile-menu-container" ref={profileRef}>
              <button 
                className="profile-trigger" 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                aria-expanded={isProfileOpen}
                aria-label="Open profile menu"
                style={{ padding: '0.35rem 0.6rem' }}
              >
                <UserAvatar
                  name={fullName}
                  avatarPath={profile?.avatar_path || profile?.avatar_url}
                  size="sm"
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {fullName}
                  <ChevronDown size={14} />
                </span>
              </button>

              {isProfileOpen && (
                <div className="profile-dropdown">
                  <div className="dropdown-header">
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{fullName}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                      Faculty · {profile?.department?.name || 'Department not assigned'}
                    </span>
                    {profile?.usn_or_employee_id && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                        Emp ID: {profile.usn_or_employee_id}
                      </span>
                    )}
                  </div>
                  <button 
                    className="dropdown-item"
                    onClick={() => {
                      setIsProfileOpen(false);
                      navigate('/faculty/profile');
                    }}
                  >
                    <UserIcon size={16} />
                    Faculty Profile
                  </button>
                  <button className="dropdown-item" onClick={handleLogout}>
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Page wrapper */}
        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default FacultyAppShell;
