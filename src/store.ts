/** [coin type, x, y, angle] in virtual jar pixels */
export type SavedCoin = [number, number, number, number];

export interface Bank {
  id: string;
  name: string;
  target: number;
  amount: number;
  coins: SavedCoin[];
  /** rare coins found so far */
  lucky?: number;
  /** highest milestone (percent) already celebrated */
  reached?: number;
  /** a goal photo is stored in IndexedDB under the bank id */
  photo?: boolean;
}

export interface State {
  current: string;
  banks: Bank[];
  theme?: string;
}

const KEY = 'kopilka.v1';

export function freshBank(name = 'Мечта', target = 10000): Bank {
  const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id, name, target, amount: 0, coins: [] };
}

export const MILESTONES = [25, 50, 75, 100];

/** Highest milestone already covered by the current amount. */
export function milestoneFloor(b: Bank) {
  const pct = b.target > 0 ? (b.amount / b.target) * 100 : 0;
  return MILESTONES.filter((m) => pct >= m).pop() ?? 0;
}

export function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as State;
    if (s?.banks?.length) {
      for (const b of s.banks) b.reached ??= milestoneFloor(b);
      if (!s.banks.some((b) => b.id === s.current)) s.current = s.banks[0].id;
      return s;
    }
  } catch {
    /* empty or blocked storage */
  }
  const b = freshBank();
  return { current: b.id, banks: [b] };
}

export function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
