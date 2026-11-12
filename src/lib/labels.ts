import { restingAngle } from "./spin-plan";
import { mod, slicesOf, type Wheel } from "./wheel";

/** Wheels up to this size draw a picture per slice and the name along the rim; bigger ones run names along the radius. */
export const PICTURE_MAX = 10;

export type LabelKind = "arc" | "radial";

export type Label = {
    id: string;
    kind: LabelKind;
    /** Degrees clockwise from twelve o'clock: where the slice's middle points once the wheel rests. */
    mid: number;
    flipped: boolean;
    /** Degrees clockwise the text's reading direction is turned from left to right, in (-180, 180]. */
    rotation: number;
};

export const labelKind = (count: number): LabelKind =>
    count <= PICTURE_MAX ? "arc" : "radial";

/**
 * A rim label in the lower half runs the other way along the arc, and a
 * radial label in the left half reads from the rim inwards, so neither ends
 * up upside down. Exactly horizontal and exactly vertical stay as drawn.
 */
export function isFlipped(kind: LabelKind, mid: number): boolean {
    const m = mod(mid, 360);
    return kind === "arc" ? m > 90 && m < 270 : m > 180;
}

function normalize(deg: number): number {
    const m = mod(deg, 360);
    return m > 180 ? m - 360 : m;
}

/** An arc label's text turns with the tangent, a radial one with the radius; a flip turns it half round. */
export function textRotation(
    kind: LabelKind,
    mid: number,
    flipped: boolean
): number {
    const base = kind === "arc" ? mid : mid - 90;
    return normalize(base + (flipped ? 180 : 0));
}

/**
 * Each slice's label, oriented for where the wheel comes to rest: a spin
 * keeps these orientations from start to landing, so nothing flips while it
 * turns and the landed wheel reads upright.
 */
export function labelLayout(wheel: Wheel): Label[] {
    const slices = slicesOf(wheel);
    const count = slices.length;
    const kind = labelKind(count);
    const rest = restingAngle(wheel);
    const seg = count > 0 ? 360 / count : 360;
    return slices.map((entry, i) => {
        // A lone slice's name sits under the hub, wherever the wheel turns.
        const mid = count === 1 ? 180 : mod(rest + (i + 0.5) * seg, 360);
        const flipped = isFlipped(kind, mid);
        return {
            id: entry.id,
            kind,
            mid,
            flipped,
            rotation: textRotation(kind, mid, flipped),
        };
    });
}
