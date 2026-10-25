# Robo avatar

A tiny animated robot for your app, drawn live in Canvas 2D with a WebGL2 body. No images, no Lottie, no runtime dependencies. It has nine states, four emotes, wearable add-ons, five body shapes and three fur styles, and it can follow the pointer, react to a voice level, or become a video-call `MediaStream`.

**Try it:** the playground is deployed at https://hazenbox.github.io/Robo-avatar/. Or run it locally: `npm install && npm run dev` opens the playground (every control, a sheet of all states, sizes, and a live video stream). Your look is kept in the URL, so you can share it.

## Install

```bash
npm install robo-avatar
```

## Use it

Plain JavaScript:

```ts
import { mountRobo } from "robo-avatar";

const robo = mountRobo(document.querySelector("canvas")!, {
  look: { shape: "round", fur: true },
  state: "idle",
});
robo.setState("thinking");
robo.emote("wink");
robo.setVoice(0.6); // 0 to 1, drives the mouth while "speaking"
robo.destroy();
```

React:

```tsx
import { RoboAvatar } from "robo-avatar/react";

<RoboAvatar size={96} state="happy" look={{ shape: "star" }} />;
```

Video call tile:

```ts
import { createRoboMediaStream } from "robo-avatar";

const feed = createRoboMediaStream({ look });
video.srcObject = feed.stream;
```

## States, emotes, add-ons

- States: `idle`, `listening`, `speaking`, `thinking`, `happy`, `unimpressed`, `error`, `sleeping`, `dizzy`
- Emotes: `love`, `proud`, `surprised`, `wink`
- Shapes: `round`, `cube`, `triangle`, `star`, `sparkle`
- Fur: `silky`, `minky`, `pompom`, each with tunable numbers (see `FUR_PARAMS`, `FACE_PARAMS`)

`MASCOT_ADDONS`, `COLOR_SWATCHES` and `DEFAULT_LOOK` list the rest.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `look` | `DEFAULT_LOOK` | Body shape, colour, fur, face and add-ons |
| `state` | `"idle"` | Starting state |
| `glow` | `0.3` | Halo strength, 0 to 1 |
| `shadow` | `true` | Floor shadow |
| `followPointer` | `true` | Eyes follow the pointer |
| `lookReach` | `320` | How far away (px) the pointer still counts |
| `reducedMotion` | `"auto"` | `true`, `false`, or follow the OS setting |
| `radius` | `0.3` | Body size as a share of the canvas |
| `pokeOnClick` | `true` | Click to poke; three quick pokes make it dizzy |
| `maxPixelRatio` | `2` | Cap on canvas resolution |

The handle returned by `mountRobo` has `setState`, `emote`, `poke`, `setLook`, `getLook`, `setVoice`, `setRoom`, `setGlow`, `setShadow`, `setReducedMotion`, `lookAt` and `destroy`. Drawing pauses while the canvas is off screen.

## Develop

```bash
npm run dev     # the playground
npm run check   # typecheck, tests, library build, playground build
```

## Licence

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
