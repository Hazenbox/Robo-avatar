"use client";

/**
 * Robo's body as a solid that turns with it, rendered on the GPU.
 *
 * Its face turns by sliding across the body (the original bot's yaw and pitch). On
 * its own smooth, round body that is all a turn needs -- a plain ball looks
 * the same from every side -- and that body is still drawn in 2D, exactly as
 * it always was. A coat of fur, or any other shape, has to turn with it too,
 * or it reads as a flat cutout with a face sliding over it. So those bodies
 * are drawn here, in two passes:
 *
 *  1. Ray-march the body as a solid: the round body is a ball; the other
 *     shapes are their outline extruded into a plush cushion, a little puffed
 *     in the middle, with rounded edges. The solid is turned so its front
 *     point lands exactly where its face does. Each pixel keeps the point of
 *     the body it sees, in the body's own coordinates.
 *  2. Shade it, lights fixed in the room. Smooth shapes get the same light
 *     and rims as it 2D body, worked out from the surface's direction (on a
 *     ball that is exactly the 2D drawing). Fur is shell texturing (Lengyel,
 *     Praun, Finkelstein and Hoppe, "Real-time fur over arbitrary surfaces",
 *     I3D 2001; the same idea as Babylon.js's FurMaterial and
 *     keaukraine/webgl-fur): 32 stacked shells of tapering hairs, gathered
 *     into irregular tufts. Hairs are laid out in the body's own coordinates
 *     (projected along whichever axis the surface faces, blended where that
 *     changes), so the pile turns with it instead of swimming.
 *
 * Software renderers (headless browsers and virtual machines without a GPU) are too
 * slow to redraw as it turns; there the body is drawn once, facing forward.
 * Returns false where WebGL2 or float render targets are missing; the caller
 * falls back to the 2D body and fur in body.
 */

import { bodyOutline } from "./body";
import { FUR_PARAM_KEYS, furVector } from "./fur-style";
import type { BodyShape } from "./look";

/** A drawing covers [-EXTENT, EXTENT]² in R: room for the sparkle's points, turned, plus the fur. */
export const BODY_EXTENT = 1.5;
/** The distance field covers a little more than the drawing. */
const SDF_EXTENT = 1.7;
const SDF_SIZE = 256;
/** How many settings the coat has: the shader's parameter array. */
const FUR_SLOTS = FUR_PARAM_KEYS.length;
/** Largest drawing, in device pixels per R; bigger draws scale it up. */
const MAX_PX_PER_R = 300;

/**
 * How deep each cushion is, in R: half its depth at the outline, half its
 * depth in the middle, and the rounding of its edges. Every front sits 0.62 R
 * out, where its face plate rides (the original bot's plateDepth).
 */
const CUSHION: Record<Exclude<BodyShape, "round">, [number, number, number]> = {
  cube: [0.5, 0.62, 0.3],
  triangle: [0.36, 0.62, 0.26],
  star: [0.2, 0.62, 0.18],
  sparkle: [0.16, 0.62, 0.14],
};

/** How far out its face rides on each shape's front, in R. */
export const FRONT_DEPTH = 0.62;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** The solid, shared by both passes. Positions are in R, y down, z toward the viewer. */
const SOLID = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSdf;    // r: signed distance to its outline, in R (positive inside); g: the same, smoothed
uniform float uMaxD;       // the deepest point of the smoothed field
uniform float uSdfExtent;
uniform float uExtent;     // the drawing covers [-uExtent, uExtent]^2 in R
uniform float uPxPerR;     // device pixels per R in this drawing
uniform int uRound;        // 1: its round body, a ball
uniform vec3 uCushion;     // half-depth at the outline, in the middle; edge rounding
uniform mat3 uRot;         // body -> view

// This pixel's position in R, y down like the canvas.
vec2 pixel() {
  return vec2(vUv.x * 2.0 - 1.0, 1.0 - vUv.y * 2.0) * uExtent;
}

