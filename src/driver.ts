import type {
    CollaborationUserPresence,
    DriverCommandIssuer,
    DriverCommandRequest,
    DriverCommandResponseFor,
    DriverManifest,
    DriverModule,
    ModuleStyling,
    SubscribedDrawdyElement,
} from "@drawdy/driver-protocol";
import { ACTION_BUTTON_SVG } from "./action-button";
import { planFor } from "./lib/animation-plan";
import { cardLayout, resultLabel } from "./lib/card";
import {
    centredIn,
    findFreeRect,
    visibleArea,
    type Rect,
} from "./lib/free-spot";
import {
    MAX_ENTRIES,
    MIN_ENTRIES,
    MODES,
    SOURCES,
    cleanLabel,
    computeResult,
    distinctNames,
    firstLine,
    normalizeOptions,
    usesEntries,
} from "./lib/modes";
import {
    designSize,
    overlayDoc,
    type OverlayColours,
} from "./lib/overlay-layout";
import { FADE_MS, FALLBACK_JITTER_MS, HOLD_MS, arrival } from "./lib/reveal";
import { randomSeed } from "./lib/rng";
import { readSpin, type SpinMeta } from "./lib/spin-meta";
import { OVERLAY_HTML } from "./overlay-html";
import {
    normalizeSettings,
    type DriverToWebview,
    type ErrorReason,
    type SpinRequest,
    type StickyItem,
    type WebviewToDriver,
} from "./shared/messages";
import { WEBVIEW_HTML } from "./webview-html";

const SETTINGS_KEY = "settings";
const CARD_PROPERTIES = ["meta", "opacity"] as const;
const DRAWER_GAP_PX = 16;
const FLY_MS = 450;
/** Frees the Spin button if a reveal never comes back, e.g. the card was deleted mid-spin. */
const SPIN_TIMEOUT_MS = 7000;
const LANDED_GRACE_MS = 100;

type Deps = {
    seed?: () => number;
    jitter?: () => number;
};

type Mine = { stickyId: string | null };

function stylingCssVars(styling: ModuleStyling): string {
    const { tokens, ...flat } = styling as ModuleStyling & {
        tokens?: Record<string, string>;
    };
    const vars = Object.entries(flat).map(([key, value]) =>
        key === "theme"
            ? `color-scheme: ${value};`
            : `--drawdy-${key.replace(
                  /[A-Z]/g,
                  (c) => `-${c.toLowerCase()}`
              )}: ${value};`
    );
    for (const [name, value] of Object.entries(tokens ?? {}))
        vars.push(`${name}: ${value};`);
    return vars.join("");
}

