import type { DrawdyWebviewApi } from "@drawdy/driver-protocol";
import { SPIN_MS, tickTimes } from "../src/lib/animation-plan";
import {
    GROUPS_N,
    MIN_ENTRIES,
    groupSizes,
    parseList,
    usesEntries,
    type DiceSides,
    type GroupsBy,
    type Mode,
    type Source,
} from "../src/lib/modes";
import type { Lang } from "../src/lib/prompts";
import {
    DEFAULT_SETTINGS,
    normalizeSettings,
    rememberPrompt,
    type DriverToWebview,
    type ErrorReason,
    type Settings,
    type StickyItem,
    type WebviewToDriver,
} from "../src/shared/messages";
import { CHIP } from "./lib/classes";
import { groupsPreview, statusFor, withoutEntry } from "./lib/list";
import { playSpin, unlockAudio } from "./lib/sound";

declare function acquireDrawdyApi(): DrawdyWebviewApi;

const SAVE_DELAY_MS = 300;
const BUSY_TIMEOUT_MS = 8000;

const HINTS: Record<Mode, string> = {
    wheel: "Spin the wheel to pick one.",
    order: "Shuffle everyone into a random order.",
    groups: "Split into groups that differ by one at most.",
    dice: "Roll up to three dice.",
    coin: "Heads or tails.",
    warmup: "One question to get everyone talking.",
};

const ERRORS: Record<ErrorReason, string> = {
    blocked:
        "Spin needs permission to add to the board. Allow it under Manage permissions.",
    failed: "The board couldn't take the card. Try again.",
    "too-few": "Spin needs at least 2 to pick from.",
};

const api = acquireDrawdyApi();
const byId = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
const all = <T extends HTMLElement>(selector: string) => [
    ...document.querySelectorAll<T>(selector),
];

const panel = byId<HTMLElement>("panel");
const stylingEl = byId<HTMLStyleElement>("drawdy-styling");
const modeHint = byId<HTMLParagraphElement>("mode-hint");
const sourceSection = byId<HTMLElement>("source-section");
const entryCount = byId<HTMLSpanElement>("entry-count");
const peopleEl = byId<HTMLDivElement>("people");
const peopleAlone = byId<HTMLDivElement>("people-alone");
const peopleBlocked = byId<HTMLParagraphElement>("people-blocked");
const stickiesEl = byId<HTMLDivElement>("stickies");
const stickiesEmpty = byId<HTMLDivElement>("stickies-empty");
const stickiesHint = byId<HTMLParagraphElement>("stickies-hint");
const listInput = byId<HTMLTextAreaElement>("list");
const groupsSection = byId<HTMLElement>("groups-section");
const groupsPreviewEl = byId<HTMLSpanElement>("groups-preview");
const groupsN = byId<HTMLOutputElement>("groups-n");
const groupsUnit = byId<HTMLSpanElement>("groups-unit");
const groupsMinus = byId<HTMLButtonElement>("groups-minus");
const groupsPlus = byId<HTMLButtonElement>("groups-plus");
const diceSection = byId<HTMLElement>("dice-section");
const warmupSection = byId<HTMLElement>("warmup-section");
const soundInput = byId<HTMLInputElement>("sound");
const statusEl = byId<HTMLParagraphElement>("status");
const removeButton = byId<HTMLButtonElement>("remove-winner");
const spinButton = byId<HTMLButtonElement>("spin");

type People = {
    status: "idle" | "loading" | "ok" | "blocked";
    names: string[];
};
type Last = {
    mode: Mode;
    source: Source;
    label: string;
    winner: { label: string; stickyId: string | null } | null;
};

let settings: Settings = DEFAULT_SETTINGS;
let ready = false;
let people: People = { status: "idle", names: [] };
let stickies: StickyItem[] = [];
let selectedStickies = 0;
let stickiesWatched = false;
let busy = false;
let pending: { mode: Mode; source: Source; entries: Entry[] } | null = null;
let last: Last | null = null;
let status = "";
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let busyTimer: ReturnType<typeof setTimeout> | undefined;

type Entry = { label: string; stickyId: string | null };

const post = (message: WebviewToDriver): void => api.postMessage(message);

function save(next: Settings): void {
    settings = next;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(
        () => post({ type: "save", settings }),
        SAVE_DELAY_MS
    );
}

function entries(): Entry[] {
    switch (settings.source) {
        case "people":
            return people.names.map((label) => ({ label, stickyId: null }));
        case "stickies":
            return stickies.map((s) => ({ label: s.label, stickyId: s.id }));
        case "list":
            return parseList(settings.list).map((label) => ({
                label,
                stickyId: null,
            }));
    }
}

