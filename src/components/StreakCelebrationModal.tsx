import React, { useEffect } from 'react';
import { Flame, Crown, Send, X, Zap } from 'lucide-react';
import type { StreakMilestone } from '../types/era';
import { eraAudio } from '../utils/eraAudio';

interface StreakCelebrationModalProps {
  milestone: StreakMilestone;
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
    eraAudio.playArcadeFanfare(milestone >= 50);
  }, [milestone]);

  const is14 = milestone === 14;
  const is30 = milestone === 30;
  const is50 = milestone === 50;
  const is100 = milestone === 100;
  const hasNeonBurst = is30 || is50 || is100;

  const badgeLabel = is100
    ? '★ أسطورة إيرا الذهبية ★'
    : is50
    ? '★ إنجاز الـ 50 يوماً الأسطوري ★'
    : is30
    ? '★ احتفال النيون الأسطوري ★'
    : is14
    ? '★ ثنائي السلسلة المتواصل ★'
    : '★ إنجاز السلسلة الأسبوعي ★';

  const heading = is100
    ? 'سلسلة 100 يوم ذهبي!'
    : is50
    ? 'سلسلة 50 يوم خارق!'
    : is30
    ? 'سلسلة 30 يوم إيرا!'
    : is14
    ? 'سلسلة 14 يوماً متواصلة!'
    : 'سلسلة 7 أيام متواصلة!';

  const description = is100
    ? 'إنجاز تاريخي! تحول الشات إلى الثيم الذهبي الأسطوري لمدة 24 ساعة، وحصلتما على الستيكر الذهبي الملكي.'
    : is50
    ? 'نصف المئوية! 50 يوماً من التواصل المتواصل بدون انقطاع مع ستيكر النيون الخاص بكما.'
    : is30
    ? 'أداء خارق! نورت الشاشة بالنيون وفتحتم ستيكر "30 يوم إيرا" الحصري باسميكما فقط.'
    : is14
    ? 'أسبوعان كاملان من التواصل اليومي! أصبحتما ثنائياً لا يُقهر في إيرا.'
    : 'بداية بطل! أكملتما أول أسبوع متواصل بنجاح بدون انقطاع.';

  const cardTheme = is100
    ? 'bg-gradient-to-b from-amber-950 via-[#0b0b18] to-amber-950 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.5)]'
    : is50
    ? 'bg-gradient-to-b from-purple-950 via-[#0b0b18] to-cyan-950 border-purple-400 shadow-[0_0_40px_rgba(168,85,247,0.55)]'
    : is30
    ? 'bg-gradient-to-b from-pink-950 via-[#0b0b18] to-purple-950 border-pink-500 shadow-[0_0_40px_rgba(236,72,153,0.5)]'
    : is14
    ? 'bg-gradient-to-b from-cyan-950 via-[#0b0b18] to-[#14122b] border-cyan-400 shadow-[0_0_32px_rgba(34,211,238,0.4)]'
    : 'bg-gradient-to-b from-orange-950 via-[#0b0b18] to-[#14122b] border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.4)]';

  const pillTheme = is100
    ? 'bg-amber-500/25 text-amber-300'
    : is50
    ? 'bg-purple-500/25 text-purple-300'
    : is30
    ? 'bg-pink-500/25 text-pink-300'
    : is14
    ? 'bg-cyan-500/25 text-cyan-300'
    : 'bg-orange-500/25 text-orange-300';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      {/* Neon Full-Screen Screen Burst Effect for 30, 50, and 100 days */}
      {hasNeonBurst && <div className="fixed inset-0 era-neon-screen-burst" />}

      <div
        className={`w-full max-w-sm rounded-3xl p-6 text-center text-white relative overflow-hidden shadow-2xl border ${cardTheme}`}
      >
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
          ) : is50 ? (
            <Zap className="w-9 h-9 text-purple-400 fill-current animate-bounce" />
          ) : is30 ? (
            <span className="text-3xl animate-pulse">🎮</span>
          ) : is14 ? (
            <span className="text-3xl animate-bounce">⚡</span>
          ) : (
            <Flame className="w-9 h-9 text-orange-400 fill-current animate-bounce" />
          )}
        </div>

        <div className="space-y-1">
          <span
            className={`inline-block px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-widest ${pillTheme}`}
          >
            {badgeLabel}
          </span>

          <h2 className="text-2xl font-black pt-1">{heading}</h2>

          <p className="text-xs text-[var(--era-muted)] leading-relaxed pt-1">{description}</p>
        </div>

        {/* Exclusive Sticker Preview for 30, 50, and 100 Days */}
        {hasNeonBurst && stickerUrl && (
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
          {hasNeonBurst && stickerUrl && onSendSticker && (
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
            className="w-full h-10 rounded-xl bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] border border-[var(--era-border)] text-[var(--era-text)] font-semibold text-xs transition-colors cursor-pointer"
          >
            استمرار المحادثة
          </button>
        </div>
      </div>
    </div>
  );
};
