import {
    DICE_COUNT,
    MAX_ENTRIES,
    MODES,
    SOURCES,
    type Mode,
    type Source,
    type SpinResult,
} from "./modes";

export type SpinMeta = {
    v: 1;
    seed: number;
    startedAt: number;
    mode: Mode;
    source: Source | null;
    entries: string[];
    result: SpinResult;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

const isIndexList = (v: unknown, count: number): v is number[] =>
    Array.isArray(v) &&
    v.every((n) => Number.isInteger(n) && n >= 0 && n < count);

function isPartition(lists: number[][], count: number): boolean {
    const all = lists.flat();
    return all.length === count && new Set(all).size === count;
}

function validResult(r: unknown, mode: Mode, count: number): boolean {
    if (!isObject(r) || r.mode !== mode) return false;
    switch (mode) {
        case "wheel":
            return Number.isInteger(r.index) && isIndexList([r.index], count);
        case "order":
            return (
                isIndexList(r.order, count) &&
                isPartition([r.order as number[]], count)
            );
        case "groups":
            return (
                Array.isArray(r.groups) &&
                r.groups.length > 0 &&
                r.groups.every((g) => isIndexList(g, count)) &&
                isPartition(r.groups as number[][], count)
            );
        case "dice":
            return (
                (r.sides === 6 || r.sides === 20) &&
                Array.isArray(r.faces) &&
                r.faces.length >= DICE_COUNT.min &&
                r.faces.length <= DICE_COUNT.max &&
                r.faces.every(
                    (f) =>
                        Number.isInteger(f) &&
                        f >= 1 &&
                        f <= (r.sides as number)
                )
            );
        case "coin":
            return r.side === "heads" || r.side === "tails";
        case "warmup":
            return (
                (r.lang === "en" || r.lang === "th") &&
                Number.isInteger(r.prompt) &&
                typeof r.text === "string" &&
                r.text.length > 0
            );
    }
}

/** The spin a card carries, or null when the meta is not a spin this version can play. */
export function readSpin(
    meta: Record<string, unknown> | undefined,
    key: string
): SpinMeta | null {
    const raw = meta?.[key];
    if (!isObject(raw) || raw.v !== 1) return null;
    const { seed, startedAt, mode, source, entries, result } = raw;
    if (!Number.isInteger(seed) || (seed as number) < 0) return null;
    if (typeof startedAt !== "number" || !Number.isFinite(startedAt))
        return null;
    if (!MODES.includes(mode as Mode)) return null;
    if (source !== null && !SOURCES.includes(source as Source)) return null;
    if (
        !Array.isArray(entries) ||
        entries.length > MAX_ENTRIES ||
        !entries.every((e) => typeof e === "string")
    )
        return null;
    if (!validResult(result, mode as Mode, entries.length)) return null;
    return raw as SpinMeta;
}
