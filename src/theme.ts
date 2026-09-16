export type ThemeId = 'warm' | 'neon' | 'clay' | 'lux' | 'pixel';

export interface Pal {
  hi: string;
  mid: string;
  lo: string;
  edge: string;
  f1: string;
  f2: string;
  ink: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  /** browser chrome + CSS custom properties */
  meta: string;
  css: Record<string, string>;
  /** canvas font for numerals */
  font: string;
  bg: {
    sky: [string, string, string];
    /** "r,g,b" of the big soft light in the corner */
    light: string;
    /** "r,g,b" tones of the out-of-focus dots; 'stars' draws pixel stars instead */
    bokeh: string[] | 'stars';
    floor: 'wood' | 'grid' | 'plain' | 'marble' | 'bricks';
    table: [string, string, string];
    line: string;
    horizon: string;
    /** "r,g,b" of the light pool under the jar */
    pool: string;
    vignette: number;
  };
  glass: {
    /** fill over the jar body */
    tint: string;
    /** "r,g,b" of edges and highlights */
    edge: string;
    /** shadowBlur for glowing edges */
    blur: number;
  };
  lid: [string, string, string];
  band: [string, string, string];
  slot: string;
  twine: string;
  tag: string;
  tagInk: string;
  /** additive glow behind the pile and around rare coins */
  glow: number;
  sparkle: number;
  coin: { gold: Pal; silver: Pal };
  bar: [string, string, string];
  barInk: string;
  /** texture resolution for the pixel look (texels per virtual px); scaled with nearest filtering */
  pixel?: { bg: number; jar: number; coin: number };
}

const WARM: Theme = {
  id: 'warm',
  name: 'Банка',
  meta: '#120c08',
  css: {},
  font: 'Unbounded, Manrope, system-ui, sans-serif',
  bg: {
    sky: ['#25180f', '#150e09', '#0b0705'],
    light: '255,160,80',
    bokeh: ['255,190,110', '255,150,80', '255,225,170'],
    floor: 'wood',
    table: ['#4d301c', '#2c1a0e', '#100904'],
    line: 'rgba(0,0,0,0.18)',
    horizon: 'rgba(255,210,160,0.16)',
    pool: '255,185,100',
    vignette: 0.6,
  },
  glass: { tint: 'rgba(210,235,255,0.035)', edge: '255,255,255', blur: 0 },
  lid: ['#d8995a', '#9a5f2d', '#5a3316'],
  band: ['#fff0b8', '#d9a441', '#7a5212'],
  slot: '#170b04',
  twine: '214,184,136',
  tag: '#e7cf9f',
  tagInk: '#4a2e14',
  glow: 0xffb050,
  sparkle: 0xffffff,
  coin: {
    gold: { hi: '#fff4c7', mid: '#f3c552', lo: '#b27b1b', edge: '#6e4a0c', f1: '#d49a2c', f2: '#ffe38f', ink: '#c89024' },
    silver: { hi: '#ffffff', mid: '#dce2e9', lo: '#8e98a6', edge: '#4f5865', f1: '#a9b2be', f2: '#f6f8fb', ink: '#a3adba' },
  },
  bar: ['#fff3c0', '#f3c552', '#9c6a14'],
  barInk: '#c28a22',
};

const NEON: Theme = {
  id: 'neon',
  name: 'Неон',
  meta: '#0a0618',
  css: {
    '--bg': '#0a0618',
    '--text': '#f3ecff',
    '--muted': 'rgba(243, 236, 255, 0.6)',
    '--line': 'rgba(0, 240, 255, 0.22)',
    '--glass': 'rgba(120, 80, 255, 0.1)',
    '--acc': '255, 79, 208',
    '--gold-1': '#ffe0fb',
    '--gold-2': '#ff4fd0',
    '--gold-3': '#a0249a',
    '--gold-4': '#4a0a48',
    '--amount': 'linear-gradient(180deg, #e6fdff 10%, #6ff3ff 50%, #ff4fd0 100%)',
    '--sheet-1': '#1d0f3a',
    '--sheet-2': '#0f0722',
    '--toast': 'rgba(20, 10, 40, 0.88)',
    '--on-acc': '#2a0426',
    '--card': '60, 10, 90',
  },
  font: 'Unbounded, Manrope, system-ui, sans-serif',
  bg: {
    sky: ['#1a0b33', '#0d0620', '#05030d'],
    light: '255,60,200',
    bokeh: ['0,240,255', '255,60,200', '160,90,255'],
    floor: 'grid',
    table: ['#1a0838', '#0c0420', '#040108'],
    line: 'rgba(255,60,200,0.45)',
    horizon: 'rgba(0,240,255,0.8)',
    pool: '0,240,255',
    vignette: 0.55,
  },
  glass: { tint: 'rgba(120,220,255,0.05)', edge: '120,245,255', blur: 10 },
  lid: ['#3a1d6e', '#241049', '#120628'],
  band: ['#ffd0ff', '#ff3cc8', '#7a0a5e'],
  slot: '#05020c',
  twine: '0,240,255',
  tag: '#14082c',
  tagInk: '#6ff3ff',
  glow: 0xff3cc8,
  sparkle: 0xff9cf0,
  coin: {
    gold: { hi: '#fff0ff', mid: '#ff4fd0', lo: '#8a1a8a', edge: '#3a0540', f1: '#c02aa8', f2: '#ff9ef0', ink: '#ffe6fb' },
    silver: { hi: '#f0ffff', mid: '#6ff3ff', lo: '#1a7c9a', edge: '#063040', f1: '#2aa8c8', f2: '#bff8ff', ink: '#eaffff' },
  },
  bar: ['#ffe0ff', '#ff4fd0', '#6a0f6a'],
  barInk: '#ffd6f6',
};

