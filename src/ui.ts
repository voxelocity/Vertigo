/**
 * Drawing bits shared by the menus and the HUD: palette, text, placeholders,
 * icons. No state in here -- each screen owns its own.
 */
import { getUiSprite } from './sprites';

export const WIDTH = 960;
export const HEIGHT = 540;

// Same family as the in-game colours in renderer.ts.
export const BG = '#132630';
export const PANEL = '#1d3a47';
export const SHADE = '#070e12';
export const TEXT = '#e8e8f0';
export const MUTED = '#6a8694';
export const ORANGE = '#e8a33d';
export const CYAN = '#6ee7ff';

/** Kiwi Soda: the logo, page titles and song titles. */
export function titleFont(size: number): string {
    return `${size}px "Kiwi Soda", system-ui, sans-serif`;
}

/**
 * Snow Bros Neue sizes. It's an 8px bitmap font, so it's only crisp when each
 * of its pixels is a whole number of screen pixels.
 */
export type PixelSize = 8 | 16 | 24 | 32 | 40 | 48;

/** Snow Bros Neue: everything that isn't a title. */
export function subFont(size: PixelSize): string {
    return `${size}px "Snow Bros Neue", system-ui, sans-serif`;
}

/**
 * fillText on whole pixels. Centring or right-aligning can leave a pixel font
 * half a pixel off, which blurs every glyph, so this works out the left edge
 * itself and rounds it. Uses the current font, fill and baseline.
 */
export function pixelText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    align: 'left' | 'center' | 'right' = 'left',
): void {
    const width = ctx.measureText(text).width;
    const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;

    const saved = ctx.textAlign;
    ctx.textAlign = 'left';
    ctx.fillText(text, Math.round(left), Math.round(y));
    ctx.textAlign = saved;
}

export type Rect = { x: number; y: number; w: number; h: number };

export function inside(x: number, y: number, r: Rect): boolean {
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** Ease `from` towards `to` at the same speed whatever the frame rate. */
export function approach(from: number, to: number, dt: number, rate = 14): number {
    return to + (from - to) * Math.exp(-rate * dt);
}

/**
 * A spot waiting for art. Draws src/assets/ui/<name>.png into the box if it
 * exists, otherwise a placeholder labelled with the file it wants.
 *
 * Sprites are drawn at 2x, so the label asks for half the box size. Pass
 * 'plain' to leave the label off (the caller shows it somewhere better), or
 * 'none' to draw nothing at all, for slots where the fallback says enough.
 *
 * Returns whether the real sprite was drawn, so callers can add a fallback.
 */
export function drawSlot(
    ctx: CanvasRenderingContext2D,
    name: string,
    box: Rect,
    placeholder: 'label' | 'plain' | 'none' = 'label',
): boolean {
    const { x, y, w, h } = box;
    const sprite = getUiSprite(name);

    if (sprite) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, Math.round(x), Math.round(y), w, h);
        ctx.restore();
        return true;
    }
    if (placeholder === 'none') return false;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = 'rgba(29, 58, 71, 0.45)';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = 'rgba(232, 232, 240, 0.04)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    for (let d = -h; d < w; d += 30) {
        ctx.moveTo(x + d, y + h);
        ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(232, 232, 240, 0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    if (placeholder === 'label') {
        ctx.fillStyle = 'rgba(232, 232, 240, 0.4)';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(slotLabel(name, box), x + 8, y + 8);
    }

    ctx.restore();
    return false;
}

/**
 * An image scaled to fill the box, cropping whatever overflows. For album
 * covers and other illustrations, so smoothed -- unlike the pixel sprites.
 */
export function drawCover(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    box: Rect,
): void {
    const scale = Math.max(box.w / image.naturalWidth, box.h / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    ctx.restore();
}

/** What a placeholder asks for: the file name and its size at 1x. */
export function slotLabel(name: string, box: Rect): string {
    return `${name}.png  ${box.w / 2}x${box.h / 2}`;
}

/**
 * The selection sparkle, as pixel art: orange outline, bright core. Flips
 * between two frames to twinkle, rather than scaling and going blurry.
 */
const SPARKLE = [
    '...#...',
    '...#...',
    '..#o#..',
    '##ooo##',
    '..#o#..',
    '...#...',
    '...#...',
];

const SPARKLE_SMALL = [
    '.......',
    '...#...',
    '..#o#..',
    '.#ooo#.',
    '..#o#..',
    '...#...',
    '.......',
];

const SPARKLE_SCALE = 4;
const SPARKLE_FRAME_TIME = 0.4;

/** Centred on (x, y). The menu cursor until there's a sprite for it. */
export function drawSparkle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    now: number,
): void {
    const frame =
        Math.floor(now / SPARKLE_FRAME_TIME) % 2 === 0 ? SPARKLE : SPARKLE_SMALL;
    const left = Math.round(x - (frame[0].length * SPARKLE_SCALE) / 2);
    const top = Math.round(y - (frame.length * SPARKLE_SCALE) / 2);

    drawBitmap(ctx, frame, left, top, SPARKLE_SCALE, ORANGE);
    drawBitmap(ctx, frame, left, top, SPARKLE_SCALE, TEXT, 'o');
}

