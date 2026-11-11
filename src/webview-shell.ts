import {
    CHECKBOX,
    EMPTY,
    HINT,
    ICON_BUTTON,
    LABEL_ROW,
    NOTICE,
    OPTION_GRID,
    OPTION_ITEM,
    PRIMARY,
    SCROLL,
    SECONDARY,
    SECONDARY_FOOTER,
    SECTION,
    TEXTAREA,
    TRACK,
    TRACK_ITEM,
} from "../webview/lib/classes";
import { ICONS, icon } from "../webview/lib/icons";
import { PANEL_CSS } from "./panel-css";

const MODE_BUTTONS = (
    [
        ["wheel", "Wheel"],
        ["order", "Order"],
        ["groups", "Groups"],
        ["dice", "Dice"],
        ["coin", "Coin"],
        ["warmup", "Warm-up"],
    ] as const
)
    .map(
        ([mode, label]) =>
            `<button type="button" class="${OPTION_ITEM}" data-mode="${mode}" aria-pressed="false">${icon(ICONS[mode], "size-3.5 shrink-0")}<span class="truncate">${label}</span></button>`
    )
    .join("");

const track = (
    id: string,
    label: string,
    attr: string,
    items: readonly (readonly [string, string])[]
) =>
    `<div id="${id}" role="group" aria-label="${label}" class="${TRACK}">${items
        .map(
            ([value, text]) =>
                `<button type="button" class="${TRACK_ITEM}" data-${attr}="${value}" aria-pressed="false">${text}</button>`
        )
        .join("")}</div>`;

const BODY = `
<main id="panel" class="flex min-h-0 flex-1 flex-col" data-mode="wheel" data-source="people" data-busy="false">
    <div class="${SCROLL}">
        <section class="${SECTION}">
            <div class="${LABEL_ROW}"><span id="mode-label">Mode</span></div>
            <div id="modes" role="group" aria-labelledby="mode-label" class="${OPTION_GRID}">${MODE_BUTTONS}</div>
            <p id="mode-hint" class="${HINT}"></p>
        </section>
        <section id="source-section" class="${SECTION}">
            <div class="${LABEL_ROW}"><span>Pick from</span><span id="entry-count" class="text-fg-subtle tabular-nums" data-count="0"></span></div>
            ${track("sources", "Pick from", "source", [
                ["people", "People here"],
                ["stickies", "Stickies"],
                ["list", "List"],
            ])}
            <div data-pane="people" class="flex flex-col gap-2">
                <div id="people" class="flex flex-wrap gap-1.5 empty:hidden"></div>
                <div id="people-alone" class="${EMPTY}" hidden>
                    ${icon(ICONS.user, "size-5 text-fg-subtle")}
                    <span class="text-label text-fg">Only you are here</span>
                    <span class="${HINT}">The wheel needs at least 2 people on the board. You can type names instead.</span>
                    <button type="button" id="type-names" class="${SECONDARY} mt-2">Type names</button>
                </div>
                <p id="people-blocked" class="${NOTICE}" hidden>Spin can't see who's on the board. Allow it under Manage permissions, or type the names in a list.</p>
            </div>
            <div data-pane="stickies" class="flex flex-col gap-2" hidden>
                <div id="stickies" class="flex flex-wrap gap-1.5 empty:hidden"></div>
                <div id="stickies-empty" class="${EMPTY}">
                    ${icon(ICONS.sticky, "size-5 text-fg-subtle")}
                    <span class="text-label text-fg">Select 2 or more stickies</span>
                    <span class="${HINT}">Spin uses the first line of each one.</span>
                </div>
                <p id="stickies-hint" class="${HINT}" hidden>Select 2 or more other stickies to change the list.</p>
            </div>
            <div data-pane="list" class="flex flex-col gap-2" hidden>
                <textarea id="list" class="${TEXTAREA}" rows="6" spellcheck="false" placeholder="Mali&#10;Ben&#10;Sara" aria-label="Names or options, one per line"></textarea>
                <p class="${HINT}">One per line. Spin keeps the list for next time.</p>
            </div>
        </section>
        <section id="groups-section" class="${SECTION}" hidden>
            <div class="${LABEL_ROW}"><span>Split</span><span id="groups-preview" class="truncate text-fg-subtle"></span></div>
            ${track("groups-by", "Split by", "groups-by", [
                ["count", "Number of groups"],
                ["size", "Group size"],
            ])}
            <div class="flex items-center gap-1">
                <button type="button" id="groups-minus" class="${ICON_BUTTON}" aria-label="Fewer">${icon(ICONS.minus)}</button>
                <output id="groups-n" class="min-w-8 text-center text-label-md text-fg tabular-nums" aria-live="polite"></output>
                <button type="button" id="groups-plus" class="${ICON_BUTTON}" aria-label="More">${icon(ICONS.plus)}</button>
                <span id="groups-unit" class="ml-1 ${HINT}"></span>
            </div>
        </section>
        <section id="dice-section" class="${SECTION}" hidden>
            <div class="${LABEL_ROW}"><span>Dice</span></div>
            ${track("dice-count", "How many dice", "dice-count", [
                ["1", "1 die"],
                ["2", "2 dice"],
                ["3", "3 dice"],
            ])}
            ${track("dice-sides", "Sides", "dice-sides", [
                ["6", "6 sides"],
                ["20", "20 sides"],
            ])}
        </section>
        <section id="warmup-section" class="${SECTION}" hidden>
            <div class="${LABEL_ROW}"><span>Language</span></div>
            ${track("langs", "Language", "lang", [
                ["en", "English"],
                ["th", "ไทย"],
            ])}
        </section>
        <label class="inline-flex cursor-pointer items-center gap-2 text-label text-fg-muted">
            <span class="relative grid place-items-center">
                <input type="checkbox" id="sound" class="${CHECKBOX}" />
                ${icon(ICONS.check, "pointer-events-none absolute hidden size-3 text-on-accent peer-checked:block")}
            </span>
            Tick sound, only you hear it
        </label>
    </div>
    <footer class="flex shrink-0 flex-col gap-2 border-t border-divider px-4 py-3">
        <p id="status" role="status" class="truncate text-body text-fg-subtle empty:hidden"></p>
        <div class="flex items-center gap-2">
            <button type="button" id="remove-winner" class="${SECONDARY_FOOTER}" hidden>${icon(ICONS.remove)}<span>Remove winner</span></button>
            <button type="button" id="spin" class="${PRIMARY}">${icon(ICONS.spin)}<span>Spin</span></button>
        </div>
    </footer>
</main>
`;

export function shellHtml(js: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/google-sans-flex@5.3.2/wght.css" />
<style id="drawdy-styling">:root{/*__DRAWDY_STYLING__*/}</style>
<style>${PANEL_CSS}</style>
</head>
<body class="flex h-screen flex-col overflow-hidden bg-panel font-sans text-body text-fg antialiased">
${BODY}
<script>${js}</script>
</body>
</html>`;
}
