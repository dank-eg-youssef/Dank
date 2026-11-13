import React, { useState } from 'react';
import { Megaphone, Users } from 'lucide-react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showOnlineDot?: boolean;
  chatType?: 'private' | 'group' | 'channel';
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
  'bg-[#0A1931] text-[#38BDF8]',
  'bg-[#132C54] text-[#F5EFE6]',
  'bg-[#1E3A5F] text-[#38BDF8]',
  'bg-[#2C4A6E] text-white',
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
  className = '',
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const sizeCls = SIZE_CLASSES[size];
  const cleanSrc = src?.trim() || '';
  const hasImage = cleanSrc.length > 0 && failedSrc !== cleanSrc;

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {hasImage ? (
        <img
          src={cleanSrc}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(cleanSrc)}
          className={`${sizeCls} rounded-full object-cover ring-1 ring-[#0A1931]/10`}
        />
      ) : (
        <div
          className={`${sizeCls} ${getPaletteClass(
            name
          )} rounded-full flex items-center justify-center font-semibold tracking-wide select-none ring-1 ring-[#0A1931]/10`}
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
      {showOnlineDot && isOnline && (
        <span
          aria-label="Online"
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-[#F5EFE6]"
        />
      )}
    </div>
  );
};
