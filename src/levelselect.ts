/**
 * A row of cards, one per song. The selected one opens up to show the title
 * and a play button; the rest fold down to a sliver of their art.
 */
import type { Level, Screen } from './types';
import { playPreview, stopPreview } from './conductor';
import { getUiSprite } from './sprites';
import {
    BACK_BUTTON,
    BG,
    HEIGHT,
    MUTED,
    ORANGE,
    PADLOCK,
    SHADE,
    TEXT,
    WIDTH,
    approach,
    drawBackButton,
    drawBitmap,
    drawCover,
    drawHints,
    drawSlot,
    inside,
    pixelText,
    slotLabel,
    subFont,
    titleFont,
    type Rect,
} from './ui';

export type LevelSelectActions = {
    back: () => void;
    play: (chart: string) => void;
};

const CARD_Y = 70;
const CARD_H = 350;
const WIDE = 300;
const NARROW = 108;
const GAP = 12;

/** Closest a card may get to the screen edge when the row has to scroll. */
const MARGIN = 40;

const BUTTON_W = 180;
const BUTTON_H = 48;

/** Screen pixels per padlock pixel. The same open or folded. */
const LOCK_SCALE = 4;

/** A card with no art. */
const EMPTY_CARD = '#1e292f';

/**
 * The dark behind the text on a card with art, easing out into it so there's
 * no visible edge. Kept light -- the text's drop shadow does the rest.
 */
const SCRIM_TOP = 220;
const SCRIM_BOTTOM = 160;
const SCRIM_STRENGTH = 0.65;

/** Hard drop shadow under card text, so it holds up on pale covers. */
const TEXT_SHADOW = 'rgba(7, 14, 18, 0.85)';

/** How long a locked card shakes when you try to play it. */
const SHAKE_TIME = 0.35;

