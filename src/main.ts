
import './style.css';

const WIDTH = 800;
const HEIGHT = 600;
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

ctx.fillStyle = BG;
ctx.fillRect(0, 0, WIDTH, HEIGHT);

export {};