vec2 field(vec2 p) {
  vec2 size = vec2(textureSize(uSdf, 0));
  vec2 st = ((p / uSdfExtent) * 0.5 + 0.5) * size - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  ivec2 lo = ivec2(clamp(i, vec2(0.0), size - 1.0));
  ivec2 hi = ivec2(clamp(i + 1.0, vec2(0.0), size - 1.0));
  vec2 a = texelFetch(uSdf, ivec2(lo.x, lo.y), 0).rg;
  vec2 b = texelFetch(uSdf, ivec2(hi.x, lo.y), 0).rg;
  vec2 c = texelFetch(uSdf, ivec2(lo.x, hi.y), 0).rg;
  vec2 d = texelFetch(uSdf, ivec2(hi.x, hi.y), 0).rg;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Distance to the body's surface (negative inside), in R.
float body(vec3 o) {
  if (uRound == 1) return length(o / vec3(1.03, 1.0, 1.0)) - 1.0;
  vec2 f = field(o.xy);
  // A cushion: deeper toward the middle, so the front is softly puffed.
  float k = clamp(f.y / uMaxD, 0.0, 1.0);
  float hz = mix(uCushion.x, uCushion.y, sqrt(1.0 - (1.0 - k) * (1.0 - k)));
  float r = uCushion.z;
  vec2 w = vec2(r - f.x, abs(o.z) - hz + r);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - r;
}

vec3 bodyNormal(vec3 o) {
  vec2 e = vec2(0.004, 0.0);
  return normalize(vec3(
    body(o + e.xyy) - body(o - e.xyy),
    body(o + e.yxy) - body(o - e.yxy),
    body(o + e.yyx) - body(o - e.yyx)));
}
`;

/**
 * Pass 1: where on the body each pixel looks. Writes the body point (in body
 * coordinates) and 1 where the ray hits; where it misses, the closest point
 * it passed and minus how far off it was, which gives the silhouette's
 * antialiasing and lets the fur's fringe reach past it.
 */
const GBUF = `${SOLID}
void main() {
  vec2 p = pixel();
  mat3 toBody = transpose(uRot);
  float t = 0.0;
  float best = 1e9;
  vec3 bestO = vec3(0.0);
  bool hit = false;
  for (int i = 0; i < 112; i++) {
    vec3 o = toBody * vec3(p, 2.0 - t);
    float d = body(o);
    if (d < best) { best = d; bestO = o; }
    if (d < 0.0006) { hit = true; break; }
    // The cushion's distance is only an estimate where its depth changes: step short.
    t += max(d * 0.7, 0.0015);
    if (t > 4.0) break;
  }
  outColor = hit ? vec4(bestO, 1.0) : vec4(bestO, -best);
}`;

/** Pass 2: shade the body, smooth or furry. */
const SHADE = `${SOLID}
uniform sampler2D uG;      // pass 1
uniform float uSize;       // drawing size in pixels
uniform vec3 uColor;       // its body colour: sRGB for smooth bodies, linear for fur
uniform int uTinted;       // 1 when it has a colour (smooth bodies multiply it in)
uniform int uFur;
uniform int uHasFace;      // 1: its face is a patch of pale fur
uniform vec4 uFace;        // the patch, as seen: centre and radii, in R
uniform vec3 uFaceColor;   // linear
uniform vec2 uFaceVelvet;  // the patch's edge softness, and its pile against the coat's
uniform float uF[${FUR_SLOTS}]; // the coat's settings (fur-style), in slot order

#define F_LENGTH uF[0]
#define F_DENSITY uF[1]
#define F_FLOW uF[2]
#define F_SPREAD uF[3]
#define F_WAVE uF[4]
#define F_LOCKS uF[5]
#define F_LOCKSIZE uF[6]
#define F_GUARD uF[7]
#define F_GUARDLEN uF[8]
#define F_STRAYS uF[9]
#define F_SOFTEDGE uF[10]
#define F_DEPTH uF[11]
#define F_RICH uF[12]
#define F_TIPS uF[13]
#define F_SHEEN uF[14]
#define F_SHINE uF[15]
#define F_VARIATION uF[16]
#define F_KEY uF[17]
#define F_FILL uF[18]
#define F_BACK uF[19]
#define F_EXPOSURE uF[20]
#define F_FILMIC uF[21]

const int SHELLS = 32;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Pass 1 at a position in R, bilinear.
vec4 gAt(vec2 p) {
  vec2 st = vec2(p.x / uExtent * 0.5 + 0.5, 0.5 - p.y / uExtent * 0.5) * uSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 top = vec2(uSize - 1.0);
  ivec2 lo = ivec2(clamp(i, vec2(0.0), top));
  ivec2 hi = ivec2(clamp(i + 1.0, vec2(0.0), top));
  vec4 a = texelFetch(uG, ivec2(lo.x, lo.y), 0);
  vec4 b = texelFetch(uG, ivec2(hi.x, lo.y), 0);
  vec4 c = texelFetch(uG, ivec2(lo.x, hi.y), 0);
  vec4 d = texelFetch(uG, ivec2(hi.x, hi.y), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// The nearest clump centre to p, on a jittered grid of clumps size apart.
vec2 tuftCentre(vec2 p, float size) {
  vec2 g = p / size;
  vec2 cell = floor(g);
  vec2 best = vec2(0.0);
  float bd = 1e9;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(float(x), float(y));
      vec2 o = c + 0.5 + (vec2(hash(c + 7.1), hash(c + 19.3)) - 0.5) * 0.95;
      float d = dot(o - g, o - g);
      if (d < bd) { bd = d; best = o; }
    }
  }
  return best * size;
}

// A body point flattened along one axis: the coordinates hairs are laid out in.
vec2 chart(vec3 o, int axis) {
  if (axis == 0) return o.zy + vec2(3.1, 0.0);
  if (axis == 1) return o.xz + vec2(0.0, 5.3);
  return o.xy;
}

vec2 chartDir(vec3 v, int axis) {
  if (axis == 0) return v.zy;
  if (axis == 1) return v.xz;
  return v.xy;
}

vec3 unchart(vec2 d, int axis) {
  if (axis == 0) return vec3(0.0, d.y, d.x);
  if (axis == 1) return vec3(d.x, 0.0, d.y);
  return vec3(d, 0.0);
}

// A radial gradient's 0..1 position, like the 2D body's.
float ring(vec2 s, vec2 c, float r0, float r1) {
  return clamp((length(s - c) - r0) / (r1 - r0), 0.0, 1.0);
}

vec3 bodyStops(float t) {
  vec3 c = vec3(250.0, 249.0, 247.0);
  c = mix(c, vec3(243.0, 242.0, 241.0), clamp(t / 0.3, 0.0, 1.0));
  c = mix(c, vec3(228.0, 228.0, 229.0), clamp((t - 0.3) / 0.15, 0.0, 1.0));
  c = mix(c, vec3(204.0, 205.0, 210.0), clamp((t - 0.45) / 0.17, 0.0, 1.0));
  c = mix(c, vec3(165.0, 168.0, 180.0), clamp((t - 0.62) / 0.28, 0.0, 1.0));
  c = mix(c, vec3(135.0, 138.0, 150.0), clamp((t - 0.9) / 0.1, 0.0, 1.0));
  return c / 255.0;
}

// Its smooth body's light, rims and shade (the original bot drawBody), read off the
// surface's direction instead of the canvas: on a ball, n.xy is the position.
vec3 smoothShade(vec3 n, vec2 p) {
  vec2 s = n.xy;
  vec3 col = bodyStops(length(s - vec2(0.45, -0.42)) / 1.6);
  col = mix(col, vec3(150.0, 175.0, 230.0) / 255.0, ring(s, vec2(0.35, -0.1), 0.8, 1.4) * 0.6);
  col = mix(col, vec3(15.0, 15.0, 25.0) / 255.0, clamp((p.y - 0.15) / 0.85, 0.0, 1.0) * 0.55);
  col = mix(col, vec3(205.0, 224.0, 255.0) / 255.0, ring(s, vec2(0.12, 0.0), 1.0, 1.16));
  col = mix(col, vec3(255.0, 252.0, 246.0) / 255.0, ring(s, vec2(-0.15, 0.25), 1.0, 1.3) * 0.7);
  if (uTinted == 1) {
    col *= uColor;
    col = mix(col, vec3(1.0), (1.0 - clamp(length(s - vec2(0.4, -0.5)) / 0.9, 0.0, 1.0)) * 0.28);
  }
  return col;
}

// ── The coat ─────────────────────────────────────────────────────────────
// Lit in linear light by a small studio rig, fixed in the room: a large warm
// key, a cool fill from the other side, a back light behind it that shines
// through the edge fibres, a warm bounce from the floor, and a little sky.

vec3 gKey; vec3 gKeyCol; vec3 gFill; vec3 gFillCol; vec2 gBackDir; vec3 gBackCol;

void setupRig() {
  float a = radians(F_KEY);
  gKey = normalize(vec3(sin(a) * 0.62, -cos(a) * 0.62, 0.66));
  gKeyCol = vec3(1.0, 0.95, 0.88) * 1.3;
  gFill = normalize(vec3(-sin(a) * 0.7, 0.2, 0.68));
  gFillCol = vec3(0.8, 0.87, 1.0) * F_FILL * 0.6;
  // The back light sits behind it, opposite the key and a little above.
  gBackDir = normalize(vec2(-sin(a) * 0.6, -0.8));
  gBackCol = vec3(1.0, 0.94, 0.86) * F_BACK;
}

// Light falling on the pile. Fur scatters light well round the turn, so the
// key wraps (Filament's cloth model); the floor bounces warm light back up.
vec3 lightAt(vec3 n) {
  vec3 e = gKeyCol * max((dot(n, gKey) + 0.3) / 1.3, 0.0);
  e += gFillCol * max((dot(n, gFill) + 0.6) / 1.6, 0.0);
  e += vec3(0.16, 0.16, 0.17) + vec3(0.12, 0.09, 0.06) * max(n.y, 0.0);
  return e;
}

// Light that has scattered n times through dyed fibres comes out with the
// fibre colour multiplied in n more times: darker, and more saturated, never
// grey (dual scattering, Zinke 2008). This is what makes shadows rich.
vec3 scattered(vec3 c, float n) {
  return pow(max(c, vec3(1e-4)), vec3(1.0 + n));
}

// Charlie sheen (Estevez & Kulla 2017): the soft fabric glow of a pile where
// it turns from the viewer.
float sheen(vec3 n, vec3 l) {
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  float NL = max(dot(n, l), 0.0);
  float NV = max(n.z, 0.02);
  float a = 0.2;                                   // roughness 0.45, squared
  float s2 = max(1.0 - pow(dot(n, h), 2.0), 0.0);
  float D = (2.0 + 1.0 / a) * pow(s2, 0.5 / a) / 6.2831853;
  return min(D / (4.0 * (NL + NV - NL * NV)) * NL, 1.5);
}

// The coat's flow at a body point: which way its hair is combed.
vec3 flowAt(vec3 o, vec3 no) {
  vec3 away = o - vec3(0.0, 0.0, 1.0);
  away -= no * dot(away, no);
  vec3 d = away;
  if (F_FLOW > 1.5) {
    // A whorl: away from its front, turning as it goes.
    vec3 aw = normalize(away + vec3(1e-5));
    d = aw * 0.75 + cross(no, aw) * 0.65;
  } else if (F_FLOW > 0.5) {
    vec3 down = vec3(0.0, 1.0, 0.0) - no * no.y;
    d = length(down) > 0.05 ? down : away;
  }
  d -= no * dot(d, no);
  return normalize(d + vec3(1e-5, 0.0, 0.0));
}

// How much of its face patch is at q, as seen: soft-edged, like fur dyed in.
float facePatch(vec2 q) {
  if (uHasFace == 0) return 0.0;
  float e = 0.04 + 0.68 * uFaceVelvet.x;
  return 1.0 - smoothstep(0.95 - e * 0.5, 0.95 + e * 0.5, length((q - uFace.xy) / uFace.zw));
}

// Hair colour where it's rooted: its colour, or the pale velvet of its face.
vec3 hairColor(float fp) {
  return mix(uColor, uFaceColor, fp);
}

// The undercoat: a dense pile, as 32 soft shells, with hairs laid out along
// one axis of the body (so the pile turns with it), combed along its flow,
// gathered into locks and smaller clumps.
vec4 pile(int axis, vec2 p, vec3 o, vec3 n, vec2 comb, float edge, float past) {
  vec2 m = chart(o, axis);
  float spacing = max(0.0105 / F_DENSITY, 1.6 / uPxPerR); // never under ~1.6 px, which would only alias
  float clump = noise(m * 7.0);
  // Two levels of clumps: locks, and smaller clumps inside them.
  float s1 = max(F_LOCKSIZE, 12.0 / uPxPerR);
  float s2 = max(F_LOCKSIZE / 3.0, 5.0 / uPxPerR);
  vec2 w1 = (vec2(noise(m * 4.0 + 1.7), noise(m * 4.0 + 8.3)) - 0.5) * s1 * 1.5;
  vec2 c1 = tuftCentre(m + w1, s1) - w1;
  vec2 c2 = tuftCentre(m + w1 * 0.4, s2) - w1 * 0.4;
  float g1 = F_LOCKS * mix(0.45, 1.2, hash(floor(c1 * 97.0)));
  float g2 = F_LOCKS * 0.6 * mix(0.45, 1.2, hash(floor(c2 * 97.0) + 3.0));
  float jit = hash(gl_FragCoord.xy * 0.731) - 0.5; // breaks up the shells' steps

  vec4 acc = vec4(0.0);
  for (int i = SHELLS - 1; i >= 0; i--) {
    float t = clamp((float(i) + 0.5 + jit * 0.6) / float(SHELLS), 0.0, 1.0); // 0 root, 1 tip
    vec2 q = p - comb * t * F_LENGTH * (0.85 + 0.3 * clump);
    vec4 g = gAt(q);
    if (g.w <= 0.0) continue;                    // rooted off it: no hair here
    float fp = facePatch(q);
    // On it, drawn in toward its lock and clump, more toward the tips.
    float k = t * (1.0 - edge * 0.6) * (1.0 - fp * 0.7);
    float p1 = min(g1 * k * 0.7, 0.6);
    float p2 = min(g2 * k * 0.6, 0.3);
    vec2 r = (chart(g.xyz, axis) - c1 * p1 - c2 * p2) / (1.0 - p1 - p2);

    // Two interleaved grids of tapering hairs.
    float hit = 0.0;
    float tone = 0.5;
    for (int kk = 0; kk < 2; kk++) {
      vec2 gg = r / spacing + float(kk) * vec2(0.37, 0.61);
      vec2 cell = floor(gg);
      float h1 = hash(cell + float(kk) * 13.7);
      float h2 = hash(cell + float(kk) * 13.7 + 31.1);
      vec2 f = fract(gg) - 0.5 - (vec2(h1, h2) - 0.5) * 0.7;
      float len = 0.45 + 0.55 * h1;
      if (t > len) continue;
      float radius = 0.42 * (1.0 - t / len) * mix(0.8, 1.15, noise(r * 28.0));
      float a = 1.0 - smoothstep(radius * 0.6, radius, length(f));
      if (a > hit) { hit = a; tone = h2; }
    }
    if (hit <= 0.0) continue;

    vec3 hc = hairColor(fp);
    // Down in the pile, light has passed through more hairs: deeper, richer.
    float depth = (1.0 - t) * F_DEPTH * mix(1.0, 0.35, fp);
    // Toward the silhouette hairs are seen side-on, along their length, not
    // down into the pile: far less of that depth shows.
    float side = 1.0 - edge * 0.75;
    float nIn = F_RICH * (acc.a * 0.5 + depth * 1.1 * side) * mix(1.0, 0.3, fp);
    // Light reaches down between the hairs less and less.
    float ao = mix(1.0, pow(t, 1.2), clamp(F_DEPTH * 1.3 * mix(1.0, 0.35, fp) * side, 0.0, 1.0));
    // The gaps between locks sit in shade; their crests catch the light.
    float gap = smoothstep(0.2, 0.75, length(r - c1) / s1);
    float tuft = mix(1.05, 0.82, gap * F_LOCKS * (1.0 - t * 0.5));
    vec3 col = scattered(hc, nIn) * lightAt(n) * ao * tuft;
    col *= 1.0 + (tone - 0.5) * 2.0 * F_VARIATION;
    // Fine tips: paler, a little less saturated.
    vec3 tip = mix(col, vec3(dot(col, LUMA)), 0.2) * 1.35;
    col = mix(col, tip, t * t * F_TIPS);
    // Past its outline the pile thins out gradually; the fringe takes over.
    float alpha = hit * 0.9 * (1.0 - smoothstep(0.0, F_LENGTH * 1.2, past) * 0.75 * F_SOFTEDGE);
    acc.rgb += (1.0 - acc.a) * col * alpha;
    acc.a += (1.0 - acc.a) * alpha;
    if (acc.a > 0.985) break;
  }
  return acc;
}

// Guard hairs: a sparse layer of longer strands over the pile, each its own
// curved hair, combed along its flow and drawn into its lock, with a highlight
// along it (Kajiya-Kay, two lobes, nearly unshifted, as synthetic fibre has).
// shadow returns how much they shade the pile under them.
vec4 strands(int axis, vec3 o, vec3 no, vec3 nv, float fp, out float shadow) {
  vec2 m = chart(o, axis);
  vec2 gdir = normalize(chartDir(flowAt(o, no), axis) + vec2(1e-5, 0.0));
  float C = max(0.026, 5.0 / uPxPerR);        // up to two strands rooted per cell
  float L = F_LENGTH * F_GUARDLEN * mix(1.0, 0.45, fp);
  float w = max(0.75 / uPxPerR, 0.0011);       // about a pixel wide
  vec2 cell0 = floor(m / C);
  int K = int(ceil(L / C));
  float s1 = max(F_LOCKSIZE, 12.0 / uPxPerR);
  vec2 lw = (vec2(noise(m * 4.0 + 1.7), noise(m * 4.0 + 8.3)) - 0.5) * s1 * 1.5;
  vec2 lock = tuftCentre(m + lw, s1) - lw;
  vec2 tipAt = lock + gdir * L * 0.9;
  float crest = 1.0 - smoothstep(0.15, 0.7, length(m - lock) / s1);
  vec3 h = normalize(gKey + vec3(0.0, 0.0, 1.0));
  vec3 hc = hairColor(fp);
  vec3 lit = scattered(hc, F_RICH * 0.3) * lightAt(nv);
  vec4 acc = vec4(0.0);
  shadow = 0.0;
  float spread = radians(F_SPREAD) * 2.0;
  for (int y = -4; y <= 4; y++) {
    if (abs(y) > K) continue;
    for (int x = -4; x <= 4; x++) {
      if (abs(x) > K) continue;
      vec2 cell = cell0 + vec2(float(x), float(y));
      // Strands grow along the flow, so only roots behind this point, within
      // a strand's length, can reach it.
      vec2 rc = (cell + 0.5) * C - m;
      float along = dot(rc, gdir);
      if (along > C * 1.2 || along < -L * 1.6 - C * 1.2 || abs(dot(rc, vec2(-gdir.y, gdir.x))) > L * 0.8 + C) continue;
      for (int e = 0; e < 2; e++) {
        float h1 = hash(cell * 1.31 + 2.1 + float(e) * 17.3);
        if (hash(cell + 9.9 + float(e) * 4.4) > F_GUARD) continue; // a sparse layer
        float h2 = hash(cell + 7.7 + float(e) * 11.1);
        float h3 = hash(cell + 3.3 + float(e) * 5.9);
        float h4 = hash(cell + 5.5 + float(e) * 2.3);
        vec2 root = (cell + vec2(h1, h2)) * C;
        float ang = (h3 - 0.5) * spread;
        vec2 own = vec2(gdir.x * cos(ang) - gdir.y * sin(ang), gdir.x * sin(ang) + gdir.y * cos(ang));
        vec2 dir = normalize(mix(own, normalize(tipAt - root + vec2(1e-5, 0.0)), F_LOCKS * 0.6 * (1.0 - fp)));
        vec2 side = vec2(-dir.y, dir.x);
        float len = L * (0.6 + 0.8 * h4);
        float bend = (h1 - 0.5) * F_WAVE * 2.5 / len;
        float u = clamp(dot(m - root, dir), 0.0, len);
        vec2 c = root + dir * u + side * (u * u * bend);
        float taper = max(1.0 - u / len, 0.0);
        float a = 1.0 - smoothstep(w * 0.35, w * (0.7 + 0.8 * taper), length(m - c));
        a *= smoothstep(0.0, 0.3, u / len) * pow(taper, 0.6); // root buried in the pile, tip fine
        if (a <= 0.0) continue;
        shadow = max(shadow, a * 0.5 * F_DEPTH * (1.0 - fp));
        // The strand's direction as seen, for its highlight.
        vec3 T = normalize(uRot * unchart(dir + side * (2.0 * u * bend), axis) + vec3(1e-5));
        T = normalize(T - nv * dot(T, nv) + vec3(1e-5));
        float th1 = dot(normalize(T - nv * 0.03), h);
        float th2 = dot(normalize(T + nv * 0.1), h);
        float spec1 = pow(sqrt(max(1.0 - th1 * th1, 0.0)), 70.0);
        float spec2 = pow(sqrt(max(1.0 - th2 * th2, 0.0)), 18.0);
        // Guard hairs stand proud of the pile: lit more fully, paler toward the tip.
        vec3 col = lit * 1.15 * (1.0 + (h2 - 0.5) * 2.0 * F_VARIATION) * mix(0.88, 1.12, crest);
        col = mix(col, mix(col, vec3(dot(col, LUMA)), 0.25) * 1.45, (1.0 - taper * 0.6) * F_TIPS);
        col += F_SHINE * (gKeyCol * 0.6 * spec1 + hc * gKeyCol * 0.8 * spec2) * (1.0 - fp * 0.6);
        a *= mix(0.85, 0.25, fp);
        acc.rgb += (1.0 - acc.a) * col * a;
        acc.a += (1.0 - acc.a) * a;
      }
    }
  }
  return acc;
}

// Its silhouette's hair, drawn as strands on screen, in slots round it so each
// keeps its place: a dense fringe rooted inside the pile and combed out past
// the outline, and sparse long strays. Together with the thinning pile this
// is the soft edge. d: distance past the silhouette, in R (negative inside).
vec4 fringe(vec2 p, float d, vec2 outward, vec3 lit) {
  vec4 acc = vec4(0.0);
  float reach = F_LENGTH * F_GUARDLEN * 2.2;
  if (d < -F_LENGTH * 0.8 - 0.02 || d > reach + 0.02) return acc;
  vec2 ps = p - outward * d;                  // the nearest point of the silhouette
  float rs = max(length(ps), 0.2);
  vec2 tang = vec2(-outward.y, outward.x);
  float theta = atan(p.y, p.x);
  float w = max(0.75 / uPxPerR, 0.0011);
  float spread = radians(F_SPREAD) * 2.0 + 0.3;
  for (int pass = 0; pass < 2; pass++) {
    bool dense = pass == 0;
    float SLOTS = dense ? 2600.0 : 1100.0;
    float keep = dense ? clamp(0.2 + 0.7 * F_SOFTEDGE, 0.0, 0.92) : F_STRAYS * 0.8;
    if (keep <= 0.0) continue;
    float dTheta = 6.2831853 / SLOTS;
    float slot = theta / dTheta;
    float k0 = floor(slot);
    for (int j = -18; j <= 18; j++) {
      float k = k0 + float(j);
      float id = mod(k, SLOTS) + (dense ? 0.0 : 5000.0);
      if (hash(vec2(id, 6.6)) > keep) continue;
      float h1 = hash(vec2(id, 1.7));
      float h2 = hash(vec2(id, 8.3));
      float h3 = hash(vec2(id, 4.1));
      float len = dense ? F_LENGTH * (0.7 + 0.7 * h2) * (1.0 + 0.6 * F_SOFTEDGE) : F_LENGTH * F_GUARDLEN * (0.8 + 1.2 * h2);
      float inset = dense ? F_LENGTH * (0.35 + 0.35 * h1) : 0.012;
      vec2 root = ps + tang * ((k + h1 - slot) * dTheta * rs) - outward * inset;
      float tilt = (h3 - 0.5) * spread;
      vec2 dir = outward * cos(tilt) + tang * sin(tilt);
      float u = clamp(dot(p - root, dir), 0.0, len);
      vec2 c = root + dir * u + tang * (u * u / len) * (h1 - 0.5) * (0.3 + F_WAVE);
      float taper = max(1.0 - u / len, 0.0);
      float a = (1.0 - smoothstep(w * 0.35, w * (dense ? 1.2 : 1.0), length(p - c))) * pow(taper, 0.7);
      a *= dense ? 0.6 * smoothstep(0.0, 0.25, u / len) : 0.5;
      if (a <= 0.0) continue;
      vec3 col = lit * (0.95 + 0.35 * (1.0 - taper)) * (1.0 + (h2 - 0.5) * 2.0 * F_VARIATION);
      acc.rgb += (1.0 - acc.a) * col * a;
      acc.a += (1.0 - acc.a) * a;
    }
  }
  return acc;
}

vec3 neutralTone(vec3 color) {
  // Khronos PBR Neutral: colours in the 0.08..0.8 range come through unchanged.
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, newPeak * vec3(1.0), g);
}

