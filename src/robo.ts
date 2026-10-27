/**
 * Robo: a lit sphere with an inset face plate, drawn entirely in Canvas 2D
 * (and, for the turning solid body, WebGL2). No images, no Rive, no Lottie.
 *
 * The design is one table of states, a handful of animated numbers moved by
 * tweens or by easing toward a target, and a draw pass that reads them every
 * frame. (Inspired by coucou's Mochi; no code is shared.)
 *
 * Units: everything is in R, the body's vertical radius, so the same engine
 * draws a favicon, a hero and a video-call tile.
 */

import {
  drawAddonsBehind,
  drawAddonsFront,
  drawGogglesOver,
  drawGogglesUnder,
  drawVisorOver,
  drawVisorUnder,
  LED_CORE,
  LED_GLOW,
  type AddonPose,
  type MascotAddon,
} from "./addons";

import { BODY_BOTTOM, bodyPath, drawFur, drawFurUnder, hexRgb } from "./body";
import { BODY_EXTENT, FRONT_DEPTH, drawSolidBody, solidBodyLive, solidPxPerR } from "./body-gl";
import { faceValues, type FaceTune } from "./face-style";
import { furVector, type FurStyle, type FurTune } from "./fur-style";
import { DEFAULT_LOOK, type HeadStyle, type MascotLook } from "./look";
import { SCREEN_HEAD_BOTTOM, drawScreenHead, type ScreenGlyph } from "./screen-head";

export type { MascotAddon } from "./addons";

type RGB = [number, number, number];
type EaseFn = (t: number) => number;
type TweenKey = [target: number, ms: number, ease: EaseFn];

export type MascotState =
  | "idle"
  | "listening"
  | "speaking"
  | "thinking"
  | "happy"
  | "unimpressed"
  | "error"
  | "sleeping"
  | "dizzy"
  | "nodding"
  | "loading"
  | "processing"
  | "generating";

export type MascotEmote = "love" | "proud" | "surprised" | "wink" | "excited" | "confused";

type Eye =
  | "pill" | "wide" | "happy" | "closed" | "half" | "x" | "spiral" | "heart" | "star" | "wink"
  | "excited" | "confused";
type Prop = "arcs" | "bars" | "bubbles" | "stress" | "orbit" | "arc" | "dots";

type StateCfg = {
  /** The halo's colour. */
  glow: RGB;
  /** How far the halo, and the underside of the body, lean toward `glow`. */
  tint: number;
  eye: Eye;
  mouth: "talk" | "flat" | null;
  /** The one accessory the state shows; "zz" is particles, not a prop. */
  prop: Prop | "zz" | null;
  look?: [number, number];
  /** The gaze moves by itself: "sweep" scans side to side, as when reading through a lot. */
  scan?: "sweep";
  glowI?: number;
  bounce?: boolean;
  breathe?: boolean;
};

type Particle = {
  type: "heart" | "star" | "spark" | "z";
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; rot: number; size: number;
};

type Animated =
  | "yaw" | "pitch" | "open" | "es" | "sx" | "sy" | "ox" | "oy" | "tilt" | "roll";

type Tween = { prop: Animated; keys: TweenKey[]; i: number; from: number; start: number; done?: () => void };

