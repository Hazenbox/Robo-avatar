import { beforeAll, describe, expect, test } from "vitest";
import { BODY_SHAPES, DEFAULT_LOOK, MASCOT_ADDONS, MASCOT_STATES, Robo, FUR_STYLES, type MascotEmote, type MascotState } from "../src";
import { fakeContext, installFakeDocument } from "./helpers";

beforeAll(() => installFakeDocument());

const STATES = Object.keys(MASCOT_STATES) as MascotState[];
const EMOTES: MascotEmote[] = ["love", "proud", "surprised", "wink", "excited", "confused"];

/** Runs `seconds` of animation at 60 fps and draws every few frames. */
function run(robo: Robo, seconds: number) {
  const ctx = fakeContext();
  for (let i = 0; i < seconds * 60; i++) {
    robo.update(1 / 60);
    if (i % 6 === 0) robo.draw(ctx, 100, 100, 60);
  }
  return ctx;
}

describe("the engine draws without a browser", () => {
  test("every state, for a few seconds, draws something and does not throw", () => {
    for (const s of STATES) {
      const robo = new Robo({ look: DEFAULT_LOOK });
      robo.setState(s, true);
      expect(run(robo, 3).calls).toBeGreaterThan(50);
    }
  });

  test("every emote plays and then lets go", () => {
    for (const e of EMOTES) {
      const robo = new Robo();
      robo.emote(e, 0.5);
      run(robo, 1.5);
      expect(robo.state).toBe("idle");
    }
  });

  test("the screen head draws every state and emote, turned and tinted", () => {
    for (const s of STATES) {
      for (const color of [null, "#7cc4ff"]) {
        const robo = new Robo({ look: { ...DEFAULT_LOOK, head: "screen", color } });
        robo.setState(s, true);
        robo.lookX = s.length % 2 ? 1 : -1;
        robo.lookActiveUntil = Infinity;
        expect(run(robo, 2).calls).toBeGreaterThan(50);
      }
    }
    for (const e of EMOTES) {
      const robo = new Robo({ look: { ...DEFAULT_LOOK, head: "screen" } });
      robo.emote(e, 0.5);
      run(robo, 1);
    }
  });

  test("every body shape, bare and with fur, in every fur style", () => {
    for (const shape of BODY_SHAPES) {
      for (const fur of [false, true]) {
        for (const furStyle of FUR_STYLES) {
          const robo = new Robo({ look: { ...DEFAULT_LOOK, shape, fur, furStyle } });
          run(robo, 0.5);
        }
      }
    }
  });

  test("every wearable on its own, and all at once", () => {
    for (const a of MASCOT_ADDONS) run(new Robo({ look: { ...DEFAULT_LOOK, addons: [a] } }), 0.5);
    run(new Robo({ look: { ...DEFAULT_LOOK, addons: [...MASCOT_ADDONS] } }), 0.5);
  });

  test("a colour, the face switches and reduced motion all draw", () => {
    const robo = new Robo({ reduced: true, look: { ...DEFAULT_LOOK, color: "#ff8fb4", facePlate: false, faceRing: false } });
    run(robo, 1);
  });

  test("three quick pokes make it dizzy", () => {
    const robo = new Robo();
    let dizzy = 0;
    robo.onDizzy = () => dizzy++;
    robo.poke();
    robo.poke();
    robo.poke();
    expect(dizzy + (robo.state === "dizzy" ? 1 : 0)).toBeGreaterThan(0);
  });

  test("the studio pose is deterministic: two engines draw the same calls", () => {
    const a = new Robo({ shadow: false });
    const b = new Robo({ shadow: false });
    a.studioPose = true;
    b.studioPose = true;
    expect(run(a, 1).calls).toBe(run(b, 1).calls);
  });
});
