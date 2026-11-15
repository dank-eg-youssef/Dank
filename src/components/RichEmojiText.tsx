import React, { useMemo, useState } from 'react';
import { findDankEmoji, parseEmojiText, type DankEmojiDef } from '../utils/dankEmojis';

interface InlineEmojiImgProps {
  emoji: DankEmojiDef;
  raw?: string;
  className?: string;
}

const InlineEmojiImg: React.FC<InlineEmojiImgProps> = ({
  emoji,
  raw,
  className = 'inline-block w-[1.3em] h-[1.3em] align-[-0.24em] mx-[0.04em] object-contain select-none pointer-events-none',
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span>{raw || emoji.char}</span>;
  }

  return (
    <img
      src={emoji.cloudinaryUrl}
      alt={raw || emoji.char}
      title={emoji.nameEn}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

interface RichEmojiTextProps {
  text: string;
  className?: string;
}

/**
 * Renders message/caption/preview text with system emojis automatically
 * replaced INLINE by DANK's 3D glossy Cloudinary PNGs at text height.
 */
export const RichEmojiText: React.FC<RichEmojiTextProps> = ({ text, className }) => {
  const segments = useMemo(() => parseEmojiText(text), [text]);

  if (!text) return null;

  return (
    <span className={className}>
      {segments.map((seg, idx) =>
        seg.type === 'text' ? (
          <React.Fragment key={idx}>{seg.value}</React.Fragment>
        ) : (
          <InlineEmojiImg key={`${seg.emoji.id}-${idx}`} emoji={seg.emoji} raw={seg.raw} />
        )
      )}
    </span>
  );
};

interface DankEmojiIconProps {
  char: string;
  className?: string;
}

/**
 * Renders a single emoji character (e.g. reaction pill or quick-react bar)
 * as its DANK 3D glossy PNG if mapped, falling back to native char otherwise.
 */
export const DankEmojiIcon: React.FC<DankEmojiIconProps> = ({
  char,
  className = 'w-5 h-5 object-contain inline-block select-none pointer-events-none',
}) => {
  const def = useMemo(() => findDankEmoji(char), [char]);
  if (!def) {
    return <span>{char}</span>;
  }
  return <InlineEmojiImg emoji={def} raw={char} className={className} />;
};
