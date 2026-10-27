import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { MASCOT_STATES, SOUND_CUES, Zoro, type MascotEmote, type MascotState, type ZoroCue } from "../src";
import { createZoroSound } from "../src/sound";
import { installFakeDocument } from "./helpers";

const STATES = Object.keys(MASCOT_STATES) as MascotState[];
const EMOTES: MascotEmote[] = ["love", "proud", "surprised", "wink", "excited", "confused"];

/** An AudioContext stand-in: every node connects and accepts every call, and we count what was made. */
function installFakeAudio() {
  const made: Record<string, number> = {};
  const param = () => new Proxy({ value: 0 }, { get: (t, p: string) => (p in t ? t[p as "value"] : () => undefined) });
  const node = (): unknown =>
    new Proxy({} as Record<string, unknown>, {
      get(t, p: string) {
        if (p in t) return t[p];
        if (p === "connect") return (to: unknown) => to;
        if (["gain", "frequency", "Q", "threshold", "knee", "ratio", "attack", "release"].includes(p)) return (t[p] = param());
        return () => undefined;
      },
      set(t, p: string, v) {
        t[p] = v;
        return true;
      },
    });
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    sampleRate = 8000;
    destination = node();
    resume = () => Promise.resolve();
    createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
    constructor() {
      return new Proxy(this, {
        get(t, p: string) {
          if (p in t) return (t as never)[p];
          if (p.startsWith("create")) return () => ((made[p] = (made[p] ?? 0) + 1), node());
          return undefined;
        },
      });
    }
  }
  const g = globalThis as Record<string, unknown>;
  g.AudioContext = FakeAudioContext;
  // The visitor has already clicked on the page.
  vi.stubGlobal("navigator", { ...globalThis.navigator, userActivation: { hasBeenActive: true } });
  return made;
}

beforeAll(() => installFakeDocument());
afterAll(() => {
  delete (globalThis as Record<string, unknown>).AudioContext;
  vi.unstubAllGlobals();
});

describe("sound", () => {
  test("every state, emote and interaction has a cue", () => {
    const want: ZoroCue[] = [...STATES, ...EMOTES, "poke", "nod", "wear"];
    expect(Object.keys(SOUND_CUES).sort()).toEqual([...want].sort());
  });

  test("the engine calls out new states, emotes, pokes and nods", () => {
    const zoro = new Zoro();
    const heard: ZoroCue[] = [];
    zoro.onCue = (c) => heard.push(c);
    zoro.setState("thinking");
    zoro.setState("thinking");
    zoro.emote("wink");
    zoro.poke();
    zoro.setState("nodding");
    for (let i = 0; i < 30; i++) zoro.update(1 / 60);
    expect(heard).toEqual(["thinking", "wink", "poke", "nodding", "nod"]);
  });

  test("without Web Audio it stays quiet and never throws", () => {
    const s = createZoroSound({ ambient: true });
    for (const c of Object.keys(SOUND_CUES) as ZoroCue[]) s.cue(c, "screen");
    s.tick("generating", 0.5, "classic");
    s.set({ volume: 0.2 });
    s.destroy();
  });

  test("with Web Audio, every cue and every ambient bed builds its sound in both voices", () => {
    const made = installFakeAudio();
    const s = createZoroSound({ ambient: true, volume: 0.4 });
    for (const head of ["screen", "classic"] as const) {
      for (const c of Object.keys(SOUND_CUES) as ZoroCue[]) s.cue(c, head);
      for (const st of STATES) for (let i = 0; i < 3; i++) s.tick(st, i % 2 ? 0.9 : 0, head);
    }
    expect(made.createOscillator).toBeGreaterThan(100);
    expect(made.createBufferSource).toBeGreaterThan(5);
    expect(made.createDynamicsCompressor).toBe(1);
    s.destroy();
  });
});
