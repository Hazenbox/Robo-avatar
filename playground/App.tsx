import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoboAvatar } from "robo-avatar/react";
import {
  ADDON_LABEL,
  COLOR_SWATCHES,
  DEFAULT_LOOK,
  HEAD_LABEL,
  HEAD_STYLES,
  MASCOT_ADDONS,
  MASCOT_STATES,
  colorOf,
  createRoboMediaStream,
  toggleAddon,
  type MascotEmote,
  type MascotLook,
  type MascotState,
  type RoboHandle,
  type RoboStreamHandle,
} from "robo-avatar";
import { FaceSettings, FurSettings, Group, Pill, Tile } from "./parts";
import { initialLook, reactSnippet, saveLook } from "./share";
import { createSynth } from "./voice";

const STATES = Object.keys(MASCOT_STATES) as MascotState[];
const STATE_LABEL: Record<MascotState, string> = {
  idle: "Idle",
  listening: "Listening",
  speaking: "Speaking",
  thinking: "Thinking",
  happy: "Happy",
  unimpressed: "Unimpressed (sad)",
  error: "Error",
  sleeping: "Sleeping",
  dizzy: "Dizzy",
  nodding: "Nodding",
  loading: "Loading",
  processing: "Processing",
  generating: "Generating",
};
const EMOTES: { key: MascotEmote; label: string; hotkey: string }[] = [
  { key: "love", label: "Love", hotkey: "L" },
  { key: "proud", label: "Proud", hotkey: "P" },
  { key: "surprised", label: "Surprised", hotkey: "S" },
  { key: "wink", label: "Wink", hotkey: "W" },
  { key: "excited", label: "Excited", hotkey: "E" },
  { key: "confused", label: "Confused", hotkey: "C" },
];
const SIZES = [32, 48, 96, 160];

/** The named expressions, as on the reference sheet: each is a state, or a state with an emote held on it. */
const EXPRESSIONS: { label: string; state: MascotState; emote?: MascotEmote }[] = [
  { label: "Happy", state: "happy" },
  { label: "Excited", state: "idle", emote: "excited" },
  { label: "Curious", state: "idle" },
  { label: "Sad", state: "unimpressed" },
  { label: "Surprised", state: "idle", emote: "surprised" },
  { label: "Thinking", state: "thinking" },
  { label: "Confused", state: "idle", emote: "confused" },
  { label: "Error", state: "error" },
];

/** One expression, held: its emote is played once on mount and never lets go. */
function ExpressionCell({ label, state, emote, look, glow, reduced, onPick, register }: {
  label: string;
  state: MascotState;
  emote?: MascotEmote;
  look: MascotLook;
  glow: number;
  reduced: boolean;
  onPick: () => void;
  register: (h: RoboHandle | null) => void;
}) {
  const handle = useRef<RoboHandle | null>(null);
  useEffect(() => {
    if (emote) handle.current?.emote(emote, Infinity);
  }, [emote]);
  return (
    <button type="button" className="cell" onClick={onPick}>
      <RoboAvatar
        ref={(h) => {
          handle.current = h;
          register(h);
        }}
        className="cellCanvas"
        state={state}
        look={look}
        glow={glow}
        shadow={false}
        followPointer={false}
        pokeOnClick={false}
        reducedMotion={reduced ? true : "auto"}
        radius={0.28}
      />
      <span className="caps">{label}</span>
    </button>
  );
}
const EMOTE_MS = 1800;

type SetLook = (change: Partial<MascotLook> | ((look: MascotLook) => MascotLook)) => void;

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

const THEME_KEY = "robo-avatar:theme";

