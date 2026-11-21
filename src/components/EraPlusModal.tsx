import React, { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { toggleEraPlus } from '../services/chatService';
import type { UserPublic } from '../types/era';

interface EraPlusModalProps {
  currentUser: UserPublic;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const EraPlusModal: React.FC<EraPlusModalProps> = ({
  currentUser,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const isPlus = Boolean(currentUser.isPlus);

  const handleToggle = async () => {
    setBusy(true);
    try {
      await toggleEraPlus(currentUser.uid, !isPlus);
      if (!isPlus) {
        onNotify(t.plus.activatedToast);
      }
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl overflow-hidden">
        <div className="p-5 bg-[var(--era-canvas)] text-[var(--era-text)] border-b border-[var(--era-border)] relative">
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="absolute top-3 end-3 w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-[var(--era-accent-soft)] border border-[var(--era-accent-border)] text-[var(--era-accent)] flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-extrabold">{t.plus.title}</h3>
          <p className="mt-1 text-xs text-[var(--era-muted)] leading-relaxed">{t.plus.subtitle}</p>
        </div>

        <div className="p-5 space-y-4">
          <ul className="space-y-2.5 text-sm text-[var(--era-text)]">
            {[t.plus.f1, t.plus.f2, t.plus.f3, t.plus.f4].map((feat) => (
              <li key={feat} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                </span>
                <span className="text-xs leading-relaxed">{feat}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleToggle()}
            className={`w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              isPlus
                ? 'bg-[var(--era-elevated)] text-[var(--era-text)] hover:opacity-90'
                : 'bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {isPlus ? t.plus.activeBadge : t.plus.activateFree}
          </button>

          <p className="text-center text-[10px] text-[var(--era-muted)]">
            {t.brand.footerCopyright}
          </p>
        </div>
      </div>
    </div>
  );
};
