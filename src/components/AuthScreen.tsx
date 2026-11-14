import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Globe,
  MailCheck,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { DankLogo } from './DankLogo';

export const AuthScreen: React.FC = () => {
  const {
    firebaseUser,
    isVerified,
    sessionRevoked,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resendVerificationEmail,
    refreshAuthUser,
    logout,
  } = useAuth();
  const { language, t, setLanguage } = useLanguage();
  const { isDark, toggleTheme } = useTheme();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsProviderEnable, setNeedsProviderEnable] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('dank-auth-lock');
    body.classList.add('dank-auth-lock');

    let startX = 0;
    let startY = 0;
    let startedAtEdge = false;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      const edgeThreshold = 18;
      startedAtEdge =
        touch.clientX <= edgeThreshold || touch.clientX >= window.innerWidth - edgeThreshold;

      if (startedAtEdge) {
        const target = e.target as HTMLElement | null;
        if (target && !target.closest('input, textarea, button, a, select, label')) {
          if (e.cancelable) e.preventDefault();
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // Block horizontal swipe-back gestures from screen edges
      if (startedAtEdge && Math.abs(dx) > Math.abs(dy)) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      // Disable pull-to-refresh when already at top of login scroll container
      const scrollEl = scrollRef.current;
      if (
        scrollEl &&
        scrollEl.scrollTop <= 0 &&
        dy > 0 &&
        Math.abs(dy) > Math.abs(dx)
      ) {
        if (e.cancelable) e.preventDefault();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      html.classList.remove('dank-auth-lock');
      body.classList.remove('dank-auth-lock');
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser || isVerified) return;
    const id = window.setInterval(() => {
      void refreshAuthUser();
    }, 4000);
    return () => window.clearInterval(id);
  }, [firebaseUser, isVerified, refreshAuthUser]);

  const handleAuthError = (err: unknown) => {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : t.errors.unexpected;

    if (code === 'auth/operation-not-allowed') {
      setNeedsProviderEnable(true);
      setError(t.auth.errOperationNotAllowed);
      return;
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      setError(t.auth.errInvalidCredential);
      return;
    }
    if (code === 'auth/user-not-found') {
      setError(t.auth.errUserNotFound);
      return;
    }
    if (code === 'auth/email-already-in-use') {
      setError(t.auth.errEmailInUse);
      return;
    }
    if (code === 'auth/weak-password') {
      setError(t.auth.errWeakPassword);
      return;
    }
    if (code === 'auth/popup-closed-by-user') {
      setError(t.auth.errPopupClosed);
      return;
    }
    setError(msg);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setNeedsProviderEnable(false);

    if (!email.trim() || !password) {
      setError(t.auth.errMissingCreds);
      return;
    }
    if (mode === 'signup' && (!name.trim() || !username.trim())) {
      setError(t.auth.errMissingProfileFields);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, name, username, inviteCode);
        setInfo(t.auth.infoAccountCreated);
      }
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await refreshAuthUser();
      if (!ok) {
        setError(t.auth.errNotVerifiedYet);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.errVerifyRefresh);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await resendVerificationEmail();
      setInfo(t.auth.infoVerificationResent);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.errResendFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="dank-auth-scroll w-full bg-[#eef2f6] dark:bg-[#0E1621] relative transition-colors"
    >
      <div className="min-h-full w-full flex flex-col px-3 pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
        {/* Top Right Controls: Theme Toggle + Language Toggle EN | AR */}
        <div
          dir="ltr"
          className="w-full max-w-5xl mx-auto flex items-center justify-end gap-2 mb-2.5 sm:mb-4 shrink-0"
        >
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
            className="h-9 w-9 rounded-xl bg-[#17212B] text-[#2AABEE] shadow-lg border border-white/12 flex items-center justify-center hover:bg-[#202B36] cursor-pointer transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#17212B] text-white shadow-lg border border-white/12">
            <Globe className="w-3.5 h-3.5 text-[#2AABEE] mx-1.5" />
            <button
              type="button"
              onClick={() => void setLanguage('en')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                language === 'en'
                  ? 'bg-[#2AABEE] text-white'
                  : 'text-[#8C9FB1] hover:text-white'
              }`}
            >
              {t.common.englishShort}
            </button>
            <span className="text-white/25 text-xs select-none">|</span>
            <button
              type="button"
              onClick={() => void setLanguage('ar')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                language === 'ar'
                  ? 'bg-[#2AABEE] text-white'
                  : 'text-[#8C9FB1] hover:text-white'
              }`}
            >
              {t.common.arabicShort}
            </button>
          </div>
        </div>

        <div className="w-full max-w-5xl mx-auto my-auto rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-[#22303F] bg-white dark:bg-[#17212B] grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Telegram Premium Dark Hero Panel */}
          <div className="lg:col-span-5 bg-gradient-to-br from-[#17212B] via-[#131D28] to-[#0E1621] text-white p-3.5 sm:p-6 lg:p-9 flex flex-col justify-between gap-2 sm:gap-5 border-b lg:border-b-0 lg:border-e border-[#22303F]">
            <div>
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="sm:hidden">
                  <DankLogo size={30} />
                </div>
                <div className="hidden sm:block">
                  <DankLogo size={46} />
                </div>
                <div>
                  <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white">
                    {t.appName}
                  </h1>
                  <p className="text-[11px] sm:text-xs text-[#2AABEE] font-semibold">
                    {t.brand.splashTagline}
                  </p>
                </div>
              </div>

              <h2 className="mt-2 sm:mt-5 lg:mt-7 text-sm sm:text-2xl lg:text-3xl font-semibold leading-snug text-white">
                {t.auth.heroTitle}
              </h2>
              <p className="hidden sm:block mt-2.5 text-sm text-[#A3B6C7] leading-relaxed">
                {t.auth.heroDesc}
              </p>
            </div>

            <div className="hidden sm:block rounded-xl p-3.5 sm:p-4 border border-[#2AABEE]/25 bg-white/5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#2AABEE]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{t.brand.privacyNotice}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#B8C7D6]">
                <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  ⚡ {t.tabs.chats} & {t.tabs.channels}
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  🔒 {t.telegram.secretChat}
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  🎬 {t.tabs.reels} & {t.tabs.posts}
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  📞 {t.calls.voiceCall}
                </div>
              </div>
            </div>

            <div className="hidden sm:flex text-xs text-[#8C9FB1] items-center justify-between pt-2 border-t border-white/10">
              <span>{t.auth.bilingualLabel}</span>
              <span className="text-[#2AABEE] font-medium">{t.brand.footerCopyright}</span>
            </div>
          </div>

          {/* Auth / Verification Form Panel */}
          <div className="lg:col-span-7 p-3.5 sm:p-8 lg:p-10 flex flex-col justify-center bg-white dark:bg-[#17212B]">
            {sessionRevoked && (
              <div className="max-w-md mx-auto w-full mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200">
                {t.privacy.sessionRevokedNotice}
              </div>
            )}

            {firebaseUser && !isVerified ? (
              <div className="max-w-md mx-auto w-full space-y-4">
                <div className="w-11 h-11 rounded-xl bg-[#242F3D] text-[#2AABEE] flex items-center justify-center">
                  <MailCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-[#0E1621] dark:text-white">
                    {t.auth.verifyTitle}
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-[#A3B6C7] leading-relaxed">
                    {t.auth.verifyDescPrefix}{' '}
                    <span className="font-semibold text-[#0E1621] dark:text-[#2AABEE]">
                      {firebaseUser.email}
                    </span>
                    . {t.auth.verifyDescSuffix}
                  </p>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-200">
                    {error}
                  </div>
                )}
                {info && (
                  <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-xs text-[#0E1621] dark:text-sky-200">
                    {info}
                  </div>
                )}

                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCheckVerification}
                    className="w-full h-11 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                    {t.auth.iveVerified}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleResend}
                    className="w-full h-11 rounded-xl bg-[#242F3D] hover:bg-[#2C3A4B] text-white font-medium text-sm transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {t.auth.resendEmail}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void logout()}
                    className="w-full h-10 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    {t.auth.signOutOrSwitch}
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto w-full">
                <div className="flex items-center gap-1 p-1 bg-[#f0f4f8] dark:bg-[#0E1621] rounded-xl mb-3 sm:mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                      setInfo(null);
                    }}
                    className={`flex-1 py-1.5 sm:py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                      mode === 'signin'
                        ? 'bg-[#2AABEE] text-white shadow-sm'
                        : 'text-slate-600 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white'
                    }`}
                  >
                    {t.auth.signIn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                      setInfo(null);
                    }}
                    className={`flex-1 py-1.5 sm:py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                      mode === 'signup'
                        ? 'bg-[#2AABEE] text-white shadow-sm'
                        : 'text-slate-600 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white'
                    }`}
                  >
                    {t.auth.createAccount}
                  </button>
                </div>

                <h3 className="text-lg sm:text-2xl font-bold text-[#0E1621] dark:text-white">
                  {mode === 'signin' ? t.auth.welcomeBack : t.auth.joinDank}
                </h3>
                <p className="mt-0.5 text-xs sm:text-sm text-slate-600 dark:text-[#8C9FB1]">
                  {mode === 'signin' ? t.auth.signInDesc : t.auth.signUpDesc}
                </p>

                {error && (
                  <div className="mt-3 p-2.5 sm:p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-200 space-y-2">
                    <p>{error}</p>
                    {needsProviderEnable && (
                      <a
                        href="https://console.firebase.google.com/project/gen-lang-client-0428654102/authentication/providers"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold underline text-[#2AABEE]"
                      >
                        {t.auth.openFirebaseConsole}
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                      </a>
                    )}
                  </div>
                )}

                {info && (
                  <div className="mt-3 p-2.5 sm:p-3 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-xs text-[#0E1621] dark:text-sky-200">
                    {info}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-2.5 sm:mt-5 space-y-2 sm:space-y-4">
                  {mode === 'signup' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
                          {t.auth.fullName}
                        </label>
                        <input
                          type="text"
                          dir="auto"
                          required
                          maxLength={80}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={t.auth.fullNamePlaceholder}
                          className="w-full h-10 sm:h-11 px-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
                          {t.auth.username}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          required
                          maxLength={32}
                          value={username}
                          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                          placeholder={t.auth.usernamePlaceholder}
                          className="w-full h-10 sm:h-11 px-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
                      {t.auth.emailAddress}
                    </label>
                    <input
                      type="email"
                      dir="ltr"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t.auth.emailPlaceholder}
                      className="w-full h-10 sm:h-11 px-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
                      {t.auth.password}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t.auth.passwordPlaceholder}
                        className="w-full h-10 sm:h-11 ps-3.5 pe-11 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                        className="absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {mode === 'signup' && (
                    <div>
                      <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
                        {t.auth.inviteCodeOptional}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        maxLength={16}
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="DANK-XXXX"
                        className="w-full h-10 sm:h-11 px-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full h-11 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {busy
                      ? t.common.pleaseWait
                      : mode === 'signin'
                      ? t.auth.signInButton
                      : t.auth.createAccount}
                  </button>
                </form>

                <div className="my-2.5 sm:my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                  <span className="text-xs text-slate-500 dark:text-[#8C9FB1]">{t.common.or}</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGoogle}
                  className="w-full h-11 rounded-xl bg-[#242F3D] hover:bg-[#2D3B4D] text-white font-medium text-sm flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[#2AABEE]" />
                  {t.auth.continueWithGoogle}
                </button>

                <p className="sm:hidden mt-2.5 text-center text-[10px] text-[#8C9FB1]">
                  {t.brand.footerCopyright}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
