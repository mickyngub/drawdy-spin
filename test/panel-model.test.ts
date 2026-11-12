import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ENTRIES, type Entry } from "../src/lib/entries";
import { panelView } from "../src/lib/panel-model";
import { spun } from "../src/lib/spin-plan";
import { newWheel, SPIN_LEAD_MS, SPIN_MS, type Wheel } from "../src/lib/wheel";

const NOW = Date.UTC(2026, 10, 12, 14, 0, 0);
const LANDED = NOW + SPIN_LEAD_MS + SPIN_MS;
const entries = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => ({ id: `e${i}`, text: `Name ${i}` }));
const spin = (w: Wheel, now = NOW, pick = 0) =>
    spun(w, { seed: 1, pick: () => pick, now })!;

test("while the wheel turns, the panel keeps the result to itself", () => {
    const view = panelView(spin(newWheel("w", entries(3))), NOW + 1000);
    assert.equal(view.spinning, true);
    assert.equal(view.status.kind, "spinning");
    assert.ok(view.rows.every((r) => !r.picked));
    assert.equal(view.left, 3);
    assert.equal(view.canSpin, false);
    assert.equal(view.canReset, false);
});

test("once it lands the panel marks the pick and names it", () => {
    const view = panelView(spin(newWheel("w", entries(3))), LANDED);
    assert.deepEqual(
        view.rows.map((r) => r.picked),
        [true, false, false]
    );
    assert.deepEqual(view.status, { kind: "picked", text: "Name 0" });
    assert.equal(view.left, 2);
    assert.equal(view.canSpin, true);
    assert.equal(view.canReset, true);
});

test("when everyone has been picked, Spin waits for a Reset", () => {
    const view = panelView(spin(newWheel("w", entries(1))), LANDED);
    assert.equal(view.status.kind, "all-picked");
    assert.equal(view.canSpin, false);
    assert.equal(view.canReset, true);
});

test("an empty wheel asks for entries and a full one stops taking them", () => {
    assert.equal(panelView(newWheel("w", []), NOW).status.kind, "empty");
    assert.equal(panelView(newWheel("w", []), NOW).canSpin, false);
    assert.equal(
        panelView(newWheel("w", entries(MAX_ENTRIES)), NOW).full,
        true
    );
});
