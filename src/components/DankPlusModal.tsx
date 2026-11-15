import React, { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { toggleDankPlus } from '../services/chatService';
import type { UserPublic } from '../types/dank';

interface DankPlusModalProps {
  currentUser: UserPublic;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const DankPlusModal: React.FC<DankPlusModalProps> = ({
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
      await toggleDankPlus(currentUser.uid, !isPlus);
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
      <div className="w-full max-w-md rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl overflow-hidden">
        <div className="p-5 bg-[var(--dank-canvas)] text-[var(--dank-text)] border-b border-[var(--dank-border)] relative">
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="absolute top-3 end-3 w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-[var(--dank-accent-soft)] border border-[var(--dank-accent-border)] text-[var(--dank-accent)] flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-extrabold">{t.plus.title}</h3>
          <p className="mt-1 text-xs text-[var(--dank-muted)] leading-relaxed">{t.plus.subtitle}</p>
        </div>

        <div className="p-5 space-y-4">
          <ul className="space-y-2.5 text-sm text-[var(--dank-text)]">
            {[t.plus.f1, t.plus.f2, t.plus.f3, t.plus.f4].map((feat) => (
              <li key={feat} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--dank-accent-soft)] text-[var(--dank-accent)] flex items-center justify-center shrink-0 mt-0.5">
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
                ? 'bg-[var(--dank-elevated)] text-[var(--dank-text)] hover:opacity-90'
                : 'bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {isPlus ? t.plus.activeBadge : t.plus.activateFree}
          </button>

          <p className="text-center text-[10px] text-[var(--dank-muted)]">
            {t.brand.footerCopyright}
          </p>
        </div>
      </div>
    </div>
  );
};
