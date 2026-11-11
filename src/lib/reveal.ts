import { SPIN_MS } from "./animation-plan";

/** How long the landed result stays on the overlay before it fades. */
export const HOLD_MS = 700;
export const FADE_MS = 400;
/** Clients that see a card later than this after its start show only the card. */
export const JOIN_WINDOW_MS = 2500;
/** After this, any client reveals a card that is still hidden. */
export const FALLBACK_MS = 4000;
export const FALLBACK_JITTER_MS = 600;

export type Arrival = {
    animate: boolean;
    /** Local clock time the animation's t = 0 maps to. */
    localStart: number;
    /** When the overlay is gone, or null with no overlay. */
    removeAt: number | null;
    /** The spinner's own reveal, once the result has landed. */
    revealAt: number | null;
    /** Another client's check that the spinner did reveal it. */
    fallbackAt: number | null;
};

export function arrival({
    startedAt,
    now,
    opacity,
    mine,
    jitter = 0,
}: {
    startedAt: number;
    now: number;
    opacity: number | undefined;
    mine: boolean;
    jitter?: number;
}): Arrival {
    const elapsed = now - startedAt;
    const animate = Math.abs(elapsed) <= JOIN_WINDOW_MS;
    // A clock running behind the spinner's starts the spin now rather than waiting for it.
    const localStart = elapsed >= 0 ? startedAt : now;
    const hidden = opacity === 0;
    const landed = localStart + SPIN_MS + HOLD_MS;
    return {
        animate,
        localStart,
        removeAt: animate ? landed + FADE_MS : null,
        revealAt: mine && hidden ? (animate ? landed : now) : null,
        fallbackAt:
            !mine && hidden
                ? Math.max(now, startedAt + FALLBACK_MS) +
                  Math.max(0, Math.min(FALLBACK_JITTER_MS, jitter))
                : null,
    };
}
