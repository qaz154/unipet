/**
 * Official Pet Characters — 3 built-in pixel art pets
 * Each is a 24×32 pixel sprite defined with palette-mapped grid strings.
 */

type Grid = (string | null)[][];

const PW = 24;
const PH = 32;

// ─── Palette (8 colors) ───────────────────────────────

const PAL: Record<string, string> = {
  K: '#2a2a3a', // outline
  F: '#f0dcc0', // fur light (cream)
  S: '#c4a878', // fur shadow
  W: '#faf9ff', // white
  D: '#1e1e2e', // dark (pupils)
  P: '#e07050', // pink (nose, cheeks)
  G: '#4a8a5e', // green (iris)
  T: '#3a3a4e', // tail accent
};

// Slime-specific palette additions
const SLIME_PAL: Record<string, string> = {
  ...PAL,
  F: '#b8d8a8', // light green
  S: '#7ab868', // mid green
  T: '#5a8850', // dark green
  // Slime cheek/highlight uses a pink tinted with the slime hue, kept on SLIME_PAL.P
  // so slimeFace can reference its own palette consistently.
  P: '#f5c6c6',
  G: '#3a3a3a', // dark green eyes
};

// Bunny-specific palette additions
const BUNNY_PAL: Record<string, string> = {
  ...PAL,
  F: '#f0e0e8', // light pink-white
  S: '#d8b8c8', // shadow pink
  P: '#f08090', // pink (ears, nose)
  W: '#ffffff', // pure white
};

// ─── Sprite Generator ─────────────────────────────────

function gen(pal: Record<string, string>, lines: string[]): Grid {
  return lines.map(row => {
    const cells: (string | null)[] = [];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') cells.push(null);
      else cells.push(pal[ch] || null);
    }
    return cells;
  });
}

// ─── PIXEL CAT (original design) ──────────────────────

