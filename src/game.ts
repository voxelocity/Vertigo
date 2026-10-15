import type { GameState, Screen } from './types';
import { loadChart } from './chart';
import {
    fadeOut,
    load as loadAudio,
    start as startAudio,
    stop as stopAudio,
    songTime,
} from './conductor';
import { startInput } from './input';
import { isComplete, newGameState, press, release, update } from './judge';
import { draw, resetEffects } from './renderer';

/** Seconds after the last note before the music starts to fade. */
const END_DELAY = 1.0;

/** Seconds the music takes to fade out. The results come up once it's quiet. */
const END_FADE = 2.5;

/**
 * Load a song and build the screen that plays it. Resolves once the audio is
 * decoded, so the transition stays closed over the slow part.
 */
export async function createPlayScreen(
    chartUrl: string,
    onQuit: () => void,
    onFinish: (state: GameState) => void,
): Promise<Screen> {
    // Fetched fresh every time. Judging marks the notes as it goes, so a
    // played chart is used up -- a new copy is the clean slate.
    const chart = await loadChart(chartUrl);
    await loadAudio(chart.audio);

    const state = newGameState(chart);
    resetEffects();

    let stopInput: (() => void) | null = null;
    let active = false;

    /** Song time the last note was resolved, once it has been. */
    let completedAt: number | null = null;
    let fading = false;
    let finished = false;

    return {
        draw(ctx) {
            // Read the clock ONCE. Judging and drawing must agree on "now".
            const t = songTime();

            update(state, t);
            draw(ctx, state, t);

            if (completedAt === null && isComplete(state)) {
                completedAt = t;
                stopInput?.();
                stopInput = null;
            }

            // Let the last slash play out, fade the music, then show results.
            if (completedAt !== null) {
                if (!fading && t >= completedAt + END_DELAY) {
                    fading = true;
                    fadeOut(END_FADE);
                }
                if (!finished && t >= completedAt + END_DELAY + END_FADE) {
                    finished = true;
                    onFinish(state);
                }
            }
        },

        keydown(event) {
            if (event.key === 'Escape') onQuit();
        },

        // The song starts once the transition has fully cleared, not under it.
        async enter() {
            active = true;
            await startAudio();

            // Quit while the context was still waking up.
            if (!active) {
                stopAudio();
                return;
            }

            stopInput = startInput({
                onPress: (side, time) => press(state, side, time),
                onRelease: (side, time) => release(state, side, time),
            });
        },

        leave() {
            active = false;
            stopInput?.();
            stopInput = null;
            stopAudio();
        },
    };
}
