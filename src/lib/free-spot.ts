import type { DriverCommandIssuer } from "@drawdy/driver-protocol";

export type Rect = { x: number; y: number; width: number; height: number };

export const PLACE_GAP = 40;
const DRAWER_MARGIN_PX = 16;
// Drawer width plus its gap to the extension bar, used when the iframe rect can't be read.
const DRAWER_FALLBACK_PX = 360;
const SEARCH_COLUMNS = 4;
const SEARCH_TRIES = 24;
const FLY_DURATION_MS = 350;

export const rectRight = (r: Rect): number => r.x + r.width;
export const rectBottom = (r: Rect): number => r.y + r.height;

export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
    return (
        a.x < rectRight(b) + gap &&
        b.x < rectRight(a) + gap &&
        a.y < rectBottom(b) + gap &&
        b.y < rectBottom(a) + gap
    );
}

export function contains(outer: Rect, inner: Rect): boolean {
    return (
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        rectRight(inner) <= rectRight(outer) &&
        rectBottom(inner) <= rectBottom(outer)
    );
}

export function centredIn(area: Rect, width: number, height: number): Rect {
    return {
        x: area.x + (area.width - width) / 2,
        y: area.y + (area.height - height) / 2,
        width,
        height,
    };
}

/** The preferred spot, then steps right along a row, then down to the next row. */
export function candidateRects(preferred: Rect, gap = PLACE_GAP): Rect[] {
    return Array.from({ length: SEARCH_TRIES }, (_, i) => ({
        ...preferred,
        x: preferred.x + (i % SEARCH_COLUMNS) * (preferred.width + gap),
        y:
            preferred.y +
            Math.floor(i / SEARCH_COLUMNS) * (preferred.height + gap),
    }));
}

export const firstFreeRect = (
    candidates: readonly Rect[],
    occupied: readonly Rect[],
    gap = PLACE_GAP
): Rect | null =>
    candidates.find((c) => occupied.every((o) => !overlaps(c, o, gap))) ?? null;

type Ctx = {
    issueCommand: DriverCommandIssuer;
    driverId: string;
    nextRequestId: () => string;
    /** The webview's dom id (`webviewDomId`), so the drawer can be measured. */
    webviewDomId?: string;
};

async function issue<T>(
    ctx: Ctx,
    type: string,
    req: unknown
): Promise<T | null> {
    try {
        const res = (await ctx.issueCommand({
            type,
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req,
        } as Parameters<DriverCommandIssuer>[0])) as {
            res: { error?: unknown; value?: unknown };
        };
        if (res?.res?.error !== undefined) return null;
        return (res.res.value as T | undefined) ?? null;
    } catch {
        return null;
    }
}

/** The part of the viewport not covered by the extension drawer, in canvas coordinates. */
export async function visibleArea(ctx: Ctx): Promise<Rect | null> {
    const view = await issue<{ rect: Rect }>(
        ctx,
        "command:camera:get-viewport-rect",
        undefined
    );
    if (!view) return null;
    const viewport = view.rect;
    let drawerLeft: number | null = null;
    if (ctx.webviewDomId) {
        const dom = await issue<Rect>(ctx, "command:dom:element-rect", {
            elementId: ctx.webviewDomId,
        });
        if (dom && dom.width > 0) {
            const p = await issue<{ x: number; y: number }>(
                ctx,
                "command:camera:screen-to-canvas",
                { x: dom.x - DRAWER_MARGIN_PX, y: dom.y }
            );
            if (p) drawerLeft = p.x;
        }
    }
    if (drawerLeft === null) {
        const cam = await issue<{ zoom: number }>(
            ctx,
            "command:camera:get-info",
            undefined
        );
        const zoom = cam?.zoom && cam.zoom > 0 ? cam.zoom : 1;
        drawerLeft = rectRight(viewport) - DRAWER_FALLBACK_PX / zoom;
    }
    const width = Math.max(
        0,
        Math.min(rectRight(viewport), drawerLeft) - viewport.x
    );
    return { ...viewport, width: width > 0 ? width : viewport.width };
}

/** The first spot at or after `preferred` that overlaps nothing on the board but frames. */
export async function findFreeRect(ctx: Ctx, preferred: Rect): Promise<Rect> {
    const candidates = candidateRects(preferred);
    const xs = candidates.map((c) => c.x);
    const ys = candidates.map((c) => c.y);
    const area = {
        x: Math.min(...xs) - PLACE_GAP,
        y: Math.min(...ys) - PLACE_GAP,
        width:
            Math.max(...xs) - Math.min(...xs) + preferred.width + 2 * PLACE_GAP,
        height:
            Math.max(...ys) -
            Math.min(...ys) +
            preferred.height +
            2 * PLACE_GAP,
    };
    const hits = await issue<{
        drawdyElements: { id: string; type?: string }[];
    }>(ctx, "command:scene:query-rect", { rect: area, properties: ["type"] });
    if (!hits) return preferred;
    const ids = hits.drawdyElements
        .filter((e) => e.type !== "frame")
        .map((e) => e.id);
    if (ids.length === 0) return preferred;
    const rects = await issue<{
        rects: { drawdyElementId: string; rect: Rect }[];
    }>(ctx, "command:scene:element-rects", { drawdyElementIds: ids });
    if (!rects) return preferred;
    return (
        firstFreeRect(
            candidates,
            rects.rects.map((r) => r.rect)
        ) ?? preferred
    );
}

/**
 * Selects what was just placed and brings it into the area left of the
 * drawer, keeping the current zoom.
 */
export async function revealAndSelect(
    ctx: Ctx,
    ids: string[],
    placed: Rect
): Promise<void> {
    if (ids.length === 0) return;
    await issue(ctx, "command:scene:set-selection", { drawdyElementIds: ids });
    const area = await visibleArea(ctx);
    if (area && contains(area, placed)) return;
    const view = await issue<{ rect: Rect }>(
        ctx,
        "command:camera:get-viewport-rect",
        undefined
    );
    const cam = await issue<{ zoom: number }>(
        ctx,
        "command:camera:get-info",
        undefined
    );
    const zoom = cam?.zoom && cam.zoom > 0 ? cam.zoom : 1;
    const covered =
        area && view
            ? rectRight(view.rect) - rectRight(area)
            : DRAWER_FALLBACK_PX / zoom;
    await issue(ctx, "command:camera:fly-to-rect", {
        rect: { ...placed, width: placed.width + Math.max(0, covered) },
        flyDurationMs: FLY_DURATION_MS,
        zoom,
    });
}
