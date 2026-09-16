import { JAR, outline, tracePath } from './jar';
import { JAR_PAD, JAR_TEX_H, JAR_TEX_W } from './paint';

// Goal photos live in IndexedDB: localStorage is too small for images.
const DB_NAME = 'kopilka';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export const getPhoto = (id: string) => run<Blob>('readonly', (s) => s.get(id));
export const putPhoto = (id: string, blob: Blob) => run('readwrite', (s) => s.put(blob, id));
export const deletePhoto = (id: string) => run('readwrite', (s) => s.delete(id));

/** Downscales a picked image to keep storage small; orientation comes from EXIF. */
export async function importPhoto(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85));
}

export const loadBitmap = (blob: Blob) => createImageBitmap(blob);

const REGION = { x: JAR.GLASS, y: JAR.LID, w: JAR.W - 2 * JAR.GLASS, h: JAR.H - JAR.LID - JAR.GLASS };

/**
 * The goal photo inside the glass, in jar texture space. `p` is progress 0..1:
 * at 0 it is a dark, grey, heavily blurred smudge, at 1 it is sharp and in full colour.
 * Blur is done by downscaling and smooth upscaling, which works everywhere (ctx.filter does not).
 */
export function drawReveal(img: ImageBitmap, p: number, res: number) {
  const c = document.createElement('canvas');
  c.width = Math.round(JAR_TEX_W * res);
  c.height = Math.round(JAR_TEX_H * res);
  const ctx = c.getContext('2d')!;

  const rw = Math.max(1, Math.round(REGION.w * res));
  const rh = Math.max(1, Math.round(REGION.h * res));
  const scale = Math.max(rw / img.width, rh / img.height);
  const sw = rw / scale;
  const sh = rh / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;

  const blur = 1 + 34 * Math.pow(1 - Math.min(1, p), 1.6);
  let w = Math.max(2, Math.round(rw / blur));
  let h = Math.max(2, Math.round(rh / blur));
  let cur = document.createElement('canvas');
  cur.width = w;
  cur.height = h;
  let cctx = cur.getContext('2d')!;
  cctx.imageSmoothingQuality = 'high';
  cctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  while (w < rw || h < rh) {
    const nw = Math.min(rw, w * 2);
    const nh = Math.min(rh, h * 2);
    const next = document.createElement('canvas');
    next.width = nw;
    next.height = nh;
    cctx = next.getContext('2d')!;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(cur, 0, 0, nw, nh);
    cur = next;
    w = nw;
    h = nh;
  }

  ctx.scale(res, res);
  ctx.translate(JAR_PAD, JAR_PAD);
  tracePath(ctx, outline(JAR.GLASS), true);
  ctx.clip();
  ctx.drawImage(cur, REGION.x, REGION.y, REGION.w, REGION.h);

  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = Math.max(0, 0.8 - p * 0.95);
  ctx.fillStyle = '#808080';
  ctx.fillRect(REGION.x, REGION.y, REGION.w, REGION.h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  ctx.fillStyle = `rgba(14,8,4,${0.08 + 0.3 * (1 - p)})`;
  ctx.fillRect(REGION.x, REGION.y, REGION.w, REGION.h);

  const cx = JAR.W / 2;
  const cy = JAR.H * 0.6;
  const g = ctx.createRadialGradient(cx, cy, JAR.W * 0.25, cx, cy, JAR.H * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(10,5,2,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(REGION.x, REGION.y, REGION.w, REGION.h);
  return c;
}
