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
  isVerified = false,
  isVip = false,
  isPlus = false,
  size = 'sm',
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const verifiedGradId = `${uid}-verified-bg`;
  const verifiedBorderGradId = `${uid}-verified-border`;

  if (!isVerified && !isVip && !isPlus) return null;

  const iconSize =
    size === 'xs' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-[18px] h-[18px]' : 'w-4 h-4';

  return (
    <span className={`inline-flex items-center gap-1 shrink-0 align-middle ${className}`}>
      {isVerified && (
        <span
          title="Verified Account"
          aria-label="Verified Account"
          className="inline-flex items-center justify-center shrink-0 dank-arcade-verified-badge"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            shapeRendering="crispEdges"
            className={iconSize}
          >
            <defs>
              <linearGradient id={verifiedBorderGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E879F9" />
                <stop offset="50%" stopColor="#EC4899" />
                <stop offset="100%" stopColor="#A855F7" />
              </linearGradient>
              <linearGradient id={verifiedGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9333EA" />
                <stop offset="55%" stopColor="#D946EF" />
                <stop offset="100%" stopColor="#EC4899" />
              </linearGradient>
            </defs>

            {/* Outer circular stepped pixel-art frame */}
            <path
              d="M5 0 H11 V1 H13 V2 H14 V3 H15 V5 H16 V11 H15 V13 H14 V14 H13 V15 H11 V16 H5 V15 H3 V14 H2 V13 H1 V11 H0 V5 H1 V3 H2 V2 H3 V1 H5 Z"
              fill={`url(#${verifiedBorderGradId})`}
            />

            {/* Inner circular pixel core */}
            <path
              d="M5 1 H11 V2 H13 V3 H14 V5 H15 V11 H14 V13 H13 V14 H11 V15 H5 V14 H3 V13 H2 V11 H1 V5 H2 V3 H3 V2 H5 Z"
              fill={`url(#${verifiedGradId})`}
            />

            {/* Blinking Neon White Pixel Checkmark (0.8s arcade bulb blink) */}
            <g className="dank-arcade-verified-check" fill="#FFFFFF">
              <rect x="3" y="8" width="2" height="2" />
              <rect x="4" y="9" width="2" height="2" />
              <rect x="5" y="10" width="2" height="2" />
              <rect x="6" y="10" width="2" height="2" />
              <rect x="7" y="9" width="2" height="2" />
              <rect x="8" y="8" width="2" height="2" />
              <rect x="9" y="7" width="2" height="2" />
              <rect x="10" y="6" width="2" height="2" />
              <rect x="11" y="5" width="2" height="2" />
            </g>
          </svg>
        </span>
      )}

      {isPlus && (
        <span
          title="DANK Plus"
          aria-label="DANK Plus"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[var(--dank-accent-soft)] border border-[var(--dank-accent-border)] text-[var(--dank-accent)] font-bold leading-none text-[9px] tracking-wide shrink-0"
        >
          <Sparkles className="w-2.5 h-2.5" />
          <span>PLUS</span>
        </span>
      )}

      {isVip && (
        <span
          title="DANK VIP (5+ Invites)"
          aria-label="DANK VIP"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-bold leading-none shadow-xs text-[9px] tracking-wide shrink-0"
        >
          <Crown className="w-2.5 h-2.5 stroke-[2.5]" />
          <span>DANK VIP</span>
        </span>
      )}
    </span>
  );
};
