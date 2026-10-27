# Contributing to Zoro

Thanks for wanting to help. Zoro is small on purpose, so contributions are easy to review.

## Good first things

- A bug: something draws wrong, or a state looks off at some size or in some browser.
- A new **wearable** or **emote**.
- A new **state** for what an AI might be doing.
- Making the docs or the playground clearer.

If it's a big change (a new head, a new rendering approach), please open an issue first so we can talk it through before you build it.

## Run it

```bash
cd zoro
npm install
npm run dev      # the playground, with every control
npm run check    # typecheck, tests, library build, playground build
```

`npm run check` must pass before you open a pull request.

## How it's laid out

| Folder | What's in it |
| --- | --- |
| `zoro/src` | The library: the engine, the two heads, wearables, fur, the React wrapper |
| `zoro/playground` | The demo site (a Vite app that runs on the library's source) |
| `zoro/tests` | Tests for the engine and the look |
| `assets` | The animations used in the README |

## What a good change looks like

- **Small and focused.** One idea per pull request.
- **Looks right.** If you changed how something looks, add a screenshot or a short recording to the pull request, in the playground's dark and light themes.
- **Stays light.** No new runtime dependencies, and no image files for the robots: everything is drawn in code.
- **Respects people.** Anything that moves must calm down under `prefers-reduced-motion`.

## Licence

By contributing, you agree your work is released under the [MIT licence](LICENSE).
