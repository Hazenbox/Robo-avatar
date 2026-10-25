/**
 * Robo's face, as tunable settings: the plate's shape and place, its eyes,
 * and the details of whichever face it has -- the smooth inset plate on it
 * plain body, or the patch of pale velvet it becomes on fur.
 *
 * Every default is how it has always looked (the velvet patch's defaults are
 * how it was tuned), so a look with no face tweaks draws exactly as before.
 * A look stores only the settings that differ from the defaults.
 */

/** Which face a setting belongs to: both, the velvet patch on fur, or the smooth plate. */
export type FaceMode = "all" | "fur" | "plain";

export type FaceGroup = "Shape" | "Eyes" | "Velvet" | "Plate";

interface Spec {
  label: string;
  group: FaceGroup;
  mode: FaceMode;
  min: number;
  max: number;
  step: number;
  unit: "%" | "R" | "×";
  hint: string;
  default: number;
}

export const FACE_PARAMS = {
  width: {
    label: "Width", group: "Shape", mode: "all", min: 0.6, max: 1.3, step: 0.02, unit: "×", default: 1,
    hint: "How wide the plate is.",
  },
  height: {
    label: "Height", group: "Shape", mode: "all", min: 0.6, max: 1.3, step: 0.02, unit: "×", default: 1,
    hint: "How tall the plate is.",
  },
  lift: {
    label: "Position", group: "Shape", mode: "all", min: -0.2, max: 0.2, step: 0.01, unit: "R", default: 0,
    hint: "Moves its whole face up (less) or down (more) on its body.",
  },
  eyeSize: {
    label: "Eye size", group: "Eyes", mode: "all", min: 0.7, max: 1.4, step: 0.02, unit: "×", default: 1,
    hint: "How big its eyes are.",
  },
  eyeSpacing: {
    label: "Eye spacing", group: "Eyes", mode: "all", min: 0.8, max: 1.25, step: 0.01, unit: "×", default: 1,
    hint: "How far apart its eyes sit.",
  },
  softness: {
    label: "Edge softness", group: "Velvet", mode: "fur", min: 0, max: 1, step: 0.05, unit: "%", default: 0.5,
    hint: "How gradually the pale velvet blends into its coat.",
  },
  velvet: {
    label: "Velvet length", group: "Velvet", mode: "fur", min: 0.2, max: 1, step: 0.05, unit: "%", default: 0.55,
    hint: "The face's pile against its coat's: short velvet or full fur.",
  },
  patchTint: {
    label: "Body colour", group: "Velvet", mode: "fur", min: 0, max: 1, step: 0.05, unit: "%", default: 0.1,
    hint: "How much of its colour runs into the pale velvet.",
  },
  plateTint: {
    label: "Body colour", group: "Plate", mode: "plain", min: 0, max: 1, step: 0.05, unit: "%", default: 0.45,
    hint: "How much of its colour the plate takes, when it has one.",
  },
  shade: {
    label: "Inset shade", group: "Plate", mode: "plain", min: 0, max: 2, step: 0.05, unit: "×", default: 1,
    hint: "The soft shadow where its body meets the plate.",
  },
  ringWeight: {
    label: "Ring weight", group: "Plate", mode: "plain", min: 0.3, max: 3, step: 0.05, unit: "×", default: 1,
    hint: "How heavy the groove round the plate is.",
  },
} satisfies Record<string, Spec>;

export type FaceParam = keyof typeof FACE_PARAMS;

export const FACE_PARAM_KEYS = Object.keys(FACE_PARAMS) as FaceParam[];

export const FACE_GROUPS: readonly FaceGroup[] = ["Shape", "Eyes", "Velvet", "Plate"];

/** Only the settings that differ from the defaults. */
export type FaceTune = Partial<Record<FaceParam, number>>;

/** Tweaks from untrusted input: known settings only, each clamped to its range and step. */
export function faceTuneOf(value: unknown): FaceTune {
  const out: FaceTune = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!(k in FACE_PARAMS) || typeof v !== "number" || !Number.isFinite(v)) continue;
    const s = FACE_PARAMS[k as FaceParam] as Spec;
    const snapped = Math.round((Math.min(s.max, Math.max(s.min, v)) - s.min) / s.step) * s.step + s.min;
    const n = Number(snapped.toFixed(4));
    if (n !== s.default) out[k as FaceParam] = n;
  }
  return out;
}

/** Every setting's value: the default, with the tweaks on top. */
export function faceValues(tune: FaceTune | undefined): Record<FaceParam, number> {
  const out = {} as Record<FaceParam, number>;
  for (const k of FACE_PARAM_KEYS) out[k] = tune?.[k] ?? (FACE_PARAMS[k] as Spec).default;
  return out;
}

export function withFaceTweak(tune: FaceTune, key: FaceParam, value: number): FaceTune {
  return faceTuneOf({ ...tune, [key]: value });
}

export function sameFaceTune(a: FaceTune, b: FaceTune): boolean {
  return FACE_PARAM_KEYS.every((k) => a[k] === b[k]);
}
