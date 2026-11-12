import assert from "node:assert/strict";
import { test } from "node:test";
import { EDIT_DELAY_MS } from "../src/driver";
import { PROMPTS } from "../src/lib/prompts";
import { SPIN_LEAD_MS, SPIN_MS } from "../src/lib/wheel";
import {
    buttonIdsOf,
    DRIVER_ID,
    errors,
    lastState,
    onlyWheel,
    onlyWidget,
    openPanel,
    press,
    rectOf,
    sentOf,
    solo,
    START,
    wheelOf,
    wheels,
    writes,
} from "./helpers";

const LANDS = SPIN_LEAD_MS + SPIN_MS;

async function withWheel(options: Parameters<typeof solo>[0] = {}) {
    const t = await solo(options);
    await openPanel(t.host, t.settle);
    return t;
}

const panelEl = (host: Parameters<typeof lastState>[0]) =>
    lastState(host)?.wheel?.el ?? "";

test("opening the panel on an empty view adds one 440 x 520 wheel of lunch ideas, selected, and the panel edits it", async () => {
    const { host } = await withWheel();
    const el = onlyWidget(host);
    assert.equal(el.type, "component");
    assert.deepEqual([el.width, el.height], [440, 520]);
    const wheel = wheelOf(el);
    assert.equal(wheel.entries.length, 8);
    assert.ok(wheel.entries.every((e) => e.emoji));
    assert.equal(wheel.removePicked, true);
    assert.equal(panelEl(host), el.id);
    const selected = sentOf(host, "command:scene:set-selection").at(-1);
    assert.deepEqual(selected?.req.drawdyElementIds, [el.id]);
});

test("pressing the hub replaces the wheel in place with a spin that starts 400 ms later and lands on a remaining entry", async () => {
    const { host, settle } = await withWheel({ pick: () => 2 });
    const before = onlyWidget(host);
    host.clear();
    await press(host, settle, before, "spin");
    const after = onlyWidget(host);
    assert.notEqual(after.id, before.id);
    assert.deepEqual(rectOf(after), rectOf(before));
    assert.deepEqual(writes(host), ["add", "remove"]);
    const wheel = wheelOf(after);
    assert.equal(wheel.wheelId, wheelOf(before).wheelId);
    assert.equal(wheel.lastSpin?.startedAt, START + SPIN_LEAD_MS);
    assert.equal(wheel.lastSpin?.result, wheel.entries[2].id);
    assert.deepEqual(wheel.picked, [wheel.entries[2].id]);
    assert.ok(
        buttonIdsOf(after).includes(`${DRIVER_ID}:${wheel.wheelId}:reset`)
    );
});

test("a press that drags the wheel by its hub is not a spin", async () => {
    const { host, settle } = await withWheel();
    host.clear();
    await press(host, settle, onlyWidget(host), "spin", 12);
    assert.deepEqual(writes(host), []);
    assert.equal(onlyWheel(host).lastSpin, undefined);
});

test("presses during a spin are ignored, and the next spin skips who was picked", async () => {
    const { host, settle, advance } = await withWheel();
    await press(host, settle, onlyWidget(host), "spin");
    const first = onlyWheel(host).lastSpin!.result;
    host.clear();
    await advance(1000);
    await press(host, settle, onlyWidget(host), "spin");
    await press(host, settle, onlyWidget(host), "reset");
    assert.deepEqual(writes(host), []);
    await advance(LANDS);
    await press(host, settle, onlyWidget(host), "spin");
    const wheel = onlyWheel(host);
    assert.notEqual(wheel.lastSpin!.result, first);
    assert.deepEqual(wheel.picked, [first, wheel.lastSpin!.result]);
});

