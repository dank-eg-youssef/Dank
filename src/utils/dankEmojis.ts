export type DankEmojiCategory = 'faces' | 'love' | 'gestures' | 'vibes';

export interface DankEmojiDef {
  id: string;
  char: string;
  aliases?: string[];
  nameEn: string;
  nameAr: string;
  category: DankEmojiCategory;
  cloudinaryUrl: string;
}

export const DANK_EMOJIS: DankEmojiDef[] = [
  // Faces (26)
  {
    id: 'joy',
    char: '😂',
    aliases: ['😹'],
    nameEn: 'Tears of Joy',
    nameAr: 'دموع الضحك',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778779/dank_emojis/zu0kdvpts1y9ptxluxym.png',
  },
  {
    id: 'rofl',
    char: '🤣',
    nameEn: 'ROFL',
    nameAr: 'ميت ضحك',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778779/dank_emojis/g84fzaitcmafiewqsacs.png',
  },
  {
    id: 'grin',
    char: '😀',
    aliases: ['😃', '😄', '😁', '😆'],
    nameEn: 'Big Grin',
    nameAr: 'ابتسامة كبيرة',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778779/dank_emojis/cdyy3xpja5zeebjobjzu.png',
  },
  {
    id: 'blush',
    char: '😊',
    aliases: ['🙂', '☺️', '☺', '😌'],
    nameEn: 'Warm Smile',
    nameAr: 'ابتسامة دافئة',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778779/dank_emojis/x0eqkwxb5uspbctmkyg2.png',
  },
  {
    id: 'heart_eyes',
    char: '😍',
    aliases: ['😻'],
    nameEn: 'Heart Eyes',
    nameAr: 'عيون قلوب',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778780/dank_emojis/xk9qik2lo25m3psj68m0.png',
  },
  {
    id: 'smiling_hearts',
    char: '🥰',
    nameEn: 'Smiling with Hearts',
    nameAr: 'حب وقلوب',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778780/dank_emojis/w38ykynf3tqkrddkmo1f.png',
  },
  {
    id: 'kiss',
    char: '😘',
    aliases: ['😗', '😙', '😚'],
    nameEn: 'Blow Kiss',
    nameAr: 'بوسة',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778780/dank_emojis/fbzgzoof4xjiu1xxaqah.png',
  },
  {
    id: 'cool',
    char: '😎',
    nameEn: 'Cool Shades',
    nameAr: 'رايق',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778780/dank_emojis/seq3xbhyfzkt5ngeylmi.png',
  },
  {
    id: 'star_struck',
    char: '🤩',
    nameEn: 'Star Struck',
    nameAr: 'منبهر',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778780/dank_emojis/zdjxz03yu636nabn1opc.png',
  },
  {
    id: 'party',
    char: '🥳',
    nameEn: 'Party Face',
    nameAr: 'احتفال',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778780/dank_emojis/zqel8w33yq7tkmlokcom.png',
  },
  {
    id: 'pleading_tears',
    char: '🥹',
    nameEn: 'Holding Back Tears',
    nameAr: 'متأثر',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778780/dank_emojis/eggonn7nwnajutjefuqq.png',
  },
  {
    id: 'pleading',
    char: '🥺',
    nameEn: 'Pleading Eyes',
    nameAr: 'عيون بريئة',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778780/dank_emojis/uwpttr5gc2bmvxxx7iu0.png',
  },
  {
    id: 'cry',
    char: '😭',
    aliases: ['😢', '😥', '😿'],
    nameEn: 'Loudly Crying',
    nameAr: 'بكاء شديد',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778781/dank_emojis/ociejm5qzctgwj7jh764.png',
  },
  {
    id: 'flushed',
    char: '😳',
    nameEn: 'Flushed',
    nameAr: 'مكسوف',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778781/dank_emojis/bh4ufefdzb6xbmwpppzq.png',
  },
  {
    id: 'mind_blown',
    char: '🤯',
    nameEn: 'Mind Blown',
    nameAr: 'دماغي طارت',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778781/dank_emojis/fk10w22liewxpuu6incc.png',
  },
  {
    id: 'thinking',
    char: '🤔',
    nameEn: 'Thinking',
    nameAr: 'بيفكر',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778781/dank_emojis/cgpohsxptdofwmmyqlod.png',
  },
  {
    id: 'salute',
    char: '🫡',
    nameEn: 'Salute',
    nameAr: 'تحية',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778782/dank_emojis/rjt3bfv2hetvextdcqi6.png',
  },
  {
    id: 'shush',
    char: '🤫',
    nameEn: 'Shushing',
    nameAr: 'هشش',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778782/dank_emojis/w1nsjjtgl1pvftxa1hmq.png',
  },
  {
    id: 'raised_brow',
    char: '🤨',
    nameEn: 'Suspicious',
    nameAr: 'مستغرب',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778782/dank_emojis/wipezdiy9kkks2cnbbir.png',
  },
  {
    id: 'smirk',
    char: '😏',
    nameEn: 'Smirk',
    nameAr: 'ابتسامة خبيثة',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778782/dank_emojis/mgbumhtwgalatoboybd7.png',
  },
  {
    id: 'sleepy',
    char: '😴',
    aliases: ['😪'],
    nameEn: 'Sleeping',
    nameAr: 'نايم',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778782/dank_emojis/p5koyacl5tnsyprxadv4.png',
  },
  {
    id: 'surprised',
    char: '😮',
    aliases: ['😲', '😯', '😱'],
    nameEn: 'Wow Surprised',
    nameAr: 'مندهش',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778782/dank_emojis/fqojdifmlyj9qiblvnda.png',
  },
  {
    id: 'rage',
    char: '🤬',
    aliases: ['😡', '😠', '😤'],
    nameEn: 'Rage Censor',
    nameAr: 'متعصب',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778782/dank_emojis/ku5gcgvdfuw104ayl4v4.png',
  },
  {
    id: 'melting',
    char: '🫠',
    nameEn: 'Melting Smile',
    nameAr: 'سايح',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778782/dank_emojis/webqdwl7i21r1rn1b7lf.png',
  },
  {
    id: 'clown',
    char: '🤡',
    nameEn: 'Clown',
    nameAr: 'مهرج',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778783/dank_emojis/mkcgt0qkxlmvna7lzqer.png',
  },
  {
    id: 'skull',
    char: '💀',
    aliases: ['☠️', '☠'],
    nameEn: 'Dead Laughing',
    nameAr: 'فطسان ضحك',
    category: 'faces',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778783/dank_emojis/k4jqouix05jxohwushe5.png',
  },

  // Love & Hearts (4)
  {
    id: 'heart_red',
    char: '❤️',
    aliases: ['❤', '♥', '♥️', '💖', '💗', '💕', '💘', '💝', '🩷'],
    nameEn: 'Red Heart',
    nameAr: 'قلب أحمر',
    category: 'love',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778783/dank_emojis/lelw4jcvo1ttmg55pd5y.png',
  },
  {
    id: 'heart_green',
    char: '💚',
    nameEn: 'DANK Green Heart',
    nameAr: 'قلب DANK',
    category: 'love',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778783/dank_emojis/okweui0nivsrdndcfgvi.png',
  },
  {
    id: 'heart_broken',
    char: '💔',
    nameEn: 'Broken Heart',
    nameAr: 'قلب مكسور',
    category: 'love',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778784/dank_emojis/fuwdstvdithutx809xn3.png',
  },
  {
    id: 'heart_fire',
    char: '❤️‍🔥',
    aliases: ['❤‍🔥'],
    nameEn: 'Heart on Fire',
    nameAr: 'قلب مولع',
    category: 'love',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778784/dank_emojis/krdzfuevnpubinfosd8m.png',
  },

  // Gestures (6)
  {
    id: 'thumbs_up',
    char: '👍',
    nameEn: 'Thumbs Up',
    nameAr: 'عاش',
    category: 'gestures',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778784/dank_emojis/cubzgesrtq1neqdv4kor.png',
  },
  {
    id: 'thumbs_down',
    char: '👎',
    nameEn: 'Thumbs Down',
    nameAr: 'مش عاجبني',
    category: 'gestures',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778784/dank_emojis/x0aoxal78fkyywgfl5ti.png',
  },
  {
    id: 'clap',
    char: '👏',
    nameEn: 'Clapping Hands',
    nameAr: 'تسقيف',
    category: 'gestures',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778784/dank_emojis/nojwo2xsekjp3tqeshuw.png',
  },
  {
    id: 'pray',
    char: '🙏',
    nameEn: 'Pray / Thanks',
    nameAr: 'شكراً / يا رب',
    category: 'gestures',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778784/dank_emojis/wcl45ayrlofarl1dektq.png',
  },
  {
    id: 'ok_hand',
    char: '👌',
    nameEn: 'OK Tamam',
    nameAr: 'تمام',
    category: 'gestures',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778785/dank_emojis/fkskbsq0uvo4gmwwqngn.png',
  },
  {
    id: 'heart_hands',
    char: '🫶',
    nameEn: 'Heart Hands',
    nameAr: 'إيدين قلب',
    category: 'gestures',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778785/dank_emojis/ellggivz0fjdj28linyk.png',
  },

  // Vibes & Celebration (4)
  {
    id: 'fire',
    char: '🔥',
    nameEn: 'Fire',
    nameAr: 'نار',
    category: 'vibes',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778784/dank_emojis/ihzo6u6xjkahbdmz9am1.png',
  },
  {
    id: 'hundred',
    char: '💯',
    nameEn: '100 Points',
    nameAr: 'مية مية',
    category: 'vibes',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778784/dank_emojis/credv7hbhqtm0yteb2d2.png',
  },
  {
    id: 'crown',
    char: '👑',
    nameEn: 'VIP Crown',
    nameAr: 'تاج',
    category: 'vibes',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778785/dank_emojis/fknuh3ni21gmhsbjhz9g.png',
  },
  {
    id: 'rocket',
    char: '🚀',
    nameEn: 'Rocket',
    nameAr: 'صاروخ',
    category: 'vibes',
    cloudinaryUrl: 'https://res.cloudinary.com/ehjqqr8v/image/upload/v1794778785/dank_emojis/kq1dxfu2zgyhsi1z561s.png',
  },
];

