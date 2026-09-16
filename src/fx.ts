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
