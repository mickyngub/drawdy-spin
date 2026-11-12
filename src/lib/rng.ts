export type Rng = () => number;

export function mulberry32(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hash32(...parts: number[]): number {
    let h = 0x811c9dc5;
    for (const part of parts) {
        h = Math.imul(h ^ (part >>> 0), 0x01000193);
        h ^= h >>> 13;
        h = Math.imul(h, 0x5bd1e995);
        h ^= h >>> 15;
    }
    return h >>> 0;
}

export const deriveSeed = (seed: number, salt: number): number =>
    hash32(seed, salt);

export const intBelow = (rng: Rng, n: number): number =>
    Math.min(n - 1, Math.floor(rng() * n));

export const between = (rng: Rng, min: number, max: number): number =>
    min + rng() * (max - min);

function randomUint32(): number {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0];
}

export const randomSeed = (): number => randomUint32();

/** An index below `n` from crypto randomness, without modulo bias. */
export function randomBelow(n: number): number {
    if (n <= 1) return 0;
    const limit = Math.floor(0x1_0000_0000 / n) * n;
    for (;;) {
        const value = randomUint32();
        if (value < limit) return value % n;
    }
}

export function randomId(): string {
    return randomUint32().toString(36).padStart(7, "0");
}