export const DANK_EMOJI_CATEGORIES: Array<{
  id: DankEmojiCategory;
  labelEn: string;
  labelAr: string;
  iconChar: string;
}> = [
  { id: 'faces', labelEn: 'Faces', labelAr: 'الوجوه', iconChar: '😂' },
  { id: 'love', labelEn: 'Love', labelAr: 'الحب', iconChar: '❤️' },
  { id: 'gestures', labelEn: 'Gestures', labelAr: 'الإشارات', iconChar: '👍' },
  { id: 'vibes', labelEn: 'Vibes', labelAr: 'حماس', iconChar: '🔥' },
];

const TOKEN_TO_EMOJI = new Map<string, DankEmojiDef>();
const RAW_TOKENS: string[] = [];

const normalizeEmojiToken = (tok: string): string =>
  tok.replace(/[\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, '');

for (const def of DANK_EMOJIS) {
  const candidates = [def.char, ...(def.aliases || [])];
  for (const c of candidates) {
    TOKEN_TO_EMOJI.set(c, def);
    TOKEN_TO_EMOJI.set(normalizeEmojiToken(c), def);
    RAW_TOKENS.push(c);
    const stripped = normalizeEmojiToken(c);
    if (stripped && stripped !== c) {
      RAW_TOKENS.push(stripped);
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sort longest multi-codepoint tokens first (e.g. ❤️‍🔥 before ❤️)
const UNIQUE_TOKENS = Array.from(new Set(RAW_TOKENS)).sort(
  (a, b) => b.length - a.length
);

// Match optional trailing variation selector (U+FE0F) and optional Fitzpatrick skin-tone modifier
const EMOJI_MATCH_REGEX = new RegExp(
  `(${UNIQUE_TOKENS.map(escapeRegExp).join('|')})(?:\\uFE0F)?(?:[\\u{1F3FB}-\\u{1F3FF}])?`,
  'gu'
);

export function findDankEmoji(token: string): DankEmojiDef | undefined {
  if (!token) return undefined;
  return (
    TOKEN_TO_EMOJI.get(token) ||
    TOKEN_TO_EMOJI.get(normalizeEmojiToken(token))
  );
}

export type RichTextSegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; emoji: DankEmojiDef; raw: string };

export function parseEmojiText(text: string): RichTextSegment[] {
  if (!text) return [];
  const segments: RichTextSegment[] = [];
  let lastIndex = 0;

  EMOJI_MATCH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EMOJI_MATCH_REGEX.exec(text)) !== null) {
    const start = match.index;
    const raw = match[0];
    const baseMatch = match[1];
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    const def = findDankEmoji(raw) || findDankEmoji(baseMatch);
    if (def) {
      segments.push({ type: 'emoji', emoji: def, raw });
    } else {
      segments.push({ type: 'text', value: raw });
    }
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}
