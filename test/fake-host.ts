import type {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
} from "@drawdy/driver-protocol";
import type { OverlayConfig } from "../src/lib/overlay-layout";
import { overlaps, type Rect } from "../src/lib/free-spot";

export const MANIFEST = {
    driverId: "mickyngub.spin",
    driverName: "Spin",
} as DriverManifest;
export const WEBVIEW_ID = "mickyngub.spin:webview";
export const BUTTON_ID = "mickyngub.spin:action-button";

export type Stored = Record<string, any> & {
    drawdyElementId: string;
    type: string;
};

type Sent = { type: string; req?: any };

type User = { name: string; isSelf?: boolean; isHost?: boolean };

/** The board everyone shares: whole elements, last write wins, like Drawdy's Yjs map. */
export function fakeBoard() {
    const elements = new Map<string, Stored>();
    const hosts: { receive(type: string, elements: Stored[]): void }[] = [];
    let pending: Promise<unknown>[] = [];
    return {
        elements,
        hosts,
        track(p: Promise<unknown>) {
            pending.push(p);
        },
        async flush() {
            for (let i = 0; i < 20; i++) {
                const now = pending;
                pending = [];
                await Promise.all(now);
                await new Promise((r) => setImmediate(r));
                if (pending.length === 0) return;
            }
        },
    };
}

export type FakeBoard = ReturnType<typeof fakeBoard>;

const rectOf = (el: Stored): Rect => ({
    x: el.x,
    y: el.y,
    width: el.width ?? 200,
    height: el.height ?? 193,
});

function picked(el: Stored, properties: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = { id: el.drawdyElementId };
    for (const key of properties) {
        if (key === "type") out.type = el.type === "shape" ? "path" : el.type;
        else if (key === "componentType") {
            if (el.type === "shape")
                out.componentType = el.componentType ?? "rect";
        } else if (key === "opacity") out.opacity = el.opacity ?? 1;
        else if (el[key] !== undefined) out[key] = el[key];
    }
    return out;
}

type Options = {
    board?: FakeBoard;
    viewport?: Rect;
    users?: User[];
    denied?: string[];
    addError?: string;
    selection?: string[];
    kv?: Record<string, Record<string, unknown>>;
};

