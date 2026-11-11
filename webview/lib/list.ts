import { parseList, type Mode } from "../../src/lib/modes";

/** The typed list with the first line naming `label` taken out, other lines left as typed. */
export function withoutEntry(text: string, label: string): string {
    const lines = text.split(/\r?\n/);
    const index = lines.findIndex((line) => parseList(line)[0] === label);
    if (index < 0) return text;
    return [...lines.slice(0, index), ...lines.slice(index + 1)].join("\n");
}

export function statusFor(mode: Mode, label: string): string {
    switch (mode) {
        case "wheel":
            return `Landed on ${label}`;
        case "order":
            return `Order: ${label}`;
        case "groups":
            return `Split into ${label}`;
        case "dice":
            return `Rolled ${label}`;
        case "coin":
            return `Flipped ${label.toLowerCase()}`;
        case "warmup":
            return label;
    }
}

export function groupsPreview(sizes: readonly number[]): string {
    if (sizes.length === 0) return "";
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    const groups = `${sizes.length} ${sizes.length === 1 ? "group" : "groups"}`;
    return min === max
        ? `${groups} of ${max}`
        : `${groups} of ${max} or ${min}`;
}
