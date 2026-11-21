import type { GameState, JudgeEvent, Judgement, Note, Side } from './types';
import { readWaveform, WAVE_SIZE } from './conductor';
import { getSprites } from './sprites';
import { pixelText, subFont } from './ui';

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

/** Track.png is 480x32, drawn at the same 2x -- exactly the canvas width. */
const TRACK_H = 64;

const MARKER_W = 3;
const MARKER_H = 58;

// --- hit points -------------------------------------------------------------

/**
 * How far from the centre a note should come to rest. Far enough clear of the
 * player that the two never overlap -- that gap is what the markers sit in,
 * and it's roughly where the slash arcs reach.
 */
const HIT_OFFSET = PLAYER_BODY / 2 + NOTE_SIZE / 2 + 20;

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

// --- feedback tuning ----------------------------------------------------------
//
// Everything below reacts to JudgeEvents. All of it is positioned from song
// time, so it freezes along with everything else when the song stops.

/** Pixels per second squared pulling sparks and wrecked notes down. */
const SPARK_GRAVITY = 900;
const WRECK_GRAVITY = 1400;

/** Hard cap, so a long hold can't pile up sparks forever. */
const MAX_SPARKS = 400;

/** How long a missed note takes to fall away. */
const WRECK_LIFE = 0.6;

/** How long a hit marker glows after a judgement. */
const MARKER_FLASH = 0.22;

/** How long the screen shakes. Strength is set per event. */
const SHAKE_TIME = 0.25;

/** How long the red edge glow lasts after a miss. */
const MISS_GLOW_TIME = 0.35;

/** How long the character jolts after a miss. */
const FLINCH_TIME = 0.25;

/** The judgement text starts this much bigger and snaps down to size. */
const POPUP_POP = 0.6;
const POPUP_POP_TIME = 0.12;

/** The combo number swells by this on each hit. */
const COMBO_BUMP = 0.35;
const COMBO_BUMP_TIME = 0.15;

/** A combo at least this long gets a send-off when it breaks. */
const BROKEN_COMBO_MIN = 5;
const BROKEN_COMBO_LIFE = 0.6;

const MISS_RGB = '255, 107, 107';

// --- feedback state -------------------------------------------------------------

type Spark = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    bornAt: number;
    life: number;
    colour: string;
    size: number;
};

/** An outline square bursting out of the hit point. */
type Ring = {
    x: number;
    colour: string;
    bornAt: number;
    reach: number;
    life: number;
    /** Radians. A quarter-turn diamond reads differently from the square. */
    angle: number;
};

/** A missed note, or the unplayed rest of a dropped hold, falling off the track. */
type Wreck = {
    side: Side;
    /** Screen x of the bar's two ends, frozen at the moment of the miss. */
    barFrom: number;
    barTo: number;
    /** Screen x of the head, or null when there's no head left (a drop). */
    headX: number | null;
    bornAt: number;
    spin: number;
};

type Flash = { at: number; colour: string };

const sparks: Spark[] = [];
const rings: Ring[] = [];
const wrecks: Wreck[] = [];

const markerFlash: Record<Side, Flash> = {
    L: { at: -Infinity, colour: MARKER },
    R: { at: -Infinity, colour: MARKER },
};

let shake = { at: -Infinity, strength: 0 };
let missGlowAt = -Infinity;
let flinchAt = -Infinity;
let comboBumpAt = -Infinity;
let comboBumpColour = TEXT;
let brokenCombo: { value: number; at: number } | null = null;

/** Song time of the previous frame, so holds only spray sparks while it moves. */
let lastFrameAt = -Infinity;

// ---------------------------------------------------------------------------

/** Forget the last run's slices and swings. Call before starting a new one. */
export function resetEffects(): void {
    slices.length = 0;
    lastSlash.L = -Infinity;
    lastSlash.R = -Infinity;

    sparks.length = 0;
    rings.length = 0;
    wrecks.length = 0;
    markerFlash.L = { at: -Infinity, colour: MARKER };
    markerFlash.R = { at: -Infinity, colour: MARKER };
    shake = { at: -Infinity, strength: 0 };
    missGlowAt = -Infinity;
    flinchAt = -Infinity;
    comboBumpAt = -Infinity;
    brokenCombo = null;
    lastFrameAt = -Infinity;
}

