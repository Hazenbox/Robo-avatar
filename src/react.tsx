import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { MascotLook } from "./look";
import { mountRobo, type MountOptions, type RoboHandle } from "./mount";
import type { MascotEmote, MascotState } from "./robo";

export interface RoboAvatarProps extends Omit<MountOptions, "look" | "state" | "glow" | "shadow"> {
  /** What Robo wears and how it looks. Anything left out takes its default. */
  look?: Partial<MascotLook>;
  state?: MascotState;
  glow?: number;
  shadow?: boolean;
  /** Plays an emote each time this value changes to a new emote (set it back to null to arm it again). */
  emote?: MascotEmote | null;
  /** Robo's voice level, 0 to 1, for the "speaking" state. */
  voice?: number;
  /** The room's level, 0 to 1, for the "listening" state. */
  room?: number;
  /** A square, in CSS px. Or size the canvas yourself with `className` or `style`. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Spoken by screen readers; without it the avatar is decorative and hidden from them. */
  label?: string;
}

/**
 * Robo as a React component. Pass `ref` to get the same handle `mountRobo`
 * returns, for emotes, pokes and anything else imperative.
 *
 * ```tsx
 * <RoboAvatar size={160} state="happy" look={{ fur: true }} />
 * ```
 */
export const RoboAvatar = forwardRef<RoboHandle | null, RoboAvatarProps>(function RoboAvatar(props, ref) {
  const { look, state, glow, shadow, emote, voice, room, size, className, style, label, ...mountOpts } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handle = useRef<RoboHandle | null>(null);
  // What the mount saw first; later changes go through the handle, never a remount.
  const first = useRef({ look, state, glow, shadow, mountOpts });
  first.current = { look, state, glow, shadow, mountOpts };

  // A layout effect, declared before useImperativeHandle: the handle must exist by the time the ref is filled.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const f = first.current;
    const h = mountRobo(canvas, { ...f.mountOpts, look: f.look, state: f.state, glow: f.glow, shadow: f.shadow });
    handle.current = h;
    return () => {
      h.destroy();
      handle.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => handle.current as RoboHandle, []);

  useEffect(() => {
    if (look) handle.current?.setLook(look);
  }, [look]);
  useEffect(() => {
    if (state) handle.current?.setState(state);
  }, [state]);
  useEffect(() => {
    if (glow !== undefined) handle.current?.setGlow(glow);
  }, [glow]);
  useEffect(() => {
    if (shadow !== undefined) handle.current?.setShadow(shadow);
  }, [shadow]);
  useEffect(() => {
    if (emote) handle.current?.emote(emote);
  }, [emote]);
  useEffect(() => {
    if (voice !== undefined) handle.current?.setVoice(voice);
  }, [voice]);
  useEffect(() => {
    if (room !== undefined) handle.current?.setRoom(room);
  }, [room]);
  useEffect(() => {
    if (mountOpts.reducedMotion !== undefined) handle.current?.setReducedMotion(mountOpts.reducedMotion);
  }, [mountOpts.reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", ...(size ? { width: size, height: size } : null), ...style }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
});
