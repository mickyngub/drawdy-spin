import assert from "node:assert/strict";
import { test } from "node:test";
import { SPIN_MS } from "../src/lib/animation-plan";
import {
    FADE_MS,
    FALLBACK_JITTER_MS,
    FALLBACK_MS,
    HOLD_MS,
    JOIN_WINDOW_MS,
    arrival,
} from "../src/lib/reveal";

const START = 1_000_000;

test("the spinner animates at once and reveals its card when the result has landed", () => {
    const a = arrival({
        startedAt: START,
        now: START + 20,
        opacity: 0,
        mine: true,
    });
    assert.equal(a.animate, true);
    assert.equal(a.localStart, START);
    assert.equal(a.revealAt, START + SPIN_MS + HOLD_MS);
    assert.equal(a.removeAt, START + SPIN_MS + HOLD_MS + FADE_MS);
    assert.equal(a.fallbackAt, null);
    assert.ok(a.revealAt < START + FALLBACK_MS, "before anyone else steps in");
});

test("a collaborator who sees the card in time joins the same timeline and only checks the reveal later", () => {
    const a = arrival({
        startedAt: START,
        now: START + 900,
        opacity: 0,
        mine: false,
        jitter: 250,
    });
    assert.equal(a.animate, true);
    assert.equal(
        a.localStart,
        START,
        "it lands at the same moment as the spinner"
    );
    assert.equal(a.revealAt, null);
    assert.equal(a.fallbackAt, START + FALLBACK_MS + 250);
});

test("the join window ends 2.5 s after the start", () => {
    const at = (elapsed: number) =>
        arrival({
            startedAt: START,
            now: START + elapsed,
            opacity: 0,
            mine: false,
        });
    assert.equal(at(JOIN_WINDOW_MS).animate, true);
    assert.equal(at(JOIN_WINDOW_MS + 1).animate, false);
    assert.equal(at(JOIN_WINDOW_MS + 1).removeAt, null);
});

test("a late joiner sees only the card, and reveals a card still hidden after the fallback time", () => {
    const now = START + 60_000;
    const a = arrival({
        startedAt: START,
        now,
        opacity: 0,
        mine: false,
        jitter: 0,
    });
    assert.equal(a.animate, false);
    assert.equal(a.fallbackAt, now);
    const visible = arrival({ startedAt: START, now, opacity: 1, mine: false });
    assert.equal(visible.animate, false);
    assert.equal(visible.fallbackAt, null);
    assert.equal(visible.revealAt, null);
});

test("a clock running behind the spinner's starts the animation now instead of waiting", () => {
    const now = START - 1500;
    const a = arrival({ startedAt: START, now, opacity: 0, mine: false });
    assert.equal(a.animate, true);
    assert.equal(a.localStart, now);
    const far = arrival({
        startedAt: START,
        now: START - 9000,
        opacity: 0,
        mine: false,
    });
    assert.equal(far.animate, false);
    assert.equal(far.fallbackAt, START + FALLBACK_MS);
});

test("the fallback jitter is bounded", () => {
    const a = arrival({
        startedAt: START,
        now: START,
        opacity: 0,
        mine: false,
        jitter: 99_999,
    });
    assert.equal(a.fallbackAt, START + FALLBACK_MS + FALLBACK_JITTER_MS);
});
