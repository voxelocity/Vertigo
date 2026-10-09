/**
 * Plain text pages off the main menu: a title, some headed lines, a way back.
 */
import type { Screen } from './types';
import {
    BACK_BUTTON,
    BG,
    HEIGHT,
    ORANGE,
    TEXT,
    WIDTH,
    drawBackButton,
    drawHints,
    drawSparkle,
    inside,
    subFont,
    titleFont,
} from './ui';

type Section = { heading: string; lines: string[] };

export function createCredits(back: () => void): Screen {
    return textPage('Credits', back, [
        {
            heading: 'MUSIC',
            lines: [
                'LAST TIME  -  Milkoi',
                'whatdoyousee  -  prodBigMike!, GlitchCat',
                'Music provided by NoCopyrightSounds  (ncs.io)',
            ],
        },
        {
            heading: 'FONTS',
            lines: ['Kiwi Soda by jeti  -  CC BY 4.0', 'Snow Bros Neue by Damien Gosset'],
        },
        { heading: 'GAME & ART', lines: ['Voxelocity'] },
    ]);
}

export function createOptions(back: () => void): Screen {
    return textPage('Options', back, [{ heading: 'COMING SOON', lines: ['Nothing to set yet.'] }]);
}

function textPage(title: string, back: () => void, sections: Section[]): Screen {
    let mouse = { x: -1, y: -1 };

    return {
        draw(ctx, now) {
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            drawSparkle(ctx, 76, 92, now);

            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = TEXT;
            ctx.font = titleFont(56);
            ctx.fillText(title, 104, 112);

            let y = 180;
            for (const section of sections) {
                ctx.fillStyle = ORANGE;
                ctx.font = subFont(16);
                ctx.fillText(section.heading, 104, y);
                y += 30;

                ctx.fillStyle = TEXT;
                ctx.font = subFont(16);
                for (const line of section.lines) {
                    ctx.fillText(line, 104, y);
                    y += 26;
                }
                y += 20;
            }
            ctx.restore();

            drawBackButton(ctx, inside(mouse.x, mouse.y, BACK_BUTTON));
            drawHints(ctx, [['esc', 'back']], WIDTH - 28, HEIGHT - 30, 'right');
        },

        keydown(event) {
            if (event.key !== 'Escape' && event.key !== 'Backspace' && event.key !== 'Enter') {
                return;
            }
            event.preventDefault();
            if (!event.repeat) back();
        },

        pointermove(x, y) {
            mouse = { x, y };
            return inside(x, y, BACK_BUTTON);
        },

        pointerdown(x, y) {
            if (inside(x, y, BACK_BUTTON)) back();
        },
    };
}
