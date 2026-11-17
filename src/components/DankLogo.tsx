import React, { useId } from 'react';

export interface DankLogoProps {
  size?: number | 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  textClassName?: string;
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg', number> = {
  sm: 32,
  md: 44,
  lg: 64,
};

export const DankLogo: React.FC<DankLogoProps> = ({
  size = 40,
  showText = false,
  className = '',
  textClassName = '',
}) => {
  const px = typeof size === 'number' ? size : SIZE_MAP[size] ?? 40;
  const id = useId().replace(/:/g, '');

  const svgEl = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      width={px}
      height={px}
      className={`shrink-0 rounded-[22%] transition-transform duration-200 ${showText ? '' : className}`}
      aria-label="DANK"
    >
      <defs>
        {/* Squircle Background Gradient */}
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--dank-surface, #1E1E1E)" />
          <stop offset="100%" stopColor="var(--dank-elevated, #141414)" />
        </linearGradient>

        {/* Paper Plane Main Wing Gradient */}
        <linearGradient id={`${id}-wing1`} x1="174" y1="184" x2="342" y2="330" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--dank-accent, #1DB954)" />
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>

        {/* Paper Plane Fold Shadow Gradient */}
        <linearGradient id={`${id}-wing2`} x1="237" y1="184" x2="342" y2="339" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#15803D" />
          <stop offset="100%" stopColor="var(--dank-accent-hover, #169C46)" />
        </linearGradient>

        {/* Subtle Ambient Radial Glow */}
        <radialGradient id={`${id}-glow`} cx="256" cy="256" r="220" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--dank-accent, #1DB954)" stopOpacity="0.22" />
          <stop offset="70%" stopColor="var(--dank-accent, #1DB954)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--dank-accent, #1DB954)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Squircle Rounded Base Card */}
      <rect
        x="12"
        y="12"
        width="488"
        height="488"
        rx="124"
        fill={`url(#${id}-bg)`}
        stroke="var(--dank-border, rgba(255,255,255,0.08))"
        strokeWidth="12"
      />

      {/* Ambient Accent Light */}
      <circle cx="256" cy="256" r="210" fill={`url(#${id}-glow)`} />

      {/* Orbit / Connection Ring */}
      <circle
        cx="256"
        cy="256"
        r="180"
        fill="none"
        stroke="var(--dank-accent, #1DB954)"
        strokeWidth="10"
        strokeOpacity="0.3"
      />

      {/* Chat Bubble Silhouette */}
      <path
        d="M256 108c-81.7 0-148 66.3-148 148 0 31.3 9.7 60.4 26.3 84.3L116 396l57.7-17.8c23.7 15.1 51.9 23.8 82.3 23.8 81.7 0 148-66.3 148-148S337.7 108 256 108Z"
        fill="var(--dank-canvas, #121212)"
        stroke="var(--dank-accent, #1DB954)"
        strokeWidth="20"
        strokeLinejoin="round"
      />

      {/* Aerodynamic Supersonic Paper Plane Wings */}
      <path
        d="M342 184L174 252l63 22 25 65 80-155Z"
        fill={`url(#${id}-wing1)`}
      />
      <path
        d="M237 274l105-90-80 155-25-65Z"
        fill={`url(#${id}-wing2)`}
      />

      {/* Crisp Center Wing Crease */}
      <path
        d="M174 252l63 22"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );

  if (!showText) return svgEl;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {svgEl}
      <div className="flex items-center gap-1 select-none">
        <span
          className={`font-black tracking-[-0.03em] text-[var(--dank-text)] leading-none ${
            textClassName || 'text-[22px] sm:text-[24px]'
          }`}
        >
          DANK
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--dank-accent)] shrink-0 self-end mb-1" />
      </div>
    </div>
  );
};
