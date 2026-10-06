import './style.css';
import { boot, startGame } from './game';

const WIDTH = 960;
const HEIGHT = 540;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const overlay = document.querySelector<HTMLDivElement>('#overlay');
const startButton = document.querySelector<HTMLButtonElement>('#start');

if (!canvas || !overlay || !startButton) {
    throw new Error('index is missing game, overlay, or start');
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

startButton.disabled = true;
startButton.textContent = 'Loading...';

boot()
    .then(() => {
        startButton.disabled = false;
        startButton.textContent = 'Click to play';
    })
    .catch((err) => {
        startButton.textContent = 'Failed to load';
        console.error(err);
    });

startButton.addEventListener('click', () => {
    overlay.classList.add('hidden');
    startGame(ctx);
});
