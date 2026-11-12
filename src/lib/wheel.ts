import { normalizeEntries, type Entry } from "./entries";

/** The spin starts this long after the press, so the new wheel is on every screen before it turns. */
export const SPIN_LEAD_MS = 400;
export const SPIN_MS = 4000;
/** A page that opens within this long of the start still plays the spin. */
export const PLAY_WINDOW_MS = 4500;

export type LastSpin = {
    seed: number;
    /** Wall-clock time the wheel starts turning. */
    startedAt: number;
    /** The id of the entry it lands on. */
    result: string;
    /** Degrees, clockwise: where the wheel rested before this spin. */
    from: number;
};

export type Wheel = {
    v: 2;
    wheelId: string;
    entries: Entry[];
    /** Entries already picked, which a spin skips while removePicked is on. */
    picked: string[];
    removePicked: boolean;
    lastSpin?: LastSpin;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

/** Always in [0, n), and exact for values already there, so an angle read back off the board is the same number. */
export function mod(a: number, n: number): number {
    const r = a % n;
    const m = r < 0 ? r + n : r;
    return m >= n ? 0 : m;
}

export function newWheel(
    wheelId: string,
    entries: Entry[],
    removePicked = true
): Wheel {
    return { v: 2, wheelId, entries, picked: [], removePicked };
}

function readLastSpin(raw: unknown, ids: Set<string>): LastSpin | undefined {
    if (!isRecord(raw)) return undefined;
    const { seed, startedAt, result, from } = raw;
    if (!Number.isInteger(seed) || (seed as number) < 0) return undefined;
    if (!finite(startedAt) || !finite(from)) return undefined;
    if (typeof result !== "string" || !ids.has(result)) return undefined;
    return { seed: seed as number, startedAt, result, from: mod(from, 360) };
}

/** The wheel a component's meta carries, or null when it isn't one this version reads. */
export function readWheel(raw: unknown): Wheel | null {
    if (!isRecord(raw) || raw.v !== 2) return null;
    if (typeof raw.wheelId !== "string" || !raw.wheelId) return null;
    const entries = normalizeEntries(raw.entries);
    const ids = new Set(entries.map((e) => e.id));
    const picked = Array.isArray(raw.picked)
        ? [
              ...new Set(
                  raw.picked.filter(
                      (id): id is string =>
                          typeof id === "string" && ids.has(id)
                  )
              ),
          ]
        : [];
    const wheel: Wheel = {
        v: 2,
        wheelId: raw.wheelId,
        entries,
        picked,
        removePicked: raw.removePicked !== false,
    };
    const lastSpin = readLastSpin(raw.lastSpin, ids);
    if (lastSpin) wheel.lastSpin = lastSpin;
    return wheel;
}

export function toMeta(wheel: Wheel): Wheel {
    const meta: Wheel = {
        v: 2,
        wheelId: wheel.wheelId,
        entries: wheel.entries,
        picked: wheel.picked,
        removePicked: wheel.removePicked,
    };
    if (wheel.lastSpin) meta.lastSpin = wheel.lastSpin;
    return meta;
}

export const sameWheel = (a: Wheel, b: Wheel): boolean =>
    JSON.stringify(toMeta(a)) === JSON.stringify(toMeta(b));

/** The slices as drawn: with removePicked on, picked entries leave the wheel once the next spin starts. */
export function slicesOf(wheel: Wheel): Entry[] {
    if (!wheel.removePicked) return wheel.entries;
    const picked = new Set(wheel.picked);
    return wheel.entries.filter(
        (e) => !picked.has(e.id) || e.id === wheel.lastSpin?.result
    );
}

/** What the next spin can land on. */
export function remaining(wheel: Wheel): Entry[] {
    if (!wheel.removePicked) return wheel.entries;
    const picked = new Set(wheel.picked);
    return wheel.entries.filter((e) => !picked.has(e.id));
}

export const landsAt = (wheel: Wheel): number | null =>
    wheel.lastSpin ? wheel.lastSpin.startedAt + SPIN_MS : null;

export function isSpinning(wheel: Wheel, now: number): boolean {
    const end = landsAt(wheel);
    return end !== null && now < end;
}

export const canReset = (wheel: Wheel): boolean =>
    wheel.picked.length > 0 || wheel.lastSpin !== undefined;

export function reset(wheel: Wheel): Wheel {
    const { lastSpin: _lastSpin, ...rest } = wheel;
    return { ...rest, picked: [] };
}

/** New entries or a new removePicked setting; picks of entries that are gone go with them. */
export function edited(
    wheel: Wheel,
    entries: Entry[],
    removePicked: boolean
): Wheel {
    const ids = new Set(entries.map((e) => e.id));
    const { lastSpin, ...rest } = wheel;
    const next: Wheel = {
        ...rest,
        entries,
        removePicked,
        picked: wheel.picked.filter((id) => ids.has(id)),
    };
    if (lastSpin && ids.has(lastSpin.result)) next.lastSpin = lastSpin;
    return next;
}

export const entryById = (wheel: Wheel, id: string | undefined) =>
    wheel.entries.find((e) => e.id === id);
