export { mountRobo, type MountOptions, type RoboHandle } from "./mount";
export { Robo, MASCOT_STATES, type MascotState, type MascotEmote, type MascotAddon } from "./robo";
export {
  COLOR_SWATCHES,
  DEFAULT_LOOK,
  HEAD_LABEL,
  HEAD_STYLES,
  colorOf,
  lookOf,
  sameLook,
  type HeadStyle,
  type MascotLook,
} from "./look";
export { ADDON_LABEL, MASCOT_ADDONS, outfitOf, toggleAddon } from "./addons";
export {
  FUR_GROUPS,
  FUR_PARAMS,
  FUR_PARAM_KEYS,
  FUR_STYLES,
  FUR_STYLE_HINT,
  FUR_STYLE_LABEL,
  furStyleOf,
  furValues,
  withTweak,
  type FurParam,
  type FurStyle,
  type FurTune,
} from "./fur-style";
export {
  FACE_GROUPS,
  FACE_PARAMS,
  FACE_PARAM_KEYS,
  faceValues,
  withFaceTweak,
  type FaceGroup,
  type FaceTune,
} from "./face-style";
export { lookThumb, thumbLook } from "./thumbs";
export { createMascotMediaStream as createRoboMediaStream, type MascotStreamHandle as RoboStreamHandle } from "./camera";
