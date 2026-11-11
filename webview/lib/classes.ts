const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const SCROLL =
    "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-width:thin] [scrollbar-color:var(--color-line-strong)_transparent]";

export const SECTION = "flex flex-col gap-2";

export const LABEL_ROW =
    "flex items-center justify-between gap-2 text-label text-fg-muted";

export const HINT = "text-body text-fg-subtle";

export const TRACK = "flex h-8 gap-0.5 rounded-lg bg-control-subtle p-0.5";

export const TRACK_ITEM = `flex-1 cursor-pointer truncate rounded-md px-2 text-label text-fg-subtle transition-colors hover:text-fg aria-pressed:bg-control aria-pressed:text-fg ${FOCUS}`;

export const OPTION_GRID =
    "grid grid-cols-3 gap-0.5 rounded-lg bg-control-subtle p-0.5";

export const OPTION_ITEM = `flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-1 text-label text-fg-subtle transition-colors hover:text-fg aria-pressed:bg-control aria-pressed:text-fg ${FOCUS}`;

export const CHIP =
    "inline-flex h-6 max-w-full items-center truncate rounded-full bg-subtle px-2.5 text-label text-fg-muted";

export const TEXTAREA =
    "min-h-28 w-full resize-none rounded-xl border border-line bg-subtle px-3 py-2 text-[13px] leading-5 text-fg placeholder:text-fg-disabled transition-colors hover:bg-hover focus:border-line-strong focus:bg-active focus:outline-none focus:ring-1 focus:ring-ring";

export const EMPTY =
    "flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong px-4 py-5 text-center";

export const NOTICE = "rounded-lg bg-warning/15 px-3 py-2 text-body text-fg";

export const SECONDARY = `inline-flex h-7.5 cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-subtle px-2.5 text-label text-fg-muted transition-colors hover:bg-hover hover:text-fg active:bg-pressed disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-subtle ${FOCUS}`;

export const SECONDARY_FOOTER = `inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-subtle px-3 text-label-md text-fg-muted transition-colors hover:bg-hover hover:text-fg active:bg-pressed disabled:cursor-not-allowed disabled:text-fg-disabled ${FOCUS}`;

export const ICON_BUTTON = `inline-grid size-7.5 cursor-pointer place-items-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg active:bg-pressed disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent ${FOCUS}`;

export const PRIMARY = `inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-label-md text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-disabled disabled:text-fg-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel`;

export const CHECKBOX =
    "peer size-4 cursor-pointer appearance-none rounded-sm border border-line-strong checked:border-transparent checked:bg-accent-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
