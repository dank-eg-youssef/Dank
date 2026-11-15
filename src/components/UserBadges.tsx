import React, { useId } from 'react';
import { Crown, Sparkles } from 'lucide-react';

interface UserBadgesProps {
  isAdmin?: boolean;
  isVerified?: boolean;
  isVip?: boolean;
  isPlus?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const UserBadges: React.FC<UserBadgesProps> = ({
  isAdmin = false,
  isVerified = false,
  isVip = false,
  isPlus = false,
  size = 'sm',
  className = '',
}) => {
  const gradId = useId();

  if (!isAdmin && !isVerified && !isVip && !isPlus) return null;

  const iconSize =
    size === 'xs' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <span className={`inline-flex items-center gap-1 shrink-0 align-middle ${className}`}>
      {isAdmin && (
        <span
          title="DANK Admin"
          aria-label="DANK Admin"
          className="inline-flex items-center justify-center"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className={`${iconSize} drop-shadow-xs`}
          >
            <defs>
              <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7E22CE" />
                <stop offset="48%" stopColor="#EC4899" />
                <stop offset="100%" stopColor="#FBBF24" />
              </linearGradient>
            </defs>
            <path
              d="M12.7 2.4c.3 2.5-.9 4.5-2.4 6-1.2 1.2-2.3 2.4-2.3 4.3 0 1.4.8 2.7 2 3.3-.6-.9-.6-2.1.1-3.1.5-.8 1.4-1.4 1.9-2.4.9 1.1 1.7 2.2 1.7 3.7 0 .8-.3 1.5-.8 2.1 1.7-.4 3.1-2 3.1-4.1 0-1.4-.6-2.7-1.4-3.7 2.2 1.2 3.9 3.6 3.9 6.5 0 3.8-3 6.8-6.8 6.8S5 18.8 5 15c0-3.4 2.1-6.2 4.3-8.4 1.5-1.5 2.6-2.7 3.4-4.2Z"
              fill={`url(#${gradId})`}
            />
          </svg>
        </span>
      )}

      {isVerified && (
        <span
          title="Verified Account"
          aria-label="Verified Account"
          className="inline-flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" fill="none" className={iconSize}>
            <circle cx="12" cy="12" r="10" fill="#1DB954" />
            <path
              d="M8.5 12.4l2.3 2.3 4.8-5.1"
              stroke="#000000"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}

      {isPlus && (
        <span
          title="DANK Plus"
          aria-label="DANK Plus"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#1DB954]/18 border border-[#1DB954]/45 text-[#1DB954] font-bold leading-none text-[9px] tracking-wide"
        >
          <Sparkles className="w-2.5 h-2.5" />
          <span>PLUS</span>
        </span>
      )}

      {isVip && (
        <span
          title="DANK VIP (5+ Invites)"
          aria-label="DANK VIP"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-bold leading-none shadow-xs text-[9px] tracking-wide"
        >
          <Crown className="w-2.5 h-2.5 stroke-[2.5]" />
          <span>DANK VIP</span>
        </span>
      )}
    </span>
  );
};
