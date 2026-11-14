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
    <div className="min-h-screen w-full bg-[#0E1621] flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
      <div className="absolute -top-28 -end-28 w-80 h-80 rounded-full bg-[#2AABEE]/14 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-28 -start-28 w-80 h-80 rounded-full bg-[#2AABEE]/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="w-24 h-24 rounded-3xl bg-[#17212B] border border-[#2AABEE]/35 shadow-2xl flex items-center justify-center mb-5">
          <DankLogo size="lg" />
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-white">DANK</h1>
        <p className="mt-1.5 text-sm font-semibold text-[#2AABEE] tracking-wide">
          {t.brand.splashTagline}
        </p>

        {errorMessage ? (
          <div className="mt-7 w-full max-w-xs rounded-2xl bg-[#17212B] border border-white/10 p-4 text-center space-y-3 shadow-xl">
            <p className="text-xs font-medium text-red-300 leading-relaxed break-words">
              {errorMessage}
            </p>
            <div className="flex flex-col gap-2">
              {onRetry && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={onRetry}
                  className="w-full h-10 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] disabled:opacity-60 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  {retrying ? t.errors.retrying : t.errors.retryConnection}
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full h-9 rounded-xl bg-white/10 hover:bg-white/15 text-[#C5D3E0] text-xs font-semibold cursor-pointer transition-colors"
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
              className="w-8 h-8 rounded-full border-3 border-white/15 border-t-[#2AABEE] animate-spin"
            />
            <p className="text-xs font-medium text-[#8C9FB1] text-center max-w-xs">
              {message || t.errors.connectingWorkspace}
            </p>
          </div>
        )}
      </div>

      <p className="absolute bottom-6 text-[11px] text-[#6C7E91]">{t.brand.footerCopyright}</p>
    </div>
  );
};
