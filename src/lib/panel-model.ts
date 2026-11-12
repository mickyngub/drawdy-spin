import { MAX_ENTRIES, type Entry } from "./entries";
import {
    canReset,
    entryById,
    isSpinning,
    remaining,
    type Wheel,
} from "./wheel";

export type PanelStatus =
    | { kind: "none" }
    | { kind: "empty" }
    | { kind: "spinning" }
    | { kind: "picked"; text: string }
    | { kind: "all-picked" };

export type PanelRow = Entry & { picked: boolean };

export type PanelView = {
    rows: PanelRow[];
    total: number;
    left: number;
    full: boolean;
    spinning: boolean;
    canSpin: boolean;
    canReset: boolean;
    status: PanelStatus;
};

/**
 * What the panel shows for a wheel at `now`. The entry a spin in flight will
 * land on is not marked picked until it lands, so the panel never gives the
 * result away early.
 */
export function panelView(wheel: Wheel, now: number): PanelView {
    const spinning = isSpinning(wheel, now);
    const hidden = spinning ? wheel.lastSpin?.result : undefined;
    const picked = new Set(wheel.picked.filter((id) => id !== hidden));
    const inFlight =
        hidden !== undefined &&
        wheel.removePicked &&
        wheel.picked.includes(hidden)
            ? 1
            : 0;
    const left = remaining(wheel).length;
    const result = entryById(wheel, wheel.lastSpin?.result);
    const status: PanelStatus =
        wheel.entries.length === 0
            ? { kind: "empty" }
            : spinning
              ? { kind: "spinning" }
              : left === 0 && canReset(wheel)
                ? { kind: "all-picked" }
                : result
                  ? { kind: "picked", text: result.text }
                  : { kind: "none" };
    return {
        rows: wheel.entries.map((e) => ({ ...e, picked: picked.has(e.id) })),
        total: wheel.entries.length,
        left: left + inFlight,
        full: wheel.entries.length >= MAX_ENTRIES,
        spinning,
        canSpin: !spinning && left > 0,
        canReset: !spinning && canReset(wheel),
        status,
    };
}
