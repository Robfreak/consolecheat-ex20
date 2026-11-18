// Web Audio only. The AudioContext is created lazily on the first user action.

export type Note = { freq: number; start: number; length: number };

/** Landing jingle: a short rising arpeggio (C5 E5 G5 C6). */
export function jingleNotes(): Note[] {
  return [
    { freq: 523.25, start: 0, length: 0.09 },
    { freq: 659.25, start: 0.09, length: 0.09 },
    { freq: 783.99, start: 0.18, length: 0.09 },
    { freq: 1046.5, start: 0.27, length: 0.28 },
  ];
}

export const TICK = { freq: 1400, length: 0.018 } as const;

type Ctor = new () => AudioContext;

export function createSound(getCtor: () => Ctor | undefined = () => globalThis.AudioContext) {
  let ctx: AudioContext | null = null;
  let muted = false;

  /** Call from a user action (click, key, pad). Creates the context once. */
  function unlock(): AudioContext | null {
    if (muted) return ctx;
    if (!ctx) {
      const AC = getCtor();
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  }

  function blip(freq: number, start: number, length: number, type: OscillatorType, volume: number) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + start;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  return {
    unlock,
    get created() {
      return ctx !== null;
    },
    setMuted(value: boolean) {
      muted = value;
    },
    tick() {
      blip(TICK.freq, 0, TICK.length, "square", 0.05);
    },
    jingle() {
      for (const note of jingleNotes()) blip(note.freq, note.start, note.length, "triangle", 0.12);
    },
  };
}
