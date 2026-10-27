/**
 * Zoro's sounds: little beeps, chirps, clicks and sighs, made on the spot
 * with Web Audio. No audio files, nothing to download, nobody else's licence.
 *
 * Every state, emote and poke has a short cue. With `ambient` on, the
 * working states also keep a quiet bed going while they last: ticks while
 * loading, data chatter while processing, typing while generating, beeps
 * while speaking, snores while asleep. The screen head sounds digital and a
 * little higher; the classic head sounds soft and round.
 *
 * Sound is off unless the host turns it on, and browsers keep it silent until
 * the visitor has clicked or typed on the page; cues before that are dropped.
 * Any cue can be swapped for your own file with `samples`.
 */

import type { HeadStyle } from "./look";
import type { MascotEmote, MascotState } from "./zoro";

/** Everything Zoro can make a sound for. */
export type ZoroCue = MascotState | MascotEmote | "poke" | "nod" | "wear";

export interface SoundOptions {
  /** 0 to 1. Default 0.5, which is already quiet: these are interface sounds, not music. */
  volume?: number;
  /**
   * A quiet bed while a working state lasts: ticks while loading, chatter while
   * processing, typing while generating, beeps while speaking (following the
   * voice level), snores while asleep. Default false.
   */
  ambient?: boolean;
  /** Your own sound for any cue, as a URL or a decoded AudioBuffer. Cues without one keep Zoro's. */
  samples?: Partial<Record<ZoroCue, string | AudioBuffer>>;
}

// ── The voice ──────────────────────────────────────────────────────────────

interface Tone {
  /** Start and end pitch, Hz, before the head's own shift. */
  f: number;
  to?: number;
  /** Seconds after the cue starts. */
  at?: number;
  dur: number;
  gain?: number;
  wave?: OscillatorType;
  /** Vibrato: rate in Hz, depth as a share of the pitch. */
  vib?: number;
  vibDepth?: number;
}

interface Hiss {
  at?: number;
  dur: number;
  /** Band centre, Hz, gliding to `to`. */
  f: number;
  to?: number;
  q?: number;
  gain?: number;
  /** Seconds to swell in; the rest is the fade. */
  attack?: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseOf(ctx: BaseAudioContext) {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** One sound being made: where it goes, when it starts, and which head is making it. */
export class Voice {
  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
    readonly t0: number,
    readonly head: HeadStyle,
    /** A transposition on top, as a factor: pokes in a row climb. */
    readonly shift = 1,
  ) {}

  /** The screen head sits a whole tone higher. */
  get pitch() {
    return (this.head === "screen" ? 1.12 : 1) * this.shift;
  }

  /**
   * A pitched blip. The classic head is a sine with a soft octave on top; the
   * screen head is a filtered square, like a little speaker behind glass.
   */
  tone({ f, to, at = 0, dur, gain = 0.5, wave, vib = 0, vibDepth = 0.03 }: Tone) {
    const { ctx } = this;
    const t = this.t0 + at;
    const screen = this.head === "screen";
    const type = wave ?? (screen ? "square" : "sine");
    // Squares and saws carry far more energy than a sine at the same level.
    const peak = gain * (type === "sine" ? 1 : type === "triangle" ? 0.8 : 0.5);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(this.out);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = screen ? 2600 : 3800;
    lp.connect(env);

    const oscs: OscillatorNode[] = [];
    const add = (mult: number, kind: OscillatorType, level: number) => {
      const o = ctx.createOscillator();
      o.type = kind;
      o.frequency.setValueAtTime(f * this.pitch * mult, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to * this.pitch * mult, t + dur);
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(lp);
      oscs.push(o);
      return o;
    };
    add(1, type, 1);
    if (!screen && type === "sine") add(2, "triangle", 0.12);

    if (vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = vib;
      const depth = ctx.createGain();
      depth.gain.value = f * this.pitch * vibDepth;
      lfo.connect(depth);
      for (const o of oscs) depth.connect(o.frequency);
      oscs.push(lfo);
    }
    for (const o of oscs) {
      o.start(t);
      o.stop(t + dur + 0.03);
    }
    oscs[0].onended = () => env.disconnect();
  }

  /** Filtered noise: clicks, cloth, breath, sparkle. */
  hiss({ at = 0, dur, f, to, q = 1.2, gain = 0.3, attack = 0.004 }: Hiss) {
    const { ctx } = this;
    const t = this.t0 + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseOf(ctx);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f, t);
    if (to) bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(attack, dur * 0.8));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(env).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    src.onended = () => env.disconnect();
  }
}

