/**
 * The screen head: a chubby cream helmet with a black glass screen for a
 * face, a rainbow light running round the screen's rim, a little orange horn
 * on top, and dark ear pads with a cyan light down each side.
 *
 * Its expressions are white light on the glass rather than ink: ovals when it
 * is curious, arcs when happy, chevrons when excited, red crosses on an error.
 *
 * It turns as a rounded box does: the screen slides across the front and
 * narrows, the ear on the near side swings in and shows its light, and the
 * horn leans the way the face points. Everything is in R, as in robo.
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
  /** The shell: a squircle, a little wider than tall. */
  w: 1.08,
  h: 0.9,
  n: 2.8,
  /** The screen's half size, corner radius and drop below centre. */
  sw: 0.86,
  sh: 0.6,
  sr: 0.34,
  sy: 0.06,
  /** How far the screen travels across the front as it turns. */
  depth: 0.62,
  /** The turn, in radians at yaw / pitch = ±1: a box can't turn as far as a ball. */
  maxYaw: 0.34,
  maxPitch: 0.26,
  /** Ear pads: centre out from the middle, thickness, depth when side-on, height. */
  earX: 1.13,
  earT: 0.15,
  earD: 0.42,
  earH: 0.8,
  /** The eyes on the screen. */
  eyeX: 0.36,
  eyeY: -0.01,
};

/** Its lowest point, for the floor shadow. */
export const SCREEN_HEAD_BOTTOM = S.h;

const SHELL_STOPS: [number, RGB][] = [
  [0, [255, 253, 248]],
  [0.35, [247, 243, 235]],
  [0.62, [231, 226, 217]],
  [0.88, [204, 198, 189]],
  [1, [178, 172, 165]],
];

/** The rim's light, going clockwise from the right-hand side. */
const RIM: [number, RGB][] = [
  [0, [84, 140, 255]],
  [0.1, [72, 202, 240]],
  [0.2, [118, 226, 140]],
  [0.3, [214, 226, 72]],
  [0.4, [255, 190, 62]],
  [0.5, [255, 78, 72]],
  [0.6, [255, 96, 62]],
  [0.7, [255, 142, 52]],
  [0.8, [255, 188, 62]],
  [0.88, [176, 222, 92]],
  [0.94, [80, 202, 232]],
  [1, [84, 140, 255]],
];

const GLYPH: RGB = [248, 250, 255];
const GLYPH_GLOW: RGB = [205, 228, 255];
const ERROR: RGB = [255, 74, 72];
const LED: RGB = [110, 232, 255];

// ── Paths ────────────────────────────────────────────────────────────────────

let shellCache: { R: number; path: Path2D } | null = null;

