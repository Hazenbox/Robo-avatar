/**
 * Robo's body: its outline for each shape, where its face fits inside it,
 * and an optional coat of fur.
 *
 * The round body is drawn exactly as it always was (an ellipse); the other
 * shapes are opt-in. Everything is in R, its body radius, around its centre.
 */

import type { BodyShape } from "./look";

type Pt = [number, number];
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Where its face sits in each shape: scaled to fit inside, and moved down for the triangle. */
export const FACE_FIT: Record<BodyShape, { scale: number; dy: number }> = {
  round: { scale: 1, dy: 0 },
  cube: { scale: 1, dy: 0.02 },
  triangle: { scale: 0.74, dy: 0.2 },
  star: { scale: 0.9, dy: 0.03 },
  sparkle: { scale: 0.84, dy: 0 },
};

/** How far each body reaches below its centre, for the floor shadow. */
export const BODY_BOTTOM: Record<BodyShape, number> = {
  round: 1,
  cube: 0.93,
  triangle: 0.86,
  star: 0.97,
  sparkle: 1.34,
};

/* ------------------------------------------------------------------------ */
/* Outlines, as dense closed polylines in R.                                 */
/* ------------------------------------------------------------------------ */

function ellipseOutline(rx: number, ry: number, n = 144): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [rx * Math.cos(t), ry * Math.sin(t)] as Pt;
  });
}

/** A polygon with every corner rounded to radius r. */
function roundedPolygon(vertices: Pt[], r: number, perCorner = 16): Pt[] {
  const out: Pt[] = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const v = vertices[i];
    const a = vertices[(i + n - 1) % n];
    const b = vertices[(i + 1) % n];
    const u1 = norm([a[0] - v[0], a[1] - v[1]]);
    const u2 = norm([b[0] - v[0], b[1] - v[1]]);
    const half = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))) / 2;
    const d = r / Math.tan(half);
    const bis = norm([u1[0] + u2[0], u1[1] + u2[1]]);
    const c: Pt = [v[0] + bis[0] * (r / Math.sin(half)), v[1] + bis[1] * (r / Math.sin(half))];
    const t1: Pt = [v[0] + u1[0] * d, v[1] + u1[1] * d];
    const t2: Pt = [v[0] + u2[0] * d, v[1] + u2[1] * d];
    const a1 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    const a2 = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
    // The short way round the fillet.
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    for (let k = 0; k <= perCorner; k++) {
      const t = a1 + (sweep * k) / perCorner;
      out.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]);
    }
  }
  return out;
}

/** A round-cornered rectangle, half-width hw, half-height hh. */
function roundedRect(hw: number, hh: number, r: number): Pt[] {
  return roundedPolygon(
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ],
    r,
  );
}

/**
 * A star drawn as a radius that swells into `points` soft tips: a puffy star
 * (low sharpness) or a pinched sparkle (high). Tip straight up.
 */
function polarStar(points: number, rIn: number, rOut: number, sharpness: number, n = 240): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    const bump = ((1 + Math.cos(points * (t + Math.PI / 2))) / 2) ** sharpness;
    const r = rIn + (rOut - rIn) * bump;
    return [r * Math.cos(t), r * Math.sin(t)] as Pt;
  });
}

function norm(v: Pt): Pt {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

const outlines = new Map<BodyShape, Pt[]>();

/** The body's outline, in R. */
export function bodyOutline(shape: BodyShape): Pt[] {
  let o = outlines.get(shape);
  if (!o) {
    switch (shape) {
      case "round":
        o = ellipseOutline(1.03, 1);
        break;
      case "cube":
        o = roundedRect(0.97, 0.93, 0.32);
        break;
      case "triangle":
        o = roundedPolygon(
          [
            [0, -1.12],
            [1.12, 0.86],
            [-1.12, 0.86],
          ],
          0.3,
        );
        break;
      case "star":
        o = polarStar(5, 0.84, 1.2, 1.4);
        break;
      case "sparkle":
        o = polarStar(4, 0.78, 1.34, 2.6);
        break;
    }
    outlines.set(shape, o);
  }
  return o;
}

/** The body's path at radius R. The round body is the same ellipse it always was. */
export function bodyPath(shape: BodyShape, R: number, bodyRx: number): Path2D {
  const path = new Path2D();
  if (shape === "round") {
    path.ellipse(0, 0, bodyRx * R, R, 0, 0, Math.PI * 2);
    return path;
  }
  bodyOutline(shape).forEach(([u, v], i) => {
    if (i === 0) path.moveTo(u * R, v * R);
    else path.lineTo(u * R, v * R);
  });
  path.closePath();
  return path;
}

/* ------------------------------------------------------------------------ */
/* Fur: plush, like a soft toy -- a dense, short pile read as fine grain and  */
/* soft mottling, never as visible strands, with a fuzzy silhouette of very  */
/* fine fibres. Everything is laid out once from a fixed seed, so it never   */
/* flickers, and moves and scales with it, so it never swims.              */
/* ------------------------------------------------------------------------ */

/** A small seeded random generator (mulberry32), so the coat is the same every time. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inside(pts: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

interface Fibre {
  x: number;
  y: number;
  /** Unit direction it grows in. */
  dx: number;
  dy: number;
  len: number;
  curl: number;
  /** 0 = in the light at the top, 1 = in shade at the bottom. */
  tone: number;
}

