export type ImpactKind = 'coin' | 'glass' | 'thud';

interface Mode {
  f: number;
  a: number;
  tau: number;
}

const MAX_VOICES = 18;

/**
 * Procedural clinks. Buffers are synthesized once as sums of damped inharmonic partials
 * (modal synthesis), then replayed with random pitch, level and pan per impact.
 */
export class Sound {
  readonly ctx: AudioContext;
  private master: GainNode;
  private send: GainNode;
  private buffers: Record<ImpactKind, AudioBuffer[]>;
  private bell: AudioBuffer;
  private voices = 0;
  private unlocked = false;
  muteUntil = 0;

  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch {
      /* not supported */
    }

    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(1.1);
    this.send = ctx.createGain();
    this.send.gain.value = 0.22;
    this.send.connect(verb);
    verb.connect(this.master);

    this.buffers = {
      coin: Array.from({ length: 10 }, () => this.coinBuffer()),
      glass: Array.from({ length: 8 }, () => this.glassBuffer()),
      thud: Array.from({ length: 6 }, () => this.thudBuffer()),
    };
    this.bell = this.buffer(
      1.6,
      [
        { f: 1046.5, a: 1, tau: 0.9 },
        { f: 1046.5 * 1.003, a: 0.4, tau: 0.8 },
        { f: 2093, a: 0.45, tau: 0.55 },
        { f: 3150, a: 0.3, tau: 0.32 },
        { f: 4290, a: 0.16, tau: 0.2 },
        { f: 5680, a: 0.1, tau: 0.12 },
      ],
      0.15,
      0.001,
    );
  }

  unlock() {
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (this.unlocked) return;
    this.unlocked = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    src.connect(this.ctx.destination);
    src.start();
  }

  /** strength 0..1, pan -1..1 */
  impact(kind: ImpactKind, strength: number, pan: number) {
    if (this.ctx.state !== 'running' || performance.now() < this.muteUntil) return;
    if (this.voices >= MAX_VOICES && strength < 0.7) return;
    if (this.voices >= MAX_VOICES + 6) return;
    const list = this.buffers[kind];
    const level = kind === 'coin' ? 0.5 : kind === 'glass' ? 0.62 : 0.8;
    this.play(
      list[(Math.random() * list.length) | 0],
      0.93 + Math.random() * 0.14,
      (0.04 + Math.pow(strength, 1.35) * 0.96) * level,
      pan,
      1500 + strength * strength * 17000,
    );
  }

  /** Bell note `semis` semitones above C6. */
  chime(semis: number, gain = 0.3, pan = 0, delay = 0) {
    if (this.ctx.state !== 'running') return;
    this.play(this.bell, Math.pow(2, semis / 12), gain, pan, 20000, delay);
  }

  /** Rising sparkle for the rare coin. */
  fanfare() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => this.chime(s + 2, 0.34 - k * 0.025, (k % 2 ? 1 : -1) * 0.3, k * 0.065));
    this.chime(31, 0.18, 0, 0.5);
  }

  private play(buf: AudioBuffer, rate: number, gain: number, pan: number, cutoff: number, delay = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(cutoff, ctx.sampleRate * 0.45);
    lp.Q.value = 0.4;

    const g = ctx.createGain();
    g.gain.value = gain;

    src.connect(lp);
    lp.connect(g);
    let out: AudioNode = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      out = p;
    }
    out.connect(this.master);
    out.connect(this.send);

    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
      out.disconnect();
    };
    src.start(ctx.currentTime + delay);
  }

  private buffer(dur: number, modes: Mode[], click: number, clickTau: number) {
    const sr = this.ctx.sampleRate;
    const n = Math.ceil(dur * sr);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (const m of modes) {
      const w = (2 * Math.PI * m.f) / sr;
      if (m.f > sr * 0.45) continue;
      const ph = Math.random() * Math.PI * 2;
      const end = Math.min(n, Math.ceil(m.tau * 9 * sr));
      for (let i = 0; i < end; i++) d[i] += m.a * Math.exp(-i / (m.tau * sr)) * Math.sin(w * i + ph);
    }
    let prev = 0;
    const cEnd = Math.min(n, Math.ceil(clickTau * 8 * sr));
    for (let i = 0; i < cEnd; i++) {
      const white = Math.random() * 2 - 1;
      d[i] += (white - prev) * click * Math.exp(-i / (clickTau * sr));
      prev = white;
    }
    const attack = Math.ceil(sr * 0.0006);
    for (let i = 0; i < attack; i++) d[i] *= i / attack;
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
    return buf;
  }

  private partials(f0: number, ratios: number[], amps: number[], taus: number[], detune = 0): Mode[] {
    const out: Mode[] = [];
    ratios.forEach((r, k) => {
      const v = 0.85 + Math.random() * 0.3;
      out.push({ f: f0 * r * (1 + (Math.random() - 0.5) * 0.01), a: amps[k] * v, tau: taus[k] * v });
      if (detune && k < 3) out.push({ f: f0 * r * (1 + detune), a: amps[k] * 0.5, tau: taus[k] * 0.9 });
    });
    return out;
  }

  private coinBuffer() {
    const f0 = 2700 + Math.random() * 2200;
    return this.buffer(
      0.9,
      this.partials(f0, [1, 1.46, 2.13, 2.76, 3.58, 4.62], [1, 0.8, 0.6, 0.45, 0.3, 0.2], [0.34, 0.24, 0.17, 0.12, 0.08, 0.05], 0.0045),
      0.35,
      0.0018,
    );
  }

  private glassBuffer() {
    const f0 = 1350 + Math.random() * 1000;
    const glass = this.partials(f0, [1, 2.32, 4.25, 6.63], [1, 0.45, 0.25, 0.12], [0.6, 0.3, 0.16, 0.08], 0.002);
    const coin = this.partials(3200 + Math.random() * 1500, [1, 1.46, 2.13], [0.55, 0.4, 0.3], [0.09, 0.07, 0.05]);
    return this.buffer(1.1, [...glass, ...coin], 0.5, 0.0022);
  }

  private thudBuffer() {
    const f0 = 620 + Math.random() * 320;
    const body = this.partials(f0, [1, 2.8, 5.1], [1, 0.4, 0.2], [0.22, 0.1, 0.05]);
    const coin = this.partials(3000 + Math.random() * 1800, [1, 1.46, 2.13, 2.76], [0.7, 0.5, 0.35, 0.25], [0.16, 0.11, 0.08, 0.06], 0.004);
    return this.buffer(0.9, [...body, ...coin], 0.6, 0.004);
  }

  private impulse(dur: number) {
    const sr = this.ctx.sampleRate;
    const n = Math.ceil(dur * sr);
    const buf = this.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const x = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
        y += (x - y) * (0.65 - 0.5 * t);
        d[i] = y;
      }
      for (let i = 0; i < sr * 0.004; i++) d[i] *= i / (sr * 0.004);
    }
    return buf;
  }
}
