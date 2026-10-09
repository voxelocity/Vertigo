import './style.css';
import type { Screen } from './types';
import { preload } from './conductor';
import { createPlayScreen } from './game';
import { createCredits, createOptions } from './info';
import { createLevelSelect } from './levelselect';
import { LEVELS } from './levels';
import { createMainMenu } from './menu';
import { goTo, start } from './screens';
import { loadSprites, loadUiSprites } from './sprites';

const WIDTH = 960;
const HEIGHT = 540;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
    throw new Error('index is missing the game canvas');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
    throw new Error('cant get 2d context boiiii');
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas!.width = WIDTH * dpr;
    canvas!.height = HEIGHT * dpr;
    canvas!.style.width = `${WIDTH}px`;
    canvas!.style.height = `${HEIGHT}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resize();
window.addEventListener('resize', resize);

// How the pages connect. Screens only know the callbacks they're handed,
// so none of them import each other.
const menu: Screen = createMainMenu({
    play: () => goTo(levels),
    options: () => goTo(options),
    credits: () => goTo(credits),
});

const levels: Screen = createLevelSelect(LEVELS, {
    back: () => goTo(menu),
    play: (chart) => goTo(createPlayScreen(chart, () => goTo(levels))),
});

const options = createOptions(() => goTo(menu));
const credits = createCredits(() => goTo(menu));

// Fonts and sprites load behind the opening transition. If any of it fails the
// menus still work -- every sprite has a fallback.
const ready = Promise.all([
    document.fonts.load('32px "Kiwi Soda"'),
    document.fonts.load('16px "Snow Bros Neue"'),
    loadSprites(),
    loadUiSprites(),
])
    .catch((err) => console.error(err))
    .then(() => menu);

start(ctx, ready);

// Decode the preview songs while the player is still on the menu, so the
// level select can start playing the moment it opens.
void ready.then(() => {
    for (const level of LEVELS) {
        if (level.preview) preload(level.preview.audio);
    }
});
