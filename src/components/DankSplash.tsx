import React from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { DankLogo } from './DankLogo';

interface DankSplashProps {
  errorMessage?: string | null;
  retrying?: boolean;
  onRetry?: () => void;
  onLogout?: () => void;
}

export const DankSplash: React.FC<DankSplashProps> = ({
  errorMessage,
  retrying = false,
  onRetry,
  onLogout,
}) => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen w-full bg-[#0a2e1f] flex flex-col items-center justify-center p-6 select-none">
      <div className="flex flex-col items-center gap-4 max-w-sm w-full text-center">
        <div className="relative">
          <div className="absolute -inset-3 rounded-3xl bg-[#25D366]/20 blur-lg" />
          <DankLogo size={84} className="relative shadow-2xl" />
        </div>

        <div>
          <h1 className="text-3xl font-extrabold tracking-widest text-white">{t.appName}</h1>
          <p className="mt-1 text-xs font-medium text-[#25D366]">{t.brand.splashTagline}</p>
        </div>

        {!errorMessage ? (
          <div
            role="status"
            aria-label={t.common.loading}
            className="mt-2 w-9 h-9 rounded-full border-[3px] border-[#25D366]/25 border-t-[#25D366] animate-spin"
          />
        ) : (
          <div className="space-y-4 w-full mt-2">
            <p className="text-xs text-emerald-100/80 leading-relaxed">{errorMessage}</p>
            <div className="flex items-center justify-center gap-2.5 flex-wrap">
              {onRetry && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={onRetry}
                  className="h-11 px-4 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] disabled:opacity-60 text-[#041f14] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                  {retrying ? t.errors.retrying : t.errors.retryConnection}
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="h-11 px-4 rounded-xl border border-white/20 hover:bg-white/10 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-[#25D366]" />
                  {t.profile.logout}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
