import type { AnimationPlan } from "../lib/animation-plan";
import {
    MODES,
    SOURCES,
    normalizeOptions,
    type Mode,
    type ModeOptions,
    type Source,
} from "../lib/modes";
import { LANGS, type Lang } from "../lib/prompts";

const RECENT_PROMPTS = 40;
const MAX_LIST_CHARS = 8000;

export type Settings = {
    v: 1;
    mode: Mode;
    source: Source;
    list: string;
    options: Omit<ModeOptions, "avoid">;
    recent: Record<Lang, number[]>;
    sound: boolean;
};

export type StickyItem = { id: string; label: string };

export type SpinRequest = {
    mode: Mode;
    source: Source;
    entries: string[];
    stickyIds: string[];
    options: ModeOptions;
};

export type ErrorReason = "blocked" | "failed" | "too-few";

export type WebviewToDriver =
    | { type: "ready" }
    | { type: "save"; settings: Settings }
    | { type: "people" }
    | { type: "stickies" }
    | { type: "spin"; request: SpinRequest };

export type DriverToWebview =
    | { type: "theme"; cssVars: string }
    | { type: "init"; settings: Settings | null }
    | { type: "people"; status: "ok" | "blocked"; names: string[] }
    | { type: "stickies"; items: StickyItem[] }
    | {
          type: "spun";
          cardId: string;
          startedAt: number;
          plan: AnimationPlan;
          label: string;
          prompt: { lang: Lang; index: number } | null;
      }
    | { type: "landed"; cardId: string }
    | { type: "error"; reason: ErrorReason };

export const DEFAULT_SETTINGS: Settings = {
    v: 1,
    mode: "wheel",
    source: "people",
    list: "",
    options: {
        groupsBy: "count",
        groupsN: 2,
        diceCount: 1,
        diceSides: 6,
        lang: "en",
    },
    recent: { en: [], th: [] },
    sound: false,
};

export function normalizeSettings(raw: unknown): Settings {
    const s = (raw && typeof raw === "object" ? raw : {}) as Record<
        string,
        unknown
    >;
    const { avoid: _avoid, ...options } = normalizeOptions(s.options);
    const recentRaw = (
        s.recent && typeof s.recent === "object" ? s.recent : {}
    ) as Record<string, unknown>;
    const recent = Object.fromEntries(
        LANGS.map((lang) => [
            lang,
            normalizeOptions({ avoid: recentRaw[lang] }).avoid.slice(
                -RECENT_PROMPTS
            ),
        ])
    ) as Record<Lang, number[]>;
    return {
        v: 1,
        mode: MODES.includes(s.mode as Mode)
            ? (s.mode as Mode)
            : DEFAULT_SETTINGS.mode,
        source: SOURCES.includes(s.source as Source)
            ? (s.source as Source)
            : DEFAULT_SETTINGS.source,
        list: typeof s.list === "string" ? s.list.slice(0, MAX_LIST_CHARS) : "",
        options,
        recent,
        sound: s.sound === true,
    };
}

export function rememberPrompt(
    settings: Settings,
    lang: Lang,
    index: number
): Settings {
    const list = [...settings.recent[lang].filter((i) => i !== index), index];
    return {
        ...settings,
        recent: { ...settings.recent, [lang]: list.slice(-RECENT_PROMPTS) },
    };
}
