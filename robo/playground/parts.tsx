import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FACE_GROUPS,
  FACE_PARAMS,
  FACE_PARAM_KEYS,
  FUR_GROUPS,
  FUR_PARAMS,
  FUR_PARAM_KEYS,
  FUR_STYLES,
  FUR_STYLE_HINT,
  FUR_STYLE_LABEL,
  faceValues,
  furStyleOf,
  furValues,
  lookThumb,
  withFaceTweak,
  withTweak,
  type FaceGroup,
  type FurParam,
  type MascotLook,
} from "robo-avatar";

/** What a settings row needs to know about one setting. */
interface Spec {
  label: string;
  hint: string;
  kind?: "range" | "choice" | "toggle";
  min: number;
  max: number;
  step: number;
  options?: readonly string[];
  unit?: "%" | "°" | "R" | "×" | "±";
}

type SetLook = (change: Partial<MascotLook> | ((look: MascotLook) => MascotLook)) => void;

/** A labelled run of controls. */
export function Group({ title, hint, children, after }: { title: string; hint?: ReactNode; children: ReactNode; after?: ReactNode }) {
  return (
    <section className="group" aria-label={title}>
      <h2>{title}</h2>
      <div className="pills">{children}</div>
      {after}
      {hint && <p className="hint">{hint}</p>}
    </section>
  );
}

export function Pill({ on, onClick, children, disabled, label }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className="pill" aria-pressed={on} onClick={onClick} disabled={disabled} aria-label={label}>
      {children}
    </button>
  );
}

