import { graphemes, initialOf, type Entry } from "../src/lib/entries";
import { FACE, HUB_R, RESET_PILL, RIBBON_Y, WHEEL } from "../src/lib/layout";
import { between, deriveSeed, mulberry32 } from "../src/lib/rng";
import {
    angleAt,
    clamp01,
    easeOutBack,
    frameAt,
    planOf,
    type Frame,
} from "../src/lib/spin-plan";
import {
    canReset,
    entryById,
    mod,
    readWheel,
    remaining,
    slicesOf,
    type Wheel,
} from "../src/lib/wheel";

const FONT =
    '"Fredoka", "Noto Sans Thai", "Leelawadee UI", Thonburi, system-ui, sans-serif';
const EMOJI_FONT =
    '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const CELEBRATE_MS = 2000;
const POP_MS = 420;
const BOUNCE_MS = 520;
const CONFETTI = 72;
const PICTURE_MAX = 10;
const TAU = Math.PI * 2;

const raw = document.getElementById("spin")?.textContent ?? "null";
const wheel: Wheel = readWheel(JSON.parse(raw)) ?? {
    v: 2,
    wheelId: "",
    entries: [],
    picked: [],
    removePicked: true,
};
const openedAt = Date.now();
const canvas = document.getElementById("wheel") as HTMLCanvasElement;
const probe = document.getElementById("probe") as HTMLElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const slices = slicesOf(wheel);
const plan = planOf(wheel);
const left = remaining(wheel).length;
const resettable = canReset(wheel);
const result = entryById(wheel, wheel.lastSpin?.result);
const pictures = slices.length <= PICTURE_MAX;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

type Palette = {
    paper: string;
    ink: string;
    inkSoft: string;
    sticker: string;
    edge: string;
    chip: string;
    chipInk: string;
    chipSoft: string;
    lime: string;
    veil: string;
    slices: string[];
};

function readPalette(): Palette {
    const read = (name: string) => {
        probe.style.color = `var(--color-${name})`;
        return getComputedStyle(probe).color;
    };
    return {
        paper: read("paper"),
        ink: read("ink"),
        inkSoft: read("ink-soft"),
        sticker: read("sticker"),
        edge: read("edge"),
        chip: read("chip"),
        chipInk: read("chip-ink"),
        chipSoft: read("chip-soft"),
        lime: read("lime"),
        veil: read("veil"),
        slices: Array.from({ length: 8 }, (_, i) => read(`slice-${i + 1}`)),
    };
}

let palette = readPalette();
const transparent = (colour: string) =>
    colour === "transparent" || /,\s*0\)$|\/\s*0\)$/.test(colour);

const photos = new Map<string, HTMLImageElement>();
for (const entry of slices) {
    if (!entry.photo) continue;
    const img = new Image();
    img.onload = () => request();
    img.src = entry.photo;
    photos.set(entry.id, img);
}

let dpr = 1;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let raf = 0;
let previousAngle: number | null = null;

const font = (size: number) => `600 ${size}px ${FONT}`;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;

function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // The board scales the widget with its zoom, so the canvas draws finer than the screen needs.
    dpr = Math.min(3, (window.devicePixelRatio || 1) * 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(w / FACE.width, h / FACE.height);
    offsetX = (w - FACE.width * scale) / 2;
    offsetY = (h - FACE.height * scale) / 2;
    request();
}

function fit(text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    const parts = graphemes(text);
    while (parts.length > 1) {
        parts.pop();
        const candidate = `${parts.join("").trimEnd()}…`;
        if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    }
    return "…";
}

function wrap(text: string, maxWidth: number, maxLines: number): string[] {
    let words: string[];
    try {
        words = [
            ...new Intl.Segmenter(undefined, { granularity: "word" }).segment(
                text
            ),
        ].map((s) => s.segment);
    } catch {
        words = text.split(/(\s+)/);
    }
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const next = line + word;
        if (ctx.measureText(next).width <= maxWidth || line === "") {
            line = next;
            continue;
        }
        lines.push(line.trimEnd());
        line = word.trimStart();
    }
    if (line.trim()) lines.push(line.trimEnd());
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(`${kept[maxLines - 1]}…`, maxWidth);
    return kept;
}

