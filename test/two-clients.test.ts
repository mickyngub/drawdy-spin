import assert from "node:assert/strict";
import { test } from "node:test";
import { frameAt, planOf } from "../src/lib/spin-plan";
import { readWheel, SPIN_LEAD_MS, SPIN_MS } from "../src/lib/wheel";
import {
    bakedOf,
    client,
    fakeBoard,
    fakeClock,
    lastState,
    onlyWheel,
    onlyWidget,
    openPanel,
    press,
    srcDocOf,
    wheelOf,
    wheels,
    type FakeHost,
} from "./helpers";

const LANDS = SPIN_LEAD_MS + SPIN_MS;

async function pair(skewMs = 0) {
    const clock = fakeClock();
    const board = fakeBoard();
    const a = await client(clock, { board, pick: () => 1 });
    const b = await client(clock, { board, skewMs, pick: () => 0 });
    const settle = () => board.settle();
    const advance = (ms: number) => clock.advance(ms, settle);
    await openPanel(a, settle);
    return { clock, board, a, b, settle, advance };
}

/** Both screens hold exactly one wheel, with the same element, meta and page. */
function sameSingleWheel(a: FakeHost, b: FakeHost) {
    const [wa, wb] = [onlyWidget(a), onlyWidget(b)];
    assert.equal(wa.id, wb.id);
    assert.deepEqual(wa.meta, wb.meta);
    assert.equal(srcDocOf(wa), srcDocOf(wb));
    assert.deepEqual(bakedOf(srcDocOf(wa)), Object.values(wa.meta!)[0]);
}

test("A spins and B ends with exactly one wheel whose last spin matches, and both pages turn it the same way", async () => {
    const { a, b, settle } = await pair();
    await press(a, settle, onlyWidget(a), "spin");
    sameSingleWheel(a, b);
    const spinA = onlyWheel(a).lastSpin!;
    assert.deepEqual(onlyWheel(b).lastSpin, spinA);
    const pageA = readWheel(bakedOf(srcDocOf(onlyWidget(a))))!;
    const pageB = readWheel(bakedOf(srcDocOf(onlyWidget(b))))!;
    for (const t of [500, 2000, 4100]) {
        const now = spinA.startedAt + t;
        assert.deepEqual(
            frameAt(pageA, now, spinA.startedAt - 300),
            frameAt(pageB, now, spinA.startedAt - 200)
        );
    }
    assert.equal(planOf(pageB)!.winner, 1);
});

test("B, who has the extension, can spin A's wheel next, and the picks add up", async () => {
    const { a, b, settle, advance } = await pair();
    await press(a, settle, onlyWidget(a), "spin");
    await advance(LANDS);
    await press(b, settle, onlyWidget(b), "spin");
    sameSingleWheel(a, b);
    const wheel = onlyWheel(a);
    assert.equal(wheel.picked.length, 2);
    assert.equal(wheel.lastSpin?.result, wheel.picked[1]);
});

test("presses that cross on the wire leave two stacked wheels until the next press, which leaves one", async () => {
    const { board, a, b, settle, advance } = await pair();
    board.hold();
    await press(a, settle, onlyWidget(a), "spin");
    await press(b, settle, onlyWidget(b), "spin");
    board.release();
    await settle();
    assert.equal(wheels(a).length, 2);
    assert.equal(wheels(b).length, 2);
    assert.equal(lastState(a)?.count, 1);
    await advance(LANDS);
    await press(a, settle, wheels(a).at(-1)!, "spin");
    sameSingleWheel(a, b);
});

test("a screen that opens the board after the spin sees the same single wheel, already landed", async () => {
    const { clock, board, a, settle, advance } = await pair();
    await press(a, settle, onlyWidget(a), "spin");
    await advance(60_000);
    const late = await client(clock, { board });
    await settle();
    sameSingleWheel(a, late);
    const page = readWheel(bakedOf(srcDocOf(onlyWidget(late))))!;
    const f = frameAt(page, clock.now(), clock.now());
    assert.equal(f.phase, "landed");
    assert.equal(f.live, false);
    assert.equal(f.angle, planOf(page)!.final);
});

test("B's panel stays on its wheel while A's presses replace it", async () => {
    const { a, b, settle, advance } = await pair();
    await openPanel(b, settle);
    const first = onlyWidget(b);
    assert.equal(lastState(b)?.wheel?.el, first.id);
    await press(a, settle, onlyWidget(a), "spin");
    await advance(LANDS);
    assert.equal(lastState(b)?.wheel?.el, onlyWidget(b).id);
    assert.equal(
        lastState(b)?.wheel?.lastSpin?.result,
        onlyWheel(a).lastSpin?.result
    );
    b.message({
        type: "edit",
        el: first.id,
        wheelId: wheelOf(first).wheelId,
        entries: [{ id: "z", text: "Zed" }],
        removePicked: true,
    });
    await settle();
    await advance(1000);
    sameSingleWheel(a, b);
    assert.deepEqual(
        onlyWheel(a).entries.map((e) => e.text),
        ["Zed"]
    );
});