function chips(container: HTMLElement, labels: string[]): void {
    container.replaceChildren(
        ...labels.map((label) => {
            const chip = document.createElement("span");
            chip.className = CHIP;
            chip.textContent = label;
            chip.title = label;
            return chip;
        })
    );
}

function countText(source: Source, n: number): string {
    if (source === "people") return n === 1 ? "1 person" : `${n} people`;
    if (source === "stickies") return n === 1 ? "1 sticky" : `${n} stickies`;
    return n === 1 ? "1 line" : `${n} lines`;
}

function ensureSourceData(): void {
    if (!ready || !usesEntries(settings.mode)) return;
    if (settings.source === "people" && people.status === "idle") {
        people = { status: "loading", names: [] };
        post({ type: "people" });
    }
    if (settings.source === "stickies" && !stickiesWatched) {
        stickiesWatched = true;
        post({ type: "stickies" });
    }
}

function setPressed(selector: string, attr: string, value: string): void {
    for (const button of all<HTMLButtonElement>(selector))
        button.setAttribute(
            "aria-pressed",
            String(button.getAttribute(attr) === value)
        );
}

function render(): void {
    const { mode, source, options } = settings;
    const list = entries();
    const needsEntries = usesEntries(mode);
    panel.dataset.mode = mode;
    panel.dataset.source = source;
    panel.dataset.busy = String(busy);

    setPressed("#modes [data-mode]", "data-mode", mode);
    modeHint.textContent = HINTS[mode];

    sourceSection.hidden = !needsEntries;
    setPressed("#sources [data-source]", "data-source", source);
    for (const pane of all<HTMLElement>("[data-pane]"))
        pane.hidden = pane.dataset.pane !== source;
    entryCount.dataset.count = String(list.length);
    entryCount.textContent =
        source === "people" && people.status !== "ok"
            ? ""
            : countText(source, list.length);

    chips(peopleEl, people.status === "ok" ? people.names : []);
    peopleAlone.hidden = !(
        people.status === "ok" && people.names.length < MIN_ENTRIES
    );
    peopleBlocked.hidden = people.status !== "blocked";

    chips(
        stickiesEl,
        stickies.map((s) => s.label)
    );
    stickiesEmpty.hidden = stickies.length > 0;
    stickiesHint.hidden =
        stickies.length === 0 || selectedStickies >= MIN_ENTRIES;

    if (
        document.activeElement !== listInput &&
        listInput.value !== settings.list
    )
        listInput.value = settings.list;

    groupsSection.hidden = mode !== "groups";
    setPressed("[data-groups-by]", "data-groups-by", options.groupsBy);
    groupsN.value = String(options.groupsN);
    groupsUnit.textContent =
        options.groupsBy === "count" ? "groups" : "per group";
    groupsMinus.disabled = options.groupsN <= GROUPS_N.min;
    groupsPlus.disabled = options.groupsN >= GROUPS_N.max;
    groupsPreviewEl.textContent =
        list.length >= MIN_ENTRIES
            ? groupsPreview(
                  groupSizes(list.length, options.groupsBy, options.groupsN)
              )
            : "";

    diceSection.hidden = mode !== "dice";
    setPressed(
        "[data-dice-count]",
        "data-dice-count",
        String(options.diceCount)
    );
    setPressed(
        "[data-dice-sides]",
        "data-dice-sides",
        String(options.diceSides)
    );
    warmupSection.hidden = mode !== "warmup";
    setPressed("[data-lang]", "data-lang", options.lang);
    soundInput.checked = settings.sound;

    const tooFew = needsEntries && list.length < MIN_ENTRIES;
    spinButton.disabled = !ready || busy || tooFew;
    spinButton.setAttribute("aria-busy", String(busy));
    const canRemove =
        !busy &&
        last?.winner != null &&
        last.mode === "wheel" &&
        last.source === source &&
        source !== "people" &&
        mode === "wheel";
    removeButton.hidden = !canRemove;
    statusEl.textContent =
        status ||
        (tooFew && source === "list" ? "Type at least 2 lines to spin." : "");
}

function setStatus(text: string): void {
    status = text;
    render();
}

function setBusy(next: boolean): void {
    busy = next;
    clearTimeout(busyTimer);
    if (busy)
        busyTimer = setTimeout(() => {
            busy = false;
            render();
        }, BUSY_TIMEOUT_MS);
    render();
}