function catSprite(): Grid {
  const g: Grid = Array.from({ length: PH }, () => Array(PW).fill(null));
  const px = (x: number, y: number, c: string) => {
    if (y >= 0 && y < PH && x >= 0 && x < PW) g[y][x] = c;
  };
  const hl = (x1: number, x2: number, y: number, c: string) => {
    for (let x = x1; x <= x2; x++) px(x, y, c);
  };

  // Ears
  px(7, 0, PAL.F); px(8, 0, PAL.F);
  px(6, 1, PAL.K); px(7, 1, PAL.F); px(8, 1, PAL.F); px(9, 1, PAL.K);
  px(5, 2, PAL.K); px(6, 2, PAL.F); px(7, 2, PAL.W); px(8, 2, PAL.P); px(9, 2, PAL.F); px(10, 2, PAL.K);
  px(4, 3, PAL.K); px(5, 3, PAL.F); px(6, 3, PAL.P); px(7, 3, PAL.P); px(8, 3, PAL.P); px(9, 3, PAL.F); px(10, 3, PAL.F); px(11, 3, PAL.K);
  px(3, 4, PAL.K); px(4, 4, PAL.F); px(5, 4, PAL.P); px(6, 4, PAL.P); px(7, 4, PAL.F); px(8, 4, PAL.F); px(9, 4, PAL.F); px(10, 4, PAL.F); px(11, 4, PAL.F); px(12, 4, PAL.K);

  px(16, 0, PAL.F); px(17, 0, PAL.F);
  px(15, 1, PAL.K); px(16, 1, PAL.F); px(17, 1, PAL.F); px(18, 1, PAL.K);
  px(14, 2, PAL.K); px(15, 2, PAL.F); px(16, 2, PAL.P); px(17, 2, PAL.W); px(18, 2, PAL.F); px(19, 2, PAL.K);
  px(13, 3, PAL.K); px(14, 3, PAL.F); px(15, 3, PAL.F); px(16, 3, PAL.F); px(17, 3, PAL.F); px(18, 3, PAL.P); px(19, 3, PAL.P); px(20, 3, PAL.K);
  px(12, 4, PAL.K); px(13, 4, PAL.F); px(14, 4, PAL.F); px(15, 4, PAL.F); px(16, 4, PAL.F); px(17, 4, PAL.F); px(18, 4, PAL.F); px(19, 4, PAL.P); px(20, 4, PAL.F); px(21, 4, PAL.K);

  // Head
  hl(6, 17, 5, PAL.F); px(5, 5, PAL.K); px(18, 5, PAL.K);
  hl(4, 19, 6, PAL.F); px(3, 6, PAL.K); px(20, 6, PAL.K);
  hl(3, 20, 7, PAL.F); px(2, 7, PAL.K); px(21, 7, PAL.K);
  hl(2, 21, 8, PAL.F); px(1, 8, PAL.K); px(22, 8, PAL.K); px(2, 8, PAL.S);
  hl(1, 22, 9, PAL.F); px(0, 9, PAL.K); px(23, 9, PAL.K); px(1, 9, PAL.S); px(22, 9, PAL.S);
  hl(1, 22, 10, PAL.F); px(0, 10, PAL.K); px(23, 10, PAL.K); px(1, 10, PAL.S);
  hl(1, 22, 11, PAL.F); px(0, 11, PAL.K); px(23, 11, PAL.K); px(1, 11, PAL.S);
  hl(1, 22, 12, PAL.F); px(0, 12, PAL.K); px(23, 12, PAL.K); px(1, 12, PAL.S);
  hl(1, 22, 13, PAL.F); px(0, 13, PAL.K); px(23, 13, PAL.K); px(1, 13, PAL.S);
  hl(1, 22, 14, PAL.F); px(0, 14, PAL.K); px(23, 14, PAL.K); px(1, 14, PAL.S);

  // Cheek blush
  px(3, 15, PAL.P); px(4, 15, PAL.P);
  px(20, 15, PAL.P); px(21, 15, PAL.P);
  px(3, 16, PAL.P); px(4, 16, PAL.P);
  px(20, 16, PAL.P); px(21, 16, PAL.P);

  hl(2, 21, 15, PAL.F); px(1, 15, PAL.K); px(22, 15, PAL.K);
  hl(2, 21, 16, PAL.F); px(1, 16, PAL.K); px(22, 16, PAL.K);
  hl(3, 20, 17, PAL.F); px(2, 17, PAL.K); px(21, 17, PAL.K);

  // Chin
  hl(4, 19, 18, PAL.S); px(3, 18, PAL.K); px(20, 18, PAL.K);
  hl(5, 18, 19, PAL.S); px(4, 19, PAL.K); px(19, 19, PAL.K);

  // Jaw
  hl(6, 17, 20, PAL.F); px(5, 20, PAL.K); px(18, 20, PAL.K);

  // Body
  hl(7, 16, 21, PAL.F); px(6, 21, PAL.K); px(17, 21, PAL.K);
  hl(6, 17, 22, PAL.F); px(5, 22, PAL.K); px(18, 22, PAL.K);

  // White chest
  hl(5, 18, 23, PAL.F); px(4, 23, PAL.K); px(19, 23, PAL.K);
  px(9, 23, PAL.W); px(10, 23, PAL.W); px(11, 23, PAL.W); px(12, 23, PAL.W); px(13, 23, PAL.W); px(14, 23, PAL.W);

  hl(4, 19, 24, PAL.F); px(3, 24, PAL.K); px(20, 24, PAL.K);
  px(8, 24, PAL.W); px(9, 24, PAL.W); px(10, 24, PAL.W); px(11, 24, PAL.W); px(12, 24, PAL.W); px(13, 24, PAL.W); px(14, 24, PAL.W); px(15, 24, PAL.W);

  hl(4, 19, 25, PAL.F); px(3, 25, PAL.K); px(20, 25, PAL.K); px(4, 25, PAL.S);
  px(9, 25, PAL.W); px(10, 25, PAL.W); px(11, 25, PAL.W); px(12, 25, PAL.W); px(13, 25, PAL.W); px(14, 25, PAL.W); px(15, 25, PAL.W);

  hl(4, 19, 26, PAL.F); px(3, 26, PAL.K); px(20, 26, PAL.K); px(4, 26, PAL.S);
  hl(5, 18, 27, PAL.F); px(4, 27, PAL.K); px(19, 27, PAL.K); px(5, 27, PAL.S);
  hl(5, 18, 28, PAL.F); px(4, 28, PAL.K); px(19, 28, PAL.K); px(5, 28, PAL.S);

  // Paws
  px(5, 29, PAL.K); px(6, 29, PAL.F); px(7, 29, PAL.F); px(8, 29, PAL.K);
  px(15, 29, PAL.K); px(16, 29, PAL.F); px(17, 29, PAL.F); px(18, 29, PAL.K);

  px(5, 30, PAL.K); px(6, 30, PAL.F); px(7, 30, PAL.F); px(8, 30, PAL.K);
  px(15, 30, PAL.K); px(16, 30, PAL.F); px(17, 30, PAL.F); px(18, 30, PAL.K);

  px(4, 31, PAL.K); px(5, 31, PAL.K); px(6, 31, PAL.K); px(7, 31, PAL.K); px(8, 31, PAL.K); px(9, 31, PAL.K);
  px(14, 31, PAL.K); px(15, 31, PAL.K); px(16, 31, PAL.K); px(17, 31, PAL.K); px(18, 31, PAL.K); px(19, 31, PAL.K);

  // Tail
  px(3, 26, PAL.K); px(2, 26, PAL.T);
  px(2, 27, PAL.K); px(1, 27, PAL.T); px(3, 27, PAL.T);
  px(1, 28, PAL.K); px(0, 28, PAL.T);
  px(0, 29, PAL.K);

  return g;
}

