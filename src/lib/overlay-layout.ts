import {
    ORDER_ROWS,
    orderRowsShown,
    type AnimationPlan,
} from "./animation-plan";

export type OverlayColours = {
    panel: string;
    fg: string;
    muted: string;
    line: string;
    accent: string;
    onAccent: string;
};

export type OverlayConfig = {
    plan: AnimationPlan;
    localStart: number;
    holdMs: number;
    fadeMs: number;
    theme: "light" | "dark";
    colours: OverlayColours;
};

export type Size = { width: number; height: number };

export const GROUP_NAMES_SHOWN = 6;

export function groupColumns(groups: number): number {
    if (groups <= 3) return groups;
    if (groups === 4) return 2;
    return 3;
}

/** Room around a card for its shadow, which the iframe would otherwise clip. */
export const MARGIN = 32;

export function groupBoxHeight(groups: readonly string[][]): number {
    const longest = Math.max(...groups.map((g) => g.length));
    return 44 + Math.min(longest, GROUP_NAMES_SHOWN + 1) * 22;
}

export function designSize(plan: AnimationPlan): Size {
    const framed = (width: number, height: number): Size => ({
        width: width + 2 * MARGIN,
        height: height + 2 * MARGIN,
    });
    switch (plan.mode) {
        case "wheel":
            return { width: 460, height: 530 };
        case "order": {
            const rows = orderRowsShown(plan.labels.length);
            const more = plan.labels.length > ORDER_ROWS ? 30 : 0;
            return framed(316, 60 + rows * 34 + more);
        }
        case "groups": {
            const cols = groupColumns(plan.groups.length);
            const rows = Math.ceil(plan.groups.length / cols);
            const box = groupBoxHeight(plan.groups);
            return framed(
                cols === 1 ? 256 : cols === 2 ? 416 : 536,
                66 + rows * box + (rows - 1) * 12
            );
        }
        case "dice": {
            const n = plan.faces.length;
            return { width: n * 120 + (n - 1) * 36 + 96, height: 350 };
        }
        case "coin":
            return { width: 300, height: 400 };
        case "warmup":
            return framed(456, 266);
    }
}

/** The plan goes into the page as JSON; `<` is escaped so no text in it can close the script tag. */
export function overlayDoc(template: string, config: OverlayConfig): string {
    const json = JSON.stringify(config).replace(/</g, "\\u003c");
    return template
        .replace("__SPIN_SCHEME__", config.theme)
        .replace("__SPIN_CONFIG__", () => json);
}
