/**
 * The screen head: a chubby cream helmet with a black glass screen for a
 * face, a rainbow light running round the inside of the screen's rim, a
 * little yellow fin on top, and dark ear pads with a cyan light down each side.
 *
 * Its expressions are white light on the glass rather than ink, each drawn to
 * the reference sheet: fat ovals when curious, taller ones when surprised,
 * thick arches when happy, chevrons when excited, heavy-lidded half-moons
 * when sad, a raised brow when thinking, a question mark when confused, and
 * coral crosses on an error.
 *
 * It turns as a rounded box does: the screen slides across the front and
 * narrows, the side swinging toward us shows its cool shade and its ear
 * light, and the fin leans the way the face points. Everything is in R, as
 * in robo.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type RGB = [number, number, number];

/** What the screen can show. Most are the engine's eyes; "think" is the screen's own. */
export type ScreenGlyph =
  | "pill" | "wide" | "happy" | "closed" | "half" | "x" | "spiral" | "heart" | "star" | "wink"
  | "excited" | "confused" | "think";

export interface ScreenPose {
  /** Where it faces, -1…1. */
  yaw: number;
  pitch: number;
  /** A lean of the whole head, and a spin of just the face (dizzy), in radians. */
  tilt: number;
  roll: number;
  /** Eyelids, 0 shut … 1 open; and an eye-size pulse, 1 at rest. */
  open: number;
  es: number;
  glyph: ScreenGlyph;
  /** How far its mouth is open, 0…1, and whether it is talking at all. */
  mouth: number;
  talking: boolean;
  /** A colour for the shell, or null for its own cream. */
  color: RGB | null;
  /** Seconds, for anything that spins. */
  t: number;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1)})`;

// ── Geometry (in R) ──────────────────────────────────────────────────────────

const S = {
  /** The shell: a squircle, a little wider than tall, with a domed top. */
  w: 1.06,
  h: 0.94,
  n: 2.8,
  /** The screen's half size, corner radius and drop below centre. */
  sw: 0.88,
  sh: 0.66,
  sr: 0.35,
  sy: 0.07,
  /** How far the screen travels across the front as it turns. */
  depth: 0.62,
  /** The turn, in radians at yaw / pitch = ±1: a box can't turn as far as a ball. */
  maxYaw: 0.36,
  maxPitch: 0.26,
  /** Ear pads: centre out from the middle, thickness, depth when side-on, height. */
  earX: 1.1,
  earT: 0.14,
  earD: 0.3,
  earH: 0.74,
  /** Eye centres, either side of the screen's middle. */
  eyeX: 0.36,
  eyeY: 0.02,
};

/** Its lowest point, for the floor shadow. */
export const SCREEN_HEAD_BOTTOM = S.h;

const SHELL_STOPS: [number, RGB][] = [
  [0, [255, 254, 250]],
  [0.35, [248, 245, 239]],
  [0.62, [234, 230, 223]],
  [0.86, [210, 205, 199]],
  [1, [186, 181, 178]],
];
/** The side of the shell is in cool shade: a soft lavender grey. */
const SIDE_SHADE: RGB = [178, 170, 206];

/**
 * The rim's light, clockwise from the right-hand side: cyan and blue down the
 * right, through green and yellow along the bottom, red up the left, orange
 * across the top (a little dimmer in the middle), a pale glint at top right.
 */
const RIM: [number, RGB, number][] = [
  [0, [70, 182, 255], 1],
  [0.09, [86, 118, 255], 1],
  [0.17, [70, 196, 238], 1],
  [0.24, [106, 222, 128], 1],
  [0.31, [206, 228, 70], 1],
  [0.38, [255, 204, 60], 1],
  [0.44, [255, 140, 48], 1],
  [0.5, [255, 66, 62], 1],
  [0.6, [255, 82, 56], 1],
  [0.68, [255, 128, 42], 1],
  [0.76, [255, 160, 50], 0.7],
  [0.84, [255, 214, 120], 0.8],
  [0.89, [236, 248, 255], 0.9],
  [0.94, [96, 214, 244], 1],
  [1, [70, 182, 255], 1],
];

const GLYPH: RGB = [255, 255, 255];
const BLOOM: RGB = [220, 236, 255];
const CORAL: RGB = [242, 92, 92];
const LED: RGB = [104, 230, 255];

// ── Paths ────────────────────────────────────────────────────────────────────

let shellCache: { R: number; path: Path2D } | null = null;

function shellPath(R: number): Path2D {
  if (shellCache?.R === R) return shellCache.path;
  const p = new Path2D();
  const e = 2 / S.n;
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const X = Math.sign(c) * Math.pow(Math.abs(c), e) * S.w * R;
    const Y = Math.sign(s) * Math.pow(Math.abs(s), e) * S.h * R;
    if (i === 0) p.moveTo(X, Y);
    else p.lineTo(X, Y);
  }
  p.closePath();
  shellCache = { R, path: p };
  return p;
}

function roundRect(cx: number, cy: number, hw: number, hh: number, r: number): Path2D {
  const p = new Path2D();
  const rr = clamp(r, 0, Math.min(hw, hh));
  const x0 = cx - hw;
  const y0 = cy - hh;
  const x1 = cx + hw;
  const y1 = cy + hh;
  p.moveTo(x0 + rr, y0);
  p.arcTo(x1, y0, x1, y1, rr);
  p.arcTo(x1, y1, x0, y1, rr);
  p.arcTo(x0, y1, x0, y0, rr);
  p.arcTo(x0, y0, x1, y0, rr);
  p.closePath();
  return p;
}

function radialAt(
  x: Ctx, cx: number, cy: number, r: number, stops: [number, RGB][], alphas?: number[],
): CanvasGradient {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach(([o, c], i) => g.addColorStop(o, rgba(c, alphas ? alphas[i] : 1)));
  return g;
}

function rimStyle(x: Ctx, cx: number, cy: number, hw: number): CanvasGradient {
  if ("createConicGradient" in x && typeof x.createConicGradient === "function") {
    const g = x.createConicGradient(0, cx, cy);
    for (const [o, c, a] of RIM) g.addColorStop(o, rgba(c, a));
    return g;
  }
  // Without conic gradients: warm on the left, cool on the right.
  const g = x.createLinearGradient(cx - hw, 0, cx + hw, 0);
  g.addColorStop(0, rgba([255, 66, 62]));
  g.addColorStop(0.35, rgba([255, 160, 50]));
  g.addColorStop(0.65, rgba([106, 222, 128]));
  g.addColorStop(1, rgba([70, 182, 255]));
  return g;
}

// ── Draw ─────────────────────────────────────────────────────────────────────

/** Draws the whole head centred on the current origin, with radius R. */
export function drawScreenHead(x: Ctx, R: number, p: ScreenPose) {
  const a = p.yaw * S.maxYaw;
  const b = p.pitch * S.maxPitch;
  const ca = Math.cos(a);
  const cb = Math.cos(b);
  const sa = Math.sin(a);

  x.save();
  x.rotate(p.tilt * 0.6);

  // The side swinging toward us; the far ear is behind the shell, the fin's root inside it.
  const near = sa > 0 ? -1 : 1;
  drawEar(x, R, -near, a, cb, false);
  drawFin(x, R, sa);
  drawShell(x, R, p.color, sa, near);
  drawEar(x, R, near, a, cb, true);

  // The screen rides on the front.
  const fx = sa * S.depth * R;
  const fy = (S.sy + Math.sin(b) * 0.5) * R;
  const hw = S.sw * R * ca;
  const hh = S.sh * R * cb;
  const sr = S.sr * R * Math.min(ca, cb);
  drawScreen(x, R, fx, fy, hw, hh, sr);

  x.save();
  x.clip(roundRect(fx, fy, hw, hh, sr));
  // The face looks a touch further than the head turns, so it reads as a glance.
  x.translate(fx + p.yaw * 0.05 * R, fy + (S.eyeY + p.pitch * 0.04) * R);
  x.scale(ca, cb);
  x.rotate(p.roll);
  drawGlyphs(x, R, p);
  x.restore();

  x.restore();
}

function drawShell(x: Ctx, R: number, color: RGB | null, sa: number, near: number) {
  const shell = shellPath(R);
  x.fillStyle = radialAt(x, -0.3 * R, -0.52 * R, 1.8 * R, SHELL_STOPS);
  x.fill(shell);

  x.save();
  x.clip(shell);
  // Soft shade underneath.
  const ao = x.createLinearGradient(0, 0.25 * R, 0, S.h * R);
  ao.addColorStop(0, "rgba(90,78,70,0)");
  ao.addColorStop(1, "rgba(90,78,70,0.16)");
  x.fillStyle = ao;
  x.fillRect(-1.3 * R, 0, 2.6 * R, R);
  // Both edges roll away from the light, always a little; the near side,
  // swinging round to face us, shows a band of cool lavender shade.
  const k = Math.abs(sa) / Math.sin(S.maxYaw);
  for (const side of [-1, 1]) {
    const reach = side === near ? 0.3 + 0.35 * k : 0.28;
    const alpha = side === near ? 0.32 + 0.45 * k : 0.3;
    const g = x.createLinearGradient(side * S.w * R, 0, side * (S.w - reach) * R, 0);
    g.addColorStop(0, rgba(SIDE_SHADE, alpha));
    g.addColorStop(1, rgba(SIDE_SHADE, 0));
    x.fillStyle = g;
    x.fillRect(-1.3 * R, -R, 2.6 * R, 2 * R);
  }

  if (color) {
    x.globalCompositeOperation = "multiply";
    x.fillStyle = rgba(color);
    x.fill(shell);
    x.globalCompositeOperation = "source-over";
  }
  // A broad, soft sheen across the top: matte plastic, not gloss.
  x.fillStyle = radialAt(x, -0.25 * R, -0.7 * R, 0.75 * R, [
    [0, [255, 255, 255]],
    [1, [255, 255, 255]],
  ], [0.6, 0]);
  x.fillRect(-1.3 * R, -R, 2.6 * R, 2 * R);
  x.restore();

  // A faint edge, so a cream head reads on a white page.
  x.lineWidth = 0.01 * R;
  x.strokeStyle = "rgba(110,100,110,0.16)";
  x.stroke(shell);
}

/** The fin on top: a rounded, fat little fin whose tip leans the way the face points. */
function drawFin(x: Ctx, R: number, sa: number) {
  const k = sa / Math.sin(S.maxYaw);
  const tip = 0.2 * k;
  // It sits a little forward on the crown, so it moves toward the face as the head turns.
  x.save();
  x.translate(0.16 * k * R, 0);
  const u = (v: number) => v * R;
  const p = new Path2D();
  p.moveTo(u(-0.21), u(-0.8));
  // The back edge rises gently, the front edge is steeper, the top is round.
  p.bezierCurveTo(u(-0.21), u(-0.96), u(tip - 0.12), u(-1.09), u(tip - 0.03), u(-1.13));
  p.bezierCurveTo(u(tip + 0.04), u(-1.16), u(tip + 0.12), u(-1.15), u(tip + 0.13), u(-1.08));
  p.bezierCurveTo(u(tip + 0.14), u(-1.0), u(0.19), u(-0.94), u(0.19), u(-0.8));
  p.closePath();
  const g = x.createLinearGradient(0, u(-1.12), u(0.08), u(-0.82));
  g.addColorStop(0, "rgb(255,232,120)");
  g.addColorStop(0.5, "rgb(255,210,64)");
  g.addColorStop(1, "rgb(246,176,42)");
  x.fillStyle = g;
  x.fill(p);
  x.save();
  x.clip(p);
  x.fillStyle = radialAt(x, u(tip - 0.06), u(-1.03), u(0.11), [
    [0, [255, 248, 210]],
    [1, [255, 248, 210]],
  ], [0.85, 0]);
  x.fillRect(u(-0.4), u(-1.3), u(0.8), u(0.6));
  x.restore();
  x.restore();
}

/** One ear pad; the near one shows its outer face and its light as it turns toward us. */
function drawEar(x: Ctx, R: number, s: number, a: number, cb: number, nearSide: boolean) {
  const ca = Math.cos(a);
  const sa = Math.abs(Math.sin(a));
  const face = nearSide ? sa : 0;
  const w = (S.earT * ca + S.earD * face) * R;
  const h = S.earH * R * cb;
  // The far ear swings round behind the shell; the near one in over its side.
  const cx = s * (S.earX * ca - (nearSide ? 0.32 * face : 0.9 * sa)) * R;
  const cy = 0.06 * R;
  const pad = roundRect(cx, cy, w / 2, h / 2, Math.min(w / 2, 0.15 * R));
  const g = x.createLinearGradient(cx + s * (w / 2), 0, cx - s * (w / 2), 0);
  g.addColorStop(0, "rgb(24,25,30)");
  g.addColorStop(0.6, "rgb(42,44,52)");
  g.addColorStop(1, "rgb(66,69,80)");
  x.fillStyle = g;
  x.fill(pad);
  x.save();
  x.clip(pad);
  const top = x.createLinearGradient(0, cy - h / 2, 0, cy);
  top.addColorStop(0, "rgba(255,255,255,0.16)");
  top.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = top;
  x.fill(pad);
  x.restore();

  if (face < 0.03) return;
  // The light: a cyan pill down the middle of the pad's outer face.
  const k = clamp(face / 0.3, 0, 1);
  const lw = 0.07 * R * k;
  const lh = h * 0.62;
  x.save();
  x.shadowColor = rgba(LED, 0.9);
  x.shadowBlur = 0.14 * R;
  x.fillStyle = rgba(LED, 0.95);
  x.fill(roundRect(cx, cy, lw / 2, lh / 2, lw / 2));
  x.shadowBlur = 0;
  x.fillStyle = "rgba(232,252,255,0.9)";
  x.fill(roundRect(cx, cy, lw / 5, lh / 2 - lw / 3, lw / 5));
  x.restore();
}

function drawScreen(x: Ctx, R: number, fx: number, fy: number, hw: number, hh: number, sr: number) {
  // The screen sits in a shallow recess: the shell's lip in shade above, catching light below.
  const lip = 0.05 * R;
  const recess = roundRect(fx, fy, hw + lip, hh + lip, sr + lip);
  const rg = x.createLinearGradient(0, fy - hh - lip, 0, fy + hh + lip);
  rg.addColorStop(0, "rgba(98,88,96,0.42)");
  rg.addColorStop(0.5, "rgba(150,140,150,0.2)");
  rg.addColorStop(1, "rgba(255,255,255,0.8)");
  x.fillStyle = rg;
  x.fill(recess);

  const screen = roundRect(fx, fy, hw, hh, sr);
  const glass = x.createLinearGradient(0, fy - hh, 0, fy + hh);
  glass.addColorStop(0, "rgb(20,20,24)");
  glass.addColorStop(0.4, "rgb(7,7,9)");
  glass.addColorStop(1, "rgb(3,3,4)");
  x.fillStyle = glass;
  x.fill(screen);

  x.save();
  x.clip(screen);
  // The rim light sits just inside the glass's black edge: a crisp line that
  // blooms inward and fades into the black.
  const inset = 0.042 * R;
  const rim = roundRect(fx, fy, hw - inset, hh - inset, Math.max(0, sr - inset));
  x.strokeStyle = rimStyle(x, fx, fy, hw);
  for (const [w, al] of [[0.19, 0.1], [0.1, 0.28], [0.06, 0.62], [0.036, 1]] as const) {
    x.globalAlpha = al;
    x.lineWidth = w * R;
    x.stroke(rim);
  }
  // A hot white core keeps the line crisp.
  x.globalAlpha = 0.4;
  x.lineWidth = 0.008 * R;
  x.strokeStyle = "rgb(255,255,255)";
  x.stroke(rim);
  x.globalAlpha = 1;
  // A soft reflection on the glass, high on the left.
  x.fillStyle = radialAt(x, fx - hw * 0.35, fy - hh * 0.85, hw * 0.95, [
    [0, [255, 255, 255]],
    [1, [255, 255, 255]],
  ], [0.08, 0]);
  x.fill(screen);
  x.restore();

  x.lineWidth = 0.012 * R;
  x.strokeStyle = "rgba(0,0,0,0.6)";
  x.stroke(screen);
}

// ── The face on the glass ────────────────────────────────────────────────────
//
// Sizes are from the reference sheet, measured against the screen: an eye is
// about a sixth of the screen's width, strokes about a twentieth.

function light(x: Ctx, R: number, c: RGB = GLYPH, glow: RGB = BLOOM) {
  x.fillStyle = rgba(c);
  x.strokeStyle = rgba(c);
  x.shadowColor = rgba(glow, 0.7);
  x.shadowBlur = 0.06 * R;
  x.lineCap = "round";
  x.lineJoin = "round";
}

const STROKE = 0.084;

/** Glyphs are drawn at this size; the numbers below are at 1. */
const GLYPH_SCALE = 1.1;

function drawGlyphs(x: Ctx, R0: number, p: ScreenPose) {
  const R = R0 * GLYPH_SCALE;
  light(x, R);
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * S.eyeX * R0, 0);
    drawEye(x, R, p.glyph, sd, p);
    x.restore();
  }
  drawMouth(x, R0, p);
}

function oval(x: Ctx, R: number, rx: number, ry: number, dy = 0) {
  x.beginPath();
  x.ellipse(0, dy * R, rx * R, Math.max(ry * R, 0.01 * R), 0, 0, TAU);
  x.fill();
}

/**
 * A heavy-lidded eye: a flat lid over a round bottom, the lid sloping down
 * toward the middle of the face (`sd` is which eye).
 */
function lidded(x: Ctx, R: number, sd: number, dy: number, rx: number, ry: number, slope: number) {
  x.save();
  x.translate(0, dy * R);
  x.rotate(-sd * slope);
  // The lid's two corners are softly rounded, so it reads tired rather than cross.
  const c = Math.min(0.035, rx * 0.25, ry * 0.4) * R;
  x.beginPath();
  x.moveTo(-rx * R + c, 0);
  x.lineTo(rx * R - c, 0);
  x.quadraticCurveTo(rx * R, 0, rx * R, c);
  x.ellipse(0, 0, rx * R, ry * R, 0, Math.asin(Math.min(1, c / (ry * R))), Math.PI - Math.asin(Math.min(1, c / (ry * R))));
  x.quadraticCurveTo(-rx * R, 0, -rx * R + c, 0);
  x.closePath();
  x.fill();
  x.restore();
}

function drawEye(x: Ctx, R: number, g: ScreenGlyph, sd: number, p: ScreenPose) {
  const open = Math.max(0.06, p.open);
  x.lineWidth = STROKE * R;
  switch (g) {
    case "pill":
      // Curious: fat, nearly round ovals.
      oval(x, R, 0.14 * p.es, 0.168 * p.es * open);
      break;
    case "wide":
      // Surprised: the same width, taller.
      oval(x, R, 0.138 * p.es, 0.192 * p.es * open);
      break;
    case "happy":
      // A thick arch, a full half circle, its feet on the eye line.
      x.lineWidth = 0.1 * R;
      x.beginPath();
      x.arc(0, 0.08 * R, 0.125 * R, Math.PI, TAU);
      x.stroke();
      break;
    case "closed":
      x.beginPath();
      x.arc(0, -0.02 * R, 0.12 * R, Math.PI * 0.12, Math.PI * 0.88);
      x.stroke();
      break;
    case "half":
      // Sad: deep half-moons under flat lids that slope toward the middle.
      lidded(x, R, sd, -0.07, 0.16 * Math.min(1, open * 1.4), 0.2 * open, 0.07);
      break;
    case "excited": {
      // ">" on the left, "<" on the right: squeezed shut with glee.
      const d = -sd;
      x.beginPath();
      x.moveTo(-d * 0.1 * R, -0.12 * R);
      x.lineTo(d * 0.1 * R, 0);
      x.lineTo(-d * 0.1 * R, 0.12 * R);
      x.stroke();
      break;
    }
    case "think":
      if (sd < 0) {
        // A low, sleepy half-moon.
        lidded(x, R, sd, 0.03, 0.155, 0.17 * open, 0.08);
      } else {
        // A tall eye looking up, under a raised brow.
        oval(x, R, 0.125, 0.19 * open, 0.03);
        // The brow floats clear of the eye: a short, thick, gently arched stroke.
        x.lineWidth = 0.07 * R;
        x.beginPath();
        x.moveTo(-0.12 * R, -0.27 * R);
        x.quadraticCurveTo(0, -0.335 * R, 0.12 * R, -0.28 * R);
        x.stroke();
      }
      break;
    case "confused":
      if (sd < 0) {
        lidded(x, R, sd, 0.05, 0.155, 0.17 * open, 0.06);
      } else {
        // A big, bold question mark: a round hook, a short stem, a dot.
        x.beginPath();
        x.arc(0, -0.14 * R, 0.1 * R, Math.PI * 0.98, Math.PI * 2.32);
        x.quadraticCurveTo(0, -0.03 * R, 0, 0.04 * R);
        x.lineTo(0, 0.09 * R);
        x.stroke();
        x.beginPath();
        x.arc(0, 0.215 * R, 0.05 * R, 0, TAU);
        x.fill();
      }
      break;
    case "x":
      x.save();
      light(x, R, CORAL, [255, 80, 80]);
      x.lineWidth = 0.09 * R;
      for (const d of [1, -1]) {
        x.beginPath();
        x.moveTo(-0.13 * R, -0.13 * R * d);
        x.lineTo(0.13 * R, 0.13 * R * d);
        x.stroke();
      }
      x.restore();
      break;
    case "spiral":
      x.lineWidth = 0.045 * R;
      x.beginPath();
      for (let t = 0; t < 4.4 * Math.PI; t += 0.2) {
        const r = 0.012 * R + t * 0.011 * R;
        const aa = t + p.t * 9 * sd;
        if (t === 0) x.moveTo(Math.cos(aa) * r, Math.sin(aa) * r);
        else x.lineTo(Math.cos(aa) * r, Math.sin(aa) * r);
      }
      x.stroke();
      break;
    case "heart": {
      x.save();
      light(x, R, [255, 92, 138], [255, 70, 120]);
      const s = 0.22 * R;
      x.beginPath();
      x.moveTo(0, s * 0.38);
      x.bezierCurveTo(-s * 1.05, -s * 0.15, -s * 0.5, -s * 0.95, 0, -s * 0.38);
      x.bezierCurveTo(s * 0.5, -s * 0.95, s * 1.05, -s * 0.15, 0, s * 0.38);
      x.closePath();
      x.fill();
      x.restore();
      break;
    }
    case "star": {
      x.save();
      light(x, R, [255, 204, 70], [255, 180, 40]);
      x.rotate(p.t * 1.5 * sd);
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = (i % 2 ? 0.075 : 0.17) * R;
        const t = -Math.PI / 2 + (i * Math.PI) / 5;
        x.lineTo(Math.cos(t) * r, Math.sin(t) * r);
      }
      x.closePath();
      x.fill();
      x.restore();
      break;
    }
    case "wink":
      drawEye(x, R, sd < 0 ? "pill" : "happy", sd, p);
      break;
  }
}

function drawMouth(x: Ctx, R: number, p: ScreenPose) {
  if (!p.talking && p.mouth < 0.02) return;
  // While it talks, a small lit bar under the eyes opens with its voice.
  const m = p.mouth;
  const w = (0.07 + 0.07 * m) * R;
  const h = (0.014 + 0.06 * m) * R;
  x.fill(roundRect(0, 0.29 * R, w, h, h));
}
