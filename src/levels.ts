import type { Level } from './types';

/** Everything on the level select, in order. */
export const LEVELS: Level[] = [
    {
        title: 'LAST TIME',
        artist: 'Milkoi',
        chart: 'charts/example.json',
        difficulty: 2,
        art: 'card_last_time',
        preview: { audio: 'songs/last-time.mp3', start: 29, end: 50 },
    },
    {
        title: 'whatdoyousee',
        artist: 'prodBigMike!, GlitchCat',
        chart: null,
        difficulty: 3,
        art: 'card_whatdoyousee',
        preview: { audio: 'songs/whatdoyousee.mp3', start: 22, end: 43 },
    },
    // Empty slots, so the row reads as a row. Replace with real songs.
    { title: '???', artist: '', chart: null, difficulty: 0, art: null, preview: null },
    { title: '???', artist: '', chart: null, difficulty: 0, art: null, preview: null },
    { title: '???', artist: '', chart: null, difficulty: 0, art: null, preview: null },
];
