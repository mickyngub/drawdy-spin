import assert from "node:assert/strict";
import { test } from "node:test";
import { cardLayout, cardText } from "../src/lib/card";
import { DEFAULT_OPTIONS, computeResult, type Mode } from "../src/lib/modes";
import { PROMPTS } from "../src/lib/prompts";
import { readSpin, type SpinMeta } from "../src/lib/spin-meta";
import {
    DEFAULT_SETTINGS,
    normalizeSettings,
    rememberPrompt,
} from "../src/shared/messages";
import { groupsPreview, withoutEntry } from "../webview/lib/list";

const KEY = "mickyngub.spin";
const EM_DASH = String.fromCharCode(0x2014);

function meta(mode: Mode, entries: string[], seed = 3, patch = {}): SpinMeta {
    return {
        v: 1,
        seed,
        startedAt: 5,
        mode,
        source: entries.length ? "list" : null,
        entries,
        result: computeResult(mode, seed, entries.length, {
            ...DEFAULT_OPTIONS,
            ...patch,
        }),
    };
}

test("there are 60 English and 60 Thai warm-up questions, all different and free of em dashes", () => {
    for (const lang of ["en", "th"] as const) {
        const list = PROMPTS[lang];
        assert.equal(list.length, 60);
        assert.equal(new Set(list).size, 60);
        for (const q of list) {
            assert.ok(q.length >= 10 && q.length <= 90, q);
            assert.ok(!q.includes(EM_DASH), q);
        }
    }
    assert.ok(PROMPTS.th.every((q) => /[฀-๿]/.test(q)));
});

test("the card states the result", () => {
    const wheel = meta("wheel", ["Mali", "Ben", "Sara"]);
    const r = wheel.result as { index: number };
    assert.ok(cardText(wheel).startsWith(`🎯 ${wheel.entries[r.index]}\n`));
    const dice = meta("dice", [], 4, { diceCount: 2 });
    const faces = (dice.result as { faces: number[] }).faces;
    assert.equal(
        cardText(dice),
        `🎲 ${faces[0]} + ${faces[1]} = ${faces[0] + faces[1]}`
    );
    const order = meta("order", ["A", "B", "C"]);
    assert.equal(cardText(order).split("\n").length, 4);
    const groups = meta("groups", ["A", "B", "C", "D", "E"], 3, { groupsN: 2 });
    assert.equal(cardText(groups).split("\n").length, 3);
});

test("cards grow with long results and keep a sticky-note colour per mode", () => {
    const short = cardLayout(meta("order", ["A", "B"]));
    const long = cardLayout(
        meta(
            "order",
            Array.from({ length: 30 }, (_, i) => `Person ${i}`)
        )
    );
    assert.ok(long.height > short.height);
    const fills = new Set(
        (["wheel", "order", "groups", "dice", "coin", "warmup"] as const).map(
            (mode) =>
                cardLayout(
                    meta(
                        mode,
                        mode === "wheel" ||
                            mode === "order" ||
                            mode === "groups"
                            ? ["A", "B"]
                            : []
                    )
                ).fill
        )
    );
    assert.equal(fills.size, 6);
});

test("a card's meta is read back only when it is a valid spin", () => {
    const good = meta("groups", ["A", "B", "C", "D"], 9, { groupsN: 2 });
    assert.deepEqual(readSpin({ [KEY]: good }, KEY), good);
    assert.equal(readSpin({ other: good }, KEY), null);
    assert.equal(readSpin({ [KEY]: { ...good, v: 2 } }, KEY), null);
    assert.equal(
        readSpin(
            {
                [KEY]: {
                    ...good,
                    result: {
                        mode: "groups",
                        groups: [
                            [0, 1],
                            [1, 2, 3],
                        ],
                    },
                },
            },
            KEY
        ),
        null,
        "an entry in two groups"
    );
    assert.equal(
        readSpin(
            { [KEY]: { ...good, result: { mode: "wheel", index: 0 } } },
            KEY
        ),
        null,
        "a result for another mode"
    );
    const dice = meta("dice", [], 2, { diceSides: 20, diceCount: 3 });
    assert.ok(readSpin({ [KEY]: dice }, KEY));
    assert.equal(
        readSpin(
            {
                [KEY]: {
                    ...dice,
                    result: { mode: "dice", sides: 6, faces: [7] },
                },
            },
            KEY
        ),
        null
    );
});

test("stored settings are cleaned up and recent questions are capped", () => {
    assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
    const s = normalizeSettings({
        mode: "dice",
        source: "nope",
        list: "A\nB",
        options: { diceCount: 3, diceSides: 20 },
        sound: true,
        recent: { en: [1, 2], th: "x" },
    });
    assert.equal(s.mode, "dice");
    assert.equal(s.source, "people");
    assert.equal(s.options.diceCount, 3);
    assert.equal(s.options.diceSides, 20);
    assert.equal(s.sound, true);
    assert.deepEqual(s.recent, { en: [1, 2], th: [] });
    let r = DEFAULT_SETTINGS;
    for (let i = 0; i < 50; i++) r = rememberPrompt(r, "en", i);
    assert.equal(r.recent.en.length, 40);
    assert.equal(r.recent.en.at(-1), 49);
});

test("removing a winner takes out its line only", () => {
    assert.equal(
        withoutEntry("Mali\n- Ben\nSara\nBen", "Ben"),
        "Mali\nSara\nBen"
    );
    assert.equal(withoutEntry("Mali\nSara", "Joe"), "Mali\nSara");
});

test("the groups preview names the split", () => {
    assert.equal(groupsPreview([4, 4, 4]), "3 groups of 4");
    assert.equal(groupsPreview([3, 3, 2, 2]), "4 groups of 3 or 2");
    assert.equal(groupsPreview([]), "");
});