test("Reset on the board brings everyone back, and when no one is left the hub resets too", async () => {
    const { host, settle, advance } = await withWheel();
    const el = onlyWidget(host);
    host.message({
        type: "edit",
        el: el.id,
        entries: [
            { id: "a", text: "Mali" },
            { id: "b", text: "Ben" },
        ],
        removePicked: true,
    });
    await settle();
    await advance(EDIT_DELAY_MS + 50);
    assert.deepEqual(buttonIdsOf(onlyWidget(host)).length, 1);
    for (let i = 0; i < 2; i++) {
        await press(host, settle, onlyWidget(host), "spin");
        await advance(LANDS);
    }
    assert.deepEqual(onlyWheel(host).picked, ["a", "b"]);
    await press(host, settle, onlyWidget(host), "spin");
    assert.deepEqual(onlyWheel(host).picked, []);
    assert.equal(onlyWheel(host).lastSpin, undefined);

    await press(host, settle, onlyWidget(host), "spin");
    await advance(LANDS);
    await press(host, settle, onlyWidget(host), "reset");
    assert.deepEqual(onlyWheel(host).picked, []);
    assert.equal(onlyWheel(host).lastSpin, undefined);
    assert.deepEqual(buttonIdsOf(onlyWidget(host)).length, 1);
});

test("panel edits wait 600 ms after the last keystroke, then replace the wheel once", async () => {
    const { host, settle, advance } = await withWheel();
    const el = onlyWidget(host);
    host.clear();
    for (const text of ["M", "Ma", "Mal", "Mali"]) {
        host.message({
            type: "edit",
            el: el.id,
            entries: [
                { id: "a", text },
                { id: "b", text: "Ben" },
            ],
            removePicked: true,
        });
        await settle();
        await advance(200);
    }
    assert.deepEqual(writes(host), []);
    assert.equal(lastState(host)?.wheel?.entries[0].text, "Mali");
    await advance(EDIT_DELAY_MS);
    assert.deepEqual(writes(host), ["add", "remove"]);
    assert.deepEqual(
        onlyWheel(host).entries.map((e) => e.text),
        ["Mali", "Ben"]
    );
});

test("an edit sent while the wheel turns waits until it lands, so no one sees a spin change course", async () => {
    const { host, settle, advance } = await withWheel();
    await press(host, settle, onlyWidget(host), "spin");
    const spinning = onlyWidget(host);
    host.clear();
    host.message({
        type: "edit",
        el: spinning.id,
        entries: wheelOf(spinning).entries.slice(0, 5),
        removePicked: true,
    });
    await settle();
    await advance(EDIT_DELAY_MS + 100);
    assert.deepEqual(writes(host), []);
    await advance(LANDS);
    assert.deepEqual(writes(host), ["add", "remove"]);
    assert.equal(onlyWheel(host).entries.length, 5);
    assert.equal(
        onlyWheel(host).lastSpin?.result,
        wheelOf(spinning).lastSpin?.result
    );
});

test("Spin from the panel takes a waiting edit with it in the same replacement", async () => {
    const { host, settle } = await withWheel();
    const el = onlyWidget(host);
    host.clear();
    host.message({
        type: "edit",
        el: el.id,
        entries: [
            { id: "x", text: "Only" },
            { id: "y", text: "Two" },
        ],
        removePicked: false,
    });
    host.message({ type: "spin", el: el.id });
    await settle();
    assert.deepEqual(writes(host), ["add", "remove"]);
    const wheel = onlyWheel(host);
    assert.deepEqual(
        wheel.entries.map((e) => e.id),
        ["x", "y"]
    );
    assert.equal(wheel.removePicked, false);
    assert.deepEqual(wheel.picked, []);
    assert.equal(wheel.lastSpin?.result, "x");
});

test("People here fills the wheel with who has the board open, and says so when you are alone", async () => {
    const { host, settle } = await withWheel({
        users: [{ name: "Sara" }, { name: "Ben" }, { name: "Mali" }],
    });
    host.message({ type: "preset", el: onlyWidget(host).id, preset: "people" });
    await settle();
    assert.deepEqual(
        onlyWheel(host).entries.map((e) => e.text),
        ["Ben", "Mali", "Sara"]
    );

    const alone = await withWheel({ users: [{ name: "Me" }] });
    const before = onlyWheel(alone.host);
    alone.host.message({
        type: "preset",
        el: onlyWidget(alone.host).id,
        preset: "people",
    });
    await alone.settle();
    assert.deepEqual(errors(alone.host), ["alone"]);
    assert.deepEqual(onlyWheel(alone.host), before);

    const blocked = await withWheel({ denied: ["command:collaboration"] });
    blocked.host.message({
        type: "preset",
        el: onlyWidget(blocked.host).id,
        preset: "people",
    });
    await blocked.settle();
    assert.deepEqual(errors(blocked.host), ["people-blocked"]);
});

