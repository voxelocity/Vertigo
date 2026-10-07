import type { Chart, GameState, Judgement, Note, Side } from './types';

// ---------------------------------------------------------------------------
// Tuning. Everything you'll want to fiddle with lives here, in seconds.
// ---------------------------------------------------------------------------

/** Press within this of the note's time and it's a Perfect. */
export const PERFECT_WINDOW = 0.04;

/** Press within this and it's a Good. Outside it, the press is ignored. */
export const GOOD_WINDOW = 0.1;

/**
 * How early you may let go of a hold and still get credit. Deliberately
 * looser than the press windows -- releases are harder to time than presses.
 */
export const RELEASE_WINDOW = 0.12;

const SCORE: Record<Judgement, number> = {
    perfect: 300,
    good: 100,
    miss: 0,
};

/** Extra points for seeing a hold through to the end. */
const HOLD_BONUS = 150;

/** Points lost for pressing when no note is in range. */
const STRAY_PENALTY = 150;

// ---------------------------------------------------------------------------

export function newGameState(chart: Chart): GameState {
    return {
        chart,
        cursor: 0,
        score: 0,
        combo: 0,
        maxCombo: 0,
        counts: { perfect: 0, good: 0, miss: 0 },
        lastJudgement: null,
    };
}

/**
 * A key went down. Finds the closest pending note on that side and judges it.
 *
 * A tap resolves immediately. A hold only starts here -- it isn't scored
 * until it's released or runs out.
 */
export function press(state: GameState, side: Side, time: number): void {
    const note = nearestPending(state, side, time);
    if (!note) {
        registerStray(state, time);
        return;
    }

    const error = Math.abs(note.time - time);
    const judgement: Judgement = error <= PERFECT_WINDOW ? 'perfect' : 'good';
    note.judgement = judgement;

    if (note.duration === 0) {
        note.state = 'hit';
        award(state, SCORE[judgement], judgement, time);
    } else {
        note.state = 'holding';
    }
}

/** A key came up. Only means anything if a hold is in progress on that side. */
export function release(state: GameState, side: Side, time: number): void {
    const notes = state.chart.notes;

    for (let i = state.cursor; i < notes.length; i++) {
        const note = notes[i];

        // A hold in progress started in the past; nothing later can be one.
        if (note.time > time) break;
        if (note.state !== 'holding' || note.side !== side) continue;

        const end = note.time + note.duration;
        if (time >= end - RELEASE_WINDOW) {
            completeHold(state, note, time);
        } else {
            note.state = 'dropped';
            registerMiss(state, time);
        }
        return;
    }
}

/**
 * Called every frame. Notes nobody pressed never fire an event, so somebody
 * has to notice they've expired -- that's this.
 */
export function update(state: GameState, songTime: number): void {
    const notes = state.chart.notes;

    for (let i = state.cursor; i < notes.length; i++) {
        const note = notes[i];

        // Sorted by time, so nothing past here can have expired yet.
        if (note.time - songTime > GOOD_WINDOW) break;

        if (note.state === 'pending' && songTime > note.time + GOOD_WINDOW) {
            note.state = 'missed';
            registerMiss(state, songTime);
        } else if (
            note.state === 'holding' &&
            songTime >= note.time + note.duration
        ) {
            // Held all the way to the end. Holding longer isn't a failure.
            completeHold(state, note, songTime);
        }
    }

    while (state.cursor < notes.length && isResolved(notes[state.cursor])) {
        state.cursor++;
    }
}

/** Every note has been resolved -- time for the results screen. */
export function isComplete(state: GameState): boolean {
    return state.cursor >= state.chart.notes.length;
}

/** Notes currently being held, so the renderer can light up that side. */
export function activeHolds(state: GameState): Note[] {
    return state.chart.notes.filter((note) => note.state === 'holding');
}

// ---------------------------------------------------------------------------

/**
 * Closest pending note on this side within the Good window, or null.
 *
 * Starts from the cursor rather than the start of the array, so this stays
 * cheap no matter how long the chart is.
 */
function nearestPending(
    state: GameState,
    side: Side,
    time: number,
): Note | null {
    const notes = state.chart.notes;
    let best: Note | null = null;
    let bestError = Infinity;

    for (let i = state.cursor; i < notes.length; i++) {
        const note = notes[i];
        if (note.time - time > GOOD_WINDOW) break;
        if (note.side !== side || note.state !== 'pending') continue;

        const error = Math.abs(note.time - time);
        if (error <= GOOD_WINDOW && error < bestError) {
            best = note;
            bestError = error;
        }
    }

    return best;
}

function completeHold(state: GameState, note: Note, time: number): void {
    const judgement = note.judgement ?? 'good';
    note.state = 'hit';
    award(state, SCORE[judgement] + HOLD_BONUS, judgement, time);
}

function award(
    state: GameState,
    points: number,
    judgement: Judgement,
    time: number,
): void {
    state.score += points;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.counts[judgement] += 1;
    state.lastJudgement = { judgement, at: time };
}

function registerMiss(state: GameState, time: number): void {
    state.combo = 0;
    state.counts.miss += 1;
    state.lastJudgement = { judgement: 'miss', at: time };
}

/**
 * Pressed at nothing. Costs points and breaks the combo, which is what stops
 * mashing both keys from being a winning strategy.
 *
 * Deliberately does NOT touch `counts` -- that's the tally of how the chart
 * went, and a stray press didn't invent a note to miss.
 */
function registerStray(state: GameState, time: number): void {
    state.score = Math.max(0, state.score - STRAY_PENALTY);
    state.combo = 0;
    state.lastJudgement = { judgement: 'miss', at: time };
}

function isResolved(note: Note): boolean {
    return (
        note.state === 'hit' ||
        note.state === 'missed' ||
        note.state === 'dropped'
    );
}