export function createLevelSelect(
    levels: Level[],
    actions: LevelSelectActions,
): Screen {
    let selected = 0;
    const widths: number[] = levels.map((_, i) => (i === selected ? WIDE : NARROW));
    let cards: Rect[] = [];
    let mouse = { x: -1, y: -1 };
    let shakeAt = -Infinity;
    let last = 0;

    function select(i: number) {
        selected = Math.max(0, Math.min(levels.length - 1, i));
        listen();
    }

    /** Play the selected song's preview, or go quiet on a card without one. */
    function listen() {
        const clip = levels[selected].preview;
        if (clip) {
            playPreview(clip);
        } else {
            stopPreview();
        }
    }

    function play() {
        const chart = levels[selected].chart;
        if (chart) {
            actions.play(chart);
        } else {
            shakeAt = performance.now() / 1000;
        }
    }

    function cardAt(x: number, y: number): number {
        return cards.findIndex((card) => inside(x, y, card));
    }

    return {
        draw(ctx, now) {
            const dt = last ? Math.min(0.1, now - last) : 0;
            last = now;

            for (let i = 0; i < widths.length; i++) {
                widths[i] = approach(widths[i], i === selected ? WIDE : NARROW, dt);
            }
            cards = layout(widths, selected);

            if (!drawSlot(ctx, 'levels_bg', { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 'none')) {
                ctx.fillStyle = BG;
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
            }

            ctx.save();
            ctx.fillStyle = MUTED;
            ctx.font = subFont(24);
            ctx.textBaseline = 'alphabetic';
            pixelText(ctx, 'SELECT A SONG', Math.max(MARGIN, cards[0].x), CARD_Y - 18);
            ctx.restore();

            const shakeAge = now - shakeAt;
            const shake =
                shakeAge < SHAKE_TIME
                    ? Math.sin(shakeAge * 60) * 8 * (1 - shakeAge / SHAKE_TIME)
                    : 0;

            for (let i = 0; i < levels.length; i++) {
                const card = cards[i];
                const offset = i === selected ? shake : 0;
                drawCard(ctx, levels[i], i, { ...card, x: card.x + offset }, mouse);
            }

            drawBackButton(ctx, inside(mouse.x, mouse.y, BACK_BUTTON));
            drawProgress(ctx, levels);
            drawHints(
                ctx,
                [
                    ['←→', 'choose'],
                    ['⏎', 'play'],
                    ['esc', 'back'],
                ],
                WIDTH / 2,
                HEIGHT - 30,
                'center',
            );
        },

        keydown(event) {
            switch (event.key) {
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    select(selected - 1);
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    select(selected + 1);
                    break;
                case 'Enter':
                case ' ':
                    if (!event.repeat) play();
                    break;
                case 'Escape':
                case 'Backspace':
                    actions.back();
                    break;
                default:
                    return;
            }
            event.preventDefault();
        },

        pointermove(x, y) {
            mouse = { x, y };
            return inside(x, y, BACK_BUTTON) || cardAt(x, y) >= 0;
        },

        pointerdown(x, y) {
            if (inside(x, y, BACK_BUTTON)) {
                actions.back();
                return;
            }
            const i = cardAt(x, y);
            if (i < 0) return;
            if (i === selected) {
                play();
            } else {
                select(i);
            }
        },

        enter: listen,
        leave: stopPreview,
    };
}

/** Where each card sits this frame, given how open each one is. */
function layout(widths: number[], selected: number): Rect[] {
    const total = widths.reduce((sum, w) => sum + w, 0) + GAP * (widths.length - 1);
    let x = (WIDTH - total) / 2;

    // Too many songs to fit: slide the row so the selected card stays in view.
    if (total > WIDTH - MARGIN * 2) {
        let before = 0;
        for (let i = 0; i < selected; i++) before += widths[i] + GAP;
        const centre = before + widths[selected] / 2;
        x = Math.max(WIDTH - MARGIN - total, Math.min(MARGIN, WIDTH / 2 - centre));
    }

    return widths.map((w) => {
        const card = { x, y: CARD_Y, w, h: CARD_H };
        x += w + GAP;
        return card;
    });
}

function playButton(card: Rect): Rect {
    return {
        x: card.x + (card.w - BUTTON_W) / 2,
        y: card.y + card.h - BUTTON_H - 26,
        w: BUTTON_W,
        h: BUTTON_H,
    };
}

function drawCard(
    ctx: CanvasRenderingContext2D,
    level: Level,
    index: number,
    card: Rect,
    mouse: { x: number; y: number },
): void {
    const { x, y, w, h } = card;
    const cx = x + w / 2;
    const locked = level.chart === null;

    /** 0 folded, 1 fully open. Everything on the open card fades with it. */
    const open = Math.max(0, Math.min(1, (w - NARROW) / (WIDE - NARROW)));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // Art is always drawn full width and cropped by the card, so a folded
    // card shows a slice of it rather than a squashed copy.
    const art = { x: cx - WIDE / 2, y, w: WIDE, h };
    const image = level.art ? getUiSprite(level.art) : null;

    if (image) {
        drawCover(ctx, image, art);
    } else if (level.art) {
        drawSlot(ctx, level.art, art, 'plain');
    } else {
        ctx.fillStyle = EMPTY_CARD;
        ctx.fillRect(x, y, w, h);
    }

    // Fold the unselected ones into the background.
    ctx.globalAlpha = 0.5 * (1 - open);
    ctx.fillStyle = SHADE;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;

    // Art can be any colour, so darken the top and bottom where the text sits.
    if (image) {
        ctx.fillStyle = scrim(ctx, y + h, y + h - SCRIM_BOTTOM);
        ctx.fillRect(x, y + h - SCRIM_BOTTOM, w, SCRIM_BOTTOM);

        ctx.globalAlpha = open;
        ctx.fillStyle = scrim(ctx, y, y + SCRIM_TOP);
        ctx.fillRect(x, y, w, SCRIM_TOP);
        ctx.globalAlpha = 1;
    }

    if (locked) {
        const lockW = PADLOCK[0].length * LOCK_SCALE;
        const lockH = PADLOCK.length * LOCK_SCALE;
        drawBitmap(ctx, PADLOCK, cx - lockW / 2, y + h * 0.5 - lockH / 2, LOCK_SCALE, TEXT);
    }

    // Folded: just the number.
    ctx.globalAlpha = 1 - open;
    ctx.fillStyle = TEXT;
    ctx.font = subFont(24);
    ctx.textBaseline = 'alphabetic';
    pixelText(ctx, number(index), cx, y + h - 24, 'center');

    // Open: stats bar, title, play button.
    ctx.globalAlpha = open;

    ctx.fillStyle = 'rgba(7, 14, 18, 0.75)';
    ctx.fillRect(x, y, w, 32);

    ctx.fillStyle = TEXT;
    ctx.font = subFont(16);
    ctx.textBaseline = 'middle';
    pixelText(ctx, `LV ${number(index)}`, x + 14, y + 17);
    drawPips(ctx, level.difficulty, x + w - 14, y + 16);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = titleFont(fitText(ctx, level.title, 34, w - 32));
    shadowText(ctx, level.title, cx, y + 78, TEXT, 2);

    // Long artist lists drop to the 1x size rather than running off the card.
    ctx.font = subFont(16);
    const small = ctx.measureText(level.artist).width > WIDE - 32;
    if (small) ctx.font = subFont(8);
    // Muted grey disappears into a cover, so it's only for the empty cards.
    const artistColour = image ? TEXT : MUTED;
    shadowText(ctx, level.artist, cx, y + 104, artistColour, small ? 1 : 2);

    if (level.art && !image) {
        ctx.fillStyle = 'rgba(232, 232, 240, 0.4)';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(slotLabel(level.art, art), cx, y + 124);
    }

    const button = playButton(card);
    if (locked) {
        ctx.font = subFont(24);
        ctx.textBaseline = 'middle';
        shadowText(ctx, 'LOCKED', cx, button.y + button.h / 2, MUTED, 3);
    } else {
        const hot = inside(mouse.x, mouse.y, button);
        if (!drawSlot(ctx, hot ? 'button_play_hot' : 'button_play', button, 'none')) {
            ctx.fillStyle = hot ? TEXT : ORANGE;
            ctx.fillRect(button.x, button.y, button.w, button.h);
            ctx.fillStyle = SHADE;
            ctx.font = subFont(24);
            ctx.textBaseline = 'middle';
            pixelText(ctx, 'PLAY', cx, button.y + button.h / 2 + 2, 'center');
        }
    }

    ctx.restore();

    // Border last, outside the clip, so it isn't cut in half.
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(232, 232, 240, 0.08)';
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.globalAlpha = open;
    ctx.lineWidth = 4;
    ctx.strokeStyle = ORANGE;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}

function drawPips(ctx: CanvasRenderingContext2D, filled: number, right: number, y: number): void {
    const SIZE = 8;
    const STEP = 12;
    for (let i = 0; i < 5; i++) {
        const px = right - (5 - i) * STEP + (STEP - SIZE);
        if (i < filled) {
            ctx.fillStyle = ORANGE;
            ctx.fillRect(px, y - SIZE / 2, SIZE, SIZE);
        } else {
            ctx.strokeStyle = MUTED;
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, y - SIZE / 2 + 1, SIZE - 2, SIZE - 2);
        }
    }
}

