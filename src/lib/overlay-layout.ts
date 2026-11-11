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

export function designSize(plan: AnimationPlan): Size {
    switch (plan.mode) {
        case "wheel":
            return { width: 420, height: 480 };
        case "order": {
            const rows = orderRowsShown(plan.labels.length);
            const more = plan.labels.length > ORDER_ROWS ? 30 : 0;
            return { width: 340, height: 76 + rows * 34 + more };
        }
        case "groups": {
            const cols = groupColumns(plan.groups.length);
            const rows = Math.ceil(plan.groups.length / cols);
            const longest = Math.max(...plan.groups.map((g) => g.length));
            const lines = Math.min(longest, GROUP_NAMES_SHOWN + 1);
            const box = 44 + lines * 22;
            return {
                width: cols === 1 ? 280 : cols === 2 ? 440 : 560,
                height: 72 + rows * box + (rows - 1) * 12,
            };
        }
        case "dice": {
            const n = plan.faces.length;
            return { width: n * 120 + (n - 1) * 36 + 96, height: 330 };
        }
        case "coin":
            return { width: 300, height: 380 };
        case "warmup":
            return { width: 480, height: 290 };
    }
}

/** The plan goes into the page as JSON; `<` is escaped so no text in it can close the script tag. */
export function overlayDoc(template: string, config: OverlayConfig): string {
    const json = JSON.stringify(config).replace(/</g, "\\u003c");
    return template
        .replace("__SPIN_SCHEME__", config.theme)
        .replace("__SPIN_CONFIG__", () => json);
}
