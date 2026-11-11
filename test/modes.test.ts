import assert from "node:assert/strict";
import { test } from "node:test";
import {
    DEFAULT_OPTIONS,
    computeResult,
    distinctNames,
    firstLine,
    groupCount,
    groupSizes,
    normalizeOptions,
    parseList,
    type ModeOptions,
} from "../src/lib/modes";
import { PROMPTS } from "../src/lib/prompts";
import { hash32, mulberry32, shuffled } from "../src/lib/rng";

const SEEDS = Array.from({ length: 300 }, (_, i) => hash32(i, 7));
const opts = (patch: Partial<ModeOptions> = {}): ModeOptions => ({
    ...DEFAULT_OPTIONS,
    ...patch,
});

test("the same seed gives the same sequence, and different seeds differ", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = Array.from({ length: 8 }, a);
    assert.deepEqual(seqA, Array.from({ length: 8 }, b));
    assert.notDeepEqual(seqA, Array.from({ length: 8 }, c));
    assert.ok(seqA.every((x) => x >= 0 && x < 1));
});

test("a shuffle is a permutation of its input", () => {
    for (const seed of SEEDS.slice(0, 50)) {
        const out = shuffled(mulberry32(seed), [1, 2, 3, 4, 5, 6, 7]);
        assert.deepEqual(
            [...out].sort((x, y) => x - y),
            [1, 2, 3, 4, 5, 6, 7]
        );
    }
});

test("every mode gives the same result for the same seed and entries", () => {
    for (const mode of [
        "wheel",
        "order",
        "groups",
        "dice",
        "coin",
        "warmup",
    ] as const) {
        for (const seed of SEEDS.slice(0, 20)) {
            assert.deepEqual(
                computeResult(mode, seed, 9, opts({ diceCount: 3 })),
                computeResult(mode, seed, 9, opts({ diceCount: 3 }))
            );
        }
    }
});

test("the wheel picks an entry in range and reaches every entry", () => {
    const hits = new Set<number>();
    for (const seed of SEEDS) {
        const r = computeResult("wheel", seed, 5, opts());
        assert.equal(r.mode, "wheel");
        if (r.mode !== "wheel") return;
        assert.ok(r.index >= 0 && r.index < 5);
        hits.add(r.index);
    }
    assert.equal(hits.size, 5);
});

test("order is a permutation of every entry", () => {
    for (const seed of SEEDS.slice(0, 60)) {
        const r = computeResult("order", seed, 12, opts());
        if (r.mode !== "order") throw new Error(r.mode);
        assert.deepEqual(
            [...r.order].sort((a, b) => a - b),
            Array.from({ length: 12 }, (_, i) => i)
        );
    }
});

test("groups use every entry once and are balanced to within one", () => {
    for (let n = 2; n <= 30; n++) {
        for (const groupsBy of ["count", "size"] as const) {
            for (const groupsN of [2, 3, 4, 5, 7]) {
                const seed = SEEDS[n * 7 + groupsN];
                const r = computeResult(
                    "groups",
                    seed,
                    n,
                    opts({ groupsBy, groupsN })
                );
                if (r.mode !== "groups") throw new Error(r.mode);
                const sizes = r.groups.map((g) => g.length);
                assert.ok(
                    Math.max(...sizes) - Math.min(...sizes) <= 1,
                    `${n} by ${groupsBy} ${groupsN}: ${sizes}`
                );
                assert.ok(sizes.every((s) => s > 0));
                assert.deepEqual(
                    r.groups.flat().sort((a, b) => a - b),
                    Array.from({ length: n }, (_, i) => i)
                );
                if (groupsBy === "size")
                    assert.ok(Math.max(...sizes) <= Math.max(groupsN, 1));
                assert.deepEqual(
                    [...sizes].sort((a, b) => b - a),
                    groupSizes(n, groupsBy, groupsN)
                );
            }
        }
    }
});

test("12 people in groups of 5 make 3 groups of 4, and 3 groups never exceed the people", () => {
    assert.deepEqual(groupSizes(12, "size", 5), [4, 4, 4]);
    assert.deepEqual(groupSizes(10, "size", 3), [3, 3, 2, 2]);
    assert.equal(groupCount(2, "count", 5), 2);
});

test("dice stay in range for one to three d6 or d20", () => {
    for (const diceSides of [6, 20] as const) {
        for (const diceCount of [1, 2, 3]) {
            const seen = new Set<number>();
            for (const seed of SEEDS) {
                const r = computeResult(
                    "dice",
                    seed,
                    0,
                    opts({ diceCount, diceSides })
                );
                if (r.mode !== "dice") throw new Error(r.mode);
                assert.equal(r.faces.length, diceCount);
                assert.equal(r.sides, diceSides);
                for (const f of r.faces) {
                    assert.ok(Number.isInteger(f) && f >= 1 && f <= diceSides);
                    seen.add(f);
                }
            }
            assert.equal(seen.size, diceSides);
        }
    }
});

test("the coin lands on both sides", () => {
    const sides = new Set(
        SEEDS.map((seed) => {
            const r = computeResult("coin", seed, 0, opts());
            return r.mode === "coin" ? r.side : null;
        })
    );
    assert.deepEqual([...sides].sort(), ["heads", "tails"]);
});

test("a warm-up question comes from the chosen language and skips recent ones while others remain", () => {
    for (const lang of ["en", "th"] as const) {
        const avoid = PROMPTS[lang].map((_, i) => i).slice(0, 55);
        for (const seed of SEEDS.slice(0, 40)) {
            const r = computeResult("warmup", seed, 0, opts({ lang, avoid }));
            if (r.mode !== "warmup") throw new Error(r.mode);
            assert.equal(r.lang, lang);
            assert.equal(r.text, PROMPTS[lang][r.prompt]);
            assert.ok(r.prompt >= 55);
        }
    }
    const everything = PROMPTS.en.map((_, i) => i);
    const r = computeResult("warmup", 1, 0, opts({ avoid: everything }));
    assert.equal(r.mode, "warmup");
});

test("options outside the range are clamped", () => {
    assert.deepEqual(
        normalizeOptions({
            groupsBy: "size",
            groupsN: 99,
            diceCount: 0,
            diceSides: 8,
            lang: "fr",
            avoid: [1, -2, 2.5, "x"],
        }),
        {
            groupsBy: "size",
            groupsN: 20,
            diceCount: 1,
            diceSides: 6,
            lang: "en",
            avoid: [1],
        }
    );
});

test("a typed list drops blanks, bullets and numbering", () => {
    assert.deepEqual(
        parseList("- Mali\n\n* Ben\n• Sara\n3. Joe\n  2) Kai  \n"),
        ["Mali", "Ben", "Sara", "Joe", "Kai"]
    );
});

test("a sticky contributes its first non-empty line", () => {
    assert.equal(
        firstLine("\n  Pricing page \nwhy it matters"),
        "Pricing page"
    );
    assert.equal(firstLine(undefined), "");
});

test("repeated names are numbered so each segment can be told apart", () => {
    assert.deepEqual(distinctNames(["Guest", "Mali", "Guest", " "]), [
        "Guest",
        "Mali",
        "Guest (2)",
        "Guest (3)",
    ]);
});