export function fakeHost(options: Options = {}) {
    const board = options.board ?? fakeBoard();
    const viewport = options.viewport ?? {
        x: 0,
        y: 0,
        width: 1600,
        height: 1000,
    };
    const sent: Sent[] = [];
    const posted: any[] = [];
    const floating = new Map<string, any>();
    const removed: string[] = [];
    const subs = new Map<string, string>();
    const subProps = new Map<string, string[]>();
    const kv = new Map(Object.entries(options.kv ?? {}));
    let selection = options.selection ?? [];
    let panel = false;
    let module: DriverModule | null = null;
    let subNo = 0;

    const deliver = (type: string, body: unknown) => {
        const subscriptionId = subs.get(type);
        if (!subscriptionId || !module) return;
        board.track(module.onEvent({ type, subscriptionId, body } as any));
    };

    const issueCommand = (async (cmd: any) => {
        sent.push({ type: cmd.type, req: cmd.req });
        const ok = (value?: unknown) => ({ ...cmd, res: { value } });
        const fail = (type: string) => ({ ...cmd, res: { error: { type } } });
        if (options.denied?.some((prefix) => cmd.type.startsWith(prefix)))
            return fail("unauthorized");
        if (cmd.type.startsWith("subscription:")) {
            const subscriptionId = `sub-${++subNo}`;
            subs.set(cmd.type, subscriptionId);
            subProps.set(cmd.type, cmd.req?.properties ?? []);
            return ok({ subscriptionId });
        }
        switch (cmd.type) {
            case "command:dom:create-action-button":
                return ok({ created: true });
            case "command:webview:create":
                panel = true;
                return ok({ created: true });
            case "command:webview:post-message":
                if (panel) posted.push(cmd.req.message);
                return ok({ posted: panel });
            case "command:camera:get-viewport-rect":
                return ok({ rect: viewport });
            case "command:camera:get-info":
                return ok({ x: 0, y: 0, zoom: 1 });
            case "command:camera:canvas-to-screen":
                return ok({
                    x: cmd.req.x - viewport.x,
                    y: cmd.req.y - viewport.y,
                });
            case "command:camera:screen-to-canvas":
                return ok({
                    x: cmd.req.x + viewport.x,
                    y: cmd.req.y + viewport.y,
                });
            case "command:dom:element-rect":
                return panel && cmd.req.elementId === WEBVIEW_ID
                    ? ok({
                          x: viewport.width - 336,
                          y: 64,
                          width: 320,
                          height: 500,
                      })
                    : fail("not-found");
            case "command:dom:create-floating-element":
                floating.set(cmd.req.domId, cmd.req);
                return ok({ created: true });
            case "command:dom:remove-floating-element": {
                const had = floating.delete(cmd.req.domId);
                if (had) removed.push(cmd.req.domId);
                return ok({ removed: had });
            }
            case "command:scene:query-rect":
                return ok({
                    drawdyElements: [...board.elements.values()]
                        .filter((el) => overlaps(rectOf(el), cmd.req.rect))
                        .map((el) => picked(el, ["type"])),
                });
            case "command:scene:element-rects":
                return ok({
                    rects: (cmd.req.drawdyElementIds as string[]).flatMap(
                        (id) => {
                            const el = board.elements.get(id);
                            return el
                                ? [{ drawdyElementId: id, rect: rectOf(el) }]
                                : [];
                        }
                    ),
                });
            case "command:scene:add-drawdy-elements": {
                if (options.addError) return fail(options.addError);
                const added = (cmd.req.elements as Stored[]).map((el) => ({
                    ...el,
                }));
                for (const el of added)
                    board.elements.set(el.drawdyElementId, el);
                for (const host of board.hosts)
                    host.receive("subscription:scene:elements-added", added);
                return ok();
            }
            case "command:scene:update-drawdy-elements": {
                let updated = 0;
                for (const { drawdyElementId, properties } of cmd.req.updates) {
                    const el = board.elements.get(drawdyElementId);
                    if (!el) continue;
                    const { meta, transform, ...rest } = properties;
                    board.elements.set(drawdyElementId, {
                        ...el,
                        ...rest,
                        ...(transform ?? {}),
                        ...(meta ? { meta: { ...el.meta, ...meta } } : {}),
                    });
                    updated++;
                }
                return ok({ updated });
            }
            case "command:scene:get-drawdy-elements": {
                const ids: string[] | undefined = cmd.req.drawdyElementIds;
                const els = ids
                    ? ids.flatMap((id) => {
                          const el = board.elements.get(id);
                          return el ? [el] : [];
                      })
                    : [...board.elements.values()];
                return ok({
                    drawdyElements: els.map((el) =>
                        picked(el, cmd.req.properties)
                    ),
                });
            }
            case "command:scene:get-current-selected-drawdy-elements":
                return ok({ drawdyElementIds: selection });
            case "command:scene:set-selection":
                selection = cmd.req.drawdyElementIds;
                return ok();
            case "command:kv-storage:get":
                return ok({ got: kv.get(cmd.req.key) });
            case "command:kv-storage:set":
                kv.set(cmd.req.key, cmd.req.payload);
                return ok();
            case "command:collaboration:get-all-users-in-board":
                return ok({
                    users: (
                        options.users ?? [{ name: "Me", isSelf: true }]
                    ).map((u, i) => ({
                        id: `u${i}`,
                        color: "#000",
                        isHost: u.isHost ?? i === 0,
                        isSelf: u.isSelf ?? i === 0,
                        cursorPosition: null,
                        name: u.name,
                    })),
                });
            default:
                return ok({});
        }
    }) as unknown as DriverCommandIssuer;

    let ids = 0;
    const host = {
        issueCommand,
        sent,
        posted,
        floating,
        removed,
        kv,
        board,
        get selection() {
            return selection;
        },
        nextId: () => `card-${Math.random().toString(36).slice(2, 8)}-${++ids}`,
        types: () => sent.map((s) => s.type),
        sentOf: (type: string) => sent.filter((s) => s.type === type),
        postedOf: (type: string) => posted.filter((m) => m.type === type),
        overlays: () => [...floating.values()],
        attach(m: DriverModule) {
            module = m;
        },
        /** Delivers an element event the way Drawdy does, filtered to the subscribed properties. */
        receive(type: string, elements: Stored[]) {
            if (!subs.has(type)) return;
            const properties = subProps.get(type) ?? [];
            deliver(type, {
                drawdyElements: elements.map((el) => picked(el, properties)),
                properties,
            });
        },
        event(type: string, body: unknown) {
            deliver(type, body);
        },
        clear() {
            sent.length = 0;
            posted.length = 0;
        },
    };
    board.hosts.push(host);
    return host;
}

export type FakeHost = ReturnType<typeof fakeHost>;

export async function boot(
    module: DriverModule,
    host: FakeHost,
    styling: Record<string, unknown> = { theme: "dark" }
) {
    host.attach(module);
    await module.activate({
        manifest: MANIFEST,
        issueCommand: host.issueCommand,
        styling: styling as any,
        generateId: host.nextId,
    });
    const click = () =>
        module.onEvent({
            type: "subscription:dom:element-clicked",
            body: { domElementId: BUTTON_ID },
        } as any);
    const message = async (body: Record<string, unknown>) => {
        await module.onEvent({
            type: "subscription:webview:message",
            body: { webviewDomId: WEBVIEW_ID, message: body },
        } as any);
        await host.board.flush();
    };
    const open = async () => {
        await click();
        await message({ type: "ready" });
    };
    return { click, message, open };
}

export function overlayConfig(req: any): OverlayConfig {
    const doc: string = req.schema.child.srcDoc;
    const match =
        /<script type="application\/json" id="spin-config">([\s\S]*?)<\/script>/.exec(
            doc
        );
    if (!match) throw new Error("the overlay carries no spin config");
    return JSON.parse(match[1]) as OverlayConfig;
}

export const cards = (board: FakeBoard) =>
    [...board.elements.values()].filter(
        (el) => el.meta?.[MANIFEST.driverId] !== undefined
    );