const CLAY: Theme = {
  id: 'clay',
  name: 'Пластилин',
  meta: '#f6dccb',
  css: {
    '--bg': '#f6dccb',
    '--fg': '74, 42, 52',
    '--text': '#4a2a34',
    '--muted': 'rgba(74, 42, 52, 0.6)',
    '--line': 'rgba(74, 42, 52, 0.14)',
    '--glass': 'rgba(255, 255, 255, 0.5)',
    '--acc': '240, 140, 70',
    '--gold-1': '#ffd9a8',
    '--gold-2': '#f08c46',
    '--gold-3': '#c8642a',
    '--gold-4': '#7a3a14',
    '--amount': 'linear-gradient(180deg, #f5a25a 10%, #e0743a 60%, #b85424 100%)',
    '--amount-glow': 'rgba(255, 255, 255, 0.6)',
    '--sheet-1': '#fff6ee',
    '--sheet-2': '#f8e4d6',
    '--toast': 'rgba(255, 248, 242, 0.94)',
    '--on-acc': '#ffffff',
    '--card': '255, 200, 170',
    '--scheme': 'light',
  },
  font: 'Unbounded, Manrope, system-ui, sans-serif',
  bg: {
    sky: ['#fbe9dc', '#f6dccb', '#efcdb9'],
    light: '255,255,255',
    bokeh: ['255,255,255', '255,210,200', '210,225,255'],
    floor: 'plain',
    table: ['#e9b9a0', '#dca28a', '#c98c74'],
    line: 'rgba(0,0,0,0)',
    horizon: 'rgba(255,255,255,0.55)',
    pool: '255,255,255',
    vignette: 0.12,
  },
  glass: { tint: 'rgba(255,255,255,0.22)', edge: '255,255,255', blur: 0 },
  lid: ['#a6e0cf', '#79c2ae', '#4f9a86'],
  band: ['#fff6d8', '#ffc970', '#c98a2a'],
  slot: '#3a5a50',
  twine: '255,255,255',
  tag: '#ffffff',
  tagInk: '#8a5a48',
  glow: 0xffffff,
  sparkle: 0xffffff,
  coin: {
    gold: { hi: '#ffeab0', mid: '#ffc857', lo: '#e59b3a', edge: '#b86f1e', f1: '#f5b44a', f2: '#ffe08a', ink: '#c97a20' },
    silver: { hi: '#ffffff', mid: '#c9d8f0', lo: '#8fa6cf', edge: '#5f76a0', f1: '#a9bde0', f2: '#e6eefc', ink: '#7088b8' },
  },
  bar: ['#ffeab0', '#ffc857', '#d68a30'],
  barInk: '#b8701c',
};

