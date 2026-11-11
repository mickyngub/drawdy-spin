import { diceTotal, type DiceSides } from "./modes";
import { PROMPTS, type Lang } from "./prompts";
import {
    between,
    deriveSeed,
    hash32,
    intBelow,
    mulberry32,
    shuffled,
    type Rng,
} from "./rng";
import type { SpinMeta } from "./spin-meta";

export const SPIN_MS = 3200;
/** Where in the spin the overshoot peaks before settling back. */
const PEAK_AT = 0.86;
export const ORDER_ROWS = 10;
const SCRAMBLE_MS = 70;
const TICK_GAP_MS = 28;

export type WheelPlan = {
    mode: "wheel";
    labels: string[];
    winner: number;
    /** Degrees, clockwise. */
    start: number;
    turn: number;
    over: number;
};

export type OrderPlan = {
    mode: "order";
    labels: string[];
    ranked: string[];
    lockAt: number[];
};

export type GroupsPlan = {
    mode: "groups";
    groups: string[][];
    dealAt: number[];
};

export type DicePlan = {
    mode: "dice";
    sides: DiceSides;
    faces: number[];
    total: number;
    rolls: number[][];
    changeAt: number[][];
    spin: number[];
};

export type CoinPlan = {
    mode: "coin";
    side: "heads" | "tails";
    first: "heads" | "tails";
    halfTurns: number;
};

export type WarmupPlan = {
    mode: "warmup";
    lang: Lang;
    reel: string[];
    over: number;
};

export type AnimationPlan = (
    WheelPlan | OrderPlan | GroupsPlan | DicePlan | CoinPlan | WarmupPlan
) & { seed: number; durationMs: number };

export const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));
export const easeOutCubic = (u: number): number => 1 - (1 - clamp01(u)) ** 3;
const easeOutQuart = (u: number): number => 1 - (1 - clamp01(u)) ** 4;
const easeInOutSine = (u: number): number =>
    -(Math.cos(Math.PI * clamp01(u)) - 1) / 2;

/** A pop with a small overshoot past 1 before settling, for things that land. */
export function easeOutBack(u: number, s = 1.4): number {
    const x = clamp01(u) - 1;
    return 1 + (s + 1) * x ** 3 + s * x ** 2;
}

/**
 * Travels to `total + over` with a long ease-out, then settles back to
 * `total`, so a spin slows down, runs a little past and eases home.
 */
