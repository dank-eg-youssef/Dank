import type { Timestamp } from 'firebase/firestore';
import { getTranslations } from '../i18n';
import type { AppLanguage } from '../types/dank';

function getIntlLocale(lang: AppLanguage): string {
  return lang === 'ar' ? 'ar-EG' : 'en-US';
}

export function timestampToMs(ts: Timestamp | null | undefined): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  return 0;
}

export function isUserActuallyOnline(
  isOnline: boolean | undefined,
  lastSeen: Timestamp | null | undefined
): boolean {
  if (!isOnline) return false;
  const ms = timestampToMs(lastSeen);
  if (!ms) return isOnline;
  // Consider stale after 5.5 minutes without heartbeat
  return Date.now() - ms < 330_000;
}

export function formatMessageTime(
  ts: Timestamp | null | undefined,
  lang: AppLanguage = 'ar'
): string {
  const ms = timestampToMs(ts);
  if (!ms) return '';
  return new Intl.DateTimeFormat(getIntlLocale(lang), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function formatSidebarTime(
  ts: Timestamp | null | undefined,
  lang: AppLanguage = 'ar'
): string {
  const ms = timestampToMs(ts);
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return formatMessageTime(ts, lang);
  }
  const diffDays = Math.floor((now.getTime() - ms) / 86_400_000);
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(getIntlLocale(lang), { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(getIntlLocale(lang), {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatChatTime(
  ts: Timestamp | null | undefined,
  lang: AppLanguage = 'ar'
): string {
  return formatSidebarTime(ts, lang);
}

export function formatLastSeen(
  isOnline: boolean | undefined,
  lastSeen: Timestamp | null | undefined,
  lang: AppLanguage = 'ar'
): string {
  const tr = getTranslations(lang).time;
  if (isUserActuallyOnline(isOnline, lastSeen)) {
    return tr.online;
  }
  const ms = timestampToMs(lastSeen);
  if (!ms) return tr.lastSeenRecently;
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return tr.lastSeenJustNow;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return tr.lastSeenMinutesAgo(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return tr.lastSeenHoursAgo(diffHr);
  return tr.lastSeenAt(
    new Intl.DateTimeFormat(getIntlLocale(lang), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms))
  );
}

export function formatDateDivider(
  ts: Timestamp | null | undefined,
  lang: AppLanguage = 'ar'
): string {
  const tr = getTranslations(lang).time;
  const ms = timestampToMs(ts);
  if (!ms) return tr.today;
  const date = new Date(ms);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) return tr.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return tr.yesterday;
  }
  return new Intl.DateTimeFormat(getIntlLocale(lang), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

export function sanitizeUsername(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (cleaned.length >= 2) return cleaned.slice(0, 32);
  return `user_${Math.random().toString(36).slice(2, 7)}`;
}