// ── The cues ───────────────────────────────────────────────────────────────

/** A semitone ladder from C5, so the cues read as notes. */
const N = (semitones: number) => 523.25 * 2 ** (semitones / 12);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
/** A major pentatonic: any run of these sounds friendly. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

/**
 * What each cue sounds like. Rising lines read as glad or curious, falling as
 * sad or sleepy; quick bright blips as play, low buzz as trouble. Every cue is
 * under a second, most under a third of one.
 */
export const CUES: Record<ZoroCue, (v: Voice) => void> = {
  // Back to rest makes no sound: it happens all the time.
  idle: () => undefined,
  // Ears up: two quick rising blips.
  listening: (v) => {
    v.tone({ f: N(2), to: N(7), dur: 0.08, gain: 0.32 });
    v.tone({ f: N(9), at: 0.09, dur: 0.07, gain: 0.26 });
  },
  // Ready to talk: a little chirp.
  speaking: (v) => v.tone({ f: N(4), to: N(9), dur: 0.07, gain: 0.3 }),
  // "Hmm": a low wobbling note, then a thought bubble pops.
  thinking: (v) => {
    v.tone({ f: N(-5), to: N(-7), dur: 0.5, gain: 0.3, wave: "triangle", vib: 5, vibDepth: 0.018 });
    v.tone({ f: N(19), to: N(24), at: 0.48, dur: 0.06, gain: 0.18 });
  },
  // A bright rising arpeggio, and a sprinkle on top.
  happy: (v) => {
    [0, 4, 7, 12].forEach((s, i) => v.tone({ f: N(s + 7), at: i * 0.065, dur: i === 3 ? 0.26 : 0.1, gain: 0.3 }));
    v.hiss({ at: 0.2, dur: 0.3, f: 7000, to: 9000, q: 2, gain: 0.05 });
  },
  // "Meh": two sagging notes, a sad minor third apart.
  unimpressed: (v) => {
    v.tone({ f: N(-3), dur: 0.16, gain: 0.3, wave: "triangle" });
    v.tone({ f: N(-6), to: N(-8), at: 0.17, dur: 0.32, gain: 0.28, wave: "triangle" });
  },
  // "Uh-oh": two low buzzy notes, falling.
  error: (v) => {
    v.tone({ f: N(-15), dur: 0.13, gain: 0.5, wave: "sawtooth" });
    v.tone({ f: N(-20), at: 0.16, dur: 0.24, gain: 0.5, wave: "sawtooth" });
  },
  // A long falling sigh, breathy, into sleep.
  sleeping: (v) => {
    v.tone({ f: N(2), to: N(-10), dur: 0.7, gain: 0.22, wave: "triangle" });
    v.hiss({ dur: 0.7, f: 900, to: 400, q: 0.8, gain: 0.05, attack: 0.25 });
  },
  // A slide whistle wobbling down while it spins, then a bonk.
  dizzy: (v) => {
    v.tone({ f: N(12), to: N(-7), dur: 1, gain: 0.3, wave: "sine", vib: 9, vibDepth: 0.06 });
    v.tone({ f: N(-12), to: N(-16), at: 1.0, dur: 0.12, gain: 0.3 });
  },
  // The nods themselves make the sound ("nod"); the state starts quietly.
  nodding: () => undefined,
  // Powering up: a soft rising sweep.
  loading: (v) => {
    v.tone({ f: N(-12), to: N(0), dur: 0.28, gain: 0.22, wave: "triangle" });
    v.hiss({ dur: 0.28, f: 600, to: 2400, q: 1.5, gain: 0.04, attack: 0.2 });
  },
  // A burst of data: quick random blips.
  processing: (v) => {
    for (let i = 0; i < 5; i++) v.tone({ f: N(pick(PENTA) + 7), at: i * 0.05, dur: 0.045, gain: 0.2, wave: "square" });
  },
  // A sparkle sweeping up as the page appears.
  generating: (v) => {
    for (let i = 0; i < 6; i++) v.tone({ f: N(12 + PENTA[i]), at: i * 0.04, dur: 0.12, gain: 0.14 + i * 0.015 });
    v.hiss({ dur: 0.4, f: 4000, to: 10000, q: 2, gain: 0.05, attack: 0.15 });
  },

  // "Aww": a warm rising note with a wobble, then little heart pops.
  love: (v) => {
    v.tone({ f: N(0), to: N(7), dur: 0.45, gain: 0.3, vib: 6, vibDepth: 0.02 });
    [0.42, 0.55, 0.66].forEach((at, i) => v.tone({ f: N(19 + i * 3), to: N(24 + i * 3), at, dur: 0.05, gain: 0.14 }));
  },
  // "Ta-da!"
  proud: (v) => {
    v.tone({ f: N(7), dur: 0.09, gain: 0.3 });
    v.tone({ f: N(12), at: 0.11, dur: 0.42, gain: 0.3, vib: 5.5, vibDepth: 0.012 });
    v.tone({ f: N(16), at: 0.11, dur: 0.42, gain: 0.12 });
  },
  // "Oh!": a quick upward whoop.
  surprised: (v) => {
    v.tone({ f: N(-4), to: N(14), dur: 0.14, gain: 0.34 });
    v.tone({ f: N(14), at: 0.15, dur: 0.07, gain: 0.24 });
  },
  // A bright "ting".
  wink: (v) => {
    v.tone({ f: N(24), dur: 0.35, gain: 0.2 });
    v.tone({ f: N(31), dur: 0.2, gain: 0.08 });
    v.hiss({ dur: 0.03, f: 6000, q: 3, gain: 0.06 });
  },
  // A rapid trill climbing up, ending in "wee!".
  excited: (v) => {
    for (let i = 0; i < 7; i++) v.tone({ f: N(PENTA[i] + (i % 2 ? 4 : 0)), at: i * 0.045, dur: 0.05, gain: 0.24 });
    v.tone({ f: N(12), to: N(26), at: 0.32, dur: 0.18, gain: 0.26 });
  },
  // "Hm?": a held note that bends up like a question.
  confused: (v) => {
    v.tone({ f: N(-3), dur: 0.14, gain: 0.28, wave: "triangle" });
    v.tone({ f: N(-3), to: N(5), at: 0.17, dur: 0.22, gain: 0.28, wave: "triangle", vib: 7, vibDepth: 0.01 });
  },

  // A soft "boop", squashed, with a tap.
  poke: (v) => {
    v.tone({ f: N(9), to: N(-3), dur: 0.1, gain: 0.4 });
    v.hiss({ dur: 0.025, f: 2400, q: 2, gain: 0.08 });
  },
  // Three nods, "mm-hm-hm", in time with the head dipping.
  nod: (v) => {
    [0, 0.33, 0.66].forEach((at, i) => v.tone({ f: N([4, 7, 9][i]), to: N([2, 5, 7][i]), at, dur: 0.08, gain: 0.3 }));
  },
  // Something put on: a cloth swish and a snap.
  wear: (v) => {
    v.hiss({ dur: 0.18, f: 700, to: 2600, q: 0.9, gain: 0.2, attack: 0.08 });
    v.tone({ f: N(7), to: N(12), at: 0.16, dur: 0.06, gain: 0.3 });
  },
};

