import assert from "node:assert/strict";
import { test } from "node:test";
import type { Entry } from "../src/lib/entries";
import {
    angleAt,
    defaultAngle,
    frameAt,
    planOf,
    restingAngle,
    segmentUnderPointer,
    spun,
    tickTimes,
    WINDUP_DEG,
} from "../src/lib/spin-plan";
import {
    mod,
    newWheel,
    PLAY_WINDOW_MS,
    readWheel,
    slicesOf,
    SPIN_LEAD_MS,
    SPIN_MS,
    toMeta,
    type Wheel,
} from "../src/lib/wheel";

const NOW = Date.UTC(2026, 10, 12, 14, 0, 0);
const entries = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => ({ id: `e${i}`, text: `Name ${i}` }));

function spinOf(n: number, seed: number, pick: number): Wheel {
    const w = spun(newWheel("w", entries(n)), {
        seed,
        pick: () => pick,
        now: NOW,
    });
    if (!w) throw new Error("no spin");
    return w;
}

/** What a second screen reads off the board: the same meta, parsed again. */
const otherScreen = (w: Wheel): Wheel =>
    readWheel(JSON.parse(JSON.stringify(toMeta(w))))!;

test("the same seed gives the same final angle and slice on two screens, and it is the result", () => {
    for (let n = 1; n <= 20; n++) {
        for (const seed of [0, 1, 7, 99, 123_456, 4_294_967_295]) {
            const pick = seed % n;
            const a = planOf(spinOf(n, seed, pick))!;
            const b = planOf(otherScreen(spinOf(n, seed, pick)))!;
            assert.equal(a.final, b.final);
            assert.equal(a.winner, pick);
            assert.equal(segmentUnderPointer(a.final, n), pick);
            assert.equal(segmentUnderPointer(b.final, n), pick);
        }
    }
});

test("different seeds turn the wheel differently", () => {
    const finals = new Set(
        [1, 2, 3, 4, 5].map((seed) => planOf(spinOf(8, seed, 3))!.final)
    );
    assert.equal(finals.size, 5);
});

test("the wheel winds back before the start, turns at least four times, overshoots and settles on the result", () => {
    const plan = planOf(spinOf(6, 5, 2))!;
    assert.equal(angleAt(plan, -SPIN_LEAD_MS), plan.from);
    assert.equal(angleAt(plan, 0), plan.from - WINDUP_DEG);
    assert.ok(angleAt(plan, -SPIN_LEAD_MS / 2) < plan.from);
    assert.ok(plan.final - plan.from >= 4 * 360);
    assert.equal(angleAt(plan, SPIN_MS), plan.final);
    assert.equal(angleAt(plan, SPIN_MS + 60_000), plan.final);
    let peak = -Infinity;
    for (let t = 0; t <= SPIN_MS; t += 10)
        peak = Math.max(peak, angleAt(plan, t));
    assert.ok(peak > plan.final, "it runs a little past before settling");
    let last = angleAt(plan, 0);
    for (let t = 10; t <= SPIN_MS * 0.8; t += 10) {
        const now = angleAt(plan, t);
        assert.ok(now >= last, "it keeps turning forward until the overshoot");
        last = now;
    }
});

test("the next spin starts where the last one came to rest", () => {
    const first = spinOf(5, 9, 1);
    const second = spun(first, {
        seed: 10,
        pick: () => 0,
        now: NOW + 10_000,
    })!;
    assert.equal(planOf(second)!.from, mod(planOf(first)!.final, 360));
    assert.equal(restingAngle(first), mod(planOf(first)!.final, 360));
});

test("a wheel that never spun rests with its first slice centred under the pointer", () => {
    const w = newWheel("w", entries(4));
    assert.equal(restingAngle(w), defaultAngle(4));
    assert.equal(segmentUnderPointer(defaultAngle(4), 4), 0);
    const f = frameAt(w, NOW, NOW);
    assert.equal(f.phase, "idle");
    assert.equal(f.under, 0);
    assert.equal(frameAt(newWheel("w", []), NOW, NOW).under, -1);
});

test("a screen that opens the board well after a spin shows the landed wheel, without the turn or the celebration", () => {
    const w = spinOf(8, 3, 5);
    const plan = planOf(w)!;
    const late = plan.startedAt + 60_000;
    const f = frameAt(w, late, late);
    assert.equal(f.phase, "landed");
    assert.equal(f.live, false);
    assert.equal(f.angle, plan.final);
    assert.equal(slicesOf(w)[f.under].id, "e5");
});

test("a screen that opens mid-spin joins it on the wall clock and lands with everyone", () => {
    const w = spinOf(8, 3, 5);
    const { startedAt, final } = planOf(w)!;
    const opened = startedAt + 1500;
    const mid = frameAt(w, startedAt + 2000, opened);
    assert.equal(mid.live, true);
    assert.equal(mid.phase, "spinning");
    assert.equal(mid.angle, angleAt(planOf(w)!, 2000));
    const landed = frameAt(w, startedAt + SPIN_MS + 100, opened);
    assert.equal(landed.phase, "landed");
    assert.equal(landed.angle, final);
    assert.equal(landed.sinceLanding, 100);
    assert.equal(frameAt(w, startedAt - 100, startedAt - 300).phase, "waiting");
    assert.equal(
        frameAt(w, startedAt + PLAY_WINDOW_MS, startedAt + PLAY_WINDOW_MS).live,
        false
    );
});

test("ticks fall in order inside the spin, about one per slice passing the pointer", () => {
    const plan = planOf(spinOf(10, 77, 4))!;
    const ticks = tickTimes(plan);
    assert.ok(ticks.length >= 30);
    assert.ok(
        ticks.every(
            (t, i) => t > 0 && t <= SPIN_MS && (i === 0 || t > ticks[i - 1])
        )
    );
});
