import {
    clamp01,
    coinAt,
    dealSlot,
    dieAt,
    easeOutBack,
    easeOutCubic,
    groupsDealt,
    orderRowLabel,
    orderRowsShown,
    reelAt,
    segmentUnderPointer,
    wheelAngleAt,
    SPIN_MS,
    type CoinPlan,
    type DicePlan,
    type GroupsPlan,
    type OrderPlan,
    type WarmupPlan,
    type WheelPlan,
} from "../src/lib/animation-plan";
import {
    designSize,
    groupColumns,
    GROUP_NAMES_SHOWN,
    type OverlayConfig,
} from "../src/lib/overlay-layout";

const config = JSON.parse(
    document.getElementById("spin-config")?.textContent ?? "null"
) as OverlayConfig;
const canvas = document.getElementById("spin") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const { plan, colours } = config;
const design = designSize(plan);
const dark = config.theme === "dark";

const FONT =
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", "Leelawadee UI", sans-serif';
const PALETTE = [
    "#C5F601",
    "#7CC4FA",
    "#FFB86B",
    "#5EE0C1",
    "#B69CFF",
    "#FF8FB8",
    "#FFD54F",
];
const INK = "#18181b";
const POP_MS = 260;
const END_MS = SPIN_MS + config.holdMs + config.fadeMs;

let firstFrameAt: number | null = null;
let dpr = 1;
let scale = 1;

const font = (size: number, weight = 500) => `${weight} ${size}px ${FONT}`;

function resize(): void {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = Math.min(
        window.innerWidth / design.width,
        window.innerHeight / design.height
    );
}

function segmenter(): Intl.Segmenter | null {
    try {
        return new Intl.Segmenter(undefined, { granularity: "word" });
    } catch {
        return null;
    }
}
const words = segmenter();

function fit(text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    const chars = [...text];
    while (chars.length > 1) {
        chars.pop();
        const candidate = `${chars.join("").trimEnd()}…`;
        if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    }
    return "…";
}

function wrap(text: string, maxWidth: number, maxLines: number): string[] {
    const pieces = words
        ? [...words.segment(text)].map((s) => s.segment)
        : text.split(/(\s+)/);
    const lines: string[] = [];
    let line = "";
    for (const piece of pieces) {
        const next = line + piece;
        if (ctx.measureText(next).width <= maxWidth || line === "") {
            line = next;
            continue;
        }
        lines.push(line.trimEnd());
        line = piece.trimStart();
    }
    if (line.trim()) lines.push(line.trimEnd());
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(`${kept[maxLines - 1]}…`, maxWidth);
    return kept;
}

function card(x: number, y: number, w: number, h: number, r = 16): void {
    ctx.save();
    ctx.shadowColor = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = colours.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = colours.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
}

function pill(cx: number, cy: number, text: string, t: number): void {
    const u = clamp01((t - SPIN_MS) / POP_MS);
    if (u <= 0) return;
    const s = Math.max(0, easeOutBack(u));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.font = font(20, 650);
    const label = fit(text, design.width - 72);
    const w = ctx.measureText(label).width + 36;
    ctx.shadowColor = dark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = colours.accent;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -21, w, 42, 21);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = colours.onAccent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 1);
    ctx.restore();
}

const popScale = (since: number): number =>
    since < 0 ? 0 : easeOutBack(clamp01(since / POP_MS), 1.8);

const segmentColour = (i: number, n: number): string =>
    i === n - 1 && n > 1 && (n - 1) % PALETTE.length === 0
        ? PALETTE[2]
        : PALETTE[i % PALETTE.length];