/** Counts beats in the beds below: which tick, which keystroke. */
let beat = 0;

/** The quiet bed under a working state: what to play now, and how long until the next. */
const AMBIENT: Partial<Record<MascotState, (v: Voice) => number>> = {
  // A soft clock tick, alternating, as the comet runs round.
  loading: (v) => {
    v.tone({ f: N(beat++ % 2 ? 24 : 21), dur: 0.03, gain: 0.07 });
    return 0.5;
  },
  // Data chatter: random quiet blips at an uneven pace.
  processing: (v) => {
    v.tone({ f: N(pick(PENTA) + 12), dur: 0.035, gain: 0.06, wave: "square" });
    return 0.09 + Math.random() * 0.16;
  },
  // Typing, and now and then the bell at the end of a line.
  generating: (v) => {
    if (++beat % 28 === 0) v.tone({ f: N(31), dur: 0.4, gain: 0.07 });
    else v.hiss({ dur: 0.025, f: 3000 + Math.random() * 1500, q: 4, gain: 0.09 });
    return 0.06 + Math.random() * 0.1;
  },
  // A thought bubble now and then.
  thinking: (v) => {
    v.tone({ f: N(19 + pick([0, 2, 4])), to: N(24), dur: 0.05, gain: 0.08 });
    return 1.4 + Math.random() * 0.8;
  },
  // A slow snore: breathe in, whistle out.
  sleeping: (v) => {
    v.hiss({ dur: 1.1, f: 320, to: 520, q: 1.2, gain: 0.08, attack: 0.7 });
    v.tone({ f: N(5), to: N(-2), at: 1.4, dur: 0.6, gain: 0.04, wave: "sine" });
    return 3.4;
  },
};

