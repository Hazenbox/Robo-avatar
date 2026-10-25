/**
 * Robo's whole look: what it wears, its body's shape, fur, colour, and the
 * two parts of its face that can be switched off.
 *
 * Every field defaults to how it has always looked -- a round white body,
 * bare, with its face plate and its ring -- so a look of all defaults draws
 * exactly the original character. Everything else is opt-in.
 */

import { outfitOf, type MascotAddon } from "./addons";
import { faceTuneOf, sameFaceTune, type FaceTune } from "./face-style";
import { furStyleOf, furTuneOf, sameTune, type FurStyle, type FurTune } from "./fur-style";

export type BodyShape = "round" | "cube" | "triangle" | "star" | "sparkle";

export const BODY_SHAPES: readonly BodyShape[] = ["round", "cube", "triangle", "star", "sparkle"];

export const SHAPE_LABEL: Record<BodyShape, string> = {
  round: "Round",
  cube: "Cuboid",
  triangle: "Triangle",
  star: "Star",
  sparkle: "Sparkle",
};

export interface MascotLook {
  /** Wearables (addons). */
  addons: MascotAddon[];
  shape: BodyShape;
  /** A soft, hairy coat over its body. */
  fur: boolean;
  /** Which plush the coat is (fur-style). */
  furStyle: FurStyle;
  /** The coat's settings that differ from its style. */
  furTune: FurTune;
  /** A colour for its whole body, `#rrggbb`, or null for its own white. */
  color: string | null;
  /** The inset disc its face sits on. */
  facePlate: boolean;
  /** The groove line round the face plate. */
  faceRing: boolean;
  /** The face's settings that differ from how it has always looked (face-style). */
  faceTune: FaceTune;
}

export const DEFAULT_LOOK: MascotLook = {
  addons: [],
  shape: "round",
  fur: false,
  furStyle: "silky",
  furTune: {},
  color: null,
  facePlate: true,
  faceRing: true,
  faceTune: {},
};

/** Ready-made body colours; any `#rrggbb` works too. */
export const COLOR_SWATCHES: readonly { label: string; value: string | null }[] = [
  { label: "Original white", value: null },
  { label: "Violet", value: "#8b6cff" },
  { label: "Sky", value: "#7cc4ff" },
  { label: "Mint", value: "#7fe0b8" },
  { label: "Peach", value: "#ffb48a" },
  { label: "Rose", value: "#ff8fb4" },
  { label: "Lemon", value: "#ffe27a" },
  { label: "Graphite", value: "#8a8f9e" },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** A colour from untrusted input: `#rrggbb`, lower-cased, or null. */
export function colorOf(value: unknown): string | null {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : null;
}

/**
 * A whole look from untrusted input (the API, storage, config). Anything
 * missing or malformed takes its default. A bare list is the old saved form,
 * from before the look had more than wearables, and reads as just those.
 */
export function lookOf(value: unknown, defaults: MascotLook = DEFAULT_LOOK): MascotLook {
  if (Array.isArray(value)) return { ...defaults, addons: outfitOf(value) };
  if (!value || typeof value !== "object") return { ...defaults };
  const v = value as Record<string, unknown>;
  return {
    addons: v.addons === undefined ? defaults.addons : outfitOf(v.addons),
    shape: BODY_SHAPES.includes(v.shape as BodyShape) ? (v.shape as BodyShape) : defaults.shape,
    fur: typeof v.fur === "boolean" ? v.fur : defaults.fur,
    furStyle: v.furStyle === undefined ? defaults.furStyle : furStyleOf(v.furStyle, defaults.furStyle),
    furTune: v.furTune === undefined ? defaults.furTune : furTuneOf(v.furTune),
    color: v.color === undefined ? defaults.color : colorOf(v.color),
    facePlate: typeof v.facePlate === "boolean" ? v.facePlate : defaults.facePlate,
    faceRing: typeof v.faceRing === "boolean" ? v.faceRing : defaults.faceRing,
    faceTune: v.faceTune === undefined ? defaults.faceTune : faceTuneOf(v.faceTune),
  };
}

export function sameLook(a: MascotLook, b: MascotLook): boolean {
  return (
    a.shape === b.shape &&
    a.fur === b.fur &&
    a.furStyle === b.furStyle &&
    sameTune(a.furTune, b.furTune) &&
    a.color === b.color &&
    a.facePlate === b.facePlate &&
    a.faceRing === b.faceRing &&
    sameFaceTune(a.faceTune, b.faceTune) &&
    a.addons.length === b.addons.length &&
    a.addons.every((x, i) => x === b.addons[i])
  );
}
