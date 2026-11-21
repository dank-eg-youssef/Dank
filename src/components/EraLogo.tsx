import React from 'react';

export interface EraLogoProps {
  size?: number | 'sm' | 'md' | 'lg';
  showText?: boolean;
  asHeading?: boolean;
  textLabel?: string;
  className?: string;
  textClassName?: string;
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg', number> = {
  sm: 32,
  md: 44,
  lg: 64,
};

export const ERA_LOGO_SRC = '/assets/aistudio/BBC80EAD-8D76-4B66-AC36-8F51FB6F8E80_dd189a2c.jpeg';

export const EraLogo: React.FC<EraLogoProps> = ({
  size = 40,
  showText = false,
  asHeading = false,
  textLabel = 'ERA',
  className = '',
  textClassName = '',
}) => {
  const px = typeof size === 'number' ? size : SIZE_MAP[size] ?? 40;
  const widthPx = Math.round(px * 2.4);

  const logoEl = (
    <div
      style={{ height: px, width: widthPx }}
      className={`shrink-0 rounded-xl bg-black border border-[var(--era-border)] overflow-hidden flex items-center justify-center p-1 shadow-[0_0_12px_rgba(34,211,238,0.16)] transition-transform duration-200 ${
        showText ? '' : className
      }`}
    >
      <img
        src={ERA_LOGO_SRC}
        alt="Era"
        className="w-full h-full object-contain select-none"
        draggable={false}
      />
    </div>
  );

  if (!showText) return logoEl;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {logoEl}
      <div className="flex items-center gap-1 select-none">
        {asHeading ? (
          <h1
            className={`era-brand-wordmark font-black tracking-[-0.03em] text-[var(--era-text)] leading-none whitespace-nowrap ${
              textClassName || 'text-[22px] sm:text-[24px]'
            }`}
          >
            {textLabel}
          </h1>
        ) : (
          <span
            className={`era-brand-wordmark font-black tracking-[-0.03em] text-[var(--era-text)] leading-none ${
              textClassName || 'text-[22px] sm:text-[24px]'
            }`}
          >
            {textLabel}
          </span>
        )}
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--era-accent)] shrink-0 self-end mb-1" />
      </div>
    </div>
  );
};
