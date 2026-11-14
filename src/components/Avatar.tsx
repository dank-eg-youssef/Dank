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
  'bg-[#2B5278] text-[#7CC7F5]',
  'bg-[#1F3A52] text-white',
  'bg-[#24466B] text-[#2AABEE]',
  'bg-[#33699E] text-white',
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
          className={`${sizeCls} rounded-full bg-gradient-to-br from-[#2AABEE] to-[#1D7BB8] text-white flex items-center justify-center ring-1 ring-black/10 dark:ring-white/15`}
        >
          <Bookmark className="w-5 h-5" />
        </div>
      ) : specialType === 'bot' ? (
        <div
          className={`${sizeCls} rounded-full bg-gradient-to-br from-[#17212B] to-[#2B5278] text-[#2AABEE] flex items-center justify-center ring-1 ring-[#2AABEE]/45`}
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
        <span className="absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full bg-[#2AABEE] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#17212B]">
          <Lock className="w-2.5 h-2.5 stroke-[2.6]" />
        </span>
      )}

      {showOnlineDot && isOnline && !specialType && (
        <span
          aria-label="Online"
          className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-[#2AABEE] ring-2 ring-white dark:ring-[#17212B]"
        />
      )}
    </div>
  );
};
