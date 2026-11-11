import type { DriverCommandIssuer } from "@drawdy/driver-protocol";
import type { Rect } from "./free-spot";

const GAP = 32;
const EDGE = 24;
const MAX_STEPS = 40;
// Bounds the search on a zoomed-out, crowded board.
const SNUG_LIMIT = 60;
const CHECK_LIMIT = 2000;

/**
 * Spots for a card nearest `preferred` first, kept fully inside `area` so the
 * card always lands in view: a quarter-card grid plus the spots snug against
 * each occupied rect, so tight gaps are found too.
 */
export function spotCandidates(
    preferred: Rect,
    area: Rect,
    occupied: Rect[] = []
): Rect[] {
    const { width, height } = preferred;
    const left = area.x + EDGE;
    const top = area.y + EDGE;
    const right = area.x + area.width - EDGE - width;
    const bottom = area.y + area.height - EDGE - height;
    if (right < left || bottom < top) return [];
    const axis = (
        from: number,
        step: number,
        reach: number,
        snug: number[],
        min: number,
        max: number
    ) => {
        const values = new Set<number>([min, max, ...snug]);
        for (let k = -reach; k <= reach; k++) values.add(from + k * step);
        return [...values].map(Math.round).filter((v) => v >= min && v <= max);
    };
    const stepX = (width + GAP) / 4;
    const stepY = (height + GAP) / 4;
    const xs = axis(
        preferred.x,
        stepX,
        Math.min(MAX_STEPS, Math.ceil(area.width / stepX)),
        occupied.flatMap((o) => [o.x + o.width + GAP, o.x - GAP - width]),
        left,
        right
    );
    const ys = axis(
        preferred.y,
        stepY,
        Math.min(MAX_STEPS, Math.ceil(area.height / stepY)),
        occupied.flatMap((o) => [o.y + o.height + GAP, o.y - GAP - height]),
        top,
        bottom
    );
    const out: { rect: Rect; d: number }[] = [];
    for (const y of ys)
        for (const x of xs)
            out.push({
                rect: { x, y, width, height },
                d: (x - preferred.x) ** 2 + (y - preferred.y) ** 2,
            });
    return out.sort((a, b) => a.d - b.d).map((c) => c.rect);
}

const covered = (a: Rect, b: Rect): number =>
    Math.max(
        0,
        Math.min(a.x + a.width, b.x + b.width + GAP) - Math.max(a.x, b.x - GAP)
    ) *
    Math.max(
        0,
        Math.min(a.y + a.height, b.y + b.height + GAP) -
            Math.max(a.y, b.y - GAP)
    );

/** The nearest spot in view that covers nothing, or, in a full view, the one that covers least. */
export function bestSpot(preferred: Rect, area: Rect, occupied: Rect[]): Rect {
    const cx = preferred.x + preferred.width / 2;
    const cy = preferred.y + preferred.height / 2;
    const near = [...occupied]
        .sort(
            (a, b) =>
                Math.hypot(a.x + a.width / 2 - cx, a.y + a.height / 2 - cy) -
                Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy)
        )
        .slice(0, SNUG_LIMIT);
    const candidates = spotCandidates(preferred, area, near).slice(
        0,
        CHECK_LIMIT
    );
    if (candidates.length === 0) return preferred;
    const window = {
        x: Math.min(...candidates.map((c) => c.x)) - GAP,
        y: Math.min(...candidates.map((c) => c.y)) - GAP,
        right: Math.max(...candidates.map((c) => c.x + c.width)) + GAP,
        bottom: Math.max(...candidates.map((c) => c.y + c.height)) + GAP,
    };
    const relevant = occupied.filter(
        (o) =>
            o.x < window.right &&
            o.x + o.width > window.x &&
            o.y < window.bottom &&
            o.y + o.height > window.y
    );
    let best = candidates[0];
    let least = Infinity;
    for (const candidate of candidates) {
        let cost = 0;
        for (const o of relevant) {
            cost += covered(candidate, o);
            if (cost >= least) break;
        }
        if (cost === 0) return candidate;
        if (cost < least) {
            least = cost;
            best = candidate;
        }
    }
    return best;
}

type Ctx = {
    issueCommand: DriverCommandIssuer;
    driverId: string;
    nextRequestId: () => string;
};

async function value<T>(
    ctx: Ctx,
    type: string,
    req: unknown
): Promise<T | null> {
    try {
        const r = (await ctx.issueCommand({
            type,
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req,
        } as Parameters<DriverCommandIssuer>[0])) as {
            res: { error?: unknown; value?: T };
        };
        return r.res.error === undefined ? (r.res.value ?? null) : null;
    } catch {
        return null;
    }
}

export async function findCardSpot(
    ctx: Ctx,
    preferred: Rect,
    area: Rect
): Promise<Rect> {
    const hits = await value<{
        drawdyElements: { id: string; type?: string }[];
    }>(ctx, "command:scene:query-rect", { rect: area, properties: ["type"] });
    const ids = (hits?.drawdyElements ?? [])
        .filter((e) => e.type !== "frame")
        .map((e) => e.id);
    const rects =
        ids.length > 0
            ? await value<{
                  rects: { drawdyElementId: string; rect: Rect }[];
              }>(ctx, "command:scene:element-rects", { drawdyElementIds: ids })
            : null;
    return bestSpot(
        preferred,
        area,
        (rects?.rects ?? []).map((r) => r.rect)
    );
}
