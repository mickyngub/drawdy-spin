import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { SPIN_MS, planFor } from "../src/lib/animation-plan";
import { DEFAULT_OPTIONS, computeResult } from "../src/lib/modes";
import { FADE_MS, HOLD_MS } from "../src/lib/reveal";
import { createSpin } from "../src/driver";
import { DEFAULT_SETTINGS } from "../src/shared/messages";
import { boot, fakeHost, overlayConfig, type FakeHost } from "./fake-host";

const START = 1_800_000_000_000;
const KEY = "mickyngub.spin";
const settle = async (host: FakeHost) => {
    await host.board.flush();
    await new Promise((r) => setImmediate(r));
};

function clock(t: TestContext) {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: START });
    return (ms: number) => t.mock.timers.tick(ms);
}

const request = (patch: Record<string, unknown> = {}) => ({
    mode: "wheel",
    source: "list",
    entries: ["Mali", "Ben", "Sara", "Joe"],
    stickyIds: [],
    options: DEFAULT_OPTIONS,
    ...patch,
});

test("activation adds the rail button and watches for cards without asking for people, storage or the selection", async () => {
    const host = fakeHost();
    await boot(createSpin(), host);
    const types = host.types();
    assert.ok(types.includes("command:dom:create-action-button"));
    const added = host.sentOf("subscription:scene:elements-added")[0];
    assert.deepEqual(added.req.properties, ["meta", "opacity"]);
    assert.ok(types.includes("subscription:scene:elements-replaced"));
    for (const prefix of [
        "command:collaboration",
        "subscription:collaboration",
        "command:kv-storage",
        "subscription:scene:drawdy-element-selection",
    ])
        assert.ok(!types.some((t) => t.startsWith(prefix)), prefix);
});

test("the rail button opens a themed panel that is destroyed when closed", async () => {
    const host = fakeHost();
    const { click } = await boot(createSpin(), host, {
        theme: "light",
        tokens: { "--dd-surface-panel": "#fff" },
    });
    await click();
    const [created] = host.sentOf("command:webview:create");
    assert.equal(created.req.keepStateWhenClosed, false);
    assert.ok(!created.req.htmlContent.includes("/*__DRAWDY_STYLING__*/"));
    assert.ok(created.req.htmlContent.includes("--dd-surface-panel: #fff;"));
});

test("the panel gets the saved settings, cleaned, and saves changes back", async () => {
    const empty = fakeHost();
    await (await boot(createSpin(), empty)).open();
    assert.deepEqual(empty.postedOf("init")[0], {
        type: "init",
        settings: null,
    });

    const host = fakeHost({
        kv: { settings: { mode: "coin", list: "A\nB", bogus: 1 } },
    });
    const { open, message } = await boot(createSpin(), host);
    await open();
    const init = host.postedOf("init")[0];
    assert.equal(init.settings.mode, "coin");
    assert.equal(init.settings.list, "A\nB");
    assert.ok(!("bogus" in init.settings));

    await message({
        type: "save",
        settings: { ...DEFAULT_SETTINGS, mode: "dice", sound: true },
    });
    assert.equal((host.kv.get("settings") as any).mode, "dice");
    assert.equal((host.kv.get("settings") as any).sound, true);
});

test("people come from presence when asked, sorted with repeated names numbered, and update when someone joins", async () => {
    const host = fakeHost({
        users: [{ name: "Sara" }, { name: "ben" }, { name: "Sara" }],
    });
    const { open, message } = await boot(createSpin(), host);
    await open();
    await message({ type: "people" });
    assert.deepEqual(host.postedOf("people")[0], {
        type: "people",
        status: "ok",
        names: ["ben", "Sara", "Sara (2)"],
    });
    assert.equal(
        host.sentOf("subscription:collaboration:presence-changed").length,
        1
    );
    const user = (name: string) => ({
        id: name,
        name,
        color: "#000",
        isHost: false,
        isSelf: false,
        cursorPosition: { x: 1, y: 2 },
    });
    host.event("subscription:collaboration:presence-changed", {
        users: [user("Sara"), user("ben"), user("Sara")],
    });
    await settle(host);
    assert.equal(
        host.postedOf("people").length,
        1,
        "a cursor move changes nothing"
    );
    host.event("subscription:collaboration:presence-changed", {
        users: [user("Sara"), user("ben"), user("Sara"), user("Kai")],
    });
    await settle(host);
    assert.deepEqual(host.postedOf("people")[1].names, [
        "ben",
        "Kai",
        "Sara",
        "Sara (2)",
    ]);
});

