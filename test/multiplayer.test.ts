import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
    SPIN_MS,
    segmentUnderPointer,
    wheelAngleAt,
} from "../src/lib/animation-plan";
import { DEFAULT_OPTIONS, computeResult } from "../src/lib/modes";
import { FADE_MS, FALLBACK_MS, HOLD_MS } from "../src/lib/reveal";
import { createSpin } from "../src/driver";
import {
    boot,
    cards,
    fakeBoard,
    fakeHost,
    overlayConfig,
    type FakeBoard,
} from "./fake-host";

const START = 1_800_000_000_000;
const KEY = "mickyngub.spin";
const NAMES = ["Mali", "Ben", "Sara", "Joe", "Kai"];

function clock(t: TestContext) {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: START });
    return (ms: number) => t.mock.timers.tick(ms);
}

const settle = async (board: FakeBoard) => {
    await board.flush();
    await new Promise((r) => setImmediate(r));
};

const wheel = {
    mode: "wheel",
    source: "people",
    entries: NAMES,
    stickyIds: [],
    options: DEFAULT_OPTIONS,
};

test("client B sees client A's card arrive and plays the same spin, landing on the same name at the same moment", async (t) => {
    const tick = clock(t);
    const board = fakeBoard();
    const a = fakeHost({ board });
    const b = fakeHost({ board });
    const A = await boot(createSpin({ seed: () => 4242, jitter: () => 0 }), a);
    await boot(createSpin({ jitter: () => 0.5 }), b);
    await A.open();
    await A.message({ type: "spin", request: wheel });
    await settle(board);

    const [card] = cards(board);
    assert.equal(card.opacity, 0);
    const [onA] = a.overlays();
    const [onB] = b.overlays();
    assert.ok(onA && onB, "both screens show the spin");
    const configA = overlayConfig(onA);
    const configB = overlayConfig(onB);
    assert.deepEqual(configB.plan, configA.plan);
    assert.equal(configB.localStart, configA.localStart);
    assert.equal(configB.plan.mode, "wheel");
    if (configB.plan.mode !== "wheel") return;
    const { index } = computeResult("wheel", 4242, 5, DEFAULT_OPTIONS) as {
        index: number;
    };
    assert.equal(
        segmentUnderPointer(wheelAngleAt(configB.plan, SPIN_MS), NAMES.length),
        index
    );
    assert.equal(card.meta[KEY].result.index, index);

    tick(SPIN_MS + HOLD_MS);
    await settle(board);
    assert.equal(board.elements.get(card.drawdyElementId)?.opacity, 1);
    assert.equal(a.sentOf("command:scene:update-drawdy-elements").length, 1);

    tick(FALLBACK_MS + 300 - (SPIN_MS + HOLD_MS));
    await settle(board);
    assert.equal(
        b.sentOf("command:scene:get-drawdy-elements").length,
        1,
        "B checked the card"
    );
    assert.equal(
        b.sentOf("command:scene:update-drawdy-elements").length,
        0,
        "and left it, since A had revealed it"
    );

    tick(FADE_MS + 200);
    await settle(board);
    assert.equal(a.overlays().length, 0);
    assert.equal(b.overlays().length, 0);
});

test("a card that reaches a client 1 s late joins the spin part-way, on the spinner's timeline", async (t) => {
    const tick = clock(t);
    const board = fakeBoard();
    const b = fakeHost({ board });
    await boot(createSpin(), b);
    const meta = {
        v: 1,
        seed: 9,
        startedAt: START,
        mode: "coin",
        source: null,
        entries: [],
        result: computeResult("coin", 9, 0, DEFAULT_OPTIONS),
    };
    tick(1000);
    b.receive("subscription:scene:elements-added", [
        {
            drawdyElementId: "c1",
            type: "shape",
            componentType: "sticky-note",
            x: 0,
            y: 0,
            opacity: 0,
            meta: { [KEY]: meta },
        },
    ]);
    await settle(board);
    const [overlay] = b.overlays();
    assert.equal(overlayConfig(overlay).localStart, START);
});

test("a client that joins after the window sees only the card", async (t) => {
    const tick = clock(t);
    const board = fakeBoard();
    const a = fakeHost({ board });
    const A = await boot(createSpin(), a);
    await A.open();
    await A.message({ type: "spin", request: wheel });
    tick(SPIN_MS + HOLD_MS + FADE_MS + 5000);
    await settle(board);
    const [card] = cards(board);
    assert.equal(card.opacity, 1);

    const late = fakeHost({ board });
    await boot(createSpin(), late);
    late.receive("subscription:scene:elements-replaced", [
        ...board.elements.values(),
    ]);
    await settle(board);
    assert.equal(late.overlays().length, 0);
    assert.equal(late.sentOf("command:scene:update-drawdy-elements").length, 0);
});

test("if the spinner never reveals its card, one other client does after 4 s", async (t) => {
    const tick = clock(t);
    const board = fakeBoard();
    const a = fakeHost({
        board,
        denied: ["command:scene:update-drawdy-elements"],
    });
    const b = fakeHost({ board });
    const c = fakeHost({ board });
    const A = await boot(createSpin({ jitter: () => 0 }), a);
    await boot(createSpin({ jitter: () => 0 }), b);
    await boot(createSpin({ jitter: () => 0.9 }), c);
    await A.open();
    await A.message({ type: "spin", request: wheel });
    await settle(board);
    const [card] = cards(board);

    tick(FALLBACK_MS - 1);
    await settle(board);
    assert.equal(board.elements.get(card.drawdyElementId)?.opacity, 0);
    tick(1);
    await settle(board);
    assert.equal(board.elements.get(card.drawdyElementId)?.opacity, 1);
    tick(1000);
    await settle(board);
    assert.equal(b.sentOf("command:scene:update-drawdy-elements").length, 1);
    assert.equal(c.sentOf("command:scene:update-drawdy-elements").length, 0);
});

test("opening the panel later reveals a card stranded at opacity 0, without replaying it", async (t) => {
    const tick = clock(t);
    const board = fakeBoard();
    board.elements.set("old", {
        drawdyElementId: "old",
        type: "shape",
        componentType: "sticky-note",
        x: 0,
        y: 0,
        opacity: 0,
        meta: {
            [KEY]: {
                v: 1,
                seed: 1,
                startedAt: START - 60_000,
                mode: "coin",
                source: null,
                entries: [],
                result: { mode: "coin", side: "heads" },
            },
        },
    });
    const d = fakeHost({ board });
    const D = await boot(createSpin({ jitter: () => 0 }), d);
    await D.open();
    tick(0);
    await settle(board);
    assert.equal(board.elements.get("old")?.opacity, 1);
    assert.equal(d.overlays().length, 0);
});

test("a newer spin replaces the overlay still on screen", async (t) => {
    const tick = clock(t);
    const board = fakeBoard();
    const a = fakeHost({ board });
    const b = fakeHost({ board });
    const A = await boot(createSpin(), a);
    const B = await boot(createSpin(), b);
    await A.open();
    await B.open();
    await A.message({ type: "spin", request: wheel });
    await settle(board);
    tick(1000);
    await B.message({ type: "spin", request: { ...wheel, mode: "order" } });
    await settle(board);
    assert.equal(a.overlays().length, 1);
    assert.equal(overlayConfig(a.overlays()[0]).plan.mode, "order");
    assert.equal(a.removed.length, 1);
});