function drawWheel(p: WheelPlan, t: number): void {
    const cx = design.width / 2;
    const cy = 232;
    const R = 182;
    const n = p.labels.length;
    const seg = 360 / n;
    const angle = wheelAngleAt(p, t);
    const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const landed = t >= SPIN_MS;
    const dim = clamp01((t - SPIN_MS) / 240);

    ctx.save();
    ctx.shadowColor = dark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = colours.panel;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < n; i++) {
        ctx.fillStyle = segmentColour(i, n);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, rad(i * seg + angle), rad((i + 1) * seg + angle));
        ctx.closePath();
        ctx.fill();
    }
    ctx.strokeStyle = colours.panel;
    ctx.lineWidth = n > 40 ? 1 : 2;
    for (let i = 0; i < n; i++) {
        const a = rad(i * seg + angle);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
    }

    if (n <= 64) {
        const size = Math.max(
            9,
            Math.min(17, ((R * 0.72 * seg * Math.PI) / 180) * 0.5)
        );
        ctx.font = font(size, 600);
        ctx.fillStyle = INK;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (let i = 0; i < n; i++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rad((i + 0.5) * seg + angle));
            ctx.fillText(fit(p.labels[i], R * 0.66), R - 16, 0);
            ctx.restore();
        }
    }

    if (landed && dim > 0) {
        const win = p.winner;
        ctx.fillStyle = dark
            ? `rgba(24,24,27,${0.62 * dim})`
            : `rgba(255,255,255,${0.62 * dim})`;
        for (let i = 0; i < n; i++) {
            if (i === win) continue;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(
                cx,
                cy,
                R + 0.5,
                rad(i * seg + angle),
                rad((i + 1) * seg + angle)
            );
            ctx.closePath();
            ctx.fill();
        }
        ctx.strokeStyle = colours.fg;
        ctx.lineWidth = 3 * dim;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(
            cx,
            cy,
            R,
            rad(win * seg + angle),
            rad((win + 1) * seg + angle)
        );
        ctx.closePath();
        ctx.stroke();
    }

    if (n <= 48) {
        ctx.fillStyle = colours.muted;
        for (let i = 0; i < n; i++) {
            const a = rad(i * seg + angle);
            ctx.beginPath();
            ctx.arc(
                cx + Math.cos(a) * (R + 6),
                cy + Math.sin(a) * (R + 6),
                2.6,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }

    ctx.fillStyle = colours.panel;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colours.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colours.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();

    // Pegs knock the pointer aside as they pass, in the direction the wheel turns.
    const before = wheelAngleAt(p, t - 16);
    const turning = Math.sign(angle - before) || 1;
    const sincePeg = ((angle % seg) + seg) % seg;
    const fromPeg = turning > 0 ? sincePeg : seg - sincePeg;
    const zone = Math.min(seg * 0.5, 14);
    const knock = n <= 48 ? 18 * Math.max(0, 1 - fromPeg / zone) : 0;
    const pivotY = cy - R - 18;
    ctx.save();
    ctx.translate(cx, pivotY);
    ctx.rotate((-turning * knock * Math.PI) / 180);
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = colours.fg;
    ctx.beginPath();
    ctx.moveTo(-17, -12);
    ctx.lineTo(17, -12);
    ctx.lineTo(0, 30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (landed) {
        pill(cx, cy + R + 44, p.labels[p.winner], t);
        return;
    }
    ctx.font = font(15, 600);
    ctx.fillStyle = colours.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
        fit(p.labels[segmentUnderPointer(angle, n)], design.width - 80),
        cx,
        cy + R + 44
    );
}

function drawOrder(p: OrderPlan, t: number): void {
    const w = design.width - 24;
    card(12, 12, w, design.height - 24);
    ctx.font = font(15, 650);
    ctx.fillStyle = colours.fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Order", 32, 46);
    const rows = orderRowsShown(p.labels.length);
    for (let r = 0; r < rows; r++) {
        const y = 76 + r * 34;
        const locked = t >= p.lockAt[r];
        const s = locked ? popScale(t - p.lockAt[r]) : 1;
        ctx.save();
        ctx.translate(32, y);
        ctx.scale(s, s);
        ctx.fillStyle = locked ? colours.accent : colours.line;
        ctx.beginPath();
        ctx.arc(12, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = locked ? colours.onAccent : colours.muted;
        ctx.font = font(12, 700);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(r + 1), 12, 1);
        ctx.font = font(15, locked ? 600 : 500);
        ctx.textAlign = "left";
        ctx.fillStyle = locked ? colours.fg : colours.muted;
        ctx.globalAlpha *= locked ? 1 : 0.55;
        const jitter = locked ? 0 : (Math.floor(t / 70) % 2) * 2 - 1;
        ctx.fillText(
            fit(orderRowLabel(p, plan.seed, r, t), w - 80),
            36,
            1 + jitter
        );
        ctx.restore();
    }
    if (p.labels.length > rows) {
        ctx.font = font(13, 500);
        ctx.fillStyle = colours.muted;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
            `+ ${p.labels.length - rows} more on the card`,
            32,
            76 + rows * 34 + 4
        );
    }
}

