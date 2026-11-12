import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MAX_ENTRIES,
    MAX_PHOTO,
    PHOTO_PREFIX,
    type Entry,
} from "../src/lib/entries";
import { spun } from "../src/lib/spin-plan";
import { newWheel, toMeta, type Wheel } from "../src/lib/wheel";
import {
    buttonAt,
    buttonRect,
    faceDoc,
    planReplacement,
    WIDGET_SIZE,
    widgetElement,
    type Placed,
} from "../src/lib/widget";
import {
    bakedOf,
    buttonIdsOf,
    DRIVER_ID,
    srcDocOf,
    type Stored,
} from "./helpers";

const NOW = Date.UTC(2026, 10, 12, 14, 0, 0);
const RECT = { x: 100, y: 200, ...WIDGET_SIZE };
const entries = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => ({ id: `e${i}`, text: `Name ${i}` }));
const spunWheel = (w: Wheel) => spun(w, { seed: 5, pick: () => 0, now: NOW })!;

function stored(el: ReturnType<typeof widgetElement>): Stored {
    const { drawdyElementId, ...rest } = el as Record<string, unknown>;
    return { ...rest, id: drawdyElementId as string, type: "component" };
}

const centre = (r: {
    x: number;
    y: number;
    width: number;
    height: number;
}) => ({
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
});

test("the wheel's page carries its state, with < escaped so no entry can close the script", () => {
    const wheel = spunWheel(
        newWheel("w", [
            { id: "a", text: "</script><b>Mali</b>", emoji: "🦊" },
            { id: "b", text: "Ben" },
        ])
    );
    const doc = faceDoc(wheel);
    assert.equal(doc.match(/<\/script>/g)?.length, 2);
    assert.deepEqual(bakedOf(doc), JSON.parse(JSON.stringify(toMeta(wheel))));
});

test("a wheel of twenty photo entries keeps its page under 150 KB", () => {
    const photo = PHOTO_PREFIX + "A".repeat(MAX_PHOTO - PHOTO_PREFIX.length);
    const full = spunWheel(
        newWheel(
            "w",
            Array.from({ length: MAX_ENTRIES }, (_, i) => ({
                id: `entry-${i}`,
                text: `A fairly long name number ${i}`,
                photo,
            }))
        )
    );
    const bytes = Buffer.byteLength(faceDoc(full), "utf8");
    assert.ok(bytes < 150 * 1024, `the page is ${bytes} bytes`);
});

test("the widget is one 440 x 520 component whose page and meta agree", () => {
    const wheel = newWheel("w", entries(3));
    const el = stored(widgetElement(DRIVER_ID, "el-1", wheel, RECT));
    assert.equal(el.type, "component");
    assert.deepEqual([el.x, el.y, el.width, el.height], [100, 200, 440, 520]);
    assert.deepEqual(el.meta?.[DRIVER_ID], toMeta(wheel));
    assert.deepEqual(bakedOf(srcDocOf(el)), toMeta(wheel));
});

test("the hub always takes a press, and Reset only once there is something to reset", () => {
    const fresh = newWheel("w", entries(3));
    const freshEl = stored(widgetElement(DRIVER_ID, "el-1", fresh, RECT));
    assert.deepEqual(buttonIdsOf(freshEl), [`${DRIVER_ID}:w:spin`]);
    assert.equal(
        buttonAt(RECT, fresh, centre(buttonRect(RECT, "spin"))),
        "spin"
    );
    assert.equal(
        buttonAt(RECT, fresh, centre(buttonRect(RECT, "reset"))),
        null
    );

    const turned = spunWheel(fresh);
    const turnedEl = stored(widgetElement(DRIVER_ID, "el-2", turned, RECT));
    assert.deepEqual(buttonIdsOf(turnedEl), [
        `${DRIVER_ID}:w:spin`,
        `${DRIVER_ID}:w:reset`,
    ]);
    assert.equal(
        buttonAt(RECT, turned, centre(buttonRect(RECT, "reset"))),
        "reset"
    );
});

test("a press on the wheel outside the round hub, or on the drag bar, is not a button", () => {
    const wheel = spunWheel(newWheel("w", entries(3)));
    const hub = buttonRect(RECT, "spin");
    assert.equal(buttonAt(RECT, wheel, { x: hub.x + 2, y: hub.y + 2 }), null);
    assert.equal(
        buttonAt(RECT, wheel, { x: RECT.x + 220, y: RECT.y + 10 }),
        null
    );
    assert.equal(
        buttonAt(RECT, wheel, { x: RECT.x + 220, y: RECT.y + 480 }),
        null
    );
});

test("a resized wheel maps presses through its scale", () => {
    const big = { x: 0, y: 0, width: 880, height: 1040 };
    const wheel = newWheel("w", entries(3));
    assert.equal(buttonAt(big, wheel, centre(buttonRect(big, "spin"))), "spin");
    const el = stored(widgetElement(DRIVER_ID, "el-1", wheel, big));
    const root = el.schema as { styles: { transform?: string } };
    assert.match(root.styles.transform ?? "", /scale\(2, 2\)/);
});

test("a change is a new widget at the same place and size, then the old one and its stacked twins removed", () => {
    const wheel = newWheel("w", entries(3));
    const at = { x: 40, y: 60, width: 500, height: 590 };
    const old: Placed = { el: "old", wheel, rect: at };
    const twin: Placed = { el: "twin", wheel, rect: { ...at } };
    const elsewhere: Placed = {
        el: "copy",
        wheel: newWheel("other", entries(2)),
        rect: { ...at, x: 900 },
    };
    const next = spunWheel(wheel);
    const plan = planReplacement({
        driverId: DRIVER_ID,
        old,
        at,
        others: [twin, elsewhere],
        next,
        newId: "new",
    });
    const el = plan.element as Record<string, unknown>;
    assert.deepEqual([el.x, el.y, el.width, el.height], [40, 60, 500, 590]);
    assert.equal(el.drawdyElementId, "new");
    assert.deepEqual(plan.remove, ["old", "twin"]);
    assert.equal(plan.wheel.wheelId, "w");
});

test("a pasted copy that shares the wheel's id takes a fresh id on its first change", () => {
    const wheel = newWheel("w", entries(3));
    const plan = planReplacement({
        driverId: DRIVER_ID,
        old: { el: "pasted", wheel, rect: RECT },
        at: RECT,
        others: [{ el: "original", wheel, rect: { ...RECT, x: 900 } }],
        next: spunWheel(wheel),
        newId: "new",
    });
    assert.equal(plan.wheel.wheelId, "new");
    assert.deepEqual(plan.remove, ["pasted"]);
});
