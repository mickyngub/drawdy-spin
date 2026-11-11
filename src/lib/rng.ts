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

export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = intBelow(rng, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export function randomSeed(): number {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0];
}
