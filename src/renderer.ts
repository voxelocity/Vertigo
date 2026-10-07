import type { GameState, Judgement, Note, Side } from './types';
import { readWaveform, WAVE_SIZE } from './conductor';
import { getSprites } from './sprites';

// --- layout -----------------------------------------------------------------

const WIDTH = 960;
const HEIGHT = 540;
const CENTER_X = WIDTH / 2;

/** The line the notes travel along. */
const TRACK_Y = 340;

// --- sizes ------------------------------------------------------------------

const NOTE_SIZE = 36;
const HOLD_HEIGHT = 28;

/** Sprites are 64x64, drawn at a whole 2x so the pixels stay square. */
const PLAYER_DRAW = 128;

/** Roughly how wide the character reads. Used to space the hit markers. */
const PLAYER_BODY = 88;

const MARKER_W = 3;
const MARKER_H = 58;

// --- hit points -------------------------------------------------------------

/**
 * How far from the centre a note should come to rest. Far enough clear of the
 * player that the two never overlap -- that gap is what the markers sit in,
 * and it's roughly where the slash arcs reach.
 */
const HIT_OFFSET = PLAYER_BODY / 2 + NOTE_SIZE / 2 + 10;

const HIT_X_LEFT = CENTER_X - HIT_OFFSET;
const HIT_X_RIGHT = CENTER_X + HIT_OFFSET;

// --- tuning -----------------------------------------------------------------

/** Seconds of warning the player gets. The number that sets difficulty. */
const APPROACH = 2.0;

/** Derived from the real travel distance, so APPROACH stays truthful. */
const PPS = HIT_X_LEFT / APPROACH;

/** How long a judgement stays on screen, in seconds. */
const POPUP_TIME = 0.5;

/** How long the two halves of a cut note live. */
const SLICE_LIFE = 0.35;

/** How far apart those halves drift over that lifetime, in pixels. */
const SLICE_SPREAD = 70;

/** Pixels a held tail splits apart, per pixel travelled past the line. */
const HOLD_SPLIT_RATE = 0.3;

/** How long the character holds a slash pose after a hit, in seconds. */
const SLASH_TIME = 0.18;

/** Seconds per idle frame. Slow enough to read as breathing, not twitching. */
const IDLE_FRAME_TIME = 0.4;

// --- colours ----------------------------------------------------------------

const BG = '#132630';
const TRACK = '#1d3a47';
const PLAYER = '#e4d5b7';
const TEXT = '#e8e8f0';
const MARKER = 'rgba(232, 232, 240, 0.45)';

// Kept as raw channels so the fading tails can build rgba() strings.
const LEFT_RGB = '232, 163, 61';
const RIGHT_RGB = '110, 231, 255';

const JUDGEMENT_COLOUR: Record<Judgement, string> = {
    perfect: '#ffd34d',
    good: '#8de36a',
    miss: '#ff6b6b',
};

// --- oscilloscope -----------------------------------------------------------

const WAVE_COLOUR = 'rgba(23, 211, 248, 0.25)';

/** Centred on the track, so the waveform runs straight through the player. */
const WAVE_CENTER_Y = TRACK_Y;
const WAVE_AMPLITUDE = 120;

/** Draw every Nth sample -- more points than pixels is detail nobody sees. */
const WAVE_STEP = 4;

/** Allocated once. Rebuilding this array 60x a second would churn memory. */
const wave = new Uint8Array(WAVE_SIZE);

// --- slice effects ----------------------------------------------------------

type Slice = {
    x: number;
    rgb: string;
    bornAt: number;
    angle: number;
};

const slices: Slice[] = [];

/**
 * Notes we've already thrown a slice for. A WeakSet means we never have to
 * clean it up -- entries vanish when the chart does.
 */
const cut = new WeakSet<Note>();

/** Notes we've already swung at, so each one triggers one slash. */
const swung = new WeakSet<Note>();

/** Song time of the most recent swing on each side. */
const lastSlash: Record<Side, number> = { L: -Infinity, R: -Infinity };

// ---------------------------------------------------------------------------

export function draw(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    songTime: number,
): void {
    collectSlices(state, songTime);
    trackSlashes(state, songTime);

    drawBackground(ctx);
    drawTrack(ctx);
    drawWave(ctx);
    drawMarkers(ctx);
    drawNotes(ctx, state, songTime);
    drawSlices(ctx, songTime);
    drawPlayer(ctx, state, songTime);
    drawHud(ctx, state, songTime);
}

/**
 * Distance past the hit line, in pixels, for a given moment in the song.
 *
 * Negative means it hasn't arrived yet. Working in this one number instead of
 * screen x means the two sides share all their maths -- only the final step
 * flips, via `dir`.
 */
function pastLine(time: number, songTime: number): number {
    return (songTime - time) * PPS;
}