const TAU = Math.PI * 2;
const now = () => performance.now() / 1000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1)})`;

const Ease: Record<"lin" | "out" | "inOut" | "back", EaseFn> = {
  lin: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c1 = 1.7;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// ── Geometry (in R, the body's vertical radius) ──────────────────────────────

const G = {
  bodyRx: 1.03, // the body is a touch wider than tall
  plateRx: 0.797,
  plateRy: 0.757,
  plateDepth: 0.62, // how far the plate's centre travels across the sphere as it turns
  maxYaw: 0.55, // radians at look = ±1
  maxPitch: 0.42,
  eyeX: 0.377,
  eyeY: -0.045,
  eyeW: 0.16,
  eyeH: 0.305,
  mouthY: 0.17,
};

// ── Palette ──────────────────────────────────────────────────────────────────

const BODY_STOPS: [number, RGB][] = [
  [0, [250, 249, 247]],
  [0.3, [243, 242, 241]],
  [0.45, [228, 228, 229]],
  [0.62, [204, 205, 210]],
  [0.9, [165, 168, 180]],
  [1, [135, 138, 150]],
];
const PLATE_STOPS: [number, RGB][] = [
  [0, [253, 250, 246]],
  [0.33, [246, 245, 243]],
  [0.5, [219, 219, 221]],
  [0.9, [186, 190, 200]],
  [1, [172, 177, 190]],
];
const COOL_SHADE: RGB = [150, 175, 230];
const RIM_COOL: RGB = [205, 224, 255];
const RIM_WARM: RGB = [255, 252, 246];
const GLOW_COOL: RGB = [200, 220, 255];
const GLOW_WARM: RGB = [255, 250, 244];
const AO: RGB = [15, 15, 25];
const WHITE: RGB = [255, 255, 255];
const INK_TOP: RGB = [8, 8, 10];
const INK_BOTTOM: RGB = [42, 42, 48];
const INK = "rgb(14,14,17)";

/** The yaw of the studio pose: the plate a touch right of centre. */
const REF_YAW = Math.asin(0.081 / G.plateDepth) / G.maxYaw;

/**
 * The studio halo: 0.9 at the edge, 0.73 at 1.06 R, 0.28 at 1.25 R, nothing
 * past 1.6 R. Split across two passes. Only `studioPose` uses it.
 */
const STUDIO_GLOW_STOPS: [number, number][] = (
  [
    [0, 0.95], [0.143, 0.9], [0.229, 0.73], [0.329, 0.53],
    [0.5, 0.28], [0.686, 0.12], [0.857, 0.04], [1, 0],
  ] as [number, number][]
).map(([o, a]) => [o, 1 - Math.sqrt(1 - a)]);

/** A gaussian falloff, tight to the body, split across two overlapping passes. */
const GLOW_STOPS: [number, number][] = Array.from({ length: 11 }, (_, i) => {
  const t = i / 10;
  return [t, 1 - Math.sqrt(1 - 0.9 * Math.exp(-Math.pow(t * 2.4, 2)))];
});

export const MASCOT_STATES: Record<MascotState, StateCfg> = {
  idle: { glow: [255, 255, 255], tint: 0, eye: "pill", mouth: null, prop: null },
  listening: { glow: [170, 200, 255], tint: 0.4, eye: "pill", mouth: null, prop: "arcs" },
  speaking: { glow: [190, 165, 255], tint: 0.4, eye: "pill", mouth: "talk", prop: "bars" },
  thinking: { glow: [175, 145, 255], tint: 0.45, eye: "pill", mouth: null, prop: "bubbles", look: [0.55, -0.8] },
  happy: { glow: [255, 232, 175], tint: 0.35, eye: "happy", mouth: null, prop: null, bounce: true },
  unimpressed: { glow: [255, 196, 130], tint: 0.45, eye: "half", mouth: "flat", prop: null, look: [-0.2, 0.15] },
  error: { glow: [255, 110, 110], tint: 0.6, eye: "x", mouth: null, prop: "stress" },
  sleeping: { glow: [140, 156, 190], tint: 0.5, eye: "closed", mouth: null, prop: "zz", look: [0, 0.35], glowI: 0.45, breathe: true },
  dizzy: { glow: [255, 160, 210], tint: 0.5, eye: "spiral", mouth: null, prop: null },
  // A yes: it nods now and then.
  nodding: { glow: [175, 230, 195], tint: 0.3, eye: "pill", mouth: null, prop: null },
  // Waiting on something: a ring of light circles it, and it looks up at it.
  loading: { glow: [150, 190, 255], tint: 0.4, eye: "pill", mouth: null, prop: "orbit", look: [0, -0.3] },
  // Working through a lot: a spinner round it, and its eyes read from side to side.
  processing: { glow: [160, 140, 255], tint: 0.45, eye: "pill", mouth: null, prop: "arc", scan: "sweep" },
  // Making something: sparks rise off it, and three dots bounce as in a chat that is typing.
  generating: { glow: [255, 200, 150], tint: 0.4, eye: "wide", mouth: null, prop: "dots", look: [0.2, -0.35] },
};

const PROPS: Prop[] = ["arcs", "bars", "bubbles", "stress", "orbit", "arc", "dots"];

// ── Path helpers ─────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function pill(x: Ctx, X: number, Y: number, W: number, H: number) {
  const r = Math.max(0, Math.min(W / 2, H / 2));
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

function heartPath(x: Ctx, s: number) {
  x.beginPath();
  x.moveTo(0, s * 0.38);
  x.bezierCurveTo(-s * 1.05, -s * 0.15, -s * 0.5, -s * 0.95, 0, -s * 0.38);
  x.bezierCurveTo(s * 0.5, -s * 0.95, s * 1.05, -s * 0.15, 0, s * 0.38);
  x.closePath();
}

function starPath(x: Ctx, ro: number, ri: number) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
}

function radial(
  x: Ctx, cx: number, cy: number, r0: number, r1: number,
  stops: readonly (readonly [number, RGB, number?])[],
) {
  const g = x.createRadialGradient(cx, cy, r0, cx, cy, r1);
  for (const [o, c, a] of stops) g.addColorStop(o, rgba(c, a ?? 1));
  return g;
}

/**
 * A one-sided light: a radial gradient whose centre sits off to one side, so
 * only the far edge of the body reaches its outer radius. Cheap rim lighting.
 */
function crescent(
  x: Ctx, R: number, ox: number, oy: number, r0: number, r1: number, color: RGB, alpha: number,
) {
  x.fillStyle = radial(x, ox * R, oy * R, r0 * R, r1 * R, [[0, color, 0], [1, color, alpha]]);
  x.fillRect(-1.6 * R, -1.6 * R, 3.2 * R, 3.2 * R);
}

/** A small lit ball: the thought bubbles reuse the body's shading. */
function ball(x: Ctx, X: number, Y: number, r: number, alpha: number) {
  x.save();
  x.globalAlpha = alpha;
  x.fillStyle = radial(x, X + r * 0.45, Y - r * 0.42, 0, r * 1.6, BODY_STOPS);
  x.beginPath();
  x.arc(X, Y, r, 0, TAU);
  x.fill();
  x.restore();
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class Robo {
  /** prefers-reduced-motion: no float, bounce or particles. */
  reduced: boolean;
  /** 0 = no halo, 1 = a strong one. */
  glowAmount: number;
  /** A soft contact shadow under it, so it sits in the scene. */
  shadow: boolean;
  /**
   * What it is wearing (addons). Empty by default, and with it
   * empty nothing below draws differently: add-ons only ever add.
   */
  addons: Set<MascotAddon>;
  /**
   * Freezes it in a fixed studio pose (idle, facing a touch right, full halo,
   * no blinking or floating): deterministic frames for screenshots and visual
   * regression tests. Off everywhere else.
   */
  studioPose = false;
  /** Fired by three pokes inside 1.7 s; without it it just goes dizzy. */
  onDizzy: (() => void) | null = null;
  /*
   * The rest of its look (look). The defaults are the original
   * character, drawn exactly as before.
   */
  head: HeadStyle = DEFAULT_LOOK.head;
  fur = DEFAULT_LOOK.fur;
  furStyle: FurStyle = DEFAULT_LOOK.furStyle;
  furTune: FurTune = DEFAULT_LOOK.furTune;
  /** A colour for its whole body, `#rrggbb`, or null for its own white. */
  color: string | null = DEFAULT_LOOK.color;
  facePlate = DEFAULT_LOOK.facePlate;
  faceRing = DEFAULT_LOOK.faceRing;
  faceTune: FaceTune = DEFAULT_LOOK.faceTune;
  /** Its body drawn as a turning solid (body-gl), and what it was drawn for. */
  private solid: { canvas: HTMLCanvasElement; key: string } | null = null;
  /** How far out its face rides as it turns, in R. */
  private faceDepth = G.plateDepth;
  /** Its face plate is drawn into the fur as a pale patch, not over it. */
  private plushFace = false;

  state: MascotState = "idle";
  private cfg: StateCfg = MASCOT_STATES.idle;
  private eye: Eye = "pill";
  private eyeOverride: Eye | null = null;
  private eyeOverrideUntil = 0;

  // Animated numbers. yaw/pitch are -1…1; offsets are in R.
  yaw = 0; pitch = 0;
  open = 1; es = 1;
  sx = 1; sy = 1; ox = 0; oy = 0;
  tilt = 0; roll = 0;
  private mouth = 0;
  private bars = [0, 0, 0];
  private barJitter = [1, 1, 1];
  private nextJitter = 0;
  private glowI = 1;
  private glowCol: RGB = [...MASCOT_STATES.idle.glow];
  private tint = 0;
  private props: Record<Prop, number> = { arcs: 0, bars: 0, bubbles: 0, stress: 0, orbit: 0, arc: 0, dots: 0 };

  // Inputs, fed by the host.
  /** Where to look, -1…1; wins over idle glances until `lookActiveUntil` (seconds). */
  lookX = 0;
  lookY = 0;
  lookActiveUntil = 0;
  /** Robo's own voice level, 0…1: drives the mouth and the level bars. */
  voice = 0;
  /** The meeting's level, 0…1: lifts the listening arcs. */
  room = 0;

  private tweens = new Map<Animated, Tween>();
  private locks = new Set<Animated>();
  private particles: Particle[] = [];
  private t0 = now() - Math.random() * 10;
  private nextBlink = now() + 1.5 + Math.random() * 2;
  private nextGlance = 0;
  private glance: [number, number] = [0, 0];
  private lastAmbient = 0;
  private lastSpark = 0;
  /** The screen head's rim light: where its colours sit, how fast they flow, how bright. */
  private rimSpin = 0;
  private rimSpeed = 0;
  private rimLevel = 1;
  private nextNod = 0;
  private pokes: number[] = [];

  // Spring lag of soft add-on parts (the pompom, the muffler's tail), -1…1.
  private physDx = 0;
  private physDy = 0;
  private physVx = 0;
  private physVy = 0;
  private prevYaw = 0;
  private prevOy = 0;

  constructor(
    opts: {
      reduced?: boolean;
      glowAmount?: number;
      shadow?: boolean;
      addons?: readonly MascotAddon[];
      look?: MascotLook;
    } = {},
  ) {
    this.reduced = !!opts.reduced;
    this.glowAmount = opts.glowAmount ?? 0.3;
    this.shadow = opts.shadow !== false;
    this.addons = new Set(opts.addons ?? []);
    if (opts.look) this.setLook(opts.look);
  }

  /** Puts on a whole look: wearables, fur, colour and the face switches. */
  setLook(look: MascotLook) {
    this.addons = new Set(look.addons);
    // Looks saved before there was a choice of head have the classic one.
    this.head = look.head ?? DEFAULT_LOOK.head;
    this.fur = look.fur;
    // Looks saved before the coat had styles have neither.
    this.furStyle = look.furStyle ?? DEFAULT_LOOK.furStyle;
    this.furTune = look.furTune ?? DEFAULT_LOOK.furTune;
    this.color = look.color;
    this.facePlate = look.facePlate;
    this.faceRing = look.faceRing;
    this.faceTune = look.faceTune ?? DEFAULT_LOOK.faceTune;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setState(name: MascotState, force = false) {
    const cfg = MASCOT_STATES[name];
    if (name === this.state && !force) return;
    this.state = name;
    this.cfg = cfg;
    // The eyes change behind a blink, so it reads as a reaction rather than a cut.
    this.blink(() => { this.eye = cfg.eye; });

    switch (name) {
      case "happy":
        this.hop(0.22);
        setTimeout(() => this.emit("spark", 6), 180);
        break;
      case "error":
        this.anim("ox", [
          [0.06, 50, Ease.out], [-0.06, 70, Ease.inOut], [0.04, 70, Ease.inOut],
          [-0.02, 70, Ease.inOut], [0, 90, Ease.out],
        ]);
        break;
      case "listening":
        this.anim("sy", [[1.04, 140, Ease.out], [1, 280, Ease.back]]);
        break;
      case "speaking":
        this.hop(0.06);
        break;
      case "dizzy":
        this.spin(1300, 2);
        break;
      case "nodding":
        this.nextNod = 0;
        break;
    }
  }

  /** Three nods: its face dips, comes back, dips again. */
  private nod() {
    this.anim("pitch", [
      [0.85, 170, Ease.out], [-0.05, 160, Ease.inOut],
      [0.85, 170, Ease.out], [-0.05, 160, Ease.inOut],
      [0.7, 160, Ease.out], [0, 260, Ease.inOut],
    ]);
    this.anim("sy", [[0.97, 170, Ease.out], [1, 300, Ease.back]]);
  }

  blink(onClosed?: () => void) {
    if (this.locks.has("open")) { onClosed?.(); return; }
    this.anim("open", [[0.05, 75, Ease.inOut], [1, 140, Ease.out]]);
    if (onClosed) setTimeout(onClosed, 75);
  }

  /** A short reaction on top of the current state. */
  emote(name: MascotEmote, duration = 1.8) {
    switch (name) {
      case "love":
        this.eyeOverride = "heart";
        this.emit("heart", 4);
        this.hop(0.1);
        break;
      case "proud":
        this.eyeOverride = "star";
        this.emit("star", 5);
        this.anim("tilt", [[-0.14, 220, Ease.out], [-0.14, (duration - 0.5) * 1000, Ease.lin], [0, 280, Ease.inOut]]);
        break;
      case "surprised":
        this.eyeOverride = "wide";
        this.anim("es", [[1.25, 120, Ease.out], [1, 500, Ease.inOut]]);
        this.hop(0.25);
        break;
      case "wink":
        this.eyeOverride = "wink";
        this.anim("tilt", [[0.12, 160, Ease.out], [0.12, (duration - 0.4) * 1000, Ease.lin], [0, 240, Ease.inOut]]);
        break;
      case "excited":
        this.eyeOverride = "excited";
        this.emit("spark", 5);
        this.hop(0.18);
        this.anim("sx", [[1.06, 90, Ease.out], [1, 260, Ease.back]]);
        break;
      case "confused":
        this.eyeOverride = "confused";
        // The screen says it with a question mark; only the classic head cocks itself too.
        if (this.head === "classic") this.anim("tilt", [[-0.1, 200, Ease.out], [-0.1, (duration - 0.45) * 1000, Ease.lin], [0, 250, Ease.inOut]]);
        break;
    }
    this.eyeOverrideUntil = now() + duration;
  }

  /** A click on it: a squash and a flat look; three in a row make it dizzy. */
  poke() {
    const n = now();
    this.pokes = this.pokes.filter((p) => n - p < 1.7);
    this.pokes.push(n);
    this.anim("sy", [[0.84, 70, Ease.out], [1.08, 130, Ease.out], [1, 180, Ease.inOut]]);
    this.anim("sx", [[1.12, 70, Ease.out], [0.96, 130, Ease.out], [1, 180, Ease.inOut]]);
    if (this.pokes.length >= 3) {
      this.pokes = [];
      if (this.onDizzy) this.onDizzy();
      else this.setState("dizzy", true);
      return;
    }
    // A poke makes the classic head flat-eyed, and the screen squeeze shut.
    this.eyeOverride = this.head === "screen" ? "excited" : "half";
    this.eyeOverrideUntil = n + 0.8;
  }

  private hop(height: number) {
    if (this.reduced) return;
    this.anim("oy", [[-height, 170, Ease.out], [0, 320, Ease.back]]);
    this.anim("sy", [[0.94, 80, Ease.out], [1.05, 160, Ease.out], [1, 300, Ease.back]]);
  }

  private spin(ms: number, turns: number) {
    this.roll = 0;
    this.anim("roll", [[TAU * turns, ms, Ease.inOut]], () => { this.roll = 0; });
  }

  private emit(type: Particle["type"], count: number) {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      const isZ = type === "z";
      this.particles.push({
        type,
        x: isZ ? 0.55 : (Math.random() - 0.5) * 1.1,
        y: isZ ? -0.75 : -0.8 - Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 0.35 + (isZ ? 0.2 : 0),
        vy: -(0.45 + Math.random() * 0.35),
        age: -i * 0.14,
        life: 1.3 + Math.random() * 0.5,
        rot: Math.random() * TAU,
        size: 0.13 + Math.random() * 0.07,
      });
    }
  }

  private anim(prop: Animated, keys: TweenKey[], done?: () => void) {
    this.tweens.set(prop, { prop, keys, i: 0, from: this[prop], start: performance.now(), done });
    this.locks.add(prop);
  }

  private currentEye(): Eye {
    return this.eyeOverride ?? this.eye;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dtIn: number) {
    const dt = clamp(dtIn, 0, 0.1);
    const n = now();
    const ms = performance.now();
    const t = n - this.t0;
    const cfg = this.cfg;
    const still = this.reduced || this.studioPose;

    for (const tw of [...this.tweens.values()]) {
      const k = tw.keys[tw.i];
      const p = clamp((ms - tw.start) / k[1], 0, 1);
      this[tw.prop] = tw.from + (k[0] - tw.from) * k[2](p);
      if (p >= 1) {
        tw.from = k[0];
        tw.i += 1;
        tw.start = ms;
        if (tw.i >= tw.keys.length) {
          this.tweens.delete(tw.prop);
          this.locks.delete(tw.prop);
          tw.done?.();
        }
      }
    }

    // Gaze: the state's own look, then whoever the host points it at, then idle glances.
    let gx: number;
    let gy: number;
    if (this.studioPose) {
      gx = REF_YAW;
      gy = 0;
    } else if (cfg.scan === "sweep") {
      gx = Math.sin(t * 1.9) * 0.9;
      gy = -0.1 + Math.sin(t * 0.7) * 0.2;
    } else if (cfg.look) {
      gx = cfg.look[0] * 0.8 + this.lookX * 0.2;
      gy = cfg.look[1] * 0.8 + this.lookY * 0.2;
    } else if (n < this.lookActiveUntil) {
      gx = this.lookX;
      gy = this.lookY;
    } else {
      if (n > this.nextGlance) {
        this.glance = Math.random() < 0.35 ? [0, 0] : [(Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.4];
        this.nextGlance = n + 1.2 + Math.random() * 2.4;
      }
      [gx, gy] = this.glance;
    }
    if (this.state === "dizzy") gx += Math.sin(t * 8) * 0.25;
    // Quick to follow: the gaze closes most of the gap in a tenth of a second.
    const kLook = 1 - Math.pow(0.0001, dt);
    if (!this.locks.has("yaw")) this.yaw += (clamp(gx, -1, 1) - this.yaw) * kLook;
    if (!this.locks.has("pitch")) this.pitch += (clamp(gy, -1, 1) - this.pitch) * kLook;

    // Body: a slow float, a bounce when happy, breathing, a swell on loud syllables.
    const kGen = 1 - Math.pow(0.0008, dt);
    let tgOy = 0;
    if (!still) tgOy = cfg.bounce ? -Math.abs(Math.sin(t * 4.4)) * 0.07 : Math.sin(t * 1.25) * 0.02;
    if (!this.locks.has("oy")) this.oy += (tgOy - this.oy) * kGen;

    const br = still ? 0 : cfg.breathe ? 0.03 : 0.012;
    let tgSy = 1 + Math.sin(t * 1.7) * br;
    let tgSx = 1 - Math.sin(t * 1.7) * br * 0.6;
    if (this.state === "speaking" && !still) {
      tgSy += this.mouth * 0.02;
      tgSx -= this.mouth * 0.008;
    }
    if (!this.locks.has("sy")) this.sy += (tgSy - this.sy) * kGen;
    if (!this.locks.has("sx")) this.sx += (tgSx - this.sx) * kGen;
    // The screen head leans into a turn more: its whole head tips toward where it looks.
    const tgTilt = still ? 0 : this.yaw * (this.head === "screen" ? 0.1 : 0.06);
    if (!this.locks.has("tilt")) this.tilt += (tgTilt - this.tilt) * kGen;

    // Mouth: fast attack, slower release, like a VU meter, so it never chatters.
    const mt = cfg.mouth === "talk" ? clamp(this.voice, 0, 1) : 0;
    this.mouth += (mt - this.mouth) * (1 - Math.pow(mt > this.mouth ? 1e-7 : 1e-3, dt));

    if (n > this.nextJitter) {
      this.barJitter = this.barJitter.map(() => 0.55 + Math.random() * 0.45);
      this.nextJitter = n + 0.09;
    }
    for (let i = 0; i < 3; i++) {
      const tg = cfg.prop === "bars" ? clamp(this.voice * this.barJitter[i] * (0.8 + i * 0.2), 0, 1) : 0;
      this.bars[i] += (tg - this.bars[i]) * (1 - Math.pow(1e-4, dt));
    }

    const kc = 1 - Math.pow(0.01, dt);
    for (let c = 0; c < 3; c++) this.glowCol[c] += (cfg.glow[c] - this.glowCol[c]) * kc;
    this.tint += (cfg.tint - this.tint) * kc;
    let gi = (cfg.glowI ?? 1) * (still ? 1 : 1 + 0.05 * Math.sin(t * 1.3));
    if (this.state === "speaking") gi += this.mouth * 0.25;
    if (this.state === "listening") gi += this.room * 0.2;
    this.glowI += (gi - this.glowI) * (1 - Math.pow(0.02, dt));

    for (const key of PROPS) {
      const on = cfg.prop === key ? 1 : 0;
      this.props[key] += (on - this.props[key]) * (1 - Math.pow(on ? 0.004 : 0.0004, dt));
      if (this.props[key] < 0.002) this.props[key] = 0;
    }

    if (!this.studioPose && n > this.nextBlink) {
      const e = this.currentEye();
      if (e === "pill" || e === "wide") {
        this.blink();
        if (Math.random() < 0.2) setTimeout(() => this.blink(), 240);
      }
      this.nextBlink = n + 2.2 + Math.random() * 3.4;
    }
    if (this.eyeOverride && n > this.eyeOverrideUntil) this.eyeOverride = null;

    if (this.state === "nodding" && !still && !this.locks.has("pitch") && n > this.nextNod) {
      this.nod();
      this.nextNod = n + 2.4;
    }
    // The rim's colours flow round while it processes, faster while it generates;
    // it breathes brighter while generating, lifts with the room while listening,
    // and dims while it sleeps.
    const speed = this.state === "processing" ? 1.5 : this.state === "generating" ? 3.4 : 0;
    this.rimSpeed += (speed - this.rimSpeed) * (1 - Math.pow(0.02, dt));
    if (!still) this.rimSpin = (this.rimSpin + this.rimSpeed * dt) % TAU;
    const level =
      this.state === "generating" ? 1.15 + 0.2 * Math.sin(t * 4.2)
      : this.state === "listening" ? 1 + this.room * 0.6
      : this.state === "sleeping" ? 0.45
      : 1;
    this.rimLevel += (level - this.rimLevel) * (1 - Math.pow(0.01, dt));

    if (this.state === "generating" && this.head === "classic" && n - this.lastSpark > 0.32) {
      this.lastSpark = n;
      this.emit("spark", 2);
    }

    if (n - this.lastAmbient > 1.4) {
      this.lastAmbient = n;
      if (cfg.prop === "zz") this.emit("z", 1);
    }
    for (const p of this.particles) p.age += dt;
    this.particles = this.particles.filter((p) => p.age < p.life);

    // Soft parts lag behind head turns and hops (a spring: stiffness 60,
    // damping 9). Only add-ons read it.
    if (dt > 0) {
      const yawVel = (this.yaw - this.prevYaw) / dt;
      const oyVel = (this.oy - this.prevOy) / dt;
      const tDx = clamp(-yawVel * 0.35 - this.tilt * 2, -1, 1);
      const tDy = clamp(oyVel * 0.5, -1, 1);
      this.physVx += (60 * (tDx - this.physDx) - 9 * this.physVx) * dt;
      this.physVy += (60 * (tDy - this.physDy) - 9 * this.physVy) * dt;
      this.physDx = clamp(this.physDx + this.physVx * dt, -1, 1);
      this.physDy = clamp(this.physDy + this.physVy * dt, -1, 1);
    }
    this.prevYaw = this.yaw;
    this.prevOy = this.oy;
  }

  /** Its pose, for add-ons to draw against. */
  private addonPose(R: number): AddonPose {
    const a = this.yaw * G.maxYaw;
    const b = this.pitch * G.maxPitch;
    return {
      R,
      a,
      b,
      fx: Math.sin(a) * G.plateDepth * R,
      fy: Math.sin(b) * G.plateDepth * R,
      ca: Math.cos(a),
      cb: Math.cos(b),
      tilt: this.tilt,
      swayX: this.physDx,
      swayY: this.physDy,
      t: now() - this.t0,
      level: Math.max(this.voice, this.room),
    };
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  /** Draws its centred on (cx, cy) with body radius R. */
  draw(x: Ctx, cx: number, cy: number, R: number) {
    if (this.shadow && !this.studioPose) this.drawShadow(x, cx, cy, R);
    x.save();
    x.translate(cx + this.ox * R, cy + this.oy * R);
    // The screen head has no halo of its own: its rim light is the glow.
    if (this.head !== "screen") this.drawGlow(x, R);

    x.save();
    x.scale(this.sx, this.sy);
    if (this.head === "screen") {
      // Everything it shows is on its screen and its rim: nothing floats round it.
      // The whole head also shifts a little toward where it looks.
      x.translate(this.yaw * 0.055 * R, this.pitch * 0.04 * R);
      this.drawScreen(x, R);
      x.restore();
      x.restore();
      return;
    }
    const body = bodyPath(R, G.bodyRx);
    const pose = this.addons.size ? this.addonPose(R) : null;
    if (pose) drawAddonsBehind(x, this.addons, pose);
    const furRgb = this.fur && this.color ? hexRgb(this.color) : null;
    // Fur is a solid that turns with it, drawn on the GPU (body-gl). Its own
    // smooth round body is drawn in 2D, as it always was -- a plain ball looks
    // the same turned -- and so is everything where WebGL2 is missing, with
    // the 2D fur from body.
    const m = x.getTransform();
    const solid = this.fur ? this.solidBody(R * Math.hypot(m.a, m.b)) : null;
    if (solid) {
      x.drawImage(solid, -BODY_EXTENT * R, -BODY_EXTENT * R, 2 * BODY_EXTENT * R, 2 * BODY_EXTENT * R);
      // Its face rides on the solid's front.
      this.faceDepth = FRONT_DEPTH;
      this.plushFace = true;
    } else {
      if (this.fur) drawFurUnder(x, body, R, furRgb);
      this.drawBody(x, body, R);
      if (this.fur) drawFur(x, body, R, furRgb, this.physDx);
      this.faceDepth = G.plateDepth;
      this.plushFace = false;
    }
    x.save();
    // A turned solid's face stays on its front, so only the 2D body clips it.
    if (!solid) x.clip(body);
    this.drawFace(x, R, pose);
    x.restore();
    if (pose) drawAddonsFront(x, this.addons, pose);
    x.restore();

    this.drawProps(x, R);
    this.drawParticles(x, R);
    x.restore();
  }

  /** The screen head (screen-head): its own shell and face, the same states and timing. */
  private drawScreen(x: Ctx, R: number) {
    const eye = this.currentEye();
    // Thinking has a face of its own on the screen; elsewhere it shares the engine's eyes.
    const glyph: ScreenGlyph =
      this.state === "loading" ? "loading"
      : this.state === "generating" && !this.eyeOverride ? "generating"
      : eye === "pill" && this.state === "thinking" ? "think"
      : eye;
    const t = now() - this.t0;
    drawScreenHead(x, R, {
      yaw: this.yaw,
      pitch: this.pitch,
      tilt: this.tilt,
      roll: this.roll,
      open: this.open,
      es: this.es,
      glyph,
      mouth: this.mouth,
      talking: this.cfg.mouth === "talk",
      t: now(),
      rim: {
        spin: this.rimSpin,
        chase: this.state === "loading" ? t * 3.8 : null,
        level: this.rimLevel,
      },
    });
  }

  /**
   * Its body as a solid, turned as its face is, at `pxPerR` device pixels per
   * R. Redrawn only when something it shows changes; where the GPU is a
   * software one, drawn once, facing forward. Null where it can't be drawn.
   */
  private solidBody(pxPerR: number): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const live = solidBodyLive();
    if (live === null) return null;
    const px = solidPxPerR(pxPerR);
    // Turns in steps too small to see, so a settled gaze stops redrawing.
    const step = (v: number) => Math.round(v * 250) / 250;
    const yaw = live ? step(this.yaw * G.maxYaw) : 0;
    const pitch = live ? step(this.pitch * G.maxPitch) : 0;
    const params = this.fur ? furVector(this.furStyle, this.furTune) : null;
    const ft = faceValues(this.faceTune);
    const key = `${this.fur}|${this.color}|${this.facePlate}|${px}|${yaw}|${pitch}|${params?.join(",")}|${JSON.stringify(this.faceTune)}`;
    if (this.solid?.key === key) return this.solid.canvas;
    const canvas = this.solid?.canvas ?? document.createElement("canvas");
    // With fur, its face plate is a patch of pale fur, placed as drawFace places the plate.
    const face: [number, number, number, number] | null =
      this.fur && this.facePlate
        ? [
            Math.sin(yaw) * FRONT_DEPTH,
            Math.sin(pitch) * FRONT_DEPTH + ft.lift,
            // A little smaller than the plate: a pale muzzle, as plush toys have.
            0.98 * G.plateRx * Math.cos(yaw) * ft.width,
            0.9 * G.plateRy * Math.cos(pitch) * ft.height,
          ]
        : null;
    const look = {
      fur: this.fur,
      color: this.color ? hexRgb(this.color) : null,
      face,
      faceVelvet: [ft.softness, ft.velvet, ft.patchTint] as [number, number, number],
      params,
    };
    if (!drawSolidBody(canvas, look, yaw, pitch, px)) return null;
    this.solid = { canvas, key };
    return canvas;
  }

  /**
   * Its shadow on the floor: a tight dark core where it is closest and a wide
   * soft penumbra round it, both falling off smoothly to nothing (no rim).
   * Floating higher makes it broader, paler and softer, as light does.
   */
  private drawShadow(x: Ctx, cx: number, cy: number, R: number) {
    const lift = clamp(-this.oy, 0, 0.4);
    const spread = 1 + lift * 1.6;
    const fade = 1 - lift * 1.6;
    const half = (this.head === "screen" ? 1.12 : 0.9) * R;
    const bottom = this.head === "screen" ? SCREEN_HEAD_BOTTOM : BODY_BOTTOM;
    x.save();
    x.translate(cx + this.ox * R, cy + (bottom + 0.2) * R);
    x.scale(1, 0.13);
    // A gaussian falloff from the centre, as soft shadows have.
    const layer = (r: number, alpha: number) => {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        g.addColorStop(t, `rgba(18,16,28,${(alpha * Math.exp(-Math.pow(t * 2.1, 2))).toFixed(4)})`);
      }
      x.fillStyle = g;
      x.beginPath();
      x.arc(0, 0, r, 0, TAU);
      x.fill();
    };
    layer(half * 1.3 * spread, 0.16 * fade);
    layer(half * 0.8 * spread, 0.2 * fade);
    layer(half * 0.5, 0.34 * fade);
    x.restore();
  }

  private drawGlow(x: Ctx, R: number) {
    const I = this.glowI;
    const studio = this.studioPose;
    const amt = studio ? 1 : this.glowAmount;
    if (I <= 0.01 || amt <= 0.01) return;
    const r1 = R * (studio ? 1.6 : 1.12 + 0.48 * amt) * (0.85 + 0.15 * I);
    const stops = studio ? STUDIO_GLOW_STOPS : GLOW_STOPS;
    // A soft halo carries more of the state's colour than white.
    const tint = studio ? this.tint : clamp(this.tint * 1.6, 0, 1);
    // Cool light spills from the left, warm from the right. The halo is an
    // ellipse raised 0.125 R and squashed to 0.925: as strong above it as at
    // the sides, fading underneath, as in a studio render.
    for (const [dx, base] of [[-0.06, GLOW_COOL], [0.06, GLOW_WARM]] as const) {
      const col = mix(base, this.glowCol, tint);
      x.save();
      x.translate(dx * R, -0.125 * R);
      x.scale(1, 0.925);
      const g = x.createRadialGradient(0, 0, 0.9 * R, 0, 0, r1);
      for (const [o, a] of stops) g.addColorStop(o, rgba(col, a * amt * Math.min(1, I)));
      x.fillStyle = g;
      x.fillRect(-2 * R, -2 * R, 4 * R, 4.5 * R);
      x.restore();
    }
  }

  private drawBody(x: Ctx, body: Path2D, R: number) {
    x.fillStyle = radial(x, 0.45 * R, -0.42 * R, 0, 1.6 * R, BODY_STOPS);
    x.fill(body);

    x.save();
    x.clip(body);
    // Fur is soft-lit, as plush is: no cool shadow side, a lighter underside.
    if (!this.fur) crescent(x, R, 0.35, -0.1, 0.8, 1.4, COOL_SHADE, 0.6); // cool shadow side
    const ao = x.createLinearGradient(0, 0.15 * R, 0, R);
    ao.addColorStop(0, rgba(AO, 0));
    ao.addColorStop(1, rgba(AO, this.fur ? 0.26 : 0.55));
    x.fillStyle = ao;
    // Generous rectangles, with room to spare.
    x.fillRect(-1.6 * R, 0, 3.2 * R, 1.6 * R);
    if (this.tint > 0.01) {
      // The state's colour pools in the underside, so it reads even when small.
      const tg = x.createLinearGradient(0, R, 0, 0);
      tg.addColorStop(0, rgba(this.glowCol, 0.45 * this.tint));
      tg.addColorStop(1, rgba(this.glowCol, 0));
      x.fillStyle = tg;
      x.fillRect(-1.6 * R, 0, 3.2 * R, 1.6 * R);
    }
    // Glossy rim lights belong to its smooth body; fur has its own soft sheen (body).
    if (!this.fur) {
      crescent(x, R, 0.12, 0, 1.0, 1.16, RIM_COOL, 1); // blue rim, left edge
      crescent(x, R, -0.15, 0.25, 1.0, 1.3, RIM_WARM, 0.7); // white rim, top and right
    }
    if (this.color) {
      // Its colour, multiplied in so every bit of light and shade survives;
      // then a little of the gloss back on top.
      x.globalCompositeOperation = "multiply";
      x.fillStyle = this.color;
      x.fill(body);
      x.globalCompositeOperation = "source-over";
      x.fillStyle = radial(x, 0.4 * R, -0.5 * R, 0, 0.9 * R, [
        [0, [255, 255, 255], 0.28],
        [1, [255, 255, 255], 0],
      ]);
      x.fill(body);
    }
    x.restore();
  }

  private drawFace(x: Ctx, R: number, pose: AddonPose | null = null) {
    const a = this.yaw * G.maxYaw;
    const b = this.pitch * G.maxPitch;
    const ca = Math.cos(a);
    const cb = Math.cos(b);
    const ft = faceValues(this.faceTune);
    const fx = Math.sin(a) * this.faceDepth * R;
    const fy = Math.sin(b) * this.faceDepth * R + ft.lift * R;
    const prx = G.plateRx * R * ca * ft.width;
    const pry = G.plateRy * R * cb * ft.height;

    const plate = new Path2D();
    plate.ellipse(fx, fy, prx, pry, 0, 0, TAU);

    if (this.facePlate && !this.plushFace) this.drawPlate(x, R, plate, fx, fy, prx, pry, ft);

    // Features turn about the plate's centre: a tilt, or a full spin when dizzy.
    x.save();
    x.translate(fx, fy);
    x.rotate(this.tilt + this.roll);
    const shape = this.currentEye();
    // Behind the visor its eyes are lit from inside instead of inked.
    const visor = !!pose && this.addons.has("visor");
    const goggles = !visor && !!pose && this.addons.has("goggles");
    if (visor && pose) drawVisorUnder(x, pose);
    if (goggles && pose) drawGogglesUnder(x, pose);
    for (const sd of [-1, 1]) {
      x.save();
      x.translate(sd * G.eyeX * R * ca * ft.eyeSpacing, G.eyeY * R * cb);
      this.drawEye(x, shape, G.eyeW * R * this.es * ca * ft.eyeSize, G.eyeH * R * this.es * cb * ft.eyeSize, sd, R, visor);
      x.restore();
    }
    if (visor && pose) drawVisorOver(x, pose);
    // The goggles go round its own eyes: glass under them, reflections and frame over.
    if (goggles && pose) drawGogglesOver(x, pose);
    this.drawMouth(x, R, ca, cb);
    x.restore();
  }

  /** The inset disc its face sits on, and the groove ring round it (each can be switched off). */
  private drawPlate(
    x: Ctx, R: number, plate: Path2D, fx: number, fy: number, prx: number, pry: number,
    ft: ReturnType<typeof faceValues>,
  ) {
    // Soft contact shade where the body meets the plate, on the shadow side only.
    const cs = x.createLinearGradient(fx + 0.5 * R, fy - 0.6 * R, fx - 0.6 * R, fy + 0.7 * R);
    cs.addColorStop(0, "rgba(20,25,40,0)");
    cs.addColorStop(0.45, `rgba(20,25,40,${Math.min(1, 0.02 * ft.shade)})`);
    cs.addColorStop(1, `rgba(20,25,40,${Math.min(1, 0.09 * ft.shade)})`);
    x.strokeStyle = cs;
    for (const w of [0.12, 0.06]) {
      x.lineWidth = w * R;
      x.stroke(plate);
    }

    // The plate is lit in world space, so turning it slides the plate through the light.
    x.fillStyle = radial(x, 0.6 * R, -0.5 * R, 0, 1.5 * R, PLATE_STOPS);
    x.fill(plate);
    x.save();
    x.clip(plate);
    const ao = x.createLinearGradient(0, fy + 0.2 * R, 0, fy + 0.85 * R);
    ao.addColorStop(0, rgba(AO, 0));
    ao.addColorStop(1, rgba(AO, 0.3));
    x.fillStyle = ao;
    x.fillRect(fx - R, fy, 2 * R, R);
    x.restore();

    if (this.color) {
      // A lighter version of its colour on the plate, so its face still reads.
      x.save();
      x.clip(plate);
      x.globalCompositeOperation = "multiply";
      x.fillStyle = rgba(mix([255, 255, 255], hexRgb(this.color), ft.plateTint));
      x.fill(plate);
      x.restore();
    }

    if (!this.faceRing) return;
    // Groove: a dark seam just outside, a bright lip just inside.
    x.lineWidth = 0.011 * R * ft.ringWeight;
    x.strokeStyle = "rgba(35,40,55,0.17)";
    x.beginPath();
    x.ellipse(fx, fy, prx + 0.004 * R, pry + 0.004 * R, 0, 0, TAU);
    x.stroke();
    x.lineWidth = 0.009 * R * ft.ringWeight;
    x.strokeStyle = "rgba(255,255,255,0.7)";
    x.beginPath();
    x.ellipse(fx, fy, Math.max(0, prx - 0.01 * R), Math.max(0, pry - 0.01 * R), 0, 0, TAU);
    x.stroke();
  }

  private drawEye(x: Ctx, shape: Eye, w: number, h: number, sd: number, R: number, led = false) {
    x.fillStyle = led ? LED_CORE : INK;
    x.strokeStyle = led ? LED_CORE : INK;
    if (led) {
      x.shadowColor = LED_GLOW;
      x.shadowBlur = 0.07 * R;
    }
    x.lineCap = "round";
    x.lineJoin = "round";
    if (shape !== "pill" && shape !== "wide") x.scale(1, Math.max(0.1, this.open));
    const t = now();

    switch (shape) {
      case "wide":
        this.drawEye(x, "pill", w * 1.12, h * 1.1, sd, R, led);
        break;
      case "pill": {
        const hh = Math.max(h * this.open, w * 0.3);
        if (led) {
          // A soft light, a touch narrower than the inked eye, no socket or gloss.
          pill(x, -w * 0.42, -hh * 0.46, w * 0.84, hh * 0.92);
          x.fill();
          break;
        }
        const s = 0.012 * R;
        // Socket: the eye sits in a shallow dimple, shadowed above, lit below.
        const sg = x.createLinearGradient(0, -hh / 2 - s, 0, hh / 2 + s);
        sg.addColorStop(0, "rgba(0,0,0,0.05)");
        sg.addColorStop(1, "rgba(255,255,255,0.5)");
        x.fillStyle = sg;
        pill(x, -w / 2 - s, -hh / 2 - s, w + 2 * s, hh + 2 * s);
        x.fill();
        const eg = x.createLinearGradient(0, -hh / 2, 0, hh / 2);
        eg.addColorStop(0, rgba(INK_TOP));
        eg.addColorStop(1, rgba(INK_BOTTOM));
        x.fillStyle = eg;
        pill(x, -w / 2, -hh / 2, w, hh);
        x.fill();
        if (this.open > 0.5) {
          // Gloss: a faint sheen across the top and a sharp catchlight, top right.
          x.fillStyle = "rgba(255,255,255,0.07)";
          x.beginPath();
          x.ellipse(0, -hh * 0.22, w * 0.32, hh * 0.2, 0, 0, TAU);
          x.fill();
          const r = w * 0.15;
          x.fillStyle = radial(x, w * 0.17, -hh * 0.3, 0, r, [
            [0, WHITE, 0.95], [0.6, WHITE, 0.8], [1, WHITE, 0],
          ]);
          x.beginPath();
          x.arc(w * 0.17, -hh * 0.3, r, 0, TAU);
          x.fill();
        }
        break;
      }
      case "happy":
        x.lineWidth = w * 0.34;
        x.beginPath();
        x.arc(0, h * 0.14, w * 0.72, Math.PI * 1.17, Math.PI * 1.83);
        x.stroke();
        break;
      case "closed":
        x.lineWidth = w * 0.3;
        x.beginPath();
        x.arc(0, -h * 0.1, w * 0.7, Math.PI * 0.17, Math.PI * 0.83);
        x.stroke();
        break;
      case "half":
        // Heavy lids, slanting down toward the nose, over half-moons.
        x.save();
        x.rotate(-sd * 0.1);
        pill(x, -w * 0.95, -w * 0.18, w * 1.9, w * 0.34);
        x.fill();
        x.beginPath();
        x.moveTo(-w * 0.5, 0);
        x.lineTo(w * 0.5, 0);
        x.ellipse(0, 0, w * 0.5, h * 0.3, 0, 0, Math.PI);
        x.closePath();
        x.fill();
        x.restore();
        break;
      case "x":
        x.lineWidth = w * 0.36;
        for (const d of [1, -1]) {
          x.beginPath();
          x.moveTo(-w * 0.62, -w * 0.62 * d);
          x.lineTo(w * 0.62, w * 0.62 * d);
          x.stroke();
        }
        break;
      case "spiral":
        x.lineWidth = w * 0.2;
        x.beginPath();
        for (let a = 0; a < 4.4 * Math.PI; a += 0.2) {
          const r = w * 0.06 + a * w * 0.058;
          const aa = a + t * 9 * sd;
          if (a === 0) x.moveTo(Math.cos(aa) * r, Math.sin(aa) * r);
          else x.lineTo(Math.cos(aa) * r, Math.sin(aa) * r);
        }
        x.stroke();
        break;
      case "heart":
        x.fillStyle = "#FF4D6D";
        heartPath(x, w * 1.25);
        x.fill();
        break;
      case "star":
        x.fillStyle = "#F7B32B";
        x.rotate(t * 1.5 * sd);
        starPath(x, w * 1.05, w * 0.46);
        x.fill();
        break;
      case "wink":
        this.drawEye(x, sd < 0 ? "pill" : "happy", w, h, sd, R, led);
        break;
      case "excited":
        // ">" and "<": squeezed shut with glee.
        x.lineWidth = w * 0.34;
        x.beginPath();
        x.moveTo(sd * w * 0.5, -w * 0.62);
        x.lineTo(-sd * w * 0.45, 0);
        x.lineTo(sd * w * 0.5, w * 0.62);
        x.stroke();
        break;
      case "confused":
        if (sd < 0) {
          x.beginPath();
          x.moveTo(-w * 0.55, 0);
          x.lineTo(w * 0.55, 0);
          x.ellipse(0, 0, w * 0.55, h * 0.3, 0, 0, Math.PI);
          x.closePath();
          x.fill();
        } else {
          x.lineWidth = w * 0.3;
          x.beginPath();
          x.arc(0, -h * 0.2, w * 0.45, Math.PI * 1.08, Math.PI * 2.32);
          x.quadraticCurveTo(0, 0, 0, h * 0.1);
          x.stroke();
          x.beginPath();
          x.arc(0, h * 0.34, w * 0.2, 0, TAU);
          x.fill();
        }
        break;
    }
  }

  private drawMouth(x: Ctx, R: number, ca: number, cb: number) {
    const kind = this.cfg.mouth;
    x.fillStyle = INK;
    if (kind === "flat") {
      pill(x, -0.055 * R * ca, 0.21 * R * cb, 0.11 * R * ca, 0.024 * R);
      x.fill();
      return;
    }
    if (kind !== "talk" && this.mouth < 0.02) return;
    // A "D": flat top, round bottom, opening with its voice.
    const m = this.mouth;
    const mw = R * (0.1 + 0.06 * m) * ca;
    const mh = R * (0.022 + 0.1 * m) * cb;
    const y0 = G.mouthY * R * cb;
    x.beginPath();
    x.moveTo(-mw / 2, y0);
    x.lineTo(mw / 2, y0);
    x.ellipse(0, y0, mw / 2, mh, 0, 0, Math.PI);
    x.closePath();
    x.fill();
    if (m > 0.35) {
      x.save();
      x.clip();
      x.fillStyle = rgba([196, 72, 92], 0.85 * clamp((m - 0.35) * 3, 0, 1));
      x.beginPath();
      x.ellipse(0, y0 + mh, mw * 0.3, mh * 0.45, 0, 0, TAU);
      x.fill();
      x.restore();
    }
  }

  private drawProps(x: Ctx, R: number) {
    const t = now() - this.t0;
    const P = this.props;
    // The screen head's ear pads reach further out: the arcs and bars go round them.
    const k = this.head === "screen" ? 1.2 : 1;
    x.lineCap = "round";

    if (P.arcs > 0) {
      // Listening: sound arcs either side, rippling outward and lifting with the room.
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const r = R * (1.13 * k + i * 0.13);
          const wave = 0.5 + 0.5 * Math.sin(t * 3.2 - i * 0.9);
          const level = clamp(0.35 + 0.65 * Math.max(wave * 0.6, this.room * 1.4 - i * 0.25), 0, 1);
          const alpha = P.arcs * level * (1 - i * 0.22);
          const span = (0.42 - i * 0.05) * P.arcs;
          const mid = side > 0 ? 0 : Math.PI;
          x.lineWidth = R * 0.055;
          x.strokeStyle = rgba([150, 156, 175], 0.9 * alpha);
          x.beginPath();
          x.arc(0, R * 0.012, r, mid - span, mid + span);
          x.stroke();
          x.lineWidth = R * 0.034;
          x.strokeStyle = rgba([252, 252, 255], 0.95 * alpha);
          x.beginPath();
          x.arc(0, -R * 0.006, r, mid - span, mid + span);
          x.stroke();
        }
      }
    }

    if (P.bars > 0) {
      // Speaking: a little level meter to its right, driven by its own voice.
      for (let i = 0; i < 3; i++) {
        const w = R * 0.085;
        const h = R * (0.09 + 0.34 * this.bars[i]) * P.bars;
        const X = R * (1.17 * k + i * 0.15) - w / 2;
        const Y = R * 0.3 - h;
        x.fillStyle = rgba([150, 156, 175], 0.8 * P.bars);
        pill(x, X, Y + R * 0.012, w, h);
        x.fill();
        const g = x.createLinearGradient(X, 0, X + w, 0);
        g.addColorStop(0, rgba([230, 232, 238], P.bars));
        g.addColorStop(1, rgba(WHITE, P.bars));
        x.fillStyle = g;
        pill(x, X, Y, w, h);
        x.fill();
      }
    }

    if (P.bubbles > 0) {
      // Thinking: three bubbles rising up and to the right, one after another.
      const spots: [number, number, number][] = [[0.66, -0.98, 0.065], [0.86, -1.16, 0.095], [1.1, -1.38, 0.135]];
      spots.forEach(([bx, by, br], i) => {
        const p = clamp(P.bubbles * 3 - i, 0, 1);
        if (p <= 0) return;
        const bob = Math.sin(t * 2 + i * 1.3) * 0.02;
        ball(x, bx * R, (by + bob) * R, br * R * Ease.back(p), p);
      });
    }

    // Round the head: wider for the screen head, which is wider than a ball.
    const screen = this.head === "screen";
    const ringX = (screen ? 1.55 : 1.32) * R;
    const ringY = (screen ? 1.26 : 1.3) * R;

    if (P.orbit > 0) {
      // Loading: two comets of light chase each other round the head.
      for (const side of [0, Math.PI]) {
        for (let i = 0; i < 11; i++) {
          const a = t * 2.7 - i * 0.2 + side;
          const k = 1 - i / 11;
          ball(x, Math.cos(a) * ringX, Math.sin(a) * ringY, R * (0.016 + 0.062 * k), P.orbit * (0.2 + 0.8 * k));
        }
      }
    }

    if (P.arc > 0) {
      // Processing: a faint track, and a bright arc running round it.
      x.save();
      x.scale(ringX / ringY, 1);
      const r = ringY;
      x.lineWidth = R * 0.05;
      x.strokeStyle = rgba([150, 156, 175], 0.18 * P.arc);
      x.beginPath();
      x.arc(0, 0, r, 0, TAU);
      x.stroke();
      const a0 = t * 3.4;
      const sweep = 1.5 + 0.5 * Math.sin(t * 1.6);
      for (const [w, col, al] of [[0.06, [150, 156, 175], 0.9], [0.036, [252, 252, 255], 1]] as const) {
        x.lineWidth = R * w;
        x.strokeStyle = rgba(col as RGB, al * P.arc);
        x.beginPath();
        x.arc(0, 0, r, a0, a0 + sweep);
        x.stroke();
      }
      x.restore();
    }

    if (P.dots > 0) {
      // Generating: three dots bounce in turn, as a chat does while it writes.
      for (let i = 0; i < 3; i++) {
        const bx = (screen ? 0.95 : 0.8) * R + i * 0.21 * R;
        const by = -(screen ? 1.12 : 1.02) * R - Math.max(0, Math.sin(t * 6.5 - i * 0.9)) * 0.1 * R;
        ball(x, bx, by, 0.065 * R, P.dots);
      }
    }

    if (P.stress > 0) {
      // Error: three red strain marks at the top right, pulsing.
      const pulse = 1 + 0.12 * Math.sin(t * 10);
      x.save();
      x.translate(0.74 * R, -0.74 * R);
      x.rotate(-Math.PI / 4); // local +x now points out from it, up and to the right
      x.shadowColor = rgba([255, 60, 60], 0.8 * P.stress);
      x.shadowBlur = 0.12 * R;
      x.strokeStyle = rgba([255, 92, 82], P.stress);
      x.lineWidth = 0.065 * R;
      for (const [dy, len] of [[-0.19, 0.13], [0, 0.19], [0.19, 0.13]]) {
        x.beginPath();
        x.moveTo(0.12 * R, dy * R);
        x.lineTo((0.12 + len * pulse * P.stress) * R, dy * 1.35 * R);
        x.stroke();
      }
      x.restore();
    }
  }

  private drawParticles(x: Ctx, R: number) {
    for (const p of this.particles) {
      if (p.age < 0) continue;
      const k = p.age / p.life;
      const px = (p.x + p.vx * p.age) * R;
      const py = (p.y + p.vy * p.age) * R;
      const s = p.size * R * (k < 0.15 ? Ease.back(k / 0.15) : 1);
      x.save();
      x.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      x.translate(px, py);
      switch (p.type) {
        case "heart":
          x.fillStyle = "#FF4D6D";
          heartPath(x, s);
          x.fill();
          break;
        case "star":
          x.rotate(p.rot + p.age * 2);
          x.fillStyle = "#F7B32B";
          starPath(x, s, s * 0.45);
          x.fill();
          break;
        case "spark":
          x.rotate(p.rot);
          x.fillStyle = "#FFFFFF";
          starPath(x, s * 0.7, s * 0.15);
          x.fill();
          break;
        case "z":
          x.fillStyle = "rgba(220,226,240,0.9)";
          x.font = `700 ${Math.round(s * 1.6)}px system-ui, sans-serif`;
          x.textAlign = "center";
          x.textBaseline = "middle";
          x.fillText("z", 0, 0);
          break;
      }
      x.restore();
    }
  }
}