test("people show as blocked when the collaboration permission is denied", async () => {
    const host = fakeHost({ denied: ["command:collaboration"] });
    const { open, message } = await boot(createSpin(), host);
    await open();
    await message({ type: "people" });
    assert.deepEqual(host.postedOf("people")[0], {
        type: "people",
        status: "blocked",
        names: [],
    });
});

test("the selected stickies are sent with their first lines, in selection order, leaving out other elements", async () => {
    const host = fakeHost({ selection: ["s2", "shape", "s1", "blank"] });
    const sticky = (id: string, text: string) => ({
        drawdyElementId: id,
        type: "shape",
        componentType: "sticky-note",
        x: 0,
        y: 0,
        text,
    });
    host.board.elements.set("s1", sticky("s1", "Pricing page\ndetails"));
    host.board.elements.set("s2", sticky("s2", "\nOnboarding"));
    host.board.elements.set("blank", sticky("blank", "  "));
    host.board.elements.set("shape", {
        drawdyElementId: "shape",
        type: "shape",
        componentType: "rect",
        x: 0,
        y: 0,
        text: "A box",
    });
    const { open, message } = await boot(createSpin(), host);
    await open();
    assert.equal(
        host.sentOf("subscription:scene:drawdy-element-selection").length,
        0,
        "only once the stickies source is used"
    );
    await message({ type: "stickies" });
    assert.deepEqual(host.postedOf("stickies")[0].items, [
        { id: "s2", label: "Onboarding" },
        { id: "s1", label: "Pricing page" },
    ]);
    host.event("subscription:scene:drawdy-element-selection", {
        drawdyElementIds: ["s1"],
    });
    await settle(host);
    assert.deepEqual(host.postedOf("stickies")[1].items, [
        { id: "s1", label: "Pricing page" },
    ]);
});

test("a wheel spin adds one hidden sticky-note card centred left of the panel and plays a click-through overlay", async (t) => {
    const tick = clock(t);
    const viewport = { x: 100, y: -200, width: 1600, height: 1000 };
    const host = fakeHost({ viewport });
    const { open, message } = await boot(
        createSpin({ seed: () => 777, jitter: () => 0 }),
        host
    );
    await open();
    await message({ type: "spin", request: request() });

    const adds = host.sentOf("command:scene:add-drawdy-elements");
    assert.equal(adds.length, 1);
    const [card] = adds[0].req.elements;
    assert.equal(card.type, "shape");
    assert.equal(card.componentType, "sticky-note");
    assert.equal(card.opacity, 0);
    const spin = card.meta[KEY];
    assert.equal(spin.v, 1);
    assert.equal(spin.seed, 777);
    assert.equal(spin.startedAt, START);
    assert.equal(spin.mode, "wheel");
    assert.equal(spin.source, "list");
    assert.deepEqual(spin.entries, ["Mali", "Ben", "Sara", "Joe"]);
    assert.deepEqual(
        spin.result,
        computeResult("wheel", 777, 4, DEFAULT_OPTIONS)
    );
    const drawerLeft = viewport.x + viewport.width - 336 - 16;
    assert.ok(
        Math.abs(card.x + card.width / 2 - (viewport.x + drawerLeft) / 2) <= 1
    );
    assert.ok(
        Math.abs(
            card.y + card.height / 2 - (viewport.y + viewport.height / 2)
        ) <= 1
    );

    const spun = host.postedOf("spun")[0];
    assert.equal(spun.cardId, card.drawdyElementId);
    assert.deepEqual(spun.plan, planFor(spin));

    const overlays = host.overlays();
    assert.equal(overlays.length, 1);
    const [overlay] = overlays;
    assert.equal(overlay.asPopover, false);
    assert.equal(overlay.schema.type, "iframe");
    assert.equal(overlay.schema.styles.pointerEvents, "none");
    const config = overlayConfig(overlay);
    assert.deepEqual(config.plan, planFor(spin));
    assert.equal(config.localStart, START);
    assert.equal(config.theme, "dark");
    assert.ok(
        overlay.position.x + overlay.schema.styles.width[0] <
            viewport.width - 336,
        "the overlay stays left of the panel"
    );

    tick(SPIN_MS + HOLD_MS - 1);
    await settle(host);
    assert.equal(host.board.elements.get(card.drawdyElementId)?.opacity, 0);
    tick(1);
    await settle(host);
    assert.equal(host.board.elements.get(card.drawdyElementId)?.opacity, 1);
    assert.equal(
        host.sentOf("command:scene:update-drawdy-elements").length,
        1,
        "one update reveals it"
    );
    assert.deepEqual(host.postedOf("landed"), [
        { type: "landed", cardId: card.drawdyElementId },
    ]);
    assert.equal(host.sentOf("command:scene:set-selection").length, 0);

    tick(FADE_MS + 200);
    await settle(host);
    assert.equal(host.overlays().length, 0);
});

