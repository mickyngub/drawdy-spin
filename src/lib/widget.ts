import type {
    DomElementSchema,
    DrawdyElementSchema,
} from "@drawdy/driver-protocol";
import { FACE_HTML } from "../face-html";
import type { Rect } from "./free-spot";
import {
    BORDER,
    FACE,
    FACE_ORIGIN,
    HUB_R,
    RESET_PILL,
    WHEEL,
    WIDGET,
} from "./layout";
import { canReset, toMeta, type Wheel } from "./wheel";

export const WIDGET_SIZE = WIDGET;
export const WIDGET_LABEL = "Spin";

export type WidgetButton = "spin" | "reset";

// The board's own tokens, so each viewer sees the card in their theme.
const SURFACE = "var(--surface-panel, #1f1f23)";
const BORDER_COLOUR = "var(--border-medium, rgb(255 255 255 / 0.08))";
const HUB_HOVER = "rgb(255 255 255 / 0.22)";
const PILL_HOVER = "rgb(31 37 80 / 0.1)";

type Box = { x: number; y: number; width: number; height: number };

/** Where each button sits on a widget at its base size. */
export const BUTTON_BOXES: Record<WidgetButton, Box> = {
    spin: {
        x: FACE_ORIGIN.x + WHEEL.cx - HUB_R,
        y: FACE_ORIGIN.y + WHEEL.cy - HUB_R,
        width: 2 * HUB_R,
        height: 2 * HUB_R,
    },
    reset: {
        x: FACE_ORIGIN.x + RESET_PILL.x,
        y: FACE_ORIGIN.y + RESET_PILL.y,
        width: RESET_PILL.width,
        height: RESET_PILL.height,
    },
};

/** A button's id names its wheel and what it does, the stable hook for tests and tools. */
export const buttonDomId = (
    driverId: string,
    wheelId: string,
    button: WidgetButton
): string => `${driverId}:${wheelId}:${button}`;

export const buttonsOf = (wheel: Wheel): WidgetButton[] =>
    canReset(wheel) ? ["spin", "reset"] : ["spin"];

/** Where a button sits on a widget placed at `rect`, in board units. */
export function buttonRect(rect: Rect, button: WidgetButton): Rect {
    const box = BUTTON_BOXES[button];
    const sx = rect.width / WIDGET.width;
    const sy = rect.height / WIDGET.height;
    return {
        x: rect.x + box.x * sx,
        y: rect.y + box.y * sy,
        width: box.width * sx,
        height: box.height * sy,
    };
}

/**
 * Which button a click at `point` landed on: the round hub, or the Reset pill
 * when the widget was drawn with one.
 */
export function buttonAt(
    rect: Rect,
    wheel: Wheel,
    point: { x: number; y: number }
): WidgetButton | null {
    const x = ((point.x - rect.x) * WIDGET.width) / rect.width;
    const y = ((point.y - rect.y) * WIDGET.height) / rect.height;
    const hub = BUTTON_BOXES.spin;
    if (Math.hypot(x - (hub.x + HUB_R), y - (hub.y + HUB_R)) <= HUB_R)
        return "spin";
    const pill = BUTTON_BOXES.reset;
    if (
        canReset(wheel) &&
        x >= pill.x &&
        x <= pill.x + pill.width &&
        y >= pill.y &&
        y <= pill.y + pill.height
    )
        return "reset";
    return null;
}

/** The wheel's page with its state in it; `<` is escaped so no entry can close the script tag. */
export function faceDoc(wheel: Wheel): string {
    const json = JSON.stringify(toMeta(wheel)).replace(/</g, "\\u003c");
    return FACE_HTML.replace("__SPIN_STATE__", () => json);
}

/**
 * A box drawn over the page in a zero-height row at the bottom of the card,
 * moved into place with a transform, since the schema has no absolute
 * positioning. The page draws the button itself, so the box only takes the
 * press and shows a hover tint. Boxes, not buttons: Drawdy keeps a button's
 * click to the page, where its pointer capture hides which one was hit,
 * while a press on anything else reaches drivers as a scene click.
 */
function overlay(
    domId: string,
    box: Box,
    radius: number,
    hover: string
): DomElementSchema {
    const rowTop = WIDGET.height - BORDER;
    return {
        type: "row",
        styles: {
            width: [FACE.width, "px"],
            height: [0, "px"],
            mainAxisAlignment: "start",
            crossAxisAlignment: "start",
        },
        children: [
            {
                type: "box",
                domId,
                styles: {
                    width: [box.width, "px"],
                    height: [box.height, "px"],
                    borderRadius: [radius, "px"],
                    transform: `translate(${box.x - BORDER}px, ${box.y - rowTop}px)`,
                    pointerEvents: "auto",
                    cursor: "pointer",
                    hover: { backgroundColor: hover },
                },
            },
        ],
    };
}