// ── One audio context for the whole page ───────────────────────────────────

let shared: { ctx: AudioContext; bus: AudioNode } | null = null;
let unlockArmed = false;

type ActivationNavigator = Navigator & { userActivation?: { hasBeenActive: boolean } };

/** The page's audio, made only once the visitor has interacted, so the browser never refuses it. */
function audio(fromGesture = false) {
  if (shared) {
    if (shared.ctx.state === "suspended") void shared.ctx.resume().catch(() => undefined);
    return shared;
  }
  const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AC = g.AudioContext ?? g.webkitAudioContext;
  if (!AC) return null;
  const ua = typeof navigator === "object" ? (navigator as ActivationNavigator).userActivation : undefined;
  if (!fromGesture && (!ua || !ua.hasBeenActive)) return null;
  const ctx = new AC();
  // A gentle limiter, so many Zoros at once never clip.
  const bus = ctx.createDynamicsCompressor();
  bus.threshold.value = -16;
  bus.knee.value = 8;
  bus.ratio.value = 6;
  bus.attack.value = 0.003;
  bus.release.value = 0.2;
  bus.connect(ctx.destination);
  // Safari can start it suspended even inside a click.
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  shared = { ctx, bus };
  return shared;
}

/** The first click, tap or key anywhere starts the page's audio. */
function armUnlock() {
  if (unlockArmed || shared || typeof window !== "object") return;
  unlockArmed = true;
  const events = ["pointerdown", "keydown", "touchend"] as const;
  const unlock = () => {
    if (!audio(true)) return;
    for (const e of events) window.removeEventListener(e, unlock, true);
  };
  for (const e of events) window.addEventListener(e, unlock, true);
}

// ── A player per Zoro ──────────────────────────────────────────────────────

export interface ZoroSound {
  /** Plays a cue now, in this head's voice. */
  cue(cue: ZoroCue, head: HeadStyle): void;
  /** Called every frame: keeps the ambient bed going, and turns the voice level into beeps while speaking. */
  tick(state: MascotState, voice: number, head: HeadStyle): void;
  set(opts: SoundOptions): void;
  destroy(): void;
}

