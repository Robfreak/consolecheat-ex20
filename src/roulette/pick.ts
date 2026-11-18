import type { Game } from "./games.ts";

// Fair, seedable selection and the reel strip. No DOM here.

/**
 * Uniform pick from the pool. With more than one game left, the previous pick is
 * excluded so the same game never comes twice in a row.
 */
export function pickGame(pool: readonly Game[], rand: () => number, lastId: string | null): Game | null {
  if (pool.length === 0) return null;
  const eligible = pool.length > 1 && lastId !== null ? pool.filter((g) => g.id !== lastId) : [...pool];
  const list = eligible.length > 0 ? eligible : [...pool];
  const index = Math.min(list.length - 1, Math.floor(rand() * list.length));
  return list[index] ?? null;
}

export const STRIP_LENGTH = 28;

/** Titles the reel passes before it lands; the last one is the pick. */
export function buildStrip(pool: readonly Game[], pick: Game, rand: () => number, length = STRIP_LENGTH): Game[] {
  const strip: Game[] = [];
  for (let i = 0; i < length - 1; i++) {
    let next = pool[Math.floor(rand() * pool.length)] ?? pick;
    // Avoid the same title twice in a row on the reel when there is a choice.
    if (pool.length > 1 && next.id === strip[strip.length - 1]?.id) next = pool[(pool.indexOf(next) + 1) % pool.length] ?? next;
    strip.push(next);
  }
  if (pool.length > 1 && strip[strip.length - 1]?.id === pick.id) {
    strip[strip.length - 1] = pool.find((g) => g.id !== pick.id) ?? pick;
  }
  strip.push(pick);
  return strip;
}

export const SPIN_MS = 3200;
export const REDUCED_SPIN_MS = 0;

/** Ease-out cubic: fast start, slow landing. */
export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Reel position (in items, 0 … strip length − 1) at `elapsed` ms. */
export function reelPosition(elapsed: number, duration: number, items: number): number {
  if (duration <= 0) return items - 1;
  return easeOut(elapsed / duration) * (items - 1);
}

/** Times (ms) at which the reel crosses each item, for the tick sounds. Strictly increasing. */
export function tickTimes(duration: number, items: number): number[] {
  if (duration <= 0 || items < 2) return [];
  const times: number[] = [];
  for (let k = 1; k < items; k++) {
    // Invert easeOut: p = 1 - (1 - t)^3  =>  t = 1 - (1 - p)^(1/3)
    const p = k / (items - 1);
    times.push((1 - Math.cbrt(1 - p)) * duration);
  }
  return times;
}
