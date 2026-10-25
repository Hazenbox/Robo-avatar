import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoboAvatar } from "robo-avatar/react";
import {
  ADDON_LABEL,
  BODY_SHAPES,
  COLOR_SWATCHES,
  DEFAULT_LOOK,
  MASCOT_ADDONS,
  MASCOT_STATES,
  SHAPE_LABEL,
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
import { createSynth, openMic, type Mic } from "./voice";

const STATES = Object.keys(MASCOT_STATES) as MascotState[];
const STATE_LABEL: Record<MascotState, string> = {
  idle: "Idle",
  listening: "Listening",
  speaking: "Speaking",
  thinking: "Thinking",
  happy: "Happy",
  unimpressed: "Unimpressed",
  error: "Error",
  sleeping: "Sleeping",
  dizzy: "Dizzy",
};
const EMOTES: { key: MascotEmote; label: string; hotkey: string }[] = [
  { key: "love", label: "Love", hotkey: "L" },
  { key: "proud", label: "Proud", hotkey: "P" },
  { key: "surprised", label: "Surprised", hotkey: "S" },
  { key: "wink", label: "Wink", hotkey: "W" },
];
const SIZES = [32, 48, 96, 160];
const EMOTE_MS = 1800;

type SetLook = (change: Partial<MascotLook> | ((look: MascotLook) => MascotLook)) => void;

export default function App() {
  const [look, setLookState] = useState<MascotLook>(initialLook);
  const [state, setState] = useState<MascotState>("idle");
  const [playing, setPlaying] = useState<MascotEmote | null>(null);
  const [glow, setGlow] = useState(30);
  const [shadow, setShadow] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [source, setSource] = useState<"synth" | "mic">("synth");
  const [micError, setMicError] = useState<string | null>(null);
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
  const meter = useRef<HTMLSpanElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const feed = useRef<RoboStreamHandle | null>(null);
  const mic = useRef<Mic | null>(null);
  const live = useRef({ state, source });
  live.current = { state, source };
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

  // One loop feeds the voice level to every Robo on the page.
  useEffect(() => {
    const synth = createSynth();
    let raf = 0;
    let lastPulse = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      const level = live.current.source === "mic" && mic.current ? mic.current.level() : synth(ms / 1000);
      if (meter.current) meter.current.style.width = `${Math.round(level * 100)}%`;
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

  const toggleMic = async (on: boolean) => {
    if (!on) {
      mic.current?.stop();
      mic.current = null;
      setSource("synth");
      return;
    }
    try {
      mic.current = await openMic();
      setMicError(null);
      setSource("mic");
    } catch (e) {
      setMicError(e instanceof Error ? e.message : "The microphone is not available");
      setSource("synth");
    }
  };
  useEffect(() => () => mic.current?.stop(), []);

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
  const customColor = !!look.color && !COLOR_SWATCHES.some((c) => c.value === look.color);

  return (
    <>
      <header className="top">
        <RoboAvatar size={40} look={look} glow={0.2} shadow={false} label="Robo" />
        <div className="title">
          <h1>Robo avatar</h1>
          <p>A tiny animated robot, drawn in Canvas 2D and WebGL2. No images, no Lottie.</p>
        </div>
        <a className="gh" href="https://github.com/Hazenbox/Robo-avatar">
          GitHub
        </a>
      </header>

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
            <p className="hint center">Keys 1–9 pick a state · L, P, S, W play an emote · click Robo to poke it, three times to make it dizzy</p>
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

            <Group title="Wear">
              {MASCOT_ADDONS.map((a) => (
                <Tile key={a} label={ADDON_LABEL[a]} on={look.addons.includes(a)} look={thumb({ addons: [a] })} onClick={() => setLook({ addons: toggleAddon(look.addons, a, !look.addons.includes(a)) })} />
              ))}
            </Group>

            <Group title="Body">
              {BODY_SHAPES.map((sh) => (
                <Tile key={sh} label={SHAPE_LABEL[sh]} on={look.shape === sh} look={thumb({ shape: sh })} onClick={() => setLook({ shape: sh })} />
              ))}
            </Group>

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

            <Group
              title="Voice"
              hint={micError ?? "Speaking moves the mouth and bars with the level; Listening lifts the arcs with it. The microphone only measures loudness: nothing is recorded or sent."}
              after={
                <div className="meter" aria-hidden="true">
                  <span ref={meter} />
                </div>
              }
            >
              <Pill on={source === "synth"} onClick={() => void toggleMic(false)}>
                Synthetic voice
              </Pill>
              <Pill on={source === "mic"} onClick={() => void toggleMic(true)}>
                Microphone
              </Pill>
            </Group>

            <Group
              title="Look"
              after={
                <label className="glow">
                  <span>Glow</span>
                  <input type="range" min={0} max={100} value={glow} onChange={(e) => setGlow(Number(e.target.value))} aria-label="Glow" />
                </label>
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
