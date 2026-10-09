import type { Screen } from './types';
import { loadChart } from './chart';
import {
    load as loadAudio,
    start as startAudio,
    stop as stopAudio,
    songTime,
} from './conductor';
import { startInput } from './input';
import { isComplete, newGameState, press, release, update } from './judge';
import { draw, resetEffects } from './renderer';

/**
 * Load a song and build the screen that plays it. Resolves once the audio is
 * decoded, so the transition stays closed over the slow part.
 */
export async function createPlayScreen(
    chartUrl: string,
    onQuit: () => void,
): Promise<Screen> {
    // Fetched fresh every time. Judging marks the notes as it goes, so a
    // played chart is used up -- a new copy is the clean slate.
    const chart = await loadChart(chartUrl);
    await loadAudio(chart.audio);

    const state = newGameState(chart);
    resetEffects();

    let stopInput: (() => void) | null = null;
    let active = false;

    return {
        draw(ctx) {
            // Read the clock ONCE. Judging and drawing must agree on "now".
            const t = songTime();

            update(state, t);
            draw(ctx, state, t);

            if (stopInput && isComplete(state)) {
                stopInput();
                stopInput = null;
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
