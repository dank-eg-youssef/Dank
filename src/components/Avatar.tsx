import React, { useState } from 'react';
import { Bookmark, Bot, Lock, Megaphone, Users } from 'lucide-react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showOnlineDot?: boolean;
  chatType?: 'private' | 'group' | 'channel';
  specialType?: 'saved' | 'bot' | 'secret';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const BG_PALETTES = [
  'bg-[#0a2e1f] text-[#25D366]',
  'bg-[#134e35] text-white',
  'bg-[#0f3d29] text-[#6ee7b7]',
  'bg-[#195a3f] text-white',
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
          className={`${sizeCls} rounded-full bg-gradient-to-br from-[#25D366] to-[#0f7648] text-white flex items-center justify-center ring-1 ring-black/10 dark:ring-white/15`}
        >
          <Bookmark className="w-5 h-5" />
        </div>
      ) : specialType === 'bot' ? (
        <div
          className={`${sizeCls} rounded-full bg-gradient-to-br from-[#0a2e1f] to-[#166534] text-[#25D366] flex items-center justify-center ring-1 ring-[#25D366]/40`}
        >
          <Bot className="w-5 h-5" />
        </div>
      ) : hasImage ? (
        <img
          src={cleanSrc}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(cleanSrc)}
          className={`${sizeCls} rounded-full object-cover ring-1 ring-black/10 dark:ring-white/15`}
        />
      ) : (
        <div
          className={`${sizeCls} ${getPaletteClass(
            name
          )} rounded-full flex items-center justify-center font-semibold tracking-wide select-none ring-1 ring-black/10 dark:ring-white/15`}
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
        <span className="absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full bg-[#25D366] text-[#041f14] flex items-center justify-center ring-2 ring-white dark:ring-[#0a2e1f]">
          <Lock className="w-2.5 h-2.5 stroke-[2.6]" />
        </span>
      )}

      {showOnlineDot && isOnline && !specialType && (
        <span
          aria-label="Online"
          className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-[#25D366] ring-2 ring-white dark:ring-[#0a2e1f]"
        />
      )}
    </div>
  );
};
