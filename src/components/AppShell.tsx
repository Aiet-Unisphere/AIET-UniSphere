import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen, 
  ClipboardList, 
  FileCheck2, 
  CalendarCheck, 
  FileText,
  Clock,
  Calendar,
  Award,
  Megaphone,
  Bell,
  FolderGit2,
  FolderPlus,
  Terminal,
  GitBranch,
  Sparkles,
  BarChart3,
  Target,
  Lightbulb,
  GraduationCap,
  Trophy,
  LifeBuoy,
  Menu, 
  Search, 
  LogOut, 
  User as UserIcon,
  ChevronDown
} from 'lucide-react';
import { AuthLogo } from './AuthLogo';
import { mockStudentProfile } from '../data/students';
import { getUnreadNotificationsCount } from '../services/notificationService';

import { useAuth } from '../app/context/AuthContext';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile, user } = useAuth();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(2);
  
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateCount = () => {
      getUnreadNotificationsCount().then(count => setUnreadNotifications(count));
    };
    updateCount();

    window.addEventListener('notifications_updated', updateCount);
    return () => {
      window.removeEventListener('notifications_updated', updateCount);
    };
  }, [location.pathname]);

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
    if (confirm("Are you sure you want to sign out?")) {
      await signOut();
      navigate('/login/student');
    }
  };

  const navDashboard = [
    { label: 'Dashboard', path: '/student/dashboard', icon: <LayoutDashboard size={18} /> }
  ];

  const navAcademics = [
    { label: 'Courses', path: '/student/courses', icon: <BookOpen size={18} /> },
    { label: 'Assignments', path: '/student/assignments', icon: <ClipboardList size={18} /> },
    { label: 'Assessments', path: '/student/assessments', icon: <FileCheck2 size={18} /> },
    { label: 'Attendance', path: '/student/attendance', icon: <CalendarCheck size={18} /> },
    { label: 'Leave Requests', path: '/student/leave-requests', icon: <FileText size={18} /> },
    { label: 'Timetable', path: '/student/timetable', icon: <Clock size={18} /> },
    { label: 'Academic Calendar', path: '/student/calendar', icon: <Calendar size={18} /> },
    { label: 'Results', path: '/student/results', icon: <Award size={18} /> },
  ];

  const navCommunication = [
    { label: 'Announcements', path: '/student/announcements', icon: <Megaphone size={18} /> },
    { label: 'Notifications', path: '/student/notifications', icon: <Bell size={18} />, badge: unreadNotifications }
  ];

  const navDevelopment = [
    { label: 'Projects', path: '/student/projects', icon: <FolderGit2 size={18} /> },
    { label: 'My Projects', path: '/student/projects/my', icon: <FolderPlus size={18} /> },
    { label: 'Workspace', path: '/student/projects/proj-1/workspace', icon: <Terminal size={18} /> },
    { label: 'Git / GitHub', path: '/student/github', icon: <GitBranch size={18} /> },
  ];

  const navIntelligence = [
    { label: 'AI Assistant', path: '/student/ai', icon: <Sparkles size={18} /> },
    { label: 'Analytics', path: '/student/analytics', icon: <BarChart3 size={18} /> },
    { label: 'Learning Gaps', path: '/student/learning-gaps', icon: <Target size={18} /> },
    { label: 'Recommendations', path: '/student/recommendations', icon: <Lightbulb size={18} /> },
  ];

  const navCareer = [
    { label: 'Skill Passport', path: '/student/skills', icon: <GraduationCap size={18} /> },
    { label: 'Achievements', path: '/student/achievements', icon: <Trophy size={18} /> },
  ];

  const navServices = [
    { label: 'Support Services', path: '/student/services', icon: <LifeBuoy size={18} /> },
    { label: 'My Requests', path: '/student/services/requests', icon: <FileText size={18} /> },
  ];

  // Helper to format page title from current pathname
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/student/dashboard')) return 'Dashboard';
    if (path.includes('/student/courses/')) return 'Course Details';
    if (path.includes('/student/courses')) return 'My Courses';
    if (path.includes('/student/assignments/')) return 'Assignment Submission';
    if (path.includes('/student/assignments')) return 'Assignments';
    if (path.includes('/student/assessments/')) return 'Assessment';
    if (path.includes('/student/assessments')) return 'Assessments';
    if (path.includes('/student/attendance')) return 'Attendance Logs';
    if (path.includes('/student/leave-requests')) return 'Leave Requests';
    if (path.includes('/student/timetable')) return 'Semester Timetable';
    if (path.includes('/student/calendar')) return 'Academic Calendar';
    if (path.includes('/student/results')) return 'Academic Results';
    if (path.includes('/student/announcements')) return 'Announcements';
    if (path.includes('/student/notifications')) return 'Notification Center';
    if (path.includes('/workspace')) return 'Project Workspace';
    if (path.includes('/student/projects/my')) return 'My Projects';
    if (path.includes('/student/projects/')) return 'Project Overview';
    if (path.includes('/student/projects')) return 'Project Portal';
    if (path.includes('/student/github')) return 'Git & GitHub';
    if (path.includes('/student/ai')) return 'AI Learning Assistant';
    if (path.includes('/student/analytics')) return 'Academic Analytics';
    if (path.includes('/student/learning-gaps')) return 'Learning Gaps';
    if (path.includes('/student/recommendations')) return 'Recommendations';
    if (path.includes('/student/skills')) return 'Skill Passport';
    if (path.includes('/student/achievements')) return 'Achievements';
    if (path.includes('/student/services/requests/')) return 'Request Details';
    if (path.includes('/student/services/requests')) return 'My Requests';
    if (path.includes('/student/services')) return 'Student Services';
    return 'Student Portal';
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

          {/* ACADEMICS */}
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Academics</div>
            <div className="app-sidebar-menu">
              {navAcademics.map((item) => (
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

          {/* COMMUNICATION */}
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Communication</div>
            <div className="app-sidebar-menu">
              {navCommunication.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `app-sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  {item.icon}
                  <span style={{ flexGrow: 1 }}>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="sidebar-unread-badge">{item.badge}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          </div>

          {/* DEVELOPMENT */}
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Development</div>
            <div className="app-sidebar-menu">
              {navDevelopment.map((item) => (
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

          {/* INTELLIGENCE */}
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Intelligence</div>
            <div className="app-sidebar-menu">
              {navIntelligence.map((item) => (
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

          {/* CAREER & SKILLS */}
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Career & Skills</div>
            <div className="app-sidebar-menu">
              {navCareer.map((item) => (
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

          {/* STUDENT SERVICES */}
          <div className="app-sidebar-group">
            <div className="app-sidebar-group-title">Student Services</div>
            <div className="app-sidebar-menu">
              {navServices.map((item) => (
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
              placeholder="Search courses, projects..." 
              aria-label="Global search input"
            />
          </div>

          <div className="header-right">
            {/* Notifications button */}
            <button 
              className="header-action-btn" 
              aria-label="View notifications"
              onClick={() => navigate('/student/notifications')}
              title="Open Notification Center"
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
                aria-label="Open profile settings"
              >
                <div className="profile-avatar">
                  {((profile?.full_name || user?.email || 'Student').split(' ').map((n: string) => n[0]).join('')).substring(0, 2)}
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {profile?.full_name || user?.email?.split('@')[0] || 'Student'}
                  <ChevronDown size={14} />
                </span>
              </button>

              {isProfileOpen && (
                <div className="profile-dropdown">
                  <div className="dropdown-header">
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{profile?.full_name || user?.email || 'Student'}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>
                      Student · {profile?.department?.name || 'Department not assigned'}
                    </span>
                    {profile?.usn_or_employee_id && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                        ID: {profile.usn_or_employee_id}
                      </span>
                    )}
                  </div>
                  <button 
                    className="dropdown-item"
                    onClick={() => { setIsProfileOpen(false); navigate('/student/profile'); }}
                  >
                    <UserIcon size={16} />
                    My Profile
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
export default AppShell;