/** Something was just judged. Kick off whatever it looks like. */
export function react(event: JudgeEvent): void {
    const { side, at } = event;
    const x = hitXOf(side);
    const rgb = rgbOf(side);

    if (event.kind === 'hit' || event.kind === 'holdEnd') {
        const perfect = event.judgement === 'perfect';
        const colour = JUDGEMENT_COLOUR[event.judgement];

        burst(x, TRACK_Y, at, perfect ? 22 : 12, perfect ? 1 : 0.7, [
            `rgb(${rgb})`,
            colour,
            '#ffffff',
        ]);
        rings.push({ x, colour, bornAt: at, reach: perfect ? 60 : 40, life: 0.28, angle: 0 });
        if (perfect) {
            rings.push({ x, colour: '#ffffff', bornAt: at + 0.03, reach: 40, life: 0.22, angle: Math.PI / 4 });
            kick(2.5, at);
        }
        markerFlash[side] = { at, colour };

        // The start of a hold isn't scored yet, so the combo hasn't moved.
        const scored = event.kind === 'holdEnd' || event.note?.duration === 0;
        if (scored) {
            comboBumpAt = at;
            comboBumpColour = colour;
        }
        return;
    }

    // Everything else is some kind of failure.
    markerFlash[side] = { at, colour: JUDGEMENT_COLOUR.miss };
    if (event.lostCombo >= BROKEN_COMBO_MIN) {
        brokenCombo = { value: event.lostCombo, at };
    }

    if (event.kind === 'stray') {
        kick(3, at);
        burst(x, TRACK_Y, at, 6, 0.4, [`rgb(${MISS_RGB})`, '#6a8694']);
        return;
    }

    kick(8, at);
    missGlowAt = at;
    flinchAt = at;
    if (event.note) wreck(event, event.note);
}

export function draw(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    songTime: number,
): void {
    collectSlices(state, songTime);
    trackSlashes(state, songTime);

    const holding = holdingSides(state, songTime);
    if (songTime > lastFrameAt) {
        for (const side of holding) holdSparks(side, songTime);
    }
    lastFrameAt = songTime;

    drawBackground(ctx);

    // Everything on the stage shakes; the HUD stays put so it stays readable.
    const [sx, sy] = shakeOffset(songTime);
    ctx.save();
    ctx.translate(sx, sy);
    drawTrack(ctx);
    drawWave(ctx);
    drawMarkers(ctx, songTime, holding);
    drawWrecks(ctx, songTime);
    drawNotes(ctx, state, songTime);
    drawSlices(ctx, songTime);
    drawRings(ctx, songTime);
    drawPlayer(ctx, state, songTime);
    drawSparks(ctx, songTime);
    ctx.restore();

    drawMissGlow(ctx, songTime);
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
    const set = getSprites();

    if (set) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            set.track,
            0,
            Math.round(TRACK_Y - TRACK_H / 2),
            WIDTH,
            TRACK_H,
        );
        ctx.restore();
        return;
    }

    // Not loaded yet -- plain band.
    ctx.fillStyle = TRACK;
    ctx.fillRect(0, TRACK_Y - NOTE_SIZE / 2 - 8, WIDTH, NOTE_SIZE + 16);
}

/**
 * The two ticks showing where a note is meant to come to rest. They flare in
 * the judgement's colour when something lands, and pulse while held.
 */
function drawMarkers(
    ctx: CanvasRenderingContext2D,
    songTime: number,
    holding: Set<Side>,
): void {
    for (const side of ['L', 'R'] as const) {
        const x = hitXOf(side);

        ctx.fillStyle = MARKER;
        ctx.fillRect(x - MARKER_W / 2, TRACK_Y - MARKER_H / 2, MARKER_W, MARKER_H);

        const flash = markerFlash[side];
        const k = fade(songTime - flash.at, MARKER_FLASH);
        const hold = holding.has(side) ? 0.45 + 0.2 * Math.sin(songTime * 30) : 0;

        if (hold > 0) {
            glowBar(ctx, x, MARKER_W + 2, MARKER_H + 6, `rgb(${rgbOf(side)})`, hold);
        }
        if (k > 0) {
            glowBar(ctx, x, MARKER_W + 6 * k, MARKER_H + 26 * k, flash.colour, k);
        }
    }
}

function glowBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    w: number,
    h: number,
    colour: string,
    alpha: number,
): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 18;
    ctx.fillRect(x - w / 2, TRACK_Y - h / 2, w, h);
    ctx.restore();
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

    // A miss knocks the character about for a moment.
    const flinchAge = songTime - flinchAt;
    const jolt =
        Math.sin(flinchAge * 90) * 6 * fade(flinchAge, FLINCH_TIME);

    if (sprite) {
        // Pixel art: no interpolation, and land on whole pixels.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            sprite,
            Math.round(CENTER_X - PLAYER_DRAW / 2 + jolt),
            Math.round(TRACK_Y - PLAYER_DRAW / 2),
            PLAYER_DRAW,
            PLAYER_DRAW,
        );
    } else {
        // Sprites not loaded yet -- fall back to the old block.
        ctx.fillStyle = PLAYER;
        ctx.fillRect(CENTER_X - 28 + jolt, TRACK_Y - 44, 56, 88);
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
    return holdingSides(state, songTime).size > 0;
}

