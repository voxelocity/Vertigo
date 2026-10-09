/**
 * The page transition: a checkerboard. One set of squares grows in across
 * the screen in a diagonal wave, then the other set fills the gaps. The
 * reveal runs the same wave again, shrinking them away.
 *
 * Squares are sized and stepped in whole device pixels, so every edge is
 * hard and every step is the same size at any devicePixelRatio.
 *
 * Nothing in here knows about screens or timing. screens.ts decides how far
 * along the transition is; this just paints that moment.
 */

/** One square of the board, in CSS pixels. 960x540 is exactly 16 by 9. */
const TILE = 60;

/** Squares grow this many CSS pixels a side at a time, so they snap, not glide. */
const STEP = 6;

/** How much later the second set of squares starts, as a share of the whole. */
const LAG = 0.45;

/** How staggered the wave is across the board. 0 would be every square at once. */
const SPREAD = 0.8;

const COLOUR = '#070e12';

/**
 * Draw the board over whatever is already on the canvas.
 *
 * @param cover   0 is nothing on screen, 1 is fully covered. Exactly.
 * @param closing True while covering, false while revealing. Both run the
 *                wave top-left to bottom-right.
 */
export function drawTransition(
    ctx: CanvasRenderingContext2D,
    cover: number,
    closing: boolean,
): void {
    if (cover <= 0) return;

    // Size everything in device pixels and round it, so it's a whole number
    // of real pixels. Rounding the CSS size instead is what makes steps uneven.
    const dpr = window.devicePixelRatio || 1;
    const tile = Math.max(2, Math.round(TILE * dpr));
    const step = Math.max(1, Math.round((STEP * dpr) / 2));
    const half = tile / 2;

    const cols = Math.ceil(ctx.canvas.width / tile);
    const rows = Math.ceil(ctx.canvas.height / tile);
    const diagonals = Math.max(1, cols + rows - 2);

    // Revealing is the same wave, played on the shrink instead of the grow.
    const progress = closing ? cover : 1 - cover;

    ctx.save();
    // Device pixels, not CSS pixels: one canvas unit per real pixel.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLOUR;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const wave = (col + row) / diagonals;
            const set = (col + row) & 1;

            // Stretched so that progress = 1 finishes even the last square of
            // the late set. Without this the bottom-right corner never fills.
            const t = clamp(progress * (1 + LAG + SPREAD) - wave * SPREAD - set * LAG);
            const grown = t * t * (3 - 2 * t);
            const fill = closing ? grown : 1 - grown;
            if (fill <= 0) continue;

            const inset = Math.min(half, Math.round(((1 - fill) * half) / step) * step);
            const size = tile - inset * 2;
            if (size <= 0) continue;

            ctx.fillRect(col * tile + inset, row * tile + inset, size, size);
        }
    }

    ctx.restore();
}

function clamp(x: number): number {
    return Math.max(0, Math.min(1, x));
}
