# Developing Spin

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev             # Tailwind watcher plus the dev server on :5233; in Drawdy run ⌘K → "Add extension dev server" on a board
pnpm build           # regenerates src/panel-css.ts, src/webview-html.ts, src/overlay-html.ts and dist/*.drawdyx
pnpm preflight       # before submitting: committed, built, pushed, under Drawdy's limits, above the live version
```

Elements are the only state collaborators share, so a spin is an element. The spinner's driver draws a seed from `crypto.getRandomValues`, works out the result from it (`src/lib/modes.ts`), and adds the result as one sticky note at opacity 0, with `meta["mickyngub.spin"] = { v: 1, seed, startedAt, mode, source, entries, result }`. Every driver subscribed to `subscription:scene:elements-added`, the spinner's included, reads that meta (`src/lib/spin-meta.ts`). One that sees the card within 2.5 s of `startedAt` builds the same animation plan from the seed and result (`src/lib/animation-plan.ts`) and shows it in a click-through floating iframe (`asPopover: false`, `pointerEvents: "none"`) whose `srcDoc` is `src/overlay-html.ts` with the plan inlined. The plan runs on the spinner's clock, so a screen that sees the card late joins the spin part-way and lands with everyone else. The overlay is built from `overlay/main.ts`.

The spinner sets the card's opacity to 1 when the result has landed. If the card is still hidden 4 s after `startedAt`, any other client reveals it, each after its own random delay of up to 0.6 s and only if it still reads opacity 0, since Drawdy's last write wins for a whole element. Opening the panel also reveals any card a spinner left hidden. The timings live in `src/lib/reveal.ts`. A late joiner sees only the card.

Drawdy builds published versions from this repository's `src/index.ts` and runs no build step, so commit the generated `src/panel-css.ts`, `src/webview-html.ts` and `src/overlay-html.ts` after `pnpm build`. Bump `driverVersion` in `manifest.json` for every release and add it to `CHANGELOG.md`. `pnpm test` covers the seeded results and animation plans, the reveal timings, and the driver against a fake host, including two and three clients sharing one board.
