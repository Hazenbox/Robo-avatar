/**
 * Zoro's fur, as art-directable settings: a few presets, each modelled on a
 * real plush fabric, and every number behind them, which the playground's fur
 * settings can tune one by one.
 *
 * The presets come out of research into real plush fabrics: Silky is long short-pile faux fur, combed away from its face, with
 * locks and a sparse layer of longer guard hairs; Minky is the short, dense,
 * directional pile of minky fabric; Pompom is faux mink, soft and radial
 * with a glowing edge. A look stores its preset and only the settings that
 * differ from it, so a preset can be improved later without losing anyone's
 * tweaks.
 */

export type FurStyle = "silky" | "minky" | "pompom";

export const FUR_STYLES: readonly FurStyle[] = ["silky", "minky", "pompom"];

export const FUR_STYLE_LABEL: Record<FurStyle, string> = {
  silky: "Silky",
  minky: "Minky",
  pompom: "Pompom",
};

export const FUR_STYLE_HINT: Record<FurStyle, string> = {
  silky: "Long short-pile faux fur, combed from its face",
  minky: "Short, dense, directional minky pile",
  pompom: "Faux mink: radial, soft, glowing edge",
};

export type FurGroup = "Groom" | "Shading" | "Edge" | "Light";

interface Spec {
  label: string;
  group: FurGroup;
  /** A range, a choice between named options, or on/off. */
  kind: "range" | "choice" | "toggle";
  min: number;
  max: number;
  step: number;
  options?: readonly string[];
  /** Shown as a percentage, in degrees, in R, or as is. */
  unit?: "%" | "°" | "R" | "×" | "±";
  hint: string;
  presets: Record<FurStyle, number>;
}

/**
 * Every setting, in the order the settings show them. The order is also each
 * setting's slot in the shader's parameter array (body-gl), so
 * only ever add to the end.
 */
export const FUR_PARAMS = {
  length: {
    label: "Pile length", group: "Groom", kind: "range", min: 0.02, max: 0.14, step: 0.005, unit: "R",
    hint: "How long the hairs are, as a share of its radius.",
    presets: { silky: 0.08, minky: 0.035, pompom: 0.11 },
  },
  density: {
    label: "Density", group: "Groom", kind: "range", min: 0.5, max: 1.6, step: 0.05, unit: "×",
    hint: "Hairs per area. Denser reads finer and more opaque.",
    presets: { silky: 1, minky: 1.3, pompom: 1.1 },
  },
  flow: {
    label: "Flow", group: "Groom", kind: "choice", min: 0, max: 2, step: 1, options: ["From face", "Downward", "Whorl"],
    hint: "Which way the hair is combed.",
    presets: { silky: 0, minky: 1, pompom: 2 },
  },
  spread: {
    label: "Flow spread", group: "Groom", kind: "range", min: 0, max: 45, step: 1, unit: "°",
    hint: "How far single hairs stray from the combed direction.",
    presets: { silky: 10, minky: 6, pompom: 16 },
  },
  wave: {
    label: "Wave", group: "Groom", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "A gentle curve along each strand.",
    presets: { silky: 0.35, minky: 0.1, pompom: 0.25 },
  },
  locks: {
    label: "Locks", group: "Groom", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "How strongly hair gathers into locks, and those into smaller clumps.",
    presets: { silky: 0.55, minky: 0.15, pompom: 0.25 },
  },
  lockSize: {
    label: "Lock size", group: "Groom", kind: "range", min: 0.04, max: 0.16, step: 0.005, unit: "R",
    hint: "The size of the big locks; the smaller clumps are a third of it.",
    presets: { silky: 0.08, minky: 0.05, pompom: 0.1 },
  },
  guard: {
    label: "Guard hairs", group: "Groom", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "A sparse layer of longer, finer strands over the pile: what reads as fluffy.",
    presets: { silky: 0.6, minky: 0.15, pompom: 0.2 },
  },
  guardLength: {
    label: "Guard length", group: "Groom", kind: "range", min: 1, max: 2, step: 0.05, unit: "×",
    hint: "Guard hairs' length against the pile's.",
    presets: { silky: 1.4, minky: 1.2, pompom: 1.3 },
  },
  strays: {
    label: "Strays", group: "Edge", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "Loose hairs standing out of its silhouette.",
    presets: { silky: 0.5, minky: 0.15, pompom: 0.35 },
  },
  softEdge: {
    label: "Soft edge", group: "Edge", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "How gradually its outline melts into the background.",
    presets: { silky: 0.4, minky: 0.25, pompom: 0.8 },
  },
  depth: {
    label: "Root depth", group: "Shading", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "Shade down at the roots, between the hairs.",
    presets: { silky: 0.5, minky: 0.35, pompom: 0.3 },
  },
  richness: {
    label: "Rich shadows", group: "Shading", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "Shadows deepen and warm in colour instead of going grey.",
    presets: { silky: 0.6, minky: 0.5, pompom: 0.4 },
  },
  tips: {
    label: "Light tips", group: "Shading", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "Hair tips paler and more translucent than their roots.",
    presets: { silky: 0.5, minky: 0.35, pompom: 0.45 },
  },
  sheen: {
    label: "Sheen", group: "Shading", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "The soft fabric glow of the pile where it turns from the light.",
    presets: { silky: 0.35, minky: 0.6, pompom: 0.5 },
  },
  shine: {
    label: "Strand shine", group: "Shading", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "A highlight along each visible strand.",
    presets: { silky: 0.5, minky: 0.2, pompom: 0.25 },
  },
  variation: {
    label: "Colour variation", group: "Shading", kind: "range", min: 0, max: 0.15, step: 0.01, unit: "±",
    hint: "Each strand a touch lighter or darker than its neighbours.",
    presets: { silky: 0.1, minky: 0.06, pompom: 0.07 },
  },
  keyAngle: {
    label: "Key light", group: "Light", kind: "range", min: -150, max: 150, step: 5, unit: "°",
    hint: "Where the main light comes from, round it: 0 is overhead, 90 the right.",
    presets: { silky: 40, minky: 40, pompom: 40 },
  },
  fill: {
    label: "Fill light", group: "Light", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "A cool light from the other side, softening the shadows.",
    presets: { silky: 0.45, minky: 0.45, pompom: 0.45 },
  },
  backlight: {
    label: "Back light", group: "Light", kind: "range", min: 0, max: 1, step: 0.05, unit: "%",
    hint: "Light from behind shining through the edge fibres: the glowing halo.",
    presets: { silky: 0.5, minky: 0.3, pompom: 0.7 },
  },
  exposure: {
    label: "Exposure", group: "Light", kind: "range", min: 0.6, max: 1.6, step: 0.05, unit: "×",
    hint: "Overall brightness.",
    presets: { silky: 1, minky: 1, pompom: 1.05 },
  },
  filmic: {
    label: "Filmic tone", group: "Light", kind: "toggle", min: 0, max: 1, step: 1,
    hint: "Roll bright light off softly, as a camera does (Khronos PBR Neutral).",
    presets: { silky: 1, minky: 1, pompom: 1 },
  },
} satisfies Record<string, Spec>;

