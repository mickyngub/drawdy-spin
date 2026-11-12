import type {
    DriverCommandIssuer,
    DriverModule,
    DriverSubscriptionEvent,
    ModuleStyling,
    SubscribeableKey,
    SubscribedDrawdyElement,
} from "@drawdy/driver-protocol";
import { ACTION_BUTTON_SVG } from "./action-button";
import { normalizeEntries, type Entry } from "./lib/entries";
import {
    centredIn,
    findFreeRect,
    overlaps,
    PLACE_GAP,
    revealAndSelect,
    visibleArea,
    type Rect,
} from "./lib/free-spot";
import { PRESETS, presetEntries, type Preset } from "./lib/presets";
import { randomBelow, randomId, randomSeed } from "./lib/rng";
import { planOf, spun, tickTimes } from "./lib/spin-plan";
import {
    canReset,
    edited,
    isSpinning,
    landsAt,
    newWheel,
    readWheel,
    remaining,
    reset,
    sameWheel,
    type Wheel,
} from "./lib/wheel";
import {
    buttonAt,
    planReplacement,
    sameRect,
    WIDGET_SIZE,
    widgetElement,
    type Placed,
} from "./lib/widget";
import type {
    DriverToWebview,
    PanelError,
    PanelWheel,
    WebviewToDriver,
} from "./shared/messages";
import { WEBVIEW_HTML } from "./webview-html";

const PROPERTIES: SubscribeableKey[] = [
    "type",
    "meta",
    "frameId",
    "x",
    "y",
    "width",
    "height",
];
const PLACE_PROPERTIES: SubscribeableKey[] = [...PROPERTIES, "groupId"];
// A press that moved further than this on screen was a drag, not a click.
const CLICK_SLOP_PX = 6;
/** Panel edits wait this long for the next keystroke before they replace the wheel. */
export const EDIT_DELAY_MS = 600;
const WAKE_SLACK_MS = 15;
const PREFS_KEY = "prefs";

export type Env = {
    now: () => number;
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
    seed: () => number;
    /** An index below n: which remaining entry a spin lands on. */
    pick: (n: number) => number;
    newId: () => string;
};

const realEnv: Env = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    seed: randomSeed,
    pick: randomBelow,
    newId: randomId,
};

type Point = { x: number; y: number };
/** A wheel named by its element, and by its wheel id in case another screen replaced that element. */
type Ref = { el: string; wheelId?: string };
type Press = { dom: Point; canvas: Point };

type Pending = {
    el: string;
    wheelId: string;
    entries: Entry[];
    removePicked: boolean;
    due: number;
    queued: boolean;
};