function drawProgress(ctx: CanvasRenderingContext2D, levels: Level[]): void {
    const open = levels.filter((level) => level.chart !== null).length;

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = MUTED;
    ctx.font = subFont(16);
    pixelText(ctx, 'UNLOCKED', WIDTH - 28, HEIGHT - 68, 'right');
    ctx.fillStyle = TEXT;
    ctx.font = subFont(24);
    pixelText(ctx, `${open} / ${levels.length}`, WIDTH - 28, HEIGHT - 38, 'right');
    ctx.restore();
}

/**
 * A vertical fade from `from` (darkest) to `to` (clear), eased at both ends.
 * A plain two-stop gradient leaves a visible line where it runs out.
 */
function scrim(ctx: CanvasRenderingContext2D, from: number, to: number): CanvasGradient {
    const STEPS = 8;
    const gradient = ctx.createLinearGradient(0, from, 0, to);
    for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const alpha = (1 - t * t * (3 - 2 * t)) * SCRIM_STRENGTH;
        gradient.addColorStop(t, `rgba(7, 14, 18, ${alpha.toFixed(3)})`);
    }
    return gradient;
}

/**
 * Centred text with a hard shadow `offset` pixels down and right -- one pixel
 * of the font, so it reads as part of the lettering rather than a blur.
 */
function shadowText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    colour: string,
    offset: number,
): void {
    ctx.fillStyle = TEXT_SHADOW;
    pixelText(ctx, text, x + offset, y + offset, 'center');
    ctx.fillStyle = colour;
    pixelText(ctx, text, x, y, 'center');
}

/** Largest size up to `size` at which `text` fits in `width`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, size: number, width: number): number {
    ctx.font = titleFont(size);
    const measured = ctx.measureText(text).width;
    return measured <= width ? size : Math.floor((size * width) / measured);
}

function number(i: number): string {
    return String(i + 1).padStart(2, '0');
}