vec3 toDisplay(vec3 c) {
  c *= F_EXPOSURE;
  c = F_FILMIC > 0.5 ? neutralTone(c) : clamp(c, 0.0, 1.0);
  return mix(12.92 * c, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 p = pixel();
  vec4 g = texelFetch(uG, ivec2(gl_FragCoord.xy), 0);
  bool on = g.w > 0.0;
  // Antialiasing: pixels just off the silhouette are partly covered.
  float cover = on ? 1.0 : clamp(1.0 + g.w * uPxPerR, 0.0, 1.0);
  if (uFur == 0 && cover <= 0.0) { outColor = vec4(0.0); return; }
  float reach = F_LENGTH * F_GUARDLEN * 2.4 + 0.08 * F_SOFTEDGE;
  if (uFur == 1 && !on && -g.w > reach) { outColor = vec4(0.0); return; }

  vec3 no = bodyNormal(g.xyz);       // in the body's coordinates
  vec3 n = normalize(uRot * no);     // as seen

  if (uFur == 0) {
    outColor = vec4(smoothShade(n, p) * cover, cover); // premultiplied
    return;
  }

  setupRig();
  vec2 outward = normalize(n.xy + 1e-6);
  // Hairs stand out of the surface and lie down along its flow. Seen head-on
  // they read as fine strands; toward the silhouette they comb outward into
  // the fringe.
  float edge = on ? 1.0 - smoothstep(0.05, 0.6, n.z) : 1.0;
  vec2 m = chart(g.xyz, 2);
  vec2 lean = (vec2(noise(m * 9.0 + 3.0), noise(m * 9.0 + 9.0)) - 0.5) * (0.1 + radians(F_SPREAD) * 0.8);
  vec2 flow = (uRot * flowAt(g.xyz, no)).xy;
  float lie = mix(0.35, 0.95, smoothstep(0.025, 0.11, F_LENGTH));
  float fpHere = facePatch(p);
  vec2 comb = mix(n.xy * (1.0 - lie * 0.45) + flow * lie, outward * 1.35 * (1.0 + 0.9 * F_SOFTEDGE), edge) + lean;
  comb *= mix(1.0, uFaceVelvet.y, fpHere); // its face's velvet is short
  // Past the silhouette, light the fringe as the edge it grows from.
  // Light scatters through the thin fibres at its edge, so the edge doesn't
  // fall into darkness the way a smooth ball's would.
  vec3 nl = normalize(mix(n, vec3(n.xy * 0.6, 0.8), edge * 0.55));

  // Lay hairs out along the axis the surface faces most; where two are close,
  // blend both, so there is no seam.
  vec3 w = pow(abs(no), vec3(12.0));
  w /= w.x + w.y + w.z;
  int a1 = w.z >= w.x && w.z >= w.y ? 2 : (w.x >= w.y ? 0 : 1);
  float w1 = a1 == 0 ? w.x : (a1 == 1 ? w.y : w.z);
  int a2 = a1 == 0 ? (w.y >= w.z ? 1 : 2) : (a1 == 1 ? (w.x >= w.z ? 0 : 2) : (w.x >= w.y ? 0 : 1));
  float w2 = a2 == 0 ? w.x : (a2 == 1 ? w.y : w.z);
  float k12 = w1 / (w1 + w2);
  float past = on ? -0.5 * n.z * n.z : -g.w;  // distance past the silhouette, in R (inside: an estimate)
  vec4 acc = pile(a1, p, g.xyz, nl, comb, edge, past);
  if (w1 < 0.95) acc = mix(pile(a2, p, g.xyz, nl, comb, edge, past), acc, k12);

  // Under the pile: the dense base, deep like the roots.
  vec3 hcHere = hairColor(fpHere);
  if (cover > 0.0 && acc.a < 1.0) {
    vec3 base = scattered(hcHere, F_RICH * 0.9 * mix(1.0, 0.3, fpHere)) * lightAt(nl) * (1.0 - F_DEPTH * 0.55 * (1.0 - fpHere));
    acc.rgb += (1.0 - acc.a) * base * cover;
    acc.a += (1.0 - acc.a) * cover;
  }

  // The pile's soft fabric sheen, and light from behind glowing through the
  // thin fibres at its edge (the TT lobe of hair shading).
  float rimG = pow(1.0 - clamp(nl.z, 0.0, 1.0), 2.0);
  float toward = 0.55 + 0.45 * dot(outward, gBackDir);
  vec3 through = pow(max(hcHere, vec3(1e-4)), vec3(0.6)) * gBackCol * rimG * toward;
  vec3 sheenCol = mix(hcHere, vec3(1.0), 0.35) * gKeyCol * sheen(nl, gKey) * F_SHEEN * 0.55;
  acc.rgb += (sheenCol + through * 0.9) * acc.a;

  // Guard hairs over the pile, where they are big enough to read as hairs.
  float detail = smoothstep(70.0, 200.0, uPxPerR);
  if (on && detail > 0.0 && F_GUARD > 0.0) {
    float sh;
    vec4 top = strands(a1, g.xyz, no, n, fpHere, sh);
    if (w1 < 0.8) {
      float sh2;
      vec4 top2 = strands(a2, g.xyz, no, n, fpHere, sh2);
      top = mix(top2, top, k12);
      sh = mix(sh2, sh, k12);
    }
    acc.rgb *= 1.0 - sh * detail;
    top.rgb += through * 0.6 * top.a;
    acc = top * detail + acc * (1.0 - top.a * detail);
  }

  // The fringe, strays and a soft glow past its outline.
  vec3 edgeLit = scattered(hcHere, F_RICH * 0.2) * lightAt(nl) + through * 1.2;
  if (!on || n.z < 0.45) {
    vec4 fly = fringe(p, past, outward, edgeLit) * smoothstep(60.0, 180.0, uPxPerR);
    acc = fly + acc * (1.0 - fly.a);
  }
  if (!on && F_SOFTEDGE > 0.0) {
    float halo = F_SOFTEDGE * 0.45 * exp(-max(past, 0.0) / (0.02 + 0.05 * F_SOFTEDGE));
    acc += vec4(edgeLit * halo, halo) * (1.0 - acc.a);
  }

  // Linear light in, display out.
  if (acc.a > 0.0) acc.rgb = toDisplay(acc.rgb / acc.a) * acc.a;
  outColor = acc; // premultiplied
}`;

interface Program {
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

interface GL {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  gbuf: Program;
  shade: Program;
  /** Pass 1's target, grown as needed. */
  gTex: WebGLTexture;
  fbo: WebGLFramebuffer;
  gSize: number;
  sdf: Map<BodyShape, { tex: WebGLTexture; maxD: number }>;
  /** Fast enough to redraw every time it turns. */
  live: boolean;
}

let ctx: GL | null | undefined;

const UNIFORMS = [
  "uSdf", "uMaxD", "uSdfExtent", "uExtent", "uPxPerR", "uRound", "uCushion", "uRot",
  "uG", "uSize", "uColor", "uTinted", "uFur", "uF", "uHasFace", "uFace", "uFaceColor", "uFaceVelvet",
];

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
  return sh;
}

function link(gl: WebGL2RenderingContext, frag: string): Program {
  const program = gl.createProgram();
  if (!program) throw new Error("program");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  const u: Program["u"] = {};
  for (const name of UNIFORMS) u[name] = gl.getUniformLocation(program, name);
  return { program, u };
}

function setup(): GL | null {
  if (ctx !== undefined) return ctx;
  ctx = null;
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
    // Pass 1 writes float positions.
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
    const gbuf = link(gl, GBUF);
    const shade = link(gl, SHADE);
    // One triangle covering the whole viewport.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const gTex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!gTex || !fbo) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const live = !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
    canvas.addEventListener("webglcontextlost", () => {
      ctx = undefined;
    });
    ctx = { canvas, gl, gbuf, shade, gTex, fbo, gSize: 0, sdf: new Map(), live };
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Signed distance from every point of the field to its outline, in R; positive inside. Row j is y. */
function distanceField(shape: BodyShape): Float32Array {
  const pts = bodyOutline(shape);
  const data = new Float32Array(SDF_SIZE * SDF_SIZE);
  const n = pts.length;
  for (let j = 0; j < SDF_SIZE; j++) {
    const y = ((j + 0.5) / SDF_SIZE) * 2 * SDF_EXTENT - SDF_EXTENT;
    for (let i = 0; i < SDF_SIZE; i++) {
      const x = ((i + 0.5) / SDF_SIZE) * 2 * SDF_EXTENT - SDF_EXTENT;
      let best = Infinity;
      let inside = false;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const [ax, ay] = pts[a];
        const [bx, by] = pts[b];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
        const ex = bx - ax;
        const ey = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
        const dx = x - (ax + ex * t);
        const dy = y - (ay + ey * t);
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      data[j * SDF_SIZE + i] = (inside ? 1 : -1) * Math.sqrt(best);
    }
  }
  return data;
}

/** A box blur, run a few times: smooths the field's creases and flat top into a cushion. */
function smoothed(field: Float32Array, radius: number, passes: number): Float32Array {
  let src = Float32Array.from(field);
  const tmp = new Float32Array(src.length);
  for (let pass = 0; pass < passes; pass++) {
    for (const horizontal of [true, false]) {
      for (let j = 0; j < SDF_SIZE; j++) {
        let sum = 0;
        const at = (k: number) => {
          const c = Math.max(0, Math.min(SDF_SIZE - 1, k));
          return horizontal ? src[j * SDF_SIZE + c] : src[c * SDF_SIZE + j];
        };
        for (let k = -radius; k <= radius; k++) sum += at(k);
        for (let i = 0; i < SDF_SIZE; i++) {
          const idx = horizontal ? j * SDF_SIZE + i : i * SDF_SIZE + j;
          tmp[idx] = sum / (2 * radius + 1);
          sum += at(i + radius + 1) - at(i - radius);
        }
      }
      src = Float32Array.from(tmp);
    }
  }
  return src;
}

function sdfTexture(g: GL, shape: BodyShape) {
  const hit = g.sdf.get(shape);
  if (hit) return hit;
  const { gl } = g;
  const tex = gl.createTexture();
  if (!tex) return null;
  const sharp = distanceField(shape);
  const soft = smoothed(sharp, 10, 3);
  let maxD = 0.1;
  const rg = new Float32Array(sharp.length * 2);
  for (let i = 0; i < sharp.length; i++) {
    rg[2 * i] = sharp[i];
    rg[2 * i + 1] = soft[i];
    if (soft[i] > maxD) maxD = soft[i];
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, SDF_SIZE, SDF_SIZE, 0, gl.RG, gl.FLOAT, rg);
  nearest(gl);
  const entry = { tex, maxD };
  g.sdf.set(shape, entry);
  return entry;
}

function nearest(gl: WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/**
 * The turn that carries its front, (0, 0, 1), to where its face is: sin(yaw)
 * across, sin(pitch) down, as the original bot slides the face. Column-major.
 */
function turn(yaw: number, pitch: number): Float32Array {
  const fx = Math.sin(yaw);
  const fy = Math.sin(pitch);
  const s = Math.hypot(fx, fy);
  if (s < 1e-6) return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const c = Math.sqrt(Math.max(0, 1 - s * s));
  // Rodrigues, about (0, 0, 1) × front.
  const kx = -fy / s;
  const ky = fx / s;
  const v = 1 - c;
  const r = [
    [c + kx * kx * v, kx * ky * v, ky * s],
    [kx * ky * v, c + ky * ky * v, -kx * s],
    [-ky * s, kx * s, c],
  ];
  return new Float32Array([r[0][0], r[1][0], r[2][0], r[0][1], r[1][1], r[2][1], r[0][2], r[1][2], r[2][2]]);
}

/**
 * Whether its solid body can be drawn here: null without WebGL2; false on a
 * software renderer, where it should be drawn once, facing forward; true
 * where it can be redrawn as it turns.
 */
export function solidBodyLive(): boolean | null {
  const g = setup();
  return g ? g.live : null;
}

/** The drawing's resolution for `pxPerR`, in steps, so a breathing mascot reuses one drawing. */
export function solidPxPerR(pxPerR: number): number {
  const step = pxPerR < 64 ? 8 : 24;
  return Math.min(MAX_PX_PER_R, Math.max(8, Math.round(pxPerR / step) * step));
}

export interface SolidLook {
  shape: BodyShape;
  fur: boolean;
  /** Its colour as RGB, or null for its own white. */
  color: [number, number, number] | null;
  /**
   * With fur, its face plate is a patch of pale fur instead: its centre and
   * radii as seen, in R. Null for none.
   */
  face?: [number, number, number, number] | null;
  /** The patch's edge softness, pile against the coat's, and how much body colour it takes. */
  faceVelvet?: [number, number, number];
  /** The coat's settings in slot order (fur-style's furVector); the Silky preset if missing. */
  params?: number[] | null;
}

/** sRGB 0..1 to linear light. */
function linear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Original white, as fur: a warm off-white plush. */
const NATURAL_FUR: [number, number, number] = [246, 243, 238];

/**
 * Draws its body into `target` (resized to fit), turned by `yaw` and `pitch`
 * (radians, as the original bot turns its face), at `pxPerR` device pixels per R
 * (see solidPxPerR). The drawing covers ±BODY_EXTENT R. False if it can't.
 */
export function drawSolidBody(
  target: HTMLCanvasElement,
  look: SolidLook,
  yaw: number,
  pitch: number,
  pxPerR: number,
): boolean {
  const g = setup();
  if (!g) return false;
  const sdf = sdfTexture(g, look.shape);
  if (!sdf) return false;
  const { gl, canvas } = g;
  const size = Math.round(2 * BODY_EXTENT * pxPerR);
  if (canvas.width < size || canvas.height < size) {
    canvas.width = Math.max(canvas.width, size);
    canvas.height = Math.max(canvas.height, size);
  }
  if (g.gSize < size) {
    gl.bindTexture(gl.TEXTURE_2D, g.gTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, null);
    nearest(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.gTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }
    g.gSize = size;
  }

  const rot = turn(yaw, pitch);
  const round = look.shape === "round";
  const cushion = look.shape === "round" ? [0, 0, 0] : CUSHION[look.shape];
  const common = (p: Program) => {
    gl.useProgram(p.program);
    gl.uniform1i(p.u.uSdf, 0);
    gl.uniform1f(p.u.uMaxD, sdf.maxD);
    gl.uniform1f(p.u.uSdfExtent, SDF_EXTENT);
    gl.uniform1f(p.u.uExtent, BODY_EXTENT);
    gl.uniform1f(p.u.uPxPerR, pxPerR);
    gl.uniform1i(p.u.uRound, round ? 1 : 0);
    gl.uniform3f(p.u.uCushion, cushion[0], cushion[1], cushion[2]);
    gl.uniformMatrix3fv(p.u.uRot, false, rot);
  };
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sdf.tex);

  // Pass 1, into the float target.
  gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo);
  gl.viewport(0, 0, size, size);
  common(g.gbuf);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Pass 2, onto the canvas.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, size, size);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  common(g.shade);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, g.gTex);
  gl.uniform1i(g.shade.u.uG, 1);
  gl.uniform1f(g.shade.u.uSize, size);
  const c = look.color ?? (look.fur ? NATURAL_FUR : [255, 255, 255]);
  // Fur is lit in linear light; smooth bodies keep the 2D body's sRGB maths.
  const put = (v: number) => (look.fur ? linear(v / 255) : v / 255);
  gl.uniform3f(g.shade.u.uColor, put(c[0]), put(c[1]), put(c[2]));
  gl.uniform1i(g.shade.u.uTinted, look.color ? 1 : 0);
  gl.uniform1i(g.shade.u.uFur, look.fur ? 1 : 0);
  const params = look.params && look.params.length === FUR_SLOTS ? look.params : furVector("silky", {});
  gl.uniform1fv(g.shade.u.uF, new Float32Array(params));
  const face = look.fur ? look.face : null;
  gl.uniform1i(g.shade.u.uHasFace, face ? 1 : 0);
  if (face) gl.uniform4f(g.shade.u.uFace, face[0], face[1], face[2], face[3]);
  // Cream, with a breath of its colour.
  const [soft, velvet, tint] = look.faceVelvet ?? [0.5, 0.55, 0.1];
  gl.uniform2f(g.shade.u.uFaceVelvet, soft, velvet);
  const fc = [255, 241, 226].map((v, i) => v + (c[i] - v) * tint);
  gl.uniform3f(g.shade.u.uFaceColor, put(fc[0]), put(fc[1]), put(fc[2]));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE0);

  // Copy out while the drawing buffer is still valid. The viewport sits at
  // the canvas's bottom left.
  if (target.width !== size || target.height !== size) {
    target.width = size;
    target.height = size;
  }
  const out = target.getContext("2d");
  if (!out) return false;
  out.clearRect(0, 0, size, size);
  out.drawImage(canvas, 0, canvas.height - size, size, size, 0, 0, size, size);
  return true;
}