test("the spinner's own echo of the card does not start a second overlay", async (t) => {
    clock(t);
    const host = fakeHost();
    const { open, message } = await boot(createSpin(), host);
    await open();
    await message({ type: "spin", request: request() });
    await settle(host);
    assert.equal(host.sentOf("command:dom:create-floating-element").length, 1);
});

test("a wheel over stickies selects the winning sticky and flies to it after the reveal", async (t) => {
    const tick = clock(t);
    const host = fakeHost();
    for (const id of ["a", "b", "c"])
        host.board.elements.set(id, {
            drawdyElementId: id,
            type: "shape",
            componentType: "sticky-note",
            x: 5000,
            y: 5000,
            text: `Topic ${id}`,
        });
    const { open, message } = await boot(createSpin({ seed: () => 31 }), host);
    await open();
    await message({
        type: "spin",
        request: request({
            source: "stickies",
            entries: ["Topic a", "Topic b", "Topic c"],
            stickyIds: ["a", "b", "c"],
        }),
    });
    const { index } = computeResult("wheel", 31, 3, DEFAULT_OPTIONS) as {
        index: number;
    };
    assert.equal(host.sentOf("command:camera:fly-to-elements").length, 0);
    tick(SPIN_MS + HOLD_MS);
    await settle(host);
    const winner = ["a", "b", "c"][index];
    assert.deepEqual(host.selection, [winner]);
    assert.deepEqual(
        host.sentOf("command:camera:fly-to-elements")[0].req.drawdyElementIds,
        [winner]
    );
});

test("dice, coin and warm-up need no entries and record no source", async (t) => {
    clock(t);
    for (const [mode, options] of [
        ["dice", { ...DEFAULT_OPTIONS, diceCount: 3, diceSides: 20 }],
        ["coin", DEFAULT_OPTIONS],
        ["warmup", { ...DEFAULT_OPTIONS, lang: "th" }],
    ] as const) {
        const host = fakeHost();
        const { open, message } = await boot(createSpin(), host);
        await open();
        await message({
            type: "spin",
            request: request({ mode, entries: [], options }),
        });
        const [card] = host.sentOf("command:scene:add-drawdy-elements")[0].req
            .elements;
        assert.equal(card.meta[KEY].mode, mode);
        assert.equal(card.meta[KEY].source, null);
        assert.deepEqual(card.meta[KEY].entries, []);
        if (mode === "warmup")
            assert.deepEqual(host.postedOf("spun")[0].prompt, {
                lang: "th",
                index: card.meta[KEY].result.prompt,
            });
    }
});

test("a spin with fewer than 2 entries is refused without touching the board", async () => {
    const host = fakeHost();
    const { open, message } = await boot(createSpin(), host);
    await open();
    await message({
        type: "spin",
        request: request({ entries: ["Mali", "   "] }),
    });
    assert.equal(host.sentOf("command:scene:add-drawdy-elements").length, 0);
    assert.deepEqual(host.postedOf("error"), [
        { type: "error", reason: "too-few" },
    ]);
});

test("a board that refuses the card reports it as blocked and frees the Spin button", async () => {
    const host = fakeHost({ addError: "unauthorized" });
    const { open, message } = await boot(createSpin(), host);
    await open();
    await message({ type: "spin", request: request() });
    assert.deepEqual(host.postedOf("error"), [
        { type: "error", reason: "blocked" },
    ]);
    assert.equal(host.overlays().length, 0);
});

test("a second spin while one is running is ignored", async (t) => {
    clock(t);
    const host = fakeHost();
    const { open, message } = await boot(createSpin(), host);
    await open();
    await message({ type: "spin", request: request() });
    await message({ type: "spin", request: request() });
    assert.equal(host.sentOf("command:scene:add-drawdy-elements").length, 1);
});
