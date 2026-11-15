import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { DankLogo } from './DankLogo';

interface DankSplashProps {
  message?: string;
  errorMessage?: string | null;
  retrying?: boolean;
  onRetry?: () => void;
  onLogout?: () => void;
}

export const DankSplash: React.FC<DankSplashProps> = ({
  message,
  errorMessage,
  retrying = false,
  onRetry,
  onLogout,
}) => {
  const { t } = useLanguage();

  return (
    <div className="min-h-[100dvh] w-full bg-[var(--dank-canvas)] text-[var(--dank-text)] flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
      <div
        className="absolute -top-28 -end-28 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none"
        style={{ backgroundColor: 'var(--dank-accent)' }}
      />
      <div
        className="absolute -bottom-28 -start-28 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ backgroundColor: 'var(--dank-accent)' }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <div className="w-24 h-24 rounded-3xl bg-[var(--dank-surface)] border border-[var(--dank-accent-border)] shadow-2xl flex items-center justify-center mb-5">
          <DankLogo size="lg" />
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-[var(--dank-text)]">DANK</h1>
        <p className="mt-1.5 text-sm font-semibold text-[var(--dank-accent)] tracking-wide">
          {t.brand.splashTagline}
        </p>

        {errorMessage ? (
          <div className="mt-7 w-full max-w-xs rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] p-4 text-center space-y-3 shadow-xl">
            <p className="text-xs font-medium text-red-500 leading-relaxed break-words">
              {errorMessage}
            </p>
            <div className="flex flex-col gap-2">
              {onRetry && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={onRetry}
                  className="w-full h-11 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] disabled:opacity-60 text-[var(--dank-accent-fg)] text-xs font-extrabold cursor-pointer transition-colors"
                >
                  {retrying ? t.errors.retrying : t.errors.retryConnection}
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full h-10 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs font-semibold cursor-pointer transition-colors"
                >
                  {t.auth.signOutOrSwitch}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-7 flex flex-col items-center gap-3">
            <div
              role="status"
              aria-label={t.common.loading}
              className="w-8 h-8 rounded-full border-3 border-[var(--dank-border)] border-t-[var(--dank-accent)] animate-spin"
            />
            <p className="text-xs font-medium text-[var(--dank-muted)] text-center max-w-xs">
              {message || t.errors.connectingWorkspace}
            </p>
          </div>
        )}
      </div>

      <p className="absolute bottom-6 text-[11px] text-[var(--dank-muted)]">
        {t.brand.footerCopyright}
      </p>
    </div>
  );
};
