import type { Chart, ChartFile, Note } from './types';

/** Fetch a chart JSON and convert it into something the game can run. */
export async function loadChart(url: string): Promise<Chart> {
    const response = await fetch(import.meta.env.BASE_URL + url);
    if (!response.ok) {
        throw new Error(`could not fetch ${url} (${response.status})`);
    }
    return parseChart(await response.json());
}

/**
 * Beats -> seconds, once, at load time. After this the whole game thinks in
 * seconds and never has to know what a beat was.
 */
export function parseChart(file: ChartFile): Chart {
    if (typeof file.bpm !== 'number' || file.bpm <= 0) {
        throw new Error(`chart has a bad bpm: ${file.bpm}`);
    }
    if (!Array.isArray(file.notes)) {
        throw new Error('chart has no notes array');
    }

    const secondsPerBeat = 60 / file.bpm;
    const offset = file.offset ?? 0;

    const notes: Note[] = file.notes.map((raw, i) => {
        if (typeof raw.beat !== 'number') {
            throw new Error(`note ${i} has no beat`);
        }
        if (raw.side !== 'L' && raw.side !== 'R') {
            throw new Error(`note ${i} has side "${raw.side}", expected L or R`);
        }

        return {
            time: offset + raw.beat * secondsPerBeat,
            side: raw.side,
            duration: (raw.length ?? 0) * secondsPerBeat,
            state: 'pending',
            judgement: null,
        };
    });

    // The judge and the renderer both walk this array forwards and assume it
    // is in time order. Sorting here means charts don't have to be tidy.
    notes.sort((a, b) => a.time - b.time);

    return {
        title: file.title,
        artist: file.artist,
        audio: file.audio,
        bpm: file.bpm,
        offset,
        notes,
    };
}

/** When the last note finishes. Useful for knowing the song is over. */
export function chartEnd(chart: Chart): number {
    let end = 0;
    for (const note of chart.notes) {
        end = Math.max(end, note.time + note.duration);
    }
    return end;
}
