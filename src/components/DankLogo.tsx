import React from 'react';

interface DankLogoProps {
  size?: number | 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
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
}) => {
  const px = typeof size === 'number' ? size : SIZE_MAP[size] ?? 40;
  const svgEl = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      width={px}
      height={px}
      className={`shrink-0 rounded-2xl ${showText ? '' : className}`}
      aria-label="DANK"
    >
      <rect width="512" height="512" rx="112" fill="#17212B" />
      <circle
        cx="256"
        cy="256"
        r="184"
        fill="#0E1621"
        stroke="#2AABEE"
        strokeWidth="14"
        strokeOpacity="0.45"
      />
      <path
        d="M256 108c-81.7 0-148 66.3-148 148 0 31.3 9.7 60.4 26.3 84.3L116 396l57.7-17.8c23.7 15.1 51.9 23.8 82.3 23.8 81.7 0 148-66.3 148-148S337.7 108 256 108Z"
        stroke="#2AABEE"
        strokeWidth="22"
        strokeLinejoin="round"
      />
      <path d="M342 184L174 252l63 22 25 65 80-155Z" fill="#2AABEE" />
      <path d="M237 274l105-90-80 155-25-65Z" fill="#5288C1" />
    </svg>
  );

  if (!showText) return svgEl;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {svgEl}
      <span className="font-extrabold tracking-tight text-2xl text-[#0E1621] dark:text-white">
        DANK
      </span>
    </div>
  );
};