interface Blob {
  x: number;
  y: number;
  r: number;
  /** Lighter (>0) or darker (<0), as an alpha. */
  a: number;
}

const MAX_FIBRES = 3000;
const coatCache = new Map<BodyShape, { fringe: Fibre[]; blobs: Blob[]; perimeter: number }>();

/** The fringe of fine fibres round the outline, and the soft patches over the body. */
function coatFor(shape: BodyShape) {
  const cached = coatCache.get(shape);
  if (cached) return cached;
  const rand = seeded(0x3ee7a);
  const pts = bodyOutline(shape);
  const lengths: number[] = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const perimeter = lengths[lengths.length - 1];
  const fringe: Fibre[] = [];
  for (let k = 0; k < MAX_FIBRES; k++) {
    // Spread evenly in a shuffled order, so drawing only the first N of them
    // (at small sizes) still covers the whole outline.
    const s = rand() * perimeter;
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < s) i++;
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    const f = (s - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1]);
    const x = a[0] + (b[0] - a[0]) * f;
    const y = a[1] + (b[1] - a[1]) * f;
    let n = norm([b[1] - a[1], -(b[0] - a[0])]);
    if (n[0] * x + n[1] * y < 0) n = [-n[0], -n[1]];
    const j = (rand() - 0.5) * 1.3;
    const c = Math.cos(j);
    const sn = Math.sin(j);
    // Some fibres start a little inside, so the fringe melts into the body.
    const root = 0.01 + rand() * 0.04;
    fringe.push({
      x: x - n[0] * root,
      y: y - n[1] * root,
      dx: n[0] * c - n[1] * sn,
      dy: n[0] * sn + n[1] * c,
      len: 0.03 + rand() * 0.045,
      curl: rand() * 2 - 1,
      tone: Math.max(0, Math.min(1, (y + 1.2) / 2.4)),
    });
  }
  const blobs: Blob[] = [];
  let tries = 0;
  while (blobs.length < 46 && tries < 3000) {
    tries++;
    const x = (rand() * 2 - 1) * 1.3;
    const y = (rand() * 2 - 1) * 1.3;
    if (!inside(pts, x, y)) continue;
    blobs.push({ x, y, r: 0.12 + rand() * 0.22, a: (rand() < 0.5 ? -1 : 1) * (0.05 + rand() * 0.06) });
  }
  const result = { fringe, blobs, perimeter };
  coatCache.set(shape, result);
  return result;
}

/**
 * The pile: a seamless tile of tiny, short fibres, light and dark, in every
 * direction -- which, laid over the body, reads as a velvety grain rather
 * than as hairs. Drawn once.
 */
let grainTile: HTMLCanvasElement | null = null;
const GRAIN_TILE = 256;
function grain(): HTMLCanvasElement | null {
  if (grainTile || typeof document === "undefined") return grainTile;
  const c = document.createElement("canvas");
  c.width = GRAIN_TILE;
  c.height = GRAIN_TILE;
  const x = c.getContext("2d");
  if (!x) return null;
  const rand = seeded(0x51f7);
  x.lineCap = "round";
  for (const [color, count, width] of [
    ["rgba(0,0,0,0.075)", 6500, 1.3],
    ["rgba(255,255,255,0.075)", 5500, 1.2],
  ] as const) {
    x.strokeStyle = color;
    x.lineWidth = width;
    x.beginPath();
    for (let i = 0; i < count; i++) {
      const px = rand() * GRAIN_TILE;
      const py = rand() * GRAIN_TILE;
      const a = rand() * Math.PI * 2;
      const l = 3 + rand() * 4;
      // Drawn at each wrapped position too, so the tile is seamless.
      for (const ox of [-GRAIN_TILE, 0, GRAIN_TILE]) {
        for (const oy of [-GRAIN_TILE, 0, GRAIN_TILE]) {
          const sx = px + ox;
          const sy = py + oy;
          if (sx < -8 || sx > GRAIN_TILE + 8 || sy < -8 || sy > GRAIN_TILE + 8) continue;
          x.moveTo(sx, sy);
          x.quadraticCurveTo(sx + Math.cos(a + 0.5) * l * 0.5, sy + Math.sin(a + 0.5) * l * 0.5, sx + Math.cos(a) * l, sy + Math.sin(a) * l);
        }
      }
    }
    x.stroke();
  }
  grainTile = c;
  return c;
}

