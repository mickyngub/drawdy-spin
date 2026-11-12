import type { DrawdyWebviewApi } from "@drawdy/driver-protocol";
import {
    addEntries,
    initialOf,
    MAX_ENTRIES,
    parseList,
    removeEntry,
    renameEntry,
    setLook,
    type Entry,
    type Look,
} from "../src/lib/entries";
import { panelView, type PanelRow } from "../src/lib/panel-model";
import type { Preset } from "../src/lib/presets";
import { landsAt, SPIN_MS } from "../src/lib/wheel";
import type {
    DriverToWebview,
    PanelError,
    PanelWheel,
    WebviewToDriver,
} from "../src/shared/messages";
import {
    AVATAR,
    ICON_BUTTON,
    PICKER,
    ROW,
    ROW_INPUT,
    SECONDARY,
    TILE,
} from "./lib/classes";
import { ICONS, icon } from "./lib/icons";
import { squarePhoto } from "./lib/photo";
import { playSpin, unlockAudio } from "./lib/sound";

declare function acquireDrawdyApi(): DrawdyWebviewApi;

// Edits made here win over state echoed back for this long, so a reply to an older edit can't undo typing.
const DIRTY_MS = 1500;
const NOTICE_MS = 4500;
const EMOJI = [
    "😀",
    "😎",
    "🤩",
    "🥳",
    "🤖",
    "👻",
    "🦊",
    "🐼",
    "🐸",
    "🐵",
    "🦄",
    "🐙",
    "🍕",
    "🍜",
    "🍣",
    "🌮",
    "🍩",
    "🧋",
    "☕",
    "🍦",
    "⭐",
    "🔥",
    "🌈",
    "🎉",
    "🎁",
    "🏆",
    "🎯",
    "💡",
    "🎨",
    "🎧",
    "⚽",
    "🚀",
];
const ERRORS: Record<PanelError, string> = {
    denied: "Spin needs the board permission. Allow it under Manage permissions.",
    failed: "The board didn't take that change. Try again.",
    alone: "Only you are here. Ask people to open the board, or type the names.",
    "people-blocked":
        "Spin can't see who's here. Allow it under Manage permissions, or type the names.",
};

const api = acquireDrawdyApi();
const $ = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;

const panel = $<HTMLElement>("panel");
const stylingEl = $<HTMLStyleElement>("drawdy-styling");
const emptyEl = $<HTMLElement>("empty");
const editor = $<HTMLElement>("editor");
const count = $<HTMLElement>("count");
const addInput = $<HTMLInputElement>("add");
const addHint = $<HTMLElement>("add-hint");
const list = $<HTMLUListElement>("entries");
const notice = $<HTMLElement>("notice");
const removePicked = $<HTMLInputElement>("remove-picked");
const soundInput = $<HTMLInputElement>("sound");
const statusEl = $<HTMLElement>("status");
const spinButton = $<HTMLButtonElement>("spin");
const resetButton = $<HTMLButtonElement>("reset");
const photoInput = $<HTMLInputElement>("photo-input");

let wheel: PanelWheel | null = null;
let dirtyUntil = 0;
let sound = false;
let ready = false;
let pickerFor: string | null = null;
let photoFor: string | null = null;
let focusAdd = false;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let landTimer: ReturnType<typeof setTimeout> | undefined;

const send = (message: WebviewToDriver) => api.postMessage(message);
const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

function commit(entries: Entry[], remove = wheel?.removePicked ?? true) {
    if (!wheel) return;
    wheel = { ...wheel, entries, removePicked: remove };
    dirtyUntil = Date.now() + DIRTY_MS;
    send({
        type: "edit",
        el: wheel.el,
        wheelId: wheel.wheelId,
        entries,
        removePicked: remove,
    });
    render();
}

function showNotice(text: string): void {
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        notice.hidden = true;
    }, NOTICE_MS);
}

