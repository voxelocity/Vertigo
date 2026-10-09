import type { PreviewClip } from './types';

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

/** Where songTime() sits while nothing is playing. */
let stoppedAt = 0;

/**
 * Decoded songs by url. Decoding takes seconds, so each one only happens
 * once -- and it's the promise that's kept, so a preview and the game asking
 * at the same moment share one decode instead of racing two.
 */
const decoded = new Map<string, Promise<AudioBuffer>>();

/**
 * Call from every user gesture. The context starts suspended and browsers
 * only let it resume inside one, so the first menu keypress or click is what
 * makes sound possible at all.
 */
export function unlock(): void {
    if (ctx.state === 'suspended') void ctx.resume();
}

function decode(url: string): Promise<AudioBuffer> {
    let song = decoded.get(url);
    if (!song) {
        song = fetch(import.meta.env.BASE_URL + url).then(async (response) => {
            if (!response.ok) {
                throw new Error(`could not fetch ${url} (${response.status})`);
            }
            return ctx.decodeAudioData(await response.arrayBuffer());
        });
        decoded.set(url, song);

        // Don't cache a failure; let the next ask try again.
        song.catch(() => decoded.delete(url));
    }
    return song;
}

/** Start decoding a song in the background, so it's ready when it's wanted. */
export function preload(url: string): void {
    decode(url).catch((err) => console.error(err));
}

/** Fetch and decode a song for the game. Slow -- run this behind a transition. */
export async function load(url: string): Promise<void> {
    buffer = await decode(url);
    stoppedAt = 0;
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

/** Stop the song. songTime() freezes where it was, so the last frame holds still. */
export function stop(): void {
    if (!running) return;
    stoppedAt = songTime();
    running = false;
    source?.stop();
    source = null;
}

/** Seconds since the song began. The only clock in this project. */
export function songTime(): number {
    if (!running) return stoppedAt;
    return ctx.currentTime - startTime;
}

// --- previews ---------------------------------------------------------------
//
// The level select loops a clip of whichever song is selected. Nothing here
// touches songTime() -- previews are just sound, not a clock.

/** Previews sit a little under the game's volume. */
const PREVIEW_VOLUME = 0.8;

/** Seconds to fade in at the start of the clip, and out before its end. */
const PREVIEW_FADE_IN = 0.5;
const PREVIEW_FADE_OUT = 2.5;

/** Seconds to fade out when a preview is cut short. */
const PREVIEW_STOP_FADE = 0.4;

/** Seconds of quiet before the clip loops. */
const PREVIEW_GAP = 0.6;

type Preview = {
    clip: PreviewClip;
    gain: GainNode;
    source: AudioBufferSourceNode | null;
};

let preview: Preview | null = null;

/**
 * Loop a clip, fading in and out. Replaces whatever preview was playing;
 * asking for the one already playing does nothing, so it never restarts.
 */
export function playPreview(clip: PreviewClip): void {
    if (preview?.clip === clip) return;
    stopPreview();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);

    const current: Preview = { clip, gain, source: null };
    preview = current;

    decode(clip.audio).then(
        (song) => {
            // Still wanted? The selection may have moved while it decoded.
            if (preview === current) loopPreview(current, song, ctx.currentTime);
        },
        (err) => console.error(err),
    );
}

/** Fade out whatever preview is playing. */
export function stopPreview(): void {
    if (!preview) return;
    const { gain, source } = preview;
    preview = null;

    const now = ctx.currentTime;
    const end = now + PREVIEW_STOP_FADE;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, end);
    source?.stop(end);
    setTimeout(() => gain.disconnect(), PREVIEW_STOP_FADE * 1000 + 100);
}

function loopPreview(p: Preview, song: AudioBuffer, at: number): void {
    const { start, end } = p.clip;
    const length = end - start;

    const source = ctx.createBufferSource();
    source.buffer = song;
    source.connect(p.gain);

    const volume = p.gain.gain;
    volume.cancelScheduledValues(at);
    volume.setValueAtTime(0, at);
    volume.linearRampToValueAtTime(PREVIEW_VOLUME, at + PREVIEW_FADE_IN);
    volume.setValueAtTime(PREVIEW_VOLUME, at + length - PREVIEW_FADE_OUT);
    volume.linearRampToValueAtTime(0, at + length);

    source.start(at, start, length);
    p.source = source;

    // Also fires when stopPreview() cuts it off, hence the check.
    source.onended = () => {
        if (preview === p) loopPreview(p, song, ctx.currentTime + PREVIEW_GAP);
    };
}
