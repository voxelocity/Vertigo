import type { Side } from './types';
import { songTime } from './conductor';

const KEYS: Record<string, Side | undefined> = {
    ArrowLeft: 'L',
    ArrowRight: 'R',
};

/** Largest plausible gap between a key being pressed and us hearing about it. */
const MAX_EVENT_LAG = 0.25;

export type InputHandlers = {
    onPress: (side: Side, time: number) => void;
    onRelease: (side: Side, time: number) => void;
};

/**
 * Wire up the keyboard. Returns a function that unwires it again.
 *
 * Both handlers are called with the song time the key *actually* moved at,
 * not the time we got round to noticing.
 */
export function startInput(handlers: InputHandlers): () => void {
    const held = new Set<Side>();

    /**
     * Put a key event on the audio clock.
     *
     * event.timeStamp shares an origin with performance.now(), so the gap
     * between them is how long the event sat in the queue. Subtracting it is
     * worth up to a frame -- about half a Perfect window at 60fps.
     */
    function eventTime(event: KeyboardEvent): number {
        const now = songTime();
        const lag = (performance.now() - event.timeStamp) / 1000;

        // Some browsers hand out a zeroed or odd timeStamp. If the number
        // looks wrong, trust the frame clock instead of corrupting the hit.
        if (!Number.isFinite(lag) || lag < 0 || lag > MAX_EVENT_LAG) {
            return now;
        }
        return now - lag;
    }

    function onKeyDown(event: KeyboardEvent) {
        const side = KEYS[event.key];
        if (!side) return;

        // Holding a key fires keydown over and over. Without this, one hold
        // would eat every note on that side.
        if (event.repeat || held.has(side)) return;

        event.preventDefault();
        held.add(side);
        handlers.onPress(side, eventTime(event));
    }

    function onKeyUp(event: KeyboardEvent) {
        const side = KEYS[event.key];
        if (!side || !held.has(side)) return;

        event.preventDefault();
        held.delete(side);
        handlers.onRelease(side, eventTime(event));
    }

    // If the tab loses focus mid-hold the keyup never arrives, so let go of
    // everything -- otherwise that side is stuck down forever.
    function onBlur() {
        for (const side of held) {
            handlers.onRelease(side, songTime());
        }
        held.clear();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
    };
}