export function createZoroSound(initial: SoundOptions = {}): ZoroSound {
  let opts: SoundOptions = initial;
  let out: GainNode | null = null;
  let lastState: MascotState | null = null;
  let nextAmbient = 0;
  let prevVoice = 0;
  let nextBeep = 0;
  let pokes: number[] = [];
  const buffers = new Map<string, AudioBuffer | "loading" | "failed">();
  armUnlock();

  const level = () => Math.min(1, Math.max(0, opts.volume ?? 0.5));
  const node = () => {
    const a = audio();
    if (!a || a.ctx.state !== "running") return null;
    if (!out) {
      out = a.ctx.createGain();
      out.gain.value = level();
      out.connect(a.bus);
    }
    return { ctx: a.ctx, out };
  };

  const sample = (ctx: AudioContext, src: string | AudioBuffer): AudioBuffer | null => {
    if (typeof src !== "string") return src;
    const got = buffers.get(src);
    if (got && got !== "loading" && got !== "failed") return got;
    if (!got) {
      buffers.set(src, "loading");
      fetch(src)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((b) => buffers.set(src, b))
        .catch(() => buffers.set(src, "failed"));
    }
    return null;
  };

  return {
    cue(cue, head) {
      const a = node();
      if (!a) return;
      const t = a.ctx.currentTime + 0.005;
      if (cue in AMBIENT || cue === "speaking" || cue === "idle") {
        // A new state: let its own cue sound before the bed comes in.
        lastState = cue as MascotState;
        nextAmbient = t + 0.8;
      }
      const own = opts.samples?.[cue];
      const buf = own ? sample(a.ctx, own) : null;
      if (buf) {
        const s = a.ctx.createBufferSource();
        s.buffer = buf;
        s.connect(a.out);
        s.start(t);
        return;
      }
      if (cue === "poke") {
        // Pokes in a row climb a minor third each, egging it on.
        pokes = pokes.filter((p) => t - p < 1.7);
        pokes.push(t);
        CUES.poke(new Voice(a.ctx, a.out, t, head, 2 ** (((pokes.length - 1) * 3) / 12)));
        return;
      }
      CUES[cue](new Voice(a.ctx, a.out, t, head));
    },

    tick(state, voice, head) {
      if (!opts.ambient) return;
      const a = node();
      if (!a) return;
      const t = a.ctx.currentTime;
      if (state !== lastState) {
        lastState = state;
        nextAmbient = t + 0.8;
      }
      if (state === "speaking") {
        // A beep on each syllable: the voice level jumping up starts one.
        if (voice > 0.32 && prevVoice <= 0.32 && t >= nextBeep) {
          new Voice(a.ctx, a.out, t + 0.005, head).tone({ f: N(pick(PENTA)), to: N(pick(PENTA)), dur: 0.05 + Math.random() * 0.05, gain: 0.08 + voice * 0.08 });
          nextBeep = t + 0.07;
        }
        prevVoice = voice;
        return;
      }
      prevVoice = voice;
      const bed = AMBIENT[state];
      if (bed && t >= nextAmbient) nextAmbient = t + bed(new Voice(a.ctx, a.out, t + 0.005, head));
    },

    set(next) {
      opts = next;
      if (out) out.gain.setTargetAtTime(level(), out.context.currentTime, 0.03);
    },

    destroy() {
      out?.disconnect();
      out = null;
    },
  };
}

/**
 * Renders one cue to an AudioBuffer offline, without playing it: for exporting
 * Zoro's sounds as files, or checking them in tests.
 */
export async function renderZoroCue(cue: ZoroCue, head: HeadStyle = "screen", seconds = 1.4, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  CUES[cue](new Voice(ctx, out, 0.01, head));
  return ctx.startRendering();
}