function avatarContent(button: HTMLElement, row: PanelRow): void {
    const look = row.photo ? "photo" : row.emoji ? "emoji" : "none";
    const key = `${look}:${row.photo ?? row.emoji ?? initialOf(row.text)}`;
    if (button.dataset.key === key) return;
    button.dataset.key = key;
    button.dataset.look = look;
    if (row.photo) {
        const img = document.createElement("img");
        img.src = row.photo;
        img.alt = "";
        img.className = "size-full object-cover";
        button.replaceChildren(img);
    } else if (row.emoji) {
        button.textContent = row.emoji;
    } else {
        button.innerHTML = `<span class="text-label">${initialOf(row.text).replace(/[<&]/g, "")}</span>`;
    }
}

function rowElement(row: PanelRow, index: number): HTMLLIElement {
    let li = list.querySelector<HTMLLIElement>(
        `li[data-entry="${CSS.escape(row.id)}"]`
    );
    if (!li) {
        li = document.createElement("li");
        li.className = ROW;
        li.dataset.entry = row.id;
        li.innerHTML = `
            <button type="button" class="${AVATAR}" data-role="look" aria-haspopup="true" aria-expanded="false"></button>
            <input type="text" class="${ROW_INPUT}" data-role="text" maxlength="80" autocomplete="off" spellcheck="false" />
            <span data-role="picked" class="hidden shrink-0 items-center gap-1 text-caption text-fg-subtle group-data-[picked=true]:inline-flex">${icon(ICONS.check, "size-3.5")}Picked</span>
            <button type="button" class="${ICON_BUTTON} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" data-role="delete">${icon(ICONS.delete, "size-3.5")}</button>`;
    }
    const look = li.querySelector<HTMLButtonElement>('[data-role="look"]')!;
    const input = li.querySelector<HTMLInputElement>('[data-role="text"]')!;
    const del = li.querySelector<HTMLButtonElement>('[data-role="delete"]')!;
    avatarContent(look, row);
    look.setAttribute("aria-label", `Picture for ${row.text}`);
    look.setAttribute("aria-expanded", String(pickerFor === row.id));
    li.dataset.open = String(pickerFor === row.id);
    li.dataset.picked = String(row.picked);
    if (document.activeElement !== input && input.value !== row.text)
        input.value = row.text;
    input.setAttribute("aria-label", `Entry ${index + 1}`);
    del.setAttribute("aria-label", `Remove ${row.text}`);
    return li;
}

function pickerElement(row: PanelRow): HTMLLIElement {
    const li = document.createElement("li");
    li.dataset.picker = row.id;
    li.className = PICKER;
    li.innerHTML = `
        <div class="grid grid-cols-8 gap-1" role="group" aria-label="Emoji">${EMOJI.map(
            (e) =>
                `<button type="button" class="${TILE}" data-emoji="${e}" aria-pressed="${row.emoji === e}" aria-label="${e}">${e}</button>`
        ).join("")}</div>
        <div class="flex gap-2">
            <button type="button" class="${SECONDARY}" data-role="photo">${icon(ICONS.image, "size-3.5")}<span>Photo</span></button>
            <button type="button" class="${SECONDARY}" data-role="clear"${row.emoji || row.photo ? "" : " disabled"}>${icon(ICONS.close, "size-3.5")}<span>No picture</span></button>
        </div>`;
    return li;
}

function renderRows(rows: PanelRow[]): void {
    const wanted: HTMLLIElement[] = [];
    rows.forEach((row, i) => {
        wanted.push(rowElement(row, i));
        if (pickerFor === row.id) {
            const existing = list.querySelector<HTMLLIElement>(
                `li[data-picker="${CSS.escape(row.id)}"]`
            );
            wanted.push(existing ?? pickerElement(row));
        }
    });
    const current = [...list.children];
    if (
        current.length === wanted.length &&
        current.every((node, i) => node === wanted[i])
    )
        return;
    for (const node of current)
        if (!wanted.includes(node as HTMLLIElement)) node.remove();
    wanted.forEach((node, i) => {
        if (list.children[i] !== node)
            list.insertBefore(node, list.children[i] ?? null);
    });
}