function catEyes(state: string, blinking: boolean): [number, number, string][] {
  const c: [number, number, string][] = [];
  const px = (x: number, y: number, color: string) => c.push([x, y, color]);

  if (blinking || state === 'sleeping' || state === 'dozing') {
    px(6, 11, PAL.K); px(7, 11, PAL.K); px(8, 11, PAL.K);
    px(5, 12, PAL.K); px(9, 12, PAL.K);
    px(15, 11, PAL.K); px(16, 11, PAL.K); px(17, 11, PAL.K);
    px(14, 12, PAL.K); px(18, 12, PAL.K);
    return c;
  }
  if (state === 'happy' || state === 'celebrating') {
    px(6, 10, PAL.K); px(8, 10, PAL.K);
    px(5, 11, PAL.K); px(7, 11, PAL.K); px(9, 11, PAL.K);
    px(15, 10, PAL.K); px(17, 10, PAL.K);
    px(14, 11, PAL.K); px(16, 11, PAL.K); px(18, 11, PAL.K);
    return c;
  }

  // Default open eyes
  const iris = state === 'error' || state === 'angry' ? '#d05050' :
    state === 'thinking' || state === 'working' ? '#5080c0' :
    state === 'love' ? '#d06080' : PAL.G;

  // Left eye
  px(6, 10, PAL.K); px(7, 10, PAL.K); px(8, 10, PAL.K);
  px(5, 11, PAL.K); px(6, 11, PAL.W); px(7, 11, iris); px(8, 11, PAL.D); px(9, 11, PAL.K);
  px(5, 12, PAL.K); px(6, 12, iris); px(7, 12, PAL.D); px(8, 12, iris); px(9, 12, PAL.K);
  px(6, 13, PAL.K); px(7, 13, PAL.K); px(8, 13, PAL.K);

  // Right eye
  px(15, 10, PAL.K); px(16, 10, PAL.K); px(17, 10, PAL.K);
  px(14, 11, PAL.K); px(15, 11, PAL.D); px(16, 11, iris); px(17, 11, PAL.W); px(18, 11, PAL.K);
  px(14, 12, PAL.K); px(15, 12, iris); px(16, 12, PAL.D); px(17, 12, iris); px(18, 12, PAL.K);
  px(15, 13, PAL.K); px(16, 13, PAL.K); px(17, 13, PAL.K);

  return c;
}

