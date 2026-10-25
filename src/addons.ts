/**
 * Things Robo can wear: a visor, headphones, a beanie, a muffler.
 *
 * Add-ons are strictly additive. The engine draws none of this unless an
 * add-on is switched on, so with the set empty it looks exactly as it
 * always has. One palette across the set -- graphite, Violet and a single
 * cyan accent -- so any combination reads as one outfit: clean shapes, soft
 * light, one point of glow, nothing fussy.
 *
 * Everything is drawn in the engine's own frame (body centre at the origin,
 * squash already applied) from an AddonPose the engine hands over, so the
 * add-ons turn, tilt, hop and squash with it. Soft parts (the pompom, the
 * muffler's tail) lag behind on the engine's spring.
 */

export type MascotAddon = "visor" | "goggles" | "headphones" | "studio" | "beanie" | "muffler";

export const MASCOT_ADDONS: readonly MascotAddon[] = [
  "visor",
  "goggles",
  "headphones",
  "studio",
  "beanie",
  "muffler",
];

export const ADDON_LABEL: Record<MascotAddon, string> = {
  visor: "Visor",
  goggles: "Goggles",
  headphones: "Headphones",
  studio: "Studio headphones",
  beanie: "Beanie",
  muffler: "Muffler",
};

/** Pieces that sit in the same place: wearing one takes the other off. */
const RIVALS: readonly (readonly MascotAddon[])[] = [
  ["visor", "goggles"],
  ["headphones", "studio"],
];

/**
 * A whole outfit from untrusted input (config, the API): known names only,
 * in wardrobe order, and never two rival pieces -- the earlier one wins.
 */
export function outfitOf(value: unknown): MascotAddon[] {
  return parseAddons(value).reduce<MascotAddon[]>((worn, a) => {
    const rivals = RIVALS.find((g) => g.includes(a)) ?? [];
    return rivals.some((r) => r !== a && worn.includes(r)) ? worn : [...worn, a];
  }, []);
}

/** Puts one add-on on or takes it off, swapping out whatever it would clash with. */
export function toggleAddon(
  worn: readonly MascotAddon[],
  addon: MascotAddon,
  on: boolean,
): MascotAddon[] {
  if (!on) return worn.filter((a) => a !== addon);
  const rivals = RIVALS.find((g) => g.includes(addon))?.filter((a) => a !== addon) ?? [];
  return MASCOT_ADDONS.filter((a) => a === addon || (worn.includes(a) && !rivals.includes(a)));
}

/** What to wear, from config: known names only, anything else ignored. */
export function parseAddons(value: unknown): MascotAddon[] {
  if (!Array.isArray(value)) return [];
  return MASCOT_ADDONS.filter((a) => value.includes(a));
}

