import type { Side } from './types';
import { songTime } from './conductor';

/**
 * Keys and the side each one hits, by KeyboardEvent.code -- the physical key,
 * so J and K stay put on any keyboard layout. Three pairs, use whichever:
 * the arrows, J and K, or the two mouse buttons below.
 */
const KEYS: Record<string, Side | undefined> = {
    ArrowLeft: 'L',
    ArrowRight: 'R',
    KeyJ: 'L',
    KeyK: 'R',
};

/** By MouseEvent.button: 0 is the left button (M1), 2 the right (M2). */
const BUTTONS: Record<number, Side | undefined> = {
    0: 'L',
    2: 'R',
};

/** Largest plausible gap between a key being pressed and us hearing about it. */
const MAX_EVENT_LAG = 0.25;

export type InputHandlers = {
    onPress: (side: Side, time: number) => void;
    onRelease: (side: Side, time: number) => void;
};

/**
 * Wire up the keyboard and mouse. Returns a function that unwires them again.
 *
 * Both handlers are called with the song time the input *actually* moved at,
 * not the time we got round to noticing.
 */
export function startInput(handlers: InputHandlers): () => void {
    /** Every input that's down right now, and the side it hits. */
    const held = new Map<string, Side>();

    /**
     * Put an input event on the audio clock.
     *
     * event.timeStamp shares an origin with performance.now(), so the gap
     * between them is how long the event sat in the queue. Subtracting it is
     * worth up to a frame -- about half a Perfect window at 60fps.
     */
    function eventTime(event: Event): number {
        const now = songTime();
        const lag = (performance.now() - event.timeStamp) / 1000;

        // Some browsers hand out a zeroed or odd timeStamp. If the number
        // looks wrong, trust the frame clock instead of corrupting the hit.
        if (!Number.isFinite(lag) || lag < 0 || lag > MAX_EVENT_LAG) {
            return now;
        }
        return now - lag;
    }

    function down(input: string, side: Side, event: Event) {
        // Holding a key fires keydown over and over. Without this, one hold
        // would eat every note on that side.
        if (held.has(input)) return;

        held.set(input, side);
        handlers.onPress(side, eventTime(event));
    }

    function up(input: string, event: Event) {
        const side = held.get(input);
        if (!side) return;
        held.delete(input);

        // Another input on the same side is still down (J and the left arrow,
        // say), so that side hasn't let go yet. A hold survives the swap.
        for (const other of held.values()) {
            if (other === side) return;
        }
        handlers.onRelease(side, eventTime(event));
    }

    function onKeyDown(event: KeyboardEvent) {
        const side = KEYS[event.code];
        if (!side) return;
        event.preventDefault();
        down(event.code, side, event);
    }

    function onKeyUp(event: KeyboardEvent) {
        if (!KEYS[event.code]) return;
        event.preventDefault();
        up(event.code, event);
    }

    // mousedown rather than pointerdown: with one button already held, the
    // second press only arrives as a pointermove, and both sides at once is
    // exactly what the mouse needs to do.
    function onMouseDown(event: MouseEvent) {
        const side = BUTTONS[event.button];
        if (!side) return;
        event.preventDefault();
        down(`Mouse${event.button}`, side, event);
    }

    function onMouseUp(event: MouseEvent) {
        if (!BUTTONS[event.button]) return;
        up(`Mouse${event.button}`, event);
    }

    // Right-click is M2 here, not a menu.
    function onContextMenu(event: MouseEvent) {
        event.preventDefault();
    }

    // If the tab loses focus mid-hold the release never arrives, so let go of
    // everything -- otherwise that side is stuck down forever.
    function onBlur() {
        const sides = new Set(held.values());
        held.clear();
        for (const side of sides) {
            handlers.onRelease(side, songTime());
        }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);

    return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('contextmenu', onContextMenu);
        window.removeEventListener('blur', onBlur);
    };
}
