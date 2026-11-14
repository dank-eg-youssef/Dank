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
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0d2218] border border-[#0a2e1f]/15 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="p-5 bg-gradient-to-br from-[#0a2e1f] via-[#0f412c] to-[#082418] text-white relative">
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="absolute top-3 end-3 w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-[#25D366]/20 border border-[#25D366]/40 text-[#25D366] flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-extrabold">{t.plus.title}</h3>
          <p className="mt-1 text-xs text-emerald-100/80 leading-relaxed">{t.plus.subtitle}</p>
        </div>

        <div className="p-5 space-y-4">
          <ul className="space-y-2.5 text-sm text-[#0a2e1f] dark:text-emerald-50">
            {[t.plus.f1, t.plus.f2, t.plus.f3, t.plus.f4].map((feat) => (
              <li key={feat} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#25D366]/20 text-[#128C48] dark:text-[#25D366] flex items-center justify-center shrink-0 mt-0.5">
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
                ? 'bg-[#eef5f0] dark:bg-white/10 text-[#0a2e1f] dark:text-white hover:opacity-90'
                : 'bg-[#25D366] hover:bg-[#1ebe5d] text-[#041f14]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {isPlus ? t.plus.activeBadge : t.plus.activateFree}
          </button>

          <p className="text-center text-[10px] text-slate-500 dark:text-emerald-100/50">
            {t.brand.footerCopyright}
          </p>
        </div>
      </div>
    </div>
  );
};
