export type Metal = 'gold' | 'silver' | 'lucky';

export interface CoinType {
  value: number;
  r: number;
  metal: Metal;
  dots?: boolean;
  /** bimetal: different metal for the centre field */
  inner?: Metal;
  bar?: { w: number; h: number };
}

export const COIN_TYPES: CoinType[] = [
  { value: 1, r: 10, metal: 'silver' },
  { value: 5, r: 12, metal: 'silver' },
  { value: 10, r: 11.5, metal: 'gold' },
  { value: 50, r: 14, metal: 'gold' },
  { value: 100, r: 16.5, metal: 'gold', dots: true },
  { value: 500, r: 20, metal: 'gold', inner: 'silver', dots: true },
  { value: 1000, r: 12, metal: 'gold', bar: { w: 54, h: 24 } },
  { value: 0, r: 13, metal: 'lucky' },
  { value: 5000, r: 17, metal: 'gold', bar: { w: 74, h: 34 } },
];

export const LUCKY = 7;
/** Largest type that a deposit is split into; bigger ones only appear by merging. */
export const MAX_DEPOSIT_TYPE = 4;

/** `n` pieces of the key type fuse into one of type `to`, keeping the value. */
export const MERGES: Record<number, { n: number; to: number }> = {
  0: { n: 5, to: 1 },
  1: { n: 2, to: 2 },
  2: { n: 5, to: 3 },
  3: { n: 2, to: 4 },
  4: { n: 5, to: 5 },
  5: { n: 2, to: 6 },
  6: { n: 5, to: 8 },
};

export const COIN_PAD = 3;

/** Half of the square texture/sprite side, without padding. */
export const extent = (t: CoinType) => (t.bar ? t.bar.w / 2 : t.r);
export const area = (t: CoinType) => (t.bar ? t.bar.w * t.bar.h : Math.PI * t.r * t.r);

const PAL = {
  gold: { hi: '#fff4c7', mid: '#f3c552', lo: '#b27b1b', edge: '#6e4a0c', f1: '#d49a2c', f2: '#ffe38f', ink: '#c89024' },
  silver: { hi: '#ffffff', mid: '#dce2e9', lo: '#8e98a6', edge: '#4f5865', f1: '#a9b2be', f2: '#f6f8fb', ink: '#a3adba' },
  lucky: { hi: '#fff7e0', mid: '#ffcf5c', lo: '#e0587a', edge: '#7a1f4a', f1: '#ff9ec4', f2: '#fff1a8', ink: '#ffffff' },
};

function coinCanvas(t: CoinType, res: number) {
  const half = extent(t) + COIN_PAD;
  const size = Math.max(8, Math.ceil(half * 2 * res));
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const q = size / (half * 2);
  ctx.setTransform(q, 0, 0, q, half * q, half * q);
  return { c, ctx };
}

function disc(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
}

