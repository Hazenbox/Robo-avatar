/**
 * The screen head: a chubby cream helmet with a black glass screen for a
 * face, a rainbow light running round the inside of the screen's rim, a
 * little orange horn on top, and dark ear pads with a cyan light down each side.
 *
 * Its expressions are white light on the glass rather than ink, each drawn to
 * the reference sheet: fat ovals when curious, taller ones when surprised,
 * thick arches when happy, chevrons when excited, heavy-lidded half-moons
 * when sad, a raised brow when thinking, a question mark when confused, and
 * coral crosses on an error.
 *
 * The proportions are measured from the front view of the reference: a shell
 * about 1.36 times as wide as it is tall, domed on top and nearly flat
 * underneath; a squircle screen about 1.5 times as wide as tall sitting a
 * little low; the rim light a hair inside the glass's edge. Its volume comes
 * from light rather than outlines: soft inner shade round the shell's edge,
 * a broad top light, a recess the screen sits down in, a glossy convex glass.
 *
 * It turns as a rounded box does: the screen slides across the front and
 * narrows, the side swinging toward us shows its ear and the ear's light,
 * and the horn leans the way the face points. Everything is in R, as in robo.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type RGB = [number, number, number];

/** What the screen can show. Most are the engine's eyes; "think" is the screen's own. */
export type ScreenGlyph =
  | "pill" | "wide" | "happy" | "closed" | "half" | "x" | "spiral" | "heart" | "star" | "wink"
  | "excited" | "confused" | "think" | "loading" | "generating";

