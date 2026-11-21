import React, { useEffect, useState } from 'react';
import { ERA_LOGO_SRC } from './EraLogo';

interface EraSplashProps {
  canFinish?: boolean;
  onFinish: () => void;
}

const GREETINGS = [
  { text: 'مرحبًا', dir: 'rtl' as const, lang: 'ar' },
  { text: 'Hello', dir: 'ltr' as const, lang: 'en' },
  { text: 'Hallo', dir: 'ltr' as const, lang: 'de' },
  { text: 'Bonjour', dir: 'ltr' as const, lang: 'fr' },
  { text: 'Hola', dir: 'ltr' as const, lang: 'es' },
  { text: 'Ciao', dir: 'ltr' as const, lang: 'it' },
] as const;

const STEP_DURATION_MS = 450;
const FADE_OUT_DURATION_MS = 360;

export const EraSplash: React.FC<EraSplashProps> = ({
  canFinish = true,
  onFinish,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [sequenceComplete, setSequenceComplete] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const timers: number[] = [];

    for (let i = 1; i < GREETINGS.length; i += 1) {
      timers.push(
        window.setTimeout(() => {
          setActiveIndex(i);
        }, i * STEP_DURATION_MS)
      );
    }

    timers.push(
      window.setTimeout(() => {
        setSequenceComplete(true);
      }, GREETINGS.length * STEP_DURATION_MS)
    );

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!sequenceComplete || !canFinish) return;

    setIsFadingOut(true);
    const doneTimer = window.setTimeout(() => {
      onFinish();
    }, FADE_OUT_DURATION_MS);

    return () => {
      window.clearTimeout(doneTimer);
    };
  }, [sequenceComplete, canFinish, onFinish]);

  return (
    <div
      role="presentation"
      aria-label="Welcome"
      className={`fixed inset-0 z-[200] bg-[var(--era-canvas)] flex flex-col items-center justify-center p-6 select-none overflow-hidden transition-opacity duration-[360ms] ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="mb-4 rounded-2xl bg-black border border-[var(--era-border)] px-4 py-2 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
        <img
          src={ERA_LOGO_SRC}
          alt="Era"
          className="h-12 sm:h-14 w-auto object-contain"
          draggable={false}
        />
      </div>

      <div className="relative grid place-items-center w-full max-w-xl">
        {GREETINGS.map((item, idx) => {
          const isCurrent = idx === activeIndex;
          const isPast = idx < activeIndex;

          return (
            <span
              key={item.text}
              dir={item.dir}
              lang={item.lang}
              aria-hidden={!isCurrent}
              style={{ fontFamily: "'Cairo', 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif" }}
              className={`col-start-1 row-start-1 inline-block px-3 py-2 text-center font-extrabold tracking-tight leading-[1.3] text-[clamp(3rem,11vw,5rem)] era-hello-gradient transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform,filter] ${
                isCurrent && !isFadingOut
                  ? 'opacity-100 scale-100 translate-y-0 blur-0'
                  : isPast || isFadingOut
                    ? 'opacity-0 scale-[1.04] -translate-y-2 blur-[4px]'
                    : 'opacity-0 scale-[0.94] translate-y-2 blur-[4px]'
              }`}
            >
              {item.text}
            </span>
          );
        })}
      </div>

      <p
        dir="rtl"
        className="absolute bottom-[24px] inset-x-0 px-4 text-center text-[12px] font-normal text-[#A1A1AA] tracking-[0.01em] pointer-events-none"
      >
        © Era 2027 — جميع الحقوق محفوظة لـ Era
      </p>
    </div>
  );
};
