import type { Entry } from "../lib/entries";
import type { Preset } from "../lib/presets";
import type { Wheel } from "../lib/wheel";

/** The wheel the panel edits, named by its element on the board. */
export type PanelWheel = Wheel & { el: string };

/** A wheel the panel names: its element, and its wheel id in case someone else's press replaced that element. */
type Target = { el: string; wheelId?: string };

export type WebviewToDriver =
    | { type: "ready" }
    | { type: "new" }
    | ({ type: "duplicate" } & Target)
    | ({ type: "edit"; entries: Entry[]; removePicked: boolean } & Target)
    | ({ type: "preset"; preset: Preset } & Target)
    | ({ type: "spin" } & Target)
    | ({ type: "reset" } & Target)
    | { type: "sound"; on: boolean };

export type PanelError = "denied" | "failed" | "alone" | "people-blocked";

export type DriverToWebview =
    | { type: "theme"; cssVars: string }
    | {
          type: "state";
          wheel: PanelWheel | null;
          count: number;
          sound: boolean;
      }
    /** This screen started a spin; the panel plays its ticks if the sound is on. */
    | { type: "spun"; startedAt: number; ticks: number[] }
    | { type: "error"; reason: PanelError };
