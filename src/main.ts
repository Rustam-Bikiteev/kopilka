import './style.css';
import RAPIER from '@dimforge/rapier2d-compat';
import type { RigidBody } from '@dimforge/rapier2d-compat';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { registerSW } from 'virtual:pwa-register';
import { JAR, NR, outline } from './jar';
import { COIN_PAD, COIN_TYPES, drawCoinFace, drawCoinShadow, drawCoinShine } from './coins';
import { JAR_PAD, JAR_TEX_H, JAR_TEX_W, drawBackground, drawGlow, drawJarBack, drawJarFront } from './paint';
import { Sound } from './audio';
import { Motion } from './motion';
import { freshBank, load, save } from './store';

const S = 50; // virtual px per physics unit
const G = 75; // base gravity, units/s^2 (stylised: faster than real for a snappier fall)
const K = G / 9.81;
const DT = 1 / 120;
const MAX_COINS = 240;
const HIT_MIN = 1.2;

interface Coin {
  body: RigidBody;
  type: number;
  view: Container;
  sprites: [Sprite, Sprite, Sprite];
  born: number;
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

  await RAPIER.init();
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);

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
  const glow = new Sprite(Texture.from(drawGlow()));
  const jarBack = new Sprite();
  const coinLayer = new Container();
  const jarFront = new Sprite();
  glow.blendMode = 'add';
  glow.anchor.set(0.5);
  glow.position.set(JAR.W / 2, JAR.H * 0.74);
  glow.width = JAR.W * 1.7;
  glow.height = JAR.H * 0.95;
  for (const s of [jarBack, jarFront]) {
    s.position.set(-JAR_PAD, -JAR_PAD);
  }
  world.addChild(glow, jarBack, coinLayer, jarFront);
  app.stage.addChild(bg, world);
  const pivotY = JAR.H * 0.6;
  world.pivot.set(JAR.W / 2, pivotY);

  // Physics
  const physics = new RAPIER.World({ x: 0, y: G });
  physics.timestep = DT;
  const queue = new RAPIER.EventQueue(true);
  const jarBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const inner = outline(JAR.GLASS);
  inner.push(inner[0]);
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

  const swap = (sprite: Sprite, canvas: HTMLCanvasElement) => {
    const old = sprite.texture;
    sprite.texture = Texture.from(canvas);
    if (old && old !== Texture.EMPTY) old.destroy(true);
  };

  function paintJar() {
    swap(jarFront, drawJarFront(res, bank().name));
    jarFront.width = jarBack.width = JAR_TEX_W;
    jarFront.height = jarBack.height = JAR_TEX_H;
  }

  function paintCoins() {
    const old = [...faceTex, ...shineTex, ...shadowTex];
    faceTex = COIN_TYPES.map((t) => Texture.from(drawCoinFace(t, res)));
    shineTex = COIN_TYPES.map((t) => Texture.from(drawCoinShine(t, res)));
    shadowTex = COIN_TYPES.map((t) => Texture.from(drawCoinShadow(t, res)));
    for (const c of coins) {
      c.sprites[0].texture = shadowTex[c.type];
      c.sprites[1].texture = faceTex[c.type];
      c.sprites[2].texture = shineTex[c.type];
    }
    old.forEach((t) => t.destroy(true));
  }

  function layout() {
    const vw = wrap.clientWidth;
    const vh = wrap.clientHeight;
    const top = $('hud').getBoundingClientRect().bottom + 10;
    const bottom = $('controls').getBoundingClientRect().top - 8;
    const availH = Math.max(160, bottom - top);
    const sceneW = JAR.W + 60;
    const sceneH = JAR.H + 30;
    scale = Math.min((vw - 16) / sceneW, availH / sceneH, 1.7);
    world.scale.set(scale);
    const jarTop = top + (availH - sceneH * scale) / 2 + 4 * scale;
    world.position.set(Math.round(vw / 2), Math.round(jarTop + pivotY * scale));
    res = Math.min(3, scale * app.renderer.resolution);

    const bgRes = Math.min(2, app.renderer.resolution);
    swap(bg, drawBackground(vw, vh, bgRes, jarTop + JAR.H * scale, vw / 2, JAR.W * scale));
    bg.width = vw;
    bg.height = vh;
    swap(jarBack, drawJarBack(res));
    paintJar();
    paintCoins();
  }

  // Coins
  const coins: Coin[] = [];
  const byCollider = new Map<number, Coin>();
  let simTime = 0;

  function addCoin(type: number, x: number, y: number, vx: number, vy: number, angle: number, spin: number, animate: boolean) {
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
    const col = physics.createCollider(
      RAPIER.ColliderDesc.ball(t.r / S)
        .setRestitution(0.42)
        .setFriction(0.3)
        .setDensity(t.metal === 'gold' ? 1.25 : 1)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const size = (t.r + COIN_PAD) * 2;
    const sprites = [new Sprite(shadowTex[type]), new Sprite(faceTex[type]), new Sprite(shineTex[type])] as [Sprite, Sprite, Sprite];
    const view = new Container();
    for (const s of sprites) {
      s.anchor.set(0.5);
      s.width = s.height = size;
      view.addChild(s);
    }
    view.position.set(x, y);
    coinLayer.addChild(view);
    const coin: Coin = { body, type, view, sprites, born: animate ? simTime : -1, lastSound: -1, pvx: vx, pvy: vy };
    coins.push(coin);
    byCollider.set(col.handle, coin);
    return coin;
  }

  function removeCoin(coin: Coin) {
    const i = coins.indexOf(coin);
    if (i >= 0) coins.splice(i, 1);
    for (let k = 0; k < coin.body.numColliders(); k++) byCollider.delete(coin.body.collider(k).handle);
    physics.removeRigidBody(coin.body);
    coin.view.destroy({ children: true });
  }

  function dropCoin(type: number) {
    if (coins.length >= MAX_COINS) {
      let victim = coins[0];
      for (const c of coins) if (c.type < victim.type) victim = c;
      removeCoin(victim);
    }
    const r = COIN_TYPES[type].r;
    const span = NR - JAR.NL - 2 * JAR.GLASS - 2 * r - 12;
    addCoin(
      type,
      JAR.W / 2 + (Math.random() - 0.5) * span,
      JAR.LID + r + 2,
      (Math.random() - 0.5) * 3,
      3 + Math.random() * 3,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 24,
      true,
    );
    dirty = true;
  }

  function decompose(amount: number) {
    const out: number[] = [];
    let rest = amount;
    for (let i = COIN_TYPES.length - 1; i >= 0 && out.length < 14; i--) {
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
    floater(`+${fmt.format(amount)} ₽`);
    dirty = true;
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
  function toast(text: string, ms = 2200) {
    const el = $('toast');
    el.textContent = text;
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
    glow.alpha = 0.12 + clamp(pct, 0, 1) * 0.55;
  }

  // Pour button
  const pourBtn = $('pourBtn');
  let pour: { t: number; next: number; total: number } | null = null;
  pourBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sound.unlock();
    try {
      pourBtn.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    pourBtn.classList.add('active');
    pour = { t: 0, next: 0, total: 0 };
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
    if (motion.active) return;
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
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') keyTilt = 0;
  });

  // Settings
  const dialog = $<HTMLDialogElement>('settings');
  const openSettings = () => {
    $<HTMLInputElement>('fName').value = bank().name;
    $<HTMLInputElement>('fTarget').value = String(bank().target);
    dialog.showModal();
  };
  $('menuBtn').addEventListener('click', openSettings);
  $('goalBtn').addEventListener('click', openSettings);
  dialog.addEventListener('close', () => {
    const b = bank();
    if (dialog.returnValue === 'save') {
      b.name = $<HTMLInputElement>('fName').value.trim() || 'Мечта';
      const target = Math.round(Number($<HTMLInputElement>('fTarget').value));
      if (target > 0) b.target = target;
      paintJar();
      dirty = true;
    } else if (dialog.returnValue === 'reset') {
      if (!confirm('Обнулить копилку? Сумма и монеты пропадут.')) return;
      const f = freshBank();
      b.amount = 0;
      b.coins = f.coins;
      [...coins].forEach(removeCoin);
      pending.length = 0;
      shown = 0;
      dirty = true;
    }
  });

  // Persistence
  let dirty = false;
  let saveWait = 0;
  function persist() {
    const b = bank();
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
    if (COIN_TYPES[type]) addCoin(type, x, y, 0, 0, a, 0, false);
  }
  renderHud(1);

  let resizeTimer = 0;
  new ResizeObserver(() => {
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
      c.sprites[1].rotation = c.body.rotation();
      if (c.born >= 0) {
        const age = simTime - c.born;
        if (age < 0.18) {
          const k = age / 0.18;
          c.view.alpha = k;
          c.view.scale.set(1 + 0.45 * (1 - k) * (1 - k));
        } else {
          c.view.alpha = 1;
          c.view.scale.set(1);
          c.born = -1;
        }
      }
    }

    // desktop tilt is shown by rotating the jar; on a phone the phone itself rotates
    const visualTilt = motion.active ? 0 : motion.tilt;
    jiggle *= Math.exp(-dt * 5);
    world.rotation = visualTilt + Math.sin(clock * 47) * jiggle * 0.05;
    world.pivot.x = JAR.W / 2 + Math.sin(clock * 61) * jiggle * 7;

    renderHud(dt);
    if (motion.active !== motionShown) syncMotionBtn();

    saveWait -= dt;
    if (dirty && saveWait <= 0) {
      persist();
      saveWait = 2;
    }
  });
}