function spin(): void {
    if (busy || spinButton.disabled) return;
    if (settings.sound) unlockAudio();
    const list = entries();
    const { mode, source } = settings;
    pending = { mode, source, entries: list };
    status = "";
    setBusy(true);
    post({
        type: "spin",
        request: {
            mode,
            source,
            entries: usesEntries(mode) ? list.map((e) => e.label) : [],
            stickyIds: usesEntries(mode)
                ? list.map((e) => e.stickyId ?? "")
                : [],
            options: {
                ...settings.options,
                avoid: settings.recent[settings.options.lang],
            },
        },
    });
}

function removeWinner(): void {
    const winner = last?.winner;
    if (!winner || !last) return;
    if (last.source === "list")
        save({ ...settings, list: withoutEntry(settings.list, winner.label) });
    if (last.source === "stickies")
        stickies = stickies.filter((s) => s.id !== winner.stickyId);
    last = { ...last, winner: null };
    setStatus(`Removed ${winner.label}`);
}

function handle(message: DriverToWebview): void {
    switch (message.type) {
        case "theme":
            stylingEl.textContent = `:root{${message.cssVars}}`;
            return;
        case "init":
            settings = message.settings ?? DEFAULT_SETTINGS;
            ready = true;
            ensureSourceData();
            render();
            return;
        case "people":
            people = { status: message.status, names: message.names };
            render();
            return;
        case "stickies":
            selectedStickies = message.items.length;
            if (message.items.length >= MIN_ENTRIES) stickies = message.items;
            render();
            return;
        case "spun": {
            const p = pending;
            pending = null;
            if (!p) return;
            const winner =
                message.plan.mode === "wheel"
                    ? (p.entries[message.plan.winner] ?? null)
                    : null;
            last = {
                mode: p.mode,
                source: p.source,
                label: message.label,
                winner,
            };
            if (message.prompt)
                save(
                    rememberPrompt(
                        settings,
                        message.prompt.lang,
                        message.prompt.index
                    )
                );
            if (settings.sound)
                playSpin(
                    tickTimes(message.plan),
                    SPIN_MS,
                    Date.now() - message.startedAt
                );
            setStatus("Spinning…");
            return;
        }
        case "landed":
            setBusy(false);
            if (last) setStatus(statusFor(last.mode, last.label));
            return;
        case "error":
            pending = null;
            setBusy(false);
            setStatus(ERRORS[message.reason]);
            return;
    }
}

for (const button of all<HTMLButtonElement>("#modes [data-mode]"))
    button.addEventListener("click", () => {
        status = "";
        save({ ...settings, mode: button.dataset.mode as Mode });
        ensureSourceData();
        render();
    });

for (const button of all<HTMLButtonElement>("#sources [data-source]"))
    button.addEventListener("click", () => {
        status = "";
        save({ ...settings, source: button.dataset.source as Source });
        if (settings.source === "people" && people.status === "blocked")
            people = { status: "idle", names: [] };
        ensureSourceData();
        render();
    });

byId<HTMLButtonElement>("type-names").addEventListener("click", () => {
    save({ ...settings, source: "list" });
    render();
    listInput.focus();
});

listInput.addEventListener("input", () => {
    status = "";
    save({ ...settings, list: listInput.value });
    render();
});

const setOption = (patch: Partial<Settings["options"]>) => {
    save({ ...settings, options: { ...settings.options, ...patch } });
    render();
};

for (const button of all<HTMLButtonElement>("[data-groups-by]"))
    button.addEventListener("click", () =>
        setOption({ groupsBy: button.dataset.groupsBy as GroupsBy })
    );
groupsMinus.addEventListener("click", () =>
    setOption({ groupsN: Math.max(GROUPS_N.min, settings.options.groupsN - 1) })
);
groupsPlus.addEventListener("click", () =>
    setOption({ groupsN: Math.min(GROUPS_N.max, settings.options.groupsN + 1) })
);
for (const button of all<HTMLButtonElement>("[data-dice-count]"))
    button.addEventListener("click", () =>
        setOption({ diceCount: Number(button.dataset.diceCount) })
    );
for (const button of all<HTMLButtonElement>("[data-dice-sides]"))
    button.addEventListener("click", () =>
        setOption({ diceSides: Number(button.dataset.diceSides) as DiceSides })
    );
for (const button of all<HTMLButtonElement>("[data-lang]"))
    button.addEventListener("click", () =>
        setOption({ lang: button.dataset.lang as Lang })
    );
soundInput.addEventListener("change", () => {
    if (soundInput.checked) unlockAudio();
    save({ ...settings, sound: soundInput.checked });
    render();
});
spinButton.addEventListener("click", spin);
removeButton.addEventListener("click", removeWinner);

api.onMessage((raw) => {
    if (!raw || typeof raw !== "object") return;
    handle(raw as DriverToWebview);
});

settings = normalizeSettings(DEFAULT_SETTINGS);
render();
post({ type: "ready" });
