import React from 'react';
import {
  Bell,
  Bookmark,
  Bot,
  LayoutGrid,
  Lock,
  LogOut,
  Megaphone,
  Moon,
  Phone,
  Settings,
  Shield,
  Sparkles,
  Sun,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import type { UserPublic } from '../types/dank';
import { Avatar } from './Avatar';
import { DankLogo } from './DankLogo';
import { UserBadges } from './UserBadges';

interface NavigationDrawerProps {
  open: boolean;
  currentUser: UserPublic;
  isAdmin: boolean;
  unreadNotifsCount?: number;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenNotifications?: () => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
  onCreateSecretChat: () => void;
  onOpenContacts: () => void;
  onOpenCalls: () => void;
  onOpenSavedMessages: () => void;
  onOpenPostsFeed: () => void;
  onOpenDankTeam: () => void;
  onOpenDankBot: () => void;
  onOpenDankPlus: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  open,
  currentUser,
  isAdmin,
  unreadNotifsCount = 0,
  onClose,
  onOpenProfile,
  onOpenNotifications,
  onCreateGroup,
  onCreateChannel,
  onCreateSecretChat,
  onOpenContacts,
  onOpenCalls,
  onOpenSavedMessages,
  onOpenPostsFeed,
  onOpenDankTeam,
  onOpenDankBot,
  onOpenDankPlus,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
}) => {
  const { t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();

  if (!open) return null;

  const isVip = Boolean(currentUser.isVip || (currentUser.inviteCount ?? 0) >= 5);

  const items: Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
    accent?: boolean;
    badge?: number;
  }> = [
    { icon: User, label: t.drawer.myProfile, onClick: onOpenProfile },
    ...(onOpenNotifications
      ? [
          {
            icon: Bell,
            label: t.notifications.title,
            onClick: onOpenNotifications,
            badge: unreadNotifsCount > 0 ? unreadNotifsCount : undefined,
          },
        ]
      : []),
    { icon: Users, label: t.drawer.newGroup, onClick: onCreateGroup },
    { icon: Megaphone, label: t.drawer.newChannel, onClick: onCreateChannel },
    { icon: Lock, label: t.drawer.newSecretChat, onClick: onCreateSecretChat },
    { icon: UserCheck, label: t.drawer.contacts, onClick: onOpenContacts },
    { icon: Phone, label: t.drawer.calls, onClick: onOpenCalls },
    { icon: Bookmark, label: t.drawer.savedMessages, onClick: onOpenSavedMessages },
    { icon: LayoutGrid, label: t.drawer.postsFeed, onClick: onOpenPostsFeed },
    { icon: Megaphone, label: t.drawer.dankTeam, onClick: onOpenDankTeam, accent: true },
    { icon: Bot, label: t.drawer.dankBot, onClick: onOpenDankBot, accent: true },
    { icon: Sparkles, label: t.drawer.dankPlus, onClick: onOpenDankPlus, accent: true },
    { icon: Settings, label: t.drawer.settings, onClick: onOpenSettings },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[1px] transition-opacity"
      />

      <aside className="relative z-10 w-[85vw] max-w-[330px] h-full bg-white dark:bg-[#17212B] text-[#0E1621] dark:text-white shadow-2xl border-e border-slate-200 dark:border-[#22303F] flex flex-col overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 pt-5 bg-gradient-to-br from-[#17212B] to-[#0E1621] text-white border-b border-[#22303F] shrink-0">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProfile();
              }}
              className="cursor-pointer rounded-full"
            >
              <Avatar
                src={currentUser.photoURL}
                name={currentUser.name}
                size="lg"
                isOnline={true}
                showOnlineDot={true}
              />
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-[#2AABEE] flex items-center justify-center cursor-pointer transition-colors"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.close}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-base leading-snug break-words">
                {currentUser.name}
              </span>
              <UserBadges
                isAdmin={currentUser.isAdmin}
                isVerified={currentUser.isVerified}
                isVip={isVip}
                isPlus={currentUser.isPlus}
                size="xs"
              />
            </div>
            <p dir="ltr" className="text-xs text-[#2AABEE] font-medium break-all text-start">
              @{currentUser.username}
            </p>
          </div>
        </div>

        {/* Menu List */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-2 px-2.5 space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  onClose();
                  item.onClick();
                }}
                className="w-full min-h-[44px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-[#0E1621] dark:text-[#E8F1F8] hover:bg-slate-100 dark:hover:bg-[#242F3D] transition-colors cursor-pointer text-start"
              >
                <span className="flex items-center gap-3 min-w-0 flex-1">
                  <Icon
                    className={`w-5 h-5 shrink-0 ${
                      item.accent ? 'text-[#2AABEE]' : 'text-[#2AABEE]/85'
                    }`}
                  />
                  <span className="whitespace-normal leading-snug break-words">
                    {item.label}
                  </span>
                </span>
                {item.badge ? (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shrink-0">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
              className="w-full min-h-[44px] px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition-colors cursor-pointer text-start mt-1"
            >
              <Shield className="w-5 h-5 shrink-0" />
              <span className="whitespace-normal leading-snug break-words">
                {t.sidebar.adminDashboard}
              </span>
            </button>
          )}
        </nav>

        {/* Clean 2-line Footer + Logout */}
        <div className="p-3 border-t border-slate-200 dark:border-[#22303F] space-y-2 shrink-0 bg-white dark:bg-[#17212B]">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full h-10 px-3 rounded-xl flex items-center gap-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>{t.profile.logout}</span>
          </button>

          <div className="px-1 pt-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <DankLogo size={18} />
              <span className="text-xs font-bold text-[#0E1621] dark:text-white">DANK</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-[#8C9FB1] leading-tight">
              {t.brand.footerCopyright}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
};
