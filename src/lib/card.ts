import { diceSum, type Mode } from "./modes";
import type { SpinMeta } from "./spin-meta";

export type StickyColour =
    "blue" | "lime" | "orange" | "teal" | "purple" | "pink" | "neutral";

export type CardLayout = {
    text: string;
    width: number;
    height: number;
    fontSize: number;
    fill: StickyColour;
    align: "left" | "center";
};

const FILL: Record<Mode, StickyColour> = {
    wheel: "lime",
    order: "blue",
    groups: "teal",
    dice: "orange",
    coin: "purple",
    warmup: "pink",
};

const PAD_X = 32;
const PAD_Y = 44;
const LINE = 1.4;
// Thai vowel and tone marks stack on the letter before them and take no width.
const ZERO_WIDTH = /[ัิ-ฺ็-๎​-‍️]/gu;

const visibleLength = (line: string): number =>
    [...line.replace(ZERO_WIDTH, "")].length;

function wrappedLines(text: string, width: number, fontSize: number): number {
    const perLine = Math.max(
        8,
        Math.floor((width - PAD_X) / (fontSize * 0.56))
    );
    return text
        .split("\n")
        .reduce(
            (sum, line) =>
                sum + Math.max(1, Math.ceil(visibleLength(line) / perLine)),
            0
        );
}

export function cardText(spin: SpinMeta): string {
    const { result, entries } = spin;
    switch (result.mode) {
        case "wheel":
            return `🎯 ${entries[result.index]}\npicked from ${entries.length}`;
        case "order":
            return [
                "🔀 Order",
                ...result.order.map((e, i) => `${i + 1}. ${entries[e]}`),
            ].join("\n");
        case "groups":
            return [
                `👥 ${result.groups.length} groups`,
                ...result.groups.map(
                    (g, i) =>
                        `Group ${i + 1}: ${g.map((e) => entries[e]).join(", ")}`
                ),
            ].join("\n");
        case "dice":
            return `🎲 ${diceSum(result.faces)}${result.sides === 20 ? "\nd20" : ""}`;
        case "coin":
            return result.side === "heads" ? "🪙 Heads" : "🪙 Tails";
        case "warmup":
            return `💬 ${result.text}`;
    }
}

/** The short form of a result, for the panel's status line. */
export function resultLabel(spin: SpinMeta): string {
    const { result, entries } = spin;
    switch (result.mode) {
        case "wheel":
            return entries[result.index];
        case "order":
            return result.order.map((e) => entries[e]).join(", ");
        case "groups":
            return `${result.groups.length} groups`;
        case "dice":
            return diceSum(result.faces);
        case "coin":
            return result.side === "heads" ? "Heads" : "Tails";
        case "warmup":
            return result.text;
    }
}

export function cardLayout(spin: SpinMeta): CardLayout {
    const text = cardText(spin);
    const { result } = spin;
    const short =
        result.mode === "wheel" ||
        result.mode === "dice" ||
        result.mode === "coin";
    const fontSize = short ? 26 : result.mode === "warmup" ? 20 : 16;
    const width =
        result.mode === "groups" || result.mode === "warmup"
            ? 320
            : result.mode === "dice" && result.faces.length > 1
              ? 300
              : 240;
    const lines = wrappedLines(text, width, fontSize);
    const height = Math.max(
        short ? 110 : 150,
        Math.round(PAD_Y + lines * fontSize * LINE)
    );
    return {
        text,
        width,
        height,
        fontSize,
        fill: FILL[result.mode],
        align: short ? "center" : "left",
    };
}
