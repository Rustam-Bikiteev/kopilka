export type Metal = 'gold' | 'silver';

export interface CoinType {
  value: number;
  r: number;
  metal: Metal;
  dots?: boolean;
}

export const COIN_TYPES: CoinType[] = [
  { value: 1, r: 10, metal: 'silver' },
  { value: 5, r: 12, metal: 'silver' },
  { value: 10, r: 11.5, metal: 'gold' },
  { value: 50, r: 14, metal: 'gold' },
  { value: 100, r: 16.5, metal: 'gold', dots: true },
];

export const COIN_PAD = 3;

const PAL = {
  gold: { hi: '#fff4c7', mid: '#f3c552', lo: '#b27b1b', edge: '#6e4a0c', f1: '#d49a2c', f2: '#ffe38f', ink: '#c89024' },
  silver: { hi: '#ffffff', mid: '#dce2e9', lo: '#8e98a6', edge: '#4f5865', f1: '#a9b2be', f2: '#f6f8fb', ink: '#a3adba' },
};

function coinCanvas(r: number, res: number) {
  const half = r + COIN_PAD;
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

/** Rotating part: rim, reeding, recessed field, embossed denomination. */
export function drawCoinFace(t: CoinType, res: number) {
  const { c, ctx } = coinCanvas(t.r, res);
  const p = PAL[t.metal];
  const r = t.r;

  let g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, p.hi);
  g.addColorStop(0.45, p.mid);
  g.addColorStop(1, p.lo);
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
  g = ctx.createLinearGradient(-ri, -ri, ri, ri);
  g.addColorStop(0, p.f1);
  g.addColorStop(1, p.f2);
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

  const label = String(t.value);
  const fs = r * (label.length > 2 ? 0.6 : label.length > 1 ? 0.78 : 0.98);
  ctx.font = `800 ${fs}px Unbounded, Manrope, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const o = r * 0.045;
  const y = fs * 0.04;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(label, -o, y - o);
  ctx.fillStyle = 'rgba(40,24,0,0.45)';
  ctx.fillText(label, o, y + o);
  ctx.fillStyle = p.ink;
  ctx.fillText(label, 0, y);
  return c;
}

/** Fixed light: specular highlight that must not rotate with the coin. */
export function drawCoinShine(t: CoinType, res: number) {
  const { c, ctx } = coinCanvas(t.r, res);
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
  const { c, ctx } = coinCanvas(t.r, res);
  const r = t.r;
  const g = ctx.createRadialGradient(r * 0.1, r * 0.18, r * 0.7, r * 0.1, r * 0.18, r + COIN_PAD);
  g.addColorStop(0, 'rgba(15,8,0,0.55)');
  g.addColorStop(1, 'rgba(15,8,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r - COIN_PAD, -r - COIN_PAD, (r + COIN_PAD) * 2, (r + COIN_PAD) * 2);
  return c;
}