function star(ctx: CanvasRenderingContext2D, r: number, inner: number, points = 5) {
  ctx.beginPath();
  for (let k = 0; k < points * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / points;
    const rr = k % 2 ? inner : r;
    if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Rotating part: rim, reeding, recessed field, embossed denomination. */
export function drawCoinFace(t: CoinType, res: number) {
  if (t.bar) return drawBar(t, res);
  const { c, ctx } = coinCanvas(t, res);
  const p = PAL[t.metal];
  const r = t.r;

  let g: CanvasGradient = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, p.hi);
  g.addColorStop(0.45, p.mid);
  g.addColorStop(1, p.lo);
  if (t.metal === 'lucky' && ctx.createConicGradient) {
    g = ctx.createConicGradient(0, 0, 0);
    ['#ffe27a', '#ff9ec4', '#b89bff', '#7fe0ff', '#9dffb0', '#ffe27a'].forEach((col, k, a) => g.addColorStop(k / (a.length - 1), col));
  }
  disc(ctx, r);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = p.edge;
  ctx.globalAlpha = 0.75;
  disc(ctx, r - ctx.lineWidth / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const ticks = r > 11 ? 44 : 32;
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = r * 0.035;
  ctx.beginPath();
  for (let k = 0; k < ticks; k++) {
    const a = (k / ticks) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
    ctx.lineTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
  }
  ctx.stroke();

  const ri = r * 0.76;
  const pi = PAL[t.inner ?? t.metal];
  g = ctx.createLinearGradient(-ri, -ri, ri, ri);
  g.addColorStop(0, pi.f1);
  g.addColorStop(1, pi.f2);
  disc(ctx, ri);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(0, 0, ri, Math.PI * 0.75, Math.PI * 1.75);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(0, 0, ri, Math.PI * 1.75, Math.PI * 2.75);
  ctx.stroke();

  if (t.dots) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * ri * 0.84, Math.sin(a) * ri * 0.84, r * 0.028, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(110,74,12,0.45)';
      ctx.fill();
    }
  }

  const o = r * 0.045;
  if (t.metal === 'lucky') {
    for (const [dx, dy, col] of [[-o, -o, 'rgba(255,255,255,0.8)'], [o, o, 'rgba(122,31,74,0.5)'], [0, 0, '#fff4c2']] as const) {
      ctx.save();
      ctx.translate(dx, dy);
      star(ctx, ri * 0.72, ri * 0.3);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }
    return c;
  }

  const label = String(t.value);
  const fs = r * (label.length > 2 ? 0.6 : label.length > 1 ? 0.78 : 0.98);
  ctx.font = `800 ${fs}px Unbounded, Manrope, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = fs * 0.04;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(label, -o, y - o);
  ctx.fillStyle = 'rgba(40,24,0,0.45)';
  ctx.fillText(label, o, y + o);
  ctx.fillStyle = pi.ink;
  ctx.fillText(label, 0, y);
  return c;
}

/** Gold ingot seen from the side; its lighting is baked in because the shine layer is skipped for bars. */
function drawBar(t: CoinType, res: number) {
  const { c, ctx } = coinCanvas(t, res);
  const { w, h } = t.bar!;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const inset = h * 0.35;

  ctx.shadowColor = 'rgba(20,10,0,0.5)';
  ctx.shadowBlur = 3 * res;
  ctx.shadowOffsetY = 1.5 * res;
  ctx.beginPath();
  ctx.moveTo(x0 + inset, y0);
  ctx.lineTo(-x0 - inset, y0);
  ctx.lineTo(-x0, -y0);
  ctx.lineTo(x0, -y0);
  ctx.closePath();
  let g = ctx.createLinearGradient(0, y0, 0, -y0);
  g.addColorStop(0, '#fff3c0');
  g.addColorStop(0.35, '#f3c552');
  g.addColorStop(1, '#9c6a14');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(110,74,12,0.8)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const ty = y0 + h * 0.18;
  ctx.beginPath();
  ctx.moveTo(x0 + inset + 2, y0 + 1.5);
  ctx.lineTo(-x0 - inset - 2, y0 + 1.5);
  ctx.lineTo(-x0 - inset * 0.6, ty + 2);
  ctx.lineTo(x0 + inset * 0.6, ty + 2);
  ctx.closePath();
  g = ctx.createLinearGradient(0, y0, 0, ty);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,240,190,0.3)');
  ctx.fillStyle = g;
  ctx.fill();

  ctx.font = `800 ${h * (t.value >= 5000 ? 0.36 : 0.42)}px Unbounded, Manrope, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cy = h * 0.14;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(String(t.value), -0.6, cy - 0.6);
  ctx.fillStyle = 'rgba(80,50,0,0.55)';
  ctx.fillText(String(t.value), 0.6, cy + 0.6);
  ctx.fillStyle = '#c28a22';
  ctx.fillText(String(t.value), 0, cy);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x0 + inset * 0.3, y0 + h * 0.3, 1.2, h * 0.5);
  return c;
}

/** Fixed light: specular highlight that must not rotate with the coin. */
export function drawCoinShine(t: CoinType, res: number) {
  const { c, ctx } = coinCanvas(t, res);
  if (t.bar) return c;
  const r = t.r;
  disc(ctx, r);
  ctx.save();
  ctx.clip();
  let g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, 0, -r * 0.4, -r * 0.45, r * 0.85);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  g = ctx.createRadialGradient(r * 0.2, r * 0.3, r * 0.4, 0, 0, r * 1.1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(40,20,0,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  ctx.lineWidth = r * 0.08;
  ctx.strokeStyle = 'rgba(255,236,190,0.45)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, Math.PI * 0.05, Math.PI * 0.6);
  ctx.stroke();
  return c;
}

export function drawCoinShadow(t: CoinType, res: number) {
  const { c, ctx } = coinCanvas(t, res);
  if (t.bar) return c;
  const r = t.r;
  const g = ctx.createRadialGradient(r * 0.1, r * 0.18, r * 0.7, r * 0.1, r * 0.18, r + COIN_PAD);
  g.addColorStop(0, 'rgba(15,8,0,0.55)');
  g.addColorStop(1, 'rgba(15,8,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r - COIN_PAD, -r - COIN_PAD, (r + COIN_PAD) * 2, (r + COIN_PAD) * 2);
  return c;
}

/** Four-point glint used by particle bursts. */
export function drawSparkle() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.translate(32, 32);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,215,120,0.6)');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = g;
  star(ctx, 30, 5, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  disc(ctx, 4);
  ctx.fill();
  return c;
}
