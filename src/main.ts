import './style.css';
import RAPIER from '@dimforge/rapier2d-compat';
import type { RigidBody } from '@dimforge/rapier2d-compat';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { registerSW } from 'virtual:pwa-register';
import { JAR, NR, outline } from './jar';
import {
  COIN_PAD,
  COIN_TYPES,
  LUCKY,
  MAX_DEPOSIT_TYPE,
  MERGES,
  area,
  drawCoinFace,
  drawCoinShadow,
  drawCoinShine,
  extent,
} from './coins';
import { JAR_PAD, JAR_TEX_H, JAR_TEX_W, drawBackground, drawGlow, drawJarBack, drawJarFront } from './paint';
import { Sound } from './audio';
import { Motion } from './motion';
import { Confetti, Fx, MERGE_DELAY } from './fx';
import { MILESTONES, freshBank, load, milestoneFloor, save } from './store';
import { deletePhoto, drawReveal, getPhoto, loadBitmap, putPhoto } from './photo';
import { Sheet, type SheetValues } from './sheet';
import { loadThemeFonts, setTheme, theme } from './theme';

const S = 50; // virtual px per physics unit
const G = 75; // base gravity, units/s^2 (stylised: faster than real for a snappier fall)
const K = G / 9.81;
const DT = 1 / 120;
const MAX_COINS = 240;
// Share of the jar's inner area covered by coins: merge above MERGE_FILL, evict above MAX_FILL.
const MERGE_FILL = 0.4;
const MAX_FILL = 0.62;
const HIT_MIN = 1.2;
const COMBO_WINDOW = 1.4;
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
const LUCKY_CHANCE_ADD = 0.04;
const LUCKY_CHANCE_POUR = 0.004;
const MAX_LUCKY = 12;
const SLIDE_OUT = 0.18;
const SLIDE_IN = 0.42;
// Withdrawal: jar held upside down for FLIP_HOLD seconds opens the slot
const FLIP_G = -0.45;
const FLIP_HOLD = 0.5;
const FLIP_END = 0.35;
const EXIT_EVERY = 0.055;
const SLOT_HALF = 37;
const UNDO_MS = 6000;
const MILESTONE_TEXT: Record<number, string> = {
  25: 'Четверть пути!',
  50: 'Половина! Так держать',
  75: 'Осталось совсем немного',
};

interface Coin {
  body: RigidBody;
  type: number;
  view: Container;
  sprites: [Sprite, Sprite, Sprite];
  halo?: Sprite;
  /** sim time the appear animation starts; -1 when done */
  born: number;
  pop: boolean;
  lastSound: number;
  pvx: number;
  pvy: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = new Intl.NumberFormat('ru-RU');
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

registerSW({ immediate: true });
void boot();

async function boot() {
  const state = load();
  const bank = () => state.banks.find((b) => b.id === state.current) ?? state.banks[0];

  setTheme(state.theme);
  await RAPIER.init();
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  await loadThemeFonts(theme());

  const wrap = $('stage');
  const app = new Application();
  await app.init({
    resizeTo: wrap,
    antialias: true,
    backgroundAlpha: 0,
    resolution: Math.min(window.devicePixelRatio || 1, 2.5),
    autoDensity: true,
  });
  wrap.appendChild(app.canvas);

  const sound = new Sound();
  const motion = new Motion();

  // Scene
  const bg = new Sprite();
  const world = new Container();
  const glowTex = Texture.from(drawGlow());
  const glow = new Sprite(glowTex);
  const fx = new Fx();
  const confetti = new Confetti();
  const jarBack = new Sprite();
  const photo = new Sprite();
  const coinLayer = new Container();
  const jarFront = new Sprite();
  glow.blendMode = 'add';
  glow.anchor.set(0.5);
  glow.position.set(JAR.W / 2, JAR.H * 0.74);
  glow.width = JAR.W * 1.7;
  glow.height = JAR.H * 0.95;
  for (const s of [jarBack, photo, jarFront]) {
    s.position.set(-JAR_PAD, -JAR_PAD);
  }
  photo.visible = false;
  world.addChild(glow, jarBack, photo, coinLayer, jarFront, fx.layer);
  app.stage.addChild(bg, world, confetti.layer);
  const pivotY = JAR.H * 0.6;
  world.pivot.set(JAR.W / 2, pivotY);

  // Physics
  const physics = new RAPIER.World({ x: 0, y: G });
  physics.timestep = DT;
  const queue = new RAPIER.EventQueue(true);
  const jarBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const inner = outline(JAR.GLASS);
  inner.push(inner[0]);
  let jarArea = 0;
  for (let k = 1; k < inner.length; k++) jarArea += (inner[k - 1][0] * inner[k][1] - inner[k][0] * inner[k - 1][1]) / 2;
  jarArea = Math.abs(jarArea);
  physics.createCollider(
    RAPIER.ColliderDesc.polyline(new Float32Array(inner.flatMap(([x, y]) => [x / S, y / S])))
      .setRestitution(0.35)
      .setFriction(0.35),
    jarBody,
  );
  // Thick backstops behind the thin polyline so a pressed pile can't leak through.
  const slab = (x0: number, y0: number, x1: number, y1: number) =>
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid((x1 - x0) / 2 / S, (y1 - y0) / 2 / S)
        .setTranslation((x0 + x1) / 2 / S, (y0 + y1) / 2 / S)
        .setRestitution(0.35)
        .setFriction(0.35),
      jarBody,
    );
  const gl = JAR.GLASS;
  slab(-40, JAR.H - gl, JAR.W + 40, JAR.H + 40);
  slab(-40, JAR.SH, gl, JAR.H);
  slab(JAR.W - gl, JAR.SH, JAR.W + 40, JAR.H);
  slab(-40, JAR.LID - 40, JAR.W + 40, JAR.LID);
  slab(JAR.NL - 40, JAR.LID, JAR.NL + gl, JAR.NECK_B);
  slab(NR - gl, JAR.LID, NR + 40, JAR.NECK_B);

