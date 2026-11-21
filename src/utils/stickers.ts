import { ARCADE_STICKER_PACK } from '../assets/stickers/arcadeStickers';

export interface EraSticker {
  id: string;
  packId?: string;
  labelAr: string;
  labelEn: string;
  emoji: string;
  bg: string;
  accent: string;
  tagline: string;
  taglineAr?: string;
}

export interface StickerPack {
  id: string;
  nameEn: string;
  nameAr: string;
  badge: string;
  previewEmoji: string;
  accent: string;
  stickers: EraSticker[];
}

export interface EraGifItem {
  id: string;
  titleEn: string;
  titleAr: string;
  keywords: string[];
  dataUrl: string;
}

export const ERA_STICKER_PACKS: StickerPack[] = [
  ARCADE_STICKER_PACK,
  {
    id: 'era_funny',
    nameEn: 'ERA Funny',
    nameAr: 'كوميديا ERA',
    badge: 'FUN',
    previewEmoji: '🤣',
    accent: '#1DB954',
    stickers: [
      {
        id: 'funny_rofl',
        packId: 'era_funny',
        labelEn: 'ROFL',
        labelAr: 'موت ضحك',
        emoji: '🤣',
        bg: 'from-[#14261C] to-[#1DB954]',
        accent: '#1DB954',
        tagline: 'ROFL!',
        taglineAr: 'هموت!',
      },
      {
        id: 'funny_clown',
        packId: 'era_funny',
        labelEn: 'Clown Mode',
        labelAr: 'يا عم بهزر',
        emoji: '🤡',
        bg: 'from-[#2A192E] to-[#EC4899]',
        accent: '#F472B6',
        tagline: 'CLOWN',
        taglineAr: 'مهرج',
      },
      {
        id: 'funny_skull',
        packId: 'era_funny',
        labelEn: "I'm Dead",
        labelAr: 'وقعت ضحك',
        emoji: '💀',
        bg: 'from-[#18181B] to-[#3F3F46]',
        accent: '#E4E4E7',
        tagline: 'DEAD',
        taglineAr: 'فصلت',
      },
      {
        id: 'funny_sideeye',
        packId: 'era_funny',
        labelEn: 'Sus',
        labelAr: 'مش مرتاحلك',
        emoji: '🤨',
        bg: 'from-[#2D2006] to-[#D97706]',
        accent: '#FBBF24',
        tagline: 'SUS...',
        taglineAr: 'اشك!',
      },
      {
        id: 'funny_popcorn',
        packId: 'era_funny',
        labelEn: 'Drama Time',
        labelAr: 'فرجة ودراما',
        emoji: '🍿',
        bg: 'from-[#3B1515] to-[#DC2626]',
        accent: '#F87171',
        tagline: 'DRAMA',
        taglineAr: 'دراما',
      },
      {
        id: 'funny_brain',
        packId: 'era_funny',
        labelEn: 'Big Brain',
        labelAr: 'دماغ شغالة',
        emoji: '🧠',
        bg: 'from-[#172554] to-[#2563EB]',
        accent: '#60A5FA',
        tagline: '200 IQ',
        taglineAr: 'عبقري',
      },
      {
        id: 'funny_shush',
        packId: 'era_funny',
        labelEn: 'No Comment',
        labelAr: 'هس خالص',
        emoji: '🤫',
        bg: 'from-[#1A2E22] to-[#0D9488]',
        accent: '#2DD4BF',
        tagline: 'SHHH',
        taglineAr: 'هس!',
      },
      {
        id: 'funny_melting',
        packId: 'era_funny',
        labelEn: 'Melting',
        labelAr: 'سيحت خلاص',
        emoji: '🫠',
        bg: 'from-[#311A09] to-[#EA580C]',
        accent: '#FB923C',
        tagline: 'MELT',
        taglineAr: 'سيحت',
      },
    ],
  },
  {
    id: 'egyptian_slang',
    nameEn: 'Egyptian Slang',
    nameAr: 'مصري أصلي',
    badge: 'EGY',
    previewEmoji: '🇪🇬',
    accent: '#F59E0B',
    stickers: [
      {
        id: 'egy_dehk',
        packId: 'egyptian_slang',
        labelEn: 'Dehk',
        labelAr: 'ضحك',
        emoji: '😂',
        bg: 'from-[#163020] to-[#1DB954]',
        accent: '#4ADE80',
        tagline: 'ضحك',
        taglineAr: 'ضحك',
      },
      {
        id: 'egy_ash',
        packId: 'egyptian_slang',
        labelEn: '3ash!',
        labelAr: 'عاش',
        emoji: '🔥',
        bg: 'from-[#3B1908] to-[#EA580C]',
        accent: '#FDBA74',
        tagline: 'عاش',
        taglineAr: 'عاش',
      },
      {
        id: 'egy_ehda',
        packId: 'egyptian_slang',
        labelEn: 'Eh da?!',
        labelAr: 'ايه ده؟',
        emoji: '😳',
        bg: 'from-[#31102F] to-[#DB2777]',
        accent: '#F9A8D4',
        tagline: 'ايه ده؟',
        taglineAr: 'ايه ده؟',
      },
      {
        id: 'egy_yaam',
        packId: 'egyptian_slang',
        labelEn: 'Ya 3am',
        labelAr: 'يا عم',
        emoji: '😒',
        bg: 'from-[#1E293B] to-[#475569]',
        accent: '#CBD5E1',
        tagline: 'يا عم',
        taglineAr: 'يا عم',
      },
      {
        id: 'egy_tamam',
        packId: 'egyptian_slang',
        labelEn: 'Tamam',
        labelAr: 'تمام',
        emoji: '👌',
        bg: 'from-[#0C2D48] to-[#0284C7]',
        accent: '#38BDF8',
        tagline: 'تمام',
        taglineAr: 'تمام',
      },
      {
        id: 'egy_meyameya',
        packId: 'egyptian_slang',
        labelEn: 'Meya Meya',
        labelAr: 'ميه ميه',
        emoji: '💯',
        bg: 'from-[#142D1B] to-[#16A34A]',
        accent: '#86EFAC',
        tagline: 'ميه ميه',
        taglineAr: 'ميه ميه',
      },
      {
        id: 'egy_yallabena',
        packId: 'egyptian_slang',
        labelEn: 'Yalla Bena',
        labelAr: 'يلا بينا',
        emoji: '🚀',
        bg: 'from-[#1E1B4B] to-[#6D28D9]',
        accent: '#C4B5FD',
        tagline: 'يلا بينا',
        taglineAr: 'يلا بينا',
      },
      {
        id: 'egy_khalas',
        packId: 'egyptian_slang',
        labelEn: 'Khalas Ba2a',
        labelAr: 'خلاص بقى',
        emoji: '🤦',
        bg: 'from-[#3B0F18] to-[#BE123C]',
        accent: '#FDA4AF',
        tagline: 'خلاص بقى',
        taglineAr: 'خلاص بقى',
      },
    ],
  },
  {
    id: 'love',
    nameEn: 'Love',
    nameAr: 'حب ومشاعر',
    badge: 'LOVE',
    previewEmoji: '❤️',
    accent: '#F43F5E',
    stickers: [
      {
        id: 'love_heart',
        packId: 'love',
        labelEn: 'Love You',
        labelAr: 'بحبك',
        emoji: '❤️',
        bg: 'from-[#4C0519] to-[#E11D48]',
        accent: '#FDA4AF',
        tagline: 'LOVE U',
        taglineAr: 'بحبك',
      },
      {
        id: 'love_hearts_eyes',
        packId: 'love',
        labelEn: 'Adore',
        labelAr: 'قمر اوي',
        emoji: '😍',
        bg: 'from-[#3F0D2D] to-[#DB2777]',
        accent: '#F9A8D4',
        tagline: 'ADORE',
        taglineAr: 'عشق',
      },
      {
        id: 'love_hug',
        packId: 'love',
        labelEn: 'Big Hug',
        labelAr: 'حضن كبير',
        emoji: '🫂',
        bg: 'from-[#311038] to-[#9333EA]',
        accent: '#E9D5FF',
        tagline: 'HUGS',
        taglineAr: 'حضن',
      },
      {
        id: 'love_kiss',
        packId: 'love',
        labelEn: 'Mwah',
        labelAr: 'بوسة',
        emoji: '😘',
        bg: 'from-[#4A0E24] to-[#F43F5E]',
        accent: '#FECDD3',
        tagline: 'MWAH',
        taglineAr: 'مواه',
      },
      {
        id: 'love_plead',
        packId: 'love',
        labelEn: 'Miss You',
        labelAr: 'وحشتني',
        emoji: '🥺',
        bg: 'from-[#1E1B4B] to-[#EC4899]',
        accent: '#FBCFE8',
        tagline: 'MISS U',
        taglineAr: 'وحشتني',
      },
      {
        id: 'love_rose',
        packId: 'love',
        labelEn: 'For You',
        labelAr: 'وردة ليك',
        emoji: '🌹',
        bg: 'from-[#450A0A] to-[#B91C1C]',
        accent: '#FCA5A5',
        tagline: '4 YOU',
        taglineAr: 'ليك',
      },
      {
        id: 'love_sparkles',
        packId: 'love',
        labelEn: 'Bestie',
        labelAr: 'احلى حد',
        emoji: '💖',
        bg: 'from-[#3B0764] to-[#C026D3]',
        accent: '#F5D0FE',
        tagline: 'BESTIE',
        taglineAr: 'احلى حد',
      },
      {
        id: 'love_forever',
        packId: 'love',
        labelEn: 'Forever',
        labelAr: 'دايما سوا',
        emoji: '🫶',
        bg: 'from-[#16302B] to-[#1DB954]',
        accent: '#86EFAC',
        tagline: 'ALWAYS',
        taglineAr: 'دايما',
      },
    ],
  },
  {
    id: 'gaming',
    nameEn: 'Gaming',
    nameAr: 'جيمنج',
    badge: 'GG',
    previewEmoji: '🎮',
    accent: '#A855F7',
    stickers: [
      {
        id: 'game_gg',
        packId: 'gaming',
        labelEn: 'GG WP',
        labelAr: 'جي جي',
        emoji: '🎮',
        bg: 'from-[#1E1B4B] to-[#7C3AED]',
        accent: '#C4B5FD',
        tagline: 'GG WP',
        taglineAr: 'GG WP',
      },
      {
        id: 'game_clutch',
        packId: 'gaming',
        labelEn: 'Clutch!',
        labelAr: 'كلتش اسطوري',
        emoji: '🏆',
        bg: 'from-[#3B2606] to-[#D97706]',
        accent: '#FDE68A',
        tagline: 'CLUTCH',
        taglineAr: 'اسطورة',
      },
      {
        id: 'game_mvp',
        packId: 'gaming',
        labelEn: 'MVP',
        labelAr: 'نجم الجيم',
        emoji: '👑',
        bg: 'from-[#2E1065] to-[#A855F7]',
        accent: '#FDE047',
        tagline: 'MVP',
        taglineAr: 'MVP',
      },
      {
        id: 'game_headshot',
        packId: 'gaming',
        labelEn: 'Boom!',
        labelAr: 'في المقص',
        emoji: '🎯',
        bg: 'from-[#3F0F14] to-[#DC2626]',
        accent: '#FCA5A5',
        tagline: 'AIM 100',
        taglineAr: 'قناص',
      },
      {
        id: 'game_squad',
        packId: 'gaming',
        labelEn: 'Drop In',
        labelAr: 'يلا سكواد',
        emoji: '🎧',
        bg: 'from-[#0F172A] to-[#1DB954]',
        accent: '#4ADE80',
        tagline: 'SQUAD?',
        taglineAr: 'سكواد؟',
      },
      {
        id: 'game_rage',
        packId: 'gaming',
        labelEn: 'Lag!!',
        labelAr: 'البنج عالي',
        emoji: '🤬',
        bg: 'from-[#450A0A] to-[#EA580C]',
        accent: '#FDBA74',
        tagline: '999 PING',
        taglineAr: 'لاج!!',
      },
      {
        id: 'game_carry',
        packId: 'gaming',
        labelEn: 'Easy Win',
        labelAr: 'مكسب سهل',
        emoji: '⚡',
        bg: 'from-[#0C1D37] to-[#2563EB]',
        accent: '#7DD3FC',
        tagline: 'EZ WIN',
        taglineAr: 'ايزي',
      },
      {
        id: 'game_ready',
        packId: 'gaming',
        labelEn: 'Ready Up',
        labelAr: 'جاهز للجيم',
        emoji: '🕹️',
        bg: 'from-[#111827] to-[#6366F1]',
        accent: '#A5B4FC',
        tagline: 'READY',
        taglineAr: 'جاهز',
      },
    ],
  },
];

