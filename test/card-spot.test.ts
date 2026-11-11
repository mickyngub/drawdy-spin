import assert from "node:assert/strict";
import { test } from "node:test";
import { bestSpot, spotCandidates } from "../src/lib/card-spot";
import { contains, overlaps } from "../src/lib/free-spot";

const area = { x: 0, y: 0, width: 900, height: 800 };
const card = { x: 330, y: 300, width: 240, height: 200 };

test("an empty view takes the card in its middle", () => {
    assert.deepEqual(bestSpot(card, area, []), card);
});

test("candidates start nearest the middle and never leave the view", () => {
    const spots = spotCandidates(card, area);
    assert.deepEqual(spots[0], card);
    for (const spot of spots) assert.ok(contains(area, spot));
    const distance = (r: typeof card) => Math.hypot(r.x - card.x, r.y - card.y);
    for (let i = 1; i < spots.length; i++)
        assert.ok(distance(spots[i]) >= distance(spots[i - 1]) - 1e-9);
});

test("a taken middle moves the card to the nearest clear spot in view", () => {
    const taken = [{ x: 300, y: 280, width: 300, height: 240 }];
    const spot = bestSpot(card, area, taken);
    assert.ok(contains(area, spot));
    assert.ok(!overlaps(spot, taken[0], 32));
});

test("a full view still keeps the card in view, where it covers least", () => {
    const full = [
        { x: 0, y: 0, width: 900, height: 380 },
        { x: 0, y: 420, width: 900, height: 380 },
    ];
    const spot = bestSpot(card, area, full);
    assert.ok(contains(area, spot));
    const middle = bestSpot(card, area, [
        { x: 0, y: 0, width: 900, height: 800 },
    ]);
    assert.ok(contains(area, middle));
});
