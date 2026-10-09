/**
 * Runs whichever screen is current, and swaps screens under the transition.
 *
 * This owns the one requestAnimationFrame loop and the menu input. Screens
 * never call each other -- they call goTo(), and this decides when the swap
 * actually happens.
 *
 * A transition goes:
 *
 *   cover  -> hold (until the next screen has loaded) -> reveal -> enter()
 *
 * so anything slow, like decoding a song, happens with the screen covered.
 */
import type { Screen } from './types';
import { unlock } from './conductor';
import { drawTransition } from './transition';
import { HEIGHT, MUTED, SHADE, WIDTH, pixelText, subFont } from './ui';

/** Seconds to cover the screen, and to uncover it again. */
const COVER_TIME = 0.6;
const REVEAL_TIME = 0.6;

/** Fully covered this long and still loading? Say so. */
const LOADING_DELAY = 0.3;

type Transition = {
    startedAt: number;
    /** When the reveal began. Null while still covering or holding. */
    revealAt: number | null;
    next: Screen | null;
    failed: boolean;
};

/** Before the first screen has loaded. */
const blank: Screen = {
    draw(ctx) {
        ctx.fillStyle = SHADE;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    },
};

let current: Screen = blank;
let transition: Transition | null = null;
let canvas: HTMLCanvasElement;

/**
 * Start the loop. The first screen is revealed out of a fully covered
 * board, once it has loaded.
 */
export function start(ctx: CanvasRenderingContext2D, first: Promise<Screen>): void {
    canvas = ctx.canvas;

    // Start already covered, so the first thing anyone sees is the reveal.
    beginTransition(first, now() - COVER_TIME);

    window.addEventListener('keydown', (event) => {
        unlock();
        if (!transition) current.keydown?.(event);
    });

    canvas.addEventListener('pointerdown', (event) => {
        unlock();
        if (transition) return;
        const [x, y] = toCanvas(event);
        current.pointerdown?.(x, y);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (transition) return;
        const [x, y] = toCanvas(event);
        canvas.style.cursor = current.pointermove?.(x, y) ? 'pointer' : '';
    });

    function frame() {
        const t = now();
        current.draw(ctx, t);
        if (transition) drawCover(ctx, transition, t);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

/**
 * Transition to another screen. Pass a promise for one that needs loading
 * first; the screen stays covered until it resolves.
 *
 * Ignored mid-transition, so mashing Enter can't stack them up.
 */
export function goTo(next: Screen | Promise<Screen>): void {
    if (transition) return;
    current.leave?.();
    canvas.style.cursor = '';
    beginTransition(Promise.resolve(next), now());
}

function beginTransition(next: Promise<Screen>, startedAt: number): void {
    const t: Transition = { startedAt, revealAt: null, next: null, failed: false };
    transition = t;

    next.then(
        (screen) => {
            t.next = screen;
        },
        (err) => {
            // Couldn't load it. Uncover the screen we were already on.
            console.error(err);
            t.failed = true;
        },
    );
}

function drawCover(ctx: CanvasRenderingContext2D, t: Transition, time: number): void {
    const covering = time - t.startedAt;

    if (covering < COVER_TIME) {
        drawTransition(ctx, smooth(covering / COVER_TIME), true);
        return;
    }

    if (t.revealAt === null) {
        if (!t.next && !t.failed) {
            drawTransition(ctx, 1, true);
            if (covering - COVER_TIME > LOADING_DELAY) drawLoading(ctx);
            return;
        }
        // Covered and ready: swap underneath. Drawn next frame, while revealing.
        if (t.next) current = t.next;
        t.revealAt = time;
    }

    const revealing = time - t.revealAt;
    if (revealing < REVEAL_TIME) {
        drawTransition(ctx, 1 - smooth(revealing / REVEAL_TIME), false);
        return;
    }

    transition = null;
    current.enter?.();
}

function drawLoading(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = MUTED;
    ctx.font = subFont(16);
    ctx.textBaseline = 'middle';
    pixelText(ctx, 'loading', WIDTH / 2, HEIGHT / 2, 'center');
    ctx.restore();
}

/** Pointer position in canvas pixels, whatever size CSS has made the canvas. */
function toCanvas(event: PointerEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [
        ((event.clientX - rect.left) / rect.width) * WIDTH,
        ((event.clientY - rect.top) / rect.height) * HEIGHT,
    ];
}

function smooth(x: number): number {
    return x * x * (3 - 2 * x);
}

function now(): number {
    return performance.now() / 1000;
}