/**
 * Pixel icons, one string per row. Fills every `pixel` character, so an icon
 * with two colours is two calls with different characters.
 */
export function drawBitmap(
    ctx: CanvasRenderingContext2D,
    rows: string[],
    x: number,
    y: number,
    scale: number,
    colour: string,
    pixel = '#',
): void {
    // One path, filled once. Separate fillRects each antialias their own
    // edges, which shows up as a grid of seams at fractional zoom levels.
    ctx.beginPath();
    for (let row = 0; row < rows.length; row++) {
        for (let col = 0; col < rows[row].length; col++) {
            if (rows[row][col] === pixel) {
                ctx.rect(
                    Math.round(x + col * scale),
                    Math.round(y + row * scale),
                    scale,
                    scale,
                );
            }
        }
    }
    ctx.fillStyle = colour;
    ctx.fill();
}

export const PADLOCK = [
    '...#####...',
    '..#.....#..',
    '.#.......#.',
    '.#.......#.',
    '.#.......#.',
    '###########',
    '###########',
    '#####.#####',
    '####...####',
    '#####.#####',
    '#####.#####',
    '###########',
    '###########',
];

const ARROW = [
    '....#.....',
    '...##.....',
    '..########',
    '.#########',
    '##########',
    '.#########',
    '..########',
    '...##.....',
    '....#.....',
];

/** Bottom-left, on every page that can go back. */
export const BACK_BUTTON: Rect = { x: 24, y: 466, w: 56, h: 52 };

export function drawBackButton(ctx: CanvasRenderingContext2D, hot: boolean): void {
    if (drawSlot(ctx, 'icon_back', BACK_BUTTON, 'none')) return;

    const { x, y } = BACK_BUTTON;
    drawBitmap(ctx, ARROW, x + 8, y + 8, 4, hot ? ORANGE : TEXT);
}

/** A row of key hints like  [↑↓] choose  [⏎] select. */
export function drawHints(
    ctx: CanvasRenderingContext2D,
    hints: [keys: string, label: string][],
    x: number,
    y: number,
    align: 'left' | 'center' | 'right' = 'left',
): void {
    const LABEL_FONT = subFont(16);
    const GAP = 8;
    const SPACING = 22;

    ctx.save();
    ctx.textBaseline = 'middle';

    const parts = hints.map(([keys, label]) => {
        // The pixel font is plain ASCII. Arrows and the return symbol would
        // fall back anyway, but on its baseline, sitting low in the key --
        // so give those the system font outright.
        const keyFont = /^[ -~]*$/.test(keys) ? LABEL_FONT : '14px system-ui, sans-serif';
        ctx.font = keyFont;
        const keyW = Math.round(Math.max(24, ctx.measureText(keys).width + 14));
        ctx.font = LABEL_FONT;
        return { keys, label, keyFont, keyW, labelW: ctx.measureText(label).width };
    });

    const total =
        parts.reduce((sum, p) => sum + p.keyW + GAP + p.labelW, 0) +
        SPACING * (parts.length - 1);

    let cx = Math.round(
        align === 'right' ? x - total : align === 'center' ? x - total / 2 : x,
    );

    for (const p of parts) {
        ctx.strokeStyle = MUTED;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx, y - 12, p.keyW, 24, 5);
        ctx.stroke();

        ctx.fillStyle = TEXT;
        ctx.font = p.keyFont;
        pixelText(ctx, p.keys, cx + p.keyW / 2, y + 1, 'center');
        cx += p.keyW + GAP;

        ctx.fillStyle = MUTED;
        ctx.font = LABEL_FONT;
        pixelText(ctx, p.label, cx, y + 1);
        cx += Math.round(p.labelW) + SPACING;
    }

    ctx.restore();
}
