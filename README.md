<div align="center">

# Robo

### A face for your AI.

A small animated robot that shows what your product is doing: listening, thinking, loading, writing, nodding yes.
Drawn live in code. No images, no Lottie, no dependencies. About 45 KB gzipped.

**[Try the playground](https://hazenbox.github.io/Robo-avatar/)** &nbsp;·&nbsp; [Use it](#use-it) &nbsp;·&nbsp; [States](#states) &nbsp;·&nbsp; [Make it yours](#make-it-yours)

</div>

---

## Why

When an AI is working, the screen is usually empty, or a spinner. That quiet moment is where people decide whether they trust it. A character that visibly listens, thinks, searches and writes turns waiting into something that feels like a collaborator at work.

Robo is built for that moment:

- **It says what is happening.** Thirteen states, each with its own motion and its own colour: from `listening` and `thinking` to `loading`, `processing` and `generating`.
- **It is alive, and never in the way.** It follows the pointer, blinks, breathes and turns its head. It pauses off screen and respects reduced motion.
- **It is yours.** Two heads, six emotes, wearables, fur, colour. One small object describes a look, and a URL can share it.
- **It is light.** Canvas 2D plus a small WebGL2 pass for fur. No image files, no animation runtime.

## Two heads

| | **Screen** (default) | **Classic** |
| --- | --- | --- |
| What it is | A cream helmet with a glass screen, a rainbow rim light, a horn and ear pads | A soft lit ball with a face plate |
| Feels like | A helper that works | A friend that reacts |
| Shows its work | On the screen itself: dots while loading, a page writing itself while generating, a flowing rim while processing | Around it: a ring of light, a spinner, sparks and bouncing dots |
| Make it yours | Its expressions and states | Fur, colour, wearables, face tuning |

## States

| State | When to use it | What it does |
| --- | --- | --- |
| `idle` | Nothing is happening | Breathes, blinks, glances around |
| `listening` | The user is speaking or typing | Leans in; the rim brightens with the room |
| `speaking` | The AI is answering aloud | Its mouth follows a voice level you feed it |
| `thinking` | A quick pause before an answer | Looks up and aside |
| `loading` | Waiting on something | The rim dims and a comet of light runs round it; three dots rise on the screen |
| `processing` | Working through a lot | The rim's colours flow round; its eyes read side to side |
| `generating` | Making something | The screen becomes a page, writing itself line by line |
| `nodding` | A yes, an acknowledgement | Three nods, repeating |
| `happy` · `unimpressed` · `error` · `sleeping` · `dizzy` | Outcomes and moods | Each has a face and a motion of its own |

Plus six one-shot **emotes** you can play on top of any state: `love`, `proud`, `surprised`, `wink`, `excited`, `confused`.

## Use it

```bash
npm install robo-avatar
```

> Not on npm yet. Until it is, clone the repo, run `npm install && npm run build`, and `npm link`.

**React**

```tsx
import { RoboAvatar } from "robo-avatar/react";

<RoboAvatar size={96} state="thinking" />;
```

**Plain JavaScript**

```ts
import { mountRobo } from "robo-avatar";

const robo = mountRobo(document.querySelector("canvas")!, { state: "idle" });
robo.setState("generating");
robo.emote("wink");
robo.destroy();
```

**In an AI chat**: map your app's status to a state, and you are done.

```tsx
const state = { idle: "idle", sending: "loading", streaming: "generating", error: "error" }[status];

<RoboAvatar size={40} state={state} />;
```

**A video-call tile**: the same Robo as a `MediaStream`.

```ts
import { createRoboMediaStream } from "robo-avatar";

const feed = createRoboMediaStream();
video.srcObject = feed.stream;
```

## Make it yours

A look is one small object. The playground builds it for you and writes the code.

```tsx
<RoboAvatar look={{ head: "classic", fur: true, color: "#ff8fb4", addons: ["beanie"] }} />
```

| Option | Default | What it does |
| --- | --- | --- |
| `look` | the screen head | Head, colour, fur, face and wearables |
| `state` | `"idle"` | Starting state |
| `followPointer` | `true` | Eyes and head follow the pointer |
| `lookReach` | `260` | How far (px) the pointer must be for a full look to one side |
| `shadow` | `true` | Soft floor shadow |
| `glow` | `0.3` | Halo strength on the classic head |
| `reducedMotion` | `"auto"` | Follow the OS setting, or force it |
| `pokeOnClick` | `true` | Click to poke it; three quick pokes make it dizzy |

The handle from `mountRobo` has `setState`, `emote`, `poke`, `setLook`, `setVoice`, `lookAt` and `destroy`. Feed `setVoice` a 0 to 1 level to make it speak.

## Details that matter

- **Accessible.** Honours `prefers-reduced-motion`; give it a `label` for screen readers.
- **Polite.** Drawing stops when the canvas is off screen, and a hidden tab never gets a huge time step.
- **Sharp.** Draws at the device's pixel ratio (capped), at any size from a 32 px chip to a hero.
- **Private.** Nothing is recorded or sent anywhere.

## Build on it

```bash
npm install
npm run dev     # the playground, with every control
npm run check   # typecheck, tests, library build, playground build
```

## Licence

MIT. See [LICENSE](LICENSE). Inspired by coucou's Mochi; no code is shared.
