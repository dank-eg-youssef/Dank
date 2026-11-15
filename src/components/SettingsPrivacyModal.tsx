import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  Ban,
  Bell,
  Check,
  Copy,
  Globe,
  KeyRound,
  MonitorSmartphone,
  Palette,
  Phone,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { THEME_OPTIONS, useTheme } from '../contexts/ThemeContext';
import { db } from '../lib/firebase';
import {
  disableTwoStepAuth,
  enableTwoStepAuth,
  revokeActiveSession,
  unblockUserAccount,
  updatePrivacySettings,
  updateUserPhone,
} from '../services/chatService';
import type {
  ActiveSession,
  BlockedUser,
  PrivacyVisibility,
  UserPublic,
} from '../types/dank';
import { formatChatTime, sanitizeUsername } from '../utils/timeFormat';

interface SettingsPrivacyModalProps {
  currentUser: UserPublic;
  allUsers: UserPublic[];
  blockedUsers: BlockedUser[];
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestNotifications: () => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const SettingsPrivacyModal: React.FC<SettingsPrivacyModalProps> = ({
  currentUser,
  allUsers,
  blockedUsers,
  notificationPermission,
  onRequestNotifications,
  onClose,
  onNotify,
}) => {
  const { privateProfile, sessionId, updateUserProfile } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [phone, setPhone] = useState(privateProfile?.phone || '');
  const [savingPhone, setSavingPhone] = useState(false);

  const [privacyPhone, setPrivacyPhone] = useState<PrivacyVisibility>(
    currentUser.privacyPhone || 'nobody'
  );
  const [privacyLastSeen, setPrivacyLastSeen] = useState<PrivacyVisibility>(
    currentUser.privacyLastSeen || 'everyone'
  );
  const [exceptionsInput, setExceptionsInput] = useState(() => {
    const uids = currentUser.privacyLastSeenExceptions || [];
    return uids
      .map((uid) => allUsers.find((u) => u.uid === uid)?.username)
      .filter(Boolean)
      .join(', ');
  });
  const [privacyPhoto, setPrivacyPhoto] = useState<PrivacyVisibility>(
    currentUser.privacyProfilePhoto || 'everyone'
  );
  const [privacyGroupAdd, setPrivacyGroupAdd] = useState<'everyone' | 'contacts'>(
    currentUser.privacyGroupAdd || 'everyone'
  );
  const [privacyCall, setPrivacyCall] = useState<PrivacyVisibility>(
    currentUser.privacyCall || 'everyone'
  );
  const [privacyMessages, setPrivacyMessages] = useState<'everyone' | 'contacts'>(
    currentUser.privacyMessages || 'everyone'
  );
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // 2FA
  const [twoStepPass, setTwoStepPass] = useState('');
  const [twoStepHint, setTwoStepHint] = useState('');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [saving2fa, setSaving2fa] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<ActiveSession[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'users_private', currentUser.uid, 'sessions'),
      orderBy('lastActiveAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setSessions(
        snap.docs
          .map((d) => d.data() as ActiveSession)
          .filter((s) => !s.revoked)
      );
    });
    return () => unsub();
  }, [currentUser.uid]);

  const handleSavePhone = async () => {
    setSavingPhone(true);
    try {
      await updateUserPhone(currentUser.uid, phone);
      onNotify(t.profile.profileUpdated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleSavePrivacy = async () => {
    setSavingPrivacy(true);
    try {
      const usernames = exceptionsInput
        .split(',')
        .map((s) => sanitizeUsername(s))
        .filter((s) => s.length >= 2);
      const exceptionUids = usernames
        .map((uname) => allUsers.find((u) => u.username === uname)?.uid)
        .filter((id): id is string => Boolean(id));

      await updatePrivacySettings(currentUser.uid, {
        privacyPhone,
        privacyLastSeen,
        privacyLastSeenExceptions: exceptionUids,
        privacyProfilePhoto: privacyPhoto,
        privacyGroupAdd,
        privacyCall,
        privacyMessages,
      });
      onNotify(t.profile.profileUpdated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleEnable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (twoStepPass.trim().length < 4) return;
    setSaving2fa(true);
    try {
      const code = await enableTwoStepAuth(currentUser.uid, twoStepPass, twoStepHint);
      setRecoveryCode(code);
      setTwoStepPass('');
      setTwoStepHint('');
      onNotify(t.profile.profileUpdated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSaving2fa(false);
    }
  };

  const handleDisable2fa = async () => {
    setSaving2fa(true);
    try {
      await disableTwoStepAuth(currentUser.uid);
      setRecoveryCode(null);
      onNotify(t.profile.profileUpdated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSaving2fa(false);
    }
  };

  const handleLanguage = async (nextLang: 'ar' | 'en') => {
    await setLanguage(nextLang);
    try {
      await updateUserProfile({ language: nextLang });
    } catch {
      // ignore
    }
    onNotify(nextLang === 'ar' ? t.profile.languageChangedAr : t.profile.languageChangedEn);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-[var(--dank-canvas)] text-[var(--dank-text)] flex items-center justify-between border-b border-[var(--dank-border)]">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[var(--dank-accent)]" />
            <h3 className="text-base font-bold">{t.privacy.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Privacy Assurance Banner */}
          <div className="p-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-accent-border)] flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[var(--dank-accent)] shrink-0" />
            <p className="text-xs font-medium text-[var(--dank-text)] leading-relaxed">
              {t.brand.privacyNotice}
            </p>
          </div>

          {/* Appearance & Language & Notifications */}
          <section className="space-y-3">
            <div className="p-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[var(--dank-accent)]" />
                <span className="text-xs font-bold text-[var(--dank-text)]">
                  {t.theme.appearanceTitle}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {THEME_OPTIONS.map((opt) => {
                  const selected = theme === opt.id;
                  const label =
                    opt.id === 'dank-dark'
                      ? t.theme.dankDark
                      : opt.id === 'midnight-blue'
                      ? t.theme.midnightBlue
                      : opt.id === 'purple-neon'
                      ? t.theme.purpleNeon
                      : t.theme.lightMode;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setTheme(opt.id);
                        void updateUserProfile({ theme: opt.id }).catch(() => {});
                      }}
                      className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                        selected
                          ? 'bg-[var(--dank-accent-soft)] border-[var(--dank-accent)]'
                          : 'bg-[var(--dank-surface)] border-[var(--dank-border)] hover:bg-[var(--dank-hover)]'
                      }`}
                    >
                      <span
                        className="w-8 h-8 rounded-full border border-[var(--dank-border)] relative overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${opt.canvas} 50%, ${opt.accent} 50%)`,
                        }}
                      />
                      <span className="text-[11px] font-semibold text-[var(--dank-text)] leading-tight">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[var(--dank-accent)]" />
                <span className="text-xs font-bold text-[var(--dank-text)]">
                  {t.common.language}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleLanguage('ar')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    language === 'ar'
                      ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                      : 'bg-[var(--dank-surface)] text-[var(--dank-muted)]'
                  }`}
                >
                  {t.common.arabic}
                </button>
                <button
                  type="button"
                  onClick={() => void handleLanguage('en')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    language === 'en'
                      ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                      : 'bg-[var(--dank-surface)] text-[var(--dank-muted)]'
                  }`}
                >
                  {t.common.english}
                </button>
              </div>
            </div>
          </section>

          {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={onRequestNotifications}
              className="w-full h-10 px-4 rounded-xl bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] border border-[var(--dank-border)] text-[var(--dank-text)] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-[var(--dank-accent)]" />
              {t.sidebar.enableNotifications}
            </button>
          )}

          {/* Phone Number */}
          <section className="p-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-2.5">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[var(--dank-accent)]" />
              <h4 className="text-sm font-bold text-[var(--dank-text)]">
                {t.privacy.phoneNumber}
              </h4>
            </div>
            <p className="text-[11px] text-[var(--dank-muted)]">
              {t.privacy.phoneHiddenNote}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                dir="ltr"
                value={phone}
                maxLength={32}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t.privacy.phonePlaceholder}
                className="flex-1 h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
              />
              <button
                type="button"
                disabled={savingPhone}
                onClick={() => void handleSavePhone()}
                className="h-10 px-4 rounded-xl bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs font-bold cursor-pointer"
              >
                {savingPhone ? t.common.saving : t.common.save}
              </button>
            </div>
          </section>

          {/* Privacy Controls */}
          <section className="p-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-3">
            <h4 className="text-sm font-bold text-[var(--dank-text)]">
              {t.privacy.privacySecurity}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--dank-muted)] mb-1">
                  {t.privacy.whoSeesPhone}
                </label>
                <select
                  value={privacyPhone}
                  onChange={(e) => setPrivacyPhone(e.target.value as PrivacyVisibility)}
                  className="w-full h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
                >
                  <option value="nobody">{t.privacy.nobody}</option>
                  <option value="contacts">{t.privacy.contacts}</option>
                  <option value="everyone">{t.privacy.everyone}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--dank-muted)] mb-1">
                  {t.privacy.whoSeesLastSeen}
                </label>
                <select
                  value={privacyLastSeen}
                  onChange={(e) => setPrivacyLastSeen(e.target.value as PrivacyVisibility)}
                  className="w-full h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
                >
                  <option value="everyone">{t.privacy.everyone}</option>
                  <option value="contacts">{t.privacy.contacts}</option>
                  <option value="nobody">{t.privacy.nobody}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--dank-muted)] mb-1">
                  {t.privacy.whoSeesPhoto}
                </label>
                <select
                  value={privacyPhoto}
                  onChange={(e) => setPrivacyPhoto(e.target.value as PrivacyVisibility)}
                  className="w-full h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
                >
                  <option value="everyone">{t.privacy.everyone}</option>
                  <option value="contacts">{t.privacy.contacts}</option>
                  <option value="nobody">{t.privacy.nobody}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--dank-muted)] mb-1">
                  {t.privacy.whoAddsGroups}
                </label>
                <select
                  value={privacyGroupAdd}
                  onChange={(e) => setPrivacyGroupAdd(e.target.value as 'everyone' | 'contacts')}
                  className="w-full h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
                >
                  <option value="everyone">{t.privacy.everyone}</option>
                  <option value="contacts">{t.privacy.contacts}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--dank-muted)] mb-1">
                  {t.privacy.whoCanCall}
                </label>
                <select
                  value={privacyCall}
                  onChange={(e) => setPrivacyCall(e.target.value as PrivacyVisibility)}
                  className="w-full h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
                >
                  <option value="everyone">{t.privacy.everyone}</option>
                  <option value="contacts">{t.privacy.contacts}</option>
                  <option value="nobody">{t.privacy.nobody}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--dank-muted)] mb-1">
                  {t.privacy.whoCanMessage}
                </label>
                <select
                  value={privacyMessages}
                  onChange={(e) => setPrivacyMessages(e.target.value as 'everyone' | 'contacts')}
                  className="w-full h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
                >
                  <option value="everyone">{t.privacy.everyone}</option>
                  <option value="contacts">{t.privacy.contacts}</option>
                </select>
              </div>
            </div>

            <div>
              <input
                type="text"
                dir="ltr"
                value={exceptionsInput}
                onChange={(e) => setExceptionsInput(e.target.value)}
                placeholder={t.privacy.exceptionsPlaceholder}
                className="w-full h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
              />
            </div>

            <button
              type="button"
              disabled={savingPrivacy}
              onClick={() => void handleSavePrivacy()}
              className="w-full h-10 rounded-xl bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {savingPrivacy ? t.common.saving : t.profile.saveChanges}
            </button>
          </section>

          {/* Two-Step Verification */}
          <section className="p-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--dank-accent)]" />
                <h4 className="text-sm font-bold text-[var(--dank-text)]">
                  {t.privacy.twoStepTitle}
                </h4>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  privateProfile?.twoStepEnabled
                    ? 'bg-[var(--dank-accent-soft)] text-[var(--dank-accent)]'
                    : 'bg-[var(--dank-elevated)] text-[var(--dank-muted)]'
                }`}
              >
                {privateProfile?.twoStepEnabled
                  ? t.privacy.twoStepEnabled
                  : t.privacy.twoStepDisabled}
              </span>
            </div>
            <p className="text-[11px] text-[var(--dank-muted)]">
              {t.privacy.twoStepDesc}
            </p>

            {recoveryCode && (
              <div className="p-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-[var(--dank-text)] space-y-1.5">
                <p className="text-[11px] font-semibold text-[var(--dank-accent)]">
                  {t.privacy.recoveryCodeTitle}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-mono font-bold tracking-wider">
                    {recoveryCode}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(recoveryCode);
                      onNotify(t.common.copied);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    {t.common.copy}
                  </button>
                </div>
              </div>
            )}

            {privateProfile?.twoStepEnabled ? (
              <button
                type="button"
                disabled={saving2fa}
                onClick={() => void handleDisable2fa()}
                className="h-9 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                {t.privacy.disableTwoStep}
              </button>
            ) : (
              <form onSubmit={handleEnable2fa} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    minLength={4}
                    required
                    value={twoStepPass}
                    onChange={(e) => setTwoStepPass(e.target.value)}
                    placeholder={t.privacy.passwordPlaceholder}
                    className="h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
                  />
                  <input
                    type="text"
                    value={twoStepHint}
                    onChange={(e) => setTwoStepHint(e.target.value)}
                    placeholder={t.privacy.hintOptional}
                    className="h-10 px-3 rounded-xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving2fa || twoStepPass.trim().length < 4}
                  className="h-10 px-4 rounded-xl bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] disabled:opacity-50 text-[var(--dank-accent-fg)] text-xs font-bold cursor-pointer"
                >
                  {t.privacy.enableTwoStep}
                </button>
              </form>
            )}
          </section>

          {/* Blocked Users */}
          <section className="p-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-2.5">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-500" />
              <h4 className="text-sm font-bold text-[var(--dank-text)]">
                {t.privacy.blockedUsers} ({blockedUsers.length})
              </h4>
            </div>
            {blockedUsers.length === 0 ? (
              <p className="text-xs text-[var(--dank-muted)]">
                {t.privacy.noBlockedUsers}
              </p>
            ) : (
              <div className="divide-y divide-[var(--dank-border)]">
                {blockedUsers.map((b) => (
                  <div key={b.uid} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--dank-text)] truncate">
                        {b.name}
                      </p>
                      <p className="text-[11px] text-[var(--dank-muted)] truncate">@{b.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void unblockUserAccount(currentUser.uid, b.uid).then(() =>
                          onNotify(t.privacy.unblockedSuccess)
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-[var(--dank-surface)] border border-[var(--dank-border)] text-xs font-semibold text-[var(--dank-text)] cursor-pointer"
                    >
                      {t.privacy.unblockUser}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Active Sessions */}
          <section className="p-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-2.5">
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="w-4 h-4 text-[var(--dank-accent)]" />
              <h4 className="text-sm font-bold text-[var(--dank-text)]">
                {t.privacy.activeSessions} ({sessions.length})
              </h4>
            </div>
            <div className="divide-y divide-[var(--dank-border)]">
              {sessions.map((s) => {
                const isCurrent = s.id === sessionId;
                return (
                  <div key={s.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--dank-text)] truncate">
                          {s.deviceName}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--dank-accent-soft)] text-[var(--dank-accent)] text-[10px] font-bold">
                            {t.privacy.thisDevice}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--dank-muted)] truncate">
                        {s.platform} · {formatChatTime(s.lastActiveAt)}
                      </p>
                    </div>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => void revokeActiveSession(currentUser.uid, s.id)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t.privacy.terminateSession}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Footer Copyright */}
          <p className="text-center text-xs font-medium text-[var(--dank-muted)] pt-1">
            {t.brand.footerCopyright}
          </p>
        </div>
      </div>
    </div>
  );
};
