import type { Chart } from './types';
import { loadChart } from './chart';
import { load as loadAudio, start as startAudio, songTime } from './conductor';
import { startInput } from './input';
import { isComplete, newGameState, press, release, update } from './judge';
import { draw } from './renderer';

const CHART_URL = 'charts/example.json';

let chart: Chart | null = null;

/** Load the chart and the song. Call once, behind the title screen. */
export async function boot(): Promise<void> {
    chart = await loadChart(CHART_URL);
    await loadAudio(chart.audio);
}

/** Begin a run. Must be called from a user gesture (the click handler). */
export async function startGame(ctx: CanvasRenderingContext2D): Promise<void> {
    if (!chart) {
        throw new Error('startGame() called before boot() finished');
    }

    const state = newGameState(chart);

    const stopInput = startInput({
        onPress: (side, time) => press(state, side, time),
        onRelease: (side, time) => release(state, side, time),
    });

    let inputActive = true;

    function frame() {
        // Read the clock ONCE. Judging and drawing must agree on "now".
        const t = songTime();

        update(state, t);
        draw(ctx, state, t);

        if (inputActive && isComplete(state)) {
            inputActive = false;
            stopInput();
        }

        requestAnimationFrame(frame);
    }

    await startAudio();
    requestAnimationFrame(frame);
}
