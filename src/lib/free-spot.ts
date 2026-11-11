import type { DriverCommandIssuer } from "@drawdy/driver-protocol";

export type Rect = { x: number; y: number; width: number; height: number };

const DRAWER_MARGIN_PX = 16;
// Drawer width plus its gap to the extension bar, used when the iframe rect can't be read.
const DRAWER_FALLBACK_PX = 360;

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
                {
                    x: dom.x - DRAWER_MARGIN_PX,
                    y: dom.y,
                }
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
