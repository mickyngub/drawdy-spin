import { PROMPTS, type Lang } from "./prompts";
import { intBelow, mulberry32, shuffled } from "./rng";

export const MODES = [
    "wheel",
    "order",
    "groups",
    "dice",
    "coin",
    "warmup",
] as const;
export type Mode = (typeof MODES)[number];

export const SOURCES = ["people", "stickies", "list"] as const;
export type Source = (typeof SOURCES)[number];

export type GroupsBy = "count" | "size";
export type DiceSides = 6 | 20;

export type ModeOptions = {
    groupsBy: GroupsBy;
    groupsN: number;
    diceCount: number;
    diceSides: DiceSides;
    lang: Lang;
    /** Warm-up prompt indices this device used lately, skipped while others remain. */
    avoid: number[];
};

export type SpinResult =
    | { mode: "wheel"; index: number }
    | { mode: "order"; order: number[] }
    | { mode: "groups"; groups: number[][] }
    | { mode: "dice"; sides: DiceSides; faces: number[] }
    | { mode: "coin"; side: "heads" | "tails" }
    | { mode: "warmup"; lang: Lang; prompt: number; text: string };

export const MIN_ENTRIES = 2;
export const MAX_ENTRIES = 100;
export const MAX_LABEL = 60;
export const GROUPS_N = { min: 2, max: 20 } as const;
export const DICE_COUNT = { min: 1, max: 3 } as const;

export const DEFAULT_OPTIONS: ModeOptions = {
    groupsBy: "count",
    groupsN: 2,
    diceCount: 1,
    diceSides: 6,
    lang: "en",
    avoid: [],
};

export const usesEntries = (mode: Mode): boolean =>
    mode === "wheel" || mode === "order" || mode === "groups";

const clampInt = (
    value: unknown,
    min: number,
    max: number,
    fallback: number
) =>
    typeof value === "number" && Number.isFinite(value)
        ? Math.min(max, Math.max(min, Math.round(value)))
        : fallback;

export function normalizeOptions(raw: unknown): ModeOptions {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<
        string,
        unknown
    >;
    return {
        groupsBy: o.groupsBy === "size" ? "size" : "count",
        groupsN: clampInt(
            o.groupsN,
            GROUPS_N.min,
            GROUPS_N.max,
            DEFAULT_OPTIONS.groupsN
        ),
        diceCount: clampInt(
            o.diceCount,
            DICE_COUNT.min,
            DICE_COUNT.max,
            DEFAULT_OPTIONS.diceCount
        ),
        diceSides: o.diceSides === 20 ? 20 : 6,
        lang: o.lang === "th" ? "th" : "en",
        avoid: Array.isArray(o.avoid)
            ? o.avoid.filter(
                  (n): n is number => Number.isInteger(n) && (n as number) >= 0
              )
            : [],
    };
}

export function cleanLabel(raw: string): string {
    const label = raw.replace(/\s+/g, " ").trim();
    return label.length > MAX_LABEL
        ? `${label.slice(0, MAX_LABEL - 1).trimEnd()}…`
        : label;
}

/** One entry per non-empty line, with list bullets and numbering dropped. */
export function parseList(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) =>
            cleanLabel(line.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, ""))
        )
        .filter((line) => line.length > 0)
        .slice(0, MAX_ENTRIES);
}

export function firstLine(text: string | undefined): string {
    const line = (text ?? "").split(/\r?\n/).find((l) => l.trim() !== "");
    return line ? cleanLabel(line) : "";
}

/** Repeated names get a number, so every wheel segment can be told apart. */
export function distinctNames(names: readonly string[]): string[] {
    const seen = new Map<string, number>();
    return names.map((raw) => {
        const name = cleanLabel(raw) || "Guest";
        const count = (seen.get(name) ?? 0) + 1;
        seen.set(name, count);
        return count === 1 ? name : `${name} (${count})`;
    });
}

export function groupCount(entries: number, by: GroupsBy, n: number): number {
    if (entries <= 0) return 0;
    if (by === "count") return Math.min(entries, Math.max(1, n));
    return Math.ceil(entries / Math.min(entries, Math.max(1, n)));
}

/** Group sizes for a split, largest first; they differ by at most one. */
export function groupSizes(entries: number, by: GroupsBy, n: number): number[] {
    const g = groupCount(entries, by, n);
    return Array.from(
        { length: g },
        (_, i) => Math.floor(entries / g) + (i < entries % g ? 1 : 0)
    );
}

export function computeResult(
    mode: Mode,
    seed: number,
    entryCount: number,
    options: ModeOptions
): SpinResult {
    const rng = mulberry32(seed);
    const indices = Array.from({ length: entryCount }, (_, i) => i);
    switch (mode) {
        case "wheel":
            return { mode, index: intBelow(rng, entryCount) };
        case "order":
            return { mode, order: shuffled(rng, indices) };
        case "groups": {
            const g = groupCount(entryCount, options.groupsBy, options.groupsN);
            const groups: number[][] = Array.from({ length: g }, () => []);
            shuffled(rng, indices).forEach((entry, i) =>
                groups[i % g].push(entry)
            );
            return { mode, groups };
        }
        case "dice":
            return {
                mode,
                sides: options.diceSides,
                faces: Array.from(
                    { length: options.diceCount },
                    () => 1 + intBelow(rng, options.diceSides)
                ),
            };
        case "coin":
            return { mode, side: rng() < 0.5 ? "heads" : "tails" };
        case "warmup": {
            const pool = PROMPTS[options.lang];
            const avoid = new Set(options.avoid);
            const fresh = pool.map((_, i) => i).filter((i) => !avoid.has(i));
            const candidates = fresh.length > 0 ? fresh : pool.map((_, i) => i);
            const prompt = candidates[intBelow(rng, candidates.length)];
            return { mode, lang: options.lang, prompt, text: pool[prompt] };
        }
    }
}

export function diceTotal(faces: readonly number[]): number {
    return faces.reduce((sum, face) => sum + face, 0);
}

export function diceSum(faces: readonly number[]): string {
    return faces.length > 1
        ? `${faces.join(" + ")} = ${diceTotal(faces)}`
        : String(faces[0]);
}