function drawGroups(p: GroupsPlan, t: number): void {
    const W = design.width;
    card(12, 12, W - 24, design.height - 24);
    ctx.font = font(15, 650);
    ctx.fillStyle = colours.fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${p.groups.length} groups`, 32, 46);

    const g = p.groups.length;
    const cols = groupColumns(g);
    const longest = Math.max(...p.groups.map((x) => x.length));
    const lines = Math.min(longest, GROUP_NAMES_SHOWN + 1);
    const boxH = 44 + lines * 22;
    const boxW = (W - 56 - (cols - 1) * 12) / cols;
    const dealt = groupsDealt(p, t);
    const shown = new Map<number, number>();
    for (let i = 0; i < dealt; i++) {
        const { group } = dealSlot(p, i);
        shown.set(group, (shown.get(group) ?? 0) + 1);
    }

    for (let k = 0; k < g; k++) {
        const x = 28 + (k % cols) * (boxW + 12);
        const y = 62 + Math.floor(k / cols) * (boxH + 12);
        ctx.fillStyle = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 10);
        ctx.fill();
        ctx.fillStyle = PALETTE[k % PALETTE.length];
        ctx.beginPath();
        ctx.roundRect(x + 12, y + 14, 10, 10, 3);
        ctx.fill();
        ctx.font = font(12, 650);
        ctx.fillStyle = colours.muted;
        ctx.textBaseline = "middle";
        ctx.fillText(`Group ${k + 1}`, x + 30, y + 20);
        const members = p.groups[k];
        const visible = shown.get(k) ?? 0;
        ctx.font = font(14, 550);
        for (let slot = 0; slot < Math.min(visible, members.length); slot++) {
            const ly = y + 44 + slot * 22;
            if (slot === GROUP_NAMES_SHOWN && members.length > slot + 1) {
                ctx.fillStyle = colours.muted;
                ctx.fillText(
                    `+ ${members.length - GROUP_NAMES_SHOWN} more`,
                    x + 12,
                    ly
                );
                break;
            }
            const dealIndex = slot * g + k;
            const s = popScale(t - p.dealAt[dealIndex]);
            ctx.save();
            ctx.translate(x + 12, ly);
            ctx.scale(s, s);
            ctx.fillStyle = colours.fg;
            ctx.fillText(fit(members[slot], boxW - 24), 0, 0);
            ctx.restore();
        }
    }
}

function pips(face: number): [number, number][] {
    const L = -0.3;
    const C = 0;
    const H = 0.3;
    const map: Record<number, [number, number][]> = {
        1: [[C, C]],
        2: [
            [L, L],
            [H, H],
        ],
        3: [
            [L, L],
            [C, C],
            [H, H],
        ],
        4: [
            [L, L],
            [H, L],
            [L, H],
            [H, H],
        ],
        5: [
            [L, L],
            [H, L],
            [C, C],
            [L, H],
            [H, H],
        ],
        6: [
            [L, L],
            [H, L],
            [L, C],
            [H, C],
            [L, H],
            [H, H],
        ],
    };
    return map[face] ?? map[1];
}

function drawDie(sides: number, face: number, size: number): void {
    if (sides === 6) {
        ctx.fillStyle = "#FAFAF7";
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = INK;
        for (const [px, py] of pips(face)) {
            ctx.beginPath();
            ctx.arc(px * size, py * size, size * 0.085, 0, Math.PI * 2);
            ctx.fill();
        }
        return;
    }
    const r = size * 0.56;
    const outer = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return [Math.cos(a) * r, Math.sin(a) * r] as const;
    });
    ctx.fillStyle = "#7CC4FA";
    ctx.beginPath();
    outer.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    const inner = [0, 2, 4].map((i) => {
        const a = (Math.PI / 3) * i + Math.PI / 2;
        return [Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55] as const;
    });
    ctx.strokeStyle = "rgba(24,24,27,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    inner.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    for (const [ox, oy] of outer) {
        const near = inner.reduce((best, cur) =>
            Math.hypot(cur[0] - ox, cur[1] - oy) <
            Math.hypot(best[0] - ox, best[1] - oy)
                ? cur
                : best
        );
        ctx.moveTo(ox, oy);
        ctx.lineTo(near[0], near[1]);
    }
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = font(size * 0.3, 750);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(face), 0, size * 0.03);
}

function drawDice(p: DicePlan, t: number): void {
    const n = p.faces.length;
    const size = 100;
    const ground = 236;
    for (let d = 0; d < n; d++) {
        const x = 48 + 60 + d * (120 + 36);
        const m = dieAt(p, d, t);
        const y = ground - 64 - m.lift * 84;
        ctx.fillStyle = dark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.16)";
        ctx.beginPath();
        ctx.ellipse(x, ground, 46 * (1 - m.lift * 0.4), 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((m.rotation * Math.PI) / 180);
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        drawDie(p.sides, m.face, size);
        ctx.restore();
    }
    const label =
        n > 1 ? `${p.faces.join(" + ")} = ${p.total}` : String(p.faces[0]);
    pill(design.width / 2, 292, p.sides === 20 ? `${label} (d20)` : label, t);
}

function coinFace(side: "heads" | "tails", r: number): void {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, "#FFE08A");
    g.addColorStop(1, "#E0A526");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,72,0,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r - 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(110,64,0,0.85)";
    if (side === "heads") {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = (Math.PI / 5) * i - Math.PI / 2;
            const rr = i % 2 === 0 ? r * 0.36 : r * 0.15;
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr - r * 0.08;
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    } else {
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI / 6) * i;
            ctx.beginPath();
            ctx.arc(
                Math.cos(a) * r * 0.3,
                Math.sin(a) * r * 0.3 - r * 0.08,
                r * 0.045,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }
    ctx.font = font(r * 0.17, 750);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(side === "heads" ? "HEADS" : "TAILS", 0, r * 0.5);
}

function drawCoin(p: CoinPlan, t: number): void {
    const cx = design.width / 2;
    const ground = 290;
    const r = 82;
    const c = coinAt(p, t);
    const squash = Math.max(0.04, Math.abs(Math.cos(c.angle)));
    const y = ground - 110 - c.lift * 120;
    ctx.fillStyle = dark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(cx, ground, 70 * (1 - c.lift * 0.5), 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, y);
    ctx.fillStyle = "#B7791F";
    ctx.beginPath();
    ctx.ellipse(0, 7 * (1 - squash), r, r * squash, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(1, squash);
    coinFace(c.showing, r);
    ctx.restore();
    pill(cx, 340, p.side === "heads" ? "Heads" : "Tails", t);
}

function drawWarmup(p: WarmupPlan, t: number): void {
    const W = design.width;
    card(12, 12, W - 24, design.height - 24);
    ctx.font = font(15, 650);
    ctx.fillStyle = colours.fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(p.lang === "th" ? "คำถามอุ่นเครื่อง" : "Warm-up", 32, 46);
    const top = 62;
    const height = design.height - top - 34;
    const left = 32;
    const width = W - 64;
    const pos = reelAt(p, t);
    const base = Math.floor(pos);
    const frac = pos - base;
    const landed = t >= SPIN_MS;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left - 8, top, width + 16, height);
    ctx.clip();
    for (const k of [base, base + 1]) {
        if (k < 0 || k >= p.reel.length) continue;
        const offset = (k - base - frac) * height;
        const final = k === p.reel.length - 1;
        ctx.font = font(21, 600);
        const lines = wrap(p.reel[k], width, 4);
        const lh = 30;
        const y0 = top + offset + (height - lines.length * lh) / 2 + lh / 2;
        ctx.fillStyle = colours.fg;
        ctx.globalAlpha = landed && final ? 1 : 0.45;
        ctx.textBaseline = "middle";
        lines.forEach((line, i) => ctx.fillText(line, left, y0 + i * lh));
    }
    ctx.restore();
    if (landed) {
        const u = easeOutCubic((t - SPIN_MS) / 300);
        ctx.fillStyle = colours.accent;
        ctx.beginPath();
        ctx.roundRect(left, design.height - 34, (width / 3) * u, 4, 2);
        ctx.fill();
    }
}

function draw(t: number): void {
    switch (plan.mode) {
        case "wheel":
            return drawWheel(plan, t);
        case "order":
            return drawOrder(plan, t);
        case "groups":
            return drawGroups(plan, t);
        case "dice":
            return drawDice(plan, t);
        case "coin":
            return drawCoin(plan, t);
        case "warmup":
            return drawWarmup(plan, t);
    }
}

function frame(): void {
    const t = Date.now() - config.localStart;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (t >= END_MS) return;
    firstFrameAt ??= t;
    const fadeIn = clamp01((t - firstFrameAt) / 160);
    const fadeOut = 1 - clamp01((t - SPIN_MS - config.holdMs) / config.fadeMs);
    ctx.globalAlpha = fadeIn * fadeOut;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    const offsetX = (window.innerWidth / scale - design.width) / 2;
    const offsetY = (window.innerHeight / scale - design.height) / 2;
    ctx.translate(offsetX, offsetY);
    draw(Math.max(0, t));
    requestAnimationFrame(frame);
}

resize();
window.addEventListener("resize", resize);
requestAnimationFrame(frame);
