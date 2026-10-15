/**
 * The end screen: how the song went, and a way to go again or go back.
 */
import type { GameState, Judgement, Screen } from './types';
import {
    BACK_BUTTON,
    BG,
    CYAN,
    HEIGHT,
    MUTED,
    ORANGE,
    TEXT,
    WIDTH,
    drawBackButton,
    drawHints,
    drawSparkle,
    inside,
    pixelText,
    subFont,
    titleFont,
} from './ui';

type Actions = {
    retry: () => void;
    back: () => void;
};

// Same as the judgement popups in renderer.ts.
const JUDGEMENT_COLOUR: Record<Judgement, string> = {
    perfect: '#ffd34d',
    good: '#8de36a',
    miss: '#ff6b6b',
};

/** Seconds for the numbers to count up when the screen appears. */
const COUNT_UP = 0.8;

/** Accuracy, 0..1: Perfect is full credit, Good a third, same as the score. */
function accuracyOf(state: GameState): number {
    const total = state.chart.notes.length;
    if (total === 0) return 1;
    const { perfect, good } = state.counts;
    return (perfect + good / 3) / total;
}

function gradeOf(accuracy: number): string {
    if (accuracy >= 0.95) return 'S';
    if (accuracy >= 0.9) return 'A';
    if (accuracy >= 0.8) return 'B';
    if (accuracy >= 0.7) return 'C';
    return 'D';
}

export function createResults(state: GameState, actions: Actions): Screen {
    const { chart, counts, score, maxCombo } = state;
    const accuracy = accuracyOf(state);
    const grade = gradeOf(accuracy);
    const fullCombo = counts.miss === 0 && chart.notes.length > 0;

    let mouse = { x: -1, y: -1 };
    let shownAt: number | null = null;

    return {
        draw(ctx, now) {
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            // Count up from zero once the screen is actually showing.
            const age = shownAt === null ? 0 : now - shownAt;
            const p = Math.min(1, age / COUNT_UP);
            const ease = 1 - (1 - p) ** 3;
            const tick = (n: number) => Math.round(n * ease);

            drawSparkle(ctx, 76, 92, now);

            ctx.save();
            ctx.textBaseline = 'alphabetic';

            ctx.fillStyle = TEXT;
            ctx.font = titleFont(56);
            ctx.fillText('Results', 104, 112);

            ctx.fillStyle = MUTED;
            ctx.font = subFont(16);
            pixelText(ctx, `${chart.title}  -  ${chart.artist}`, 104, 148);

            // The grade, big, on the left.
            ctx.globalAlpha = p;
            ctx.fillStyle = ORANGE;
            ctx.font = titleFont(200);
            ctx.textAlign = 'center';
            ctx.fillText(grade, 260, 390);
            ctx.textAlign = 'left';

            if (fullCombo) {
                ctx.fillStyle = CYAN;
                ctx.font = subFont(16);
                pixelText(ctx, 'FULL COMBO', 260, 430, 'center');
            }
            ctx.globalAlpha = 1;

            // The numbers, on the right.
            const LEFT = 480;
            const RIGHT = 856;
            const row = (label: string, value: string, colour: string, y: number) => {
                ctx.font = subFont(24);
                ctx.fillStyle = colour;
                pixelText(ctx, label, LEFT, y);
                ctx.fillStyle = TEXT;
                pixelText(ctx, value, RIGHT, y, 'right');
            };

            row('SCORE', `${tick(score)}`, ORANGE, 210);
            row('ACCURACY', `${(accuracy * 100 * ease).toFixed(2)}%`, ORANGE, 250);
            row('MAX COMBO', `${tick(maxCombo)}`, ORANGE, 290);

            row('PERFECT', `${tick(counts.perfect)}`, JUDGEMENT_COLOUR.perfect, 350);
            row('GOOD', `${tick(counts.good)}`, JUDGEMENT_COLOUR.good, 390);
            row('MISS', `${tick(counts.miss)}`, JUDGEMENT_COLOUR.miss, 430);

            ctx.restore();

            drawBackButton(ctx, inside(mouse.x, mouse.y, BACK_BUTTON));
            drawHints(
                ctx,
                [
                    ['⏎', 'retry'],
                    ['esc', 'back'],
                ],
                WIDTH - 28,
                HEIGHT - 30,
                'right',
            );
        },

        enter() {
            shownAt = performance.now() / 1000;
        },

        keydown(event) {
            if (event.repeat) return;
            if (event.key === 'Enter' || event.key === 'r' || event.key === 'R') {
                event.preventDefault();
                actions.retry();
            } else if (event.key === 'Escape' || event.key === 'Backspace') {
                event.preventDefault();
                actions.back();
            }
        },

        pointermove(x, y) {
            mouse = { x, y };
            return inside(x, y, BACK_BUTTON);
        },

        pointerdown(x, y) {
            if (inside(x, y, BACK_BUTTON)) actions.back();
        },
    };
}
