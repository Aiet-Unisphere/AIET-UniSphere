import React, { useState, useEffect } from 'react';
import { getUserAvatarUrl } from '../services/avatarService';

export interface UserAvatarProps {
  name?: string | null;
  avatarPath?: string | null;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  style?: React.CSSProperties;
  bgColor?: string;
  onClick?: () => void;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarPath,
  avatarUrl,
  size = 'md',
  className = '',
  style = {},
  bgColor,
  onClick
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const path = avatarPath || avatarUrl;

  const loadAvatarUrl = async (targetPath?: string | null) => {
    if (!targetPath) {
      setSignedUrl(null);
      setHasError(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);
    try {
      const url = await getUserAvatarUrl(targetPath);
      setSignedUrl(url);
    } catch (err) {
      console.warn('[UserAvatar] Error loading signed avatar URL:', err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAvatarUrl(path);

    const handleAvatarUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.storagePath) {
        void loadAvatarUrl(customEvent.detail.storagePath);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('profile_avatar_updated', handleAvatarUpdate);
      return () => {
        window.removeEventListener('profile_avatar_updated', handleAvatarUpdate);
      };
    }
  }, [path]);

  // Compute initials fallback
  const getInitials = (fullName?: string | null): string => {
    if (!fullName) return 'US';
    const clean = fullName.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+/i, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'US';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Compute size pixel values
  const getSizePx = (): number => {
    if (typeof size === 'number') return size;
    switch (size) {
      case 'xs': return 24;
      case 'sm': return 32;
      case 'md': return 40;
      case 'lg': return 64;
      case 'xl': return 96;
      default: return 40;
    }
  };

  const px = getSizePx();
  const fontSize = typeof size === 'number' 
    ? `${Math.max(10, Math.round(px * 0.4))}px`
    : size === 'xs' ? '0.65rem'
    : size === 'sm' ? '0.75rem'
    : size === 'md' ? '0.85rem'
    : size === 'lg' ? '1.25rem'
    : '2rem';

  const defaultBg = bgColor || 'var(--brand-orange)';
  const initials = getInitials(name);

  return (
    <div
      className={`user-avatar-circle ${className}`}
      onClick={onClick}
      style={{
        width: `${px}px`,
        height: `${px}px`,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: signedUrl && !hasError ? 'transparent' : defaultBg,
        color: '#ffffff',
        fontWeight: 700,
        fontSize,
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        border: '1.5px solid rgba(255, 255, 255, 0.2)',
        ...style
      }}
    >
      {signedUrl && !hasError ? (
        <img
          src={signedUrl}
          alt={name || 'User Avatar'}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
          onError={() => setHasError(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};

export default UserAvatar;