const round = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * The widget is laid out at its base size; one someone resized comes back
 * scaled to that size, since a component's own scale can't be set when it is
 * added. Schema styles have no transform-origin, so the translate pins the
 * scaled card to the element's top-left corner.
 */
export function widgetSchema(
    driverId: string,
    wheel: Wheel,
    size: { width: number; height: number } = WIDGET
): DomElementSchema {
    const { width: w, height: h } = WIDGET;
    const scaled =
        Math.abs(size.width - w) >= 0.5 || Math.abs(size.height - h) >= 0.5;
    const buttons = buttonsOf(wheel);
    return {
        type: "column",
        styles: {
            width: [w, "px"],
            height: [h, "px"],
            backgroundColor: SURFACE,
            borderColor: BORDER_COLOUR,
            borderWidth: [BORDER, "px"],
            borderRadius: [18, "px"],
            overflow: "hidden",
            ...(scaled
                ? {
                      transform: `translate(${round((size.width - w) / 2)}px, ${round((size.height - h) / 2)}px) scale(${round(size.width / w)}, ${round(size.height / h)})`,
                  }
                : {}),
        },
        children: [
            {
                type: "iframe",
                label: WIDGET_LABEL,
                child: { srcDoc: faceDoc(wheel) },
                styles: {
                    width: [FACE.width, "px"],
                    height: [h - 2 * BORDER, "px"],
                },
            },
            overlay(
                buttonDomId(driverId, wheel.wheelId, "spin"),
                BUTTON_BOXES.spin,
                HUB_R,
                HUB_HOVER
            ),
            ...(buttons.includes("reset")
                ? [
                      overlay(
                          buttonDomId(driverId, wheel.wheelId, "reset"),
                          BUTTON_BOXES.reset,
                          RESET_PILL.height / 2,
                          PILL_HOVER
                      ),
                  ]
                : []),
        ],
    };
}

export type Placement = { frameId?: string; groupId?: string };

export function widgetElement(
    driverId: string,
    elementId: string,
    wheel: Wheel,
    rect: Rect,
    place: Placement = {}
): DrawdyElementSchema {
    return {
        type: "component",
        drawdyElementId: elementId,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        ...(place.frameId ? { frameId: place.frameId } : {}),
        ...(place.groupId ? { groupId: place.groupId } : {}),
        meta: { [driverId]: toMeta(wheel) },
        schema: widgetSchema(driverId, wheel, rect),
    };
}

/** A wheel on the board: its element, its state and where it sits. */
export type Placed = { el: string; wheel: Wheel; rect: Rect | null };

export function sameRect(a: Rect | null, b: Rect | null): boolean {
    if (!a || !b) return false;
    return (
        Math.abs(a.x - b.x) < 0.5 &&
        Math.abs(a.y - b.y) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5
    );
}

export type Replacement = {
    element: DrawdyElementSchema;
    rect: Rect;
    wheel: Wheel;
    remove: string[];
};

/**
 * A component's content can't change once it is on the board, so a change is
 * a new widget at the old one's place and size, then the old one removed.
 * Stacked twins of the same wheel, left by two presses that crossed, go too.
 * A wheel whose id a copy elsewhere still shares takes a fresh id, so each
 * widget's buttons name only it from then on.
 */
export function planReplacement(p: {
    driverId: string;
    old: Placed;
    at: Rect;
    others: readonly Placed[];
    next: Wheel;
    newId: string;
    place?: Placement;
}): Replacement {
    const rect = {
        x: p.at.x,
        y: p.at.y,
        width: p.at.width,
        height: p.at.height,
    };
    const twins = p.others.filter(
        (o) =>
            o.el !== p.old.el &&
            o.wheel.wheelId === p.old.wheel.wheelId &&
            sameRect(o.rect, rect)
    );
    const shared = p.others.some(
        (o) =>
            o.el !== p.old.el &&
            !twins.includes(o) &&
            o.wheel.wheelId === p.next.wheelId
    );
    const wheel = shared ? { ...p.next, wheelId: p.newId } : p.next;
    return {
        element: widgetElement(p.driverId, p.newId, wheel, rect, p.place),
        rect,
        wheel,
        remove: [p.old.el, ...twins.map((t) => t.el)],
    };
}
