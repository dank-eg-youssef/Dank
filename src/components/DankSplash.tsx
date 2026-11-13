import React from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import brandEmblem from '../assets/images/dank_brand_emblem_1794576170469.jpg';
import { useLanguage } from '../contexts/LanguageContext';

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
    <div className="min-h-screen w-full bg-[#0A1931] flex flex-col items-center justify-center p-6 select-none">
      <div className="flex flex-col items-center gap-5 max-w-sm w-full text-center">
        <div className="relative">
          <div className="absolute -inset-2 rounded-3xl bg-[#38BDF8]/20 blur-md" />
          <img
            src={brandEmblem}
            alt={t.appName}
            className="relative w-20 h-20 rounded-2xl object-cover ring-2 ring-[#38BDF8]/40 shadow-2xl"
          />
        </div>

        <h1 className="text-3xl font-bold tracking-wider text-white">{t.appName}</h1>

        {!errorMessage ? (
          <div
            role="status"
            aria-label={t.common.loading}
            className="w-9 h-9 rounded-full border-[3px] border-[#38BDF8]/25 border-t-[#38BDF8] animate-spin"
          />
        ) : (
          <div className="space-y-4 w-full">
            <p className="text-xs text-slate-300 leading-relaxed">{errorMessage}</p>
            <div className="flex items-center justify-center gap-2.5 flex-wrap">
              {onRetry && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={onRetry}
                  className="h-10 px-4 rounded-xl bg-[#38BDF8] hover:bg-[#0EA5E9] disabled:opacity-60 text-[#0A1931] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                  {retrying ? t.errors.retrying : t.errors.retryConnection}
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="h-10 px-4 rounded-xl border border-white/20 hover:bg-white/10 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-[#38BDF8]" />
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
