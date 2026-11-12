// Class strings from the house panel recipes (drawdy-listing references/panel-ui.md).
const RING =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const SCROLL =
    "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-width:thin] [scrollbar-color:var(--color-line-strong)_transparent]";

export const SECTION = "flex flex-col gap-2";

export const LABEL_ROW =
    "flex items-center justify-between gap-2 text-label text-fg-muted";

export const HINT = "text-body text-fg-subtle";

export const INPUT =
    "h-9 w-full rounded-xl border border-line bg-subtle px-3 text-[13px] leading-5 text-fg placeholder:text-fg-disabled transition-colors hover:bg-hover focus:border-line-strong focus:bg-active focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export const ICON_BUTTON = `inline-grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-hover hover:text-fg active:bg-pressed ${RING}`;

export const SECONDARY = `inline-flex h-7.5 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-subtle px-2.5 text-label text-fg-muted transition-colors hover:bg-hover hover:text-fg active:bg-pressed disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-subtle ${RING}`;

export const FOOTER_SECONDARY = `inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-subtle px-3 text-label-md text-fg-muted transition-colors hover:bg-hover hover:text-fg active:bg-pressed disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-subtle ${RING}`;

export const PRIMARY =
    "inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-label-md text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-disabled disabled:text-fg-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel";

export const OPTION_GRID =
    "grid grid-cols-2 gap-0.5 rounded-lg bg-control-subtle p-0.5";

export const OPTION_ITEM = `flex h-7 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-1 text-label text-fg-subtle transition-colors hover:bg-control hover:text-fg active:bg-pressed last:odd:col-span-2 ${RING}`;

export const CHECK_ROW =
    "inline-flex cursor-pointer items-center gap-2 text-label text-fg-muted";

export const CHECKBOX =
    "peer size-4 cursor-pointer appearance-none rounded-sm border border-line-strong checked:border-transparent checked:bg-accent-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const EMPTY =
    "flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center";

export const NOTICE = "rounded-lg bg-warning/15 px-3 py-2 text-body text-fg";

export const ROW =
    "group flex h-9 items-center gap-2 rounded-lg pr-0.5 pl-1 transition-colors hover:bg-hover data-[open=true]:bg-hover";

export const AVATAR = `relative grid size-7 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-control-subtle text-[15px] leading-none text-fg-muted ring-1 ring-line-strong transition-colors hover:bg-control ${RING}`;

export const ROW_INPUT =
    "h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] leading-5 text-fg placeholder:text-fg-disabled focus:bg-active focus:outline-none focus:ring-1 focus:ring-ring group-data-[picked=true]:text-fg-subtle";

export const PICKER =
    "flex flex-col gap-2 rounded-xl border border-line bg-section p-2";

export const TILE = `grid aspect-square cursor-pointer place-items-center rounded-lg bg-subtle text-[17px] leading-none transition-colors hover:bg-hover active:bg-pressed aria-pressed:ring-2 aria-pressed:ring-accent ${RING}`;
