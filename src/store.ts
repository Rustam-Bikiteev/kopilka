/** [coin type, x, y, angle] in virtual jar pixels */
export type SavedCoin = [number, number, number, number];

export interface Bank {
  id: string;
  name: string;
  target: number;
  amount: number;
  coins: SavedCoin[];
}

export interface State {
  current: string;
  banks: Bank[];
}

const KEY = 'kopilka.v1';

export function freshBank(): Bank {
  return { id: 'main', name: 'Мечта', target: 10000, amount: 0, coins: [] };
}

export function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as State;
    if (s?.banks?.length) return s;
  } catch {
    /* empty or blocked storage */
  }
  return { current: 'main', banks: [freshBank()] };
}

export function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