/** Left notes travel right (+1), right notes travel left (-1). */
function dirOf(side: Side): number {
    return side === 'L' ? 1 : -1;
}

function hitXOf(side: Side): number {
    return side === 'L' ? HIT_X_LEFT : HIT_X_RIGHT;
}

function rgbOf(side: Side): string {
    return side === 'L' ? LEFT_RGB : RIGHT_RGB;
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/**
 * The live waveform, centred on the track and drawn over the top of it.
 *
 * This is the one thing in the game that isn't positioned from songTime --
 * it's reading the actual audio coming out of the speakers, so it's in sync
 * by definition rather than by arithmetic.
 */
function drawWave(ctx: CanvasRenderingContext2D): void {
    readWaveform(wave);

    ctx.save();
    ctx.strokeStyle = WAVE_COLOUR;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = WAVE_COLOUR;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    for (let i = 0; i < wave.length; i += WAVE_STEP) {
        const x = (i / wave.length) * WIDTH;

        // Samples run 0-255 with 128 as silence, so recentre them to -1..1.
        const y = WAVE_CENTER_Y + ((wave[i] - 128) / 128) * WAVE_AMPLITUDE;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    ctx.restore();
}

function drawTrack(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = TRACK;
    ctx.fillRect(0, TRACK_Y - NOTE_SIZE / 2 - 8, WIDTH, NOTE_SIZE + 16);
}

/** The two ticks showing where a note is meant to come to rest. */
function drawMarkers(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = MARKER;
    for (const x of [HIT_X_LEFT, HIT_X_RIGHT]) {
        ctx.fillRect(x - MARKER_W / 2, TRACK_Y - MARKER_H / 2, MARKER_W, MARKER_H);
    }
}

/**
 * Which pose the character is in right now.
 *
 * Priority runs most-specific first: a fresh swing beats a hold, a hold beats
 * standing still.
 */
function poseFor(
    state: GameState,
    songTime: number,
): HTMLImageElement | null {
    const set = getSprites();
    if (!set) return null;

    const ageL = songTime - lastSlash.L;
    const ageR = songTime - lastSlash.R;
    const liveL = ageL >= 0 && ageL < SLASH_TIME;
    const liveR = ageR >= 0 && ageR < SLASH_TIME;

    if (liveL && liveR) return set.dual;
    if (liveL) return set.left;
    if (liveR) return set.right;
    if (anyHolding(state, songTime)) return set.start;

    const frame = Math.floor(songTime / IDLE_FRAME_TIME) % 2;
    return frame === 0 ? set.idle1 : set.idle2;
}

function drawPlayer(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    songTime: number,
): void {
    // The offset shadow is what sells a flat shape as a standing cutout.
    // On a sprite it follows the transparency, so it traces the silhouette.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 7;
    ctx.shadowBlur = 6;

    const sprite = poseFor(state, songTime);

    if (sprite) {
        // Pixel art: no interpolation, and land on whole pixels.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            sprite,
            Math.round(CENTER_X - PLAYER_DRAW / 2),
            Math.round(TRACK_Y - PLAYER_DRAW / 2),
            PLAYER_DRAW,
            PLAYER_DRAW,
        );
    } else {
        // Sprites not loaded yet -- fall back to the old block.
        ctx.fillStyle = PLAYER;
        ctx.fillRect(CENTER_X - 28, TRACK_Y - 44, 56, 88);
    }

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
    const side = note.side;
    const rgb = rgbOf(side);

    const head = pastLine(note.time, songTime);
    const tail = head - note.duration * PPS;

    ctx.fillStyle = `rgb(${rgb})`;

    if (note.state === 'holding') {
        // The stretch still to arrive stays a plain bar...
        bar(ctx, side, tail, Math.min(head, 0));

        // ...and whatever has gone past the line comes apart behind it.
        if (head > 0) {
            splitTail(ctx, side, Math.max(tail, 0), head, rgb);
        }
        return;
    }

    if (note.duration > 0) {
        bar(ctx, side, tail, head);
    }

    const x = hitXOf(side) + dirOf(side) * head;
    ctx.fillRect(
        x - NOTE_SIZE / 2,
        TRACK_Y - NOTE_SIZE / 2,
        NOTE_SIZE,
        NOTE_SIZE,
    );
}

/** A solid hold bar between two distances past the line. */
function bar(
    ctx: CanvasRenderingContext2D,
    side: Side,
    from: number,
    to: number,
): void {
    if (to <= from) return;

    const hitX = hitXOf(side);
    const dir = dirOf(side);
    const x1 = hitX + dir * from;
    const x2 = hitX + dir * to;

    ctx.fillRect(
        Math.min(x1, x2),
        TRACK_Y - HOLD_HEIGHT / 2,
        Math.abs(x2 - x1),
        HOLD_HEIGHT,
    );
}

/**
 * The consumed part of a hold: two halves peeling apart and fading as they
 * get further past the line. The gap grows with distance, so the longer
 * you've held, the wider the split behind you.
 */
function splitTail(
    ctx: CanvasRenderingContext2D,
    side: Side,
    from: number,
    to: number,
    rgb: string,
): void {
    const hitX = hitXOf(side);
    const dir = dirOf(side);
    const x1 = hitX + dir * from;
    const x2 = hitX + dir * to;

    // A zero-width gradient is undefined behaviour; skip the degenerate frame.
    if (Math.abs(x2 - x1) < 0.5) return;

    const spread1 = from * HOLD_SPLIT_RATE;
    const spread2 = to * HOLD_SPLIT_RATE;
    const half = HOLD_HEIGHT / 2;

    const fade = ctx.createLinearGradient(x1, 0, x2, 0);
    fade.addColorStop(0, `rgba(${rgb}, 1)`);
    fade.addColorStop(1, `rgba(${rgb}, 0)`);

    ctx.save();
    ctx.fillStyle = fade;

    // Upper half, drifting up.
    ctx.beginPath();
    ctx.moveTo(x1, TRACK_Y - spread1 - half);
    ctx.lineTo(x2, TRACK_Y - spread2 - half);
    ctx.lineTo(x2, TRACK_Y - spread2);
    ctx.lineTo(x1, TRACK_Y - spread1);
    ctx.closePath();
    ctx.fill();

    // Lower half, drifting down.
    ctx.beginPath();
    ctx.moveTo(x1, TRACK_Y + spread1);
    ctx.lineTo(x2, TRACK_Y + spread2);
    ctx.lineTo(x2, TRACK_Y + spread2 + half);
    ctx.lineTo(x1, TRACK_Y + spread1 + half);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

/**
 * Spot notes that have just been hit and throw a slice for each.
 *
 * Scans from slightly behind the cursor, because by the time a note is hit
 * the cursor has usually already stepped past it.
 */
function collectSlices(state: GameState, songTime: number): void {
    const notes = state.chart.notes;
    const start = Math.max(0, state.cursor - 8);

    for (let i = start; i < notes.length; i++) {
        const note = notes[i];
        if (note.time - songTime > APPROACH) break;
        if (note.state !== 'hit' || cut.has(note)) continue;

        cut.add(note);
        slices.push({
            angle: Math.random() * Math.PI,
            x: hitXOf(note.side),
            rgb: rgbOf(note.side),
            bornAt: songTime,
        });
    }
}

/**
 * Note the moment each side was successfully struck, so the character can
 * swing. Fires when a hold *starts*, not when it finishes -- that's when the
 * key actually went down.
 */
function trackSlashes(state: GameState, songTime: number): void {
    const notes = state.chart.notes;
    const start = Math.max(0, state.cursor - 8);

    for (let i = start; i < notes.length; i++) {
        const note = notes[i];
        if (note.time - songTime > APPROACH) break;
        if (note.state === 'pending' || swung.has(note)) continue;

        swung.add(note);

        // 'missed' and 'dropped' also leave pending -- no swing for those.
        if (note.state === 'hit' || note.state === 'holding') {
            lastSlash[note.side] = songTime;
        }
    }
}

/** Is a hold in progress? Drives the braced stance. */
function anyHolding(state: GameState, songTime: number): boolean {
    const notes = state.chart.notes;

    for (let i = state.cursor; i < notes.length; i++) {
        const note = notes[i];
        if (note.time > songTime) break;
        if (note.state === 'holding') return true;
    }
    return false;
}

/** The two halves of a cut note, drifting apart and fading out. */
function drawSlices(ctx: CanvasRenderingContext2D, songTime: number): void {
    for (let i = slices.length - 1; i >= 0; i--) {
        const slice = slices[i];
        const age = songTime - slice.bornAt;

        if (age < 0 || age > SLICE_LIFE) {
            slices.splice(i, 1);
            continue;
        }

        const t = age / SLICE_LIFE;
        const gap = t * SLICE_SPREAD;
        const half = NOTE_SIZE / 2;

        // Each slice gets its own save/restore. rotate() multiplies into the
        // current transform rather than replacing it, so sharing one would
        // make every slice inherit the spin of the ones before it.
        ctx.save();
        ctx.translate(slice.x, TRACK_Y);
        ctx.rotate(slice.angle);

        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = `rgb(${slice.rgb})`;

        // (0, 0) is the note's centre now, so these are relative to it.
        ctx.fillRect(-half, -half - gap, NOTE_SIZE, half);
        ctx.fillRect(-half, gap, NOTE_SIZE, half);

        ctx.restore();
    }
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
