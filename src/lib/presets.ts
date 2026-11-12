import { addEntries, distinctNames, MAX_ENTRIES, type Entry } from "./entries";
import { PROMPTS, type Lang } from "./prompts";

export const PRESETS = [
    "people",
    "yes-no",
    "lunch",
    "warmup-en",
    "warmup-th",
] as const;
export type Preset = (typeof PRESETS)[number];

export const WARMUP_COUNT = 8;

const LUNCH: readonly [string, string][] = [
    ["🍕", "Pizza"],
    ["🍜", "Ramen"],
    ["🍣", "Sushi"],
    ["🌮", "Tacos"],
    ["🥗", "Salad"],
    ["🍛", "Curry"],
    ["🍔", "Burger"],
    ["🥟", "Dumplings"],
];

const YES_NO: readonly [string, string][] = [
    ["👍", "Yes"],
    ["👎", "No"],
];

const TALK = ["💬", "🤔", "🌟", "🎈", "☕", "🎧", "🌱", "🎨"];

type Options = {
    newId: () => string;
    /** An index below n; the driver passes crypto randomness. */
    pick: (n: number) => number;
    /** Who has the board open, for the people preset. */
    names?: readonly string[];
};

function questions(lang: Lang, pick: (n: number) => number): string[] {
    const pool = [...PROMPTS[lang]];
    const out: string[] = [];
    while (out.length < WARMUP_COUNT && pool.length > 0)
        out.push(...pool.splice(pick(pool.length), 1));
    return out;
}

const withEmoji = (
    pairs: readonly (readonly [string, string])[],
    newId: () => string
): Entry[] => pairs.map(([emoji, text]) => ({ id: newId(), text, emoji }));

export function presetEntries(preset: Preset, options: Options): Entry[] {
    const { newId, pick } = options;
    switch (preset) {
        case "people":
            return addEntries(
                [],
                distinctNames(
                    [...(options.names ?? [])].sort((a, b) =>
                        a.localeCompare(b, undefined, { sensitivity: "base" })
                    )
                ).slice(0, MAX_ENTRIES),
                newId
            );
        case "yes-no":
            return withEmoji(YES_NO, newId);
        case "lunch":
            return withEmoji(LUNCH, newId);
        case "warmup-en":
        case "warmup-th":
            return questions(preset === "warmup-en" ? "en" : "th", pick).map(
                (text, i) => ({ id: newId(), text, emoji: TALK[i] })
            );
    }
}
