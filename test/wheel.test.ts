import assert from "node:assert/strict";
import { test } from "node:test";
import type { Entry } from "../src/lib/entries";
import { restingAngle, spun } from "../src/lib/spin-plan";
import {
    canReset,
    edited,
    isSpinning,
    newWheel,
    readWheel,
    remaining,
    reset,
    slicesOf,
    SPIN_LEAD_MS,
    SPIN_MS,
    toMeta,
    type Wheel,
} from "../src/lib/wheel";

const NOW = Date.UTC(2026, 10, 12, 14, 0, 0);
const entries = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => ({ id: `e${i}`, text: `Name ${i}` }));

function spinAt(w: Wheel, now: number, pick = 0): Wheel {
    const next = spun(w, { seed: 42 + now, pick: () => pick, now });
    if (!next) throw new Error("the wheel did not spin");
    return next;
}

test("a wheel survives the trip through meta, and a 1.0.0 card is not a wheel", () => {
    const w = spinAt(newWheel("w", entries(4)), NOW);
    assert.deepEqual(readWheel(JSON.parse(JSON.stringify(toMeta(w)))), w);
    assert.equal(readWheel({ v: 1, seed: 1, mode: "wheel" }), null);
    assert.equal(readWheel(null), null);
});

test("stored picks and a last spin that name entries no longer there are dropped", () => {
    const read = readWheel({
        v: 2,
        wheelId: "w",
        entries: entries(2),
        picked: ["e0", "gone", "e0"],
        removePicked: true,
        lastSpin: { seed: 1, startedAt: NOW, result: "gone", from: 0 },
    });
    assert.deepEqual(read?.picked, ["e0"]);
    assert.equal(read?.lastSpin, undefined);
});

test("with Remove picked on, a spin lands only on entries not picked yet and adds its result to the picks", () => {
    let w = newWheel("w", entries(3));
    w = spinAt(w, NOW);
    assert.equal(w.lastSpin?.result, "e0");
    assert.deepEqual(w.picked, ["e0"]);
    assert.deepEqual(
        remaining(w).map((e) => e.id),
        ["e1", "e2"]
    );
    w = spinAt(w, NOW + SPIN_LEAD_MS + SPIN_MS, 1);
    assert.equal(w.lastSpin?.result, "e2");
    assert.deepEqual(w.picked, ["e0", "e2"]);
});

test("with Remove picked off, every entry stays in play and nothing is marked picked", () => {
    let w = newWheel("w", entries(3), false);
    w = spinAt(w, NOW);
    w = spinAt(w, NOW + 10_000);
    assert.deepEqual(w.picked, []);
    assert.equal(remaining(w).length, 3);
});

test("a spin starts a little after the press and from where the wheel rests", () => {
    const first = spinAt(newWheel("w", entries(5)), NOW);
    assert.equal(first.lastSpin?.startedAt, NOW + SPIN_LEAD_MS);
    const second = spinAt(first, NOW + 10_000, 1);
    assert.equal(second.lastSpin?.from, restingAngle(first));
});

test("a wheel can't be spun again until it lands, nor when nothing is left", () => {
    const w = spinAt(newWheel("w", entries(1)), NOW);
    assert.ok(isSpinning(w, NOW + SPIN_LEAD_MS + SPIN_MS - 1));
    assert.equal(spun(w, { seed: 1, pick: () => 0, now: NOW + 100 }), null);
    assert.equal(remaining(w).length, 0);
    assert.equal(spun(w, { seed: 1, pick: () => 0, now: NOW + 60_000 }), null);
});

test("the slices drawn for a spin keep its result, while earlier picks leave the wheel", () => {
    let w = newWheel("w", entries(4));
    w = spinAt(w, NOW);
    w = spinAt(w, NOW + 10_000);
    assert.equal(w.lastSpin?.result, "e1");
    assert.deepEqual(
        slicesOf(w).map((e) => e.id),
        ["e1", "e2", "e3"]
    );
    assert.equal(slicesOf({ ...w, removePicked: false }).length, 4);
});

test("Reset brings everyone back and clears the last spin", () => {
    const w = spinAt(newWheel("w", entries(3)), NOW);
    assert.ok(canReset(w));
    const fresh = reset(w);
    assert.deepEqual(fresh.picked, []);
    assert.equal(fresh.lastSpin, undefined);
    assert.equal(canReset(fresh), false);
});

test("editing entries drops the picks of deleted entries, and the last spin if its result was deleted", () => {
    const w = spinAt(newWheel("w", entries(3)), NOW);
    const kept = edited(w, entries(3).slice(0, 2), true);
    assert.deepEqual(kept.picked, ["e0"]);
    assert.equal(kept.lastSpin?.result, "e0");
    const gone = edited(w, entries(3).slice(1), false);
    assert.deepEqual(gone.picked, []);
    assert.equal(gone.lastSpin, undefined);
    assert.equal(gone.removePicked, false);
});
