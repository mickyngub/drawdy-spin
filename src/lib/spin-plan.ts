import { between, deriveSeed, intBelow, mulberry32 } from "./rng";
import {
    isSpinning,
    mod,
    PLAY_WINDOW_MS,
    remaining,
    slicesOf,
    SPIN_LEAD_MS,
    SPIN_MS,
    type Wheel,
} from "./wheel";

/** The wheel draws back this far before it turns. */
export const WINDUP_DEG = 8;
/** Where in the spin the overshoot peaks before settling back. */
const PEAK_AT = 0.86;
const TICK_GAP_MS = 28;
const TICK_STEP_MS = 4;

/**
 * Angles are degrees, clockwise. Slice i spans `angle + i * seg` to
 * `angle + (i + 1) * seg` measured from twelve o'clock, where the pointer is.
 */
export type SpinPlan = {
    count: number;
    winner: number;
    from: number;
    start: number;
    final: number;
    over: number;
    startedAt: number;
};

export const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));
const easeOutQuart = (u: number): number => 1 - (1 - clamp01(u)) ** 4;
export const easeInOutSine = (u: number): number =>
    -(Math.cos(Math.PI * clamp01(u)) - 1) / 2;

/** A pop with a small overshoot past 1 before settling, for things that land. */
export function easeOutBack(u: number, s = 1.6): number {
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

export function segmentUnderPointer(angle: number, count: number): number {
    if (count <= 0) return -1;
    const seg = 360 / count;
    return Math.min(count - 1, Math.floor(mod(-angle, 360) / seg));
}

/** A wheel that has never spun rests with its first slice centred under the pointer. */
export const defaultAngle = (count: number): number =>
    count > 0 ? mod(-180 / count, 360) : 0;

/** The spin the wheel's last spin plays, worked out from its seed, so every screen turns it the same way. */
export function planOf(wheel: Wheel): SpinPlan | null {
    const last = wheel.lastSpin;
    if (!last) return null;
    const slices = slicesOf(wheel);
    const winner = slices.findIndex((e) => e.id === last.result);
    if (winner < 0) return null;
    const count = slices.length;
    const seg = 360 / count;
    const rng = mulberry32(deriveSeed(last.seed, 0x5eed));
    const offset = between(rng, 0.2, 0.8);
    const turns = 4 + intBelow(rng, 2);
    const local = (winner + offset) * seg;
    const final = last.from + turns * 360 + mod(-local - last.from, 360);
    const over = Math.min(seg * 0.45, 10) * between(rng, 0.55, 1);
    return {
        count,
        winner,
        from: last.from,
        start: last.from - WINDUP_DEG,
        final,
        over,
        startedAt: last.startedAt,
    };
}

/** The angle `t` ms after the spin starts; in the lead-up the wheel winds back a little. */
export function angleAt(plan: SpinPlan, t: number): number {
    if (t <= -SPIN_LEAD_MS) return plan.from;
    if (t < 0)
        return (
            plan.from -
            WINDUP_DEG * easeInOutSine((t + SPIN_LEAD_MS) / SPIN_LEAD_MS)
        );
    if (t >= SPIN_MS) return plan.final;
    return (
        plan.start + landing(t / SPIN_MS, plan.final - plan.start, plan.over)
    );
}

export function restingAngle(wheel: Wheel): number {
    const plan = planOf(wheel);
    return plan ? mod(plan.final, 360) : defaultAngle(slicesOf(wheel).length);
}

/**
 * A press of Spin: the result is drawn from what is left with the caller's
 * randomness, and the spin starts a little later on the wall clock.
 */
export function spun(
    wheel: Wheel,
    p: { seed: number; pick: (n: number) => number; now: number }
): Wheel | null {
    if (isSpinning(wheel, p.now)) return null;
    const pool = remaining(wheel);
    if (pool.length === 0) return null;
    const index = Math.min(pool.length - 1, Math.max(0, p.pick(pool.length)));
    const result = pool[index];
    const picked =
        wheel.removePicked && !wheel.picked.includes(result.id)
            ? [...wheel.picked, result.id]
            : wheel.picked;
    return {
        ...wheel,
        picked,
        lastSpin: {
            seed: p.seed >>> 0,
            startedAt: p.now + SPIN_LEAD_MS,
            result: result.id,
            from: restingAngle(wheel),
        },
    };
}

/** When a peg passes the pointer, in ms after the spin starts. */
export function tickTimes(plan: SpinPlan): number[] {
    const seg = 360 / plan.count;
    const out: number[] = [];
    let last = Math.floor(angleAt(plan, 0) / seg);
    for (let t = TICK_STEP_MS; t <= SPIN_MS; t += TICK_STEP_MS) {
        const peg = Math.floor(angleAt(plan, t) / seg);
        if (
            peg !== last &&
            (out.length === 0 || t - out.at(-1)! >= TICK_GAP_MS)
        )
            out.push(t);
        last = peg;
    }
    return out;
}

export type Phase = "idle" | "waiting" | "spinning" | "landed";

export type Frame = {
    phase: Phase;
    angle: number;
    /** The slice under the pointer, or -1 on an empty wheel. */
    under: number;
    /** The page opened while the spin could still play, so it shows the turn and the landing. */
    live: boolean;
    /** Ms since the wheel came to rest; negative while it turns. */
    sinceLanding: number;
};

/** What a wheel's page shows at `now`, given when the page opened. */
export function frameAt(wheel: Wheel, now: number, openedAt: number): Frame {
    const plan = planOf(wheel);
    if (!plan) {
        const count = slicesOf(wheel).length;
        const angle = defaultAngle(count);
        return {
            phase: "idle",
            angle,
            under: segmentUnderPointer(angle, count),
            live: false,
            sinceLanding: Infinity,
        };
    }
    const t = now - plan.startedAt;
    const live = openedAt - plan.startedAt < PLAY_WINDOW_MS;
    const angle = live ? angleAt(plan, t) : plan.final;
    const phase: Phase =
        !live || t >= SPIN_MS ? "landed" : t < 0 ? "waiting" : "spinning";
    return {
        phase,
        angle,
        under: segmentUnderPointer(angle, plan.count),
        live,
        sinceLanding: t - SPIN_MS,
    };
}
