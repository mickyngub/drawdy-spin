import type { DomElementSchema, DriverManifest } from "@drawdy/driver-protocol";
import { createSpin } from "../src/driver";
import { readWheel, type Wheel } from "../src/lib/wheel";
import { buttonRect, type WidgetButton } from "../src/lib/widget";
import type { DriverToWebview } from "../src/shared/messages";
import {
    DRIVER_ID,
    fakeBoard,
    fakeClock,
    fakeHost,
    START,
    type FakeBoard,
    type FakeClock,
    type FakeHost,
    type Stored,
} from "./fake-host";

export const manifest = {
    driverId: DRIVER_ID,
    driverName: "Spin",
    driverVersion: "2.0.0",
    main: "main.js",
    permissions: ["dom", "scene", "storage", "collaboration"],
} as DriverManifest;

type ClientOptions = Parameters<typeof fakeHost>[0] & {
    skewMs?: number;
    theme?: "light" | "dark";
    /** Which remaining entry a spin lands on; the first by default. */
    pick?: (n: number) => number;
};

/** Boots a driver on a fake host; `skewMs` sets this machine's clock that far from the shared one. */
export async function client(
    clock: FakeClock,
    options: ClientOptions = {}
): Promise<FakeHost> {
    const host = fakeHost(options);
    const skew = options.skewMs ?? 0;
    let seeds = 1000;
    let ids = 0;
    const prefix = `e${host.board.clients.length}`;
    const driver = createSpin({
        now: () => clock.now() + skew,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        seed: () => seeds++,
        pick: options.pick ?? (() => 0),
        newId: () => `${prefix}-${++ids}`,
    });
    await host.boot(driver, manifest, options.theme);
    return host;
}

export async function solo(options: ClientOptions = {}) {
    const clock = fakeClock();
    const board = options.board ?? fakeBoard();
    const host = await client(clock, { ...options, board });
    const settle = () => board.settle();
    const advance = (ms: number) => clock.advance(ms, settle);
    return { clock, board, host, settle, advance };
}

export const sentOf = (host: FakeHost, type: string) =>
    host.sent.filter((s) => s.type === type);

/** Every board write this client made, in order: "add", "remove" or "update". */
export const writes = (host: FakeHost) =>
    host.sent
        .filter((s) => /^command:scene:(add|remove|update)-drawdy/.test(s.type))
        .map((s) => s.type.replace("command:scene:", "").split("-")[0]);

export const wheels = (host: FakeHost): Stored[] =>
    host.live().filter((el) => el.type === "component" && el.meta?.[DRIVER_ID]);

export const wheelOf = (el: Stored): Wheel => {
    const wheel = readWheel(el.meta?.[DRIVER_ID]);
    if (!wheel) throw new Error(`${el.id} carries no wheel`);
    return wheel;
};

export function onlyWidget(host: FakeHost): Stored {
    const all = wheels(host);
    if (all.length !== 1)
        throw new Error(`expected one wheel, found ${all.length}`);
    return all[0];
}

export const onlyWheel = (host: FakeHost): Wheel => wheelOf(onlyWidget(host));

export const rectOf = (el: Stored) => ({
    x: el.x as number,
    y: el.y as number,
    width: el.width as number,
    height: el.height as number,
});

export function nodes(schema: DomElementSchema): DomElementSchema[] {
    const children = "children" in schema ? (schema.children ?? []) : [];
    return [schema, ...children.flatMap(nodes)];
}

export const schemaOf = (el: Stored) => el.schema as DomElementSchema;

export function srcDocOf(el: Stored): string {
    const frame = nodes(schemaOf(el)).find((n) => n.type === "iframe");
    if (!frame || frame.type !== "iframe" || !("srcDoc" in frame.child))
        throw new Error("the widget has no wheel page");
    return frame.child.srcDoc;
}

/** The wheel state the page was built with. */
export function bakedOf(srcDoc: string): unknown {
    const match =
        /<script type="application\/json" id="spin">([\s\S]*?)<\/script>/.exec(
            srcDoc
        );
    if (!match) throw new Error("the page carries no wheel");
    return JSON.parse(match[1]);
}

/** The ids of the widget's buttons, in order. */
export const buttonIdsOf = (el: Stored): string[] =>
    nodes(schemaOf(el)).flatMap((n) =>
        n.domId?.startsWith(`${DRIVER_ID}:`) ? [n.domId] : []
    );

/** Presses one of a wheel's buttons on the board; `dragBy` moves the pointer before letting go. */
export async function press(
    host: FakeHost,
    settle: () => Promise<void>,
    el: Stored,
    button: WidgetButton,
    dragBy = 0
) {
    const wheel = wheelOf(el);
    if (!buttonIdsOf(el).includes(`${DRIVER_ID}:${wheel.wheelId}:${button}`))
        throw new Error(`the widget shows no ${button} button`);
    const r = buttonRect(rectOf(el), button);
    const at = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    host.clickAt(at, { x: at.x + dragBy, y: at.y });
    await settle();
}

export function lastState(host: FakeHost) {
    const states = host.posted.filter(
        (m): m is Extract<DriverToWebview, { type: "state" }> =>
            m.type === "state"
    );
    return states.at(-1) ?? null;
}

export const errors = (host: FakeHost) =>
    host.posted.filter((m) => m.type === "error").map((m) => m.reason);

export async function openPanel(host: FakeHost, settle: () => Promise<void>) {
    host.clickButton();
    await settle();
    host.message({ type: "ready" });
    await settle();
}

export { DRIVER_ID, fakeBoard, fakeClock, START };
export type { FakeBoard, FakeHost, Stored };
