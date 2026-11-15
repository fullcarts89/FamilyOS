import { Platform } from 'react-native';

/**
 * A soft two-note chime for milestones, off unless the person turns it on (/me/state `sound`).
 * Synthesized with Web Audio, so there's no file to ship; available on the web only for now.
 */
export const soundAvailable =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  typeof (window as { AudioContext?: unknown }).AudioContext === 'function';

let enabled = false;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function playChime(): void {
  if (!enabled || !soundAvailable) return;
  try {
    const Ctx = (window as unknown as { AudioContext: typeof AudioContext }).AudioContext;
    const ctx = new Ctx();
    const notes = [659.25, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.12;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => void ctx.close().catch(() => undefined), 1200);
  } catch {
    // A chime that can't play is never worth an error.
  }
}
