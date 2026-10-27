import { describe, expect, test } from "vitest";
import {
  DEFAULT_LOOK,
  FUR_PARAMS,
  FACE_PARAMS,
  colorOf,
  faceValues,
  furValues,
  lookOf,
  outfitOf,
  sameLook,
  toggleAddon,
  withFaceTweak,
  withTweak,
} from "../src";

describe("looks from untrusted input", () => {
  test("a colour is #rrggbb, lower-cased, or null", () => {
    expect(colorOf("#FF8FB4")).toBe("#ff8fb4");
    expect(colorOf(" #8b6cff ")).toBe("#8b6cff");
    for (const bad of ["red", "#fff", "#12345g", 5, null, undefined, "javascript:alert(1)"]) expect(colorOf(bad)).toBeNull();
  });

  test("anything missing or wrong falls back to the default", () => {
    expect(lookOf(undefined)).toEqual(DEFAULT_LOOK);
    expect(lookOf("nonsense")).toEqual(DEFAULT_LOOK);
    expect(lookOf({ head: "toaster", fur: "yes", color: "blue", addons: "visor" })).toEqual(DEFAULT_LOOK);
    expect(lookOf({ fur: true, color: "#7cc4ff" })).toMatchObject({ fur: true, color: "#7cc4ff" });
    // A saved look from before the other body shapes were removed still loads.
    expect(lookOf({ shape: "star", fur: true })).toMatchObject({ fur: true });
  });

  test("the head is classic unless it is a known other one", () => {
    expect(lookOf({ head: "screen" }).head).toBe("screen");
    expect(lookOf({ head: "toaster" }).head).toBe("classic");
    expect(lookOf({}).head).toBe("classic");
    expect(sameLook(DEFAULT_LOOK, { ...DEFAULT_LOOK, head: "screen" })).toBe(false);
  });

  test("a bare list is the old saved form: just wearables", () => {
    expect(lookOf(["visor"]).addons).toEqual(outfitOf(["visor"]));
  });

  test("wearables are unique, known, and never two rival pieces", () => {
    expect(outfitOf(["visor", "visor", "bogus"])).toEqual(outfitOf(["visor"]));
    expect(toggleAddon([], "visor", true)).toContain("visor");
    expect(toggleAddon(["visor"], "visor", false)).not.toContain("visor");
  });

  test("two looks are the same when every field is", () => {
    expect(sameLook(DEFAULT_LOOK, { ...DEFAULT_LOOK })).toBe(true);
    expect(sameLook(DEFAULT_LOOK, { ...DEFAULT_LOOK, fur: true })).toBe(false);
    expect(sameLook(DEFAULT_LOOK, { ...DEFAULT_LOOK, faceTune: { width: 1.2 } })).toBe(false);
  });
});

describe("tuning fur and face", () => {
  test("a tweak is kept as a difference from the preset, and putting it back drops it", () => {
    const first = Object.keys(FUR_PARAMS)[0] as keyof typeof FUR_PARAMS;
    const preset = furValues("silky", {})[first];
    const tuned = withTweak("silky", {}, first, FUR_PARAMS[first].max);
    expect(furValues("silky", tuned)[first]).toBe(FUR_PARAMS[first].max);
    expect(withTweak("silky", tuned, first, preset)).toEqual({});
  });

  test("face tweaks work the same way", () => {
    const tuned = withFaceTweak({}, "width", 1.2);
    expect(faceValues(tuned).width).toBe(1.2);
    expect(withFaceTweak(tuned, "width", FACE_PARAMS.width.default)).toEqual({});
  });
});
