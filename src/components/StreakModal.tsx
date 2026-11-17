import React, { useState, useEffect } from 'react';
import {
  Flame,
  Snowflake,
  Coins,
  Plus,
  Clock,
  Sparkles,
  Award,
  Crown,
  X,
  Check,
} from 'lucide-react';
import type { ChatStreak, UserPublic, UserStreakInventory } from '../types/dank';
import { buyExtraFreeze, ensureUserStreakInventory } from '../services/streakService';
import { dankAudio } from '../utils/dankAudio';

interface StreakModalProps {
  streak: ChatStreak | null;
  currentUser: UserPublic;
  peerUser: UserPublic;
  onClose: () => void;
  onNotify: (msg: string) => void;
  onInventoryUpdate?: (inv: UserStreakInventory) => void;
}

export const StreakModal: React.FC<StreakModalProps> = ({
  streak,
  currentUser,
  peerUser,
  onClose,
  onNotify,
  onInventoryUpdate,
}) => {
  const [inventory, setInventory] = useState<UserStreakInventory | null>(null);
  const [buying, setBuying] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');

  useEffect(() => {
    void ensureUserStreakInventory(currentUser.uid).then((inv) => {
      setInventory(inv);
      onInventoryUpdate?.(inv);
    });
  }, [currentUser.uid, onInventoryUpdate]);

  // Calculate live countdown timer
  useEffect(() => {
    if (!streak?.expiresAt) {
      setTimeLeftStr('24:00:00');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const expires = streak.expiresAt ? streak.expiresAt.toMillis() : now + 24 * 3600 * 1000;
      const diff = expires - now;

      if (diff <= 0) {
        setTimeLeftStr('منتهية الصلاحية');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeftStr(
        `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
          .toString()
          .padStart(2, '0')}`
      );
    };

    updateTimer();
    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, [streak?.expiresAt]);

  const streakDays = streak?.streakCount || 0;
  const isGolden = Boolean(streak?.isGoldenTheme || streakDays >= 100);

  const handleBuyFreeze = async () => {
    if (buying) return;
    setBuying(true);
    try {
      const updated = await buyExtraFreeze(currentUser.uid);
      setInventory(updated);
      onInventoryUpdate?.(updated);
      dankAudio.playArcadeStickerBleep();
      onNotify('تم شراء تلجية إضافية بنجاح! ❄️ (خصم 50 نقطة دانك)');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر شراء التلجية');
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-[var(--dank-text)] animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-[var(--dank-canvas)] px-5 py-4 border-b border-[var(--dank-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${isGolden ? 'bg-amber-500/20 text-amber-400' : 'bg-orange-500/20 text-orange-400'}`}>
              <Flame className="w-5 h-5 fill-current animate-pulse" />
            </span>
            <div>
              <h3 className="text-base font-extrabold">نظام السلسلة (Dank Streak)</h3>
              <p className="text-[11px] text-[var(--dank-muted)]">مع {peerUser.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] text-[var(--dank-muted)] hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Main Streak Counter Card */}
          <div className={`p-5 rounded-2xl text-center relative overflow-hidden border ${
            isGolden
              ? 'bg-gradient-to-b from-amber-950/40 via-[var(--dank-canvas)] to-amber-950/30 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
              : 'bg-gradient-to-b from-orange-950/40 via-[var(--dank-canvas)] to-purple-950/20 border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.15)]'
          }`}>
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-black/40 border border-white/10 mb-2">
              <span className="text-4xl">{isGolden ? '👑' : '🔥'}</span>
            </div>
            <h2 className="text-3xl font-black tracking-wider text-white">
              {streakDays} <span className="text-lg font-bold text-orange-400">{streakDays === 1 ? 'يوم' : 'أيام'}</span>
            </h2>
            <p className="text-xs text-[var(--dank-muted)] mt-1">
              {streakDays > 0 ? 'السلسلة متصلة بنجاح بينكما!' : 'ابدأ السلسلة الآن بإرسال رسالة اليوم!'}
            </p>

            {/* Countdown Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 border border-[var(--dank-border)] text-xs font-mono font-bold text-orange-300 mt-3 tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              <span>متبقي: {timeLeftStr}</span>
            </div>
          </div>

          {/* 1. Freeze Section (التجميد) */}
          <div className="p-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Snowflake className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-[var(--dank-text)]">
                  التجميد التلقائي (Streak Freeze)
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-extrabold flex items-center gap-1">
                <Snowflake className="w-3.5 h-3.5" />
                <span>{inventory?.freezesCount ?? 1} تلجية</span>
              </span>
            </div>

            <p className="text-[11px] text-[var(--dank-muted)] leading-relaxed">
              تحصل على <strong className="text-cyan-300">1 تلجية مجانية كل أسبوع</strong>. إذا نسيت إرسال رسالة في يوم، تعمل التلجية تلقائياً لتحمي السلسلة وتمنع انقطاعها! ❄️
            </p>

            {/* Dank Points & Buy Extra Freeze */}
            <div className="pt-2 border-t border-[var(--dank-border)] flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="text-[var(--dank-muted)]">رصيدك:</span>
                <span className="font-extrabold text-amber-300 tabular-nums">
                  {inventory?.dankPoints ?? 100} نقطة
                </span>
              </div>

              <button
                type="button"
                disabled={buying || (inventory?.dankPoints ?? 100) < 50}
                onClick={() => void handleBuyFreeze()}
                className="h-8 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>شراء تلجية (50 نقطة)</span>
              </button>
            </div>
          </div>

          {/* 2. Celebration Milestones (الاحتفالات) */}
          <div className="p-4 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-2.5">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[var(--dank-accent)]" />
              <h4 className="text-xs font-bold text-[var(--dank-text)]">
                مكافآت واحتفالات السلسلة
              </h4>
            </div>

            <div className="space-y-2 text-xs">
              <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                streakDays >= 7
                  ? 'bg-orange-500/10 border-orange-500/40 text-orange-200'
                  : 'bg-[var(--dank-surface)] border-[var(--dank-border)] text-[var(--dank-muted)]'
              }`}>
                <div className="flex items-center gap-2">
                  <span>🔥</span>
                  <div>
                    <p className="font-bold">7 أيام متواصلة</p>
                    <p className="text-[10px] opacity-80">احتفال أركيد خاص في الشات</p>
                  </div>
                </div>
                {streakDays >= 7 ? (
                  <Check className="w-4 h-4 text-orange-400" />
                ) : (
                  <span className="text-[10px] font-mono">قيد التقدم</span>
                )}
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                streakDays >= 30
                  ? 'bg-pink-500/10 border-pink-500/40 text-pink-200'
                  : 'bg-[var(--dank-surface)] border-[var(--dank-border)] text-[var(--dank-muted)]'
              }`}>
                <div className="flex items-center gap-2">
                  <span>🎮</span>
                  <div>
                    <p className="font-bold">30 يوم دانك</p>
                    <p className="text-[10px] opacity-80">نور نيون للشاشة + ستيكر حصري باسميكما</p>
                  </div>
                </div>
                {streakDays >= 30 ? (
                  <Check className="w-4 h-4 text-pink-400" />
                ) : (
                  <span className="text-[10px] font-mono">قيد التقدم</span>
                )}
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                streakDays >= 100
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                  : 'bg-[var(--dank-surface)] border-[var(--dank-border)] text-[var(--dank-muted)]'
              }`}>
                <div className="flex items-center gap-2">
                  <span>👑</span>
                  <div>
                    <p className="font-bold">100 يوم ذهبي</p>
                    <p className="text-[10px] opacity-80">ستيكر دهبي + ثيم أركيد ذهبي للشات بالكامل</p>
                  </div>
                </div>
                {streakDays >= 100 ? (
                  <Check className="w-4 h-4 text-amber-400" />
                ) : (
                  <span className="text-[10px] font-mono">قيد التقدم</span>
                )}
              </div>
            </div>
          </div>

          {/* 3. Rescue Info Notice (الإنقاذ) */}
          <div className="p-3 rounded-xl bg-orange-950/25 border border-orange-500/30 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-orange-200 leading-relaxed">
              <strong>نظام الإنقاذ:</strong> إذا تبقى ساعة واحدة فقط على انقطاع السلسلة، سنرسل لك تنبيهاً سريعاً مع زر "ابعت دلوقتي" لتنقذ السلسلة فوراً!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--dank-canvas)] border-t border-[var(--dank-border)] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-10 rounded-xl bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            حسناً، فهمت
          </button>
        </div>
      </div>
    </div>
  );
};