function shellPath(R: number): Path2D {
  if (shellCache?.R === R) return shellCache.path;
  const p = new Path2D();
  const e = 2 / S.n;
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * TAU;
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

function rimStyle(x: Ctx, cx: number, cy: number, hw: number): CanvasGradient {
  if ("createConicGradient" in x && typeof x.createConicGradient === "function") {
    const g = x.createConicGradient(0, cx, cy);
    for (const [o, c] of RIM) g.addColorStop(o, rgba(c));
    return g;
  }
  // Without conic gradients: warm on the left, cool on the right.
  const g = x.createLinearGradient(cx - hw, 0, cx + hw, 0);
  g.addColorStop(0, rgba([255, 80, 72]));
  g.addColorStop(0.35, rgba([255, 170, 56]));
  g.addColorStop(0.65, rgba([130, 224, 130]));
  g.addColorStop(1, rgba([84, 140, 255]));
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

  // The ear turning away sits behind the shell; the horn's root is inside it.
  const near = sa > 0 ? -1 : 1;
  drawEar(x, R, -near, a, cb, false);
  drawHorn(x, R, sa);
  drawShell(x, R, p.color, sa, near);
  drawEar(x, R, near, a, cb, true);

  // The screen rides on the front.
  const fx = sa * S.depth * R;
  const fy = (S.sy + Math.sin(b) * 0.5) * R;
  const hw = S.sw * R * ca;
  const hh = S.sh * R * cb;
  const sr = S.sr * R * Math.min(ca, cb);
  drawScreen(x, R, fx, fy, hw, hh, sr);

  const screen = roundRect(fx, fy, hw, hh, sr);
  x.save();
  x.clip(screen);
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
  x.fillStyle = radialAt(x, -0.38 * R, -0.5 * R, 1.75 * R, SHELL_STOPS);
  x.fill(shell);

  x.save();
  x.clip(shell);
  // Soft shade underneath, and on the side turning away.
  const ao = x.createLinearGradient(0, 0.2 * R, 0, S.h * R);
  ao.addColorStop(0, "rgba(70,58,46,0)");
  ao.addColorStop(1, "rgba(70,58,46,0.2)");
  x.fillStyle = ao;
  x.fillRect(-1.3 * R, 0, 2.6 * R, R);
  const far = -near;
  const side = x.createLinearGradient(far * S.w * R, 0, far * (S.w - 0.55) * R, 0);
  side.addColorStop(0, `rgba(80,70,60,${0.1 + 0.25 * Math.abs(sa)})`);
  side.addColorStop(1, "rgba(80,70,60,0)");
  x.fillStyle = side;
  x.fillRect(-1.3 * R, -R, 2.6 * R, 2 * R);
  // The side swinging toward us catches a little more light.
  const lit = x.createLinearGradient(near * S.w * R, 0, near * (S.w - 0.4) * R, 0);
  lit.addColorStop(0, `rgba(255,255,255,${0.5 * Math.abs(sa)})`);
  lit.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = lit;
  x.fillRect(-1.3 * R, -R, 2.6 * R, 2 * R);

  if (color) {
    x.globalCompositeOperation = "multiply";
    x.fillStyle = rgba(color);
    x.fill(shell);
    x.globalCompositeOperation = "source-over";
  }
  // A broad, soft sheen high on the left: matte plastic, not gloss.
  x.fillStyle = radialAt(x, -0.42 * R, -0.62 * R, 0.55 * R, [
    [0, [255, 255, 255]],
    [1, [255, 255, 255]],
  ], [0.55, 0]);
  x.fillRect(-1.3 * R, -R, 2.6 * R, 2 * R);
  x.restore();

  // A faint edge, so a cream head reads on a white page.
  x.lineWidth = 0.012 * R;
  x.strokeStyle = "rgba(120,108,96,0.18)";
  x.stroke(shell);
}

function drawHorn(x: Ctx, R: number, sa: number) {
  const dx = -0.025 + sa * 0.26;
  const p = new Path2D();
  const u = (v: number) => v * R;
  p.moveTo(u(-0.16), u(-0.8));
  p.bezierCurveTo(u(-0.16), u(-0.96), u(dx - 0.1), u(-1.08), u(dx - 0.04), u(-1.13));
  p.bezierCurveTo(u(dx + 0.01), u(-1.17), u(dx + 0.08), u(-1.16), u(dx + 0.09), u(-1.09));
  p.bezierCurveTo(u(dx + 0.1), u(-1.02), u(0.16), u(-0.96), u(0.16), u(-0.8));
  p.closePath();
  const g = x.createLinearGradient(u(-0.15), 0, u(0.15 + dx * 0.5), 0);
  g.addColorStop(0, "rgb(255,216,96)");
  g.addColorStop(0.5, "rgb(255,176,46)");
  g.addColorStop(1, "rgb(236,132,30)");
  x.fillStyle = g;
  x.fill(p);
  x.save();
  x.clip(p);
  x.fillStyle = radialAt(x, u(-0.05 + dx * 0.4), u(-1.0), u(0.12), [
    [0, [255, 246, 200]],
    [1, [255, 246, 200]],
  ], [0.75, 0]);
  x.fillRect(u(-0.3), u(-1.3), u(0.6), u(0.6));
  x.restore();
}

/** One ear pad; the near one shows its outer face and its light as it turns toward us. */
function drawEar(x: Ctx, R: number, s: number, a: number, cb: number, nearSide: boolean) {
  const ca = Math.cos(a);
  const face = nearSide ? Math.abs(Math.sin(a)) : 0;
  const w = (S.earT * ca + S.earD * face) * R;
  const h = S.earH * R * cb;
  const cx = s * (S.earX * ca - (S.earD / 2) * face * 0.35) * R;
  const cy = 0.05 * R;
  const pad = roundRect(cx, cy, w / 2, h / 2, Math.min(w / 2, 0.16 * R));
  const g = x.createLinearGradient(cx + s * (w / 2), 0, cx - s * (w / 2), 0);
  g.addColorStop(0, "rgb(26,27,32)");
  g.addColorStop(0.6, "rgb(44,46,54)");
  g.addColorStop(1, "rgb(70,73,84)");
  x.fillStyle = g;
  x.fill(pad);
  // A soft top light on the rubber.
  x.save();
  x.clip(pad);
  const top = x.createLinearGradient(0, cy - h / 2, 0, cy);
  top.addColorStop(0, "rgba(255,255,255,0.14)");
  top.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = top;
  x.fill(pad);
  x.restore();

  if (face < 0.03) return;
  // The light: a cyan pill down the middle of the pad's outer face.
  const k = clamp(face / 0.3, 0, 1);
  const lw = 0.065 * R * k;
  const lh = h * 0.6;
  const lx = cx + s * 0.02 * R * k;
  x.save();
  x.shadowColor = rgba(LED, 0.9);
  x.shadowBlur = 0.12 * R;
  x.fillStyle = rgba(LED, 0.95);
  x.fill(roundRect(lx, cy, lw / 2, lh / 2, lw / 2));
  x.shadowBlur = 0;
  x.fillStyle = "rgba(235,252,255,0.9)";
  x.fill(roundRect(lx, cy, lw / 5, lh / 2 - lw / 3, lw / 5));
  x.restore();
}

function drawScreen(x: Ctx, R: number, fx: number, fy: number, hw: number, hh: number, sr: number) {
  // The screen sits in a shallow recess: shade above, a pale lip below.
  const lip = 0.045 * R;
  const recess = roundRect(fx, fy, hw + lip, hh + lip, sr + lip);
  const rg = x.createLinearGradient(0, fy - hh - lip, 0, fy + hh + lip);
  rg.addColorStop(0, "rgba(96,84,72,0.42)");
  rg.addColorStop(0.5, "rgba(140,128,116,0.25)");
  rg.addColorStop(1, "rgba(255,255,255,0.75)");
  x.fillStyle = rg;
  x.fill(recess);

  const screen = roundRect(fx, fy, hw, hh, sr);
  const glass = x.createLinearGradient(0, fy - hh, 0, fy + hh);
  glass.addColorStop(0, "rgb(28,28,34)");
  glass.addColorStop(0.45, "rgb(10,10,13)");
  glass.addColorStop(1, "rgb(4,4,6)");
  x.fillStyle = glass;
  x.fill(screen);

  x.save();
  x.clip(screen);
  // The rim light, in layers: a wide faint bloom, a softer band, a bright core.
  const inset = 0.055 * R;
  const rim = roundRect(fx, fy, hw - inset, hh - inset, Math.max(0, sr - inset));
  const style = rimStyle(x, fx, fy, hw);
  x.strokeStyle = style;
  for (const [w, al] of [[0.24, 0.1], [0.13, 0.24], [0.07, 0.6], [0.042, 1]] as const) {
    x.globalAlpha = al;
    x.lineWidth = w * R;
    x.stroke(rim);
  }
  x.globalAlpha = 0.45;
  x.lineWidth = 0.01 * R;
  x.strokeStyle = "rgb(255,255,255)";
  x.stroke(rim);
  x.globalAlpha = 1;
  // A faint reflection across the glass, high on the left.
  x.fillStyle = radialAt(x, fx - hw * 0.45, fy - hh * 0.75, hw * 0.9, [
    [0, [255, 255, 255]],
    [1, [255, 255, 255]],
  ], [0.07, 0]);
  x.fill(screen);
  x.restore();

  // The glass's own dark edge, just outside the rim.
  x.lineWidth = 0.012 * R;
  x.strokeStyle = "rgba(0,0,0,0.6)";
  x.stroke(screen);
}

function radialAt(
  x: Ctx, cx: number, cy: number, r: number, stops: [number, RGB][], alphas?: number[],
): CanvasGradient {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach(([o, c], i) => g.addColorStop(o, rgba(c, alphas ? alphas[i] : 1)));
  return g;
}

// ── The face on the glass ────────────────────────────────────────────────────

function light(x: Ctx, R: number, c: RGB = GLYPH, glow: RGB = GLYPH_GLOW) {
  x.fillStyle = rgba(c);
  x.strokeStyle = rgba(c);
  x.shadowColor = rgba(glow, 0.85);
  x.shadowBlur = 0.09 * R;
  x.lineCap = "round";
  x.lineJoin = "round";
}

function drawGlyphs(x: Ctx, R: number, p: ScreenPose) {
  light(x, R);
  const ex = S.eyeX * R;
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * ex, 0);
    drawEye(x, R, p.glyph, sd, p);
    x.restore();
  }
  drawMouth(x, R, p);
}