function overlayColours(styling: ModuleStyling): OverlayColours {
    const dark = styling.theme !== "light";
    const tokens = (styling.tokens ?? {}) as Partial<Record<string, string>>;
    return {
        panel: tokens["--dd-surface-panel"] ?? (dark ? "#1f1f23" : "#ffffff"),
        fg:
            tokens["--dd-text-primary"] ??
            (dark ? "rgba(255,255,255,0.95)" : "#18181b"),
        muted:
            tokens["--dd-text-tertiary"] ??
            (dark ? "rgba(255,255,255,0.5)" : "rgba(24,24,27,0.5)"),
        line:
            tokens["--dd-border-strong"] ??
            (dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"),
        accent: tokens["--dd-accent"] ?? "#c5f601",
        onAccent: tokens["--dd-on-accent"] ?? "#090909",
    };
}

export function createSpin(deps: Deps = {}): DriverModule {
    const nextSeed = deps.seed ?? randomSeed;
    const nextJitter = deps.jitter ?? (() => Math.random());

    let issueCommand: DriverCommandIssuer | null = null;
    let manifest: DriverManifest | null = null;
    let generateId: () => string = () => "";
    let styling = {} as ModuleStyling;
    let driverId = "";
    let buttonId = "";
    let webviewId = "";
    let requestNo = 0;
    let panelOpen = false;
    let spinning = false;
    let spinNo = 0;
    let selectionWatched = false;
    let presenceWatched = false;
    let lastNames = "";

    const seen = new Set<string>();
    const mine = new Map<string, Mine>();
    const overlays = new Map<string, string>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const stamp = () => ({ driverId, requestId: String(requestNo++) });

    function send<R extends DriverCommandRequest>(
        request: R
    ): Promise<DriverCommandResponseFor<R>> {
        const failed = {
            res: { error: { type: "runtime" } },
        } as DriverCommandResponseFor<R>;
        if (!issueCommand) return Promise.resolve(failed);
        return issueCommand(request).catch(() => failed);
    }

    function later(at: number, task: () => Promise<void> | void): void {
        const timer = setTimeout(
            () => {
                timers.delete(timer);
                void Promise.resolve()
                    .then(task)
                    .catch(() => undefined);
            },
            Math.max(0, at - Date.now())
        );
        timers.add(timer);
    }

    async function post(message: DriverToWebview): Promise<boolean> {
        const sent = await send({
            type: "command:webview:post-message",
            ...stamp(),
            req: { webviewDomId: webviewId, message },
        });
        const posted =
            sent.res.error === undefined && sent.res.value.posted === true;
        if (!posted) panelOpen = false;
        return posted;
    }

    const placeCtx = () => ({
        issueCommand: issueCommand as DriverCommandIssuer,
        driverId,
        nextRequestId: () => String(requestNo++),
        webviewDomId: webviewId,
    });

    async function openPanel(): Promise<void> {
        await send({
            type: "command:webview:create",
            ...stamp(),
            req: {
                webviewDomId: webviewId,
                htmlContent: WEBVIEW_HTML.replace(
                    "/*__DRAWDY_STYLING__*/",
                    stylingCssVars(styling)
                ),
                keepStateWhenClosed: false,
            },
        });
    }

    async function loadSettings(): Promise<void> {
        const got = await send({
            type: "command:kv-storage:get",
            ...stamp(),
            req: { key: SETTINGS_KEY },
        });
        const raw = got.res.error === undefined ? got.res.value.got : undefined;
        await post({
            type: "init",
            settings: raw ? normalizeSettings(raw) : null,
        });
    }

    async function watchSelection(): Promise<void> {
        if (!selectionWatched) {
            selectionWatched = true;
            await send({
                type: "subscription:scene:drawdy-element-selection",
                ...stamp(),
            });
        }
        const selected = await send({
            type: "command:scene:get-current-selected-drawdy-elements",
            ...stamp(),
        });
        if (selected.res.error === undefined)
            await sendStickies(selected.res.value.drawdyElementIds);
    }

    async function sendStickies(ids: readonly string[]): Promise<void> {
        let items: StickyItem[] = [];
        if (ids.length > 0) {
            const got = await send({
                type: "command:scene:get-drawdy-elements",
                ...stamp(),
                req: {
                    properties: ["type", "componentType", "text"],
                    drawdyElementIds: ids.slice(0, MAX_ENTRIES * 2),
                },
            });
            if (got.res.error !== undefined) return;
            const order = new Map(ids.map((id, i) => [id, i]));
            items = got.res.value.drawdyElements
                .filter((el) => el.componentType === "sticky-note")
                .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
                .map((el) => ({ id: el.id, label: firstLine(el.text) }))
                .filter((item) => item.label !== "")
                .slice(0, MAX_ENTRIES);
        }
        await post({ type: "stickies", items });
    }

    function namesOf(users: readonly CollaborationUserPresence[]): string[] {
        return distinctNames(
            [...users]
                .map((u) => u.name)
                .sort((a, b) =>
                    a.localeCompare(b, undefined, { sensitivity: "base" })
                )
        );
    }

    async function sendPeople(): Promise<void> {
        const got = await send({
            type: "command:collaboration:get-all-users-in-board",
            ...stamp(),
        });
        if (got.res.error !== undefined) {
            await post({ type: "people", status: "blocked", names: [] });
            return;
        }
        const names = namesOf(got.res.value.users);
        lastNames = names.join("\n");
        await post({ type: "people", status: "ok", names });
        if (presenceWatched) return;
        presenceWatched = true;
        await send({
            type: "subscription:collaboration:presence-changed",
            ...stamp(),
        });
    }

    async function onPresence(
        users: readonly CollaborationUserPresence[]
    ): Promise<void> {
        const names = namesOf(users);
        const key = names.join("\n");
        if (key === lastNames || !panelOpen) return;
        lastNames = key;
        await post({ type: "people", status: "ok", names });
    }

    /** Sweeps for cards whose spinner left before revealing them. */
    async function revealStranded(): Promise<void> {
        const got = await send({
            type: "command:scene:get-drawdy-elements",
            ...stamp(),
            req: { properties: [...CARD_PROPERTIES] },
        });
        if (got.res.error !== undefined) return;
        for (const el of got.res.value.drawdyElements) onCard(el);
    }

    function failSpin(reason: ErrorReason): void {
        spinning = false;
        void post({ type: "error", reason });
    }

    async function spin(request: SpinRequest): Promise<void> {
        if (spinning) return;
        if (!MODES.includes(request?.mode) || !SOURCES.includes(request.source))
            return;
        spinning = true;
        const { mode, source } = request;
        const options = normalizeOptions(request.options);
        const pairs = usesEntries(mode)
            ? (Array.isArray(request.entries) ? request.entries : [])
                  .map((label, i) => ({
                      label: typeof label === "string" ? cleanLabel(label) : "",
                      stickyId:
                          source === "stickies"
                              ? (request.stickyIds?.[i] ?? null)
                              : null,
                  }))
                  .filter((p) => p.label !== "")
                  .slice(0, MAX_ENTRIES)
            : [];
        if (usesEntries(mode) && pairs.length < MIN_ENTRIES) {
            failSpin("too-few");
            return;
        }
        const entries = pairs.map((p) => p.label);
        const seed = nextSeed() >>> 0;
        const result = computeResult(mode, seed, entries.length, options);
        const draft: SpinMeta = {
            v: 1,
            seed,
            startedAt: 0,
            mode,
            source: usesEntries(mode) ? source : null,
            entries,
            result,
        };
        const layout = cardLayout(draft);
        const area = await visibleArea(placeCtx());
        const centred: Rect = area
            ? centredIn(area, layout.width, layout.height)
            : { x: 0, y: 0, width: layout.width, height: layout.height };
        const { x, y } = await findFreeRect(placeCtx(), {
            ...centred,
            x: Math.round(centred.x),
            y: Math.round(centred.y),
        });

        // The timeline starts once the card goes out, not when the panel asked.
        const meta: SpinMeta = { ...draft, startedAt: Date.now() };
        const cardId = generateId();
        mine.set(cardId, {
            stickyId:
                result.mode === "wheel"
                    ? (pairs[result.index]?.stickyId ?? null)
                    : null,
        });
        const added = await send({
            type: "command:scene:add-drawdy-elements",
            ...stamp(),
            req: {
                elements: [
                    {
                        type: "shape",
                        componentType: "sticky-note",
                        drawdyElementId: cardId,
                        x,
                        y,
                        width: layout.width,
                        height: layout.height,
                        fillColor: layout.fill,
                        text: layout.text,
                        fontSize: layout.fontSize,
                        textAlign: layout.align,
                        opacity: 0,
                        meta: { [driverId]: meta },
                    },
                ],
            },
        });
        if (added.res.error !== undefined) {
            mine.delete(cardId);
            failSpin(
                added.res.error.type === "unauthorized" ? "blocked" : "failed"
            );
            return;
        }
        const thisSpin = ++spinNo;
        later(meta.startedAt + SPIN_TIMEOUT_MS, () => {
            if (spinNo === thisSpin) spinning = false;
        });
        await post({
            type: "spun",
            cardId,
            startedAt: meta.startedAt,
            plan: planFor(meta),
            label: resultLabel(meta),
            prompt:
                result.mode === "warmup"
                    ? { lang: result.lang, index: result.prompt }
                    : null,
        });
        onCard({ id: cardId, meta: { [driverId]: meta }, opacity: 0 });
    }

    function onCard(el: SubscribedDrawdyElement): void {
        const meta = readSpin(el.meta, driverId);
        if (!meta || seen.has(el.id)) return;
        seen.add(el.id);
        const plan = arrival({
            startedAt: meta.startedAt,
            now: Date.now(),
            opacity: el.opacity,
            mine: mine.has(el.id),
            jitter: nextJitter() * FALLBACK_JITTER_MS,
        });
        if (plan.animate && plan.removeAt !== null)
            void showOverlay(el.id, meta, plan.localStart, plan.removeAt);
        if (plan.revealAt !== null)
            later(plan.revealAt, () => revealMine(el.id));
        if (plan.fallbackAt !== null)
            later(plan.fallbackAt, () => revealIfHidden(el.id));
    }

    async function overlayArea(): Promise<Rect | null> {
        const view = await send({
            type: "command:camera:get-viewport-rect",
            ...stamp(),
        });
        if (view.res.error !== undefined) return null;
        const r = view.res.value.rect;
        const [tl, br] = await Promise.all(
            [
                { x: r.x, y: r.y },
                { x: r.x + r.width, y: r.y + r.height },
            ].map((p) =>
                send({
                    type: "command:camera:canvas-to-screen",
                    ...stamp(),
                    req: p,
                })
            )
        );
        if (tl.res.error !== undefined || br.res.error !== undefined)
            return null;
        let right = br.res.value.x;
        if (panelOpen) {
            const drawer = await send({
                type: "command:dom:element-rect",
                ...stamp(),
                req: { elementId: webviewId },
            });
            if (drawer.res.error === undefined && drawer.res.value.width > 0)
                right = Math.min(right, drawer.res.value.x - DRAWER_GAP_PX);
        }
        const { x, y } = tl.res.value;
        const width = right - x;
        const height = br.res.value.y - y;
        return width > 0 && height > 0 ? { x, y, width, height } : null;
    }

    async function showOverlay(
        cardId: string,
        meta: SpinMeta,
        localStart: number,
        removeAt: number
    ): Promise<void> {
        const plan = planFor(meta);
        const design = designSize(plan);
        const area = (await overlayArea()) ?? {
            x: 0,
            y: 0,
            width: design.width,
            height: design.height,
        };
        const scale = Math.min(
            1,
            (area.width * 0.9) / design.width,
            (area.height * 0.88) / design.height
        );
        const width = Math.round(design.width * scale);
        const height = Math.round(design.height * scale);
        for (const id of [...overlays.keys()]) removeOverlay(id);
        const domId = `${driverId}:overlay:${cardId}`;
        overlays.set(cardId, domId);
        await send({
            type: "command:dom:create-floating-element",
            ...stamp(),
            req: {
                domId,
                position: {
                    x: Math.round(area.x + (area.width - width) / 2),
                    y: Math.round(area.y + (area.height - height) / 2),
                },
                asPopover: false,
                schema: {
                    type: "iframe",
                    label: "Spin",
                    child: {
                        srcDoc: overlayDoc(OVERLAY_HTML, {
                            plan,
                            localStart,
                            holdMs: HOLD_MS,
                            fadeMs: FADE_MS,
                            theme: styling.theme === "light" ? "light" : "dark",
                            colours: overlayColours(styling),
                        }),
                    },
                    styles: {
                        width: [width, "px"],
                        height: [height, "px"],
                        pointerEvents: "none",
                    },
                },
            },
        });
        later(removeAt + LANDED_GRACE_MS, () => removeOverlay(cardId));
    }

    function removeOverlay(cardId: string): void {
        const domId = overlays.get(cardId);
        if (!domId) return;
        overlays.delete(cardId);
        void send({
            type: "command:dom:remove-floating-element",
            ...stamp(),
            req: { domId },
        });
    }

    async function revealMine(cardId: string): Promise<void> {
        const own = mine.get(cardId);
        mine.delete(cardId);
        await send({
            type: "command:scene:update-drawdy-elements",
            ...stamp(),
            req: {
                updates: [
                    { drawdyElementId: cardId, properties: { opacity: 1 } },
                ],
            },
        });
        spinning = false;
        await post({ type: "landed", cardId });
        if (!own?.stickyId) return;
        await send({
            type: "command:scene:set-selection",
            ...stamp(),
            req: { drawdyElementIds: [own.stickyId] },
        });
        const camera = await send({
            type: "command:camera:get-info",
            ...stamp(),
        });
        await send({
            type: "command:camera:fly-to-elements",
            ...stamp(),
            req: {
                drawdyElementIds: [own.stickyId],
                flyDurationMs: FLY_MS,
                zoom:
                    camera.res.error === undefined && camera.res.value.zoom > 0
                        ? camera.res.value.zoom
                        : 1,
            },
        });
    }

    async function revealIfHidden(cardId: string): Promise<void> {
        const got = await send({
            type: "command:scene:get-drawdy-elements",
            ...stamp(),
            req: { properties: ["opacity"], drawdyElementIds: [cardId] },
        });
        if (got.res.error !== undefined) return;
        const [card] = got.res.value.drawdyElements;
        if (!card || card.opacity !== 0) return;
        await send({
            type: "command:scene:update-drawdy-elements",
            ...stamp(),
            req: {
                updates: [
                    { drawdyElementId: cardId, properties: { opacity: 1 } },
                ],
            },
        });
    }

    async function handleMessage(message: WebviewToDriver): Promise<void> {
        switch (message.type) {
            case "ready":
                panelOpen = true;
                await loadSettings();
                await revealStranded();
                return;
            case "stickies":
                await watchSelection();
                return;
            case "save":
                await send({
                    type: "command:kv-storage:set",
                    ...stamp(),
                    req: {
                        key: SETTINGS_KEY,
                        payload: normalizeSettings(message.settings),
                    },
                });
                return;
            case "people":
                await sendPeople();
                return;
            case "spin":
                await spin(message.request);
                return;
        }
    }

    const activate: DriverModule["activate"] = async (args) => {
        issueCommand = args.issueCommand;
        manifest = args.manifest;
        generateId = args.generateId;
        styling = args.styling;
        driverId = manifest.driverId;
        buttonId = `${driverId}:action-button`;
        webviewId = `${driverId}:webview`;

        const created = await send({
            type: "command:dom:create-action-button",
            ...stamp(),
            req: { domElementId: buttonId, svg: ACTION_BUTTON_SVG },
        });
        if (created.res.error !== undefined) return;

        await Promise.all([
            send({
                type: "subscription:dom:element-clicked",
                ...stamp(),
                req: { domElementId: buttonId },
            }),
            send({
                type: "subscription:webview:message",
                ...stamp(),
                req: { webviewDomId: webviewId },
            }),
            send({ type: "subscription:dom:theme-changed", ...stamp() }),
            send({
                type: "subscription:scene:elements-added",
                ...stamp(),
                req: { properties: [...CARD_PROPERTIES] },
            }),
            send({
                type: "subscription:scene:elements-replaced",
                ...stamp(),
                req: { properties: [...CARD_PROPERTIES] },
            }),
        ]);
    };

    const onEvent: DriverModule["onEvent"] = async (event) => {
        if (!issueCommand) return;
        switch (event.type) {
            case "subscription:dom:element-clicked":
                if (event.body.domElementId === buttonId) await openPanel();
                return;
            case "subscription:webview:message": {
                if (event.body.webviewDomId !== webviewId) return;
                const message = event.body.message;
                if (typeof message !== "object" || message === null) return;
                await handleMessage(message as WebviewToDriver);
                return;
            }
            case "subscription:dom:theme-changed":
                styling = event.body.styling;
                if (panelOpen)
                    await post({
                        type: "theme",
                        cssVars: stylingCssVars(styling),
                    });
                return;
            case "subscription:scene:elements-added":
            case "subscription:scene:elements-replaced":
                for (const el of event.body.drawdyElements) onCard(el);
                return;
            case "subscription:scene:drawdy-element-selection":
                if (panelOpen) await sendStickies(event.body.drawdyElementIds);
                return;
            case "subscription:collaboration:presence-changed":
                await onPresence(event.body.users);
                return;
            default:
                return;
        }
    };

    return { activate, onEvent };
}