/** The page's theme: the OS's until the visitor picks one, and then theirs. */
function useTheme() {
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      // Storage can be blocked; follow the OS.
    }
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const setTheme = (t: "light" | "dark") => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // Not saved; nothing breaks.
    }
  };
  return [theme, setTheme] as const;
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const [look, setLookState] = useState<MascotLook>(initialLook);
  const [state, setState] = useState<MascotState>("idle");
  const [playing, setPlaying] = useState<MascotEmote | null>(null);
  const [glow, setGlow] = useState(30);
  const [shadow, setShadow] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  const setLook: SetLook = useCallback((change) => setLookState((l) => (typeof change === "function" ? change(l) : { ...l, ...change })), []);
  useEffect(() => saveLook(look), [look]);

  const stage = useRef<RoboHandle | null>(null);
  const handles = useRef(new Map<string, RoboHandle>());
  const reg = (id: string) => (h: RoboHandle | null) => {
    if (h) handles.current.set(id, h);
    else handles.current.delete(id);
  };
  const video = useRef<HTMLVideoElement | null>(null);
  const feed = useRef<RoboStreamHandle | null>(null);
  const live = useRef({ state });
  live.current = { state };
  const playTimer = useRef<number | undefined>(undefined);

  const choose = useCallback((s: MascotState) => {
    setState(s);
    feed.current?.setState(s === "speaking" ? "idle" : s);
  }, []);

  const emote = useCallback((e: MascotEmote) => {
    stage.current?.emote(e);
    feed.current?.emote(e);
    setPlaying(e);
    window.clearTimeout(playTimer.current);
    playTimer.current = window.setTimeout(() => setPlaying(null), EMOTE_MS);
  }, []);

  // Three quick pokes on Robo make it dizzy; the engine tells us, and we put it back after a moment.
  useEffect(() => {
    const robo = stage.current?.robo;
    if (!robo) return;
    robo.onDizzy = () => {
      choose("dizzy");
      window.setTimeout(() => {
        if (live.current.state === "dizzy") choose("idle");
      }, 2600);
    };
    return () => {
      robo.onDizzy = null;
    };
  }, [choose]);

  // One loop feeds a made-up voice level to every Robo on the page, so Speaking and Listening move.
  useEffect(() => {
    const synth = createSynth();
    let raf = 0;
    let lastPulse = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      const level = synth(ms / 1000);
      for (const h of handles.current.values()) {
        h.setVoice(level);
        h.setRoom(level * 0.8);
      }
      if (level > 0.3 && ms - lastPulse > 250) {
        feed.current?.pulseRoom();
        lastPulse = ms;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The video-call stream: the same Robo, as a MediaStream.
  useEffect(() => {
    let f: RoboStreamHandle;
    try {
      f = createRoboMediaStream({ look });
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : "This browser cannot make a video stream");
      return;
    }
    f.setSpeakingSource(() => live.current.state === "speaking");
    f.setState(live.current.state === "speaking" ? "idle" : live.current.state);
    feed.current = f;
    const v = video.current;
    if (v) {
      v.srcObject = f.stream;
      void v.play().catch(() => undefined);
    }
    return () => {
      f.stop();
      feed.current = null;
      if (v) v.srcObject = null;
    };
    // Made once; the look is pushed to it by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => feed.current?.setLook(look), [look]);

  // Keys: 1 to 9 pick a state; L, P, S, W play an emote.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < STATES.length) choose(STATES[i]);
      const em = EMOTES.find((x) => x.hotkey === e.key.toUpperCase());
      if (em) emote(em.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, emote]);

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    } catch {
      setCopied("Copy failed: select the text instead");
    }
  };
  const snippet = useMemo(() => reactSnippet(look), [look]);
  const thumb = (change: Partial<MascotLook>): MascotLook => ({ ...DEFAULT_LOOK, ...change });
  const classic = look.head === "classic";
  const customColor = !!look.color && !COLOR_SWATCHES.some((c) => c.value === look.color);

  return (
    <>
      <div className="topWrap" data-scrolled={scrolled || undefined}>
        <header className="top">
          <RoboAvatar size={56} look={look} glow={0.2} shadow={false} label="Robo" />
          <div className="title">
            <h1>Robo avatar</h1>
            <p>A tiny animated robot, drawn in Canvas 2D and WebGL2.</p>
          </div>
          <button type="button" className="iconBtn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <a className="iconBtn" href="https://github.com/Hazenbox/Robo-avatar" aria-label="Robo avatar on GitHub" title="GitHub">
            <GitHubIcon />
          </a>
        </header>
      </div>

      <main className="page">
        <div className="layout">
          <section className="stageColumn" aria-label="Stage">
            <div className="stageBox">
              <RoboAvatar
                ref={(h) => {
                  stage.current = h;
                  reg("stage")(h);
                }}
                className="stage"
                look={look}
                state={state}
                glow={glow / 100}
                shadow={shadow}
                reducedMotion={reduced ? true : "auto"}
                label="Robo, the animated mascot. Click it to poke it."
              />
            </div>
            <p className="hint center">Keys 1–9 pick a state · L, P, S, W, E, C play an emote · click Robo to poke it, three times to make it dizzy</p>
          </section>

          <aside className="side" aria-label="Controls">
            <Group title="State">
              {STATES.map((s, i) => (
                <Pill key={s} on={state === s} onClick={() => choose(s)} label={`${STATE_LABEL[s]} (key ${i + 1})`}>
                  {STATE_LABEL[s]}
                </Pill>
              ))}
            </Group>

            <Group title="Emote">
              {EMOTES.map((e) => (
                <Pill key={e.key} on={playing === e.key} onClick={() => emote(e.key)} label={`${e.label} (key ${e.hotkey})`}>
                  {e.label}
                </Pill>
              ))}
            </Group>

            <Group title="Head" hint={classic ? undefined : "The screen head has its own face, rim light and ears. Colour, fur, face and wearables are for the classic head."}>
              {HEAD_STYLES.map((h) => (
                <Tile key={h} label={HEAD_LABEL[h]} on={look.head === h} look={thumb({ head: h, color: look.color })} onClick={() => setLook({ head: h })} />
              ))}
            </Group>

            {classic && (
            <Group title="Wear">
              {MASCOT_ADDONS.map((a) => (
                <Tile key={a} label={ADDON_LABEL[a]} on={look.addons.includes(a)} look={thumb({ addons: [a] })} onClick={() => setLook({ addons: toggleAddon(look.addons, a, !look.addons.includes(a)) })} />
              ))}
            </Group>

            )}


            {classic && (
              <>
            <Group
              title="Coat and colour"
              after={
                <div className="swatches">
                  {COLOR_SWATCHES.map((c) => (
                    <button key={c.label} type="button" className="swatch" aria-pressed={look.color === c.value} aria-label={c.label} title={c.label} onClick={() => setLook({ color: c.value })}>
                      <span style={{ background: c.value ?? "#f3f3f6" }} />
                    </button>
                  ))}
                  <label className="swatch" data-custom aria-pressed={customColor} title="Any colour">
                    <span style={{ background: look.color ?? undefined }} />
                    <input type="color" aria-label="Any colour" value={look.color ?? "#8b6cff"} onChange={(e) => setLook({ color: colorOf(e.target.value) })} />
                  </label>
                </div>
              }
            >
              <Tile label="Fur" on={look.fur} look={thumb({ fur: true, color: look.color, furStyle: look.furStyle, furTune: look.furTune })} onClick={() => setLook({ fur: !look.fur })} />
            </Group>
            <FurSettings look={look} setLook={setLook} />

            <Group title="Face">
              <Tile
                label="Face plate"
                on={look.facePlate}
                look={thumb({ fur: look.fur, furStyle: look.furStyle, furTune: look.furTune, color: look.color, faceRing: look.faceRing, faceTune: look.faceTune })}
                onClick={() => setLook({ facePlate: !look.facePlate })}
              />
              <Pill on={look.facePlate && look.faceRing} disabled={!look.facePlate} onClick={() => setLook({ faceRing: !look.faceRing })}>
                Ring round the face
              </Pill>
              <Pill on={false} onClick={() => setLook({ ...DEFAULT_LOOK })}>
                Reset everything
              </Pill>
            </Group>
            <FaceSettings look={look} setLook={setLook} />
              </>
            )}

            <Group
              title="Look"
              after={
                classic ? (
                  <label className="glow">
                    <span>Glow</span>
                    <input type="range" min={0} max={100} value={glow} onChange={(e) => setGlow(Number(e.target.value))} aria-label="Glow" />
                  </label>
                ) : undefined
              }
            >
              <Pill on={shadow} onClick={() => setShadow(!shadow)}>
                Floor shadow
              </Pill>
              <Pill on={reduced} onClick={() => setReduced(!reduced)}>
                Reduced motion
              </Pill>
            </Group>
          </aside>
        </div>

        <section className="section" aria-label="Expressions">
          <h2>Expressions</h2>
          <div className="sheet four">
            {EXPRESSIONS.map((e) => (
              <ExpressionCell
                key={e.label}
                {...e}
                look={look}
                glow={glow / 100}
                reduced={reduced}
                register={reg(`expr-${e.label}`)}
                onPick={() => {
                  choose(e.state);
                  if (e.emote) emote(e.emote);
                }}
              />
            ))}
          </div>
        </section>

        <section className="section" aria-label="Every state">
          <h2>Every state</h2>
          <div className="sheet">
            {STATES.map((s) => (
              <button key={s} type="button" className="cell" aria-pressed={state === s} onClick={() => choose(s)}>
                <RoboAvatar ref={reg(`sheet-${s}`)} className="cellCanvas" state={s} look={look} glow={glow / 100} shadow={false} followPointer={false} pokeOnClick={false} reducedMotion={reduced ? true : "auto"} radius={0.28} />
                <span>{STATE_LABEL[s]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="section" aria-label="Sizes and video stream">
          <h2>Sizes and video stream</h2>
          <div className="sizes">
            {SIZES.map((sz) => (
              <figure key={sz}>
                <RoboAvatar ref={reg(`size-${sz}`)} size={sz} look={look} state={state} shadow={false} followPointer={false} pokeOnClick={false} reducedMotion={reduced ? true : "auto"} />
                <figcaption>{sz} px</figcaption>
              </figure>
            ))}
            <figure className="tile16x9">
              <video ref={video} muted playsInline aria-label="Robo as a live video stream" />
              <figcaption>{feedError ?? "createRoboMediaStream(): the same Robo as a MediaStream, for a virtual camera or a video call tile"}</figcaption>
            </figure>
          </div>
        </section>

        <section className="section" aria-label="Use this look">
          <h2>Use this look</h2>
          <pre className="code" tabIndex={0}>
            {snippet}
          </pre>
          <div className="pills">
            <Pill on={copied === "snippet"} onClick={() => void copy("snippet", snippet)}>
              {copied === "snippet" ? "Copied" : "Copy React code"}
            </Pill>
            <Pill on={copied === "json"} onClick={() => void copy("json", JSON.stringify(look, null, 2))}>
              {copied === "json" ? "Copied" : "Copy look as JSON"}
            </Pill>
            <Pill on={copied === "link"} onClick={() => void copy("link", location.href)}>
              {copied === "link" ? "Copied" : "Copy link to this look"}
            </Pill>
          </div>
          {copied && !["snippet", "json", "link"].includes(copied) && <p className="hint">{copied}</p>}
        </section>
      </main>

      <footer className="foot">
        <p>
          Robo avatar is MIT licensed. The animation technique follows coucou&apos;s Mochi engine; see <a href="https://github.com/Hazenbox/Robo-avatar/blob/main/NOTICE">NOTICE</a>.
        </p>
      </footer>
    </>
  );
}
