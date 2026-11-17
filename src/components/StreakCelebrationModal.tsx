import React, { useEffect } from 'react';
import { Flame, Crown, Sparkles, Send, X } from 'lucide-react';
import { dankAudio } from '../utils/dankAudio';

interface StreakCelebrationModalProps {
  milestone: 7 | 30 | 100;
  user1Name: string;
  user2Name: string;
  stickerUrl?: string;
  onClose: () => void;
  onSendSticker?: (stickerUrl: string) => void;
}

export const StreakCelebrationModal: React.FC<StreakCelebrationModalProps> = ({
  milestone,
  user1Name,
  user2Name,
  stickerUrl,
  onClose,
  onSendSticker,
}) => {
  useEffect(() => {
    dankAudio.playArcadeFanfare(milestone === 100);
  }, [milestone]);

  const is7 = milestone === 7;
  const is30 = milestone === 30;
  const is100 = milestone === 100;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      {/* Neon Full-Screen Screen Burst Effect for 30 and 100 days */}
      {(is30 || is100) && (
        <div className="fixed inset-0 dank-neon-screen-burst" />
      )}

      <div className={`w-full max-w-sm rounded-3xl p-6 text-center text-white relative overflow-hidden shadow-2xl border ${
        is100
          ? 'bg-gradient-to-b from-amber-950 via-[#0b0b18] to-amber-950 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.5)]'
          : is30
          ? 'bg-gradient-to-b from-pink-950 via-[#0b0b18] to-purple-950 border-pink-500 shadow-[0_0_40px_rgba(236,72,153,0.5)]'
          : 'bg-gradient-to-b from-orange-950 via-[#0b0b18] to-[#14122b] border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.4)]'
      }`}>
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 end-4 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Milestone Top Badge */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-black/50 border border-white/20 shadow-lg mb-3">
          {is100 ? (
            <Crown className="w-9 h-9 text-amber-400 animate-bounce" />
          ) : is30 ? (
            <span className="text-3xl animate-pulse">🎮</span>
          ) : (
            <Flame className="w-9 h-9 text-orange-400 fill-current animate-bounce" />
          )}
        </div>

        <div className="space-y-1">
          <span className={`inline-block px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-widest ${
            is100
              ? 'bg-amber-500/25 text-amber-300'
              : is30
              ? 'bg-pink-500/25 text-pink-300'
              : 'bg-orange-500/25 text-orange-300'
          }`}>
            {is100 ? '★ أسطورة دانك الذهبية ★' : is30 ? '★ احتفال النيون الأسطوري ★' : '★ إنجاز السلسلة الأسبوعي ★'}
          </span>

          <h2 className="text-2xl font-black pt-1">
            {is100
              ? 'سلسلة 100 يوم ذهبي!'
              : is30
              ? 'سلسلة 30 يوم دانك!'
              : 'سلسلة 7 أيام متواصلة!'}
          </h2>

          <p className="text-xs text-[var(--dank-muted)] leading-relaxed pt-1">
            {is100
              ? 'إنجاز تاريخي! تحول الشات إلى الثيم الذهبي الأسطوري لمدة 24 ساعة، وحصلتما على الستيكر الذهبي الملكي.'
              : is30
              ? 'أداء خارق! نورت الشاشة بالنيون وفتحتم ستيكر "30 يوم دانك" الحصري باسميكما فقط.'
              : 'بداية بطل! أكملتما أول أسبوع متواصل بنجاح بدون انقطاع.'}
          </p>
        </div>

        {/* Exclusive Sticker Preview for 30 and 100 Days */}
        {(is30 || is100) && stickerUrl && (
          <div className="my-4 p-3 rounded-2xl bg-black/60 border border-white/10 flex flex-col items-center">
            <img
              src={stickerUrl}
              alt="Exclusive Sticker"
              className="w-36 h-36 object-contain drop-shadow-[0_0_15px_rgba(236,72,153,0.6)]"
            />
            <p className="text-[11px] font-bold text-pink-300 mt-1">
              ✨ ستيكر حصري لكما فقط ({user1Name} &amp; {user2Name})
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col gap-2">
          {(is30 || is100) && stickerUrl && onSendSticker && (
            <button
              type="button"
              onClick={() => {
                onSendSticker(stickerUrl);
                onClose();
              }}
              className="w-full h-10 rounded-xl bg-gradient-to-r from-pink-500 to-cyan-500 hover:from-pink-600 hover:to-cyan-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال الستيكر في الشات الآن</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full h-10 rounded-xl bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] border border-[var(--dank-border)] text-[var(--dank-text)] font-semibold text-xs transition-colors cursor-pointer"
          >
            استمرار المحادثة
          </button>
        </div>
      </div>
    </div>
  );
};
