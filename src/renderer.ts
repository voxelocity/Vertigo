import type { GameState, Judgement, Note, Side } from './types';

// --- layout -----------------------------------------------------------------

const WIDTH = 960;
const HEIGHT = 540;
const CENTER_X = WIDTH / 2;

/** The line the notes travel along. */
const TRACK_Y = 340;

// --- tuning -----------------------------------------------------------------

/** Seconds of warning the player gets. The number that sets difficulty. */
const APPROACH = 2.0;

/** Derived, so changing APPROACH or WIDTH keeps the game equally readable. */
const PPS = CENTER_X / APPROACH;

/** How long a judgement stays on screen, in seconds. */
const POPUP_TIME = 0.5;

// --- sizes ------------------------------------------------------------------

const NOTE_SIZE = 36;
const HOLD_HEIGHT = 28;
const PLAYER_W = 56;
const PLAYER_H = 88;

// --- colours ----------------------------------------------------------------

const BG = '#132630';
const TRACK = '#1d3a47';
const PLAYER = '#e4d5b7';
const LEFT_COLOUR = '#e8a33d';
const RIGHT_COLOUR = '#6ee7ff';
const TEXT = '#e8e8f0';

const JUDGEMENT_COLOUR: Record<Judgement, string> = {
    perfect: '#ffd34d',
    good: '#8de36a',
    miss: '#ff6b6b',
};

// ---------------------------------------------------------------------------

export function draw(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    songTime: number,
): void {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawTrack(ctx);
    drawNotes(ctx, state, songTime);
    drawPlayer(ctx);
    drawHud(ctx, state, songTime);
}

/**
 * Where a given moment in the song sits on screen right now.
 *
 * This is the whole game in one line: position is a function of how far away
 * something is in TIME, so nothing can drift out of sync with the music.
 */
function xAt(side: Side, time: number, songTime: number): number {
    const delta = time - songTime;
    return side === 'L' ? CENTER_X - delta * PPS : CENTER_X + delta * PPS;
}

function drawTrack(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = TRACK;
    ctx.fillRect(0, TRACK_Y - NOTE_SIZE / 2 - 8, WIDTH, NOTE_SIZE + 16);
}

function drawPlayer(ctx: CanvasRenderingContext2D): void {
    // The offset shadow is what sells a flat shape as a standing cutout.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 7;
    ctx.shadowBlur = 6;

    ctx.fillStyle = PLAYER;
    ctx.fillRect(
        CENTER_X - PLAYER_W / 2,
        TRACK_Y - PLAYER_H / 2,
        PLAYER_W,
        PLAYER_H,
    );
    ctx.restore();
}

function drawNotes(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    songTime: number,
): void {
    const notes = state.chart.notes;

    for (let i = state.cursor; i < notes.length; i++) {
        const note = notes[i];

        // Sorted by time, so everything past here is still off screen.
        if (note.time - songTime > APPROACH) break;

        // Hit, missed and dropped notes are finished with -- don't draw them.
        if (note.state !== 'pending' && note.state !== 'holding') continue;

        drawNote(ctx, note, songTime);
    }
}

function drawNote(
    ctx: CanvasRenderingContext2D,
    note: Note,
    songTime: number,
): void {
    ctx.fillStyle = note.side === 'L' ? LEFT_COLOUR : RIGHT_COLOUR;

    const headX = xAt(note.side, note.time, songTime);

    // A hold is just a second point in time run through the same formula.
    if (note.duration > 0) {
        const tailX = xAt(note.side, note.time + note.duration, songTime);
        const left = Math.min(headX, tailX);
        const right = Math.max(headX, tailX);

        ctx.fillRect(
            left,
            TRACK_Y - HOLD_HEIGHT / 2,
            right - left,
            HOLD_HEIGHT,
        );
    }

    ctx.fillRect(
        headX - NOTE_SIZE / 2,
        TRACK_Y - NOTE_SIZE / 2,
        NOTE_SIZE,
        NOTE_SIZE,
    );
}

function drawHud(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    songTime: number,
): void {
    ctx.save();

    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`SCORE ${state.score}`, 24, 44);

    if (state.combo > 1) {
        ctx.textAlign = 'center';
        ctx.font = '48px system-ui, sans-serif';
        ctx.fillText(`${state.combo}`, CENTER_X, 110);
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillText('COMBO', CENTER_X, 134);
    }

    const last = state.lastJudgement;
    if (last) {
        const age = songTime - last.at;
        if (age >= 0 && age < POPUP_TIME) {
            // Fade out and drift upwards as it ages.
            ctx.globalAlpha = 1 - age / POPUP_TIME;
            ctx.fillStyle = JUDGEMENT_COLOUR[last.judgement];
            ctx.textAlign = 'center';
            ctx.font = '34px system-ui, sans-serif';
            ctx.fillText(
                last.judgement.toUpperCase(),
                CENTER_X,
                TRACK_Y - 80 - age * 50,
            );
        }
    }

    ctx.restore();
}
