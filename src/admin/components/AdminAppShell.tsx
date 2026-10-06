import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  UserPlus, 
  Building2, 
  ShieldCheck, 
  Bell, 
  ChevronLeft,
  ChevronRight,
  Search, 
  LogOut, 
  ChevronDown
} from 'lucide-react';
import { AuthLogo } from '../../components/AuthLogo';

import { useAuth } from '../../app/context/AuthContext';

import { UserAvatar } from '../../components/UserAvatar';

interface AdminAppShellProps {
  children: React.ReactNode;
}

// Module-level state to persist sidebar collapse/expand state during route navigation
let globalAdminSidebarState: boolean | null = null;

export const AdminAppShell: React.FC<AdminAppShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (globalAdminSidebarState !== null) return globalAdminSidebarState;
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(2);
  
  const profileRef = useRef<HTMLDivElement>(null);

  const displayName = profile?.full_name || 'System Administrator';
  const displayEmail = profile?.email || 'admin@aiet.edu';
  const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'SA';

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
      globalAdminSidebarState = next;
      return next;
    });
  };

  const handleNavClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
      globalAdminSidebarState = false;
    }
  };

  const handleLogout = async () => {
    if (confirm("Are you sure you want to sign out from the Admin Portal?")) {
      await signOut();
      navigate('/login/admin');
    }
  };

  const navDashboard = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard size={18} /> }
  ];

  const navUserManagement = [
    { label: 'Users', path: '/admin/users', icon: <Users size={18} /> },
    { label: 'Add User', path: '/admin/users/create', icon: <UserPlus size={18} /> }
  ];

  const navOrganization = [
    { label: 'Departments', path: '/admin/organization', icon: <Building2 size={18} /> }
  ];

  const navSecurity = [
    { label: 'Account Access & Security', path: '/admin/security', icon: <ShieldCheck size={18} /> }
  ];

  // Helper to format page title from current pathname
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/admin/dashboard')) return 'Admin Dashboard';
    if (path.includes('/admin/users/create')) return 'Add User';
    if (path.includes('/admin/users')) return 'User Management';
    if (path.includes('/admin/organization')) return 'Department Control';
    if (path.includes('/admin/security')) return 'Account Access & Security';
    return 'Admin Portal';
  };

  return (
    <div className={`app-shell student-theme ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      {/* Mobile Sidebar Overlay */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} 
        onClick={() => {
          setIsSidebarOpen(false);
          globalAdminSidebarState = false;
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
            <div className="app-sidebar-group-title">User Management</div>
            <div className="app-sidebar-menu">
              {navUserManagement.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || (item.path !== '/admin/dashboard' && location.pathname.startsWith(`${item.path}`)) ? 'active' : ''
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
            <div className="app-sidebar-group-title">Organization</div>
            <div className="app-sidebar-menu">
              {navOrganization.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || (item.path !== '/admin/dashboard' && location.pathname.startsWith(`${item.path}`)) ? 'active' : ''
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
            <div className="app-sidebar-group-title">Access & Security</div>
            <div className="app-sidebar-menu">
              {navSecurity.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) => 
                    `app-sidebar-link ${
                      location.pathname === item.path || (item.path !== '/admin/dashboard' && location.pathname.startsWith(`${item.path}`)) ? 'active' : ''
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
              <span className="badge badge-active font-mono" style={{ fontSize: '0.75rem', backgroundColor: 'var(--brand-black)', color: '#FFF' }}>SYSTEM ADMIN</span>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0, fontFamily: 'var(--font-display)' }}>
                {getPageTitle()}
              </h2>
            </div>
          </div>

          {/* Search Bar & User Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {/* Global Search Bar */}
            <div className="header-search font-sans">
              <Search size={16} className="header-search-icon" />
              <input 
                type="text" 
                placeholder="Search user, ID or email..."
                className="header-search-input font-sans"
                onClick={() => navigate('/admin/users')}
              />
            </div>

            {/* Notification Bell */}
            <button 
              className="header-action-btn"
              onClick={() => navigate('/admin/security')}
              title="Admin Security Alerts"
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
                <UserAvatar
                  name={displayName}
                  avatarPath={profile?.avatar_path || profile?.avatar_url}
                  size="sm"
                />
                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-black)', lineHeight: 1.2 }}>
                    {displayName}
                  </span>
                  <span style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)' }}>
                    Admin · Institution Control
                  </span>
                </div>
                <ChevronDown size={14} style={{ color: 'var(--brand-dark-grey)' }} />
              </button>

              {/* Profile Menu Dropdown */}
              {isProfileOpen && (
                <div className="profile-dropdown">
                  <div className="dropdown-header">
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{displayName}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>{displayEmail}</span>
                  </div>

                  <button
                    className="dropdown-item"
                    onClick={handleLogout}
                    style={{ color: 'var(--color-error)' }}
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
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

export default AdminAppShell;