/** A picture of Robo wearing one thing, drawn by the engine itself. */
function Thumb({ look, size }: { look: MascotLook; size: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const key = JSON.stringify(look);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    const x = c.getContext("2d");
    x?.drawImage(lookThumb(look, size, dpr), 0, 0);
    // `key` stands for the whole look.
  }, [key, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}

/** One toggle with a picture on it, ringed when on. */
export function Tile({ label, on, onClick, look, children }: { label: string; on: boolean; onClick: () => void; look: MascotLook; children?: ReactNode }) {
  return (
    <div className="tileWrap">
      <button type="button" className="tile" aria-pressed={on} aria-label={label} title={label} onClick={onClick}>
        <Thumb look={look} size={60} />
        <span>{label}</span>
      </button>
      {children}
    </div>
  );
}

function format(spec: Spec, v: number): string {
  switch (spec.unit) {
    case "%":
      return `${Math.round(v * 100)}%`;
    case "°":
      return `${Math.round(v)}°`;
    case "R":
      return `${v > 0 && spec.min < 0 ? "+" : ""}${v.toFixed(spec.step < 0.01 ? 3 : 2)} R`;
    case "×":
      return `${v.toFixed(2)}×`;
    case "±":
      return `±${Math.round(v * 100)}%`;
    default:
      return String(v);
  }
}

function SettingRow({ spec, value, tweaked, onChange }: { spec: Spec; value: number; tweaked: boolean; onChange: (v: number) => void }) {
  const label = (
    <span className="rowLabel" title={spec.hint}>
      {spec.label}
      {tweaked && <i className="dot" aria-label="changed" />}
    </span>
  );
  if (spec.kind === "toggle") {
    return (
      <label className="row">
        {label}
        <input type="checkbox" role="switch" checked={value > 0.5} onChange={(e) => onChange(e.target.checked ? 1 : 0)} aria-label={spec.label} />
      </label>
    );
  }
  if (spec.kind === "choice" && spec.options) {
    return (
      <div className="setting">
        {label}
        <div className="segment" role="group" aria-label={spec.label}>
          {spec.options.map((o, i) => (
            <button key={o} type="button" aria-pressed={value === i} onClick={() => onChange(i)}>
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="setting">
      <div className="row">
        {label}
        <span className={tweaked ? "value tweaked" : "value"}>{format(spec, value)}</span>
      </div>
      <input type="range" min={spec.min} max={spec.max} step={spec.step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={spec.label} />
    </div>
  );
}

/** A disclosure: closed by default, so the panel stays short. */
function Fold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fold">
      <button type="button" className="foldHead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="chev" aria-hidden="true">
          {open ? "–" : "+"}
        </span>
      </button>
      {hint && !open && <p className="hint">{hint}</p>}
      {open && <div className="foldBody">{children}</div>}
    </div>
  );
}

/** Every setting behind the fur: pick a plush, then tune it. */
export function FurSettings({ look, setLook }: { look: MascotLook; setLook: SetLook }) {
  const values = furValues(look.furStyle, look.furTune);
  const tweaked = Object.keys(look.furTune).length;
  return (
    <Fold title="Fur settings" hint="Three plush fabrics, and every number behind them.">
      <div className="segment" role="group" aria-label="Fur style">
        {FUR_STYLES.map((s) => (
          <button key={s} type="button" aria-pressed={look.furStyle === s} onClick={() => setLook({ fur: true, furStyle: furStyleOf(s), furTune: {} })}>
            {FUR_STYLE_LABEL[s]}
          </button>
        ))}
      </div>
      <p className="hint">
        {FUR_STYLE_HINT[look.furStyle]}
        {tweaked ? ` · ${tweaked} tweak${tweaked === 1 ? "" : "s"}` : ""}
      </p>
      {!look.fur && (
        <button type="button" className="note" onClick={() => setLook({ fur: true })}>
          Fur is off. Changing a setting puts it on.
        </button>
      )}
      {FUR_GROUPS.map((group) => (
        <section key={group} className="settingGroup" aria-label={group}>
          <h3>{group}</h3>
          {FUR_PARAM_KEYS.filter((k) => FUR_PARAMS[k].group === group).map((k) => (
            <SettingRow
              key={k}
              spec={FUR_PARAMS[k] as Spec}
              value={values[k]}
              tweaked={k in look.furTune}
              onChange={(v) => setLook((l) => ({ ...l, fur: true, furTune: withTweak(l.furStyle, l.furTune, k as FurParam, v) }))}
            />
          ))}
        </section>
      ))}
      <button type="button" className="link" disabled={!tweaked} onClick={() => setLook({ fur: true, furTune: {} })}>
        Reset to {FUR_STYLE_LABEL[look.furStyle]}
      </button>
    </Fold>
  );
}

/** Every setting behind the face. Shows only what applies to the face Robo has now. */
export function FaceSettings({ look, setLook }: { look: MascotLook; setLook: SetLook }) {
  const values = faceValues(look.faceTune);
  const tweaked = Object.keys(look.faceTune).length;
  const shows = (g: FaceGroup) => (g === "Velvet" ? look.fur : g === "Plate" ? !look.fur : true);
  return (
    <Fold title="Face settings" hint="The plate's shape and place, the eyes, and the finish.">
      <p className="hint">
        {look.fur ? "With fur, the face plate is a patch of pale velvet." : "The smooth inset plate on a plain body."}
        {tweaked ? ` · ${tweaked} tweak${tweaked === 1 ? "" : "s"}` : ""}
      </p>
      {FACE_GROUPS.filter(shows).map((group) => (
        <section key={group} className="settingGroup" aria-label={group}>
          <h3>{group}</h3>
          {FACE_PARAM_KEYS.filter((k) => FACE_PARAMS[k].group === group)
            .filter((k) => k !== "ringWeight" || (look.facePlate && look.faceRing))
            .map((k) => (
              <SettingRow
                key={k}
                spec={FACE_PARAMS[k] as unknown as Spec}
                value={values[k]}
                tweaked={k in look.faceTune}
                onChange={(v) => setLook((l) => ({ ...l, faceTune: withFaceTweak(l.faceTune, k, v) }))}
              />
            ))}
        </section>
      ))}
      <button type="button" className="link" disabled={!tweaked} onClick={() => setLook({ faceTune: {} })}>
        Reset the face
      </button>
    </Fold>
  );
}
