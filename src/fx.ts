import { Container, Sprite, Texture } from 'pixi.js';
import { drawSparkle } from './coins';

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  spin: number;
  life: number;
  max: number;
  size: number;
}

interface Ghost {
  view: Container;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
}

const GHOST_TIME = 0.22;

/** Sparkle bursts and merge "ghosts" (coins flying into each other). Coordinates are jar pixels. */
export class Fx {
  readonly layer = new Container();
  private tex = Texture.from(drawSparkle());
  private parts: Particle[] = [];
  private ghosts: Ghost[] = [];

  burst(x: number, y: number, count: number, power = 1, tint = 0xffffff) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (40 + Math.random() * 140) * power;
      const s = new Sprite(this.tex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = tint;
      s.position.set(x, y);
      const size = (8 + Math.random() * 14) * Math.min(1.6, power);
      const max = 0.45 + Math.random() * 0.5;
      this.parts.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40 * power, spin: (Math.random() - 0.5) * 8, life: max, max, size });
      this.layer.addChild(s);
    }
  }

  /** Detaches `view` and flies it to (tx, ty) while shrinking, then destroys it. */
  ghost(view: Container, tx: number, ty: number) {
    this.layer.addChild(view);
    this.ghosts.push({ view, sx: view.x, sy: view.y, tx, ty, t: 0 });
  }

  update(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.destroy();
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += 160 * dt;
      p.vx *= Math.exp(-dt * 2.5);
      p.vy *= Math.exp(-dt * 2.5);
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      const k = p.life / p.max;
      p.s.alpha = Math.min(1, k * 2);
      p.s.width = p.s.height = p.size * (0.4 + 0.6 * k);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      const k = Math.min(1, g.t / GHOST_TIME);
      const e = k * k;
      g.view.position.set(g.sx + (g.tx - g.sx) * e, g.sy + (g.ty - g.sy) * e);
      g.view.scale.set(1 - 0.55 * k);
      g.view.alpha = 1 - 0.6 * k;
      if (k >= 1) {
        g.view.destroy({ children: true });
        this.ghosts.splice(i, 1);
      }
    }
  }
}

export const MERGE_DELAY = GHOST_TIME;

interface Piece {
  s: Sprite;
  vx: number;
  vy: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  sway: number;
  w: number;
}

const CONFETTI_COLORS = [0xffd66b, 0xf3a73b, 0xff9ec4, 0x7fe0ff, 0x9dffb0, 0xb89bff, 0xffffff];

/** Screen-space confetti for milestones. */
export class Confetti {
  readonly layer = new Container();
  private tex: Texture;
  private pieces: Piece[] = [];

  constructor() {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 12;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 8, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 8, 8, 4);
    this.tex = Texture.from(c);
  }

  /** Fountain from (x, y); `spread` scales speed. */
  burst(x: number, y: number, count: number, spread = 1) {
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const v = (380 + Math.random() * 520) * spread;
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v);
    }
  }

  /** Pieces falling from above the top edge over the whole width. */
  rain(width: number, count: number) {
    for (let k = 0; k < count; k++) this.spawn(Math.random() * width, -20 - Math.random() * 400, (Math.random() - 0.5) * 60, 60 + Math.random() * 120);
  }

  private spawn(x: number, y: number, vx: number, vy: number) {
    const s = new Sprite(this.tex);
    s.anchor.set(0.5);
    s.tint = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];
    const w = 6 + Math.random() * 5;
    s.width = w;
    s.height = w * (1.2 + Math.random() * 0.8);
    s.position.set(x, y);
    s.rotation = Math.random() * Math.PI * 2;
    this.pieces.push({
      s,
      vx,
      vy,
      spin: (Math.random() - 0.5) * 10,
      flip: Math.random() * Math.PI * 2,
      flipSpeed: 6 + Math.random() * 8,
      sway: Math.random() * Math.PI * 2,
      w: s.height,
    });
    this.layer.addChild(s);
  }

  update(dt: number, height: number) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.vy += 520 * dt;
      const drag = Math.exp(-dt * 2.2);
      p.vx *= drag;
      p.vy = Math.min(p.vy * drag, 260);
      p.sway += dt * 3;
      p.s.x += (p.vx + Math.sin(p.sway) * 40) * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      p.flip += p.flipSpeed * dt;
      p.s.height = p.w * Math.cos(p.flip);
      if (p.s.y > height + 30) {
        p.s.destroy();
        this.pieces.splice(i, 1);
      }
    }
  }
}
