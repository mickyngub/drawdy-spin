export type Entry = {
    id: string;
    text: string;
    emoji?: string;
    /** A square JPEG as a data URL, downscaled by the panel. */
    photo?: string;
};

export type Look = { emoji: string } | { photo: string } | null;

export const MAX_ENTRIES = 20;
export const MAX_TEXT = 80;
export const MAX_EMOJI = 16;
/** Twenty photos at this size keep a wheel's page under 150 KB. */
export const MAX_PHOTO = 5_000;
export const PHOTO_PREFIX = "data:image/jpeg;base64,";

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

export function graphemes(text: string): string[] {
    try {
        return [
            ...new Intl.Segmenter(undefined, {
                granularity: "grapheme",
            }).segment(text),
        ].map((s) => s.segment);
    } catch {
        return [...text];
    }
}

export function cleanText(raw: string): string {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.length <= MAX_TEXT) return text;
    let out = "";
    for (const g of graphemes(text)) {
        if (out.length + g.length > MAX_TEXT - 1) break;
        out += g;
    }
    return `${out.trimEnd()}…`;
}

/** One entry per non-empty line, with list bullets and numbering dropped. */
export function parseList(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => cleanText(line.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "")))
        .filter((line) => line.length > 0);
}

export const validEmoji = (v: unknown): v is string =>
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= MAX_EMOJI &&
    !/[\s<>]/.test(v) &&
    graphemes(v).length === 1;

export const validPhoto = (v: unknown): v is string =>
    typeof v === "string" &&
    v.length <= MAX_PHOTO &&
    v.startsWith(PHOTO_PREFIX) &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(v.slice(PHOTO_PREFIX.length));

const validId = (v: unknown): v is string =>
    typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v);

/** The entries a wheel can hold: valid, with unique ids, at most twenty. */
export function normalizeEntries(raw: unknown): Entry[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const item of raw) {
        if (out.length >= MAX_ENTRIES) break;
        if (!isRecord(item) || !validId(item.id) || seen.has(item.id)) continue;
        if (typeof item.text !== "string") continue;
        const text = cleanText(item.text);
        if (!text) continue;
        seen.add(item.id);
        const entry: Entry = { id: item.id, text };
        if (validPhoto(item.photo)) entry.photo = item.photo;
        else if (validEmoji(item.emoji)) entry.emoji = item.emoji;
        out.push(entry);
    }
    return out;
}

/** Adds each text as an entry until the wheel is full. */
export function addEntries(
    entries: readonly Entry[],
    texts: readonly string[],
    newId: () => string
): Entry[] {
    const out = [...entries];
    for (const raw of texts) {
        if (out.length >= MAX_ENTRIES) break;
        const text = cleanText(raw);
        if (text) out.push({ id: newId(), text });
    }
    return out;
}

export function renameEntry(
    entries: readonly Entry[],
    id: string,
    raw: string
): Entry[] {
    const text = cleanText(raw);
    if (!text) return [...entries];
    return entries.map((e) => (e.id === id ? { ...e, text } : e));
}

export const removeEntry = (entries: readonly Entry[], id: string): Entry[] =>
    entries.filter((e) => e.id !== id);

/** Gives an entry an emoji or a photo, or takes its picture away. */
export function setLook(
    entries: readonly Entry[],
    id: string,
    look: Look
): Entry[] {
    return entries.map((e) => {
        if (e.id !== id) return e;
        const { emoji: _emoji, photo: _photo, ...rest } = e;
        if (look && "emoji" in look && validEmoji(look.emoji))
            return { ...rest, emoji: look.emoji };
        if (look && "photo" in look && validPhoto(look.photo))
            return { ...rest, photo: look.photo };
        return rest;
    });
}

/** Repeated names get a number, so every slice can be told apart. */
export function distinctNames(names: readonly string[]): string[] {
    const seen = new Map<string, number>();
    return names.map((raw) => {
        const name = cleanText(raw) || "Guest";
        const count = (seen.get(name) ?? 0) + 1;
        seen.set(name, count);
        return count === 1 ? name : `${name} (${count})`;
    });
}

/** What a slice's badge shows when the entry has no picture. */
export function initialOf(text: string): string {
    const first = graphemes(text.trim())[0] ?? "";
    return first.toLocaleUpperCase();
}
