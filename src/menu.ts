/**
 * The title screen. Logo top left, a short list under it, key art on the
 * right. Every piece of art is a slot: see drawSlot() in ui.ts.
 */
import type { Screen } from './types';
import {
    BG,
    CYAN,
    HEIGHT,
    MUTED,
    ORANGE,
    TEXT,
    WIDTH,
    approach,
    drawHints,
    drawSlot,
    drawSparkle,
    inside,
    pixelText,
    subFont,
    titleFont,
    type PixelSize,
    type Rect,
} from './ui';

export type MainMenuActions = {
    play: () => void;
    options: () => void;
    credits: () => void;
};

const LOGO: Rect = { x: 48, y: 40, w: 420, h: 140 };
const ART: Rect = { x: 500, y: 40, w: 440, h: 500 };

const ITEM_X = 104;
const ITEM_TOP = 290;
const ITEM_GAP = 58;

/** Text size of an item, idle and selected. */
const ITEM_SIZE: PixelSize = 24;
const ITEM_SIZE_ON: PixelSize = 32;

/** How far right the selected item sits, in pixels. */
const ITEM_NUDGE = 14;

const CURSOR_X = 78;

export function createMainMenu(actions: MainMenuActions): Screen {
    const items = [
        { label: 'Play', run: actions.play },
        { label: 'Options', run: actions.options },
        { label: 'Credits', run: actions.credits },
    ];

    let selected = 0;
    let cursorY = itemY(selected);
    let last = 0;

    function itemAt(x: number, y: number): number {
        return items.findIndex((_, i) =>
            inside(x, y, { x: ITEM_X - 40, y: itemY(i) - 36, w: 280, h: 50 }),
        );
    }

    function move(step: number) {
        selected = (selected + step + items.length) % items.length;
    }

    return {
        draw(ctx, now) {
            const dt = last ? Math.min(0.1, now - last) : 0;
            last = now;

            cursorY = approach(cursorY, itemY(selected), dt, 18);

            drawBackground(ctx);
            drawSlot(ctx, 'menu_art', ART, 'none');
            drawLogo(ctx);

            ctx.save();
            ctx.textBaseline = 'alphabetic';
            // The highlight snaps rather than fading between sizes -- two
            // overlapping copies mid-fade read as motion blur.
            for (let i = 0; i < items.length; i++) {
                const on = i === selected;
                ctx.fillStyle = on ? TEXT : MUTED;
                ctx.font = subFont(on ? ITEM_SIZE_ON : ITEM_SIZE);
                pixelText(ctx, items[i].label, ITEM_X + (on ? ITEM_NUDGE : 0), itemY(i));
            }
            ctx.restore();

            drawCursor(ctx, CURSOR_X, cursorY - 18, now);

            drawHints(
                ctx,
                [
                    ['↑↓', 'choose'],
                    ['⏎', 'select'],
                ],
                WIDTH - 28,
                HEIGHT - 30,
                'right',
            );
        },

        keydown(event) {
            switch (event.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    move(-1);
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    move(1);
                    break;
                case 'Enter':
                case ' ':
                    if (!event.repeat) items[selected].run();
                    break;
                default:
                    return;
            }
            event.preventDefault();
        },

        pointermove(x, y) {
            const i = itemAt(x, y);
            if (i >= 0) selected = i;
            return i >= 0;
        },

        pointerdown(x, y) {
            const i = itemAt(x, y);
            if (i < 0) return;
            selected = i;
            items[i].run();
        },
    };
}

function itemY(i: number): number {
    return ITEM_TOP + i * ITEM_GAP;
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
    if (drawSlot(ctx, 'menu_bg', { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 'none')) return;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // A soft burst behind where the key art goes.
    const glow = ctx.createRadialGradient(720, 290, 0, 720, 290, 380);
    glow.addColorStop(0, 'rgba(110, 231, 255, 0.12)');
    glow.addColorStop(1, 'rgba(110, 231, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawLogo(ctx: CanvasRenderingContext2D): void {
    if (drawSlot(ctx, 'menu_logo', LOGO, 'none')) return;

    // Stand-in: the name, split into the two lane colours.
    const x = LOGO.x + 20;
    const y = LOGO.y + 104;

    ctx.save();
    ctx.font = titleFont(88);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ORANGE;
    ctx.fillText('VERTIGO', x - 4, y);
    ctx.fillStyle = CYAN;
    ctx.fillText('VERTIGO', x + 4, y);
    ctx.fillStyle = TEXT;
    ctx.fillText('VERTIGO', x, y);
    ctx.restore();
}

/** The sparkle beside the selected item. */
function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
    if (drawSlot(ctx, 'menu_cursor', { x: x - 16, y: y - 16, w: 32, h: 32 }, 'none')) {
        return;
    }
    drawSparkle(ctx, x, y, now);
}