// Flat list preserved for compatibility
export const ERA_STICKERS: EraSticker[] = [
  {
    id: 'era_salute',
    labelAr: 'تحية ERA',
    labelEn: 'ERA Salute',
    emoji: '🫡',
    bg: 'from-[#121F17] to-[#1DB954]',
    accent: '#1DB954',
    tagline: 'ERA!',
  },
  ...ERA_STICKER_PACKS.flatMap((pack) => pack.stickers),
];

export function getStickerById(id?: string): EraSticker | undefined {
  if (!id) return undefined;
  return ERA_STICKERS.find((s) => s.id === id);
}

export function getStickerPackById(packId?: string): StickerPack | undefined {
  if (!packId) return undefined;
  return ERA_STICKER_PACKS.find((p) => p.id === packId);
}

function makeAnimatedGifDataUrl(opts: {
  bg1: string;
  bg2: string;
  accent: string;
  emoji: string;
  text: string;
  anim: 'bounce' | 'pulse' | 'spin' | 'shake' | 'float';
}): string {
  const safeText = opts.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let animTag = '';
  if (opts.anim === 'bounce') {
    animTag = `<animateTransform attributeName="transform" type="translate" values="0,8; 0,-12; 0,8" dur="0.9s" repeatCount="indefinite"/>`;
  } else if (opts.anim === 'pulse') {
    animTag = `<animateTransform attributeName="transform" type="scale" values="0.92; 1.14; 0.92" dur="1.05s" repeatCount="indefinite"/>`;
  } else if (opts.anim === 'spin') {
    animTag = `<animateTransform attributeName="transform" type="rotate" values="-10 0 0; 10 0 0; -10 0 0" dur="1.1s" repeatCount="indefinite"/>`;
  } else if (opts.anim === 'shake') {
    animTag = `<animateTransform attributeName="transform" type="translate" values="-8,0; 8,0; -6,0; 6,0; 0,0" dur="0.65s" repeatCount="indefinite"/>`;
  } else {
    animTag = `<animateTransform attributeName="transform" type="translate" values="0,5; 0,-8; 0,5" dur="1.5s" repeatCount="indefinite"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" width="320" height="220">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${opts.bg1}"/>
      <stop offset="100%" stop-color="${opts.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="220" rx="28" fill="url(#g)"/>
  <circle cx="52" cy="44" r="18" fill="${opts.accent}" opacity="0.18">
    <animate attributeName="r" values="14;24;14" dur="1.8s" repeatCount="indefinite"/>
  </circle>
  <circle cx="272" cy="176" r="22" fill="${opts.accent}" opacity="0.16">
    <animate attributeName="r" values="18;28;18" dur="2.1s" repeatCount="indefinite"/>
  </circle>
  <rect x="8" y="8" width="304" height="204" rx="22" fill="none" stroke="${opts.accent}" stroke-opacity="0.45" stroke-width="2.5"/>
  <g transform="translate(160,92)">
    <g>
      ${animTag}
      <text x="0" y="18" text-anchor="middle" font-size="76" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${opts.emoji}</text>
    </g>
  </g>
  <rect x="34" y="156" width="252" height="42" rx="21" fill="#000000" fill-opacity="0.42"/>
  <text x="160" y="184" text-anchor="middle" fill="#FFFFFF" font-size="22" font-weight="800" font-family="Poppins,Cairo,system-ui,sans-serif">${safeText}</text>
</svg>`;

  const base64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(svg)))
      : '';
  return `data:image/svg+xml;base64,${base64}`;
}

