import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SPIN_MS,
    coinAt,
    dealSlot,
    dieAt,
    orderLocked,
    orderRowLabel,
    planFor,
    reelAt,
    segmentUnderPointer,
    tickTimes,
    wheelAngleAt,
    type AnimationPlan,
} from "../src/lib/animation-plan";
import { DEFAULT_OPTIONS, computeResult, type Mode } from "../src/lib/modes";
import { hash32 } from "../src/lib/rng";
import type { SpinMeta } from "../src/lib/spin-meta";

const NAMES = ["Mali", "Ben", "Sara", "Joe", "Kai", "Nok", "Ploy"];

function spinOf(
    mode: Mode,
    seed: number,
    entries: string[] = NAMES,
    patch = {}
): SpinMeta {
    const options = { ...DEFAULT_OPTIONS, diceCount: 3, ...patch };
    return {
        v: 1,
        seed,
        startedAt: 1000,
        mode,
        source: "list",
        entries,
        result: computeResult(mode, seed, entries.length, options),
    };
}

const as = <M extends AnimationPlan["mode"]>(plan: AnimationPlan, mode: M) => {
    if (plan.mode !== mode) throw new Error(plan.mode);
    return plan as Extract<AnimationPlan, { mode: M }>;
};

test("two clients planning the same card get the same plan and the same final angle", () => {
    for (let i = 0; i < 50; i++) {
        const meta = spinOf("wheel", hash32(i, 3));
        const onA = planFor(structuredClone(meta));
        const onB = planFor(JSON.parse(JSON.stringify(meta)));
        assert.deepEqual(onA, onB);
        const a = as(onA, "wheel");
        const b = as(onB, "wheel");
        assert.equal(wheelAngleAt(a, SPIN_MS), wheelAngleAt(b, SPIN_MS));
    }
});

test("the wheel always stops with the pointer on the winner, after a small overshoot", () => {
    for (const count of [2, 3, 7, 12, 40, 100]) {
        const entries = Array.from({ length: count }, (_, i) => `e${i}`);
        for (let i = 0; i < 60; i++) {
            const meta = spinOf("wheel", hash32(count, i), entries);
            const plan = as(planFor(meta), "wheel");
            const end = wheelAngleAt(plan, SPIN_MS);
            assert.equal(plan.winner, (meta.result as { index: number }).index);
            assert.equal(segmentUnderPointer(end, count), plan.winner);
            assert.ok(Math.abs(end - (plan.start + plan.turn)) < 1e-9);
            let peak = -Infinity;
            for (let t = 0; t <= SPIN_MS; t += 10)
                peak = Math.max(peak, wheelAngleAt(plan, t));
            assert.ok(peak > end, "it runs past the landing spot");
            assert.ok(peak - end <= 10 + 1e-9, "by a small amount");
            assert.ok(plan.turn >= 4 * 360, "it turns at least 4 times");
        }
    }
});

test("order rows lock top to bottom into the result's order", () => {
    const meta = spinOf("order", 99);
    const plan = as(planFor(meta), "order");
    assert.equal(orderLocked(plan, 0), 0);
    assert.equal(orderLocked(plan, SPIN_MS), NAMES.length);
    const order = (meta.result as { order: number[] }).order;
    order.forEach((entry, row) =>
        assert.equal(orderRowLabel(plan, 99, row, SPIN_MS), NAMES[entry])
    );
    for (let r = 1; r < plan.lockAt.length; r++)
        assert.ok(plan.lockAt[r] > plan.lockAt[r - 1]);
});

test("long orders show the first ten rows", () => {
    const entries = Array.from({ length: 25 }, (_, i) => `p${i}`);
    const plan = as(planFor(spinOf("order", 5, entries)), "order");
    assert.equal(plan.lockAt.length, 10);
    assert.equal(plan.ranked.length, 25);
});

test("groups are dealt round the groups into the result's groups", () => {
    const meta = spinOf("groups", 7, NAMES, { groupsN: 3 });
    const plan = as(planFor(meta), "groups");
    const rebuilt: string[][] = plan.groups.map(() => []);
    plan.dealAt.forEach((_, i) => {
        const { group, slot } = dealSlot(plan, i);
        rebuilt[group][slot] = plan.groups[group][slot];
    });
    assert.deepEqual(rebuilt, plan.groups);
    assert.equal(plan.dealAt.at(-1), SPIN_MS);
});

test("dice tumble and land on the rolled faces by the end of the spin", () => {
    for (let i = 0; i < 40; i++) {
        for (const diceSides of [6, 20] as const) {
            const meta = spinOf("dice", hash32(i, diceSides), [], {
                diceSides,
            });
            const plan = as(planFor(meta), "dice");
            plan.faces.forEach((face, d) => {
                const end = dieAt(plan, d, SPIN_MS);
                assert.equal(end.face, face);
                assert.ok(end.landed);
                assert.equal(end.lift, 0);
                assert.ok(Math.abs(end.rotation) < 8);
                const seq = plan.rolls[d];
                for (let k = 1; k < seq.length; k++)
                    assert.notEqual(seq[k], seq[k - 1]);
                assert.ok(seq.every((f) => f >= 1 && f <= diceSides));
            });
        }
    }
});

test("the coin shows the flipped side when it lands", () => {
    for (let i = 0; i < 60; i++) {
        const meta = spinOf("coin", hash32(i, 11), []);
        const plan = as(planFor(meta), "coin");
        assert.equal(coinAt(plan, SPIN_MS).showing, plan.side);
        assert.equal(coinAt(plan, SPIN_MS * 0.9).lift, 0);
    }
});

test("the warm-up reel stops on the chosen question", () => {
    for (let i = 0; i < 20; i++) {
        const meta = spinOf("warmup", hash32(i, 13), [], {
            lang: i % 2 ? "th" : "en",
        });
        const plan = as(planFor(meta), "warmup");
        const end = reelAt(plan, SPIN_MS);
        assert.equal(plan.reel[Math.round(end)], (meta.result as any).text);
        assert.equal(new Set(plan.reel).size, plan.reel.length);
    }
});

test("ticks are in order, spaced out and inside the spin", () => {
    for (const mode of [
        "wheel",
        "order",
        "groups",
        "dice",
        "coin",
        "warmup",
    ] as const) {
        const ticks = tickTimes(planFor(spinOf(mode, 31)));
        assert.ok(ticks.length > 0, mode);
        for (let i = 1; i < ticks.length; i++)
            assert.ok(ticks[i] - ticks[i - 1] >= 28, mode);
        assert.ok(
            ticks.every((t) => t >= 0 && t <= SPIN_MS),
            mode
        );
    }
});
