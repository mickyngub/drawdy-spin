/**
 * Geometry the wheel's page and its board buttons share. The widget is a
 * 440 x 520 card with a 1 px border; inside it Drawdy draws a 28 px drag bar
 * above the page, so the page's origin sits at `FACE_ORIGIN` on the widget.
 * Everything below `FACE` is in page units.
 */
export const WIDGET = { width: 440, height: 520 } as const;
export const BORDER = 1;
export const BAR_H = 28;
export const FACE_ORIGIN = { x: BORDER, y: BORDER + BAR_H } as const;
export const FACE = {
    width: WIDGET.width - 2 * BORDER,
    height: WIDGET.height - 2 * BORDER - BAR_H,
} as const;
export const WHEEL = { cx: 219, cy: 212, r: 170 } as const;
export const HUB_R = 46;
export const RESET_PILL = { x: 334, y: 12, width: 90, height: 34 } as const;
export const RIBBON_Y = 438;
