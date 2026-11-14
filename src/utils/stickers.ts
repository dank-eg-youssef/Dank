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
    bg: 'from-[#0a2e1f] to-[#134e35]',
    accent: '#25D366',
    tagline: 'DANK!',
  },
  {
    id: 'dank_fire',
    labelAr: 'نار!',
    labelEn: 'On Fire',
    emoji: '🔥',
    bg: 'from-[#0a2e1f] to-[#166534]',
    accent: '#25D366',
    tagline: 'LIT',
  },
  {
    id: 'dank_love',
    labelAr: 'حب أخضر',
    labelEn: 'DANK Love',
    emoji: '💚',
    bg: 'from-[#064e3b] to-[#0a2e1f]',
    accent: '#4ade80',
    tagline: 'LOVE',
  },
  {
    id: 'dank_laugh',
    labelAr: 'ضحك',
    labelEn: 'Haha!',
    emoji: '😂',
    bg: 'from-[#134e35] to-[#0a2e1f]',
    accent: '#25D366',
    tagline: 'HAHA',
  },
  {
    id: 'dank_vip',
    labelAr: 'تاج VIP',
    labelEn: 'VIP Crown',
    emoji: '👑',
    bg: 'from-[#0a2e1f] to-[#3f2e00]',
    accent: '#facc15',
    tagline: 'VIP',
  },
  {
    id: 'dank_rocket',
    labelAr: 'انطلاق',
    labelEn: 'Let’s Go',
    emoji: '🚀',
    bg: 'from-[#062015] to-[#0d4d31]',
    accent: '#25D366',
    tagline: 'GO!',
  },
  {
    id: 'dank_clap',
    labelAr: 'تصفيق',
    labelEn: 'Bravo',
    emoji: '👏',
    bg: 'from-[#0a2e1f] to-[#14532d]',
    accent: '#86efac',
    tagline: 'BRAVO',
  },
  {
    id: 'dank_100',
    labelAr: 'مئة بالمئة',
    labelEn: '100%',
    emoji: '💯',
    bg: 'from-[#0d3b27] to-[#0a2e1f]',
    accent: '#25D366',
    tagline: '100%',
  },
];

export function getStickerById(id?: string): DankSticker | undefined {
  if (!id) return undefined;
  return DANK_STICKERS.find((s) => s.id === id);
}
