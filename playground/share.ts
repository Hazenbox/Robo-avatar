import { DEFAULT_LOOK, lookOf, sameLook, type MascotLook } from "robo-avatar";

const KEY = "robo-avatar:look:v3";

const toB64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

/** A look from the page's link (#look=...), else the last one used here, else the default. */
export function initialLook(): MascotLook {
  try {
    const m = /[#&]look=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) return lookOf(JSON.parse(fromB64(m[1])));
  } catch {
    // A mangled link falls through to the saved look.
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return lookOf(JSON.parse(saved));
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return DEFAULT_LOOK;
}

/** Keeps the address bar and local storage in step with the look, so a link shares it. */
export function saveLook(look: MascotLook) {
  const isDefault = sameLook(look, DEFAULT_LOOK);
  try {
    history.replaceState(null, "", isDefault ? location.pathname + location.search : `#look=${toB64(JSON.stringify(look))}`);
  } catch {
    // Some embedded contexts forbid it.
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // Not saved; nothing breaks.
  }
}

/** The look as the smallest code that recreates it. */
export function reactSnippet(look: MascotLook): string {
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_LOOK) as (keyof MascotLook)[]) {
    if (JSON.stringify(look[k]) !== JSON.stringify(DEFAULT_LOOK[k])) diff[k] = look[k];
  }
  const props = Object.keys(diff).length ? ` look={${JSON.stringify(diff)}}` : "";
  return `import { RoboAvatar } from "robo-avatar/react";\n\n<RoboAvatar size={160}${props} />`;
}
