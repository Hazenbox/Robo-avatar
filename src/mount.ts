/**
 * mountRobo: put Robo on a canvas.
 *
 * Owns the draw loop, the pixel ratio, the look-at-the-pointer behaviour,
 * reduced motion and pausing while off screen, and hands back a small handle.
 * Use `Robo` directly (see robo.ts) if you want to run the loop yourself.
 *
 * ```ts
 * const robo = mountRobo(document.querySelector("canvas")!, { state: "idle" });
 * robo.emote("love");
 * robo.setLook({ fur: true, color: "#ff8fb4", addons: ["visor"] });
 * // later:
 * robo.destroy();
 * ```
 */

import { DEFAULT_LOOK, type MascotLook } from "./look";
import { Robo, type MascotEmote, type MascotState } from "./robo";

export interface MountOptions {
  /** What Robo wears and how it looks. Anything left out takes its default. */
  look?: Partial<MascotLook>;
  /** The state to start in. Default "idle". */
  state?: MascotState;
  /** The halo behind Robo, 0 to 1. Default 0.3. */
  glow?: number;
  /** A soft contact shadow under Robo. Default true. */
  shadow?: boolean;
  /** Robo's eyes follow the pointer anywhere on the page. Default true. */
  followPointer?: boolean;
  /** How far the pointer must be from Robo, in CSS px, to look almost fully to one side (it follows a curve, so a short way is already most of a turn). Default 260. */
  lookReach?: number;
  /** "auto" follows the system's reduced-motion setting; true or false forces it. Default "auto". */
  reducedMotion?: "auto" | boolean;
  /** Robo's body radius as a share of the canvas's shorter side. Default 0.3. */
  radius?: number;
  /** A click on the canvas pokes Robo (three quick ones make it dizzy). Default true. */
  pokeOnClick?: boolean;
  /** The most device pixels per CSS pixel to draw at. Default 2. */
  maxPixelRatio?: number;
}

export interface RoboHandle {
  /** The engine, for everything the handle does not cover. */
  readonly robo: Robo;
  setState(state: MascotState): void;
  emote(emote: MascotEmote, seconds?: number): void;
  poke(): void;
  /** Replaces the whole look; fields you leave out go back to their defaults. */
  setLook(look: Partial<MascotLook>): void;
  /** The current look. */
  getLook(): MascotLook;
  /** Robo's own voice level, 0 to 1: moves the mouth while speaking. */
  setVoice(level: number): void;
  /** How loud the room is, 0 to 1: lifts the listening arcs. */
  setRoom(level: number): void;
  setGlow(amount: number): void;
  setShadow(on: boolean): void;
  setReducedMotion(reduced: "auto" | boolean): void;
  /** Where to look, -1 to 1 each way, for `seconds`; overrides idle glances. */
  lookAt(x: number, y: number, seconds?: number): void;
  /** Stops the loop and removes every listener. */
  destroy(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function mountRobo(canvas: HTMLCanvasElement, opts: MountOptions = {}): RoboHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("mountRobo: this canvas has no 2D context");
  const ctx2d: CanvasRenderingContext2D = ctx;

  const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reducedSetting: "auto" | boolean = opts.reducedMotion ?? "auto";
  const reduced = () => (reducedSetting === "auto" ? !!media?.matches : reducedSetting);

  let look: MascotLook = { ...DEFAULT_LOOK, ...opts.look };
  const robo = new Robo({ reduced: reduced(), glowAmount: opts.glow ?? 0.3, shadow: opts.shadow !== false, look });
  if (opts.state) robo.setState(opts.state, true);

  const radius = opts.radius ?? 0.3;
  const maxDpr = opts.maxPixelRatio ?? 2;
  const reach = opts.lookReach ?? 260;

  let raf = 0;
  let last = performance.now();
  let visible = true;
  let destroyed = false;

  function frame(ms: number) {
    raf = requestAnimationFrame(frame);
    // A tab that was hidden comes back with a huge gap; never integrate it in one step.
    const dt = Math.min(0.1, Math.max(0, (ms - last) / 1000));
    last = ms;
    robo.reduced = reduced();
    robo.update(dt);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);
    robo.draw(ctx2d, w / 2, h / 2, Math.min(w, h) * radius);
  }

  function start() {
    if (destroyed || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // Pause while scrolled out of view: an avatar nobody can see should cost nothing.
  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === "function") {
    io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
  }
  start();

  const lookAt = (x: number, y: number, seconds = 3) => {
    robo.lookX = clamp(x, -1, 1);
    robo.lookY = clamp(y, -1, 1);
    robo.lookActiveUntil = performance.now() / 1000 + seconds;
  };
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    // A curve, not a line: a little way from it is already most of a turn, and it eases out at the edge.
    const f = (d: number) => Math.tanh((d / reach) * 1.7) / Math.tanh(1.7);
    lookAt(f(e.clientX - (r.left + r.width / 2)), f((e.clientY - (r.top + r.height / 2)) * 1.4));
  };
  if (opts.followPointer !== false) window.addEventListener("pointermove", onMove, { passive: true });

  const onClick = () => robo.poke();
  if (opts.pokeOnClick !== false) canvas.addEventListener("click", onClick);

  return {
    robo,
    setState: (s) => robo.setState(s),
    emote: (e, seconds) => robo.emote(e, seconds),
    poke: () => robo.poke(),
    setLook: (l) => {
      look = { ...DEFAULT_LOOK, ...l };
      robo.setLook(look);
    },
    getLook: () => look,
    setVoice: (v) => {
      robo.voice = clamp(v, 0, 1);
    },
    setRoom: (v) => {
      robo.room = clamp(v, 0, 1);
    },
    setGlow: (g) => {
      robo.glowAmount = clamp(g, 0, 1);
    },
    setShadow: (on) => {
      robo.shadow = on;
    },
    setReducedMotion: (r) => {
      reducedSetting = r;
    },
    lookAt,
    destroy: () => {
      destroyed = true;
      stop();
      io?.disconnect();
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("click", onClick);
    },
  };
}