type State = {
    driverId: string;
    issueCommand: DriverCommandIssuer;
    generateId: () => string;
    styling: ModuleStyling;
    buttonId: string;
    webviewId: string;
    panel: boolean;
    sound: boolean;
    wheels: Map<string, Placed>;
    moved: Map<string, string>;
    pending: Map<string, Pending>;
    down: Press | null;
    selection: string[];
    target: string | null;
    targetKey: string | null;
    view: Rect | null;
    wake: unknown;
    lastPanel: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export function stylingCssVars(styling: ModuleStyling): string {
    const { tokens, ...flat } = styling as ModuleStyling & {
        tokens?: Record<string, string>;
    };
    const vars = Object.entries(flat).map(([key, value]) =>
        key === "theme"
            ? `color-scheme: ${value};`
            : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`
    );
    for (const [name, value] of Object.entries(tokens ?? {}))
        vars.push(`${name}: ${value};`);
    return vars.join("");
}

function rectOf(el: SubscribedDrawdyElement): Rect | null {
    const { x, y, width, height } = el;
    return typeof x === "number" &&
        typeof y === "number" &&
        typeof width === "number" &&
        typeof height === "number"
        ? { x, y, width, height }
        : null;
}

/** Widgets stacked on one spot for one wheel read as a single wheel. */
function countWheels(entries: Iterable<Placed>): number {
    const seen: Placed[] = [];
    for (const e of entries)
        if (
            !seen.some(
                (o) =>
                    o.wheel.wheelId === e.wheel.wheelId &&
                    sameRect(o.rect, e.rect)
            )
        )
            seen.push(e);
    return seen.length;
}

export function createSpin(overrides: Partial<Env> = {}): DriverModule {
    const env: Env = { ...realEnv, ...overrides };
    let d: State | null = null;
    let requestId = 0;
    let chain: Promise<void> = Promise.resolve();

    const stamp = (s: State) => ({
        driverId: s.driverId,
        requestId: String(requestId++),
    });

    function enqueue(task: () => Promise<void>): Promise<void> {
        const next = chain.then(task).catch((err) => {
            console.error(`[${d?.driverId}] ${String(err)}`);
        });
        chain = next;
        return next;
    }

    function post(s: State, message: DriverToWebview): void {
        if (!s.panel) return;
        void s
            .issueCommand({
                type: "command:webview:post-message",
                ...stamp(s),
                req: { webviewDomId: s.webviewId, message },
            })
            .catch(() => undefined);
    }

    function fail(s: State, type: string | undefined): void {
        const reason: PanelError =
            type === "unauthorized" ? "denied" : "failed";
        post(s, { type: "error", reason });
    }

    async function loadPrefs(s: State): Promise<void> {
        try {
            const got = await s.issueCommand({
                type: "command:kv-storage:get",
                ...stamp(s),
                req: { key: PREFS_KEY },
            });
            if (got.res.error === undefined)
                s.sound = got.res.value.got?.sound === true;
        } catch {
            return;
        }
    }

    async function fetchElements(
        s: State,
        ids?: string[],
        properties: SubscribeableKey[] = PROPERTIES
    ): Promise<SubscribedDrawdyElement[]> {
        try {
            const res = await s.issueCommand({
                type: "command:scene:get-drawdy-elements",
                ...stamp(s),
                req: { properties, drawdyElementIds: ids },
            });
            return res.res.error === undefined
                ? res.res.value.drawdyElements
                : [];
        } catch {
            return [];
        }
    }

    async function readView(s: State): Promise<void> {
        try {
            const view = await s.issueCommand({
                type: "command:camera:get-viewport-rect",
                ...stamp(s),
            });
            if (view.res.error === undefined) s.view = view.res.value.rect;
        } catch {
            return;
        }
    }

    function absorb(
        s: State,
        elements: readonly SubscribedDrawdyElement[]
    ): boolean {
        let changed = false;
        for (const el of elements) {
            const prev = s.wheels.get(el.id);
            const component = el.type
                ? el.type === "component"
                : prev !== undefined;
            const wheel = !component
                ? null
                : el.meta === undefined && prev
                  ? prev.wheel
                  : readWheel(el.meta?.[s.driverId]);
            if (wheel) {
                const rect = rectOf(el) ?? prev?.rect ?? null;
                if (
                    !prev ||
                    !sameWheel(prev.wheel, wheel) ||
                    !sameRect(prev.rect, rect)
                ) {
                    s.wheels.set(el.id, { el: el.id, wheel, rect });
                    changed = true;
                }
                continue;
            }
            if (s.wheels.delete(el.id)) changed = true;
        }
        return changed;
    }

    function forget(s: State, ids: readonly string[]): void {
        for (const id of ids) s.wheels.delete(id);
    }

    /** Follows a wheel through this screen's replacements, so a press sent just before one still lands. */
    function resolve(s: State, id: string): string {
        const seen = new Set<string>();
        let at = id;
        while (!s.wheels.has(at) && s.moved.has(at) && !seen.has(at)) {
            seen.add(at);
            at = s.moved.get(at)!;
        }
        return at;
    }

    /** The newest widget of a wheel, which another screen may have replaced. */
    function byWheelId(s: State, wheelId: string): Placed | null {
        let found: Placed | null = null;
        for (const entry of s.wheels.values())
            if (entry.wheel.wheelId === wheelId) found = entry;
        return found;
    }

    function find(s: State, el: string, wheelId?: string): Placed | null {
        return (
            s.wheels.get(resolve(s, el)) ??
            (wheelId ? byWheelId(s, wheelId) : null)
        );
    }

    function selectedWheel(s: State): string | null {
        return s.selection.find((id) => s.wheels.has(id)) ?? null;
    }

    function remember(s: State, id: string): string {
        s.target = id;
        s.targetKey = s.wheels.get(id)?.wheel.wheelId ?? null;
        return id;
    }

    /** The selected wheel, else the one last shown, found again by its wheel id after a replacement, else the newest. */
    function targetId(s: State): string | null {
        const selected = selectedWheel(s);
        if (selected) return remember(s, selected);
        if (s.target) {
            const target = resolve(s, s.target);
            if (s.wheels.has(target)) return remember(s, target);
            const same = s.targetKey ? byWheelId(s, s.targetKey) : null;
            if (same) return remember(s, same.el);
        }
        return [...s.wheels.keys()].at(-1) ?? null;
    }

    /** A wheel with any edit still waiting to be written laid over it. */
    function withPending(s: State, entry: Placed): Wheel {
        const p = s.pending.get(entry.wheel.wheelId);
        return p ? edited(entry.wheel, p.entries, p.removePicked) : entry.wheel;
    }

    function syncPanel(s: State, force = false): void {
        if (!s.panel) return;
        const id = targetId(s);
        const entry = id ? s.wheels.get(id) : undefined;
        const wheel: PanelWheel | null = entry
            ? { ...withPending(s, entry), el: entry.el }
            : null;
        const message: DriverToWebview = {
            type: "state",
            wheel,
            count: countWheels(s.wheels.values()),
            sound: s.sound,
        };
        const serialized = JSON.stringify(message);
        if (!force && serialized === s.lastPanel) return;
        s.lastPanel = serialized;
        post(s, message);
    }

    /** An edit waits for the typing to stop, and for a spin in flight to land, so no one sees a spin change course. */
    function dueAt(s: State, p: Pending): number {
        const entry = find(s, p.el, p.wheelId);
        const lands = entry ? landsAt(entry.wheel) : null;
        return Math.max(p.due, lands ?? -Infinity);
    }

    function processPending(s: State, now: number): void {
        for (const p of [...s.pending.values()]) {
            if (!find(s, p.el, p.wheelId)) {
                s.pending.delete(p.wheelId);
                continue;
            }
            if (p.queued || dueAt(s, p) > now) continue;
            p.queued = true;
            const wheelId = p.wheelId;
            void enqueue(() => flush(s, wheelId));
        }
    }

    function schedule(s: State, now: number): void {
        if (s.wake !== null) env.clearTimeout(s.wake);
        s.wake = null;
        let at = Infinity;
        for (const p of s.pending.values())
            if (!p.queued) at = Math.min(at, dueAt(s, p));
        if (!Number.isFinite(at)) return;
        s.wake = env.setTimeout(
            () => {
                s.wake = null;
                if (d === s) refresh(s);
            },
            Math.max(0, at - now) + WAKE_SLACK_MS
        );
    }

    function refresh(s: State): void {
        const now = env.now();
        processPending(s, now);
        syncPanel(s);
        schedule(s, now);
    }

    function placeCtx(s: State) {
        return {
            issueCommand: s.issueCommand,
            driverId: s.driverId,
            nextRequestId: () => String(requestId++),
            webviewDomId: s.webviewId,
        };
    }

    /** One change is a new widget with the new state at the old one's place, then the old one removed. */
    async function replace(
        s: State,
        entry: Placed,
        next: Wheel
    ): Promise<Placed | null> {
        const [current] = await fetchElements(s, [entry.el], PLACE_PROPERTIES);
        const at = current ? rectOf(current) : null;
        if (!current || !at) {
            forget(s, [entry.el]);
            refresh(s);
            return null;
        }
        const newId = s.generateId();
        const plan = planReplacement({
            driverId: s.driverId,
            old: { ...entry, rect: at },
            at,
            others: [...s.wheels.values()].filter((o) => o.el !== entry.el),
            next,
            newId,
            place: { frameId: current.frameId, groupId: current.groupId },
        });
        const added = await s.issueCommand({
            type: "command:scene:add-drawdy-elements",
            ...stamp(s),
            req: { elements: [plan.element] },
        });
        if (added.res.error !== undefined) {
            fail(s, added.res.error.type);
            return null;
        }
        const placed: Placed = {
            el: newId,
            wheel: plan.wheel,
            rect: plan.rect,
        };
        s.wheels.set(newId, placed);
        const reselect = plan.remove.some((r) => s.selection.includes(r));
        const removed = await s.issueCommand({
            type: "command:scene:remove-drawdy-elements",
            ...stamp(s),
            req: { drawdyElementIds: plan.remove },
        });
        if (removed.res.error !== undefined) fail(s, removed.res.error.type);
        else {
            forget(s, plan.remove);
            for (const gone of plan.remove) s.moved.set(gone, newId);
        }
        if (s.target === null || plan.remove.includes(s.target)) {
            s.target = newId;
            s.targetKey = plan.wheel.wheelId;
        }
        refresh(s);
        if (reselect) {
            s.selection = [newId];
            await s
                .issueCommand({
                    type: "command:scene:set-selection",
                    ...stamp(s),
                    req: { drawdyElementIds: [newId] },
                })
                .catch(() => undefined);
        }
        return placed;
    }

    /** Applies a press to a wheel, together with any edit still waiting, in one replacement. */
    async function gesture(
        s: State,
        ref: Ref,
        change: (wheel: Wheel, now: number) => Wheel | null
    ): Promise<Wheel | null> {
        const entry = find(s, ref.el, ref.wheelId);
        if (!entry) return null;
        const now = env.now();
        const next = change(withPending(s, entry), now);
        if (!next) return null;
        s.pending.delete(entry.wheel.wheelId);
        if (sameWheel(next, entry.wheel)) {
            refresh(s);
            return null;
        }
        return (await replace(s, entry, next))?.wheel ?? null;
    }

    async function flush(s: State, wheelId: string): Promise<void> {
        const p = s.pending.get(wheelId);
        if (!p) return;
        p.queued = false;
        const entry = find(s, p.el, wheelId);
        const now = env.now();
        if (!entry) {
            s.pending.delete(wheelId);
            return;
        }
        if (dueAt(s, p) > now || isSpinning(entry.wheel, now)) {
            refresh(s);
            return;
        }
        s.pending.delete(wheelId);
        const next = edited(entry.wheel, p.entries, p.removePicked);
        if (sameWheel(next, entry.wheel)) {
            refresh(s);
            return;
        }
        await replace(s, entry, next);
    }

    /**
     * Spin lands on a remaining entry this screen draws with crypto randomness.
     * When nothing is left the hub reads Reset, so a press puts everyone back.
     */
    async function pressSpin(s: State, ref: Ref): Promise<void> {
        const next = await gesture(s, ref, (wheel, now) => {
            if (isSpinning(wheel, now)) return null;
            const turned = spun(wheel, {
                seed: env.seed(),
                pick: env.pick,
                now,
            });
            if (turned) return turned;
            return remaining(wheel).length === 0 && canReset(wheel)
                ? reset(wheel)
                : null;
        });
        if (!next?.lastSpin || !s.sound) return;
        const plan = planOf(next);
        if (plan)
            post(s, {
                type: "spun",
                startedAt: next.lastSpin.startedAt,
                ticks: tickTimes(plan),
            });
    }

    async function pressReset(s: State, ref: Ref): Promise<void> {
        await gesture(s, ref, (wheel, now) =>
            !isSpinning(wheel, now) && canReset(wheel) ? reset(wheel) : null
        );
    }

    /**
     * A click on a wheel's hub or Reset pill is a press. Several widgets sit
     * under one click only when stacked, and the one added last, which Drawdy
     * draws on top, is the one pressed.
     */
    async function clickAt(
        s: State,
        ids: readonly string[],
        point: Point
    ): Promise<void> {
        const clicked = new Set(ids);
        const hits = [...s.wheels.values()].filter((e) => clicked.has(e.el));
        for (const entry of hits.reverse()) {
            const button =
                entry.rect && buttonAt(entry.rect, entry.wheel, point);
            if (!button) continue;
            remember(s, entry.el);
            if (button === "spin") await pressSpin(s, { el: entry.el });
            else await pressReset(s, { el: entry.el });
            return;
        }
    }

    function queueEdit(
        s: State,
        ref: Ref,
        entries: Entry[],
        removePicked: boolean,
        delay: number
    ): void {
        const entry = find(s, ref.el, ref.wheelId);
        if (!entry) return;
        const wheelId = entry.wheel.wheelId;
        s.pending.set(wheelId, {
            el: entry.el,
            wheelId,
            entries,
            removePicked,
            due: env.now() + delay,
            queued: false,
        });
        refresh(s);
    }

    async function people(s: State): Promise<string[] | null> {
        try {
            const got = await s.issueCommand({
                type: "command:collaboration:get-all-users-in-board",
                ...stamp(s),
            });
            return got.res.error === undefined
                ? got.res.value.users.map((u) => u.name)
                : null;
        } catch {
            return null;
        }
    }

    /** A preset is an edit with fresh entries, written at once or as soon as a spin in flight lands. */
    async function applyPreset(
        s: State,
        ref: Ref,
        preset: Preset
    ): Promise<void> {
        const entry = find(s, ref.el, ref.wheelId);
        if (!entry) return;
        let names: string[] | undefined;
        if (preset === "people") {
            const found = await people(s);
            if (!found)
                return post(s, { type: "error", reason: "people-blocked" });
            if (found.length < 2)
                return post(s, { type: "error", reason: "alone" });
            names = found;
        }
        const entries = presetEntries(preset, {
            newId: env.newId,
            pick: env.pick,
            names,
        });
        queueEdit(
            s,
            { el: entry.el },
            entries,
            withPending(s, entry).removePicked,
            0
        );
    }

    async function addWheel(
        s: State,
        from?: Wheel,
        near?: Rect
    ): Promise<void> {
        const { width, height } = near ?? WIDGET_SIZE;
        let preferred: Rect;
        if (near) {
            preferred = { ...near, x: near.x + near.width + PLACE_GAP };
        } else {
            const area = await visibleArea(placeCtx(s));
            const centred = area
                ? centredIn(area, width, height)
                : { x: 0, y: 0, width, height };
            preferred = {
                ...centred,
                x: Math.round(centred.x),
                y: Math.round(centred.y),
            };
        }
        const spot = await findFreeRect(placeCtx(s), preferred);
        const id = s.generateId();
        const wheel = newWheel(
            id,
            from
                ? from.entries.map((e) => ({ ...e }))
                : presetEntries("lunch", { newId: env.newId, pick: env.pick }),
            from?.removePicked ?? true
        );
        const added = await s.issueCommand({
            type: "command:scene:add-drawdy-elements",
            ...stamp(s),
            req: { elements: [widgetElement(s.driverId, id, wheel, spot)] },
        });
        if (added.res.error !== undefined) {
            fail(s, added.res.error.type);
            return;
        }
        if (!s.wheels.has(id)) s.wheels.set(id, { el: id, wheel, rect: spot });
        remember(s, id);
        s.selection = [id];
        refresh(s);
        await revealAndSelect(placeCtx(s), [id], spot);
    }

    async function duplicate(s: State, ref: Ref): Promise<void> {
        const entry = find(s, ref.el, ref.wheelId);
        if (!entry?.rect) return;
        await addWheel(s, withPending(s, entry), entry.rect);
    }

    async function openPanel(s: State): Promise<void> {
        const created = await s.issueCommand({
            type: "command:webview:create",
            ...stamp(s),
            req: {
                webviewDomId: s.webviewId,
                htmlContent: WEBVIEW_HTML.replace(
                    "/*__DRAWDY_STYLING__*/",
                    stylingCssVars(s.styling)
                ),
                // Kept alive when closed, so a spin pressed on the board can still tick once a click in the panel unlocked audio.
                keepStateWhenClosed: true,
            },
        });
        if (created.res.error !== undefined) return;
        s.panel = true;
        await readView(s);
        const inView = [...s.wheels.values()].filter(
            (e) => e.rect && s.view && overlaps(e.rect, s.view)
        );
        if (inView.length === 0) await addWheel(s);
        else if (!selectedWheel(s)) remember(s, inView.at(-1)!.el);
        syncPanel(s, true);
    }

    async function readSelection(s: State): Promise<void> {
        try {
            const res = await s.issueCommand({
                type: "command:scene:get-current-selected-drawdy-elements",
                ...stamp(s),
            });
            if (res.res.error === undefined)
                s.selection = res.res.value.drawdyElementIds;
        } catch {
            return;
        }
    }

    async function handleMessage(
        s: State,
        message: WebviewToDriver
    ): Promise<void> {
        const ref: Ref | null =
            "el" in message && typeof message.el === "string"
                ? {
                      el: message.el,
                      wheelId:
                          typeof message.wheelId === "string"
                              ? message.wheelId
                              : undefined,
                  }
                : null;
        switch (message.type) {
            case "ready":
                s.panel = true;
                syncPanel(s, true);
                return;
            case "new":
                return enqueue(() => addWheel(s));
            case "duplicate":
                if (ref) return enqueue(() => duplicate(s, ref));
                return;
            case "edit":
                if (ref)
                    queueEdit(
                        s,
                        ref,
                        normalizeEntries(message.entries),
                        message.removePicked !== false,
                        EDIT_DELAY_MS
                    );
                return;
            case "preset":
                if (ref && PRESETS.includes(message.preset))
                    return enqueue(() => applyPreset(s, ref, message.preset));
                return;
            case "spin":
                if (ref) return enqueue(() => pressSpin(s, ref));
                return;
            case "reset":
                if (ref) return enqueue(() => pressReset(s, ref));
                return;
            case "sound":
                s.sound = message.on === true;
                syncPanel(s);
                await s
                    .issueCommand({
                        type: "command:kv-storage:set",
                        ...stamp(s),
                        req: { key: PREFS_KEY, payload: { sound: s.sound } },
                    })
                    .catch(() => undefined);
                return;
            default:
                return;
        }
    }

    async function subscribe(s: State): Promise<void> {
        const issue = s.issueCommand;
        await Promise.all([
            issue({
                type: "subscription:dom:element-clicked",
                ...stamp(s),
                req: { domElementId: s.buttonId },
            }),
            issue({
                type: "subscription:webview:message",
                ...stamp(s),
                req: { webviewDomId: s.webviewId },
            }),
            issue({ type: "subscription:dom:theme-changed", ...stamp(s) }),
            issue({ type: "subscription:scene:pointer", ...stamp(s), req: {} }),
            issue({ type: "subscription:scene:click", ...stamp(s), req: {} }),
            ...(
                [
                    "subscription:scene:elements-added",
                    "subscription:scene:elements-updated",
                    "subscription:scene:elements-removed",
                    "subscription:scene:elements-replaced",
                ] as const
            ).map((type) =>
                issue({ type, ...stamp(s), req: { properties: PROPERTIES } })
            ),
            issue({
                type: "subscription:scene:drawdy-element-selection",
                ...stamp(s),
            }),
        ]);
    }

    const activate: DriverModule["activate"] = async ({
        manifest,
        issueCommand,
        styling,
        generateId,
    }) => {
        const driverId = manifest.driverId;
        const s: State = {
            driverId,
            issueCommand,
            generateId,
            styling,
            buttonId: `${driverId}:action-button`,
            webviewId: `${driverId}:webview`,
            panel: false,
            sound: false,
            wheels: new Map(),
            moved: new Map(),
            pending: new Map(),
            down: null,
            selection: [],
            target: null,
            targetKey: null,
            view: null,
            wake: null,
            lastPanel: "",
        };
        const created = await issueCommand({
            type: "command:dom:create-action-button",
            ...stamp(s),
            req: { domElementId: s.buttonId, svg: ACTION_BUTTON_SVG },
        });
        if (created.res.error !== undefined) return;
        d = s;
        await subscribe(s);
        await loadPrefs(s);
        absorb(s, await fetchElements(s));
        await readSelection(s);
        refresh(s);
    };

    const onEvent: DriverModule["onEvent"] = async (
        event: DriverSubscriptionEvent
    ) => {
        const s = d;
        if (!s) return;
        switch (event.type) {
            case "subscription:dom:element-clicked": {
                if (event.body.domElementId === s.buttonId)
                    await enqueue(() => openPanel(s));
                return;
            }
            case "subscription:scene:pointer": {
                if (event.body.type === "down")
                    s.down = {
                        dom: event.body.cursor.domSpace,
                        canvas: event.body.cursor.canvasSpace,
                    };
                return;
            }
            case "subscription:scene:click": {
                const down = s.down;
                s.down = null;
                const up = event.body.cursor.domSpace;
                if (
                    !down ||
                    Math.hypot(up.x - down.dom.x, up.y - down.dom.y) >
                        CLICK_SLOP_PX
                )
                    return;
                const ids = event.body.drawdyElementIds;
                await enqueue(() => clickAt(s, ids, down.canvas));
                return;
            }
            case "subscription:webview:message": {
                if (event.body.webviewDomId !== s.webviewId) return;
                if (!isRecord(event.body.message)) return;
                await handleMessage(s, event.body.message as WebviewToDriver);
                return;
            }
            case "subscription:dom:theme-changed": {
                s.styling = event.body.styling;
                post(s, { type: "theme", cssVars: stylingCssVars(s.styling) });
                return;
            }
            case "subscription:scene:elements-added":
            case "subscription:scene:elements-updated": {
                if (absorb(s, event.body.drawdyElements)) refresh(s);
                return;
            }
            case "subscription:scene:elements-removed": {
                const ids = event.body.drawdyElements.map((el) => el.id);
                if (!ids.some((id) => s.wheels.has(id))) return;
                forget(s, ids);
                refresh(s);
                return;
            }
            case "subscription:scene:elements-replaced": {
                s.wheels.clear();
                absorb(s, event.body.drawdyElements);
                refresh(s);
                return;
            }
            case "subscription:scene:drawdy-element-selection": {
                s.selection = event.body.drawdyElementIds;
                syncPanel(s);
                return;
            }
            default:
                return;
        }
    };

    return { activate, onEvent };
}