function sliceColour(i: number, n: number): string {
    const k = palette.slices.length;
    // Keep the last slice from matching the first when they meet.
    if (n > 1 && i === n - 1 && (n - 1) % k === 0) return palette.slices[3];
    return palette.slices[i % k];
}

function circle(x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
}

function slicePath(
    i: number,
    angle: number,
    seg: number,
    r: number = WHEEL.r
): void {
    const { cx, cy } = WHEEL;
    ctx.beginPath();
    if (slices.length === 1) {
        ctx.arc(cx, cy, r, 0, TAU);
        return;
    }
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, rad(angle + i * seg), rad(angle + (i + 1) * seg));
    ctx.closePath();
}

function badge(entry: Entry, x: number, y: number, r: number, pop = 1): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    circle(0, 0, r);
    ctx.fillStyle = palette.chip;
    ctx.fill();
    const photo = photos.get(entry.id);
    if (entry.photo && photo?.complete && photo.naturalWidth > 0) {
        ctx.save();
        circle(0, 0, r);
        ctx.clip();
        ctx.drawImage(photo, -r, -r, 2 * r, 2 * r);
        ctx.restore();
    } else if (entry.emoji) {
        ctx.font = `${Math.round(r * 1.12)}px ${EMOJI_FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(entry.emoji, 0, r * 0.07);
    } else {
        ctx.font = font(Math.round(r * 1.05));
        ctx.fillStyle = palette.chipInk;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initialOf(entry.text), 0, r * 0.06);
    }
    circle(0, 0, r);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.stroke();
    ctx.restore();
}

/** Text along the slice's outer arc, reading clockwise, shrunk then cut to fit. */
function arcText(text: string, centreDeg: number, radius: number, max: number) {
    let size = slices.length <= 6 ? 17 : 15;
    let parts: string[] = [];
    let widths: number[] = [];
    const measure = () => {
        ctx.font = font(size);
        parts = graphemes(text);
        widths = parts.map((g) => ctx.measureText(g).width);
    };
    measure();
    const total = () => widths.reduce((a, b) => a + b, 0);
    while (total() > max && size > 12) {
        size--;
        measure();
    }
    if (total() > max) {
        const dot = ctx.measureText("…").width;
        while (parts.length > 1 && total() + dot > max) {
            parts.pop();
            widths.pop();
        }
        parts.push("…");
        widths.push(dot);
    }
    const { cx, cy } = WHEEL;
    let a = rad(centreDeg) - total() / (2 * radius);
    ctx.fillStyle = palette.chipInk;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    parts.forEach((g, i) => {
        a += widths[i] / (2 * radius);
        ctx.save();
        ctx.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(g, 0, 0);
        ctx.restore();
        a += widths[i] / (2 * radius);
    });
}

function radialText(entry: Entry, centreDeg: number, seg: number): void {
    const { cx, cy, r } = WHEEL;
    const chord = ((r * 0.7 * seg * Math.PI) / 180) * 0.5;
    const size = Math.max(11, Math.min(16, Math.round(chord)));
    const label = entry.emoji ? `${entry.emoji} ${entry.text}` : entry.text;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad(centreDeg));
    ctx.font = font(size);
    ctx.fillStyle = palette.chipInk;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fit(label, r - HUB_R - 34), r - 16, 1);
    ctx.restore();
}

function drawLabels(angle: number, seg: number, f: Frame): void {
    const { cx, cy, r } = WHEEL;
    const n = slices.length;
    const bounce =
        f.live && f.phase === "landed" && !reduced
            ? 1 + 0.28 * Math.sin(Math.PI * clamp01(f.sinceLanding / BOUNCE_MS))
            : 1;
    slices.forEach((entry, i) => {
        const centre = angle + (i + 0.5) * seg;
        if (!pictures) {
            radialText(entry, centre, seg);
            return;
        }
        const half = n === 1 ? Math.PI / 2 : (seg * Math.PI) / 360;
        const at = n === 1 ? 0 : r * 0.55;
        const size = Math.min(
            n <= 4 ? 36 : 30,
            Math.max(14, at * Math.sin(half) * 0.82)
        );
        const a = rad(centre);
        const winner = plan && f.phase === "landed" && i === plan.winner;
        badge(
            entry,
            cx + at * Math.cos(a),
            cy + at * Math.sin(a) + (n === 1 ? -r * 0.32 : 0),
            size,
            winner ? bounce : 1
        );
        const textR = r * 0.84;
        const max = n === 1 ? r * 2 : textR * ((seg * Math.PI) / 180) * 0.86;
        arcText(entry.text, n === 1 ? 180 : centre, textR, max);
    });
}

function drawWheel(f: Frame): void {
    const { cx, cy, r } = WHEEL;
    const n = slices.length;
    const seg = n > 0 ? 360 / n : 360;
    const angle = f.angle;

    if (!transparent(palette.edge)) {
        ctx.fillStyle = palette.edge;
        circle(cx, cy, r + 8);
        ctx.fill();
        circle(cx, cy + 9, r + 8);
        ctx.fill();
    }
    ctx.fillStyle = palette.sticker;
    circle(cx, cy + 9, r + 3);
    ctx.fill();

    if (n === 0) {
        ctx.fillStyle = palette.slices[1];
        circle(cx, cy, r);
        ctx.fill();
    }
    for (let i = 0; i < n; i++) {
        slicePath(i, angle, seg);
        ctx.fillStyle = sliceColour(i, n);
        ctx.fill();
    }

    const landed = plan !== null && f.phase === "landed";
    if (landed) {
        const dim = f.live && !reduced ? clamp01(f.sinceLanding / 260) : 1;
        ctx.globalAlpha = dim;
        ctx.fillStyle = palette.veil;
        for (let i = 0; i < n; i++) {
            if (i === plan.winner) continue;
            slicePath(i, angle, seg, r + 0.5);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    drawLabels(angle, seg, f);

    if (landed) {
        ctx.save();
        slicePath(plan.winner, angle, seg);
        ctx.clip();
        slicePath(plan.winner, angle, seg);
        ctx.strokeStyle = palette.lime;
        ctx.lineWidth = 14;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
    }

    if (n > 1) {
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = n > 12 ? 2.5 : 3.5;
        ctx.lineCap = "round";
        for (let i = 0; i < n; i++) {
            const a = rad(angle + i * seg);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            ctx.stroke();
        }
    }
    circle(cx, cy, r);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 7;
    ctx.stroke();
    if (n > 1) {
        ctx.fillStyle = palette.chip;
        for (let i = 0; i < n; i++) {
            const a = rad(angle + i * seg);
            circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3.2);
            ctx.fill();
        }
    }
}

function drawHub(): void {
    const { cx, cy } = WHEEL;
    ctx.fillStyle = palette.sticker;
    circle(cx, cy + 5, HUB_R + 1);
    ctx.fill();
    circle(cx, cy, HUB_R);
    ctx.fillStyle = slices.length > 0 ? palette.lime : palette.chip;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - 15, cy - 21, 13, 6.5, -0.55, 0, TAU);
    ctx.fillStyle = "rgb(255 255 255 / 0.5)";
    ctx.fill();
    const resetting = left === 0 && resettable;
    ctx.font = font(resetting ? 20 : 25);
    ctx.fillStyle = palette.chipInk;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(resetting ? "Reset" : "Spin", cx, cy + 2);
}

function drawPointer(f: Frame): void {
    const { cx, cy, r } = WHEEL;
    const n = Math.max(1, slices.length);
    const seg = 360 / n;
    let knock = 0;
    if (f.phase === "spinning" && previousAngle !== null && n > 1) {
        const turning = Math.sign(f.angle - previousAngle) || 1;
        const sincePeg = mod(f.angle, seg);
        const fromPeg = turning > 0 ? sincePeg : seg - sincePeg;
        const zone = Math.min(seg * 0.5, 14);
        knock = -turning * 20 * Math.max(0, 1 - fromPeg / zone);
    }
    const body = 17;
    const tip = 38;
    const t = Math.acos(body / tip);
    ctx.save();
    ctx.translate(cx, cy - r - 6);
    ctx.rotate((knock * Math.PI) / 180);
    ctx.fillStyle = palette.sticker;
    ctx.beginPath();
    ctx.moveTo(0, tip + 3);
    ctx.arc(0, 3, body, Math.PI / 2 - t, Math.PI / 2 + t, true);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, tip);
    ctx.arc(0, 0, body, Math.PI / 2 - t, Math.PI / 2 + t, true);
    ctx.closePath();
    ctx.fillStyle = palette.lime;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fillStyle = palette.chipInk;
    ctx.strokeStyle = palette.chipInk;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    const happy =
        f.phase === "landed" && f.live && f.sinceLanding < CELEBRATE_MS;
    for (const side of [-1, 1]) {
        if (happy) {
            ctx.beginPath();
            ctx.arc(side * 6, 0, 3.2, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();
        } else {
            circle(side * 6, -1, f.phase === "spinning" ? 2.8 : 2.3);
            ctx.fill();
        }
    }
    ctx.beginPath();
    ctx.arc(0, 4, happy ? 5 : 3.6, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    ctx.restore();
}

function pill(x: number, y: number, w: number, h: number, dashed = false) {
    ctx.fillStyle = palette.sticker;
    ctx.beginPath();
    ctx.roundRect(x, y + 4, w, h, h / 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = palette.chip;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 3;
    ctx.setLineDash(dashed ? [7, 6] : []);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawRibbon(f: Frame): void {
    const cx = FACE.width / 2;
    const maxW = FACE.width - 40;
    let entry: Entry | undefined;
    let label = "";
    let text: string;
    let muted = false;
    if (slices.length === 0) {
        text = "Add names in the panel";
        muted = true;
    } else if (!plan || !result) {
        text = "Spin to pick one!";
        muted = true;
    } else if (f.phase === "landed") {
        entry = result;
        label = "Picked";
        text = result.text;
    } else {
        entry = slices[f.under];
        text = entry?.text ?? "";
        muted = true;
    }
    const avatar = entry ? 17 : 0;
    ctx.font = font(15);
    const labelW = label ? ctx.measureText(label).width + 8 : 0;
    ctx.font = font(muted ? 17 : 21);
    const room = maxW - 36 - labelW - (avatar ? 2 * avatar + 10 : 0);
    let lines = [text];
    if (ctx.measureText(text).width > room) {
        ctx.font = font(muted ? 15 : 17);
        lines = wrap(text, room, 2);
    }
    const lineH = muted ? 19 : 22;
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const h = Math.max(50, lines.length * lineH + 22);
    const w = Math.min(
        maxW,
        36 + labelW + textW + (avatar ? 2 * avatar + 10 : 0)
    );
    const pop =
        !muted && f.live && !reduced
            ? Math.max(0, easeOutBack(clamp01(f.sinceLanding / POP_MS)))
            : 1;
    ctx.save();
    ctx.translate(cx, RIBBON_Y);
    ctx.scale(pop, pop);
    pill(-w / 2, -h / 2, w, h, muted && !entry);
    let x = -w / 2 + 18;
    if (entry) {
        badge(entry, x + avatar, 0, avatar);
        x += 2 * avatar + 10;
    }
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (label) {
        ctx.font = font(15);
        ctx.fillStyle = palette.chipSoft;
        ctx.fillText(label, x, 1);
        x += labelW;
    }
    ctx.font = font(lines.length > 1 ? (muted ? 15 : 17) : muted ? 17 : 21);
    ctx.fillStyle = muted ? palette.chipSoft : palette.chipInk;
    const top = -((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineH + 1));
    ctx.restore();
}

function drawCorners(): void {
    if (wheel.removePicked && wheel.entries.length > 0) {
        ctx.font = font(15);
        ctx.fillStyle = palette.inkSoft;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
            left === 0
                ? "Everyone's picked"
                : `${left} of ${wheel.entries.length} left`,
            16,
            RESET_PILL.y + RESET_PILL.height / 2
        );
    }
    if (!resettable) return;
    const { x, y, width, height } = RESET_PILL;
    pill(x, y, width, height - 4);
    const cy = y + (height - 4) / 2;
    ctx.strokeStyle = palette.chipInk;
    ctx.fillStyle = palette.chipInk;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x + 22, cy, 6.5, -Math.PI * 0.35, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    const ax = x + 22 + 6.5 * Math.cos(-Math.PI * 0.35);
    const ay = cy + 6.5 * Math.sin(-Math.PI * 0.35);
    ctx.moveTo(ax + 3.5, ay - 3.5);
    ctx.lineTo(ax + 0.5, ay + 1.5);
    ctx.lineTo(ax - 4.5, ay - 1);
    ctx.stroke();
    ctx.font = font(15);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Reset", x + 34, cy + 1);
}

type Bit = {
    vx: number;
    vy: number;
    spin: number;
    size: number;
    round: boolean;
    colour: number;
};

const bits: Bit[] = (() => {
    if (!wheel.lastSpin) return [];
    const rng = mulberry32(deriveSeed(wheel.lastSpin.seed, 0xc0f));
    return Array.from({ length: CONFETTI }, () => {
        const a = (between(rng, -165, -15) * Math.PI) / 180;
        const speed = between(rng, 240, 660);
        return {
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            spin: between(rng, -9, 9),
            size: between(rng, 5, 10),
            round: rng() < 0.3,
            colour: Math.floor(rng() * 9),
        };
    });
})();

function drawConfetti(f: Frame): void {
    if (!f.live || reduced || f.phase !== "landed") return;
    const t = f.sinceLanding / 1000;
    if (t < 0 || t * 1000 > CELEBRATE_MS) return;
    const fade =
        1 - clamp01((t * 1000 - CELEBRATE_MS * 0.65) / (CELEBRATE_MS * 0.35));
    const x0 = WHEEL.cx;
    const y0 = WHEEL.cy - WHEEL.r + 30;
    ctx.globalAlpha = fade;
    for (const b of bits) {
        const drag = 1 - Math.min(0.55, t * 0.45);
        const x = x0 + b.vx * t * drag;
        const y = y0 + b.vy * t * drag + 0.5 * 900 * t * t;
        ctx.fillStyle =
            b.colour === 8 ? palette.lime : palette.slices[b.colour];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(b.spin * t);
        if (b.round) {
            circle(0, 0, b.size * 0.45);
            ctx.fill();
        } else {
            ctx.fillRect(-b.size / 2, -b.size * 0.3, b.size, b.size * 0.6);
        }
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function describe(f: Frame): void {
    const state =
        f.phase === "landed" && result ? `Picked ${result.text}.` : "";
    const label =
        `Spin wheel with ${slices.length} ${slices.length === 1 ? "entry" : "entries"}. ${state}`.trim();
    if (canvas.getAttribute("aria-label") !== label)
        canvas.setAttribute("aria-label", label);
    document.body.dataset.phase = f.phase;
    if (f.phase === "landed" && result)
        document.body.dataset.picked = result.id;
}

function draw(f: Frame): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
        dpr * scale,
        0,
        0,
        dpr * scale,
        dpr * offsetX,
        dpr * offsetY
    );
    drawWheel(f);
    drawPointer(f);
    drawHub();
    drawCorners();
    drawRibbon(f);
    drawConfetti(f);
    describe(f);
}

const animating = (f: Frame) =>
    f.phase === "waiting" ||
    f.phase === "spinning" ||
    (f.live && f.phase === "landed" && f.sinceLanding < CELEBRATE_MS);

function tick(): void {
    raf = 0;
    const now = Date.now();
    const f = frameAt(wheel, now, openedAt);
    draw(f);
    previousAngle =
        plan && f.phase === "spinning"
            ? angleAt(plan, now - plan.startedAt)
            : null;
    if (animating(f)) request();
}

function request(): void {
    if (!raf) raf = requestAnimationFrame(tick);
}

resize();
window.addEventListener("resize", resize);
void document.fonts?.load(font(16)).then(request, request);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    palette = readPalette();
    request();
});
// Some hosts change the iframe's colour scheme without a media query change.
setInterval(() => {
    const next = readPalette();
    if (next.paper === palette.paper && next.ink === palette.ink) return;
    palette = next;
    request();
}, 1000);
