export interface DankSticker {
  id: string;
  labelAr: string;
  labelEn: string;
  emoji: string;
  bg: string;
  accent: string;
  tagline: string;
}

export const DANK_STICKERS: DankSticker[] = [
  {
    id: 'dank_salute',
    labelAr: 'تحية DANK',
    labelEn: 'DANK Salute',
    emoji: '🫡',
    bg: 'from-[#17212B] to-[#2B5278]',
    accent: '#2AABEE',
    tagline: 'DANK!',
  },
  {
    id: 'dank_fire',
    labelAr: 'نار!',
    labelEn: 'On Fire',
    emoji: '🔥',
    bg: 'from-[#1E293B] to-[#0F4C81]',
    accent: '#38BDF8',
    tagline: 'LIT',
  },
  {
    id: 'dank_love',
    labelAr: 'حب DANK',
    labelEn: 'DANK Love',
    emoji: '🩵',
    bg: 'from-[#17212B] to-[#0E4D6B]',
    accent: '#2AABEE',
    tagline: 'LOVE',
  },
  {
    id: 'dank_laugh',
    labelAr: 'ضحك',
    labelEn: 'Haha!',
    emoji: '😂',
    bg: 'from-[#242F3D] to-[#2B5278]',
    accent: '#60A5FA',
    tagline: 'HAHA',
  },
  {
    id: 'dank_vip',
    labelAr: 'تاج VIP',
    labelEn: 'VIP Crown',
    emoji: '👑',
    bg: 'from-[#17212B] to-[#3f2e00]',
    accent: '#facc15',
    tagline: 'VIP',
  },
  {
    id: 'dank_rocket',
    labelAr: 'انطلاق',
    labelEn: 'Let’s Go',
    emoji: '🚀',
    bg: 'from-[#0E1621] to-[#1D4ED8]',
    accent: '#38BDF8',
    tagline: 'GO!',
  },
  {
    id: 'dank_clap',
    labelAr: 'تصفيق',
    labelEn: 'Bravo',
    emoji: '👏',
    bg: 'from-[#17212B] to-[#1E3A5F]',
    accent: '#7DD3FC',
    tagline: 'BRAVO',
  },
  {
    id: 'dank_100',
    labelAr: 'مئة بالمئة',
    labelEn: '100%',
    emoji: '💯',
    bg: 'from-[#202B36] to-[#2B5278]',
    accent: '#2AABEE',
    tagline: '100%',
  },
];

export function getStickerById(id?: string): DankSticker | undefined {
  if (!id) return undefined;
  return DANK_STICKERS.find((s) => s.id === id);
}