function catFace(state: string, action: string | null): [number, number, string][] {
  const c: [number, number, string][] = [];
  const px = (x: number, y: number, color: string) => c.push([x, y, color]);

  // Whiskers
  px(4, 14, PAL.S); px(3, 14, PAL.S);
  px(4, 15, PAL.S); px(3, 15, PAL.S); px(2, 15, PAL.S);
  px(19, 14, PAL.S); px(20, 14, PAL.S);
  px(19, 15, PAL.S); px(20, 15, PAL.S); px(21, 15, PAL.S);

  // Nose
  px(11, 14, PAL.D); px(12, 14, PAL.D);
  px(10, 15, PAL.P); px(11, 15, PAL.D); px(12, 15, PAL.D); px(13, 15, PAL.P);

  // Mouth
  if (state === 'happy' || state === 'celebrating') {
    px(9, 16, PAL.D); px(10, 16, PAL.D); px(13, 16, PAL.D); px(14, 16, PAL.D);
    px(10, 17, PAL.D); px(11, 17, PAL.D); px(12, 17, PAL.D); px(13, 17, PAL.D);
  } else if (state === 'error' || state === 'angry') {
    px(10, 17, PAL.D); px(11, 17, PAL.D); px(12, 17, PAL.D); px(13, 17, PAL.D);
    px(9, 16, PAL.D); px(14, 16, PAL.D);
  } else if (action === 'yawn') {
    px(10, 16, PAL.D); px(11, 16, PAL.P); px(12, 16, PAL.P); px(13, 16, PAL.D);
    px(10, 17, PAL.D); px(11, 17, PAL.P); px(12, 17, PAL.P); px(13, 17, PAL.D);
  } else {
    px(10, 16, PAL.D); px(11, 16, PAL.D); px(12, 16, PAL.D); px(13, 16, PAL.D);
    px(11, 17, PAL.D); px(12, 17, PAL.D);
  }

  return c;
}

// ─── PIXEL SLIME (qq-slime inspired) ──────────────────

function slimeSprite(): Grid {
  return gen(SLIME_PAL, [
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '..........KKKK..........',
    '........KKSSSSKK........',
    '.......KSSSSSSSSK.......',
    '......KSSSSSSSSSSK......',
    '.....KSSSSSSSSSSSSK.....',
    '....KSSSSSSSSSSSSSSK....',
    '...KSSSSSSSSSSSSSSSSK...',
    '...KSSSSSSSSSSSSSSSSK...',
    '..KSSSSSSSSSSSSSSSSSSK..',
    '..KSSSSSSSSSSSSSSSSSSK..',
    '..KSSSSSSSSSSSSSSSSSSK..',
    '..KSSSSSSSSSSSSSSSSSSK..',
    '..KSSSSSSSSSSSSSSSSSSK..',
    '...KSSSSSSSSSSSSSSSSK...',
    '...KSSSSSSSSSSSSSSSSK...',
    '....KSSSSSSSSSSSSSSK....',
    '....KSSSSSSSSSSSSSSK....',
    '.....KSSSSSSSSSSSSK.....',
    '.....KSSSSSSSSSSSSK.....',
    '......KKSSSSSSSSKK......',
    '......KKSSSSSSSSKK......',
    '.......KKSSSSSSKK.......',
    '.......KKSSSSSSKK.......',
    '........KKKKKKKK........',
    '........KKKKKKKK........',
    '........................',
    '........................',
  ]);
}

function slimeEyes(state: string, blinking: boolean): [number, number, string][] {
  const c: [number, number, string][] = [];
  const px = (x: number, y: number, color: string) => c.push([x, y, color]);

  if (blinking || state === 'sleeping' || state === 'dozing') {
    px(9, 12, SLIME_PAL.K); px(10, 12, SLIME_PAL.K);
    px(13, 12, SLIME_PAL.K); px(14, 12, SLIME_PAL.K);
    return c;
  }
  if (state === 'happy' || state === 'celebrating') {
    px(9, 11, SLIME_PAL.K); px(10, 11, SLIME_PAL.K);
    px(13, 11, SLIME_PAL.K); px(14, 11, SLIME_PAL.K);
    return c;
  }

  // Big round eyes
  px(9, 11, SLIME_PAL.K); px(10, 11, SLIME_PAL.K);
  px(9, 12, SLIME_PAL.W); px(10, 12, SLIME_PAL.D);
  px(9, 13, SLIME_PAL.K); px(10, 13, SLIME_PAL.K);

  px(13, 11, SLIME_PAL.K); px(14, 11, SLIME_PAL.K);
  px(13, 12, SLIME_PAL.D); px(14, 12, SLIME_PAL.W);
  px(13, 13, SLIME_PAL.K); px(14, 13, SLIME_PAL.K);

  return c;
}