function statusText(view: ReturnType<typeof panelView>): string {
    switch (view.status.kind) {
        case "empty":
            return "Add names or options to spin.";
        case "spinning":
            return "Spinning…";
        case "all-picked":
            return "Everyone's been picked. Reset to start again.";
        case "picked":
            return `Picked ${view.status.text}`;
        case "none":
            return "";
    }
}

function render(): void {
    soundInput.checked = sound;
    if (!wheel) {
        panel.dataset.state = ready ? "empty" : "loading";
        emptyEl.hidden = !ready;
        editor.hidden = true;
        statusEl.textContent = "";
        spinButton.disabled = true;
        resetButton.disabled = true;
        return;
    }
    const view = panelView(wheel, Date.now());
    panel.dataset.state = "editing";
    panel.dataset.phase = view.spinning ? "spinning" : view.status.kind;
    emptyEl.hidden = true;
    editor.hidden = false;
    count.dataset.count = String(view.total);
    count.textContent =
        wheel.removePicked && view.total > 0
            ? `${view.left} of ${view.total} left`
            : `${view.total} of ${MAX_ENTRIES}`;
    addInput.disabled = view.full;
    addInput.placeholder = view.full
        ? `A wheel holds ${MAX_ENTRIES}`
        : "Add a name or option";
    addHint.hidden = view.total > 0;
    if (pickerFor && !view.rows.some((r) => r.id === pickerFor))
        pickerFor = null;
    renderRows(view.rows);
    removePicked.checked = wheel.removePicked;
    spinButton.disabled = !view.canSpin;
    resetButton.disabled = !view.canReset;
    statusEl.textContent = statusText(view);
    clearTimeout(landTimer);
    const end = landsAt(wheel);
    if (view.spinning && end !== null)
        landTimer = setTimeout(render, Math.max(0, end - Date.now()) + 30);
}

function entriesNow(): Entry[] {
    return wheel ? wheel.entries.map(({ ...e }) => e) : [];
}

function add(texts: string[]): void {
    if (!wheel || texts.length === 0) return;
    const before = wheel.entries.length;
    const next = addEntries(wheel.entries, texts, newId);
    if (next.length === before) return;
    commit(next);
    if (before + texts.length > MAX_ENTRIES)
        showNotice(`A wheel holds ${MAX_ENTRIES}. The rest were left out.`);
    list.lastElementChild?.scrollIntoView({ block: "nearest" });
}

function setPicture(id: string, look: Look): void {
    if (!wheel) return;
    commit(setLook(wheel.entries, id, look));
}

function handle(message: DriverToWebview): void {
    switch (message.type) {
        case "theme":
            stylingEl.textContent = `:root{${message.cssVars}}`;
            return;
        case "state": {
            ready = true;
            sound = message.sound;
            const incoming = message.wheel;
            const previous = wheel?.wheelId;
            const keepLocal =
                incoming &&
                wheel &&
                incoming.wheelId === wheel.wheelId &&
                Date.now() < dirtyUntil;
            wheel = incoming
                ? keepLocal
                    ? {
                          ...incoming,
                          entries: wheel!.entries,
                          removePicked: wheel!.removePicked,
                      }
                    : incoming
                : null;
            const switched = incoming?.wheelId !== previous;
            if (switched) pickerFor = null;
            render();
            if (switched && focusAdd && incoming) {
                focusAdd = false;
                addInput.focus();
            }
            return;
        }
        case "spun":
            if (sound)
                playSpin(
                    message.ticks,
                    SPIN_MS,
                    Date.now() - message.startedAt
                );
            return;
        case "error":
            showNotice(ERRORS[message.reason] ?? ERRORS.failed);
            return;
    }
}

addInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    const text = addInput.value;
    if (!text.trim()) return;
    addInput.value = "";
    add([text]);
});

