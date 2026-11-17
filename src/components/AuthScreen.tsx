import React, { useState } from 'react';
import { Eye, EyeOff, Globe, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { DankLogo } from './DankLogo';

interface AuthScreenProps {
  allowSignups?: boolean;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ allowSignups = true }) => {
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

  const handleAuthError = (err: unknown) => {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : t.errors.unexpected;

    if (code === 'auth/operation-not-allowed') {
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

    if (!email.trim() || !password) {
      setError(t.auth.errMissingCreds);
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError(t.auth.errMissingProfileFields);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        if (!allowSignups) {
          setError(t.admin.signupsDisabledNotice);
          setBusy(false);
          return;
        }
        const cleanUsername = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || email.split('@')[0];
        await signUpWithEmail(email, password, name, cleanUsername);
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
    <div className="dank-auth-scroll w-full bg-[var(--dank-canvas)] text-[var(--dank-text)]">
      <div className="min-h-full w-full flex flex-col items-center justify-between px-4 py-5 sm:py-8">
        {/* Top Bar Controls */}
        <div
          dir="ltr"
          className="w-full max-w-md flex items-center justify-between gap-3 mb-5 shrink-0"
        >
          <div className="flex items-center gap-2.5">
            <DankLogo size="sm" />
            <h1 className="font-extrabold text-lg tracking-wider text-[var(--dank-accent)]">
              Dank Chat
            </h1>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[var(--dank-surface)] text-[var(--dank-text)] border border-[var(--dank-border)]">
            <Globe className="w-3.5 h-3.5 text-[var(--dank-accent)] mx-1.5" />
            <button
              type="button"
              onClick={() => void setLanguage('en')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                language === 'en'
                  ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                  : 'text-[var(--dank-muted)] hover:text-[var(--dank-text)]'
              }`}
            >
              {t.common.englishShort}
            </button>
            <button
              type="button"
              onClick={() => void setLanguage('ar')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                language === 'ar'
                  ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                  : 'text-[var(--dank-muted)] hover:text-[var(--dank-text)]'
              }`}
            >
              {t.common.arabicShort}
            </button>
          </div>
        </div>

        {/* Centered Auth Card */}
        <div className="w-full max-w-md bg-[var(--dank-surface)] border border-[var(--dank-border)] rounded-3xl p-6 sm:p-8 shadow-2xl my-auto">
          {firebaseUser && !isVerified ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-[var(--dank-accent-soft)] text-[var(--dank-accent)] flex items-center justify-center mx-auto mb-2">
                <MailCheck className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-[var(--dank-text)]">{t.auth.verifyTitle}</h2>
              <p className="text-sm text-[var(--dank-muted)] leading-relaxed max-w-xs mx-auto">
                {t.auth.verifyDescPrefix}{' '}
                <strong className="text-[var(--dank-text)]">{firebaseUser.email}</strong>{' '}
                {t.auth.verifyDescSuffix}
              </p>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-medium">
                  {error}
                </div>
              )}
              {info && (
                <div className="p-3 rounded-xl bg-[var(--dank-accent-soft)] border border-[var(--dank-accent-border)] text-[var(--dank-accent)] text-xs font-medium">
                  {info}
                </div>
              )}

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCheckVerification}
                  className="w-full h-12 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] font-extrabold text-sm flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {busy && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {t.auth.iveVerified}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResend}
                  className="w-full h-11 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] font-semibold text-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {t.auth.resendEmail}
                </button>

                <button
                  type="button"
                  onClick={() => void logout()}
                  className="w-full h-10 rounded-full text-[var(--dank-muted)] hover:text-[var(--dank-text)] text-xs font-medium cursor-pointer transition-colors"
                >
                  {t.auth.signOutOrSwitch}
                </button>
              </div>
            </div>
          ) : sessionRevoked ? (
            <div className="text-center py-6 space-y-4">
              <h2 className="text-xl font-bold text-red-500">{t.privacy.twoStepChallengeTitle}</h2>
              <p className="text-xs text-[var(--dank-muted)]">{t.privacy.sessionRevokedNotice}</p>
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full h-12 rounded-full bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] font-extrabold text-sm cursor-pointer"
              >
                {t.auth.signIn}
              </button>
            </div>
          ) : (
            <div>
              <div className="text-center mb-6">
                <div className="flex justify-center mb-3">
                  <DankLogo size="lg" />
                </div>
                <h2 className="text-2xl font-extrabold text-[var(--dank-text)] tracking-tight">
                  {mode === 'signin' ? t.auth.welcomeBack : t.auth.joinDank}
                </h2>
                <p className="text-xs text-[var(--dank-muted)] mt-1">
                  {mode === 'signin' ? t.auth.signInDesc : t.auth.signUpDesc}
                </p>

                {/* Mode switch tabs */}
                <div className="flex items-center justify-center gap-1.5 mt-4 bg-[var(--dank-canvas)] p-1 rounded-full border border-[var(--dank-border)] w-fit mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                      setInfo(null);
                    }}
                    className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      mode === 'signin'
                        ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] shadow-md'
                        : 'text-[var(--dank-muted)] hover:text-[var(--dank-text)]'
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
                    className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      mode === 'signup'
                        ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] shadow-md'
                        : 'text-[var(--dank-muted)] hover:text-[var(--dank-text)]'
                    }`}
                  >
                    {t.auth.createAccount}
                  </button>
                </div>
              </div>

              {mode === 'signup' && !allowSignups && (
                <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
                  {t.admin.signupsDisabledNotice}
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-medium">
                  {error}
                </div>
              )}
              {info && (
                <div className="mb-4 p-3 rounded-2xl bg-[var(--dank-accent-soft)] border border-[var(--dank-accent-border)] text-[var(--dank-accent)] text-xs font-medium">
                  {info}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--dank-muted)] mb-1">
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
                      className="w-full h-11 px-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[var(--dank-muted)] mb-1">
                    {t.auth.emailAddress}
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder}
                    className="w-full h-11 px-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--dank-muted)] mb-1">
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
                      className="w-full h-11 ps-4 pe-11 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                      className="absolute end-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[var(--dank-muted)] hover:text-[var(--dank-text)] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || (mode === 'signup' && !allowSignups)}
                  className="w-full h-12 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] font-extrabold text-sm flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg mt-2"
                >
                  {busy && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {busy
                    ? t.common.pleaseWait
                    : mode === 'signin'
                    ? t.auth.signInButton
                    : t.auth.createAccount}
                </button>
              </form>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--dank-border)]" />
                <span className="text-xs text-[var(--dank-muted)]">{t.common.or}</span>
                <div className="h-px flex-1 bg-[var(--dank-border)]" />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleGoogle}
                className="w-full h-12 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50 cursor-pointer border border-[var(--dank-border)]"
              >
                <ShieldCheck className="w-4 h-4 text-[var(--dank-accent)]" />
                {t.auth.continueWithGoogle}
              </button>
            </div>
          )}
        </div>

        <p className="mt-5 text-[11px] text-[var(--dank-muted)] text-center shrink-0">
          {t.brand.footerCopyright}
        </p>
      </div>
    </div>
  );
};