/** Which sides have a hold in progress right now. */
function holdingSides(state: GameState, songTime: number): Set<Side> {
    const notes = state.chart.notes;
    const sides = new Set<Side>();

    for (let i = state.cursor; i < notes.length; i++) {
        const note = notes[i];
        if (note.time > songTime) break;
        if (note.state === 'holding') sides.add(note.side);
    }
    return sides;
}

// --- feedback -------------------------------------------------------------------

/** 1 at age 0, easing to 0 at `life`. 0 outside that span. */
function fade(age: number, life: number): number {
    if (age < 0 || age >= life) return 0;
    const k = 1 - age / life;
    return k * k;
}

function pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

/** Throw a handful of square sparks out from a point. */
function burst(
    x: number,
    y: number,
    at: number,
    count: number,
    power: number,
    colours: string[],
): void {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (140 + Math.random() * 280) * power;
        addSpark({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 120 * power,
            bornAt: at,
            life: 0.25 + Math.random() * 0.25,
            colour: pick(colours),
            size: 2 * Math.ceil(Math.random() * 2) + 1,
        });
    }
}

/** A hold grinds a thin trickle of sparks off the hit point. */
function holdSparks(side: Side, songTime: number): void {
    const dir = dirOf(side);
    for (let i = 0; i < 2; i++) {
        addSpark({
            x: hitXOf(side),
            y: TRACK_Y + (Math.random() - 0.5) * HOLD_HEIGHT,
            // Sprayed back the way the notes came from.
            vx: -dir * (60 + Math.random() * 160),
            vy: -60 - Math.random() * 180,
            bornAt: songTime,
            life: 0.2 + Math.random() * 0.2,
            colour: Math.random() < 0.3 ? '#ffffff' : `rgb(${rgbOf(side)})`,
            size: 2,
        });
    }
}

function addSpark(spark: Spark): void {
    if (sparks.length >= MAX_SPARKS) sparks.shift();
    sparks.push(spark);
}

function drawSparks(ctx: CanvasRenderingContext2D, songTime: number): void {
    ctx.save();
    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = songTime - s.bornAt;
        if (age < 0) continue;
        if (age > s.life) {
            sparks.splice(i, 1);
            continue;
        }

        const x = s.x + s.vx * age;
        const y = s.y + s.vy * age + 0.5 * SPARK_GRAVITY * age * age;

        ctx.globalAlpha = 1 - age / s.life;
        ctx.fillStyle = s.colour;
        ctx.fillRect(Math.round(x - s.size / 2), Math.round(y - s.size / 2), s.size, s.size);
    }
    ctx.restore();
}

/** Outline squares bursting out of the hit point. */
function drawRings(ctx: CanvasRenderingContext2D, songTime: number): void {
    for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        const age = songTime - ring.bornAt;
        if (age < 0) continue;
        if (age > ring.life) {
            rings.splice(i, 1);
            continue;
        }

        const t = age / ring.life;
        const ease = 1 - (1 - t) * (1 - t) * (1 - t);
        const r = NOTE_SIZE / 2 + ring.reach * ease;

        ctx.save();
        ctx.translate(ring.x, TRACK_Y);
        ctx.rotate(ring.angle);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = ring.colour;
        ctx.lineWidth = 1 + 5 * (1 - t);
        ctx.strokeRect(-r, -r, r * 2, r * 2);
        ctx.restore();
    }
}

/** Freeze a missed note where it died, so it can tumble off the track. */
function wreck(event: JudgeEvent, note: Note): void {
    const at = event.at;
    const hitX = hitXOf(note.side);
    const dir = dirOf(note.side);
    const toX = (time: number) => hitX + dir * pastLine(time, at);

    // A drop only loses the part that hadn't been held yet.
    const end = note.time + note.duration;
    const from = event.kind === 'drop' ? at : note.time;

    wrecks.push({
        side: note.side,
        barFrom: toX(from),
        barTo: end > from ? toX(end) : toX(from),
        headX: event.kind === 'miss' ? toX(note.time) : null,
        bornAt: at,
        spin: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4),
    });
}