function oval(x: Ctx, rx: number, ry: number) {
  x.beginPath();
  x.ellipse(0, 0, rx, Math.max(ry, 0.006), 0, 0, TAU);
  x.fill();
}

/** A half-moon, flat on top: a sad or a sleepy eye. */
function halfMoon(x: Ctx, R: number, dy: number, rx: number, ry: number) {
  x.beginPath();
  x.moveTo(-rx * R, dy * R);
  x.lineTo(rx * R, dy * R);
  x.ellipse(0, dy * R, rx * R, ry * R, 0, 0, Math.PI);
  x.closePath();
  x.fill();
}

function drawEye(x: Ctx, R: number, g: ScreenGlyph, sd: number, p: ScreenPose) {
  const open = Math.max(0.06, p.open);
  switch (g) {
    case "pill":
      oval(x, 0.105 * R * p.es, 0.15 * R * p.es * open);
      break;
    case "wide":
      oval(x, 0.118 * R * p.es, 0.19 * R * p.es * open);
      break;
    case "happy":
      x.lineWidth = 0.07 * R;
      x.beginPath();
      x.arc(0, 0.08 * R, 0.13 * R, Math.PI * 1.1, Math.PI * 1.9);
      x.stroke();
      break;
    case "closed":
      x.lineWidth = 0.05 * R;
      x.beginPath();
      x.arc(0, -0.03 * R, 0.1 * R, Math.PI * 0.18, Math.PI * 0.82);
      x.stroke();
      break;
    case "half":
      halfMoon(x, R, -0.05, 0.14, 0.12 * open);
      break;
    case "excited": {
      // ">" on the left, "<" on the right: squeezed shut with glee.
      const d = -sd;
      x.lineWidth = 0.066 * R;
      x.beginPath();
      x.moveTo(-d * 0.085 * R, -0.115 * R);
      x.lineTo(d * 0.08 * R, 0);
      x.lineTo(-d * 0.085 * R, 0.115 * R);
      x.stroke();
      break;
    }
    case "think":
      if (sd < 0) halfMoon(x, R, 0, 0.12, 0.1 * open);
      else {
        // One eye looks up under a raised brow.
        oval(x, 0.085 * R, 0.11 * R * open);
        x.lineWidth = 0.05 * R;
        x.beginPath();
        x.arc(0, 0.03 * R, 0.15 * R, Math.PI * 1.2, Math.PI * 1.8);
        x.stroke();
      }
      break;
    case "confused":
      if (sd < 0) halfMoon(x, R, 0, 0.12, 0.1 * open);
      else {
        x.lineWidth = 0.062 * R;
        x.beginPath();
        x.arc(0, -0.075 * R, 0.082 * R, Math.PI * 1.08, Math.PI * 2.32);
        x.quadraticCurveTo(0, 0.0, 0, 0.05 * R);
        x.stroke();
        x.beginPath();
        x.arc(0, 0.14 * R, 0.037 * R, 0, TAU);
        x.fill();
      }
      break;
    case "x":
      x.save();
      light(x, R, ERROR, [255, 60, 60]);
      x.lineWidth = 0.075 * R;
      for (const d of [1, -1]) {
        x.beginPath();
        x.moveTo(-0.095 * R, -0.095 * R * d);
        x.lineTo(0.095 * R, 0.095 * R * d);
        x.stroke();
      }
      x.restore();
      break;
    case "spiral":
      x.lineWidth = 0.035 * R;
      x.beginPath();
      for (let t = 0; t < 4.4 * Math.PI; t += 0.2) {
        const r = 0.01 * R + t * 0.0095 * R;
        const aa = t + p.t * 9 * sd;
        if (t === 0) x.moveTo(Math.cos(aa) * r, Math.sin(aa) * r);
        else x.lineTo(Math.cos(aa) * r, Math.sin(aa) * r);
      }
      x.stroke();
      break;
    case "heart": {
      x.save();
      light(x, R, [255, 92, 138], [255, 70, 120]);
      const s = 0.19 * R;
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
        const r = (i % 2 ? 0.065 : 0.15) * R;
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
  // A small lit bar under the eyes that opens with its voice.
  const m = p.mouth;
  const w = (0.07 + 0.07 * m) * R;
  const h = (0.012 + 0.06 * m) * R;
  x.fill(roundRect(0, 0.235 * R, w, h, h));
}