export const ERA_GIFS: EraGifItem[] = [
  {
    id: 'gif_haha',
    titleEn: 'LOL Haha',
    titleAr: 'هموت ضحك',
    keywords: ['funny', 'lol', 'haha', 'laugh', 'ضحك', 'كوميدي'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#0D2618',
      bg2: '#1DB954',
      accent: '#86EFAC',
      emoji: '😂',
      text: 'HAHAHA!',
      anim: 'shake',
    }),
  },
  {
    id: 'gif_fire',
    titleEn: 'On Fire',
    titleAr: 'نار يا حبيبي',
    keywords: ['fire', 'lit', 'hot', 'عاش', 'نار'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#3B1106',
      bg2: '#EA580C',
      accent: '#FDBA74',
      emoji: '🔥',
      text: 'ON FIRE!',
      anim: 'pulse',
    }),
  },
  {
    id: 'gif_love',
    titleEn: 'Sending Love',
    titleAr: 'بحبك اوي',
    keywords: ['love', 'heart', 'kiss', 'حب', 'قلب', 'بحبك'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#4C0519',
      bg2: '#E11D48',
      accent: '#FDA4AF',
      emoji: '❤️',
      text: 'LOVE YOU!',
      anim: 'pulse',
    }),
  },
  {
    id: 'gif_clap',
    titleEn: 'Bravo!',
    titleAr: 'برافو عليك',
    keywords: ['clap', 'bravo', 'congrats', 'عاش', 'تصفيق', 'برافو'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#0F291E',
      bg2: '#10B981',
      accent: '#6EE7B7',
      emoji: '👏',
      text: 'BRAVO!',
      anim: 'bounce',
    }),
  },
  {
    id: 'gif_party',
    titleEn: 'Party Time',
    titleAr: 'احتفال',
    keywords: ['party', 'celebrate', 'win', 'فرح', 'احتفال'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#2E1065',
      bg2: '#9333EA',
      accent: '#FDE047',
      emoji: '🥳',
      text: 'LET’S PARTY!',
      anim: 'spin',
    }),
  },
  {
    id: 'gif_rocket',
    titleEn: 'To The Moon',
    titleAr: 'يلا بينا طيران',
    keywords: ['rocket', 'go', 'fast', 'yalla', 'انطلاق', 'يلا'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#0A192F',
      bg2: '#2563EB',
      accent: '#7DD3FC',
      emoji: '🚀',
      text: 'LET’S GO!',
      anim: 'bounce',
    }),
  },
  {
    id: 'gif_gaming',
    titleEn: 'GG EZ',
    titleAr: 'جي جي',
    keywords: ['gg', 'game', 'gaming', 'play', 'جيمنج', 'لعب'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#1E1B4B',
      bg2: '#6D28D9',
      accent: '#A855F7',
      emoji: '🎮',
      text: 'GG WP!',
      anim: 'float',
    }),
  },
  {
    id: 'gif_shocked',
    titleEn: 'Wait What?!',
    titleAr: 'ايه ده بجد؟!',
    keywords: ['what', 'omg', 'shock', 'ايه ده', 'صدمة'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#271738',
      bg2: '#BE185D',
      accent: '#F9A8D4',
      emoji: '🤯',
      text: 'WAIT WHAT?!',
      anim: 'shake',
    }),
  },
  {
    id: 'gif_cool',
    titleEn: 'Too Cool',
    titleAr: 'رايق اوي',
    keywords: ['cool', 'boss', 'chill', 'رايق', 'تمام'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#091E2C',
      bg2: '#0284C7',
      accent: '#38BDF8',
      emoji: '😎',
      text: 'TOO COOL',
      anim: 'float',
    }),
  },
  {
    id: 'gif_coffee',
    titleEn: 'Good Morning',
    titleAr: 'صباح الفل',
    keywords: ['morning', 'coffee', 'hi', 'صباح', 'قهوة'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#2C1810',
      bg2: '#B45309',
      accent: '#FDE68A',
      emoji: '☕',
      text: 'MORNING!',
      anim: 'bounce',
    }),
  },
  {
    id: 'gif_hug',
    titleEn: 'Virtual Hug',
    titleAr: 'حضن كبير',
    keywords: ['hug', 'miss', 'love', 'حضن', 'وحشتني'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#3B0764',
      bg2: '#DB2777',
      accent: '#FBCFE8',
      emoji: '🫂',
      text: 'BIG HUG!',
      anim: 'pulse',
    }),
  },
  {
    id: 'gif_dance',
    titleEn: 'Vibe Check',
    titleAr: 'مزاج عالي',
    keywords: ['dance', 'music', 'vibe', 'مزيكا', 'رقص'],
    dataUrl: makeAnimatedGifDataUrl({
      bg1: '#121212',
      bg2: '#1DB954',
      accent: '#1DB954',
      emoji: '🕺',
      text: 'GOOD VIBES',
      anim: 'spin',
    }),
  },
];
