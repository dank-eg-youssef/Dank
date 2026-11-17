import React from 'react';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  Send,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { AppNotification, UserPublic } from '../types/dank';
import { formatMessageTime } from '../utils/timeFormat';
import { Avatar } from './Avatar';

interface NotificationsPageProps {
  notifications: AppNotification[];
  usersMap: Record<string, UserPublic>;
  onClose: () => void;
  onMarkRead: (notifId: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onSelectNotification: (notif: AppNotification) => void;
  onViewProfile: (user: UserPublic) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({
  notifications,
  usersMap,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onSelectNotification,
  onViewProfile,
}) => {
  const { t, language } = useLanguage();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const getTypeIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'follow':
        return (
          <span className="w-5 h-5 rounded-full bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] flex items-center justify-center ring-2 ring-[var(--dank-surface)]">
            <UserPlus className="w-2.5 h-2.5" />
          </span>
        );
      case 'like':
        return (
          <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center ring-2 ring-[var(--dank-surface)]">
            <Heart className="w-2.5 h-2.5 fill-current" />
          </span>
        );
      case 'comment':
        return (
          <span className="w-5 h-5 rounded-full bg-[var(--dank-neon-cyan)] text-black flex items-center justify-center ring-2 ring-[var(--dank-surface)]">
            <MessageCircle className="w-2.5 h-2.5" />
          </span>
        );
      case 'message':
      default:
        return (
          <span className="w-5 h-5 rounded-full bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] flex items-center justify-center ring-2 ring-[var(--dank-surface)]">
            <Send className="w-2.5 h-2.5" />
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--dank-canvas)] flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 bg-[var(--dank-surface)] border-b border-[var(--dank-border)] px-3 sm:px-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-10 h-10 rounded-xl hover:bg-[var(--dank-hover)] text-[var(--dank-text)] flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-5 h-5 text-[var(--dank-accent)] shrink-0" />
            <h2 className="text-base font-bold text-[var(--dank-text)] truncate">
              {t.notifications.title}
            </h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[11px] font-bold tabular-nums">
                {unreadCount}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="h-9 px-2.5 sm:px-3 rounded-xl bg-[var(--dank-accent-soft)] hover:opacity-90 text-[var(--dank-accent)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.notifications.markAllRead}</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="h-9 px-2.5 sm:px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.notifications.clearAll}</span>
            </button>
          )}
        </div>
      </header>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="max-w-md mx-auto py-20 px-6 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] flex items-center justify-center text-[var(--dank-accent)]">
              <Bell className="w-8 h-8" />
            </div>
            <h2 className="text-base font-bold text-[var(--dank-text)]">
              {t.notifications.emptyTitle}
            </h2>
            <p className="text-xs text-[var(--dank-muted)] leading-relaxed">
              {t.notifications.emptyDesc}
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto divide-y divide-[var(--dank-border)] bg-[var(--dank-surface)] sm:my-4 sm:rounded-2xl sm:border sm:border-[var(--dank-border)] overflow-hidden">
            {notifications.map((notif) => {
              const actorUser = usersMap[notif.actorUid];
              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    if (!notif.read) onMarkRead(notif.id);
                    onSelectNotification(notif);
                  }}
                  className={`px-4 py-3.5 flex items-center gap-3.5 cursor-pointer transition-colors ${
                    notif.read
                      ? 'hover:bg-[var(--dank-hover)]'
                      : 'bg-[var(--dank-accent-soft)] hover:bg-[var(--dank-hover)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (actorUser) {
                        onClose();
                        onViewProfile(actorUser);
                      }
                    }}
                    className="relative shrink-0 cursor-pointer"
                  >
                    <Avatar
                      src={actorUser?.photoURL || notif.actorPhoto}
                      name={actorUser?.name || notif.actorName}
                      size="md"
                    />
                    <span className="absolute -bottom-1 -end-1">{getTypeIcon(notif.type)}</span>
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      dir="auto"
                      className={`text-sm leading-snug break-words ${
                        notif.read
                          ? 'text-[var(--dank-text)] opacity-85'
                          : 'font-semibold text-[var(--dank-text)]'
                      }`}
                    >
                      {notif.text}
                    </p>
                    <p className="text-[11px] text-[var(--dank-muted)] mt-0.5 tabular-nums">
                      {notif.createdAt
                        ? formatMessageTime(notif.createdAt, language)
                        : t.notifications.justNow}
                    </p>
                  </div>

                  {!notif.read && (
                    <span
                      aria-label={t.notifications.unreadLabel}
                      className="w-2.5 h-2.5 rounded-full bg-[var(--dank-accent)] shrink-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
