import { beforeAll, describe, expect, test } from "vitest";
import { DEFAULT_LOOK, MASCOT_ADDONS, MASCOT_STATES, Zoro, FUR_STYLES, type MascotEmote, type MascotState } from "../src";
import { fakeContext, installFakeDocument } from "./helpers";

beforeAll(() => installFakeDocument());

const STATES = Object.keys(MASCOT_STATES) as MascotState[];
const EMOTES: MascotEmote[] = ["love", "proud", "surprised", "wink", "excited", "confused"];

/** Runs `seconds` of animation at 60 fps and draws every few frames. */
function run(zoro: Zoro, seconds: number) {
  const ctx = fakeContext();
  for (let i = 0; i < seconds * 60; i++) {
    zoro.update(1 / 60);
    if (i % 6 === 0) zoro.draw(ctx, 100, 100, 60);
  }
  return ctx;
}

describe("the engine draws without a browser", () => {
  test("every state, for a few seconds, draws something and does not throw", () => {
    for (const s of STATES) {
      const zoro = new Zoro({ look: DEFAULT_LOOK });
      zoro.setState(s, true);
      expect(run(zoro, 3).calls).toBeGreaterThan(50);
    }
  });

  test("every emote plays and then lets go", () => {
    for (const e of EMOTES) {
      const zoro = new Zoro();
      zoro.emote(e, 0.5);
      run(zoro, 1.5);
      expect(zoro.state).toBe("idle");
    }
  });

  test("the screen head draws every state and emote, turned and tinted", () => {
    for (const s of STATES) {
      for (const color of [null, "#7cc4ff"]) {
        const zoro = new Zoro({ look: { ...DEFAULT_LOOK, head: "screen", color } });
        zoro.setState(s, true);
        zoro.lookX = s.length % 2 ? 1 : -1;
        zoro.lookActiveUntil = Infinity;
        expect(run(zoro, 2).calls).toBeGreaterThan(50);
      }
    }
    for (const e of EMOTES) {
      const zoro = new Zoro({ look: { ...DEFAULT_LOOK, head: "screen" } });
      zoro.emote(e, 0.5);
      run(zoro, 1);
    }
  });

  test("the body, bare and with fur, in every fur style", () => {
    for (const fur of [false, true]) {
      for (const furStyle of FUR_STYLES) {
        const zoro = new Zoro({ look: { ...DEFAULT_LOOK, fur, furStyle } });
        run(zoro, 0.5);
      }
    }
  });

  test("every wearable on its own, and all at once", () => {
    for (const a of MASCOT_ADDONS) run(new Zoro({ look: { ...DEFAULT_LOOK, addons: [a] } }), 0.5);
    run(new Zoro({ look: { ...DEFAULT_LOOK, addons: [...MASCOT_ADDONS] } }), 0.5);
  });

  test("a colour, the face switches and reduced motion all draw", () => {
    const zoro = new Zoro({ reduced: true, look: { ...DEFAULT_LOOK, color: "#ff8fb4", facePlate: false, faceRing: false } });
    run(zoro, 1);
  });

  test("three quick pokes make it dizzy", () => {
    const zoro = new Zoro();
    let dizzy = 0;
    zoro.onDizzy = () => dizzy++;
    zoro.poke();
    zoro.poke();
    zoro.poke();
    expect(dizzy + (zoro.state === "dizzy" ? 1 : 0)).toBeGreaterThan(0);
  });

  test("the studio pose is deterministic: two engines draw the same calls", () => {
    const a = new Zoro({ shadow: false });
    const b = new Zoro({ shadow: false });
    a.studioPose = true;
    b.studioPose = true;
    expect(run(a, 1).calls).toBe(run(b, 1).calls);
  });
});
