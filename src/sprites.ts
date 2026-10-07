import idle1Url from './assets/sprites/Vertigo_IdleSprite1.png';
import idle2Url from './assets/sprites/Vertigo_IdleSprite2.png';
import startUrl from './assets/sprites/Vertigo_SlashSpriteStart.png';
import leftUrl from './assets/sprites/Vertigo_SlashSpriteLeft.png';
import rightUrl from './assets/sprites/Vertigo_SlashSpriteRight.png';
import dualUrl from './assets/sprites/Vertigo_SlashSpriteDual.png';

/** Every sprite is 64x64. Draw at a whole multiple of this to stay crisp. */
export const SPRITE_SIZE = 64;

export type SpriteSet = {
    idle1: HTMLImageElement;
    idle2: HTMLImageElement;
    /** Braced stance, used while a hold is in progress. */
    start: HTMLImageElement;
    left: HTMLImageElement;
    right: HTMLImageElement;
    dual: HTMLImageElement;
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
    const [idle1, idle2, start, left, right, dual] = await Promise.all([
        loadImage(idle1Url),
        loadImage(idle2Url),
        loadImage(startUrl),
        loadImage(leftUrl),
        loadImage(rightUrl),
        loadImage(dualUrl),
    ]);

    sprites = { idle1, idle2, start, left, right, dual };
}

/** Null until loadSprites() resolves, so the renderer can fall back. */
export function getSprites(): SpriteSet | null {
    return sprites;
}
