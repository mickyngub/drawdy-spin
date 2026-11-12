import assert from "node:assert/strict";
import { test } from "node:test";
import {
    addEntries,
    cleanText,
    distinctNames,
    MAX_ENTRIES,
    MAX_PHOTO,
    MAX_TEXT,
    normalizeEntries,
    parseList,
    PHOTO_PREFIX,
    removeEntry,
    renameEntry,
    setLook,
    type Entry,
} from "../src/lib/entries";
import { PROMPTS } from "../src/lib/prompts";
import { presetEntries, WARMUP_COUNT } from "../src/lib/presets";

const counter = () => {
    let n = 0;
    return () => `id${++n}`;
};
const photo = (chars = 200) =>
    PHOTO_PREFIX + "A".repeat(chars - PHOTO_PREFIX.length);

test("text is trimmed to one line and cut at the limit with an ellipsis", () => {
    assert.equal(cleanText("  Mali \n  Ben "), "Mali Ben");
    const long = cleanText("x".repeat(200));
    assert.equal(long.length, MAX_TEXT);
    assert.ok(long.endsWith("…"));
});

test("a pasted list becomes one entry per line, without bullets, numbers or blank lines", () => {
    assert.deepEqual(parseList("- Mali\n\n2. Ben\r\n• Sara\n   \n* Tom"), [
        "Mali",
        "Ben",
        "Sara",
        "Tom",
    ]);
});

test("adding with Enter appends an entry with a fresh id and stops at twenty", () => {
    const newId = counter();
    const one = addEntries([], ["  Mali "], newId);
    assert.deepEqual(one, [{ id: "id1", text: "Mali" }]);
    const full = addEntries(
        one,
        Array.from({ length: 30 }, (_, i) => `Name ${i}`),
        newId
    );
    assert.equal(full.length, MAX_ENTRIES);
    assert.equal(addEntries(full, ["One more"], newId).length, MAX_ENTRIES);
    assert.equal(addEntries([], ["   "], newId).length, 0);
});

test("renaming keeps the entry's id and picture, and an empty name is ignored", () => {
    const entries: Entry[] = [{ id: "a", text: "Mali", emoji: "🦊" }];
    assert.deepEqual(renameEntry(entries, "a", "Malee"), [
        { id: "a", text: "Malee", emoji: "🦊" },
    ]);
    assert.deepEqual(renameEntry(entries, "a", "  "), entries);
});

test("deleting takes out only that entry", () => {
    const entries: Entry[] = [
        { id: "a", text: "Mali" },
        { id: "b", text: "Ben" },
    ];
    assert.deepEqual(
        removeEntry(entries, "a").map((e) => e.id),
        ["b"]
    );
});

test("an entry takes one emoji or one photo, and the other goes", () => {
    const entries: Entry[] = [{ id: "a", text: "Mali" }];
    const withEmoji = setLook(entries, "a", { emoji: "🍜" });
    assert.equal(withEmoji[0].emoji, "🍜");
    const withPhoto = setLook(withEmoji, "a", { photo: photo() });
    assert.equal(withPhoto[0].photo, photo());
    assert.equal(withPhoto[0].emoji, undefined);
    assert.deepEqual(setLook(withPhoto, "a", null), [
        { id: "a", text: "Mali" },
    ]);
    assert.deepEqual(setLook(entries, "a", { emoji: "🍜🍕" }), entries);
    assert.deepEqual(
        setLook(entries, "a", { photo: "data:image/png;base64,AAAA" }),
        entries
    );
});

test("stored entries are checked: bad ones dropped, ids unique, photos capped, twenty at most", () => {
    const raw = [
        { id: "a", text: "Mali", emoji: "🦊", photo: photo() },
        { id: "a", text: "Twin" },
        { id: "bad id", text: "Space" },
        { id: "b", text: "" },
        { id: "c", text: "Big photo", photo: photo(MAX_PHOTO + 1) },
        { id: "d", text: 4 },
        ...Array.from({ length: 30 }, (_, i) => ({
            id: `n${i}`,
            text: `N${i}`,
        })),
    ];
    const entries = normalizeEntries(raw);
    assert.equal(entries.length, MAX_ENTRIES);
    assert.deepEqual(entries[0], { id: "a", text: "Mali", photo: photo() });
    assert.deepEqual(entries[1], { id: "c", text: "Big photo" });
    assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
    assert.deepEqual(normalizeEntries("nope"), []);
});

test("repeated names get a number", () => {
    assert.deepEqual(distinctNames(["Mali", "Ben", "Mali", " "]), [
        "Mali",
        "Ben",
        "Mali (2)",
        "Guest",
    ]);
});

test("the people preset lists everyone here, sorted, each once", () => {
    const entries = presetEntries("people", {
        newId: counter(),
        pick: () => 0,
        names: ["sara", "Ben", "Mali", "Ben"],
    });
    assert.deepEqual(
        entries.map((e) => e.text),
        ["Ben", "Ben (2)", "Mali", "sara"]
    );
    assert.equal(new Set(entries.map((e) => e.id)).size, 4);
});

test("yes or no and lunch ideas come with an emoji on every slice", () => {
    const yes = presetEntries("yes-no", { newId: counter(), pick: () => 0 });
    assert.equal(yes.length, 2);
    const lunch = presetEntries("lunch", { newId: counter(), pick: () => 0 });
    assert.equal(lunch.length, 8);
    assert.ok(lunch.every((e) => e.emoji && !e.photo));
});

test("warm-up presets draw eight different questions in English or Thai", () => {
    for (const [preset, lang] of [
        ["warmup-en", "en"],
        ["warmup-th", "th"],
    ] as const) {
        let n = 0;
        const entries = presetEntries(preset, {
            newId: counter(),
            pick: (size) => (n++ * 7) % size,
        });
        assert.equal(entries.length, WARMUP_COUNT);
        assert.equal(new Set(entries.map((e) => e.text)).size, WARMUP_COUNT);
        for (const e of entries) assert.ok(PROMPTS[lang].includes(e.text));
        assert.deepEqual(normalizeEntries(entries), entries);
    }
});
