import idle1Url from './assets/sprites/Vertigo_IdleSprite1.png';
import idle2Url from './assets/sprites/Vertigo_IdleSprite2.png';
import startUrl from './assets/sprites/Vertigo_SlashSpriteStart.png';
import leftUrl from './assets/sprites/Vertigo_SlashSpriteLeft.png';
import rightUrl from './assets/sprites/Vertigo_SlashSpriteRight.png';
import dualUrl from './assets/sprites/Vertigo_SlashSpriteDual.png';
// Deliberately NOT named Track.png. Ad blockers (EasyPrivacy's `/track.png?`
// rule) treat that as a tracking pixel and block it, and one blocked import
// stops the whole game loading -- no CSS, no JS, nothing. Avoid "track",
// "pixel", "analytics", "beacon" etc. in any asset filename.
import trackUrl from './assets/sprites/Vertigo_Lane.png';

/** Character sprites are 64x64. Draw at a whole multiple to stay crisp. */
export const SPRITE_SIZE = 64;

/** Track.png is 480x32, which is exactly the canvas width at the same 2x. */
export const TRACK_SOURCE_W = 480;
export const TRACK_SOURCE_H = 32;

export type SpriteSet = {
    idle1: HTMLImageElement;
    idle2: HTMLImageElement;
    /** Braced stance, used while a hold is in progress. */
    start: HTMLImageElement;
    left: HTMLImageElement;
    right: HTMLImageElement;
    dual: HTMLImageElement;
    track: HTMLImageElement;
};

let sprites: SpriteSet | null = null;

/**
 * `decode()` rather than `onload`.
 *
 * onload only means the bytes arrived -- the browser can still decode on the
 * first drawImage, which stalls a frame. At 60fps that hitch lands exactly
 * when the first note appears, and it looks like a timing bug.
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
}

/** Load every sprite. Call once, behind the title screen. */
export async function loadSprites(): Promise<void> {
    const [idle1, idle2, start, left, right, dual, track] = await Promise.all([
        loadImage(idle1Url),
        loadImage(idle2Url),
        loadImage(startUrl),
        loadImage(leftUrl),
        loadImage(rightUrl),
        loadImage(dualUrl),
        loadImage(trackUrl),
    ]);

    sprites = { idle1, idle2, start, left, right, dual, track };
}

/** Null until loadSprites() resolves, so the renderer can fall back. */
export function getSprites(): SpriteSet | null {
    return sprites;
}