function drawWrecks(ctx: CanvasRenderingContext2D, songTime: number): void {
    for (let i = wrecks.length - 1; i >= 0; i--) {
        const w = wrecks[i];
        const age = songTime - w.bornAt;
        if (age < 0) continue;
        if (age > WRECK_LIFE) {
            wrecks.splice(i, 1);
            continue;
        }

        const t = age / WRECK_LIFE;
        const dir = dirOf(w.side);
        const drop = 0.5 * WRECK_GRAVITY * age * age;
        const drift = dir * 60 * age;
        const alpha = 1 - t;

        // A beat of solid red so the miss registers, then the note's own
        // colour, dimmed, as it falls away.
        const fill =
            age < 0.08
                ? `rgba(${MISS_RGB}, ${alpha})`
                : `rgba(${rgbOf(w.side)}, ${alpha * 0.45})`;
        const edge = `rgba(${MISS_RGB}, ${alpha})`;

        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2;

        const barW = Math.abs(w.barTo - w.barFrom);
        if (barW > 0.5) {
            const left = Math.min(w.barFrom, w.barTo) + drift;
            const top = TRACK_Y - HOLD_HEIGHT / 2 + drop;
            ctx.fillRect(left, top, barW, HOLD_HEIGHT);
            ctx.strokeRect(left, top, barW, HOLD_HEIGHT);
        }

        if (w.headX !== null) {
            const half = NOTE_SIZE / 2;
            ctx.translate(w.headX + drift, TRACK_Y + drop);
            ctx.rotate(w.spin * age);
            ctx.fillRect(-half, -half, NOTE_SIZE, NOTE_SIZE);
            ctx.strokeRect(-half, -half, NOTE_SIZE, NOTE_SIZE);
        }
        ctx.restore();
    }
}

/** Shake the stage. A weaker shake never cuts a stronger one short. */
function kick(strength: number, at: number): void {
    const current = shake.strength * fade(at - shake.at, SHAKE_TIME);
    if (strength >= current) shake = { at, strength };
}

function shakeOffset(songTime: number): [number, number] {
    const k = shake.strength * fade(songTime - shake.at, SHAKE_TIME);
    if (k <= 0) return [0, 0];
    return [(Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k];
}

/** A red glow creeping in from the edges after a miss. */
function drawMissGlow(ctx: CanvasRenderingContext2D, songTime: number): void {
    const k = fade(songTime - missGlowAt, MISS_GLOW_TIME);
    if (k <= 0) return;

    const glow = ctx.createRadialGradient(
        CENTER_X, HEIGHT / 2, HEIGHT * 0.35,
        CENTER_X, HEIGHT / 2, WIDTH * 0.62,
    );
    glow.addColorStop(0, `rgba(${MISS_RGB}, 0)`);
    glow.addColorStop(1, `rgba(${MISS_RGB}, ${0.4 * k})`);

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
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
    ctx.font = subFont(16);
    pixelText(ctx, `SCORE ${state.score}`, 24, 44);

    if (state.combo > 1) {
        // Swell on every hit, flashing the colour of the judgement.
        const bump = fade(songTime - comboBumpAt, COMBO_BUMP_TIME);
        ctx.save();
        ctx.translate(CENTER_X, 110);
        ctx.scale(1 + COMBO_BUMP * bump, 1 + COMBO_BUMP * bump);
        ctx.fillStyle = bump > 0.3 ? comboBumpColour : TEXT;
        ctx.font = subFont(48);
        pixelText(ctx, `${state.combo}`, 0, 0, 'center');
        ctx.restore();

        ctx.font = subFont(16);
        pixelText(ctx, 'COMBO', CENTER_X, 134, 'center');
    }

    drawBrokenCombo(ctx, state, songTime);

    const last = state.lastJudgement;
    if (last) {
        const age = songTime - last.at;
        if (age >= 0 && age < POPUP_TIME) {
            // Punch in big, snap down to size, then fade and drift upwards.
            const pop = 1 + POPUP_POP * fade(age, POPUP_POP_TIME);
            const miss = last.judgement === 'miss';
            const wobble = miss
                ? Math.sin(age * 70) * 8 * (1 - age / POPUP_TIME)
                : 0;

            ctx.save();
            ctx.globalAlpha = 1 - age / POPUP_TIME;
            ctx.fillStyle = JUDGEMENT_COLOUR[last.judgement];
            ctx.font = subFont(32);
            ctx.translate(CENTER_X + wobble, TRACK_Y - 80 - age * 50);
            ctx.scale(pop, pop);
            pixelText(ctx, last.judgement.toUpperCase(), 0, 0, 'center');
            ctx.restore();
        }
    }

    ctx.restore();
}

/** The combo you just lost, turning red and dropping off the screen. */
function drawBrokenCombo(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    songTime: number,
): void {
    if (!brokenCombo) return;
    const age = songTime - brokenCombo.at;
    if (age < 0) return;
    if (age > BROKEN_COMBO_LIFE || state.combo > 1) {
        // Gone, or a new combo has taken its spot.
        brokenCombo = null;
        return;
    }

    ctx.save();
    ctx.globalAlpha = 1 - age / BROKEN_COMBO_LIFE;
    ctx.fillStyle = JUDGEMENT_COLOUR.miss;
    ctx.translate(CENTER_X, 110 + 0.5 * 700 * age * age);
    ctx.rotate(age * 0.6);
    ctx.font = subFont(48);
    pixelText(ctx, `${brokenCombo.value}`, 0, 0, 'center');
    ctx.restore();
}