const LUX: Theme = {
  id: 'lux',
  name: 'Люкс',
  meta: '#070707',
  css: {
    '--bg': '#070707',
    '--text': '#f4ead6',
    '--muted': 'rgba(244, 234, 214, 0.55)',
    '--line': 'rgba(230, 192, 104, 0.22)',
    '--glass': 'rgba(255, 255, 255, 0.04)',
    '--acc': '230, 192, 104',
    '--gold-1': '#fff4d0',
    '--gold-2': '#e6c068',
    '--gold-3': '#9c7424',
    '--gold-4': '#4a360c',
    '--sheet-1': '#1a1a1a',
    '--sheet-2': '#0c0c0c',
    '--toast': 'rgba(16, 16, 16, 0.9)',
    '--on-acc': '#1a1206',
    '--card': '60, 45, 15',
    '--font-num': "'Playfair Display', Georgia, serif",
  },
  font: "'Playfair Display', Georgia, serif",
  bg: {
    sky: ['#161616', '#0a0a0a', '#030303'],
    light: '255,215,140',
    bokeh: ['255,220,150', '255,240,200', '200,170,110'],
    floor: 'marble',
    table: ['#1e1e1e', '#101010', '#050505'],
    line: 'rgba(214,176,100,0.3)',
    horizon: 'rgba(230,200,140,0.45)',
    pool: '255,215,140',
    vignette: 0.7,
  },
  glass: { tint: 'rgba(255,250,240,0.03)', edge: '255,240,210', blur: 0 },
  lid: ['#fff1c4', '#d4a94e', '#6b4c14'],
  band: ['#6a6a6a', '#1a1a1a', '#000000'],
  slot: '#000000',
  twine: '214,176,100',
  tag: '#111111',
  tagInk: '#e8c878',
  glow: 0xffd88c,
  sparkle: 0xfff0c8,
  coin: {
    gold: { hi: '#fff8dc', mid: '#e6c068', lo: '#8c6420', edge: '#3c2808', f1: '#b8892e', f2: '#f7dc94', ink: '#a8781e' },
    silver: { hi: '#ffffff', mid: '#e8e8ec', lo: '#9a9aa4', edge: '#3a3a44', f1: '#b4b4be', f2: '#f4f4f8', ink: '#8a8a96' },
  },
  bar: ['#fff8dc', '#e6c068', '#7c5618'],
  barInk: '#9c7424',
};

const PIXEL: Theme = {
  id: 'pixel',
  name: 'Пиксели',
  meta: '#1b1f4a',
  css: {
    '--bg': '#1b1f4a',
    '--text': '#ffffff',
    '--muted': 'rgba(255, 255, 255, 0.62)',
    '--line': 'rgba(255, 255, 255, 0.3)',
    '--glass': 'rgba(0, 0, 0, 0.3)',
    '--acc': '255, 208, 32',
    '--gold-1': '#fff8a0',
    '--gold-2': '#ffd020',
    '--gold-3': '#c07800',
    '--gold-4': '#603800',
    '--amount': 'linear-gradient(180deg, #fff8a0 0 45%, #ffd020 45% 75%, #e09000 75%)',
    '--sheet-1': '#2b2a6b',
    '--sheet-2': '#1b1f4a',
    '--toast': 'rgba(20, 20, 60, 0.94)',
    '--on-acc': '#402000',
    '--card': '40, 40, 110',
    '--font-num': "'Press Start 2P', monospace",
    '--num-scale': '0.62',
  },
  font: "'Press Start 2P', monospace",
  bg: {
    sky: ['#141840', '#23256a', '#45307a'],
    light: '140,160,255',
    bokeh: 'stars',
    floor: 'bricks',
    table: ['#7a4a30', '#5a3422', '#3a2016'],
    line: 'rgba(30,14,8,0.8)',
    horizon: 'rgba(255,200,140,0.6)',
    pool: '255,230,120',
    vignette: 0.25,
  },
  glass: { tint: 'rgba(170,220,255,0.08)', edge: '210,235,255', blur: 0 },
  lid: ['#ff7a5a', '#d83a2a', '#801a10'],
  band: ['#ffe070', '#e0a020', '#805000'],
  slot: '#200808',
  twine: '240,220,180',
  tag: '#f0e0b0',
  tagInk: '#402010',
  glow: 0xffe070,
  sparkle: 0xffffff,
  coin: {
    gold: { hi: '#fff8a0', mid: '#ffd020', lo: '#c07800', edge: '#603800', f1: '#e0a000', f2: '#fff060', ink: '#a06000' },
    silver: { hi: '#ffffff', mid: '#d0d8e8', lo: '#7888a8', edge: '#303850', f1: '#98a8c0', f2: '#f0f4ff', ink: '#586888' },
  },
  bar: ['#fff8a0', '#ffd020', '#a06000'],
  barInk: '#a06000',
  pixel: { bg: 0.25, jar: 0.5, coin: 0.9 },
};

export const THEMES: Theme[] = [WARM, NEON, CLAY, LUX, PIXEL];

let current = WARM;

/** The active theme; painters read it at draw time. */
export const theme = () => current;

export function setTheme(id: string | undefined) {
  current = THEMES.find((t) => t.id === id) ?? WARM;
  const root = document.documentElement;
  root.dataset.theme = current.id;
  // properties of the previous theme must not leak into the next one
  for (const t of THEMES) for (const k of Object.keys(t.css)) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(current.css)) root.style.setProperty(k, v);
  root.style.colorScheme = current.css['--scheme'] ?? 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', current.meta);
  return current;
}

/** Canvas text silently falls back when a web font is not loaded yet. */
export async function loadThemeFonts(t: Theme) {
  if (!document.fonts?.load) return;
  const family = t.font.split(',')[0];
  await Promise.race([
    document.fonts.load(`800 20px ${family}`).catch(() => undefined),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
}
