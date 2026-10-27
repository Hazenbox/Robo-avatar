/**
 * Browser-only: Zoro as a live video feed (a MediaStream), for a virtual
 * camera, a video-call tile, a WebRTC peer or a screen recorder.
 *
 * Same idea as drawing a canvas into a stream, except the canvas is alive:
 * Zoro blinks, glances about, floats, and moves through whatever states you
 * give it. A call with a participant that has no camera can show Zoro instead.
 *
 * Frames are driven from a Worker's timer, not requestAnimationFrame and not a
 * window timer. rAF stops dead in a background tab and window timers drop to
 * once a second, and the tab that holds a call is very often in the
 * background. A dedicated worker's timer is not throttled that way, so the
 * tile keeps moving.
 */

import type { MascotLook } from "./look";
import { Zoro, type MascotAddon, type MascotEmote, type MascotState } from "./zoro";

export type MascotStreamHandle = {
  stream: MediaStream;
  stop: () => void;
  /** What Zoro is doing; speaking, while it lasts, wins over this. */
  setState: (state: MascotState) => void;
  emote: (emote: MascotEmote) => void;
  /** Read every frame. Wire it to "is its voice playing right now". */
  setSpeakingSource: (source: (() => boolean) | null) => void;
  /** Somebody in the room is talking: lifts the listening arcs. */
  pulseRoom: () => void;
  /** Dress it (addons). */
  setAddons: (addons: readonly MascotAddon[]) => void;
  /** Its whole look: wearables, fur, colour, face switches (look). */
  setLook: (look: MascotLook) => void;
};

/** A ticker that keeps time in a background tab, or a window timer if workers are unavailable. */
function startTicker(ms: number, tick: () => void): () => void {
  try {
    const src = "let t;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}";
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = tick;
    worker.postMessage(ms);
    return () => worker.terminate();
  } catch {
    const timer = window.setInterval(tick, ms);
    return () => window.clearInterval(timer);
  }
}

/**
 * A stand-in for its voice level while it speaks: syllables every 70-180 ms
 * with a breath between phrases. Its speech plays on the host's machine, not
 * through this call, so there is no audio here to measure; this moves it
 * mouth in the rhythm of speech, and only while it really is speaking.
 */
function createSyllables() {
  let target = 0;
  let level = 0;
  let next = 0;
  let pauseUntil = 0;
  let phraseEnd = 0;
  return (n: number, speaking: boolean): number => {
    if (!speaking) {
      level += (0 - level) * 0.4;
      phraseEnd = 0;
      return level;
    }
    if (n > next) {
      if (n > phraseEnd) {
        pauseUntil = phraseEnd === 0 ? n : n + 0.25 + Math.random() * 0.35;
        phraseEnd = pauseUntil + 1.2 + Math.random() * 2.2;
      }
      target = n < pauseUntil ? 0 : Math.random() < 0.18 ? 0.05 : 0.25 + Math.random() * 0.75;
      next = n + 0.07 + Math.random() * 0.11;
    }
    level += (target - level) * 0.35;
    return level;
  };
}

export function createMascotMediaStream(opts?: {
  width?: number;
  height?: number;
  fps?: number;
  /** What it wears; nothing by default. */
  addons?: readonly MascotAddon[];
  /** Its whole look; takes precedence over `addons`. */
  look?: MascotLook;
}): MascotStreamHandle {
  // 16:9, the shape of a video-call tile, so nothing of Zoro is cropped.
  const W = opts?.width ?? 960;
  const H = opts?.height ?? 540;
  const fps = opts?.fps ?? 15;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const bot = new Zoro({ glowAmount: 0.3, addons: opts?.addons, look: opts?.look });
  const syllables = createSyllables();
  let baseState: MascotState = "idle";
  let speakingSource: (() => boolean) | null = null;
  let room = 0;

  // A dim room behind it, Violet at the top, so the tile is not a void.
  const backdrop = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.75);
  backdrop.addColorStop(0, "#221a3a");
  backdrop.addColorStop(1, "#0a0a12");

  let last = performance.now();
  const paint = () => {
    const ms = performance.now();
    const dt = (ms - last) / 1000;
    last = ms;
    const n = ms / 1000;

    let speaking = false;
    try {
      speaking = !!speakingSource?.();
    } catch {
      /* a broken source must not stop the feed */
    }
    bot.setState(speaking ? "speaking" : baseState);
    bot.voice = syllables(n, speaking);
    room = Math.max(0, room - dt * 1.2);
    bot.room = room;
    bot.update(dt);

    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, W, H);
    bot.draw(ctx, W / 2, H * 0.47, H * 0.27);
  };
  paint();

  const stream = canvas.captureStream(fps);
  const stopTicker = startTicker(Math.round(1000 / fps), paint);

  return {
    stream,
    stop: () => {
      stopTicker();
      for (const track of stream.getTracks()) track.stop();
    },
    setState: (state) => {
      baseState = state;
    },
    emote: (emote) => bot.emote(emote),
    setSpeakingSource: (source) => {
      speakingSource = source;
    },
    pulseRoom: () => {
      room = Math.min(1, room + 0.35 + Math.random() * 0.3);
    },
    setAddons: (addons) => {
      bot.addons = new Set(addons);
    },
    setLook: (look) => bot.setLook(look),
  };
}