type RGB = [number, number, number];
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Where it is and how it is moving, in the engine's units (R = body radius). */
export type AddonPose = {
  R: number;
  /** Yaw and pitch of its face, in radians. */
  a: number;
  b: number;
  /** The face plate's centre, and its foreshortening as it turns. */
  fx: number;
  fy: number;
  ca: number;
  cb: number;
  /** Its head tilt, radians. */
  tilt: number;
  /** Spring lag of soft parts, -1…1. */
  swayX: number;
  swayY: number;
  /** Seconds, for anything that breathes. */
  t: number;
  /** The louder of its voice and the room, 0…1. */
  level: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rgba = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1)})`;

const GRAPHITE_HI: RGB = [78, 81, 97];
const GRAPHITE: RGB = [40, 42, 53];
const GRAPHITE_LO: RGB = [15, 16, 22];
const ACCENT: RGB = [96, 226, 255];
const VIOLET_HI: RGB = [154, 128, 255];
const VIOLET: RGB = [106, 74, 240];
const VIOLET_LO: RGB = [52, 30, 160];
const SHADOW: RGB = [12, 10, 40];

/** The visor's eyes: lit from inside rather than inked. */
export const LED_CORE = "rgb(206,250,255)";
export const LED_GLOW = "rgba(80,220,255,0.9)";

/* ------------------------------------------------------------------------ */
/* Visor: one sweep of smoked glass across both eyes, which glow through.    */
/* Drawn in the face-plate frame (origin at the plate, turned with it).     */
/* ------------------------------------------------------------------------ */

const VISOR = { w: 1.24, h: 0.37, y: -0.045 };

function visorPath(x: Ctx, R: number, ca: number, cb: number) {
  const W = VISOR.w * R * ca;
  const H = VISOR.h * R * cb;
  const y = VISOR.y * R * cb;
  const r = H / 2;
  x.beginPath();
  x.moveTo(-W / 2 + r, y - H / 2);
  // A slight wrap: the top edge lifts toward the middle, the bottom dips.
  x.quadraticCurveTo(0, y - H / 2 - 0.05 * R * cb, W / 2 - r, y - H / 2);
  x.arc(W / 2 - r, y, r, -Math.PI / 2, Math.PI / 2);
  x.quadraticCurveTo(0, y + H / 2 + 0.03 * R * cb, -W / 2 + r, y + H / 2);
  x.arc(-W / 2 + r, y, r, Math.PI / 2, Math.PI * 1.5);
  x.closePath();
}

/** Strap and glass, under the eyes. The engine draws the glowing eyes next. */
export function drawVisorUnder(x: Ctx, p: AddonPose) {
  const { R, ca, cb } = p;
  const W = VISOR.w * R * ca;
  const y = VISOR.y * R * cb;

  // A slim strap round the head, wrapping darker toward its edges.
  const sh = 0.08 * R * cb;
  const sg = x.createLinearGradient(0, y - sh / 2, 0, y + sh / 2);
  sg.addColorStop(0, rgba(GRAPHITE_HI));
  sg.addColorStop(0.5, rgba(GRAPHITE));
  sg.addColorStop(1, rgba(GRAPHITE_LO));
  x.fillStyle = sg;
  x.fillRect(-1.5 * R, y - sh / 2, 3 * R, sh);
  const wrap = x.createLinearGradient(-1.1 * R, 0, 1.1 * R, 0);
  wrap.addColorStop(0, "rgba(0,0,0,0.6)");
  wrap.addColorStop(0.3, "rgba(0,0,0,0)");
  wrap.addColorStop(0.7, "rgba(0,0,0,0)");
  wrap.addColorStop(1, "rgba(0,0,0,0.6)");
  x.fillStyle = wrap;
  x.fillRect(-1.5 * R, y - sh / 2, 3 * R, sh);

  // Contact shadow on the plate, then the glass.
  x.save();
  x.shadowColor = rgba(SHADOW, 0.4);
  x.shadowBlur = 0.07 * R;
  x.shadowOffsetY = 0.03 * R;
  visorPath(x, R, ca, cb);
  x.fillStyle = "rgb(14,15,26)";
  x.fill();
  x.restore();

  visorPath(x, R, ca, cb);
  const H = VISOR.h * R * cb;
  const g = x.createLinearGradient(0, y - H / 2, 0, y + H / 2);
  g.addColorStop(0, "rgb(44,46,72)");
  g.addColorStop(0.55, "rgb(20,21,36)");
  g.addColorStop(1, "rgb(10,11,20)");
  x.fillStyle = g;
  x.fill();
  // A faint iridescent tint across the glass: violet to cyan.
  const tint = x.createLinearGradient(-W / 2, 0, W / 2, 0);
  tint.addColorStop(0, rgba(VIOLET, 0.28));
  tint.addColorStop(0.5, rgba(VIOLET, 0));
  tint.addColorStop(1, rgba(ACCENT, 0.18));
  x.fillStyle = tint;
  x.fill();
}

/** Reflections and edge light, over the eyes. */
export function drawVisorOver(x: Ctx, p: AddonPose) {
  const { R, ca, cb } = p;
  const W = VISOR.w * R * ca;
  const H = VISOR.h * R * cb;
  const y = VISOR.y * R * cb;

  x.save();
  visorPath(x, R, ca, cb);
  x.clip();
  // Two clean diagonal sheens, the broad one and a thin echo.
  x.fillStyle = "rgba(255,255,255,0.10)";
  x.beginPath();
  x.moveTo(-W * 0.36, y - H);
  x.lineTo(-W * 0.18, y - H);
  x.lineTo(-W * 0.4, y + H);
  x.lineTo(-W * 0.58, y + H);
  x.closePath();
  x.fill();
  x.fillStyle = "rgba(255,255,255,0.07)";
  x.beginPath();
  x.moveTo(-W * 0.12, y - H);
  x.lineTo(-W * 0.07, y - H);
  x.lineTo(-W * 0.29, y + H);
  x.lineTo(-W * 0.34, y + H);
  x.closePath();
  x.fill();
  // A soft top-light inside the glass.
  const top = x.createLinearGradient(0, y - H / 2, 0, y);
  top.addColorStop(0, "rgba(255,255,255,0.16)");
  top.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = top;
  x.fillRect(-W, y - H, 2 * W, H);
  x.restore();

  // Edge: a hairline rim, brighter along the top.
  visorPath(x, R, ca, cb);
  x.strokeStyle = "rgba(255,255,255,0.16)";
  x.lineWidth = 0.01 * R;
  x.stroke();
  x.beginPath();
  x.moveTo(-W / 2 + H * 0.5, y - H / 2 + 0.006 * R);
  x.quadraticCurveTo(0, y - H / 2 - 0.044 * R * cb, W / 2 - H * 0.5, y - H / 2 + 0.006 * R);
  x.strokeStyle = "rgba(255,255,255,0.42)";
  x.lineWidth = 0.012 * R;
  x.lineCap = "round";
  x.stroke();

  // The one accent: a thin cyan line along the lower edge, and a node light
  // where the strap meets the glass.
  x.save();
  x.shadowColor = LED_GLOW;
  x.shadowBlur = 0.05 * R;
  x.beginPath();
  x.moveTo(-W / 2 + H * 0.6, y + H / 2 - 0.004 * R);
  x.quadraticCurveTo(0, y + H / 2 + 0.026 * R * cb, W / 2 - H * 0.6, y + H / 2 - 0.004 * R);
  x.strokeStyle = rgba(ACCENT, 0.55);
  x.lineWidth = 0.008 * R;
  x.stroke();
  for (const sd of [-1, 1]) {
    x.beginPath();
    x.arc(sd * (W / 2 - 0.005 * R), y, 0.022 * R, 0, Math.PI * 2);
    x.fillStyle = LED_CORE;
    x.fill();
  }
  x.restore();
}

/* ------------------------------------------------------------------------ */
/* Headphones: a slim band over the top, two soft cups with a light ring.    */
/* ------------------------------------------------------------------------ */

function earPoint(p: AddonPose, sd: number) {
  const th = sd * (Math.PI / 2) + p.a;
  return {
    x: Math.sin(th) * 1.0 * p.R + sd * 0.05 * p.R,
    y: -0.04 * p.R,
    /** Toward the viewer (>0) or round the back (<0). */
    z: Math.cos(th),
  };
}

function drawEarcup(x: Ctx, p: AddonPose, sd: number) {
  const { R } = p;
  const e = earPoint(p, sd);
  const w = 0.21 * R;
  const h = 0.46 * R;
  const X = e.x - w / 2;
  const Y = e.y - h / 2;

  // Cushion: a darker sliver on the side that meets its head.
  x.fillStyle = rgba(GRAPHITE_LO);
  roundRect(x, X - sd * 0.035 * R, Y + 0.03 * R, w, h - 0.06 * R, w / 2);
  x.fill();

  // Shell, lit from the top right.
  x.save();
  x.shadowColor = rgba(SHADOW, 0.35);
  x.shadowBlur = 0.06 * R;
  x.shadowOffsetY = 0.02 * R;
  const g = x.createLinearGradient(X + w, Y, X, Y + h);
  g.addColorStop(0, rgba(GRAPHITE_HI));
  g.addColorStop(0.5, rgba(GRAPHITE));
  g.addColorStop(1, rgba(GRAPHITE_LO));
  x.fillStyle = g;
  roundRect(x, X, Y, w, h, w / 2);
  x.fill();
  x.restore();

  // Hairline highlight down the lit edge.
  x.strokeStyle = "rgba(255,255,255,0.18)";
  x.lineWidth = 0.008 * R;
  roundRect(x, X + 0.004 * R, Y + 0.004 * R, w - 0.008 * R, h - 0.008 * R, w / 2);
  x.stroke();

  // The accent ring: dim at rest, brighter when there is sound to hear.
  const glow = 0.35 + 0.65 * clamp(p.level, 0, 1);
  x.save();
  x.shadowColor = LED_GLOW;
  x.shadowBlur = 0.06 * R * glow;
  x.strokeStyle = rgba(ACCENT, 0.4 + 0.5 * glow);
  x.lineWidth = 0.014 * R;
  roundRect(x, X + w * 0.28, Y + h * 0.2, w * 0.44, h * 0.6, w * 0.22);
  x.stroke();
  x.restore();
}

function drawHeadband(x: Ctx, p: AddonPose) {
  const { R } = p;
  const L = earPoint(p, -1);
  const Rt = earPoint(p, 1);
  const y0 = L.y - 0.2 * R;
  const path = () => {
    x.beginPath();
    x.moveTo(L.x, y0);
    x.bezierCurveTo(L.x * 1.04, -1.33 * R, Rt.x * 1.04, -1.33 * R, Rt.x, y0);
  };
  x.lineCap = "round";
  path();
  x.strokeStyle = rgba(GRAPHITE);
  x.lineWidth = 0.075 * R;
  x.stroke();
  // The band's lit top edge.
  x.save();
  x.translate(0, -0.016 * R);
  path();
  x.strokeStyle = rgba(GRAPHITE_HI, 0.9);
  x.lineWidth = 0.022 * R;
  x.stroke();
  x.restore();
}

/* ------------------------------------------------------------------------ */
/* Beanie: a smooth violet knit with a folded cuff and a small pompom.       */
/* ------------------------------------------------------------------------ */

function drawBeanie(x: Ctx, p: AddonPose) {
  const { R, b, swayX, swayY } = p;
  const rx = 1.06 * R;
  const ry = 1.08 * R;
  const cuffY = (-0.58 + Math.sin(b) * 0.25) * R;
  const sag = 0.07 * R;
  const s = clamp(cuffY / ry, -0.99, 0.99);
  const half = (yy: number) => rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2));

  // Dome.
  const dome = new Path2D();
  dome.ellipse(0, 0, rx, ry, 0, Math.PI - Math.asin(s), 2 * Math.PI + Math.asin(s));
  dome.quadraticCurveTo(0, cuffY + sag, -half(cuffY), cuffY);
  dome.closePath();

  x.save();
  x.shadowColor = rgba(SHADOW, 0.3);
  x.shadowBlur = 0.06 * R;
  x.shadowOffsetY = 0.02 * R;
  const g = x.createRadialGradient(0.38 * R, -0.95 * R, 0, 0.38 * R, -0.95 * R, 1.5 * R);
  g.addColorStop(0, rgba(VIOLET_HI));
  g.addColorStop(0.45, rgba(VIOLET));
  g.addColorStop(1, rgba(VIOLET_LO));
  x.fillStyle = g;
  x.fill(dome);
  x.restore();

  // Knit ribs, curving with the head.
  x.save();
  x.clip(dome);
  const xc = half(cuffY);
  for (let i = -6; i <= 6; i++) {
    const xi = (i / 6.5) * xc;
    x.beginPath();
    x.moveTo(xi, cuffY + sag * (1 - (xi / xc) ** 2));
    x.quadraticCurveTo(xi * 1.02, -0.8 * ry, xi * 0.12, -ry);
    x.strokeStyle = "rgba(20,8,70,0.18)";
    x.lineWidth = 0.014 * R;
    x.stroke();
  }
  // Darker toward the shadow side, like the body.
  const side = x.createRadialGradient(0.35 * R, -0.2 * R, 0.8 * R, 0.35 * R, -0.2 * R, 1.5 * R);
  side.addColorStop(0, "rgba(10,0,40,0)");
  side.addColorStop(1, "rgba(10,0,40,0.4)");
  x.fillStyle = side;
  x.fillRect(-1.2 * R, -1.2 * R, 2.4 * R, 1.2 * R);
  x.restore();

  // Cuff: a folded band, a touch lighter, sitting proud of the dome.
  const t0 = cuffY - 0.04 * R;
  const t1 = cuffY + 0.15 * R;
  const cuff = new Path2D();
  const xt = half(t0) + 0.02 * R;
  const xb = half(Math.min(t1, ry * 0.99)) + 0.03 * R;
  cuff.moveTo(-xt, t0);
  cuff.quadraticCurveTo(0, t0 + sag, xt, t0);
  cuff.quadraticCurveTo(xt + 0.03 * R, (t0 + t1) / 2, xb, t1);
  cuff.quadraticCurveTo(0, t1 + sag * 1.25, -xb, t1);
  cuff.quadraticCurveTo(-xt - 0.03 * R, (t0 + t1) / 2, -xt, t0);
  cuff.closePath();

  x.save();
  x.shadowColor = rgba(SHADOW, 0.35);
  x.shadowBlur = 0.05 * R;
  x.shadowOffsetY = 0.025 * R;
  const cg = x.createLinearGradient(0, t0, 0, t1 + sag);
  cg.addColorStop(0, rgba(VIOLET_HI));
  cg.addColorStop(1, rgba(VIOLET));
  x.fillStyle = cg;
  x.fill(cuff);
  x.restore();
  x.save();
  x.clip(cuff);
  for (let xi = -xb; xi <= xb; xi += 0.085 * R) {
    x.beginPath();
    x.moveTo(xi, t0 - 0.05 * R);
    x.lineTo(xi, t1 + sag * 1.4);
    x.strokeStyle = "rgba(20,8,70,0.16)";
    x.lineWidth = 0.012 * R;
    x.stroke();
  }
  const wrap = x.createLinearGradient(-xb, 0, xb, 0);
  wrap.addColorStop(0, "rgba(10,0,40,0.45)");
  wrap.addColorStop(0.25, "rgba(10,0,40,0)");
  wrap.addColorStop(0.75, "rgba(10,0,40,0)");
  wrap.addColorStop(1, "rgba(10,0,40,0.35)");
  x.fillStyle = wrap;
  x.fillRect(-1.2 * R, t0 - 0.05 * R, 2.4 * R, t1 - t0 + 0.2 * R);
  x.restore();
  x.beginPath();
  x.moveTo(-xt * 0.92, t0 + 0.012 * R);
  x.quadraticCurveTo(0, t0 + sag + 0.012 * R, xt * 0.92, t0 + 0.012 * R);
  x.strokeStyle = "rgba(255,255,255,0.28)";
  x.lineWidth = 0.012 * R;
  x.lineCap = "round";
  x.stroke();

  // Pompom: small, soft, and late to follow it.
  const px = swayX * 0.12 * R;
  const py = -ry - 0.05 * R + swayY * 0.05 * R;
  const pr = 0.12 * R;
  const pg = x.createRadialGradient(px + pr * 0.35, py - pr * 0.4, 0, px, py, pr * 1.3);
  pg.addColorStop(0, "rgb(236,230,255)");
  pg.addColorStop(0.55, rgba(VIOLET_HI));
  pg.addColorStop(1, rgba(VIOLET));
  x.fillStyle = pg;
  x.beginPath();
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    x.moveTo(px + Math.cos(ang) * pr * 0.78 + pr * 0.36, py + Math.sin(ang) * pr * 0.78);
    x.arc(px + Math.cos(ang) * pr * 0.78, py + Math.sin(ang) * pr * 0.78, pr * 0.36, 0, Math.PI * 2);
  }
  x.moveTo(px + pr * 0.85, py);
  x.arc(px, py, pr * 0.85, 0, Math.PI * 2);
  x.fill();
}

/* ------------------------------------------------------------------------ */
/* Muffler: a violet knit collar round its lower half, its tail swaying.     */
/* ------------------------------------------------------------------------ */

function drawMuffler(x: Ctx, p: AddonPose) {
  const { R, a, b, swayX, swayY, tilt } = p;
  const topY = (0.56 + Math.sin(b) * 0.12) * R;
  const T = 0.24 * R;
  const botY = topY + T;
  const half = (yy: number) => 1.03 * R * Math.sqrt(Math.max(0, 1 - (yy / R) ** 2)) + 0.04 * R;
  const xt = half(topY);
  const xb = half(botY);
  const mid = (topY + botY) / 2;

  const band = new Path2D();
  band.moveTo(-xt, topY);
  band.quadraticCurveTo(0, topY + 0.1 * R, xt, topY);
  band.quadraticCurveTo(xt + 0.03 * R, mid, xb, botY);
  band.quadraticCurveTo(0, botY + 0.12 * R, -xb, botY);
  band.quadraticCurveTo(-xt - 0.03 * R, mid, -xt, topY);
  band.closePath();

  x.save();
  x.shadowColor = rgba(SHADOW, 0.4);
  x.shadowBlur = 0.07 * R;
  x.shadowOffsetY = 0.03 * R;
  const g = x.createLinearGradient(0, topY, 0, botY + 0.12 * R);
  g.addColorStop(0, rgba(VIOLET_HI));
  g.addColorStop(0.5, rgba(VIOLET));
  g.addColorStop(1, rgba(VIOLET_LO));
  x.fillStyle = g;
  x.fill(band);
  x.restore();

  x.save();
  x.clip(band);
  // Two fine stripes following the curve: the only pattern.
  for (const f of [0.34, 0.66]) {
    const yy = topY + T * f;
    x.beginPath();
    x.moveTo(-xt, yy);
    x.quadraticCurveTo(0, yy + 0.11 * R, xt, yy);
    x.strokeStyle = "rgba(255,255,255,0.2)";
    x.lineWidth = 0.018 * R;
    x.stroke();
  }
  const wrap = x.createLinearGradient(-xt, 0, xt, 0);
  wrap.addColorStop(0, "rgba(10,0,40,0.5)");
  wrap.addColorStop(0.25, "rgba(10,0,40,0)");
  wrap.addColorStop(0.75, "rgba(10,0,40,0)");
  wrap.addColorStop(1, "rgba(10,0,40,0.4)");
  x.fillStyle = wrap;
  x.fillRect(-1.2 * R, topY - 0.1 * R, 2.4 * R, T + 0.3 * R);
  x.restore();
  x.beginPath();
  x.moveTo(-xt * 0.9, topY + 0.012 * R);
  x.quadraticCurveTo(0, topY + 0.112 * R, xt * 0.9, topY + 0.012 * R);
  x.strokeStyle = "rgba(255,255,255,0.3)";
  x.lineWidth = 0.012 * R;
  x.lineCap = "round";
  x.stroke();

  // The tail hangs from a knot at its front right, and swings when it moves.
  const lon = 0.42 + a;
  if (Math.cos(lon) < 0.1) return;
  const ax = Math.sin(lon) * 0.82 * R;
  const ay = mid + 0.05 * R;
  const L = (0.5 + swayY * 0.05) * R;
  x.save();
  x.translate(ax, ay);
  x.rotate(0.12 + swayX * 0.5 - tilt);
  const w0 = 0.2 * R;
  const w1 = 0.17 * R;
  const tail = new Path2D();
  tail.moveTo(-w0 / 2, 0);
  tail.lineTo(w0 / 2, 0);
  tail.lineTo(w1 / 2, L - w1 * 0.3);
  tail.quadraticCurveTo(w1 / 2, L, w1 * 0.2, L);
  tail.lineTo(-w1 * 0.2, L);
  tail.quadraticCurveTo(-w1 / 2, L, -w1 / 2, L - w1 * 0.3);
  tail.closePath();
  x.save();
  x.shadowColor = rgba(SHADOW, 0.4);
  x.shadowBlur = 0.06 * R;
  x.shadowOffsetX = -0.02 * R;
  x.shadowOffsetY = 0.02 * R;
  const tg = x.createLinearGradient(-w0 / 2, 0, w0 / 2, 0);
  tg.addColorStop(0, rgba(VIOLET_LO));
  tg.addColorStop(0.45, rgba(VIOLET));
  tg.addColorStop(1, rgba(VIOLET_HI));
  x.fillStyle = tg;
  x.fill(tail);
  x.restore();
  x.save();
  x.clip(tail);
  for (const f of [0.34, 0.66]) {
    x.beginPath();
    x.moveTo(-w0 / 2 + w0 * f, 0);
    x.lineTo(-w1 / 2 + w1 * f, L);
    x.strokeStyle = "rgba(255,255,255,0.2)";
    x.lineWidth = 0.016 * R;
    x.stroke();
  }
  x.restore();
  // Fringe.
  x.strokeStyle = rgba(VIOLET);
  x.lineWidth = 0.016 * R;
  x.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const fxp = -w1 * 0.36 + (i / 4) * w1 * 0.72;
    x.beginPath();
    x.moveTo(fxp, L - 0.01 * R);
    x.lineTo(fxp + swayX * 0.01 * R, L + 0.055 * R);
    x.stroke();
  }
  x.restore();

  // Knot.
  const kg = x.createRadialGradient(ax + 0.03 * R, ay - 0.05 * R, 0, ax, ay - 0.02 * R, 0.13 * R);
  kg.addColorStop(0, rgba(VIOLET_HI));
  kg.addColorStop(1, rgba(VIOLET_LO));
  x.fillStyle = kg;
  x.beginPath();
  x.ellipse(ax, ay - 0.02 * R, 0.1 * R, 0.085 * R, -0.2, 0, Math.PI * 2);
  x.fill();
}

/* ------------------------------------------------------------------------ */
/* Goggles: clear blue-grey glass in a glossy white frame, with a cut-out     */
/* for the bridge of the nose. Its own eyes show through, so every            */
/* expression still reads. Drawn in the face-plate frame, like the visor.    */
/* ------------------------------------------------------------------------ */

/*
 * The goggles move rigidly with its face plate, exactly as its eyes do, so
 * the shape stays clean and its eyes stay centred in the lenses at any
 * glance. Their outline is laid out flat (u across, v down, in R, around the
 * face plate's centre) and given only a gentle wrap: a wide cylinder
 * (GOGGLE_WRAP) that narrows the end turning away a touch. A tight wrap, or
 * tilting the ends with its pitch, bent the band out of shape at full turn.
 */
const GOGGLE = {
  halfW: 0.82,
  top: -0.43,
  bottom: 0.28,
  corner: 0.32, // pill-round ends
  arch: 0.03, // the top edge lifts a little toward the middle
  nose: 0.14, // how far the nose cut-out rises: a broad, shallow curve
  noseWidth: 0.27,
  rim: 0.042,
};
const GOGGLE_WRAP = 2.2;

type Pt = [number, number];

/** The flat outline, inset by `inset` (in R): inset by the rim's width, it is the glass. */
function gogglesOutline(inset: number): Pt[] {
  const g = GOGGLE;
  const W2 = g.halfW - inset;
  const v0 = (g.top + g.bottom) / 2;
  const H2 = (g.bottom - g.top) / 2 - inset;
  const r = Math.max(0.02, g.corner - inset * 0.6);
  const pts: Pt[] = [];
  const edge = (u0: number, v0_: number, u1: number, v1: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(u1 - u0, v1 - v0_) / 0.04));
    for (let i = 0; i < n; i++) pts.push([u0 + ((u1 - u0) * i) / n, v0_ + ((v1 - v0_) * i) / n]);
  };
  const corner = (cu: number, cv: number, a0: number, a1: number) => {
    for (let i = 0; i < 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      pts.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]);
    }
  };
  const T = v0 - H2;
  const B = v0 + H2;
  edge(-W2 + r, T, W2 - r, T);
  corner(W2 - r, T + r, -Math.PI / 2, 0);
  edge(W2, T + r, W2, B - r);
  corner(W2 - r, B - r, 0, Math.PI / 2);
  edge(W2 - r, B, -W2 + r, B);
  corner(-W2 + r, B - r, Math.PI / 2, Math.PI);
  edge(-W2, B - r, -W2, T + r);
  corner(-W2 + r, T + r, Math.PI, Math.PI * 1.5);
  // Shape it: the top arches up a touch, the bottom rises for the nose.
  return pts.map(([u, v]) => {
    const across = 1 - Math.min(1, (u / W2) ** 2);
    if (v < v0) return [u, v - g.arch * across];
    const low = Math.min(1, Math.max(0, (v - v0) / H2)) ** 2;
    const noseRise = (g.nose - inset * 0.4) * Math.exp(-((u / g.noseWidth) ** 2));
    return [u, v - noseRise * low];
  });
}

/** A flat point (in R) placed on the goggles' cylinder and turned with it, in the face-plate frame. */
function wrapPoint(p: AddonPose, u: number, v: number): Pt {
  const { R, ca, cb } = p;
  const phi = Math.asin(Math.max(-0.99, Math.min(0.99, u / GOGGLE_WRAP)));
  const sag = GOGGLE_WRAP * (1 - Math.cos(phi)); // how far this point curves back from the plate
  return [(GOGGLE_WRAP * Math.sin(phi) * ca - sag * Math.sin(p.a)) * R, v * cb * R];
}

function wrapPath(p: AddonPose, pts: Pt[], path = new Path2D()): Path2D {
  pts.forEach(([u, v], i) => {
    const [x, y] = wrapPoint(p, u, v);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return path;
}

/** How much the surface at `u` is foreshortened on screen, for sizing things drawn on it. */
function wrapScale(p: AddonPose, u: number): number {
  const phi = Math.asin(Math.max(-0.99, Math.min(0.99, u / GOGGLE_WRAP)));
  return Math.max(0.15, p.ca - Math.tan(phi) * Math.sin(p.a));
}

/** Shadow on the plate and the glass, under the eyes. */
export function drawGogglesUnder(x: Ctx, p: AddonPose) {
  const { R } = p;
  const outer = wrapPath(p, gogglesOutline(0));
  const glass = wrapPath(p, gogglesOutline(GOGGLE.rim));

  x.save();
  x.shadowColor = rgba(SHADOW, 0.32);
  x.shadowBlur = 0.08 * R;
  x.shadowOffsetY = 0.035 * R;
  x.fillStyle = "rgb(205,210,222)";
  x.fill(outer);
  x.restore();

  // Glass: a darker grey-blue band at the top, clearing to lavender below.
  const g = x.createLinearGradient(0, GOGGLE.top * R, 0, GOGGLE.bottom * R);
  g.addColorStop(0, "rgb(80,90,118)");
  g.addColorStop(0.45, "rgb(134,148,184)");
  g.addColorStop(1, "rgb(188,203,234)");
  x.fillStyle = g;
  x.fill(glass);
  // The end turning away from the viewer darkens as the glass turns edge-on.
  const [lx] = wrapPoint(p, -GOGGLE.halfW, 0);
  const [rx] = wrapPoint(p, GOGGLE.halfW, 0);
  const wrap = x.createLinearGradient(lx, 0, rx, 0);
  const away = Math.sin(p.a);
  wrap.addColorStop(0, `rgba(30,40,70,${0.2 + Math.max(0, -away) * 0.2})`);
  wrap.addColorStop(0.2, "rgba(30,40,70,0)");
  wrap.addColorStop(0.8, "rgba(30,40,70,0)");
  wrap.addColorStop(1, `rgba(30,40,70,${0.16 + Math.max(0, away) * 0.2})`);
  x.fillStyle = wrap;
  x.fill(glass);
}

/** Light in the glass, then the thin white rim over its edge. */
export function drawGogglesOver(x: Ctx, p: AddonPose) {
  const { R } = p;
  const outer = wrapPath(p, gogglesOutline(0));
  const glass = wrapPath(p, gogglesOutline(GOGGLE.rim));

  x.save();
  x.clip(glass);
  // Sky along the top of the glass.
  const top = x.createLinearGradient(0, (GOGGLE.top + 0.02) * R, 0, (GOGGLE.top + 0.2) * R);
  top.addColorStop(0, "rgba(255,255,255,0.3)");
  top.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = top;
  x.fillRect(-1.5 * R, -0.6 * R, 3 * R, 0.5 * R);
  // Blue light caught inside each end, brighter on the left.
  for (const [sd, a] of [[-1, 1], [1, 0.55]] as const) {
    const u = sd * (GOGGLE.halfW - 0.11);
    const [ex, ey] = wrapPoint(p, u, -0.07);
    const k = wrapScale(p, u);
    const glow = x.createRadialGradient(ex, ey, 0.02 * R, ex, ey, 0.3 * R);
    glow.addColorStop(0, `rgba(160,205,255,${0.36 * a})`);
    glow.addColorStop(1, "rgba(160,205,255,0)");
    x.fillStyle = glow;
    x.fillRect(ex - 0.4 * R, ey - 0.45 * R, 0.8 * R, 0.9 * R);
    const streak = x.createLinearGradient(0, ey - 0.2 * R, 0, ey + 0.2 * R);
    streak.addColorStop(0, "rgba(195,228,255,0)");
    streak.addColorStop(0.5, `rgba(195,228,255,${a})`);
    streak.addColorStop(1, "rgba(195,228,255,0)");
    x.fillStyle = streak;
    x.beginPath();
    x.ellipse(ex - sd * 0.03 * R * k, ey, 0.038 * R * k, 0.22 * R, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();

  // A soft dark line where the glass meets the rim.
  x.strokeStyle = "rgba(40,50,80,0.35)";
  x.lineWidth = 0.01 * R;
  x.stroke(glass);

  // The rim: a thin glossy white band -- the outline minus the glass.
  const ring = wrapPath(p, gogglesOutline(0));
  wrapPath(p, gogglesOutline(GOGGLE.rim), ring);
  const rg = x.createLinearGradient(0, GOGGLE.top * R, 0, GOGGLE.bottom * R);
  rg.addColorStop(0, "rgb(255,255,255)");
  rg.addColorStop(0.6, "rgb(238,242,252)");
  rg.addColorStop(1, "rgb(202,211,234)");
  x.fillStyle = rg;
  x.fill(ring, "evenodd");
  // Gloss along the top of the rim.
  x.save();
  x.clip(ring, "evenodd");
  const gloss = new Path2D();
  for (let i = 0; i <= 24; i++) {
    const u = -0.55 * GOGGLE.halfW + (1.1 * GOGGLE.halfW * i) / 24;
    const across = 1 - (u / GOGGLE.halfW) ** 2;
    const [gx, gy] = wrapPoint(p, u, GOGGLE.top + GOGGLE.rim * 0.45 - GOGGLE.arch * across);
    if (i === 0) gloss.moveTo(gx, gy);
    else gloss.lineTo(gx, gy);
  }
  x.strokeStyle = "rgba(255,255,255,0.95)";
  x.lineWidth = 0.014 * R;
  x.lineCap = "round";
  x.stroke(gloss);
  x.restore();
  x.strokeStyle = "rgba(110,120,150,0.35)";
  x.lineWidth = 0.007 * R;
  x.stroke(outer);
}

/* ------------------------------------------------------------------------ */
/* Studio headphones: silver cups on grey mesh cushions, metal stems, and a  */
/* white headband with a mesh canopy resting on its head.                    */
/* ------------------------------------------------------------------------ */


/** A fine woven texture: a light cross-hatch over whatever is clipped. */
function mesh(x: Ctx, X: number, Y: number, W: number, H: number, R: number) {
  const step = 0.014 * R;
  x.lineWidth = 0.0035 * R;
  for (const [dir, a] of [[1, 0.1], [-1, 0.07]] as const) {
    x.strokeStyle = `rgba(70,70,80,${a})`;
    x.beginPath();
    for (let d = -H; d < W + H; d += step) {
      x.moveTo(X + d, Y);
      x.lineTo(X + d + dir * H, Y + H);
    }
    x.stroke();
  }
}

/*
 * Proportions (in R, the body's radius): the
 * cushion starts right at its silhouette and a slim shell reaches ~1.3 R, cups
 * ~1 R tall at eye level; a wide frame arch comes down to short steel arms.
 * The band sits low over its head (apex 1.2 R), and its slim mesh canopy,
 * ~±0.8 R wide, is fixed to the underside of the frame, following the frame's
 * curve rather than its head's.
 *
 * The cups are drawn as real 3D extrusions along its ear axis, projected for
 * its yaw: as it turns, the near cup swings toward the viewer and broadens
 * into its rounded shape, and the far one slides behind its head. The band lives
 * in the same ear plane, so it stays attached to them at every angle.
 */
const STUDIO = {
  cy: 0.04,
  cushion: { d0: 0.96, d1: 1.16, h: 0.9, depth: 0.74 },
  shell: { d0: 1.13, d1: 1.3, h: 0.98, depth: 0.8 },
  stemD: 1.17,
  frame: { rx: 1.33, ry: 1.2, w: 0.1 },
  canopy: { w: 0.11, half: 0.8 },
};

/** Its ear axis on screen: where it points (nx), toward the viewer (nz), and how much a cup's face opens (tx). */
function earAxis(p: AddonPose, sd: number) {
  return { nx: sd * Math.cos(p.a), nz: -sd * Math.sin(p.a), tx: Math.abs(Math.sin(p.a)) };
}

/**
 * One part of a cup (cushion or shell), extruded between distances d0 and d1
 * along the ear axis and projected: one solid shape, the hull of its two ends.
 */
function cupPart(
  p: AddonPose,
  sd: number,
  part: { d0: number; d1: number; h: number; depth: number },
  rOuter: { x: number; y: number },
  rInner: { x: number; y: number },
) {
  const { R } = p;
  const ax = earAxis(p, sd);
  const xi = part.d0 * R * ax.nx;
  const xo = part.d1 * R * ax.nx;
  const w = (part.depth * R * ax.tx) / 2; // half-width of an end, seen at this yaw
  const cy = STUDIO.cy * R;
  const h = part.h * R;
  const left = Math.min(xi, xo) - w;
  const right = Math.max(xi, xo) + w;
  const outerRight = xo > xi;
  // Corners: a soft "D" seen side-on, opening into the cup's broad rounded
  // ends as its face turns toward the viewer.
  const open = Math.min(1, w / (0.2 * R));
  const ro = { x: rOuter.x * R + w, y: (rOuter.y + 0.12 * open) * R };
  const rn = { x: rInner.x * R + w, y: (rInner.y + 0.22 * open) * R };
  const wall = new Path2D();
  wall.roundRect(left, cy - h / 2, right - left, h, outerRight ? [rn, ro, ro, rn] : [ro, rn, rn, ro]);
  return { wall, xi, xo, w, left, right, top: cy - h / 2, bottom: cy + h / 2, outerRight, ax };
}

function drawStudioCup(x: Ctx, p: AddonPose, sd: number) {
  const { R } = p;
  const cush = cupPart(p, sd, STUDIO.cushion, { x: 0.1, y: 0.16 }, { x: 0.08, y: 0.14 });
  const shell = cupPart(p, sd, STUDIO.shell, { x: 0.19, y: 0.3 }, { x: 0.05, y: 0.12 });

  // Contact shadow where the cushion meets its head.
  x.save();
  x.beginPath();
  x.ellipse(0, 0, 1.03 * R, R, 0, 0, Math.PI * 2);
  x.clip();
  const sx = cush.xi;
  const sg = x.createRadialGradient(sx, STUDIO.cy * R, 0, sx, STUDIO.cy * R, 0.34 * R);
  sg.addColorStop(0, "rgba(10,12,30,0.34)");
  sg.addColorStop(1, "rgba(10,12,30,0)");
  x.fillStyle = sg;
  x.beginPath();
  x.ellipse(sx, STUDIO.cy * R, 0.24 * R, 0.56 * R, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();

  // Cushion: knit, soft, rounded; lit from above, shaded where it presses.
  const cg = x.createLinearGradient(0, cush.top, 0, cush.bottom);
  cg.addColorStop(0, "rgb(214,214,219)");
  cg.addColorStop(0.5, "rgb(196,196,202)");
  cg.addColorStop(1, "rgb(158,159,168)");
  x.fillStyle = cg;
  x.fill(cush.wall);
  x.save();
  x.clip(cush.wall);
  mesh(x, cush.left, cush.top, cush.right - cush.left, cush.bottom - cush.top, R);
  // Darker along the edge against its head.
  const headSide = cush.outerRight ? cush.left : cush.right;
  const hs = x.createLinearGradient(headSide, 0, headSide + (cush.outerRight ? 1 : -1) * 0.1 * R, 0);
  hs.addColorStop(0, "rgba(40,40,60,0.3)");
  hs.addColorStop(1, "rgba(40,40,60,0)");
  x.fillStyle = hs;
  x.fillRect(cush.left, cush.top, cush.right - cush.left, cush.bottom - cush.top);
  x.restore();

  // Shell side wall: anodized aluminium, curving away top and bottom.
  x.save();
  x.shadowColor = rgba(SHADOW, 0.42);
  x.shadowBlur = 0.09 * R;
  x.shadowOffsetY = 0.04 * R;
  x.fillStyle = "rgb(214,218,228)";
  x.fill(shell.wall);
  x.restore();
  const wg = x.createLinearGradient(0, shell.top, 0, shell.bottom);
  wg.addColorStop(0, "rgb(246,247,250)");
  wg.addColorStop(0.3, "rgb(228,231,238)");
  wg.addColorStop(0.65, "rgb(198,203,216)");
  wg.addColorStop(1, "rgb(150,156,176)");
  x.fillStyle = wg;
  x.fill(shell.wall);
  x.save();
  x.clip(shell.wall);
  // Across the wall: shade where it meets the cushion, a bright fillet at the outer edge.
  const inEdge = shell.outerRight ? shell.left : shell.right;
  const outEdge = shell.outerRight ? shell.right : shell.left;
  const dir = shell.outerRight ? 1 : -1;
  const across = x.createLinearGradient(inEdge, 0, outEdge, 0);
  across.addColorStop(0, "rgba(70,78,104,0.28)");
  across.addColorStop(0.25, "rgba(70,78,104,0)");
  across.addColorStop(0.78, "rgba(255,255,255,0.0)");
  across.addColorStop(0.9, "rgba(255,255,255,0.55)");
  across.addColorStop(1, "rgba(120,128,150,0.25)");
  x.fillStyle = across;
  x.fillRect(shell.left, shell.top, shell.right - shell.left, shell.bottom - shell.top);
  // A soft specular bloom high on the outer side.
  const bx = outEdge - dir * 0.09 * R;
  const by = shell.top + 0.24 * R;
  const bloom = x.createRadialGradient(bx, by, 0, bx, by, 0.26 * R);
  bloom.addColorStop(0, "rgba(255,255,255,0.6)");
  bloom.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = bloom;
  x.fillRect(shell.left, shell.top, shell.right - shell.left, shell.bottom - shell.top);
  x.restore();

  // Edge definition.
  x.strokeStyle = "rgba(96,104,128,0.4)";
  x.lineWidth = 0.007 * R;
  x.stroke(shell.wall);

  // Round the back of its head, the cup sits in its shadow.
  if (shell.ax.nz < -0.05) {
    x.fillStyle = `rgba(16,18,34,${Math.min(0.35, -shell.ax.nz * 0.6)})`;
    x.fill(shell.wall);
    x.fill(cush.wall);
  }
}

/** The canopy: a slim knit strap fixed to the underside of the frame. */
function drawStudioCanopy(x: Ctx, p: AddonPose) {
  const { R, ca } = p;
  const c = STUDIO.canopy;
  const f = STUDIO.frame;
  const w = (c.w + 0.04 * Math.abs(Math.sin(p.a))) * R;
  // Concentric with the frame, its top edge tucked just under the frame's inner edge.
  const inset = f.w / 2 + c.w / 2 - 0.01;
  const rx = f.rx - inset;
  const ry = f.ry - inset;
  // Ends at ±half R across, on screen before the yaw narrows it.
  const tEnd = Math.acos(Math.min(0.999, c.half / rx));
  const t0 = -Math.PI + tEnd;
  const t1 = -tEnd;
  const band = arcBand(rx * R * ca, ry * R, w, t0, t1);
  x.save();
  x.shadowColor = "rgba(10,12,30,0.3)";
  x.shadowBlur = 0.04 * R;
  x.shadowOffsetY = 0.015 * R;
  const g = x.createLinearGradient(0, -1.25 * R, 0, -0.75 * R);
  g.addColorStop(0, "rgb(232,232,236)");
  g.addColorStop(1, "rgb(196,196,203)");
  x.fillStyle = g;
  x.fill(band);
  x.restore();
  x.strokeStyle = "rgba(120,122,136,0.45)";
  x.lineWidth = 0.007 * R;
  x.stroke(band);
  x.save();
  x.clip(band);
  mesh(x, -1.3 * R, -1.4 * R, 2.6 * R, 0.9 * R, R);
  const ends = x.createLinearGradient(-0.85 * R, 0, 0.85 * R, 0);
  ends.addColorStop(0, "rgba(20,20,40,0.28)");
  ends.addColorStop(0.3, "rgba(20,20,40,0)");
  ends.addColorStop(0.7, "rgba(20,20,40,0)");
  ends.addColorStop(1, "rgba(20,20,40,0.28)");
  x.fillStyle = ends;
  x.fillRect(-1.3 * R, -1.4 * R, 2.6 * R, 0.9 * R);
  x.restore();
}

/** A band along an ellipse arc, from angle t0 to t1, with rounded ends. */
function arcBand(rx: number, ry: number, w: number, t0: number, t1: number): Path2D {
  const path = new Path2D();
  path.ellipse(0, 0, rx + w / 2, ry + w / 2, 0, t0, t1);
  path.arc(rx * Math.cos(t1), ry * Math.sin(t1), w / 2, t1, t1 + Math.PI);
  path.ellipse(0, 0, rx - w / 2, ry - w / 2, 0, t1, t0, true);
  path.arc(rx * Math.cos(t0), ry * Math.sin(t0), w / 2, t0 + Math.PI, t0 + Math.PI * 2);
  path.closePath();
  return path;
}

/** The frame: a wide white arch in its ear plane, ending in hinges over the steel arms. */
function drawStudioFrame(x: Ctx, p: AddonPose) {
  const { R, ca } = p;
  const f = STUDIO.frame;
  const w = (f.w + 0.03 * Math.abs(Math.sin(p.a))) * R;
  // The arch ends right above the arms: x = stemD·cos(yaw) on screen.
  const tEnd = Math.acos(Math.min(0.999, STUDIO.stemD / f.rx));
  const t0 = -Math.PI + tEnd;
  const t1 = -tEnd;
  const rx = f.rx * R * ca;
  const ry = f.ry * R;
  const ends = [t0, t1].map((t) => ({ x: rx * Math.cos(t), y: ry * Math.sin(t) }));

  // Steel arms, from the arch's ends down into the top of each cup.
  for (const end of ends) {
    const y1 = (STUDIO.cy - STUDIO.shell.h / 2 + 0.04) * R;
    const aw = 0.042 * R;
    const ag = x.createLinearGradient(end.x - aw / 2, 0, end.x + aw / 2, 0);
    ag.addColorStop(0, "rgb(92,96,108)");
    ag.addColorStop(0.42, "rgb(248,249,251)");
    ag.addColorStop(0.62, "rgb(196,200,210)");
    ag.addColorStop(1, "rgb(86,90,102)");
    x.fillStyle = ag;
    x.fillRect(end.x - aw / 2, end.y, aw, Math.max(0, y1 - end.y));
    x.fillStyle = "rgba(50,54,68,0.5)";
    x.fillRect(end.x - aw / 2, end.y + 0.035 * R, aw, 0.01 * R);
  }

  const band = arcBand(rx, ry, w, t0, t1);
  x.save();
  x.shadowColor = "rgba(10,12,30,0.28)";
  x.shadowBlur = 0.05 * R;
  x.shadowOffsetY = 0.02 * R;
  const g = x.createLinearGradient(0, -1.35 * R, 0, -0.5 * R);
  g.addColorStop(0, "rgb(253,253,255)");
  g.addColorStop(1, "rgb(218,222,232)");
  x.fillStyle = g;
  x.fill(band);
  x.restore();
  x.save();
  x.clip(band);
  // Gloss along the top edge, grey shade along the underside.
  x.beginPath();
  x.ellipse(0, 0, rx + w * 0.2, ry + w * 0.2, 0, t0, t1);
  x.strokeStyle = "rgba(255,255,255,0.95)";
  x.lineWidth = w * 0.3;
  x.stroke();
  x.beginPath();
  x.ellipse(0, 0, rx - w * 0.42, ry - w * 0.42, 0, t0, t1);
  x.strokeStyle = "rgba(140,146,166,0.5)";
  x.lineWidth = w * 0.22;
  x.stroke();
  x.restore();

  // Hinge knuckles where the arch meets each arm.
  for (const end of ends) {
    const kw = 0.07 * R;
    const kh = 0.1 * R;
    const k = new Path2D();
    k.roundRect(end.x - kw / 2, end.y - kh * 0.35, kw, kh, kw * 0.45);
    const kg = x.createLinearGradient(end.x - kw / 2, 0, end.x + kw / 2, 0);
    kg.addColorStop(0, "rgb(214,218,228)");
    kg.addColorStop(0.45, "rgb(252,253,255)");
    kg.addColorStop(1, "rgb(196,201,214)");
    x.fillStyle = kg;
    x.fill(k);
    x.strokeStyle = "rgba(110,118,140,0.4)";
    x.lineWidth = 0.006 * R;
    x.stroke(k);
  }
}

function drawStudio(x: Ctx, p: AddonPose, front: boolean) {
  // A cup whose axis points away from the viewer is round the back of its head.
  const behind = (sd: number) => earAxis(p, sd).nz < -0.05;
  if (!front) {
    for (const sd of [-1, 1]) if (behind(sd)) drawStudioCup(x, p, sd);
    return;
  }
  drawStudioCanopy(x, p);
  drawStudioFrame(x, p);
  for (const sd of [-1, 1]) if (!behind(sd)) drawStudioCup(x, p, sd);
}

function roundRect(x: Ctx, X: number, Y: number, W: number, H: number, r: number) {
  const rr = Math.max(0, Math.min(r, W / 2, H / 2));
  x.beginPath();
  x.moveTo(X + rr, Y);
  x.arcTo(X + W, Y, X + W, Y + H, rr);
  x.arcTo(X + W, Y + H, X, Y + H, rr);
  x.arcTo(X, Y + H, X, Y, rr);
  x.arcTo(X, Y, X + W, Y, rr);
  x.closePath();
}

/* ------------------------------------------------------------------------ */
/* Layers the engine calls.                                                  */
/* ------------------------------------------------------------------------ */

/** Before the body: whatever is round the back of it. */
export function drawAddonsBehind(x: Ctx, addons: ReadonlySet<MascotAddon>, p: AddonPose) {
  if (addons.has("headphones")) {
    for (const sd of [-1, 1]) if (earPoint(p, sd).z < -0.12) drawEarcup(x, p, sd);
  }
  if (addons.has("studio")) drawStudio(x, p, false);
}

/** After the face: everything on the front of it, back to front. */
export function drawAddonsFront(x: Ctx, addons: ReadonlySet<MascotAddon>, p: AddonPose) {
  if (addons.has("muffler")) drawMuffler(x, p);
  if (addons.has("beanie")) drawBeanie(x, p);
  if (addons.has("headphones")) {
    drawHeadband(x, p);
    for (const sd of [-1, 1]) if (earPoint(p, sd).z >= -0.12) drawEarcup(x, p, sd);
  }
  if (addons.has("studio")) drawStudio(x, p, true);
}
