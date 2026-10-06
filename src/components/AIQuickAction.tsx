import React from 'react';
import { BookOpen, FileText, HelpCircle, Award, Target, Calendar, RefreshCw, Code, BarChart2, CalendarOff, Bell } from 'lucide-react';

interface QuickActionItem {
  id: string;
  label: string;
  prompt: string;
  // Supports both old (iconName) and new (icon) format
  iconName?: string;
  icon?: string;
}

interface AIQuickActionProps {
  quickActions: QuickActionItem[];
  onSelectAction: (prompt: string) => void;
}

export const AIQuickAction: React.FC<AIQuickActionProps> = ({ quickActions, onSelectAction }) => {
  const getIcon = (iconNameOrIcon: string | undefined) => {
    const name = iconNameOrIcon || '';
    switch (name) {
      case 'BookOpen': case 'book-open': return <BookOpen size={16} className="text-orange" />;
      case 'FileText': case 'file-text': return <FileText size={16} className="text-blue" />;
      case 'HelpCircle': case 'help-circle': return <HelpCircle size={16} className="text-orange" />;
      case 'target': return <Target size={16} className="text-blue" />;
      case 'calendar': return <Calendar size={16} className="text-orange" />;
      case 'refresh-cw': return <RefreshCw size={16} className="text-blue" />;
      case 'code': return <Code size={16} className="text-orange" />;
      case 'clipboard-check': return <FileText size={16} className="text-blue" />;
      // Phase 1 quick action icons
      case 'bar-chart-2': return <BarChart2 size={16} className="text-orange" />;
      case 'calendar-off': return <CalendarOff size={16} className="text-blue" />;
      case 'bell': return <Bell size={16} className="text-orange" />;
      case 'Award':
      default:
        return <Award size={16} className="text-blue" />;
    }
  };

  return (
    <div className="ai-quick-actions-section">
      <h4 className="ai-quick-actions-title font-display">Quick Actions</h4>
      <div className="ai-quick-actions-grid">
        {quickActions.map((qa) => (
          <button
            key={qa.id}
            className="ai-quick-action-card"
            onClick={() => onSelectAction(qa.prompt)}
          >
            <div className="qa-icon-wrapper">
              {getIcon(qa.iconName || qa.icon)}
            </div>
            <div className="qa-content">
              <span className="qa-label">{qa.label}</span>
              <p className="qa-prompt-preview">{qa.prompt}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
