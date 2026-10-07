const ctx = new AudioContext();

const  analyser = ctx.createAnalyser();
analyser.fftSize = 1024
analyser.connect(ctx.destination);

export const WAVE_SIZE = analyser.fftSize

export function readWaveform(out: Uint8Array<ArrayBuffer>): void {
    analyser.getByteTimeDomainData(out);
}

let buffer: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let startTime = 0;
let running = false;

/** Fetch and decode a song. Slow -- run this behind the title screen. */
export async function load(url: string): Promise<void> {
    const response = await fetch(import.meta.env.BASE_URL + url);
    if (!response.ok) {
        throw new Error(`could not fetch ${url} (${response.status})`);
    }
    const bytes = await response.arrayBuffer();
    buffer = await ctx.decodeAudioData(bytes);
}

/** Start playback. Must be called from a user gesture (the click handler). */
export async function start(): Promise<void> {
    if (!buffer) {
        throw new Error('start() called before load() finished');
    }

    await ctx.resume();

    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);

    // These two lines belong together. Anything between them is error.
    source.start();
    startTime = ctx.currentTime;

    running = true;
}

/** Seconds since the song began. The only clock in this project. */
export function songTime(): number {
    if (!running) return 0;
    return ctx.currentTime - startTime;
}
