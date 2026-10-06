/**
 * Shared types. Everything imports from here, this imports from nothing.
 * That's what keeps the modules from depending on each other in circles.
 */

export type Side = 'L' | 'R';

export type Judgement = 'perfect' | 'good' | 'miss';

/**
 * A note's life:
 *
 *   tap:   pending -> hit
 *                  -> missed
 *
 *   hold:  pending -> holding -> hit        (held long enough)
 *                            -> dropped     (let go early)
 *                  -> missed                (never pressed)
 */
export type NoteState = 'pending' | 'holding' | 'hit' | 'dropped' | 'missed';

export type Note = {
    /** Seconds from song start when the head reaches the player. */
    time: number;
    side: Side;
    /** Seconds the key must stay down. 0 means it's a tap. */
    duration: number;
    state: NoteState;
    /** How the head was judged, once it has been. */
    judgement: Judgement | null;
};

/** A chart after loading: times in seconds, notes sorted. */
export type Chart = {
    title: string;
    artist: string;
    audio: string;
    bpm: number;
    offset: number;
    notes: Note[];
};

/** The raw JSON on disk: times in beats. See public/charts/example.json. */
export type ChartFile = {
    title: string;
    artist: string;
    audio: string;
    bpm: number;
    offset: number;
    notes: {
        beat: number;
        side: Side;
        /** Length in beats. Omit or 0 for a tap. */
        length?: number;
    }[];
};

/**
 * The entire game, in one object. If something is wrong, log this and read it.
 * Restarting is `state = newGameState(chart)` -- nothing is hidden elsewhere.
 */
export type GameState = {
    chart: Chart;
    /** Oldest note not yet resolved. Everything before it is finished. */
    cursor: number;
    score: number;
    combo: number;
    maxCombo: number;
    counts: Record<Judgement, number>;
    /** Most recent verdict, for the popup. `at` is in song seconds. */
    lastJudgement: { judgement: Judgement; at: number } | null;
};
