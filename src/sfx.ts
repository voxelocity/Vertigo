/**
 * Sound effects, synthesised on the spot -- no files to load, and nothing
 * to wait for. Every sound is a few oscillators and filtered noise bursts
 * that build themselves, play once, and get thrown away.
 */
import type { JudgeEvent, Side } from './types';
import { audioContext, muffle, sfxOut } from './conductor';

const ctx = audioContext();

/** How far left or right a side's sounds sit, -1..1. */
const PAN = 0.3;

/** One second of white noise, shared by every burst. Built on first use. */
let noise: AudioBuffer | null = null;

function noiseBuffer(): AudioBuffer {
    if (!noise) {
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noise;
}

/** Play whatever a judgement sounds like. Call as soon as it happens. */
export function playSfx(event: JudgeEvent): void {
    const t = ctx.currentTime;
    const out = panned(event.side);
    const perfect = event.judgement === 'perfect';

    switch (event.kind) {
        case 'hit':
            slash(out, t, perfect);
            break;
        case 'holdEnd':
            chime(out, t, perfect);
            break;
        case 'miss':
        case 'drop':
            thud(out, t);
            muffle();
            break;
        case 'stray':
            clunk(out, t);
            break;
    }
}

// --- the sounds -------------------------------------------------------------

/** A blade swish with a bright ring on top. Perfects ring higher and longer. */
function slash(out: AudioNode, t: number, perfect: boolean): void {
    noiseBurst(out, t, 'bandpass', 8000, 2200, 0.9, perfect ? 0.55 : 0.45, 0.08);
    tone(out, t, 'sine', 190, 55, 0.5, 0.09);

    if (perfect) {
        tone(out, t, 'triangle', 1568, 1568, 0.16, 0.22);
        tone(out, t, 'sine', 2349, 2349, 0.08, 0.16);
    } else {
        tone(out, t, 'triangle', 1047, 1047, 0.12, 0.12);
    }
}

/** Two rising notes: the hold paid off. */
function chime(out: AudioNode, t: number, perfect: boolean): void {
    const [a, b] = perfect ? [1319, 1976] : [1047, 1568];
    tone(out, t, 'triangle', a, a, 0.14, 0.14);
    tone(out, t + 0.06, 'triangle', b, b, 0.14, 0.24);
    noiseBurst(out, t, 'highpass', 6000, 6000, 0.7, 0.18, 0.06);
}

/** A dull, falling buzz and a thump. Unmistakably not a hit. */
function thud(out: AudioNode, t: number): void {
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 900;
    dull.connect(out);

    tone(dull, t, 'square', 150, 50, 0.16, 0.26);
    noiseBurst(out, t, 'lowpass', 900, 200, 0.7, 0.4, 0.14);
}

/** A small hollow knock for pressing at nothing. Quiet -- it's a nudge. */
function clunk(out: AudioNode, t: number): void {
    tone(out, t, 'triangle', 320, 140, 0.15, 0.06);
    noiseBurst(out, t, 'bandpass', 1500, 800, 1.5, 0.12, 0.04);
}

// --- building blocks ----------------------------------------------------------

const ATTACK = 0.003;

/** A fresh panner into the effects bus, for one sound's worth of nodes. */
function panned(side: Side): AudioNode {
    const pan = ctx.createStereoPanner();
    pan.pan.value = side === 'L' ? -PAN : PAN;
    pan.connect(sfxOut);
    return pan;
}

/** A gain that snaps up to `peak` and decays away to silence. */
function envelope(out: AudioNode, t: number, peak: number, decay: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ATTACK + decay);
    gain.connect(out);
    return gain;
}

/** One oscillator note, sliding from `from` to `to` Hz as it decays. */
function tone(
    out: AudioNode,
    t: number,
    type: OscillatorType,
    from: number,
    to: number,
    peak: number,
    decay: number,
): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + decay);

    osc.connect(envelope(out, t, peak, decay));
    osc.start(t);
    osc.stop(t + ATTACK + decay + 0.02);
}

/** A burst of filtered noise, the filter sweeping from `from` to `to` Hz. */
function noiseBurst(
    out: AudioNode,
    t: number,
    type: BiquadFilterType,
    from: number,
    to: number,
    q: number,
    peak: number,
    decay: number,
): void {
    const length = ATTACK + decay + 0.02;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, t + length);

    src.connect(filter);
    filter.connect(envelope(out, t, peak, decay));

    // A random slice of the noise, so repeated hits don't sound identical.
    src.start(t, Math.random() * (1 - length));
    src.stop(t + length);
}