function slimeFace(state: string, action: string | null): [number, number, string][] {
  const c: [number, number, string][] = [];
  const px = (x: number, y: number, color: string) => c.push([x, y, color]);

  // Cheeks — use slime's own palette pink so the look stays consistent
  px(7, 15, SLIME_PAL.P); px(8, 15, SLIME_PAL.P);
  px(15, 15, SLIME_PAL.P); px(16, 15, SLIME_PAL.P);

  // Mouth
  if (state === 'happy' || state === 'celebrating') {
    px(10, 16, SLIME_PAL.K); px(11, 16, SLIME_PAL.K); px(12, 16, SLIME_PAL.K); px(13, 16, SLIME_PAL.K);
  } else if (action === 'yawn') {
    px(11, 15, SLIME_PAL.K); px(12, 15, SLIME_PAL.K);
    px(10, 16, SLIME_PAL.K); px(11, 16, SLIME_PAL.P); px(12, 16, SLIME_PAL.P); px(13, 16, SLIME_PAL.K);
  } else {
    px(11, 16, SLIME_PAL.K); px(12, 16, SLIME_PAL.K);
  }

  return c;
}

// ─── PIXEL BUNNY ──────────────────────────────────────

function bunnySprite(): Grid {
  return gen(BUNNY_PAL, [
    '........................',
    '.....K....KK....K......',
    '.....K....KK....K......',
    '.....KK..KKKK..KK......',
    '.....PKK.KKKK.KKP......',
    '.....PKK.KKKK.KKP......',
    '.....PKK.KKKK.KKP......',
    '.....PKK.KKKK.KKP......',
    '......KK.KKKK.KK.......',
    '.......KKKKKKKK........',
    '......KFFFFFFFFK.......',
    '.....KFFFFFFFFFFK......',
    '....KFFFFFFFFFFFFK.....',
    '....KFFFFFFFFFFFFK.....',
    '...KFFFFFFFFFFFFFFK....',
    '...KFFFFFFFFFFFFFFK....',
    '...KFFFFFFFFFFFFFFK....',
    '...KFFFFFFFFFFFFFFK....',
    '...KFFFFFFFFFFFFFFK....',
    '....KFFFFFFFFFFFK......',
    '....KFFFFFFFFFFFK......',
    '.....KFFFFFFFFFK.......',
    '.....KFFFFFFFFFK.......',
    '......KFFFFFFK.........',
    '......KFFFFFFK.........',
    '......KFFFFFFK.........',
    '......KFFFFFFK.........',
    '......KFF..FFK.........',
    '......KFF..FFK.........',
    '.....KKK....KKK........',
    '........................',
    '........................',
  ]);
}

function bunnyEyes(state: string, blinking: boolean): [number, number, string][] {
  const c: [number, number, string][] = [];
  const px = (x: number, y: number, color: string) => c.push([x, y, color]);

  if (blinking || state === 'sleeping' || state === 'dozing') {
    px(8, 13, BUNNY_PAL.K); px(9, 13, BUNNY_PAL.K);
    px(14, 13, BUNNY_PAL.K); px(15, 13, BUNNY_PAL.K);
    return c;
  }
  if (state === 'happy' || state === 'celebrating') {
    px(8, 12, BUNNY_PAL.K); px(9, 12, BUNNY_PAL.K);
    px(14, 12, BUNNY_PAL.K); px(15, 12, BUNNY_PAL.K);
    return c;
  }

  // Big round bunny eyes
  px(8, 12, BUNNY_PAL.K); px(9, 12, BUNNY_PAL.K);
  px(8, 13, BUNNY_PAL.W); px(9, 13, BUNNY_PAL.D);
  px(8, 14, BUNNY_PAL.K); px(9, 14, BUNNY_PAL.K);

  px(14, 12, BUNNY_PAL.K); px(15, 12, BUNNY_PAL.K);
  px(14, 13, BUNNY_PAL.D); px(15, 13, BUNNY_PAL.W);
  px(14, 14, BUNNY_PAL.K); px(15, 14, BUNNY_PAL.K);

  return c;
}

