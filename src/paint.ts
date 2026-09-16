import { JAR, NR, outline, tracePath } from './jar';
import { theme } from './theme';

/** Padding around the jar inside its textures, room for the shadow and the tag. */
export const JAR_PAD = 36;
export const JAR_TEX_W = JAR.W + JAR_PAD * 2;
export const JAR_TEX_H = JAR.H + JAR_PAD * 2 + 16;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number, res: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * res));
  c.height = Math.max(1, Math.round(h * res));
  const ctx = c.getContext('2d')!;
  ctx.scale(c.width / w, c.height / h);
  return { c, ctx };
}

function jarCanvas(res: number) {
  const r = canvas(JAR_TEX_W, JAR_TEX_H, res);
  r.ctx.translate(JAR_PAD, JAR_PAD);
  return r;
}

const rgba = (rgb: string, a: number) => `rgba(${rgb},${a})`;

export function drawBackground(w: number, h: number, res: number, tableY: number, cx: number, jarW: number) {
  const T = theme().bg;
  const { c, ctx } = canvas(w, h, res);
  let g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, T.sky[0]);
  g.addColorStop(0.55, T.sky[1]);
  g.addColorStop(1, T.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const glowAt = (x: number, y: number, rad: number, color: string, a: number) => {
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, rgba(color, a));
    gg.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  glowAt(w * 0.2, -h * 0.05, h * 0.75, T.light, 0.2);
  glowAt(cx, tableY - jarW * 0.8, jarW * 1.3, T.pool, 0.08);

  const rand = rng(7);
  if (T.bokeh === 'stars') {
    for (let k = 0; k < 70; k++) {
      const x = rand() * w;
      const y = rand() * tableY * 0.85;
      const s = rand() < 0.2 ? 3 : 2;
      ctx.fillStyle = rgba(rand() < 0.3 ? '255,230,140' : '255,255,255', 0.35 + rand() * 0.6);
      ctx.fillRect(Math.round(x), Math.round(y), s * 2, s * 2);
    }
  } else {
    for (let k = 0; k < 16; k++) {
      const x = rand() * w;
      const y = rand() * tableY * 0.9;
      const rad = (10 + rand() * 34) * Math.min(1.4, w / 400);
      const col = T.bokeh[k % T.bokeh.length];
      const a = 0.04 + rand() * 0.1;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gg.addColorStop(0, rgba(col, a));
      gg.addColorStop(0.7, rgba(col, a * 0.8));
      gg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const horizon = tableY - jarW * 0.13;
  g = ctx.createLinearGradient(0, horizon, 0, h);
  g.addColorStop(0, T.table[0]);
  g.addColorStop(0.3, T.table[1]);
  g.addColorStop(1, T.table[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, w, h - horizon);
  drawFloor(ctx, rand, w, h, horizon, cx);
  ctx.fillStyle = T.horizon;
  ctx.fillRect(0, horizon, w, T.floor === 'grid' ? 2 : 1);

  ctx.save();
  ctx.translate(cx, tableY);
  ctx.scale(1, 0.22);
  glowAt(0, 0, jarW * 0.95, T.pool, 0.2);
  ctx.restore();

  g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.8);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${T.vignette})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function drawFloor(ctx: CanvasRenderingContext2D, rand: () => number, w: number, h: number, horizon: number, cx: number) {
  const T = theme().bg;
  ctx.strokeStyle = T.line;
  ctx.fillStyle = T.line;
  ctx.lineWidth = 1;
  switch (T.floor) {
    case 'wood':
      for (let k = 0; k < 26; k++) {
        const y0 = horizon + 4 + Math.pow(rand(), 1.4) * (h - horizon);
        const amp = 1 + rand() * 3;
        const ph = rand() * 6;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y = y0 + Math.sin(x * 0.012 + ph) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    case 'grid': {
      // perspective grid converging to a point above the horizon
      const vy = horizon - (h - horizon) * 0.6;
      ctx.lineWidth = 1.2;
      for (let k = -14; k <= 14; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + k * 18 * ((horizon - vy) / (h - vy)), horizon);
        ctx.lineTo(cx + k * 18, h);
        ctx.stroke();
      }
      for (let k = 1; k < 12; k++) {
        const t = Math.pow(k / 12, 1.8);
        ctx.globalAlpha = 0.4 + t * 0.6;
        ctx.fillRect(0, horizon + t * (h - horizon), w, 1.2);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'marble':
      ctx.lineWidth = 0.8;
      for (let k = 0; k < 9; k++) {
        let x = rand() * w;
        let y = horizon + rand() * (h - horizon);
        const dx = (rand() - 0.3) * 30;
        ctx.globalAlpha = 0.3 + rand() * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 14; s++) {
          x += dx + (rand() - 0.5) * 20;
          y += 4 + (rand() - 0.5) * 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    case 'bricks': {
      const bh = 16;
      for (let row = 0, y = horizon + 2; y < h; row++, y += bh) {
        ctx.fillRect(0, y, w, 3);
        for (let x = row % 2 ? -18 : 0; x < w; x += 36) ctx.fillRect(x, y, 3, bh);
      }
      break;
    }
    case 'plain': {
      // soft top light on a matte surface
      const g = ctx.createLinearGradient(0, horizon, 0, horizon + 40);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon, w, 40);
      break;
    }
  }
}

/** Everything behind the coins: table shadow and the far wall of the jar. */
export function drawJarBack(res: number) {
  const { glass } = theme();
  const { c, ctx } = jarCanvas(res);
  const { W, H } = JAR;

  ctx.save();
  ctx.translate(W / 2, H + 2);
  ctx.scale(1, 0.12);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.62);
  sg.addColorStop(0, 'rgba(0,0,0,0.7)');
  sg.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(-W, -W, W * 2, W * 2);
  ctx.restore();

  const body = outline(0);
  tracePath(ctx, body, true);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, rgba(glass.edge, 0.07));
  g.addColorStop(0.5, 'rgba(20,12,6,0.18)');
  g.addColorStop(1, rgba(glass.edge, 0.05));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rgba(glass.edge, 0.05);
  ctx.fillRect(W - 70, JAR.SH, 10, H - JAR.SH - 60);
  ctx.strokeStyle = rgba(glass.edge, 0.1);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(JAR.CR * 0.6, H - 22);
  ctx.quadraticCurveTo(W / 2, H - 40, W - JAR.CR * 0.6, H - 22);
  ctx.stroke();
  ctx.restore();
  return c;
}

/** Everything in front of the coins: glass edges, highlights, lid, twine and the tag. */
export function drawJarFront(res: number, tagText: string) {
  const { glass } = theme();
  const hi = (a: number) => rgba(glass.edge, a);
  const { c, ctx } = jarCanvas(res);
  const { W, H, LID, NECK_B, NL, SH, CR, GLASS } = JAR;
  const body = outline(0);

  tracePath(ctx, body, true);
  ctx.fillStyle = glass.tint;
  ctx.fill();

  ctx.save();
  tracePath(ctx, body, true);
  ctx.clip();
  let g = ctx.createLinearGradient(0, 0, 30, 0);
  g.addColorStop(0, hi(0.16));
  g.addColorStop(1, hi(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 30, H);
  g = ctx.createLinearGradient(W, 0, W - 24, 0);
  g.addColorStop(0, hi(0.1));
  g.addColorStop(1, hi(0));
  ctx.fillStyle = g;
  ctx.fillRect(W - 24, 0, 24, H);

  const strip = (x: number, w: number, y0: number, y1: number, a: number) => {
    const sg = ctx.createLinearGradient(0, y0, 0, y1);
    sg.addColorStop(0, hi(0));
    sg.addColorStop(0.18, hi(a));
    sg.addColorStop(0.7, hi(a * 0.6));
    sg.addColorStop(1, hi(0));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.roundRect(x, y0, w, y1 - y0, w / 2);
    ctx.fill();
  };
  strip(20, 13, SH - 10, H - 64, 0.5);
  strip(40, 4, SH + 20, H - 120, 0.25);
  strip(W - 30, 6, SH + 30, H - 110, 0.22);
  strip(NL + 12, 6, LID + 6, NECK_B + 6, 0.35);

  g = ctx.createLinearGradient(0, H - 24, 0, H);
  g.addColorStop(0, hi(0));
  g.addColorStop(1, hi(0.16));
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 24, W, 24);
  ctx.restore();

  ctx.lineJoin = 'round';
  tracePath(ctx, body, false);
  if (glass.blur) {
    ctx.shadowColor = hi(0.9);
    ctx.shadowBlur = glass.blur;
  }
  ctx.strokeStyle = hi(glass.blur ? 0.3 : 0.14);
  ctx.lineWidth = GLASS * 1.6;
  ctx.stroke();
  ctx.strokeStyle = hi(glass.blur ? 0.95 : 0.5);
  ctx.lineWidth = glass.blur ? 2.2 : 1.4;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  tracePath(ctx, outline(GLASS), false);
  ctx.strokeStyle = hi(0.2);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = hi(0.4);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(NL - 2, NECK_B + 14);
  ctx.bezierCurveTo(NL - 10, NECK_B + 32, 18, SH - 44, 10, SH - 4);
  ctx.stroke();

  ctx.strokeStyle = hi(0.3);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(CR * 0.7, H - 12);
  ctx.quadraticCurveTo(W / 2, H - 2, W - CR * 0.7, H - 12);
  ctx.stroke();

  ctx.strokeStyle = hi(0.2);
  ctx.lineWidth = 2;
  for (const y of [LID + 12, LID + 22]) {
    ctx.beginPath();
    ctx.moveTo(NL + 1, y);
    ctx.quadraticCurveTo(W / 2, y + 8, NR - 1, y);
    ctx.stroke();
  }

  drawLid(ctx);
  drawTwineAndTag(ctx, tagText);
  return c;
}

function drawLid(ctx: CanvasRenderingContext2D) {
  const T = theme();
  const { W, LID, NL } = JAR;
  const x = NL - 12;
  const w = W - 2 * x;
  const y = 0;
  const h = LID + 2;

  let g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, T.lid[0]);
  g.addColorStop(0.45, T.lid[1]);
  g.addColorStop(1, T.lid[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h - 8, [10, 10, 4, 4]);
  ctx.fill();

  if (T.bg.floor === 'wood') {
    const rand = rng(3);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h - 8, [10, 10, 4, 4]);
    ctx.clip();
    ctx.strokeStyle = 'rgba(60,28,8,0.35)';
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 9; k++) {
      const yy = y + 3 + k * 3.4 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      for (let xx = x; xx <= x + w; xx += 10) ctx.lineTo(xx, yy + Math.sin(xx * 0.05 + k) * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(x + 8, y + 1, w - 16, 1.2);

  g = ctx.createLinearGradient(0, h - 10, 0, h);
  g.addColorStop(0, T.band[0]);
  g.addColorStop(0.4, T.band[1]);
  g.addColorStop(1, T.band[2]);
  ctx.fillStyle = g;
  if (T.glass.blur) {
    ctx.shadowColor = T.band[1];
    ctx.shadowBlur = T.glass.blur;
  }
  ctx.beginPath();
  ctx.roundRect(x + 3, h - 10, w - 6, 10, 3);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let xx = x + 8; xx < x + w - 6; xx += 5) ctx.fillRect(xx, h - 8, 1, 6);

  const sw = 74;
  const sx = W / 2 - sw / 2;
  ctx.fillStyle = T.slot;
  ctx.beginPath();
  ctx.roundRect(sx, 12, sw, 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(sx + 4, 20, sw - 8, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(sx + 4, 12, sw - 8, 1.5);
}

function drawTwineAndTag(ctx: CanvasRenderingContext2D, text: string) {
  const T = theme();
  const { W, NECK_B, NL } = JAR;
  const y = NECK_B - 12;
  ctx.lineCap = 'round';
  for (const [dy, a] of [[0, 0.95], [4, 0.85]] as const) {
    ctx.strokeStyle = rgba(T.twine, a);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(NL - 2, y + dy);
    ctx.quadraticCurveTo(W / 2, y + dy + 7, W - NL + 2, y + dy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,25,15,0.4)';
    ctx.lineWidth = 0.6;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const knotX = W - NL + 1;
  const knotY = y + 3;
  const tx = W - 34;
  const ty = NECK_B + 42;
  ctx.strokeStyle = rgba(T.twine, 0.95);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(knotX, knotY);
  ctx.quadraticCurveTo(knotX + 16, knotY + 8, tx - 30, ty - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(knotX, knotY);
  ctx.quadraticCurveTo(knotX + 6, knotY + 16, knotX + 2, knotY + 22);
  ctx.stroke();
  ctx.fillStyle = rgba(T.twine, 1);
  ctx.beginPath();
  ctx.arc(knotX, knotY, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(0.2);
  const tw = 92;
  const th = 40;
  ctx.shadowColor = T.glass.blur ? rgba(T.twine, 0.8) : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = T.glass.blur || 8;
  ctx.shadowOffsetY = T.glass.blur ? 0 : 3;
  ctx.fillStyle = T.tag;
  ctx.beginPath();
  ctx.moveTo(-tw / 2 + 12, -th / 2);
  ctx.lineTo(tw / 2, -th / 2);
  ctx.lineTo(tw / 2, th / 2);
  ctx.lineTo(-tw / 2 + 12, th / 2);
  ctx.lineTo(-tw / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const g = ctx.createLinearGradient(0, -th / 2, 0, th / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = T.tagInk;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2.5, 2]);
  ctx.strokeRect(-tw / 2 + 16, -th / 2 + 4, tw - 20, th - 8);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.arc(-tw / 2 + 8, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = T.tagInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // the tag is UI text: keep it readable, the pixel font is too wide for it
  const family = T.id === 'lux' ? T.font : 'Manrope, system-ui, sans-serif';
  let fs = 14;
  ctx.font = `800 ${fs}px ${family}`;
  const maxW = tw - 28;
  while (ctx.measureText(text).width > maxW && fs > 8) {
    fs -= 0.5;
    ctx.font = `800 ${fs}px ${family}`;
  }
  let label = text;
  while (ctx.measureText(label).width > maxW && label.length > 1) label = label.slice(0, -2) + '…';
  ctx.fillText(label, 6, 1);
  ctx.restore();
}

/** White soft blob; tinted per use. */
export function drawGlow() {
  const { c, ctx } = canvas(128, 128, 1);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}