test("a preset replaces the entries at once and clears the picks", async () => {
    const { host, settle, advance } = await withWheel();
    await press(host, settle, onlyWidget(host), "spin");
    await advance(LANDS);
    host.message({
        type: "preset",
        el: onlyWidget(host).id,
        preset: "warmup-th",
    });
    await settle();
    const wheel = onlyWheel(host);
    assert.equal(wheel.entries.length, 8);
    assert.ok(wheel.entries.every((e) => PROMPTS.th.includes(e.text)));
    assert.deepEqual(wheel.picked, []);
    assert.equal(wheel.lastSpin, undefined);
});

test("Duplicate adds a second wheel beside the first with the same entries, its own id and no picks", async () => {
    const { host, settle, advance } = await withWheel();
    await press(host, settle, onlyWidget(host), "spin");
    await advance(LANDS);
    const original = onlyWidget(host);
    host.message({ type: "duplicate", el: original.id });
    await settle();
    const all = wheels(host);
    assert.equal(all.length, 2);
    const copy = all.find((w) => w.id !== original.id)!;
    assert.ok((copy.x as number) >= (original.x as number) + 440);
    assert.deepEqual(wheelOf(copy).entries, wheelOf(original).entries);
    assert.notEqual(wheelOf(copy).wheelId, wheelOf(original).wheelId);
    assert.deepEqual(wheelOf(copy).picked, []);
    assert.equal(lastState(host)?.wheel?.el, copy.id);
    assert.equal(lastState(host)?.count, 2);
});

test("New wheel adds another, and the panel follows the selected wheel", async () => {
    const { host, settle } = await withWheel();
    const first = onlyWidget(host);
    host.message({ type: "new" });
    await settle();
    assert.equal(wheels(host).length, 2);
    host.select([first.id]);
    await settle();
    assert.equal(lastState(host)?.wheel?.el, first.id);
});

test("with the tick sound on, the screen that spins gets the ticks, timed to the spin", async () => {
    const { host, settle } = await withWheel();
    host.message({ type: "sound", on: true });
    await settle();
    assert.deepEqual(host.kv.get("prefs"), { sound: true });
    await press(host, settle, onlyWidget(host), "spin");
    const spun = host.posted.filter((m) => m.type === "spun");
    assert.equal(spun.length, 1);
    assert.equal(spun[0].startedAt, START + SPIN_LEAD_MS);
    assert.ok(spun[0].ticks.length > 10);

    const quiet = await withWheel();
    await press(quiet.host, quiet.settle, onlyWidget(quiet.host), "spin");
    assert.equal(quiet.host.posted.filter((m) => m.type === "spun").length, 0);
});

test("a wheel someone resized keeps its size through a spin", async () => {
    const { host, settle } = await withWheel();
    const el = onlyWidget(host);
    host.restore({ ...el, width: 660, height: 780 });
    await settle();
    await press(host, settle, onlyWidget(host), "spin");
    const after = onlyWidget(host);
    assert.deepEqual([after.width, after.height], [660, 780]);
    assert.match(
        String(
            (after.schema as { styles: { transform?: string } }).styles
                .transform
        ),
        /scale\(1\.5, 1\.5\)/
    );
});

test("a board without the scene permission gets a notice instead of a wheel", async () => {
    const { host } = await withWheel({ denied: ["command:scene:add"] });
    assert.equal(wheels(host).length, 0);
    assert.deepEqual(errors(host), ["denied"]);
    assert.equal(lastState(host)?.wheel, null);
});
