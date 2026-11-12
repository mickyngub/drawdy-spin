import assert from "node:assert/strict";
import { test } from "node:test";
import type { Entry } from "../src/lib/entries";
import {
    isFlipped,
    labelKind,
    labelLayout,
    textRotation,
} from "../src/lib/labels";
import { planOf, spun } from "../src/lib/spin-plan";
import { mod, newWheel, type Wheel } from "../src/lib/wheel";

const NOW = Date.UTC(2026, 10, 12, 14, 0, 0);
const entries = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => ({ id: `e${i}`, text: `Name ${i}` }));

test("rim labels flip only when their slice points below the horizontal", () => {
    for (const mid of [91, 135, 180, 225, 269.9, -180, 540])
        assert.equal(isFlipped("arc", mid), true, `mid ${mid}`);
    for (const mid of [0, 45, 89.9, 90, 270, 271, 315, 359.9, 360, -45, 450])
        assert.equal(isFlipped("arc", mid), false, `mid ${mid}`);
});

test("radial labels flip only when their slice points into the left half", () => {
    for (const mid of [180.1, 225, 270, 315, 359.9, -90])
        assert.equal(isFlipped("radial", mid), true, `mid ${mid}`);
    for (const mid of [0, 45, 90, 135, 180, 360, -180, 540])
        assert.equal(isFlipped("radial", mid), false, `mid ${mid}`);
});

test("a flip turns the text half round", () => {
    assert.equal(textRotation("arc", 180, false), 180);
    assert.equal(textRotation("arc", 180, true), 0);
    assert.equal(textRotation("radial", 270, false), 180);
    assert.equal(textRotation("radial", 270, true), 0);
});

const upright = (wheel: Wheel) =>
    labelLayout(wheel).every((l) => Math.abs(l.rotation) <= 90);

test("every label on a 6-entry and a 15-entry wheel reads upright, at rest and wherever a spin lands", () => {
    assert.equal(labelKind(6), "arc");
    assert.equal(labelKind(15), "radial");
    for (const n of [6, 15]) {
        const idle = newWheel("w", entries(n));
        assert.equal(labelLayout(idle).length, n);
        assert.ok(upright(idle), `idle ${n}`);
        for (let seed = 0; seed < 40; seed++) {
            const landed = spun(idle, {
                seed,
                pick: (k) => seed % k,
                now: NOW,
            })!;
            assert.ok(upright(landed), `${n} entries, seed ${seed}`);
        }
    }
});

test("labels take the orientation of where the spin comes to rest, for its whole turn", () => {
    const landed = spun(newWheel("w", entries(8)), {
        seed: 3,
        pick: () => 5,
        now: NOW,
    })!;
    const rest = mod(planOf(landed)!.final, 360);
    const seg = 360 / 8;
    labelLayout(landed).forEach((label, i) => {
        assert.ok(
            Math.abs(label.mid - mod(rest + (i + 0.5) * seg, 360)) < 1e-9
        );
        assert.equal(label.flipped, isFlipped("arc", label.mid));
    });
});

test("a lone slice's name sits under the hub, the right way up", () => {
    const [label] = labelLayout(newWheel("w", entries(1)));
    assert.equal(label.mid, 180);
    assert.equal(label.flipped, true);
    assert.equal(label.rotation, 0);
});