/** How the rim light behaves right now. */
export interface RimLight {
  /** Where the colours start round the ring, in radians: turn it and the colours flow. */
  spin: number;
  /** Loading: the angle of a bright comet running round a dimmed ring; null for none. */
  chase: number | null;
  /** Brightness, 1 at rest. */
  level: number;
}

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
  /** Seconds, for anything that spins. */
  t: number;
  rim: RimLight;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1)})`;

// ── Geometry (in R; measured off the front view, where R is 85 px) ───────────

const S = {
  /** The whole head is drawn at this size, so it takes about the room the ball does. */
  scale: 0.84,
  /** The shell: half its width; above and below the middle, how far it reaches and how square it is. */
  w: 1.255,
  top: 0.92,
  bottom: 0.985,
  nTop: 2.3,
  nBottom: 3.1,
  nSide: 2.7,
  /**
   * The glass: half its size, and its drop below the shell's middle. It is a
   * superellipse of power 3: every side bows out, no edge is straight.
   */
  sw: 1.057,
  sh: 0.71,
  sn: 3,
  sy: 0.077,
  /**
   * The rim light's line: a slightly squarer superellipse (3.3), half its
   * size, and where its middle sits from the glass's. It is about 0.1 in from
   * the glass at the top and sides but hugs the bottom (0.04), as the light
   * sits on the glass's inner bevel, seen from a touch above.
   */
  rw: 0.966,
  rh: 0.64,
  rn: 3.3,
  rdx: 0.0075,
  rdy: 0.0285,
  /** How far the screen travels across the front as it turns. */
  depth: 0.5,
  /** The turn, in radians at yaw / pitch = ±1: a box can't turn as far as a ball. */
  maxYaw: 0.5,
  maxPitch: 0.34,
  /** Ear pads: centre out from the middle, how far they stand proud of the shell, their face side-on, height, drop. */
  earOut: 1.39,
  earT: 0.36,
  earN: 2.3,
  earD: 0.64,
  earFaceH: 0.87,
  earH: 0.75,
  earY: 0.145,
  /** The ear light, seen from the side: its size against the pad's face. */
  ledW: 0.157,
  ledH: 0.52,
  /** The horn: base half-width, top half-width, top. */
  hornBase: 0.184,
  hornTop: 0.123,
  hornTip: -1.235,
  /** Eye centres, either side of the screen's middle, and below it. */
  eyeX: 0.39,
  eyeY: 0.072,
};

/** Its lowest point, for the floor shadow. */
export const SCREEN_HEAD_BOTTOM = S.bottom * S.scale;

const CREAM: RGB = [246, 243, 238];
/** The shell's edges turn away into a cool, faintly lavender shade. */
const EDGE_SHADE: RGB = [176, 166, 178];
const SIDE_SHADE: RGB = [178, 170, 206];

/**
 * The rim's light, by angle from the screen's centre, clockwise from the
 * right-hand side (read off the front view, landmark by landmark): light
 * blue at the right, deep blue down the lower right and round the corner,
 * cyan then green then yellow-green along the bottom, yellow at the
 * bottom-left corner, orange up the lower left, red-orange to red on the
 * upper left and the top-left corner, orange across the top warming to
 * yellow, a pale glint where it turns abruptly cyan near the top-right
 * corner, and cyan down into light blue again.
 */
const RIM: [number, RGB][] = [
  [0, [100, 200, 255]],
  [0.064, [64, 112, 242]],
  [0.1, [70, 118, 255]],
  [0.136, [64, 198, 242]],
  [0.237, [82, 220, 200]],
  [0.323, [112, 226, 112]],
  [0.38, [200, 226, 64]],
  [0.415, [255, 210, 52]],
  [0.459, [255, 150, 42]],
  [0.5, [255, 112, 52]],
  [0.548, [255, 82, 72]],
  [0.6, [255, 80, 92]],
  [0.635, [255, 96, 72]],
  [0.704, [255, 140, 50]],
  [0.822, [255, 186, 62]],
  [0.85, [255, 214, 120]],
  [0.864, [210, 242, 244]],
  [0.885, [86, 222, 250]],
  [0.95, [90, 210, 255]],
  [1, [100, 200, 255]],
];

const GLYPH: RGB = [255, 255, 255];
const BLOOM: RGB = [225, 238, 255];
const CORAL: RGB = [242, 92, 92];
const LED: RGB = [104, 230, 255];

// ── Paths ────────────────────────────────────────────────────────────────────

/**
 * A superellipse with its own reach and squareness above and below the
 * middle: the shell's domed top and flat bottom, or (all equal) a squircle.
 */
function blob(cx: number, cy: number, hw: number, up: number, down: number, nUp: number, nDown: number, nSide = 0): Path2D {
  const p = new Path2D();
  const steps = 128;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const n = s < 0 ? nUp : nDown;
    const nx = nSide || n;
    const X = cx + Math.sign(c) * Math.pow(Math.abs(c), 2 / nx) * hw;
    const Y = cy + Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * (s < 0 ? up : down);
    if (i === 0) p.moveTo(X, Y);
    else p.lineTo(X, Y);
  }
  p.closePath();
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

/**
 * The shell's outline: one superellipse, rounded alike at top and bottom and
 * left and right (the base a touch flatter and reaching a touch lower than
 * the crown), so the head reads as a soft pebble.
 */
function shellPath(R: number): Path2D {
  return blob(0, 0, S.w * R, S.top * R, S.bottom * R, S.nTop, S.nBottom, S.nSide);
}

/** The screen's outline, grown by `d` all round (negative to shrink); a little rounder as it grows. */
function screenPath(fx: number, fy: number, hw: number, hh: number, d: number): Path2D {
  const n = S.sn - Math.min(0.4, d * 4);
  return blob(fx, fy, hw + d, hh + d, hh + d, n, n);
}

function radialAt(
  x: Ctx, cx: number, cy: number, r: number, stops: [number, RGB][], alphas?: number[],
): CanvasGradient {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach(([o, c], i) => g.addColorStop(o, rgba(c, alphas ? alphas[i] : 1)));
  return g;
}

/** Whether the context can blur what it draws (not every browser's canvas can). */
function canBlur(x: Ctx): boolean {
  return "filter" in x && typeof x.filter === "string";
}

/** Device pixels per unit of the current transform: shadows are measured in device pixels. */
function pxScale(x: Ctx): number {
  const m = x.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

/**
 * Soft shade just inside a shape's edge, as a rounded thing turning away
 * from us has: the shadow of everything outside the shape, cast in by `dy`.
 */
function innerShade(x: Ctx, shape: Path2D, R: number, color: string, blur: number, dy: number) {
  const k = pxScale(x);
  x.save();
  x.clip(shape);
  const hole = new Path2D();
  hole.rect(-6 * R, -6 * R, 12 * R, 12 * R);
  hole.addPath(shape);
  x.shadowColor = color;
  x.shadowBlur = blur * R * k;
  x.shadowOffsetX = 0;
  x.shadowOffsetY = dy * R * k;
  x.fillStyle = "#000";
  x.fill(hole, "evenodd");
  x.restore();
}

/** The rim's colour at a fraction of the way round, clockwise from the right. */
function rimColorAt(f: number): RGB {
  const u = ((f % 1) + 1) % 1;
  for (let i = 1; i < RIM.length; i++) {
    const [o1, c1] = RIM[i];
    const [o0, c0] = RIM[i - 1];
    if (u <= o1) {
      const t = (u - o0) / Math.max(1e-6, o1 - o0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return RIM[RIM.length - 1][1];
}

/**
 * The rim's colours, shown only along a comet: bright at its head (`chase`,
 * in radians), fading smoothly over its tail. Null where conic gradients are missing.
 */
function cometStyle(x: Ctx, cx: number, cy: number, spin: number, chase: number): CanvasGradient | null {
  if (!("createConicGradient" in x && typeof x.createConicGradient === "function")) return null;
  const g = x.createConicGradient(0, cx, cy);
  const tail = 2.2;
  const lead = 0.12;
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const behind = (((chase - a) % TAU) + TAU) % TAU;
    let alpha = 0;
    if (behind < tail) alpha = Math.pow(1 - behind / tail, 1.8);
    else if (behind > TAU - lead) alpha = (behind - (TAU - lead)) / lead;
    g.addColorStop(i / n, rgba(rimColorAt((a - spin) / TAU), alpha));
  }
  return g;
}

function rimStyle(x: Ctx, cx: number, cy: number, hw: number, spin = 0): CanvasGradient {
  if ("createConicGradient" in x && typeof x.createConicGradient === "function") {
    const g = x.createConicGradient(spin, cx, cy);
    for (const [o, c] of RIM) g.addColorStop(o, rgba(c));
    return g;
  }
  // Without conic gradients: warm on the left, cool on the right.
  const g = x.createLinearGradient(cx - hw, 0, cx + hw, 0);
  g.addColorStop(0, rgba([255, 92, 82]));
  g.addColorStop(0.35, rgba([255, 170, 56]));
  g.addColorStop(0.65, rgba([112, 226, 118]));
  g.addColorStop(1, rgba([70, 168, 255]));
  return g;
}

// ── Draw ─────────────────────────────────────────────────────────────────────

/** Draws the whole head centred on the current origin, with radius R. */
export function drawScreenHead(x: Ctx, R0: number, p: ScreenPose) {
  const R = R0 * S.scale;
  const a = p.yaw * S.maxYaw;
  const b = p.pitch * S.maxPitch;
  const ca = Math.cos(a);
  const cb = Math.cos(b);
  const sa = Math.sin(a);

  x.save();
  x.rotate(p.tilt * 0.6);

  // The side swinging toward us. Both ears and the horn's root sit behind the shell's edge.
  const near = sa > 0 ? -1 : 1;
  const earL = earGeometry(-1, a);
  const earR = earGeometry(1, a);
  drawEarBehind(x, R, earL, cb);
  drawEarBehind(x, R, earR, cb);
  drawHorn(x, R, sa);
  drawShell(x, R, sa, near);
  drawHornShadow(x, R, sa, shellPath(R));
  drawEarInFront(x, R, near < 0 ? earL : earR, cb);

  // The screen rides on the front.
  const fx = sa * S.depth * R;
  const fy = (S.sy + Math.sin(b) * 0.45) * R;
  const hw = S.sw * R * ca;
  const hh = S.sh * R * cb;
  const glass = screenPath(fx, fy, hw, hh, 0);
  drawScreen(x, R, glass, fx, fy, hw, hh, ca, cb, p.rim);

  x.save();
  x.clip(glass);
  // The face looks a touch further than the head turns, so it reads as a glance.
  // Its eyes lead its head: they slide across the glass toward where it looks,
  // well past where the screen itself has turned to.
  x.translate(fx + p.yaw * 0.17 * R, fy + (S.eyeY + p.pitch * 0.1) * R);
  x.scale(ca, cb);
  x.rotate(p.roll);
  drawGlyphs(x, R, p);
  x.restore();

  x.restore();
}

function drawShell(x: Ctx, R: number, sa: number, near: number) {
  const shell = shellPath(R);
  x.fillStyle = rgba(CREAM);
  x.fill(shell);

  // Light from above and a little left: a broad bright crown, falling off down the sides.
  x.save();
  x.clip(shell);
  const fall = x.createLinearGradient(0, -S.top * R, 0, S.bottom * R);
  fall.addColorStop(0, "rgba(255,255,255,0.55)");
  fall.addColorStop(0.35, "rgba(255,255,255,0.1)");
  fall.addColorStop(0.7, "rgba(120,104,96,0.03)");
  fall.addColorStop(1, "rgba(110,96,90,0.16)");
  x.fillStyle = fall;
  x.fill(shell);
  // The near side, turning toward us, picks up a cool lavender cast.
  const k = Math.abs(sa) / Math.sin(S.maxYaw);
  if (k > 0.01) {
    const g = x.createLinearGradient(near * S.w * R, 0, near * (S.w - 0.7) * R, 0);
    g.addColorStop(0, rgba(SIDE_SHADE, 0.55 * k));
    g.addColorStop(1, rgba(SIDE_SHADE, 0));
    x.fillStyle = g;
    x.fill(shell);
  }
  x.restore();

  // Every edge rolls away from us into shade: wide and faint, then tight and darker.
  innerShade(x, shell, R, rgba(EDGE_SHADE, 0.42), 0.36, -0.06);
  innerShade(x, shell, R, rgba([120, 108, 112], 0.45), 0.1, -0.02);
  // The crown catches the light: a soft highlight just inside the top edge.
  x.save();
  x.clip(shell);
  x.fillStyle = radialAt(x, -0.1 * R, -0.78 * R, 0.95 * R, [
    [0, [255, 255, 255]],
    [1, [255, 255, 255]],
  ], [0.75, 0]);
  x.save();
  x.scale(1, 0.4);
  x.fillRect(-1.5 * R, -2.6 * R, 3 * R, 2.6 * R);
  x.restore();
  // Bounced light from below, along the bottom edge.
  // The chin's underside turns away into a warm shade, with bounced light
  // catching just its very edge.
  const under = x.createLinearGradient(0, (S.bottom - 0.2) * R, 0, S.bottom * R);
  under.addColorStop(0, "rgba(150,132,118,0)");
  under.addColorStop(0.7, "rgba(150,132,118,0.28)");
  under.addColorStop(0.92, "rgba(150,132,118,0.2)");
  under.addColorStop(1, "rgba(255,248,240,0.5)");
  x.fillStyle = under;
  x.fill(shell);
  x.restore();

}

/**
 * The horn: a soft orange dome. A full round top, nearly upright sides that
 * flare a little where it sits on the shell, a dark contact line at its
 * root. It leans the way the face points.
 */
function drawHorn(x: Ctx, R: number, sa: number) {
  const lean = (sa / Math.sin(S.maxYaw)) * 0.12 * R;
  const bw = S.hornBase * R;
  const tw = S.hornTop * R;
  const top = S.hornTip * R;
  const base = -0.86 * R;
  const seat = -0.94 * R;
  const capY = top + tw;
  const p = new Path2D();
  p.moveTo(-bw, base);
  // Up the left: the flare, then the upright side.
  p.bezierCurveTo(-bw * 0.86, seat - 0.02 * R, lean - tw * 1.08, capY + 0.1 * R, lean - tw, capY);
  // Over the dome.
  p.bezierCurveTo(lean - tw, top - tw * 0.32, lean + tw, top - tw * 0.32, lean + tw, capY);
  // Down the right.
  p.bezierCurveTo(lean + tw * 1.08, capY + 0.1 * R, bw * 0.86, seat - 0.02 * R, bw, base);
  p.closePath();
  // A rounded stub, so shaded as a cylinder across: a bright band a little
  // left of its axis, falling into a core shadow on the right, with a breath of
  // light reflected back at the far edge.
  const axis = lean * 0.6;
  const across = x.createLinearGradient(axis - bw, 0, axis + bw, 0);
  across.addColorStop(0, "rgb(236,142,44)");
  across.addColorStop(0.24, "rgb(255,208,104)");
  across.addColorStop(0.44, "rgb(255,180,58)");
  across.addColorStop(0.72, "rgb(234,128,28)");
  across.addColorStop(0.9, "rgb(204,98,20)");
  across.addColorStop(1, "rgb(224,124,40)");
  x.fillStyle = across;
  x.fill(p);
  x.save();
  x.clip(p);
  // The dome catches the light from above; the root falls into shade.
  const down = x.createLinearGradient(0, top, 0, seat);
  down.addColorStop(0, "rgba(255,236,170,0.45)");
  down.addColorStop(0.35, "rgba(255,236,170,0)");
  down.addColorStop(0.7, "rgba(150,60,10,0)");
  down.addColorStop(1, "rgba(150,60,10,0.45)");
  x.fillStyle = down;
  x.fill(p);
  // A soft sheen on the dome and a small bright glint, as glossy plastic has.
  x.fillStyle = radialAt(x, lean - tw * 0.35, capY - tw * 0.2, tw * 0.8, [
    [0, [255, 244, 205]],
    [1, [255, 244, 205]],
  ], [0.85, 0]);
  x.fillRect(-2 * bw, top - R * 0.1, 4 * bw + Math.abs(lean), -top);
  x.fillStyle = radialAt(x, lean - tw * 0.42, capY - tw * 0.45, tw * 0.22, [
    [0, [255, 255, 248]],
    [1, [255, 255, 248]],
  ], [0.9, 0]);
  x.fillRect(-2 * bw, top - R * 0.1, 4 * bw + Math.abs(lean), -top);
  x.restore();
  // Its edges roll away all round.
  innerShade(x, p, R, "rgba(160,64,8,0.5)", 0.07, -0.006);
}

/** The horn's soft shadow on the shell's crown, round its root. */
function drawHornShadow(x: Ctx, R: number, sa: number, shell: Path2D) {
  const lean = (sa / Math.sin(S.maxYaw)) * 0.12 * R;
  x.save();
  x.clip(shell);
  x.translate(lean * 0.5 + 0.03 * R, -0.9 * R);
  x.scale(1, 0.28);
  const r = 0.34 * R;
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, "rgba(120,80,50,0.32)");
  g.addColorStop(0.5, "rgba(120,80,50,0.12)");
  g.addColorStop(1, "rgba(120,80,50,0)");
  x.fillStyle = g;
  x.fillRect(-r, -r, 2 * r, 2 * r);
  x.restore();
}

/**
 * Each ear is one solid slab bolted to the side of the head: a wall facing
 * forward (the half-capsule profile you see from the front, `earT` thick) and
 * an outer face (the capsule with the light in it, `earD` deep). Turning the
 * head swings the slab round the head's axis, so the two are always the same
 * object: from the front you see only the wall; as the head turns, the near
 * ear's face opens out beside its wall and its wall slides in over the
 * shell; the far ear's wall drifts out a little and tucks away.
 */
interface EarGeo {
  /** Which side: -1 left, 1 right. */
  s: number;
  /** Screen x of the wall's outer end, and of its inner end, in R. */
  xo: number;
  xi: number;
  /** How far the face is turned toward us: sin of the angle, 0 when it faces away. */
  face: number;
}

function earGeometry(s: number, a: number): EarGeo {
  // Positive when this ear's side swings toward the viewer.
  const u = s < 0 ? a : -a;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const half = S.earD / 2;
  const edge = (r: number) => s * (r * cu - half * su);
  return { s, xo: edge(S.earOut), xi: edge(S.earOut - S.earT * 0.36), face: Math.max(0, su) };
}

/**
 * Paints the whole slab as one solid: a superellipse silhouette that spans the
 * wall (the half-capsule seen from the front) and, beside it, the outer face
 * turned toward us (the wall swept sideways by the slab's depth). `over`
 * draws only the part that stands over the shell.
 */
function paintEar(x: Ctx, R: number, e: EarGeo, cb: number, over: boolean) {
  const s = e.s;
  const fw = S.earD * e.face * R;
  const h = (S.earH + (S.earFaceH - S.earH) * e.face) * R * cb;
  const wallW = S.earT * R;
  const full = wallW + fw;
  const ox = e.xo * R;
  const xb = ox + s * fw;
  const cx = xb - s * (full / 2);
  const cy = S.earY * R;
  const pad = blob(cx, cy, full / 2, h / 2, h / 2, S.earN, S.earN);
  const k = pxScale(x);
  // Over the shell the slab ends at the wall's inner end, rounded off as an
  // oval so it melts into the shell instead of ending on a cut.
  const span = Math.abs(e.xi * R - xb);
  const region = over ? blob((xb + e.xi * R) / 2, cy, span / 2, h / 2, h / 2, 2.2, 2.2) : null;
  x.save();
  if (region) x.clip(region);
  x.clip(pad);
  // One body, shaded as one: the outer face a soft matte charcoal, turning
  // through the wall's outer edge to near black where it meets the shell.
  const g = x.createLinearGradient(xb, 0, ox - s * wallW, 0);
  const f = clamp(fw / (fw + wallW), 0, 1);
  g.addColorStop(0, "rgb(52,57,70)");
  if (f > 0.02) g.addColorStop(f * 0.85, "rgb(44,48,60)");
  g.addColorStop(Math.min(0.99, f + (1 - f) * 0.18), "rgb(36,40,51)");
  g.addColorStop(Math.min(0.995, f + (1 - f) * 0.6), "rgb(24,26,33)");
  g.addColorStop(1, over ? "rgb(30,32,40)" : "rgb(9,10,12)");
  x.fillStyle = g;
  x.fillRect(cx - full, cy - h, 2 * full, 2 * h);
  // Gloss: a cool light across the top, falling away below.
  const top = x.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  top.addColorStop(0, "rgba(130,150,196,0.34)");
  top.addColorStop(0.3, "rgba(100,118,160,0.1)");
  top.addColorStop(0.55, "rgba(0,0,0,0)");
  top.addColorStop(1, "rgba(0,0,0,0.24)");
  x.fillStyle = top;
  x.fillRect(cx - full, cy - h, 2 * full, 2 * h);
  x.fillStyle = radialAt(x, ox - s * wallW * 0.25, cy - h * 0.24, h * 0.32, [
    [0, [200, 210, 230]],
    [1, [200, 210, 230]],
  ], [0.26, 0]);
  x.fillRect(cx - full, cy - h, 2 * full, 2 * h);
  x.restore();

  // A rounded bevel all round: its edges roll away, lit along the top, in shade below.
  x.save();
  if (region) x.clip(region);
  innerShade(x, pad, R, "rgba(0,0,0,0.6)", 0.06, -0.012);
  innerShade(x, pad, R, "rgba(150,175,215,0.32)", 0.035, 0.01);
  x.restore();

  // The ear light: a soft oval of cyan, white at its heart. Seen edge-on it is
  // a slim oval at the outer edge; as the face turns toward us it fills out.
  const t = clamp(fw / (0.06 * R), 0, 1);
  const lcx = ox + s * (fw / 2 - 0.012 * R * (1 - t));
  const lw = Math.max(S.ledW * e.face * R, 0.014 * R);
  const lh = (S.ledH * (0.85 + 0.15 * e.face)) * R * cb;
  const ly = cy + 0.02 * R * (1 - t);
  x.save();
  x.clip(pad);
  if (region) x.clip(region);
  if (canBlur(x)) {
    x.filter = `blur(${0.045 * R * k}px)`;
    x.fillStyle = rgba(LED, 0.55);
    x.beginPath();
    x.ellipse(lcx, ly, lw * 0.9 + 0.01 * R, lh / 2, 0, 0, TAU);
    x.fill();
    x.filter = `blur(${0.006 * R * k}px)`;
  }
  const lg = x.createRadialGradient(lcx, ly, 0, lcx, ly, lh / 2);
  lg.addColorStop(0, "rgba(236,253,255,1)");
  lg.addColorStop(0.55, rgba(LED, 1));
  lg.addColorStop(1, rgba(LED, 0.75));
  x.fillStyle = lg;
  x.beginPath();
  x.ellipse(lcx, ly, lw / 2, lh / 2, 0, 0, TAU);
  x.fill();
  x.filter = "none";
  x.restore();
}

/** The slab tucked behind the shell's edge: all of it from the front, its outer part when turned. */
function drawEarBehind(x: Ctx, R: number, e: EarGeo, cb: number) {
  // As the near ear turns toward us its slab is drawn whole over the shell, so
  // its tucked-away profile slides in under the shell to make way: one ear, never two.
  const t = clamp(e.face / 0.12, 0, 1);
  paintEar(x, R, { ...e, xo: e.xo + (e.xi - e.xo) * t, face: 0 }, cb, false);
}

/**
 * The near ear's slab where it stands over the shell: the same solid, drawn
 * again on top so its wall and its outer face are never hidden by the shell.
 */
function drawEarInFront(x: Ctx, R: number, e: EarGeo, cb: number) {
  if (e.face <= 0.004) return;
  paintEar(x, R, e, cb, true);
}

function drawScreen(x: Ctx, R: number, glass: Path2D, fx: number, fy: number, hw: number, hh: number, ca: number, cb: number, light: RimLight) {
  // The screen sits down in a recess. The shell slopes softly in toward it,
  // shaded under the brow at the top and catching light along the bottom;
  // at the bottom of the slope, a thin taupe gap before the glass.
  const gap = 0.022 * R;
  const recess = screenPath(fx, fy, hw, hh, gap);
  const slope = screenPath(fx, fy, hw, hh, 0.06 * R);
  const k = pxScale(x);
  if (canBlur(x)) {
    x.save();
    x.filter = `blur(${0.05 * R * k}px)`;
    const sg = x.createLinearGradient(0, fy - hh, 0, fy + hh);
    sg.addColorStop(0, "rgba(118,106,104,0.55)");
    sg.addColorStop(0.6, "rgba(140,128,124,0.35)");
    sg.addColorStop(1, "rgba(150,140,134,0.2)");
    x.lineWidth = 0.1 * R;
    x.strokeStyle = sg;
    x.stroke(slope);
    x.filter = `blur(${0.025 * R * k}px)`;
    const lit = x.createLinearGradient(0, fy, 0, fy + hh + 0.1 * R);
    lit.addColorStop(0, "rgba(255,255,255,0)");
    lit.addColorStop(1, "rgba(255,255,255,0.85)");
    x.lineWidth = 0.03 * R;
    x.strokeStyle = lit;
    x.translate(0, 0.03 * R);
    x.stroke(slope);
    x.restore();
  } else {
    const lg = x.createLinearGradient(0, fy - hh, 0, fy + hh + 2 * gap);
    lg.addColorStop(0, "rgba(120,108,104,0.35)");
    lg.addColorStop(0.55, "rgba(255,255,255,0)");
    lg.addColorStop(1, "rgba(255,255,255,0.7)");
    x.lineWidth = 0.05 * R;
    x.strokeStyle = lg;
    x.stroke(slope);
  }
  const rg = x.createLinearGradient(0, fy - hh - gap, 0, fy + hh + gap);
  rg.addColorStop(0, "rgb(110,100,98)");
  rg.addColorStop(0.55, "rgb(160,150,146)");
  rg.addColorStop(1, "rgb(222,216,208)");
  x.fillStyle = rg;
  x.fill(recess);

  // The glass: deep black, a hair lighter at its edges where it curves away.
  const gg = x.createRadialGradient(fx, fy - hh * 0.2, 0, fx, fy, hw * 1.05);
  gg.addColorStop(0, "rgb(4,4,6)");
  gg.addColorStop(0.75, "rgb(8,8,11)");
  gg.addColorStop(1, "rgb(26,26,32)");
  x.fillStyle = gg;
  x.fill(glass);

  x.save();
  x.clip(glass);
  // The rim light: a saturated neon line just inside the glass's edge, blooming inward.
  const rx = fx + S.rdx * R * ca;
  const ry = fy + S.rdy * R * cb;
  const rim = blob(rx, ry, S.rw * R * ca, S.rh * R * cb, S.rh * R * cb, S.rn, S.rn);
  const style = rimStyle(x, rx, ry, hw, light.spin);
  const glowRim = (m: number, st: CanvasGradient = style, core = true) => {
    x.strokeStyle = st;
    if (canBlur(x)) {
      // A true bloom: the line, blurred wide and then tight, under the crisp line.
      const k = pxScale(x);
      for (const [w, blur, al] of [[0.12, 0.07, 0.45], [0.075, 0.025, 0.85]] as const) {
        x.filter = `blur(${blur * R * k}px)`;
        x.globalAlpha = clamp(al * m, 0, 1);
        x.lineWidth = w * R;
        x.stroke(rim);
      }
      x.filter = "none";
      x.globalAlpha = clamp(m, 0, 1);
      x.lineWidth = 0.046 * R;
      x.stroke(rim);
    } else {
      for (const [w, al] of [[0.34, 0.07], [0.2, 0.12], [0.11, 0.26], [0.066, 0.6], [0.044, 1]] as const) {
        x.globalAlpha = clamp(al * m, 0, 1);
        x.lineWidth = w * R;
        x.stroke(rim);
      }
    }
    if (core) {
      x.globalAlpha = clamp(0.18 * m, 0, 1);
      x.lineWidth = 0.014 * R;
      x.strokeStyle = "rgb(255,255,255)";
      x.stroke(rim);
    }
    x.globalAlpha = 1;
  };
  if (light.chase === null) {
    glowRim(light.level);
    if (light.level > 1) {
      // Brighter than at rest: a second, wider bloom.
      x.save();
      x.globalCompositeOperation = "lighter";
      glowRim((light.level - 1) * 0.8);
      x.restore();
    }
  } else {
    // Loading: the ring dims, and a bright comet runs round it, its tail fading
    // smoothly away behind it.
    glowRim(0.18 * light.level);
    const comet = cometStyle(x, rx, ry, light.spin, light.chase);
    if (comet) {
      glowRim(light.level, comet, false);
      x.save();
      x.globalCompositeOperation = "lighter";
      glowRim(light.level * 0.7, comet, false);
      x.restore();
    }
  }
  // Convex glass: a broad, faint sheen across the top, and the window's soft
  // reflection up in the top-right corner.
  x.fillStyle = radialAt(x, fx - hw * 0.15, fy - hh * 1.25, hw * 1.05, [
    [0, [255, 255, 255]],
    [1, [255, 255, 255]],
  ], [0.08, 0]);
  x.fill(glass);
  x.fillStyle = radialAt(x, fx + hw * 0.58, fy - hh * 0.62, hw * 0.32, [
    [0, [235, 240, 248]],
    [1, [235, 240, 248]],
  ], [0.16, 0]);
  x.fill(glass);
  x.restore();

  // Its own edge: the faintest dark bevel where the glass meets the gap.
  x.lineWidth = 0.006 * R;
  x.strokeStyle = "rgba(0,0,0,0.4)";
  x.stroke(glass);
}

// ── The face on the glass ────────────────────────────────────────────────────
//
// Sizes are from the reference sheet, measured against the screen: an eye is
// about a sixth of the screen's width, strokes about a twentieth.

function light(x: Ctx, R: number, c: RGB = GLYPH, glow: RGB = BLOOM) {
  x.fillStyle = rgba(c);
  x.strokeStyle = rgba(c);
  x.shadowColor = rgba(glow, 0.5);
  x.shadowBlur = 0.045 * R * pxScale(x);
  x.lineCap = "round";
  x.lineJoin = "round";
}

const STROKE = 0.084;

/** Glyphs are drawn at this size; the numbers below are at 1. */
const GLYPH_SCALE = 1.25;

function drawGlyphs(x: Ctx, R0: number, p: ScreenPose) {
  const R = R0 * GLYPH_SCALE;
  // Light on glass has soft edges, never a vector-crisp one.
  if (canBlur(x)) x.filter = `blur(${0.005 * R * pxScale(x)}px)`;
  light(x, R);
  if (p.glyph === "generating") {
    drawWriting(x, R0, p);
    if (canBlur(x)) x.filter = "none";
    return;
  }
  if (p.glyph === "loading") {
    // Its eyes become three dots that rise in a wave and swell as they pass the top.
    for (let i = 0; i < 3; i++) {
      const b = Math.max(0, Math.sin(p.t * 5.2 - i * 0.95));
      x.beginPath();
      x.arc((i - 1) * S.eyeX * R0, -b * 0.1 * R, (0.062 + 0.03 * b) * R, 0, TAU);
      x.fill();
    }
    if (canBlur(x)) x.filter = "none";
    return;
  }
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * S.eyeX * R0, 0);
    drawEye(x, R, p.glyph, sd, p);
    x.restore();
  }
  drawMouth(x, R0, p);
  if (canBlur(x)) x.filter = "none";
}

/** A slightly squared oval (a superellipse of power 2.3), as the screen draws its eyes. */
const hash = (i: number) => {
  const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return v - Math.floor(v);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t: number) => {
  const u = clamp(t, 0, 1);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};

/**
 * Generating: the whole screen becomes a page being written. Lines of light
 * type themselves out left to right behind a bright cursor, the page
 * scrolling up a line as each new one begins. In R, from the eyes' line.
 */
function drawWriting(x: Ctx, R: number, p: ScreenPose) {
  // The page: five rows filling the screen, each line taking 0.85 s to write.
  const per = 0.85;
  const rows = 5;
  const left = -0.58 * R;
  const maxW = 1.16 * R;
  const top = -0.42 * R;
  const gap = 0.17 * R;
  const thick = 0.056 * R;
  const tt = p.t / per;
  const L = Math.floor(tt);
  const f = tt - L;
  const settle = easeOut(f / 0.22);
  for (let i = L - rows; i <= L; i++) {
    // Rows count down from the line being written at the bottom; all slide up as a new one begins.
    const row = rows - 1 - (L - i) + (1 - settle);
    if (row < -1 || row > rows) continue;
    const alpha = row < 0 ? row + 1 : row > rows - 1 ? rows - row : 1;
    // Lines of a paragraph: most run long, every fourth stops short.
    const w = maxW * (i % 4 === 3 ? 0.35 + 0.2 * hash(i) : 0.62 + 0.38 * hash(i));
    const done = i < L ? 1 : easeInOut((f - 0.12) / 0.78);
    const y = top + row * gap;
    if (done > 0.01) {
      x.globalAlpha = 0.62 * clamp(alpha, 0, 1);
      x.fill(roundRect(left + (w * done) / 2, y, (w * done) / 2, thick / 2, thick / 2));
    }
    if (i === L) {
      // The cursor, bright at the end of the line it is writing.
      x.globalAlpha = clamp(alpha, 0, 1);
      x.beginPath();
      x.arc(left + w * done + 0.035 * R, y, 0.04 * R, 0, TAU);
      x.fill();
    }
  }
  x.globalAlpha = 1;
}

function oval(x: Ctx, R: number, rx: number, ry: number, dy = 0, dx = 0) {
  x.fill(blob(dx * R, dy * R, rx * R, Math.max(ry * R, 0.01 * R), Math.max(ry * R, 0.01 * R), 2.3, 2.3));
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
      oval(x, R, 0.139 * p.es, 0.17 * p.es * open);
      break;
    case "wide":
      // Surprised: the same width, taller.
      oval(x, R, 0.132 * p.es, 0.19 * p.es * open);
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
