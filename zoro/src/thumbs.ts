/**
 * Small pictures of Zoro for pickers and wardrobes: wearing one thing, drawn by the
 * engine itself. Each is drawn once per look and size, then copied wherever
 * it is shown, so a menu full of them costs nothing to open twice.
 */

import { DEFAULT_LOOK, type MascotLook } from "./look";
import { Zoro } from "./zoro";

const cache = new Map<string, HTMLCanvasElement>();

/** The look a thumbnail shows: its default, with one change. */
export function thumbLook(change: Partial<MascotLook>): MascotLook {
  return { ...DEFAULT_LOOK, ...change };
}

/** A drawn picture of it in `look`, `size` CSS pixels square at `dpr`. */
export function lookThumb(look: MascotLook, size: number, dpr: number): HTMLCanvasElement {
  const key = `${JSON.stringify(look)}|${size}|${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const x = canvas.getContext("2d");
  if (x) {
    const bot = new Zoro({ reduced: true, glowAmount: 0.15, shadow: false, look });
    bot.update(1 / 60);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Room for the widest pieces: the headset.
    bot.draw(x, size / 2, size / 2, size * 0.32);
  }
  cache.set(key, canvas);
  return canvas;
}