addInput.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!/\r?\n/.test(text.trim())) return;
    event.preventDefault();
    add(parseList(text));
});

list.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.role !== "text" || !wheel) return;
    const id = input.closest<HTMLElement>("li[data-entry]")?.dataset.entry;
    if (!id || !input.value.trim()) return;
    commit(renameEntry(wheel.entries, id, input.value));
});

list.addEventListener("focusout", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.role !== "text" || !wheel) return;
    const id = input.closest<HTMLElement>("li[data-entry]")?.dataset.entry;
    const entry = wheel.entries.find((e) => e.id === id);
    if (entry && !input.value.trim()) input.value = entry.text;
});

list.addEventListener("keydown", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.role === "text" && event.key === "Enter") {
        event.preventDefault();
        input.blur();
    }
});

list.addEventListener("click", (event) => {
    if (!wheel) return;
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button) return;
    const row = button.closest<HTMLElement>("li[data-entry]");
    const picker = button.closest<HTMLElement>("li[data-picker]");
    if (row && button.dataset.role === "delete") {
        const id = row.dataset.entry!;
        if (pickerFor === id) pickerFor = null;
        commit(removeEntry(wheel.entries, id));
        return;
    }
    if (row && button.dataset.role === "look") {
        const id = row.dataset.entry!;
        pickerFor = pickerFor === id ? null : id;
        list.querySelector(`li[data-picker]`)?.remove();
        render();
        return;
    }
    if (!picker) return;
    const id = picker.dataset.picker!;
    if (button.dataset.emoji) {
        setPicture(id, { emoji: button.dataset.emoji });
        pickerFor = null;
        picker.remove();
        render();
    } else if (button.dataset.role === "clear") {
        setPicture(id, null);
        pickerFor = null;
        picker.remove();
        render();
    } else if (button.dataset.role === "photo") {
        photoFor = id;
        photoInput.value = "";
        photoInput.click();
    }
});

photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    const id = photoFor;
    photoFor = null;
    if (!file || !id) return;
    const photo = await squarePhoto(file);
    if (!photo) {
        showNotice("That picture couldn't be read. Try a JPEG or PNG.");
        return;
    }
    setPicture(id, { photo });
    pickerFor = null;
    list.querySelector(`li[data-picker]`)?.remove();
    render();
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-preset]"
))
    button.addEventListener("click", () => {
        if (!wheel) return;
        dirtyUntil = 0;
        pickerFor = null;
        send({
            type: "preset",
            el: wheel.el,
            preset: button.dataset.preset as Preset,
        });
    });

removePicked.addEventListener("change", () => {
    if (wheel) commit(entriesNow(), removePicked.checked);
});

soundInput.addEventListener("change", () => {
    if (soundInput.checked) unlockAudio();
    sound = soundInput.checked;
    send({ type: "sound", on: sound });
});

spinButton.addEventListener("click", () => {
    if (!wheel || spinButton.disabled) return;
    if (sound) unlockAudio();
    send({ type: "spin", el: wheel.el, wheelId: wheel.wheelId });
});

resetButton.addEventListener("click", () => {
    if (wheel && !resetButton.disabled)
        send({ type: "reset", el: wheel.el, wheelId: wheel.wheelId });
});

for (const id of ["new", "new-empty"])
    $<HTMLButtonElement>(id).addEventListener("click", () => {
        focusAdd = true;
        send({ type: "new" });
    });

$<HTMLButtonElement>("duplicate").addEventListener("click", () => {
    if (wheel)
        send({ type: "duplicate", el: wheel.el, wheelId: wheel.wheelId });
});

// Any click in the panel lets the browser start audio, so a spin pressed on the board later can tick.
document.addEventListener("pointerdown", () => {
    if (sound) unlockAudio();
});

api.onMessage((raw) => {
    if (!raw || typeof raw !== "object") return;
    handle(raw as DriverToWebview);
});

render();
send({ type: "ready" });
