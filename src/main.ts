import './style.css';
import { load, start, songTime } from './conductor';

const SONG = 'songs/last-time.mp3';

const WIDTH = 960;
const HEIGHT = 540;
const BG = '#132630';

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

load(SONG)
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
    start();
});

function frame() {
    ctx!.fillStyle = BG;
    ctx!.fillRect(0, 0, WIDTH, HEIGHT);

    ctx!.fillStyle = '#fff';
    ctx!.font = '24px monospace';
    ctx!.fillText(songTime().toFixed(3), 20, 40);

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