function bunnyFace(state: string, action: string | null): [number, number, string][] {
  const c: [number, number, string][] = [];
  const px = (x: number, y: number, color: string) => c.push([x, y, color]);

  // Cheeks
  px(6, 16, PAL.P); px(7, 16, PAL.P);
  px(16, 16, PAL.P); px(17, 16, PAL.P);

  // Nose
  px(11, 15, PAL.P); px(12, 15, PAL.P);

  // Mouth
  if (state === 'happy' || state === 'celebrating') {
    px(10, 17, BUNNY_PAL.K); px(11, 17, BUNNY_PAL.K); px(12, 17, BUNNY_PAL.K); px(13, 17, BUNNY_PAL.K);
  } else if (action === 'yawn') {
    px(11, 16, BUNNY_PAL.K); px(12, 16, BUNNY_PAL.K);
    px(10, 17, BUNNY_PAL.K); px(11, 17, PAL.P); px(12, 17, PAL.P); px(13, 17, BUNNY_PAL.K);
  } else {
    px(11, 17, BUNNY_PAL.K); px(12, 17, BUNNY_PAL.K);
  }

  return c;
}

// ─── Exports ──────────────────────────────────────────

export interface PetCharacter {
  id: string;
  name: string;
  emoji: string;
  sprite: () => Grid;
  eyes: (state: string, blinking: boolean) => [number, number, string][];
  face: (state: string, action: string | null) => [number, number, string][];
}

export const PET_CHARACTERS: PetCharacter[] = [
  { id: 'cat', name: 'Pixel Cat', emoji: '🐱', sprite: catSprite, eyes: catEyes, face: catFace },
  { id: 'slime', name: 'Pixel Slime', emoji: '🫠', sprite: slimeSprite, eyes: slimeEyes, face: slimeFace },
  { id: 'bunny', name: 'Pixel Bunny', emoji: '🐰', sprite: bunnySprite, eyes: bunnyEyes, face: bunnyFace },
];

export { PW, PH, PAL, SLIME_PAL, BUNNY_PAL };

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  grid: Grid,
  eyes: [number, number, string][],
  face: [number, number, string][],
  breathPhase: number,
  bounceOffset: number,
  sx: number,
  sy: number,
  eyeX: number = 0,
  eyeY: number = 0,
) {
  ctx.clearRect(0, 0, PW, PH);
  ctx.save();
  ctx.translate(PW / 2, PH / 2);
  ctx.scale(sx, sy);
  ctx.translate(-PW / 2, -PH / 2);

  // Pre-compute breathing deformation per row once — body/eyes/face all share these
  const rowOffsets: Array<{ ox: number; oy: number }> = new Array(PH);
  const basePhase = breathPhase * 0.8 * Math.PI * 2;
  for (let y = 0; y < PH; y++) {
    const depthFactor = (PH - y) / PH;
    const phase = basePhase + y * 0.12;
    rowOffsets[y] = {
      ox: Math.sin(phase * 0.5) * 0.15 * depthFactor,
      oy: Math.cos(phase) * 0.4 * depthFactor,
    };
  }

  // Body
  for (let y = 0; y < PH; y++) {
    const { ox, oy } = rowOffsets[y];
    const row = grid[y];
    for (let x = 0; x < PW; x++) {
      const c = row[x];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(Math.round(x + ox), Math.round(y + oy + bounceOffset), 1, 1);
      }
    }
  }

  // Eyes with tracking offset (max 1px shift)
  const eyeShiftX = Math.round(eyeX);
  const eyeShiftY = Math.round(eyeY * 0.5);
  for (const [x, y, color] of eyes) {
    const off = rowOffsets[y] ?? { ox: 0, oy: 0 };
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(x + off.ox + eyeShiftX),
      Math.round(y + off.oy + bounceOffset + eyeShiftY),
      1, 1,
    );
  }

  // Face overlay (nose, mouth, whiskers — no tracking)
  for (const [x, y, color] of face) {
    const off = rowOffsets[y] ?? { ox: 0, oy: 0 };
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x + off.ox), Math.round(y + off.oy + bounceOffset), 1, 1);
  }

  ctx.restore();
}
