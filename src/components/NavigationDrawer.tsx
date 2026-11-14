import React from 'react';
import {
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
  onClose: () => void;
  onOpenProfile: () => void;
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
  onClose,
  onOpenProfile,
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

  const items = [
    { icon: User, label: t.drawer.myProfile, onClick: onOpenProfile },
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
        className="fixed inset-0 bg-black/55 backdrop-blur-[1px] transition-opacity"
      />

      <aside className="relative z-10 w-[84vw] max-w-[320px] h-full bg-white dark:bg-[#081c14] text-[#0a2e1f] dark:text-white shadow-2xl border-e border-[#0a2e1f]/10 dark:border-white/10 flex flex-col overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 pt-5 bg-gradient-to-br from-[#0a2e1f] to-[#0f412c] text-white border-b border-white/10">
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
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-[#25D366] flex items-center justify-center cursor-pointer transition-colors"
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

          <div className="mt-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-base truncate">{currentUser.name}</span>
              <UserBadges
                isAdmin={currentUser.isAdmin}
                isVerified={currentUser.isVerified}
                isVip={isVip}
                isPlus={currentUser.isPlus}
                size="xs"
              />
            </div>
            <p className="text-xs text-[#25D366] font-medium truncate">
              @{currentUser.username}
            </p>
          </div>
        </div>

        {/* Menu List */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
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
                className="w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-medium text-[#0a2e1f] dark:text-emerald-50 hover:bg-[#eef5f0] dark:hover:bg-white/8 transition-colors cursor-pointer text-start"
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    item.accent ? 'text-[#25D366]' : 'text-[#134e35] dark:text-[#25D366]/85'
                  }`}
                />
                <span className="truncate">{item.label}</span>
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
              className="w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-semibold text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition-colors cursor-pointer text-start mt-1"
            >
              <Shield className="w-5 h-5 shrink-0" />
              <span className="truncate">{t.sidebar.adminDashboard}</span>
            </button>
          )}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-[#0a2e1f]/10 dark:border-white/10 space-y-2">
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

          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-1.5">
              <DankLogo size={18} />
              <span className="text-[11px] font-bold text-[#0a2e1f] dark:text-white">DANK</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-emerald-100/50">
              {t.brand.footerCopyright}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
};
