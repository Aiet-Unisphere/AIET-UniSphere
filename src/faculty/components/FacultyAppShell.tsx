import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  CalendarCheck, 
  ClipboardList, 
  Award,
  Bell, 
  Menu, 
  Search, 
  LogOut, 
  User as UserIcon,
  ChevronDown,
  Megaphone
} from 'lucide-react';
import { AuthLogo } from '../../components/AuthLogo';
import { mockFacultyProfile } from '../data/facultyData';

import { useAuth } from '../../app/context/AuthContext';

interface FacultyAppShellProps {
  children: React.ReactNode;
}

export const FacultyAppShell: React.FC<FacultyAppShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile, user } = useAuth();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(3);
  
  const profileRef = useRef<HTMLDivElement>(null);

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
    { label: 'Assignments', path: '/faculty/assignments', icon: <ClipboardList size={18} /> },
    { label: 'Assessments', path: '/faculty/assessments', icon: <Award size={18} /> }
  ];

  const navCommunication = [
    { label: 'Announcements', path: '/faculty/announcements', icon: <Megaphone size={18} /> }
  ];

  // Helper to format page title from current pathname
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/faculty/dashboard')) return 'Faculty Dashboard';
    if (path.includes('/faculty/courses/')) return 'Course Details';
    if (path.includes('/faculty/courses')) return 'My Courses';
    if (path.includes('/faculty/students/')) return 'Student Academic Profile';
    if (path.includes('/faculty/students')) return 'Student Management';
    if (path.includes('/faculty/attendance')) return 'Attendance Management';
    if (path.includes('/faculty/assignments/')) return 'Assignment Details';
    if (path.includes('/faculty/assignments')) return 'Assignment Management';
    if (path.includes('/faculty/assessments/')) return 'Assessment Details';
    if (path.includes('/faculty/assessments')) return 'Assessment Management';
    if (path.includes('/faculty/announcements')) return 'Faculty Announcements';
    return 'Faculty Portal';
  };

  return (
    <div className="app-shell student-theme">
      {/* Sidebar overlay for mobile */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} 
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      {/* Sidebar Component */}
      <aside className={`app-sidebar ${isSidebarOpen ? 'open' : ''}`}>
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
                  className={({ isActive }) => `app-sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setIsSidebarOpen(false)}
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
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || (item.path !== '/faculty/dashboard' && location.pathname.startsWith(item.path)) ? 'active' : ''
                    }`
                  }
                  onClick={() => setIsSidebarOpen(false)}
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
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || location.pathname.startsWith(item.path) ? 'active' : ''
                    }`
                  }
                  onClick={() => setIsSidebarOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        <div style={{ padding: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button 
            onClick={handleLogout} 
            className="app-sidebar-link"
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
      <div className="app-main">
        {/* Top Header */}
        <header className="app-header">
          <div className="header-left">
            <button 
              className="hamburger-btn" 
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open sidebar menu"
            >
              <Menu size={24} />
            </button>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{getPageTitle()}</h2>
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
              onClick={() => alert("Faculty Notification Center")}
              title="Open Notifications"
            >
              <Bell size={20} />
              {unreadNotifications > 0 && <span className="notification-badge"></span>}
            </button>

            {/* Profile Dropdown */}
            <div className="profile-menu-container" ref={profileRef}>
              <button 
                className="profile-trigger" 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                aria-expanded={isProfileOpen}
                aria-label="Open profile menu"
              >
                <div className="profile-avatar">
                  {((profile?.full_name || user?.email || 'Faculty').split(' ').map((n: string) => n[0]).join('')).substring(0, 2)}
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {profile?.full_name || user?.email?.split('@')[0] || 'Faculty Member'}
                  <ChevronDown size={14} />
                </span>
              </button>

              {isProfileOpen && (
                <div className="profile-dropdown">
                  <div className="dropdown-header">
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{profile?.full_name || user?.email || 'Faculty Member'}</span>
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
                    onClick={() => { setIsProfileOpen(false); alert(`Emp ID: ${profile?.usn_or_employee_id || 'N/A'}\nDepartment: ${profile?.department?.name || 'Department not assigned'}`); }}
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