  // Textures
  let res = 1;
  let scale = 1;
  let faceTex: Texture[] = [];
  let shineTex: Texture[] = [];
  let shadowTex: Texture[] = [];

  /** Texture from a painted canvas; the pixel theme upscales low-res paint without smoothing. */
  const tex = (canvas: HTMLCanvasElement) => {
    const t = Texture.from(canvas);
    if (theme().pixel) t.source.scaleMode = 'nearest';
    return t;
  };
  const swap = (sprite: Sprite, canvas: HTMLCanvasElement) => {
    const old = sprite.texture;
    sprite.texture = tex(canvas);
    if (old && old !== Texture.EMPTY) old.destroy(true);
  };

  function paintJar() {
    swap(jarFront, drawJarFront(jarRes(), bank().name));
    jarFront.width = jarBack.width = JAR_TEX_W;
    jarFront.height = jarBack.height = JAR_TEX_H;
  }

  function paintCoins() {
    const old = [...faceTex, ...shineTex, ...shadowTex];
    const r = theme().pixel?.coin ?? res;
    faceTex = COIN_TYPES.map((t) => tex(drawCoinFace(t, r)));
    shineTex = COIN_TYPES.map((t) => tex(drawCoinShine(t, r)));
    shadowTex = COIN_TYPES.map((t) => tex(drawCoinShadow(t, r)));
    for (const c of coins) {
      c.sprites[0].texture = shadowTex[c.type];
      c.sprites[1].texture = faceTex[c.type];
      c.sprites[2].texture = shineTex[c.type];
    }
    // merge ghosts may still be flying with the old textures
    setTimeout(() => old.forEach((t) => t.destroy(true)), 1000);
  }

  // Goal photo, re-baked when progress moves by a step (throttled: baking is not free)
  let photoImg: ImageBitmap | null = null;
  let photoP = -1;
  let photoBakedAt = 0;
  let photoToken = 0;
  function paintPhoto(force = false) {
    if (!photoImg) return;
    const b = bank();
    const p = clamp(b.target > 0 ? shown / b.target : 0, 0, 1);
    const step = Math.round(p * 40) / 40;
    const now = performance.now();
    if (!force && (step === photoP || now - photoBakedAt < 160)) return;
    photoP = step;
    photoBakedAt = now;
    swap(photo, drawReveal(photoImg, step, Math.min(jarRes(), 2)));
    photo.width = JAR_TEX_W;
    photo.height = JAR_TEX_H;
    photo.alpha = 0.75 + 0.25 * step;
    photo.visible = true;
  }
  async function loadPhoto() {
    const token = ++photoToken;
    const b = bank();
    photoImg?.close();
    photoImg = null;
    photo.visible = false;
    photoP = -1;
    if (!b.photo) return;
    const blob = await getPhoto(b.id);
    const img = blob ? await loadBitmap(blob).catch(() => null) : null;
    if (token !== photoToken) {
      img?.close();
      return;
    }
    photoImg = img;
    paintPhoto(true);
  }

  const jarRes = () => theme().pixel?.jar ?? res;
  let baseX = 0;
  let vw = wrap.clientWidth;
  let vh = wrap.clientHeight;
  function layout() {
    vw = wrap.clientWidth;
    vh = wrap.clientHeight;
    const top = $('hud').getBoundingClientRect().bottom + 10;
    const bottom = $('controls').getBoundingClientRect().top - 8;
    const availH = Math.max(160, bottom - top);
    const sceneW = JAR.W + 60;
    const sceneH = JAR.H + 30;
    // a collapsed viewport (hidden webview) must not produce a negative scale
    scale = Math.max(0.1, Math.min((vw - 16) / sceneW, availH / sceneH, 1.7));
    world.scale.set(scale);
    const jarTop = top + (availH - sceneH * scale) / 2 + 4 * scale;
    baseX = Math.round(vw / 2);
    world.position.set(baseX, Math.round(jarTop + pivotY * scale));
    res = Math.min(3, scale * app.renderer.resolution);

    const bgRes = theme().pixel?.bg ?? Math.min(2, app.renderer.resolution);
    swap(bg, drawBackground(vw, vh, bgRes, jarTop + JAR.H * scale, vw / 2, JAR.W * scale));
    bg.width = vw;
    bg.height = vh;
    swap(jarBack, drawJarBack(jarRes()));
    glow.tint = theme().glow;
    fx.tint = theme().sparkle;
    paintJar();
    paintCoins();
    paintPhoto(true);
  }

  // Coins
  const coins: Coin[] = [];
  const byCollider = new Map<number, Coin>();
  let simTime = 0;

