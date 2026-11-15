import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getStickerById } from '../utils/stickers';

interface StickerVisualProps {
  stickerId?: string;
  imageUrl?: string;
  label?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<StickerVisualProps['size']>, { box: string; emoji: string; tag: string }> = {
  xs: { box: 'w-12 h-12 rounded-2xl', emoji: 'text-2xl', tag: 'text-[8px] px-1.5 py-0.5' },
  sm: { box: 'w-16 h-16 rounded-2xl', emoji: 'text-3xl', tag: 'text-[9px] px-2 py-0.5' },
  md: { box: 'w-20 h-20 rounded-3xl', emoji: 'text-4xl', tag: 'text-[10px] px-2 py-0.5' },
  lg: { box: 'w-32 h-32 sm:w-36 sm:h-36 rounded-[28px]', emoji: 'text-6xl', tag: 'text-xs px-3 py-0.5' },
  xl: { box: 'w-40 h-40 rounded-[32px]', emoji: 'text-7xl', tag: 'text-sm px-3.5 py-1' },
};

export const StickerVisual: React.FC<StickerVisualProps> = ({
  stickerId,
  imageUrl,
  label,
  size = 'lg',
  className = '',
}) => {
  const { language } = useLanguage();
  const dims = SIZE_CLASSES[size];
  const resolvedUrl = imageUrl?.trim();

  if (resolvedUrl) {
    return (
      <div className={`relative flex items-center justify-center select-none ${dims.box} ${className}`}>
        <img
          src={resolvedUrl}
          alt={label || 'Sticker'}
          loading="lazy"
          className="w-full h-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
        />
      </div>
    );
  }

  const packSticker = getStickerById(stickerId);
  if (!packSticker) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#181818] to-[#282828] border-2 border-white/80 shadow-xl ${dims.box} ${className}`}
      >
        <span className={dims.emoji}>🎭</span>
      </div>
    );
  }

  const displayTag =
    language === 'ar' ? packSticker.taglineAr || packSticker.tagline : packSticker.tagline;

  return (
    <div
      className={`relative flex flex-col items-center justify-center bg-gradient-to-br ${packSticker.bg} border-[2.5px] border-white/90 shadow-[0_8px_22px_rgba(0,0,0,0.45)] select-none overflow-hidden ${dims.box} ${className}`}
    >
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 30% 25%, ${packSticker.accent}, transparent 65%)`,
        }}
      />
      <span className={`leading-none drop-shadow-md ${dims.emoji}`}>{packSticker.emoji}</span>
      {displayTag && (
        <span
          dir="auto"
          className={`mt-1 rounded-full bg-black/75 border border-white/30 font-extrabold text-white tracking-wide leading-tight max-w-[92%] truncate ${dims.tag}`}
        >
          {displayTag}
        </span>
      )}
    </div>
  );
};
