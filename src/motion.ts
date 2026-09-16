export interface Vec {
  x: number;
  y: number;
}

const EARTH = 9.81;

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * Effective gravity inside the jar in screen coordinates (y down, m/s^2).
 * In the jar frame the felt gravity is -accelerationIncludingGravity, so tilt and shake come for free.
 */
export class Motion {
  gravity: Vec = { x: 0, y: EARTH };
  listening = false;
  /** desktop fallback, radians */
  tilt = 0;
  onShake?: (power: number) => void;

  private raw: Vec = { x: 0, y: EARTH };
  private lp: Vec = { x: 0, y: EARTH };
  private lastEvent = 0;
  private lastShake = 0;
  private beta: number | null = null;
  private votes = 0;
  private sign = 1;

  static needsPermission() {
    return typeof (window.DeviceMotionEvent as unknown as PermissionApi)?.requestPermission === 'function';
  }

  get active() {
    return this.listening && performance.now() - this.lastEvent < 600;
  }

  async enable(): Promise<boolean> {
    if (!('DeviceMotionEvent' in window)) return false;
    try {
      const dm = window.DeviceMotionEvent as unknown as PermissionApi;
      if (dm.requestPermission && (await dm.requestPermission()) !== 'granted') return false;
      const dor = window.DeviceOrientationEvent as unknown as PermissionApi | undefined;
      if (dor?.requestPermission) await dor.requestPermission().catch(() => 'denied');
    } catch {
      return false;
    }
    if (!this.listening) {
      window.addEventListener('devicemotion', this.handleMotion);
      window.addEventListener('deviceorientation', this.handleOrientation);
      this.listening = true;
    }
    return true;
  }

  disable() {
    window.removeEventListener('devicemotion', this.handleMotion);
    window.removeEventListener('deviceorientation', this.handleOrientation);
    this.listening = false;
  }

  update(dt: number) {
    if (this.active) {
      const k = 1 - Math.exp(-dt * 10);
      this.lp.x += (this.raw.x - this.lp.x) * k;
      this.lp.y += (this.raw.y - this.lp.y) * k;
      const shakeGain = 1.8;
      let gx = this.lp.x + (this.raw.x - this.lp.x) * shakeGain;
      let gy = this.lp.y + (this.raw.y - this.lp.y) * shakeGain;
      // Phone lying flat: in-plane gravity vanishes, keep a soft "down" so coins still settle.
      const m = Math.hypot(this.lp.x, this.lp.y);
      if (m < 4) {
        const w = (1 - m / 4) * 0.7;
        gx *= 1 - w;
        gy = gy * (1 - w) + EARTH * w;
      }
      const mag = Math.hypot(gx, gy);
      const max = EARTH * 4;
      if (mag > max) {
        gx *= max / mag;
        gy *= max / mag;
      }
      this.gravity = { x: gx, y: gy };
    } else {
      this.gravity = { x: Math.sin(this.tilt) * EARTH, y: Math.cos(this.tilt) * EARTH };
    }
  }

  private handleOrientation = (e: DeviceOrientationEvent) => {
    this.beta = e.beta;
  };

  private handleMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null) return;
    this.lastEvent = performance.now();

    const deg = screen.orientation?.angle ?? Number((window as unknown as { orientation?: number }).orientation ?? 0);
    const ang = (deg * Math.PI) / 180;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const sx = a.x * c - a.y * s;
    const sy = a.x * s + a.y * c;

    // Some older WebKit builds report the opposite sign; vote against the orientation sensor.
    if (this.beta != null && deg === 0 && Math.abs(a.y) > 5 && Math.abs(this.beta) > 40 && Math.abs(this.beta) < 140) {
      const expected = Math.sign(Math.sin((this.beta * Math.PI) / 180));
      this.votes = Math.max(-30, Math.min(30, this.votes + (Math.sign(a.y) === expected ? 1 : -1)));
      this.sign = this.votes < -10 ? -1 : 1;
    }

    this.raw = { x: -sx * this.sign, y: sy * this.sign };

    const la = e.acceleration;
    if (la && la.x != null && la.y != null) {
      const mag = Math.hypot(la.x, la.y, la.z ?? 0);
      const now = performance.now();
      if (mag > 13 && now - this.lastShake > 220) {
        this.lastShake = now;
        this.onShake?.(Math.min(1, (mag - 13) / 22));
      }
    }
  };
}
