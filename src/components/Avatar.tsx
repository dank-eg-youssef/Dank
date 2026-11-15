import React, { useState } from 'react';
import { Bookmark, Lock, Megaphone, Users } from 'lucide-react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showOnlineDot?: boolean;
  chatType?: 'private' | 'group' | 'channel';
  specialType?: 'saved' | 'secret';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const BG_PALETTES = [
  'bg-[var(--dank-surface)] text-[var(--dank-accent)]',
  'bg-[var(--dank-elevated)] text-[var(--dank-text)]',
  'bg-[var(--dank-accent-soft)] text-[var(--dank-accent)]',
  'bg-[var(--dank-hover)] text-[var(--dank-text)]',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'D';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getPaletteClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return BG_PALETTES[Math.abs(hash) % BG_PALETTES.length];
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  isOnline = false,
  showOnlineDot = false,
  chatType,
  specialType,
  className = '',
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const sizeCls = SIZE_CLASSES[size];
  const cleanSrc = src?.trim() || '';
  const hasImage = !specialType && cleanSrc.length > 0 && failedSrc !== cleanSrc;

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {specialType === 'saved' ? (
        <div
          className={`${sizeCls} rounded-full bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] flex items-center justify-center ring-1 ring-[var(--dank-border)]`}
        >
          <Bookmark className="w-5 h-5" />
        </div>
      ) : hasImage ? (
        <img
          src={cleanSrc}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(cleanSrc)}
          className={`${sizeCls} rounded-full object-cover ring-1 ring-[var(--dank-border)]`}
        />
      ) : (
        <div
          className={`${sizeCls} ${getPaletteClass(
            name
          )} rounded-full flex items-center justify-center font-semibold tracking-wide select-none ring-1 ring-[var(--dank-border)]`}
        >
          {chatType === 'channel' ? (
            <Megaphone className="w-4 h-4" />
          ) : chatType === 'group' ? (
            <Users className="w-4 h-4" />
          ) : (
            getInitials(name)
          )}
        </div>
      )}

      {specialType === 'secret' && (
        <span className="absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] flex items-center justify-center ring-2 ring-[var(--dank-canvas)]">
          <Lock className="w-2.5 h-2.5 stroke-[2.6]" />
        </span>
      )}

      {showOnlineDot && isOnline && !specialType && (
        <span
          aria-label="Online"
          className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-[var(--dank-accent)] ring-2 ring-[var(--dank-canvas)]"
        />
      )}
    </div>
  );
};
