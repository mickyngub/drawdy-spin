import {
    CHECK_ROW,
    CHECKBOX,
    EMPTY,
    FOOTER_SECONDARY,
    HINT,
    INPUT,
    LABEL_ROW,
    NOTICE,
    OPTION_GRID,
    OPTION_ITEM,
    PRIMARY,
    SCROLL,
    SECONDARY,
    SECTION,
} from "../webview/lib/classes";
import { ICONS, icon } from "../webview/lib/icons";
import { MAX_TEXT } from "./lib/entries";
import { PANEL_CSS } from "./panel-css";

const PRESET_BUTTONS = (
    [
        ["people", ICONS.group, "People here"],
        ["yes-no", ICONS.thumb, "Yes or no"],
        ["lunch", ICONS.food, "Lunch ideas"],
        ["warmup-en", ICONS.talk, "Warm-up"],
        ["warmup-th", ICONS.talk, "คำถามอุ่นเครื่อง"],
    ] as const
)
    .map(
        ([preset, path, label]) =>
            `<button type="button" class="${OPTION_ITEM}" data-preset="${preset}">${icon(path, "size-3.5 shrink-0")}<span class="truncate">${label}</span></button>`
    )
    .join("");

const check = (id: string, label: string) => `
<label class="${CHECK_ROW}">
    <span class="relative grid place-items-center">
        <input type="checkbox" id="${id}" class="${CHECKBOX}" />
        ${icon(ICONS.check, "pointer-events-none absolute hidden size-3 text-on-accent peer-checked:block")}
    </span>
    ${label}
</label>`;

const BODY = `
<main id="panel" class="flex min-h-0 flex-1 flex-col" data-state="loading">
    <div class="${SCROLL}">
        <div id="empty" class="${EMPTY}" hidden>
            ${icon(ICONS.wheel, "size-5 text-fg-subtle")}
            <span class="text-label text-fg">No wheel here yet</span>
            <span class="${HINT}">Add one to the board, then fill it with names or ideas.</span>
            <button type="button" id="new-empty" class="${SECONDARY} mt-2 flex-none">${icon(ICONS.add)}<span>New wheel</span></button>
        </div>
        <div id="editor" class="flex flex-col gap-4" hidden>
            <section class="${SECTION}">
                <div class="${LABEL_ROW}">
                    <span id="entries-label">Names or options</span>
                    <span id="count" class="text-fg-subtle tabular-nums" data-count="0"></span>
                </div>
                <input id="add" type="text" class="${INPUT}" maxlength="${MAX_TEXT}" placeholder="Add a name or option" aria-label="Add a name or option" enterkeyhint="done" autocomplete="off" spellcheck="false" />
                <p id="add-hint" class="${HINT}">Press Enter to add. Paste a list to add each line.</p>
                <ul id="entries" role="list" aria-labelledby="entries-label" class="flex flex-col gap-0.5 empty:hidden"></ul>
            </section>
            <section class="${SECTION}">
                <div class="${LABEL_ROW}"><span id="presets-label">Start from</span></div>
                <div id="presets" role="group" aria-labelledby="presets-label" class="${OPTION_GRID}">${PRESET_BUTTONS}</div>
                <p id="notice" role="alert" class="${NOTICE}" hidden></p>
            </section>
            <section class="flex flex-col gap-2.5">
                ${check("remove-picked", "Remove picked names")}
                ${check("sound", "Tick sound, only you hear it")}
            </section>
            <section class="flex gap-2">
                <button type="button" id="new" class="${SECONDARY}">${icon(ICONS.add)}<span>New wheel</span></button>
                <button type="button" id="duplicate" class="${SECONDARY}">${icon(ICONS.copy)}<span>Duplicate</span></button>
            </section>
        </div>
    </div>
    <footer class="flex shrink-0 flex-col gap-2 border-t border-divider px-4 py-3">
        <p id="status" role="status" class="truncate text-body text-fg-subtle empty:hidden"></p>
        <div class="flex items-center gap-2">
            <button type="button" id="reset" class="${FOOTER_SECONDARY}">${icon(ICONS.reset)}<span>Reset</span></button>
            <button type="button" id="spin" class="${PRIMARY}">${icon(ICONS.wheel)}<span>Spin</span></button>
        </div>
    </footer>
    <input type="file" id="photo-input" accept="image/*" hidden />
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