const FUR_LIGHT: [number, number, number] = [252, 251, 249];
const FUR_SHADE: [number, number, number] = [172, 175, 188];

/** A tone of its coat, 0 = lit … 1 = shaded, tinted by its colour (multiplied, like its body). */
function furColor(t: number, color: [number, number, number] | null, alpha = 1): string {
  const c = FUR_LIGHT.map((l, i) => l + (FUR_SHADE[i] - l) * t);
  const m = color ? c.map((v, i) => (v * color[i]) / 255) : c;
  return `rgba(${Math.round(m[0])},${Math.round(m[1])},${Math.round(m[2])},${alpha})`;
}

/** How big R is on screen, in device pixels, from the context's transform. */
function screenR(x: Ctx, R: number): number {
  const m = x.getTransform();
  return R * Math.hypot(m.a, m.b);
}

/** Before the body: a soft blur of its own colour, so its outline is velvet, not plastic. */
export function drawFurUnder(x: Ctx, body: Path2D, R: number, color: [number, number, number] | null) {
  x.save();
  x.shadowColor = furColor(0.15, color, 0.65);
  // Shadow blur is in device pixels, whatever the transform.
  x.shadowBlur = 0.06 * screenR(x, R);
  x.fillStyle = furColor(0.35, color, 1);
  x.fill(body);
  x.restore();
}

/** After the body: the pile's grain and mottling over it, then the fine fringe round it. */
export function drawFur(
  x: Ctx,
  shape: BodyShape,
  body: Path2D,
  R: number,
  color: [number, number, number] | null,
  sway: number,
) {
  const coat = coatFor(shape);
  const px = screenR(x, R);

  x.save();
  x.clip(body);
  // Soft patches where the pile clumps.
  for (const b of coat.blobs) {
    const g = x.createRadialGradient(b.x * R, b.y * R, 0, b.x * R, b.y * R, b.r * R);
    const tone = b.a > 0 ? "255,255,255" : "40,30,40";
    g.addColorStop(0, `rgba(${tone},${Math.abs(b.a)})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    x.fillStyle = g;
    x.fillRect((b.x - b.r) * R, (b.y - b.r) * R, 2 * b.r * R, 2 * b.r * R);
  }
  // A soft sheen just inside the outline, where the fibres catch the light:
  // what plush has instead of a glossy rim. An inner glow: a fill everywhere
  // outside it (clipped away) whose blurred shadow falls just inside.
  x.save();
  const outside = new Path2D();
  outside.rect(-4 * R, -4 * R, 8 * R, 8 * R);
  outside.addPath(body);
  x.shadowColor = furColor(0, color, 0.55);
  x.shadowBlur = 0.07 * px;
  x.fillStyle = "#000";
  x.fill(outside, "evenodd");
  x.restore();
  // The grain, scaled with it so a fibre is always the same size on it.
  const tile = grain();
  if (tile) {
    const pattern = x.createPattern(tile, "repeat");
    if (pattern) {
      // A tile fibre is ~4 px long; this makes it ~1.4% of its radius.
      pattern.setTransform(new DOMMatrix().scale(0.0035 * R));
      x.fillStyle = pattern;
      x.fillRect(-1.6 * R, -1.6 * R, 3.2 * R, 3.2 * R);
    }
  }
  x.restore();

  // The fringe: very fine, short, half-transparent fibres standing out past
  // the outline -- as many as its size on screen needs to stay dense.
  const count = Math.max(180, Math.min(MAX_FIBRES, Math.round((coat.perimeter * px) / 0.8)));
  const width = Math.max(0.55, px * 0.006) * (R / Math.max(1e-6, px));
  x.save();
  x.lineCap = "round";
  for (let band = 0; band < 3; band++) {
    const path = new Path2D();
    for (let i = 0; i < count; i++) {
      const f = coat.fringe[i];
      if (Math.min(2, Math.floor(f.tone * 3)) !== band) continue;
      const len = f.len * R;
      const x0 = f.x * R;
      const y0 = f.y * R;
      const x1 = x0 + f.dx * len + sway * len * 0.3;
      const y1 = y0 + f.dy * len;
      path.moveTo(x0, y0);
      path.quadraticCurveTo(
        (x0 + x1) / 2 - f.dy * len * 0.4 * f.curl,
        (y0 + y1) / 2 + f.dx * len * 0.4 * f.curl,
        x1,
        y1,
      );
    }
    x.strokeStyle = furColor(band / 2, color, 0.58);
    x.lineWidth = width;
    x.stroke(path);
  }
  x.restore();
}

/** `#rrggbb` as an RGB triple. */
export function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