  function addCoin(type: number, x: number, y: number, vx: number, vy: number, angle: number, spin: number, born = -1, pop = false) {
    const t = COIN_TYPES[type];
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x / S, y / S)
        .setRotation(angle)
        .setLinvel(vx, vy)
        .setAngvel(spin)
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(0.5),
    );
    const shape = t.bar
      ? RAPIER.ColliderDesc.cuboid(t.bar.w / 2 / S, t.bar.h / 2 / S).setRestitution(0.2).setFriction(0.5).setDensity(1.6)
      : RAPIER.ColliderDesc.ball(t.r / S)
          .setRestitution(0.42)
          .setFriction(0.3)
          .setDensity(t.metal === 'silver' ? 1 : 1.25);
    const col = physics.createCollider(shape.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
    const size = (extent(t) + COIN_PAD) * 2;
    const sprites = [new Sprite(shadowTex[type]), new Sprite(faceTex[type]), new Sprite(shineTex[type])] as [Sprite, Sprite, Sprite];
    const view = new Container();
    let halo: Sprite | undefined;
    if (type === LUCKY) {
      halo = new Sprite(glowTex);
      halo.anchor.set(0.5);
      halo.blendMode = 'add';
      halo.tint = 0xffb8e6;
      halo.width = halo.height = t.r * 5;
      view.addChild(halo);
    }
    for (const s of sprites) {
      s.anchor.set(0.5);
      s.width = s.height = size;
      view.addChild(s);
    }
    view.position.set(x, y);
    if (born >= 0) view.alpha = 0;
    coinLayer.addChild(view);
    const coin: Coin = { body, type, view, sprites, halo, born, pop, lastSound: -1, pvx: vx, pvy: vy };
    coins.push(coin);
    byCollider.set(col.handle, coin);
    return coin;
  }

  /** Removes the body; with `ghostTo` the sprite flies there instead of vanishing. */
  function removeCoin(coin: Coin, ghostTo?: { x: number; y: number }) {
    const i = coins.indexOf(coin);
    if (i >= 0) coins.splice(i, 1);
    for (let k = 0; k < coin.body.numColliders(); k++) byCollider.delete(coin.body.collider(k).handle);
    physics.removeRigidBody(coin.body);
    if (ghostTo) fx.ghost(coin.view, ghostTo.x, ghostTo.y);
    else coin.view.destroy({ children: true });
  }

  const fill = () => coins.reduce((s, c) => s + area(COIN_TYPES[c.type]), 0) / jarArea;

  function dropCoin(type: number) {
    if (coins.length >= MAX_COINS || fill() > MAX_FILL) {
      let victim: Coin | undefined;
      for (const c of coins) if (c.type !== LUCKY && (!victim || c.type < victim.type)) victim = c;
      removeCoin(victim ?? coins[0]);
    }
    const t = COIN_TYPES[type];
    const e = extent(t);
    const span = NR - JAR.NL - 2 * JAR.GLASS - 2 * e - 12;
    const bar = !!t.bar;
    addCoin(
      type,
      JAR.W / 2 + (Math.random() - 0.5) * span,
      JAR.LID + (bar ? t.bar!.h / 2 : t.r) + 2,
      (Math.random() - 0.5) * 3,
      3 + Math.random() * 3,
      bar ? (Math.random() - 0.5) * 0.3 : Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * (bar ? 2 : 24),
      simTime,
    );
    if (type === LUCKY) celebrateLucky();
    dirty = true;
  }

  function decompose(amount: number) {
    const out: number[] = [];
    let rest = amount;
    for (let i = MAX_DEPOSIT_TYPE; i >= 0 && out.length < 14; i--) {
      while (rest >= COIN_TYPES[i].value && out.length < 14) {
        out.push(i);
        rest -= COIN_TYPES[i].value;
      }
    }
    if (!out.length) out.push(0);
    return out.sort(() => Math.random() - 0.5);
  }

  const pending: number[] = [];
  let spawnWait = 0;

  function add(amount: number) {
    sound.unlock();
    bank().amount += amount;
    pending.push(...decompose(amount));
    maybeLucky(LUCKY_CHANCE_ADD);
    floater(`+${fmt.format(amount)} ₽`);
    bumpCombo();
    dirty = true;
  }

  // Combo: quick consecutive deposits climb a pentatonic scale
  const comboEl = $('combo');
  let combo = 0;
  let comboLeft = 0;
  function bumpCombo() {
    combo++;
    comboLeft = COMBO_WINDOW;
    const step = PENTATONIC[Math.min(combo - 1, PENTATONIC.length - 1)];
    sound.chime(step, 0.22 + Math.min(combo, 10) * 0.012);
    if (combo < 2) return;
    comboEl.textContent = `×${combo}`;
    comboEl.classList.add('show');
    comboEl.classList.remove('hit');
    void comboEl.offsetWidth;
    comboEl.classList.add('hit');
    if (combo % 5 === 0) {
      fx.burst(JAR.W / 2, JAR.LID + 20, 10 + combo, 1.1);
      navigator.vibrate?.(20);
    }
  }
  function tickCombo(dt: number) {
    if (comboLeft <= 0) return;
    comboLeft -= dt;
    if (comboLeft <= 0) {
      combo = 0;
      comboEl.classList.remove('show');
    }
  }

  // Rare coin: a collectible that carries no money
  const luckyEl = $('lucky');
  function maybeLucky(chance: number) {
    const inJar = coins.filter((c) => c.type === LUCKY).length + pending.filter((t) => t === LUCKY).length;
    if (inJar >= MAX_LUCKY || Math.random() >= chance) return;
    pending.push(LUCKY);
  }
  function celebrateLucky() {
    const b = bank();
    b.lucky = (b.lucky ?? 0) + 1;
    renderLucky(true);
    sound.fanfare();
    fx.burst(JAR.W / 2, JAR.LID + 24, 28, 1.6, 0xffc8f0);
    toast('Редкая монета! Такие попадаются нечасто', 2400, true);
    navigator.vibrate?.([30, 50, 30, 50, 60]);
  }
  function renderLucky(hit = false) {
    const n = bank().lucky ?? 0;
    luckyEl.hidden = n === 0;
    luckyEl.textContent = `★ ${n}`;
    if (hit) {
      luckyEl.classList.remove('hit');
      void luckyEl.offsetWidth;
      luckyEl.classList.add('hit');
    }
  }

  // Merging: when the jar gets crowded, groups of resting small coins fuse into a bigger one
  let mergeWait = 0;
  function tryMerge() {
    const over = fill() - MERGE_FILL;
    if (over <= 0) return over;
    const still = coins.filter((c) => c.born < 0 && c.type in MERGES && Math.hypot(c.pvx, c.pvy) < 4);
    for (const type of Object.keys(MERGES).map(Number)) {
      const { n: need, to } = MERGES[type];
      const pool = still.filter((c) => c.type === type);
      if (pool.length < need) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        const seed = pool[(Math.random() * pool.length) | 0];
        const sp = seed.body.translation();
        const near = pool
          .map((c) => {
            const p = c.body.translation();
            return { c, d: Math.hypot(p.x - sp.x, p.y - sp.y) * S };
          })
          .filter((o) => o.d < 130)
          .sort((a, b) => a.d - b.d)
          .slice(0, need);
        if (near.length < need) continue;
        let cx = 0;
        let cy = 0;
        for (const { c } of near) {
          const p = c.body.translation();
          cx += (p.x * S) / need;
          cy += (p.y * S) / need;
        }
        for (const { c } of near) removeCoin(c, { x: cx, y: cy });
        const bar = !!COIN_TYPES[to].bar;
        addCoin(to, cx, cy, 0, -3, bar ? 0 : Math.random() * Math.PI * 2, (Math.random() - 0.5) * (bar ? 1 : 6), simTime + MERGE_DELAY, true);
        setTimeout(() => {
          sound.chime(14 - type * 2, 0.26, pan(cx));
          sound.impact('coin', 0.7, pan(cx));
          fx.burst(cx, cy, 8 + type * 2, 0.7 + type * 0.12);
          navigator.vibrate?.(12);
        }, MERGE_DELAY * 1000);
        dirty = true;
        return over;
      }
    }
    return over;
  }

  // Sound from contacts
  const pan = (xPx: number) => ((xPx / JAR.W) * 2 - 1) * 0.7;
  let lastBuzz = 0;
  const buzz = (s: number) => {
    const now = performance.now();
    if (s < 0.4 || now - lastBuzz < 70 || !navigator.vibrate) return;
    lastBuzz = now;
    navigator.vibrate(Math.round(5 + s * 14));
  };

  function onContact(h1: number, h2: number, started: boolean) {
    if (!started) return;
    const a = byCollider.get(h1);
    const b = byCollider.get(h2);
    if (a && b) {
      const rel = Math.hypot(a.pvx - b.pvx, a.pvy - b.pvy);
      if (rel < HIT_MIN) return;
      if (simTime - a.lastSound < 0.05 && simTime - b.lastSound < 0.05) return;
      a.lastSound = b.lastSound = simTime;
      const s = Math.min(1, (rel - HIT_MIN) / 16);
      sound.impact('coin', s, pan(a.body.translation().x * S));
      buzz(s);
      return;
    }
    const c = a ?? b;
    if (!c) return;
    const rel = Math.hypot(c.pvx, c.pvy);
    if (rel < HIT_MIN || simTime - c.lastSound < 0.06) return;
    c.lastSound = simTime;
    const p = c.body.translation();
    const onBottom = p.y * S > JAR.H - JAR.GLASS - COIN_TYPES[c.type].r - 10;
    const s = Math.min(1, (rel - HIT_MIN) / 20);
    sound.impact(onBottom ? 'thud' : 'glass', s, pan(p.x * S));
    buzz(s);
  }

  // Shake
  let jiggle = 0;
  function shake(power: number, visual: boolean) {
    for (const c of coins) {
      const m = c.body.mass();
      c.body.applyImpulse({ x: (Math.random() - 0.5) * 16 * m * power, y: -(5 + Math.random() * 16) * m * power }, true);
      c.body.setAngvel((Math.random() - 0.5) * 30 * power, true);
    }
    if (visual) jiggle = Math.min(1.2, jiggle + power);
    navigator.vibrate?.([25, 30, 25]);
  }
  motion.onShake = (p) => shake(0.25 + p * 0.35, false);

  // Withdrawal by turning the jar over: coins leave through the slot and are subtracted
  const withdrawEl = $('withdraw');
  const undoEl = $('undo');
  let flip: { up: number; down: number; open: boolean; total: number; reached: number; wait: number } | null = null;
  let undoTimer = 0;
  let undoData: { id: string; total: number; reached: number } | null = null;

  function tickWithdraw(dt: number) {
    const upside = physics.gravity.y < FLIP_G * G;
    if (!flip) {
      if (!upside || slide || sheet.isOpen) return;
      const b = bank();
      flip = { up: 0, down: 0, open: false, total: 0, reached: b.reached ?? 0, wait: 0 };
    }
    if (upside) {
      flip.up += dt;
      flip.down = 0;
    } else {
      flip.down += dt;
      if (flip.down >= FLIP_END || !flip.open) return endWithdraw();
    }
    if (!flip.open && flip.up >= FLIP_HOLD) {
      flip.open = true;
      stopPour();
      sound.chime(12, 0.2);
      navigator.vibrate?.(30);
    }
    if (!flip.open || !upside) return;

    // gently herd resting coins towards the slot
    for (const c of coins) {
      const p = c.body.translation();
      if (p.y * S < JAR.NECK_B) c.body.applyImpulse({ x: (JAR.W / 2 / S - p.x) * 0.02 * c.body.mass(), y: 0 }, true);
    }
    flip.wait -= dt;
    if (flip.wait > 0) return;
    const b = bank();
    if (b.amount <= 0) return;
    const out = coins.find((c) => {
      if (c.type === LUCKY || c.born >= 0) return false;
      const t = COIN_TYPES[c.type];
      const p = c.body.translation();
      return p.y * S < JAR.LID + extent(t) + 14 && Math.abs(p.x * S - JAR.W / 2) < SLOT_HALF + extent(t);
    });
    if (!out) {
      // coins evicted from a full jar still count: bring them back to fall out
      if (!pending.length && !coins.some((c) => c.type !== LUCKY)) pending.push(...decompose(b.amount));
      return;
    }
    const p = out.body.translation();
    const v = Math.min(COIN_TYPES[out.type].value, b.amount);
    removeCoin(out, { x: p.x * S, y: -80 });
    b.amount -= v;
    flip.total += v;
    flip.wait = EXIT_EVERY;
    b.reached = Math.min(b.reached ?? 0, milestoneFloor(b));
    sound.impact('coin', 0.5 + Math.random() * 0.3, pan(p.x * S));
    buzz(0.5);
    withdrawEl.textContent = `−${fmt.format(flip.total)} ₽`;
    withdrawEl.classList.add('show');
    dirty = true;
  }

  function endWithdraw() {
    if (!flip) return;
    const { total, reached } = flip;
    flip = null;
    withdrawEl.classList.remove('show');
    if (total <= 0) return;
    renderPager();
    undoData = { id: state.current, total, reached };
    $('undoText').textContent = `Снято ${fmt.format(total)} ₽`;
    undoEl.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = window.setTimeout(() => (undoEl.hidden = true), UNDO_MS);
  }

  $('undoBtn').addEventListener('click', () => {
    undoEl.hidden = true;
    const u = undoData;
    undoData = null;
    const b = state.banks.find((x) => x.id === u?.id);
    if (!u || !b) return;
    b.amount += u.total;
    b.reached = u.reached;
    if (b.id === state.current) pending.push(...decompose(u.total));
    renderPager();
    dirty = true;
    toast('Вернули в копилку');
  });

  // Floating labels
  function floater(text: string, xPx = JAR.W / 2, yPx = JAR.LID) {
    const p = world.toGlobal({ x: xPx, y: yPx });
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.left = `${p.x + (Math.random() - 0.5) * 40}px`;
    el.style.top = `${p.y - 40}px`;
    $('floaters').appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  let toastTimer = 0;
  function toast(text: string, ms = 2200, rare = false) {
    const el = $('toast');
    el.textContent = text;
    el.classList.toggle('rare', rare);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  // HUD
  const amountEl = $('amount');
  let shown = bank().amount;
  let shownText = '';
  function renderHud(dt: number) {
    const b = bank();
    shown += (b.amount - shown) * Math.min(1, dt * 9);
    if (Math.abs(b.amount - shown) < 0.5) shown = b.amount;
    const text = fmt.format(Math.round(shown));
    if (text !== shownText) {
      if (shownText && Math.round(shown) > Number(shownText.replace(/\D/g, ''))) {
        amountEl.parentElement!.classList.remove('bump');
        void amountEl.parentElement!.offsetWidth;
        amountEl.parentElement!.classList.add('bump');
      }
      shownText = text;
      amountEl.textContent = text;
    }
    const pct = b.target > 0 ? b.amount / b.target : 0;
    $('pct').textContent = `${Math.floor(pct * 100)}%`;
    $('target').textContent = fmt.format(b.target);
    $('barFill').style.width = `${clamp(pct, 0, 1) * 100}%`;
    $('goalName').textContent = b.name;
    glow.alpha = 0.12 + clamp(pct, 0, 1) * 0.55 + flash * 0.9;
  }

  // Pour button
  const pourBtn = $('pourBtn');
  let pour: { t: number; next: number; total: number; count: number } | null = null;
  pourBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sound.unlock();
    try {
      pourBtn.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    pourBtn.classList.add('active');
    pour = { t: 0, next: 0, total: 0, count: 0 };
  });
  const stopPour = () => {
    if (!pour) return;
    if (pour.total > 0) floater(`+${fmt.format(pour.total)} ₽`);
    pour = null;
    pourBtn.classList.remove('active');
    $('pourCount').textContent = '';
  };
  pourBtn.addEventListener('pointerup', stopPour);
  pourBtn.addEventListener('pointercancel', stopPour);
  pourBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  function tickPour(dt: number) {
    if (!pour) return;
    pour.t += dt;
    pour.next -= dt;
    while (pour.next <= 0) {
      const t = pour.t;
      const type = t < 1.2 ? 0 : t < 2.6 ? 1 : t < 4 ? 2 : t < 6 ? 3 : 4;
      const v = COIN_TYPES[type].value;
      bank().amount += v;
      pour.total += v;
      dropCoin(type);
      pour.count++;
      if (pour.count % 6 === 1) bumpCombo();
      maybeLucky(LUCKY_CHANCE_POUR);
      pour.next += Math.max(0.035, 0.13 - t * 0.02);
    }
    $('pourCount').textContent = `+${fmt.format(pour.total)} ₽`;
  }

  document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((btn) =>
    btn.addEventListener('click', () => add(Number(btn.dataset.add))),
  );
  $('shakeBtn').addEventListener('click', () => {
    sound.unlock();
    shake(1, true);
  });

  // Motion
  const motionBtn = $('motionBtn');
  let motionShown = false;
  const syncMotionBtn = () => {
    motionShown = motion.active;
    motionBtn.classList.toggle('on', motionShown);
  };
  async function turnMotionOn() {
    sound.unlock();
    const ok = await motion.enable();
    syncMotionBtn();
    motionBtn.classList.remove('pulse');
    if (!ok) toast('Датчик движения недоступен. Тяни банку пальцем или мышью.');
    else
      setTimeout(() => {
        if (!motion.active) toast('Датчик молчит: на компьютере тяни банку мышью');
        else toast('Наклоняй и тряси телефон');
      }, 900);
  }
  motionBtn.addEventListener('click', () => {
    if (motion.active) {
      motion.disable();
      syncMotionBtn();
      toast('Наклон выключен');
    } else void turnMotionOn();
  });
  if (Motion.needsPermission()) motionBtn.classList.add('pulse');
  else void motion.enable().then(syncMotionBtn);

  // Drag to tilt (desktop, or when the sensor is off)
  let drag: { x: number; id: number } | null = null;
  let keyTilt = 0;
  wrap.addEventListener('pointerdown', (e) => {
    sound.unlock();
    if (motion.active) {
      startSwipe(e);
      return;
    }
    drag = { x: e.clientX, id: e.pointerId };
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    motion.tilt = clamp((e.clientX - drag.x) / 140, -2.8, 2.8);
  });
  const endDrag = () => (drag = null);
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);
  window.addEventListener('keydown', (e) => {
    sound.unlock();
    if (e.code === 'ArrowLeft') keyTilt = -1.1;
    else if (e.code === 'ArrowRight') keyTilt = 1.1;
    else if (e.code === 'Space' && !e.repeat) shake(1, true);
    else if (e.code === 'ArrowUp') add(10);
    else if (e.code === 'KeyF') keyTilt = Math.PI;
    else if (e.code === 'BracketLeft' || e.code === 'PageUp') step(-1);
    else if (e.code === 'BracketRight' || e.code === 'PageDown') step(1);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyF') keyTilt = 0;
  });

  // Several banks: one physics world, coins are swapped in and out on switch
  function clearJar() {
    [...coins].forEach((c) => removeCoin(c));
    pending.length = 0;
    combo = 0;
    comboLeft = 0;
    comboEl.classList.remove('show');
  }

  function loadBank(id: string, keepOld: boolean) {
    if (keepOld) persist();
    endWithdraw();
    stopPour();
    clearJar();
    state.current = id;
    save(state);
    sound.muteUntil = performance.now() + 700;
    for (const [type, x, y, a] of bank().coins) {
      if (COIN_TYPES[type]) addCoin(type, x, y, 0, 0, a, 0);
    }
    shown = 0; // count up again: switching is a small reward too
    paintJar();
    void loadPhoto();
    renderLucky();
    renderPager();
  }

  let slide: { t: number; dir: number; to: string | null; keepOld: boolean } | null = null;
  let slideX = 0;
  function switchTo(id: string, dir: number, keepOld = true) {
    if (slide || id === state.current) return;
    slide = { t: 0, dir, to: id, keepOld };
    sound.unlock();
    sound.chime(dir > 0 ? 7 : 0, 0.12, dir * 0.5);
  }
  function step(dir: number) {
    const i = state.banks.findIndex((b) => b.id === state.current);
    const next = state.banks[i + dir];
    if (next) switchTo(next.id, dir);
    else jiggle = Math.min(1, jiggle + 0.4);
  }
  function tickSlide(dt: number) {
    if (!slide) return;
    slide.t += dt;
    if (slide.to) {
      const k = Math.min(1, slide.t / SLIDE_OUT);
      slideX = -slide.dir * vw * k * k;
      if (k >= 1) {
        loadBank(slide.to, slide.keepOld);
        slide.to = null;
        slide.t = 0;
        slideX = slide.dir * vw;
      }
    } else {
      const k = Math.min(1, slide.t / SLIDE_IN);
      const c = 1.4;
      const e = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); // ease-out-back
      slideX = slide.dir * vw * (1 - e);
      if (k >= 1) {
        slide = null;
        slideX = 0;
      }
    }
  }

  const pager = $('pager');
  function renderPager() {
    pager.replaceChildren();
    const cur = state.banks.findIndex((b) => b.id === state.current);
    state.banks.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'dot';
      btn.classList.toggle('cur', i === cur);
      btn.classList.toggle('done', b.amount >= b.target);
      btn.setAttribute('aria-label', b.name);
      btn.addEventListener('click', () => switchTo(b.id, i > cur ? 1 : -1));
      pager.appendChild(btn);
    });
    const add = document.createElement('button');
    add.className = 'add';
    add.setAttribute('aria-label', 'Новая копилка');
    add.innerHTML = '<span>+</span>';
    add.addEventListener('click', () => sheet.open('create'));
    pager.appendChild(add);
  }

  // Swipe between banks: on the HUD always, on the jar only when the tilt sensor owns the jar
  let swipe: { x: number; y: number; id: number } | null = null;
  const startSwipe = (e: PointerEvent) => (swipe = { x: e.clientX, y: e.clientY, id: e.pointerId });
  const endSwipe = (e: PointerEvent) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
  };
  $('hud').addEventListener('pointerdown', (e) => {
    if (!(e.target as HTMLElement).closest('button')) startSwipe(e);
  });
  $('hud').addEventListener('pointerup', endSwipe);
  wrap.addEventListener('pointerup', endSwipe);

  // Milestones
  const goalCard = $('goalCard');
  let flash = 0;
  function checkMilestone() {
    const b = bank();
    if (slide || b.target <= 0) return;
    const pct = (shown / b.target) * 100;
    const m = MILESTONES.filter((x) => x > (b.reached ?? 0) && pct >= x).pop();
    if (!m) return;
    b.reached = m;
    dirty = true;
    celebrate(m);
    renderPager();
  }
  function celebrate(m: number) {
    const level = MILESTONES.indexOf(m) + 1;
    sound.milestone(level);
    flash = 1;
    shake(0.3 + level * 0.08, true);
    fx.burst(JAR.W / 2, JAR.H * 0.5, 16 + level * 8, 1.2 + level * 0.15);
    const bar = $('barFill').getBoundingClientRect();
    confetti.burst(bar.right, bar.top, 20 + level * 15, 0.8 + level * 0.1);
    navigator.vibrate?.(level >= 4 ? [60, 60, 60, 60, 200] : [40, 40, 80]);
    if (m < 100) {
      toast(`${m}%  ${MILESTONE_TEXT[m]}`, 2600);
      return;
    }
    confetti.rain(vw, 180);
    confetti.burst(vw * 0.2, vh, 50, 1.2);
    confetti.burst(vw * 0.8, vh, 50, 1.2);
    const b = bank();
    $('goalCardText').textContent = `«${b.name}»: ${fmt.format(b.amount)} ₽ собрано. Можно копить дальше или начать новую копилку.`;
    setTimeout(() => (goalCard.hidden = false), 900);
  }
  $('goalMore').addEventListener('click', () => (goalCard.hidden = true));
  $('goalNew').addEventListener('click', () => {
    goalCard.hidden = true;
    sheet.open('create');
  });

  // Settings sheet
  async function applyPhoto(id: string, blob: Blob | null | undefined) {
    const b = state.banks.find((x) => x.id === id);
    if (!b || blob === undefined) return;
    if (blob) await putPhoto(id, blob);
    else await deletePhoto(id);
    b.photo = !!blob;
    save(state);
    if (id === state.current) void loadPhoto();
  }
  const sheet = new Sheet({
    save(v: SheetValues) {
      const b = bank();
      b.name = v.name || 'Мечта';
      if (v.target > 0) b.target = v.target;
      // a raised target re-opens the milestones above the new percentage
      b.reached = Math.min(b.reached ?? 0, milestoneFloor(b));
      paintJar();
      renderPager();
      void applyPhoto(b.id, v.photo);
      dirty = true;
    },
    create(v: SheetValues) {
      const nb = freshBank(v.name || 'Новая цель', v.target > 0 ? v.target : 50000);
      nb.reached = 0;
      state.banks.push(nb);
      save(state);
      renderPager();
      void applyPhoto(nb.id, v.photo ?? undefined).then(() => switchTo(nb.id, 1));
      if (!v.photo) switchTo(nb.id, 1);
    },
    reset() {
      const b = bank();
      b.amount = 0;
      b.lucky = 0;
      b.reached = 0;
      clearJar();
      shown = 0;
      photoP = -1;
      renderLucky();
      renderPager();
      persist();
      toast('Копилка обнулена');
    },
    async theme(id: string) {
      setTheme(id);
      state.theme = id;
      save(state);
      await loadThemeFonts(theme());
      layout();
    },
    remove() {
      if (state.banks.length < 2) return;
      const i = state.banks.findIndex((b) => b.id === state.current);
      const [gone] = state.banks.splice(i, 1);
      void deletePhoto(gone.id);
      const next = state.banks[Math.min(i, state.banks.length - 1)];
      // the removed bank is already out of the list; don't write its coins anywhere
      switchTo(next.id, -1, false);
      toast(`Копилка «${gone.name}» удалена`);
    },
  });
  const openSettings = async () => {
    const b = bank();
    const blob = b.photo ? await getPhoto(b.id) : undefined;
    sheet.markTheme(theme().id);
    sheet.open('edit', { name: b.name, target: b.target, photo: blob, canDelete: state.banks.length > 1 });
  };
  $('menuBtn').addEventListener('click', () => void openSettings());
  $('goalBtn').addEventListener('click', () => void openSettings());

  // Persistence
  let dirty = false;
  let saveWait = 0;
  function persist() {
    // exact lookup: right after a delete the current id is gone and bank() would fall back to another bank
    const b = state.banks.find((x) => x.id === state.current);
    if (!b) return;
    b.coins = coins.map((c) => {
      const p = c.body.translation();
      return [c.type, Math.round(p.x * S * 10) / 10, Math.round(p.y * S * 10) / 10, Math.round(c.body.rotation() * 100) / 100];
    });
    save(state);
    dirty = false;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
  window.addEventListener('pagehide', persist);

  // Start
  layout();
  sound.muteUntil = performance.now() + 900;
  for (const [type, x, y, a] of bank().coins) {
    if (COIN_TYPES[type]) addCoin(type, x, y, 0, 0, a, 0);
  }
  renderHud(1);
  renderLucky();
  renderPager();
  void loadPhoto();

  let resizeTimer = 0;
  let laidOut = `${wrap.clientWidth}x${wrap.clientHeight}`;
  new ResizeObserver(() => {
    const size = `${wrap.clientWidth}x${wrap.clientHeight}`;
    if (size === laidOut) return;
    laidOut = size;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      app.resize();
      layout();
    }, 120);
  }).observe(wrap);

  let acc = 0;
  let wakeG = { x: 0, y: 0 };
  let clock = 0;

  app.ticker.add((tk) => {
    const dt = Math.min(tk.deltaMS / 1000, 0.1);
    clock += dt;

    if (!drag && !motion.active) {
      const target = keyTilt;
      motion.tilt += (target - motion.tilt) * (1 - Math.exp(-dt * (target ? 6 : 5)));
    }
    motion.update(dt);
    const g = motion.gravity;
    physics.gravity = { x: g.x * K, y: g.y * K };
    if (Math.hypot(g.x - wakeG.x, g.y - wakeG.y) > 0.25) {
      wakeG = { ...g };
      for (const c of coins) c.body.wakeUp();
    }

    tickPour(dt);
    tickWithdraw(dt);
    spawnWait -= dt;
    if (pending.length && spawnWait <= 0) {
      dropCoin(pending.shift()!);
      spawnWait = 0.075;
    }

    acc += dt;
    let n = 0;
    while (acc >= DT && n < 5) {
      for (const c of coins) {
        if (c.body.isSleeping()) {
          c.pvx = c.pvy = 0;
        } else {
          const v = c.body.linvel();
          c.pvx = v.x;
          c.pvy = v.y;
        }
      }
      physics.step(queue);
      queue.drainCollisionEvents(onContact);
      simTime += DT;
      acc -= DT;
      n++;
    }
    if (n === 5) acc = 0;

    for (const c of coins) {
      const p = c.body.translation();
      const x = p.x * S;
      const y = p.y * S;
      if (x < -20 || x > JAR.W + 20 || y < 0 || y > JAR.H + 20) {
        c.body.setTranslation({ x: JAR.W / 2 / S, y: JAR.H / 2 / S }, true);
        c.body.setLinvel({ x: 0, y: 0 }, true);
      }
      c.view.position.set(x, y);
      const rot = c.body.rotation();
      c.sprites[1].rotation = rot;
      if (COIN_TYPES[c.type].bar) c.sprites[0].rotation = rot;
      if (c.halo) {
        c.halo.alpha = 0.55 + Math.sin(clock * 4 + x) * 0.25;
        c.halo.rotation = clock * 0.6;
      }
      if (c.born >= 0) {
        const age = simTime - c.born;
        const dur = c.pop ? 0.3 : 0.18;
        if (age < 0) {
          c.view.alpha = 0;
        } else if (age < dur) {
          const k = age / dur;
          c.view.alpha = Math.min(1, k * 2);
          // merge result overshoots from small; a dropped coin shrinks in from above
          c.view.scale.set(c.pop ? 0.4 + 0.6 * k + Math.sin(k * Math.PI) * 0.35 : 1 + 0.45 * (1 - k) * (1 - k));
        } else {
          c.view.alpha = 1;
          c.view.scale.set(1);
          c.born = -1;
        }
      }
    }
    fx.update(dt);
    tickCombo(dt);
    mergeWait -= dt;
    if (mergeWait <= 0) {
      const over = tryMerge();
      mergeWait = over > 0.08 ? 0.04 : over > 0.03 ? 0.1 : 0.25;
    }

    // desktop tilt is shown by rotating the jar; on a phone the phone itself rotates
    const visualTilt = motion.active ? 0 : motion.tilt;
    jiggle *= Math.exp(-dt * 5);
    world.rotation = visualTilt + Math.sin(clock * 47) * jiggle * 0.05;
    world.pivot.x = JAR.W / 2 + Math.sin(clock * 61) * jiggle * 7;
    tickSlide(dt);
    world.x = baseX + slideX;
    flash *= Math.exp(-dt * 2.5);
    confetti.update(dt, vh);

    renderHud(dt);
    checkMilestone();
    paintPhoto();
    if (motion.active !== motionShown) syncMotionBtn();

    saveWait -= dt;
    if (dirty && saveWait <= 0) {
      persist();
      saveWait = 2;
    }
  });
}
