// Jar geometry in virtual pixels, y pointing down, origin at the top-left of the lid row.
export const JAR = {
  W: 300,
  H: 470,
  LID: 40, // lid bottom edge = top of the glass
  NECK_B: 92, // neck bottom, shoulders start here
  NL: 58, // neck left x
  SH: 168, // shoulder end, straight wall starts here
  CR: 48, // bottom corner radius
  GLASS: 7, // wall thickness
};
export const NR = JAR.W - JAR.NL;

export type Pt = [number, number];

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number, out: Pt[]) {
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
}

/** Jar silhouette inset by `i`: from the top-left of the neck, around the bottom, to the top-right. */
export function outline(i: number): Pt[] {
  const { W, H, LID, NECK_B, NL, SH, CR } = JAR;
  const left: Pt[] = [[NL + i, LID], [NL + i, NECK_B]];
  cubic([NL + i, NECK_B], [NL + i, NECK_B + 38], [i, SH - 46], [i, SH], 14, left);
  left.push([i, H - CR]);
  const r = CR - i;
  for (let k = 1; k <= 14; k++) {
    const a = Math.PI - (k / 14) * (Math.PI / 2);
    left.push([CR + r * Math.cos(a), H - CR + r * Math.sin(a)]);
  }
  left.push([W / 2, H - i]);
  const right = left.slice(0, -1).reverse().map(([x, y]) => [W - x, y] as Pt);
  return [...left, ...right];
}

export function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[], close: boolean) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
  if (close) ctx.closePath();
}
