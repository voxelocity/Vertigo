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

/**
 * Something the judge decided, for the sound and the screen to react to.
 * The judge only records these; game.ts hands them on and clears the list.
 *
 *   hit      a note's head was pressed (a tap, or the start of a hold)
 *   holdEnd  a hold was seen through to the end
 *   miss     a note went past without being pressed
 *   drop     a hold was let go too early
 *   stray    a press with nothing in range
 */
export type JudgeEvent = {
    kind: 'hit' | 'holdEnd' | 'miss' | 'drop' | 'stray';
    judgement: Judgement;
    side: Side;
    /** The note it was about. Null for a stray press. */
    note: Note | null;
    /** Song seconds. */
    at: number;
    /** The combo this event broke, or 0 if it didn't break one. */
    lostCombo: number;
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
 * One page of the game: a menu, the level select, a song being played.
 * screens.ts runs exactly one at a time and swaps them under the transition.
 */
export type Screen = {
    /** Paint a whole frame. `now` is wall-clock seconds, for animation. */
    draw(ctx: CanvasRenderingContext2D, now: number): void;
    keydown?(event: KeyboardEvent): void;
    /** In canvas pixels. Return true when over something clickable. */
    pointermove?(x: number, y: number): boolean;
    /** In canvas pixels. */
    pointerdown?(x: number, y: number): void;
    /** Fully revealed and in control. Start things here, not on creation. */
    enter?(): void;
    /** About to be covered. Stop anything that shouldn't outlive the screen. */
    leave?(): void;
};

/** A stretch of a song the level select loops, in seconds into the song. */
export type PreviewClip = {
    audio: string;
    start: number;
    /** The fade out finishes here. */
    end: number;
};

/** A song on the level select. */
export type Level = {
    title: string;
    artist: string;
    /** Chart JSON, e.g. 'charts/foo.json'. Null shows the card as locked. */
    chart: string | null;
    /** Pips on the card, out of 5. */
    difficulty: number;
    /**
     * Card art: src/assets/ui/<art>.png or .jpg, cropped to fill the card.
     * Null for a plain grey card.
     */
    art: string | null;
    /** Looped while the card is selected. Null for silence. */
    preview: PreviewClip | null;
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
    /** Judgements not yet reacted to. game.ts drains this. */
    events: JudgeEvent[];
};
