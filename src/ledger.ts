import { COIN_TYPES, DENOMS, area } from './coins';

// Invariant kept by main.ts: the values of the coins in the jar (plus the ones still queued) add up to the balance.

const value = (type: number) => COIN_TYPES[type].value;

/** Fewest pieces for `amount` (the ruble series is canonical, so greedy is optimal). */
export function greedy(amount: number): number[] {
  const out: number[] = [];
  let rest = Math.max(0, Math.round(amount));
  for (const t of DENOMS) {
    const k = Math.floor(rest / value(t));
    for (let i = 0; i < k; i++) out.push(t);
    rest -= k * value(t);
  }
  return out;
}

export const sumOf = (types: number[]) => types.reduce((s, t) => s + value(t), 0);

/**
 * Which pieces to take out to pay `n`, and which change to put back.
 * `types[i]` is the type of piece i; lucky coins (value 0) are never taken.
 * Returns null when the pieces don't cover `n`.
 */
export function planWithdraw(types: number[], n: number): { take: number[]; change: number[] } | null {
  const order = types
    .map((t, i) => i)
    .filter((i) => value(types[i]) > 0)
    .sort((a, b) => value(types[b]) - value(types[a]));
  if (order.reduce((s, i) => s + value(types[i]), 0) < n) return null;
  const take: number[] = [];
  let rest = n;
  for (const i of order) {
    if (value(types[i]) <= rest) {
      take.push(i);
      rest -= value(types[i]);
    }
  }
  if (rest === 0) return { take, change: [] };
  // every piece left is bigger than the rest: break the smallest one
  const left = order.filter((i) => !take.includes(i));
  const big = left[left.length - 1];
  take.push(big);
  return { take, change: greedy(value(types[big]) - rest) };
}

/**
 * Smallest-first group of pieces that can be re-minted into noticeably fewer/smaller pieces,
 * used when the jar is too full. Returns null when the pile is already compact.
 */
export function planCompact(types: number[]): { take: number[]; mint: number[] } | null {
  const order = types
    .map((t, i) => i)
    .filter((i) => value(types[i]) > 0)
    .sort((a, b) => value(types[a]) - value(types[b]));
  let taken = 0;
  let takenArea = 0;
  for (let k = 0; k < order.length; k++) {
    const t = types[order[k]];
    taken += value(t);
    takenArea += area(COIN_TYPES[t]);
    // only cut between different types, so a group is never split
    if (k + 1 < order.length && types[order[k + 1]] === t) continue;
    const mint = greedy(taken);
    const mintArea = mint.reduce((s, m) => s + area(COIN_TYPES[m]), 0);
    if (k >= 1 && mintArea < takenArea * 0.75) return { take: order.slice(0, k + 1), mint };
  }
  return null;
}
