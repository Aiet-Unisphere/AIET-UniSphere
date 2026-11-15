import React from 'react';
import {
  Files,
  Search,
  GitBranch,
  Sun,
  Moon,
  Sparkles,
  ShieldCheck,
  GraduationCap,
  BookOpen,
  Archive,
  Users,
  Code2
} from 'lucide-react';

export type ActivityBarTab =
  | 'explorer'
  | 'intelligence'
  | 'health'
  | 'assistant'
  | 'docs'
  | 'submission'
  | 'team'
  | 'search'
  | 'git';

interface WorkspaceActivityBarProps {
  activeTab: ActivityBarTab;
  onSelectTab: (tab: ActivityBarTab) => void;
  editorTheme: 'vs-dark' | 'light';
  onToggleTheme: () => void;
}

export const WorkspaceActivityBar: React.FC<WorkspaceActivityBarProps> = ({
  activeTab,
  onSelectTab,
  editorTheme,
  onToggleTheme,
}) => {
  const isDark = editorTheme === 'vs-dark';

  const navItems: Array<{ id: ActivityBarTab; label: string; icon: React.ReactNode; group: 'core' | 'academic' | 'tools' }> = [
    { id: 'explorer', label: 'File Explorer (Ctrl+Shift+E)', icon: <Files size={20} />, group: 'core' },
    { id: 'search', label: 'Search in Files (Ctrl+Shift+F)', icon: <Search size={20} />, group: 'core' },
    { id: 'intelligence', label: 'Project Intelligence & Tech Stack', icon: <Sparkles size={20} />, group: 'academic' },
    { id: 'health', label: 'Project Health & Academic Audit', icon: <ShieldCheck size={20} />, group: 'academic' },
    { id: 'assistant', label: 'Academic Assistant & Viva Prep', icon: <GraduationCap size={20} />, group: 'academic' },
    { id: 'docs', label: 'Documentation Studio (README)', icon: <BookOpen size={20} />, group: 'academic' },
    { id: 'submission', label: 'Academic Submission Mode', icon: <Archive size={20} />, group: 'academic' },
    { id: 'git', label: 'Git & Version Control', icon: <GitBranch size={20} />, group: 'tools' },
    { id: 'team', label: 'Project Team & Permissions', icon: <Users size={20} />, group: 'tools' },
  ];

  const barBg = isDark ? '#0B132B' : '#F1F5F9';
  const borderCol = isDark ? '#1C2541' : '#E2E8F0';
  const activeColor = isDark ? '#38BDF8' : '#2563EB';
  const inactiveColor = isDark ? '#64748B' : '#94A3B8';
  const activeBg = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(37, 99, 235, 0.1)';

  return (
    <aside
      className="ide-activity-bar font-sans"
      aria-label="Code Studio Activity Bar"
      style={{
        width: '50px',
        backgroundColor: barBg,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0',
        borderRight: `1px solid ${borderCol}`,
        flexShrink: 0,
        zIndex: 5,
        userSelect: 'none',
      }}
    >
      {/* Top Section: UniSphere Crest Icon & Navigation Tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%', alignItems: 'center' }}>
        {/* UniSphere Brand Icon */}
        <div
          title="AIET UniSphere Code Studio"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563EB 0%, #38BDF8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            marginBottom: '0.5rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
          }}
        >
          <Code2 size={18} strokeWidth={2.5} />
        </div>

        {/* Tab Buttons */}
        {navItems.map((item, idx) => {
          const isActive = activeTab === item.id;
          const showSeparator = idx === 2 || idx === 7;

          return (
            <React.Fragment key={item.id}>
              {showSeparator && (
                <div
                  style={{
                    width: '26px',
                    height: '1px',
                    backgroundColor: borderCol,
                    margin: '0.25rem 0',
                  }}
                />
              )}
              <button
                className={`activity-bar-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab(item.id)}
                title={item.label}
                aria-label={item.label}
                style={{
                  position: 'relative',
                  width: '38px',
                  height: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  backgroundColor: isActive ? activeBg : 'transparent',
                  cursor: 'pointer',
                  color: isActive ? activeColor : inactiveColor,
                  borderRadius: '6px',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '-6px',
                      top: '6px',
                      bottom: '6px',
                      width: '3px',
                      borderRadius: '0 3px 3px 0',
                      backgroundColor: activeColor,
                    }}
                  />
                )}
                {item.icon}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Bottom Section: Theme Switcher */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%', alignItems: 'center' }}>
        <button
          onClick={onToggleTheme}
          title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          aria-label="Toggle Theme"
          style={{
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: inactiveColor,
            borderRadius: '6px',
            transition: 'color 0.15s ease',
          }}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </aside>
  );
};