export function landing(u: number, total: number, over: number): number {
    const x = clamp01(u);
    if (x <= PEAK_AT) return (total + over) * easeOutQuart(x / PEAK_AT);
    return total + over * (1 - easeInOutSine((x - PEAK_AT) / (1 - PEAK_AT)));
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export function segmentUnderPointer(angle: number, count: number): number {
    const seg = 360 / count;
    return Math.min(count - 1, Math.floor(mod(-angle, 360) / seg));
}

export function wheelAngleAt(plan: WheelPlan, t: number): number {
    return plan.start + landing(t / SPIN_MS, plan.turn, plan.over);
}

function wheelPlan(rng: Rng, labels: string[], winner: number): WheelPlan {
    const seg = 360 / labels.length;
    const start = rng() * 360;
    const local = (winner + between(rng, 0.2, 0.8)) * seg;
    const turns = 4 + intBelow(rng, 2);
    const turn = turns * 360 + mod(-local - start, 360);
    const over = Math.min(seg * 0.45, 10) * between(rng, 0.55, 1);
    return { mode: "wheel", labels, winner, start, turn, over };
}

export function orderRowsShown(count: number): number {
    return Math.min(count, ORDER_ROWS);
}

export function orderLocked(plan: OrderPlan, t: number): number {
    return plan.lockAt.filter((at) => t >= at).length;
}

export function orderRowLabel(
    plan: OrderPlan,
    seed: number,
    row: number,
    t: number
): string {
    if (t >= plan.lockAt[row]) return plan.ranked[row];
    const tick = Math.floor(Math.max(0, t) / SCRAMBLE_MS);
    return plan.labels[hash32(seed, row, tick) % plan.labels.length];
}

export function groupsDealt(plan: GroupsPlan, t: number): number {
    return plan.dealAt.filter((at) => t >= at).length;
}

/** Where the i-th dealt entry sits: dealing goes round the groups in turn. */
export function dealSlot(
    plan: GroupsPlan,
    i: number
): { group: number; slot: number } {
    const g = plan.groups.length;
    return { group: i % g, slot: Math.floor(i / g) };
}

function dicePlan(rng: Rng, sides: DiceSides, faces: number[]): DicePlan {
    const rolls: number[][] = [];
    const changeAt: number[][] = [];
    const spin: number[] = [];
    faces.forEach((face, d) => {
        const lands = SPIN_MS - (faces.length - 1 - d) * 180;
        const changes = 9 + intBelow(rng, 4);
        const seq: number[] = [];
        for (let k = 0; k < changes; k++) {
            let next = 1 + intBelow(rng, sides);
            while (next === seq[k - 1] || (k === changes - 1 && next === face))
                next = (next % sides) + 1;
            seq.push(next);
        }
        seq.push(face);
        rolls.push(seq);
        changeAt.push(
            Array.from({ length: changes }, (_, k) =>
                Math.round(lands * ((k + 1) / changes) ** 1.6)
            )
        );
        spin.push((rng() < 0.5 ? -1 : 1) * between(rng, 420, 760));
    });
    return {
        mode: "dice",
        sides,
        faces,
        total: diceTotal(faces),
        rolls,
        changeAt,
        spin,
    };
}

export function diceLandAt(plan: DicePlan, die: number): number {
    return plan.changeAt[die][plan.changeAt[die].length - 1];
}

export function dieAt(
    plan: DicePlan,
    die: number,
    t: number
): { face: number; rotation: number; lift: number; landed: boolean } {
    const at = plan.changeAt[die];
    const shown = at.filter((x) => t >= x).length;
    const lands = diceLandAt(plan, die);
    const u = clamp01(t / lands);
    const after = t - lands;
    const wobble =
        after > 0 && after < 360
            ? Math.sin((after / 360) * Math.PI * 2) * 7 * (1 - after / 360)
            : 0;
    const bounces = 3;
    const hop = Math.abs(Math.sin(u * Math.PI * bounces)) * (1 - u) ** 1.4;
    return {
        face: plan.rolls[die][shown],
        rotation: plan.spin[die] * (1 - easeOutCubic(u)) + wobble,
        lift: t >= lands ? 0 : hop,
        landed: t >= lands,
    };
}

const COIN_LANDS = 0.9;

export function coinAt(
    plan: CoinPlan,
    t: number
): { angle: number; showing: "heads" | "tails"; lift: number } {
    const u = clamp01(t / (SPIN_MS * COIN_LANDS));
    const angle = Math.PI * plan.halfTurns * easeOutCubic(u);
    const edges = Math.floor((angle + Math.PI / 2) / Math.PI);
    const other = plan.first === "heads" ? "tails" : "heads";
    const after = clamp01(
        (t - SPIN_MS * COIN_LANDS) / (SPIN_MS * (1 - COIN_LANDS))
    );
    const lift =
        u < 1 ? Math.sin(Math.PI * u) : 0.07 * Math.sin(Math.PI * after);
    return { angle, showing: edges % 2 === 0 ? plan.first : other, lift };
}

export function reelAt(plan: WarmupPlan, t: number): number {
    return landing(t / SPIN_MS, plan.reel.length - 1, plan.over);
}

export function planFor(spin: SpinMeta): AnimationPlan {
    const rng = mulberry32(deriveSeed(spin.seed, 0x5eed));
    const base = { seed: spin.seed, durationMs: SPIN_MS };
    const { result, entries } = spin;
    switch (result.mode) {
        case "wheel":
            return { ...base, ...wheelPlan(rng, entries, result.index) };
        case "order": {
            const rows = orderRowsShown(entries.length);
            return {
                ...base,
                mode: "order",
                labels: entries,
                ranked: result.order.map((i) => entries[i]),
                lockAt: Array.from({ length: rows }, (_, r) =>
                    Math.round(700 + (SPIN_MS - 700) * ((r + 1) / rows))
                ),
            };
        }
        case "groups": {
            const n = entries.length;
            return {
                ...base,
                mode: "groups",
                groups: result.groups.map((g) => g.map((i) => entries[i])),
                dealAt: Array.from({ length: n }, (_, i) =>
                    Math.round(450 + (SPIN_MS - 450) * ((i + 1) / n))
                ),
            };
        }
        case "dice":
            return { ...base, ...dicePlan(rng, result.sides, result.faces) };
        case "coin": {
            const halfTurns = 9 + intBelow(rng, 4);
            const other = result.side === "heads" ? "tails" : "heads";
            return {
                ...base,
                mode: "coin",
                side: result.side,
                first: halfTurns % 2 === 0 ? result.side : other,
                halfTurns,
            };
        }
        case "warmup": {
            const pool = PROMPTS[result.lang].filter(
                (text) => text !== result.text
            );
            const decoys = shuffled(rng, pool).slice(0, 7 + intBelow(rng, 3));
            return {
                ...base,
                mode: "warmup",
                lang: result.lang,
                reel: [...decoys, result.text],
                over: 0.28,
            };
        }
    }
}

/** When the spinner's tick sound plays, in ms from the start of the spin. */
export function tickTimes(plan: AnimationPlan): number[] {
    const raw: number[] = [];
    switch (plan.mode) {
        case "wheel": {
            const seg = 360 / plan.labels.length;
            let last = Math.floor(wheelAngleAt(plan, 0) / seg);
            for (let t = 4; t <= SPIN_MS; t += 4) {
                const b = Math.floor(wheelAngleAt(plan, t) / seg);
                if (b !== last) raw.push(t);
                last = b;
            }
            break;
        }
        case "order":
            raw.push(...plan.lockAt);
            break;
        case "groups":
            raw.push(...plan.dealAt);
            break;
        case "dice":
            raw.push(...plan.changeAt.flat());
            break;
        case "coin": {
            let last = coinAt(plan, 0).showing;
            for (let t = 4; t <= SPIN_MS; t += 4) {
                const now = coinAt(plan, t).showing;
                if (now !== last) raw.push(t);
                last = now;
            }
            break;
        }
        case "warmup": {
            let last = Math.floor(reelAt(plan, 0));
            for (let t = 4; t <= SPIN_MS; t += 4) {
                const step = Math.floor(reelAt(plan, t));
                if (step !== last) raw.push(t);
                last = step;
            }
            break;
        }
    }
    const out: number[] = [];
    for (const t of [...raw].sort((a, b) => a - b)) {
        if (out.length === 0 || t - out[out.length - 1] >= TICK_GAP_MS)
            out.push(t);
    }
    return out;
}
