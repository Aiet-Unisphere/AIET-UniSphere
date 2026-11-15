import React from 'react';

export type FilterCategory = 'All' | 'Unread' | 'Academic' | 'Projects' | 'System';

interface NotificationFilterProps {
  selectedFilter: FilterCategory;
  onSelectFilter: (category: FilterCategory) => void;
  unreadCount: number;
  totalCount: number;
  categoryCounts?: {
    academic?: number;
    projects?: number;
    system?: number;
  };
}

export const NotificationFilter: React.FC<NotificationFilterProps> = ({
  selectedFilter,
  onSelectFilter,
  unreadCount,
  totalCount,
  categoryCounts
}) => {
  const filterOptions: FilterCategory[] = ['All', 'Unread', 'Academic', 'Projects', 'System'];

  const getBadgeValue = (filter: FilterCategory): number | null => {
    switch (filter) {
      case 'All':
        return totalCount;
      case 'Unread':
        return unreadCount;
      case 'Academic':
        return categoryCounts?.academic ?? null;
      case 'Projects':
        return categoryCounts?.projects ?? null;
      case 'System':
        return categoryCounts?.system ?? null;
      default:
        return null;
    }
  };

  return (
    <div className="tab-filters-container" role="tablist" aria-label="Notification categories">
      {filterOptions.map((filter) => {
        const badgeValue = getBadgeValue(filter);
        const isActive = selectedFilter === filter;

        return (
          <button
            key={filter}
            role="tab"
            aria-selected={isActive}
            className={`tab-filter-btn ${isActive ? 'active' : ''}`}
            onClick={() => onSelectFilter(filter)}
          >
            <span>{filter}</span>
            {badgeValue !== null && badgeValue > 0 && (
              <span className={`tab-filter-count ${filter === 'Unread' && unreadCount > 0 ? 'unread-count' : ''}`}>
                {badgeValue}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