export type FurParam = keyof typeof FUR_PARAMS;

export const FUR_PARAM_KEYS = Object.keys(FUR_PARAMS) as FurParam[];

export const FUR_GROUPS: readonly FurGroup[] = ["Groom", "Shading", "Edge", "Light"];

export function furSpec(key: FurParam): Spec {
  return FUR_PARAMS[key];
}

/** Only the settings that differ from the preset. */
export type FurTune = Partial<Record<FurParam, number>>;

export function furStyleOf(value: unknown, fallback: FurStyle = "silky"): FurStyle {
  return FUR_STYLES.includes(value as FurStyle) ? (value as FurStyle) : fallback;
}

/** Tweaks from untrusted input: known settings only, each clamped to its range and step. */
export function furTuneOf(value: unknown): FurTune {
  const out: FurTune = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!(k in FUR_PARAMS) || typeof v !== "number" || !Number.isFinite(v)) continue;
    const s = FUR_PARAMS[k as FurParam] as Spec;
    const snapped = Math.round((Math.min(s.max, Math.max(s.min, v)) - s.min) / s.step) * s.step + s.min;
    out[k as FurParam] = Number(snapped.toFixed(4));
  }
  return out;
}

/** Every setting's value: the preset's, with the tweaks on top. */
export function furValues(style: FurStyle, tune: FurTune): Record<FurParam, number> {
  const out = {} as Record<FurParam, number>;
  for (const k of FUR_PARAM_KEYS) out[k] = tune?.[k] ?? (FUR_PARAMS[k] as Spec).presets[style];
  return out;
}

/** The values in slot order, for the shader. */
export function furVector(style: FurStyle, tune: FurTune): number[] {
  const v = furValues(style, tune);
  return FUR_PARAM_KEYS.map((k) => v[k]);
}

/** A tweak that equals the preset is no tweak: drop it, so the look stays small. */
export function withTweak(style: FurStyle, tune: FurTune, key: FurParam, value: number): FurTune {
  const next = furTuneOf({ ...tune, [key]: value });
  if (next[key] === (FUR_PARAMS[key] as Spec).presets[style]) delete next[key];
  return next;
}

export function sameTune(a: FurTune, b: FurTune): boolean {
  return FUR_PARAM_KEYS.every((k) => a[k] === b[k]);
}
