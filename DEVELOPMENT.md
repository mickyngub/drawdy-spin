# Developing Spin

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev             # Tailwind watcher plus the dev server on :5233; in Drawdy run ⌘K → "Add extension dev server"
pnpm build           # regenerates src/panel-css.ts, src/webview-html.ts, src/face-html.ts and dist/*.drawdyx
pnpm preflight       # before submitting: committed, built, pushed, under Drawdy's limits, above the live version
```

## How it works

A wheel is one 440×520 **component** element on the board, so every viewer sees it, extension or not. It is a column holding a board iframe (the page that draws the wheel) and two zero-height rows whose boxes are moved over the page with a transform: the round hub and the Reset pill. The state lives in `meta["mickyngub.spin"]`:

```ts
{ v: 2, wheelId, entries: [{ id, text, emoji?, photo? }], picked: [id], removePicked, lastSpin?: { seed, startedAt, result, from } }
```

`wheelId` names the wheel and survives every replacement of its widget. `startedAt` is wall-clock time, `result` is the entry the spin lands on and `from` is the angle the wheel rested at before it.

- **The page.** `face/shell.ts`, `face/main.ts` and `face/face.css` build into `src/face-html.ts`: Tailwind compiled without preflight, Fredoka SemiBold (Latin subset, `face/fonts/`, SIL OFL) inlined as a data URL, and the script minified with esbuild, about 37 KB. The driver puts the meta into it as JSON (`faceDoc` in `src/lib/widget.ts`). The page draws on a canvas from `frameAt` (`src/lib/spin-plan.ts`): a page that opens within 4.5 s of `startedAt` plays the spin on its own clock, with a short wind-up before the start, about four seconds of ease-out, a small overshoot and a settle, then confetti and the **Picked** ribbon; a page that opens later shows the landed wheel. The spin's path comes from the seed (`planOf`), so every page turns the same way and stops with the result under the pointer. Its colours are `light-dark()` tokens read through a probe element; Chrome takes an iframe's colour scheme from the embedding element's `color-scheme`, which Drawdy sets from its theme, so each viewer sees their own theme. Up to ten entries get a picture badge (emoji, photo or initial) and a label along the rim; more get labels along the radius. Labels are turned for where the wheel comes to rest (`labelLayout` in `src/lib/labels.ts`): rim labels below the middle run the other way along the arc and radial labels on the left read from the rim in, and a spin keeps those orientations from start to landing, so the landed wheel reads upright and nothing flips while it turns.
- **Writes.** A component's content can't change once it is on the board, so every change adds a new widget at the old one's x, y and size, in the same frame and group, then removes the old one (`planReplacement`). Undoing a press takes two steps. A widget someone resized comes back at that size through a transform on its content. A press also removes any widget of the same wheel stacked on the same spot, which is what two presses that cross on the wire leave. A pasted copy shares its wheel's id until its first change, when it takes a fresh one.
- **Spins.** The presser's driver draws the result from what is left (`remaining`: entries not picked while **Remove picked names** is on) with `crypto.getRandomValues`, sets `startedAt` 400 ms ahead so the new widget reaches every screen first, and records the result in `picked` when removing picked names. Presses while a wheel turns are ignored. When nothing is left the hub reads Reset and a press resets.
- **Presses.** The hub and pill are boxes, not `<button>`s: Drawdy's board takes pointer capture on every press, so the DOM click of a `<button>` inside a component lands on the board and `dom:element-clicked` never names it. A box press reaches the driver as `subscription:scene:click` with the clicked elements. The driver keeps the `scene:pointer` down point, ignores a click whose pointer travelled more than 6 px, and maps the point onto the hub circle or the pill (`buttonAt`). A press selects the wheel, and the wheel drags only by its drag bar, since the page takes the pointer everywhere else. People without Spin get no events.
- **Panel edits.** The panel edits the selected wheel, else the one it last showed, followed through other screens' replacements by its wheel id. Each edit is sent whole; the driver waits 600 ms after the last one, and until a spin in flight has landed, then replaces the wheel once. A press of Spin or Reset takes a waiting edit with it in the same replacement. Presets are edits written at once. Photos are cropped to a 64 px JPEG of at most 5,000 characters in the panel, so twenty of them keep a wheel's page under 150 KB.
- **Sound.** The panel is created with `keepStateWhenClosed: true`; a click in it unlocks its `AudioContext`, and the driver posts the spin's tick times to it after this screen's presses. The ticks are synthesised, with no audio files.

The entries, presets, wheel state, spin plan, panel view and widget are pure (`src/lib/`). `src/driver.ts` builds the driver from a factory with an injectable clock and randomness, so the tests run two drivers on one fake board (`test/fake-host.ts`), pressing wheels the way Drawdy reports it.

## Building and releasing

Drawdy builds published versions from this repository's `src/index.ts` and runs no build step, so commit the generated `src/panel-css.ts`, `src/webview-html.ts` and `src/face-html.ts` after `pnpm build`. Bump `driverVersion` in `manifest.json` for every release and add it to `CHANGELOG.md`. `pnpm test` also holds the manifest and listing files to Drawdy's submission rules.

`package.json` points `@drawdy/driver-protocol` at Drawdy's main checkout; run `pnpm install` here after it changes.
