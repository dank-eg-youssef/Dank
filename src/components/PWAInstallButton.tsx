import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { t } = useLanguage();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title={t.pwa.installApp}
        aria-label={t.pwa.installApp}
        className={
          variant === 'card'
            ? 'w-full h-10 px-4 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer'
            : 'h-8 px-2.5 rounded-lg bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0'
        }
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{t.pwa.installApp}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title={t.pwa.installOnIos}
          aria-label={t.pwa.installOnIos}
          className={
            variant === 'card'
              ? 'w-full h-10 px-4 rounded-xl bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-accent)] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer'
              : 'w-9 h-9 rounded-xl hover:bg-[var(--era-hover)] text-[var(--era-accent)] flex items-center justify-center transition-colors cursor-pointer shrink-0'
          }
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          {variant === 'card' && <span>{t.pwa.installOnIos}</span>}
        </button>

        {showIOSGuide && (
          <div
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-[var(--era-text)]">
                  {t.pwa.iosTitle}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label={t.common.close}
                  className="w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-xs text-[var(--era-muted)] leading-relaxed list-decimal list-inside">
                <li>{t.pwa.iosStep1}</li>
                <li>{t.pwa.iosStep2}</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full h-10 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-semibold cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
