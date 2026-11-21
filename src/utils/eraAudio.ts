// Web Audio API Sound Effects for Era Brand
class EraAudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(val: boolean) {
    this.muted = val;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  // 1. Send Message: Crisp iPhone-like button click "tick"
  public playSendTick() {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.015);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.02);
    } catch {
      // ignore audio errors
    }
  }

  // 2. Receive Message: Soft, clean, elegant single-note chime "ding"
  public playReceiveDing() {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const freqs = [880, 1320, 2640];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, now);

        const vol = i === 0 ? 0.15 : i === 1 ? 0.08 : 0.03;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.6);
      });
    } catch {
      // ignore audio errors
    }
  }

  // 3. App Open: Distinct 2-second cinematic Netflix-style Era signature sound
  public playAppOpenCinematic() {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(65.41, now);
      sub.frequency.exponentialRampToValueAtTime(130.81, now + 1.8);
      subGain.gain.setValueAtTime(0.01, now);
      subGain.gain.linearRampToValueAtTime(0.22, now + 0.4);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 2.15);

      const chord = [261.63, 392.00, 523.25, 659.25];
      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now + 0.2);

        const g = 0.08 / (idx + 1);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.setValueAtTime(g, now + 0.25 + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + 0.2);
        osc.stop(now + 2.3);
      });
    } catch {
      // ignore audio errors
    }
  }

  // 4. Arcade Sticker Sound: Light retro bleep
  public playArcadeStickerBleep() {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.08);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // ignore audio errors
    }
  }

  // 5. Arcade Milestone Fanfare: Energetic retro celebration
  public playArcadeFanfare(golden = false) {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = golden ? [523.25, 659.25, 783.99, 1046.50, 1318.51] : [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = golden ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.setValueAtTime(0.12, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.4);
      });
    } catch {
      // ignore audio errors
    }
  }
}

export const eraAudio = new EraAudioEngine();

