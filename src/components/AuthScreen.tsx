import React, { useEffect, useState } from 'react';
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

  // Auto-poll email verification status if signed in & awaiting email verification
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
    <div className="min-h-screen w-full bg-[#eef5f0] dark:bg-[#061811] relative flex items-center justify-center p-4 pt-16 sm:p-8 transition-colors">
      {/* Top Right Controls: Theme Toggle + Language Toggle EN | AR */}
      <div dir="ltr" className="fixed top-4 right-4 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
          className="h-9 w-9 rounded-xl bg-[#0a2e1f] text-[#25D366] shadow-lg border border-white/15 flex items-center justify-center hover:bg-[#113d2b] cursor-pointer transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0a2e1f] text-white shadow-lg border border-white/15">
          <Globe className="w-3.5 h-3.5 text-[#25D366] mx-1.5" />
          <button
            type="button"
            onClick={() => void setLanguage('en')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              language === 'en'
                ? 'bg-[#25D366] text-[#041f14]'
                : 'text-emerald-100 hover:text-white'
            }`}
          >
            {t.common.englishShort}
          </button>
          <span className="text-white/30 text-xs select-none">|</span>
          <button
            type="button"
            onClick={() => void setLanguage('ar')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              language === 'ar'
                ? 'bg-[#25D366] text-[#041f14]'
                : 'text-emerald-100 hover:text-white'
            }`}
          >
            {t.common.arabicShort}
          </button>
        </div>
      </div>

      <div className="w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl border border-[#0a2e1f]/12 dark:border-white/10 bg-white dark:bg-[#0d2218] grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Dark Green Hero Panel */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#0a2e1f] via-[#0d3927] to-[#062015] text-white p-7 md:p-9 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <DankLogo size={46} />
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white">{t.appName}</h1>
                <p className="text-xs text-[#25D366] font-semibold">{t.brand.splashTagline}</p>
              </div>
            </div>

            <h2 className="mt-7 text-2xl md:text-3xl font-semibold leading-snug text-white">
              {t.auth.heroTitle}
            </h2>
            <p className="mt-3 text-sm text-emerald-100/80 leading-relaxed">{t.auth.heroDesc}</p>
          </div>

          <div className="rounded-xl p-4 border border-[#25D366]/25 bg-white/5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#25D366]">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{t.brand.privacyNotice}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-100/80">
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

          <div className="text-xs text-emerald-100/70 flex items-center justify-between pt-2 border-t border-white/10">
            <span>{t.auth.bilingualLabel}</span>
            <span className="text-[#25D366] font-medium">{t.brand.footerCopyright}</span>
          </div>
        </div>

        {/* Auth / Verification Form Panel */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-white dark:bg-[#0d2218]">
          {sessionRevoked && (
            <div className="max-w-md mx-auto w-full mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200">
              {t.privacy.sessionRevokedNotice}
            </div>
          )}

          {firebaseUser && !isVerified ? (
            <div className="max-w-md mx-auto w-full space-y-5">
              <div className="w-12 h-12 rounded-xl bg-[#0a2e1f] text-[#25D366] flex items-center justify-center">
                <MailCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-[#0a2e1f] dark:text-white">
                  {t.auth.verifyTitle}
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-emerald-100/75 leading-relaxed">
                  {t.auth.verifyDescPrefix}{' '}
                  <span className="font-semibold text-[#0a2e1f] dark:text-[#25D366]">
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
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-[#0a2e1f] dark:text-emerald-200">
                  {info}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCheckVerification}
                  className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-[#041f14] font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                  {t.auth.iveVerified}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResend}
                  className="w-full h-11 rounded-xl bg-[#0a2e1f] hover:bg-[#12442f] text-white font-medium text-sm transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {t.auth.resendEmail}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void logout()}
                  className="w-full h-10 rounded-xl border border-[#0a2e1f]/15 dark:border-white/15 text-xs font-medium text-[#0a2e1f] dark:text-emerald-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {t.auth.signOutOrSwitch}
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto w-full">
              <div className="flex items-center gap-1 p-1 bg-[#eef5f0] dark:bg-[#071911] rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                    setInfo(null);
                  }}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                    mode === 'signin'
                      ? 'bg-[#0a2e1f] text-white shadow-sm'
                      : 'text-[#0a2e1f]/75 dark:text-emerald-100/70 hover:text-[#0a2e1f] dark:hover:text-white'
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
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-[#0a2e1f] text-white shadow-sm'
                      : 'text-[#0a2e1f]/75 dark:text-emerald-100/70 hover:text-[#0a2e1f] dark:hover:text-white'
                  }`}
                >
                  {t.auth.createAccount}
                </button>
              </div>

              <h3 className="text-2xl font-bold text-[#0a2e1f] dark:text-white">
                {mode === 'signin' ? t.auth.welcomeBack : t.auth.joinDank}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-emerald-100/75">
                {mode === 'signin' ? t.auth.signInDesc : t.auth.signUpDesc}
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-200 space-y-2">
                  <p>{error}</p>
                  {needsProviderEnable && (
                    <a
                      href="https://console.firebase.google.com/project/gen-lang-client-0428654102/authentication/providers"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold underline text-[#0a2e1f] dark:text-[#25D366]"
                    >
                      {t.auth.openFirebaseConsole}
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </a>
                  )}
                </div>
              )}

              {info && (
                <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-[#0a2e1f] dark:text-emerald-200">
                  {info}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {mode === 'signup' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#0a2e1f] dark:text-emerald-100 mb-1">
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
                        className="w-full h-11 px-3.5 rounded-xl bg-[#f7faf8] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#0a2e1f] dark:text-emerald-100 mb-1">
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
                        className="w-full h-11 px-3.5 rounded-xl bg-[#f7faf8] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#0a2e1f] dark:text-emerald-100 mb-1">
                    {t.auth.emailAddress}
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#f7faf8] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#0a2e1f] dark:text-emerald-100 mb-1">
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
                      className="w-full h-11 ps-3.5 pe-11 rounded-xl bg-[#f7faf8] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                      className="absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-500 dark:text-emerald-100/70 hover:text-[#0a2e1f] dark:hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-[#0a2e1f] dark:text-emerald-100 mb-1">
                      {t.auth.inviteCodeOptional}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={16}
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="DANK-XXXX"
                      className="w-full h-11 px-3.5 rounded-xl bg-[#f7faf8] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-[#041f14] font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {busy
                    ? t.common.pleaseWait
                    : mode === 'signin'
                    ? t.auth.signInButton
                    : t.auth.createAccount}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#0a2e1f]/10 dark:bg-white/10" />
                <span className="text-xs text-slate-500 dark:text-emerald-100/60">{t.common.or}</span>
                <div className="h-px flex-1 bg-[#0a2e1f]/10 dark:bg-white/10" />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleGoogle}
                className="w-full h-11 rounded-xl bg-[#0a2e1f] hover:bg-[#12442f] text-white font-medium text-sm flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#25D366]" />
                {t.auth.continueWithGoogle}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
