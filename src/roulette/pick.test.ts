import assert from "node:assert/strict";
import test from "node:test";
import type { Game } from "./games.ts";
import { buildStrip, easeOut, pickGame, reelPosition, STRIP_LENGTH, tickTimes } from "./pick.ts";
import { mulberry32 } from "./prng.ts";

const pool: Game[] = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, title: `Spiel ${i}`, genre: null, hours: null, status: "backlog" }));

test("the same seed gives the same picks and the same reel", () => {
  const run = (seed: number) => {
    const rand = mulberry32(seed);
    const picks: string[] = [];
    let last: string | null = null;
    for (let i = 0; i < 20; i++) {
      const pick = pickGame(pool, rand, last);
      assert.ok(pick);
      picks.push(pick.id);
      last = pick.id;
    }
    return picks;
  };
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
  const a = buildStrip(pool, pool[2] as Game, mulberry32(7));
  const b = buildStrip(pool, pool[2] as Game, mulberry32(7));
  assert.deepEqual(a, b);
  assert.equal(a.length, STRIP_LENGTH);
  assert.equal(a.at(-1)?.id, "g2");
  assert.notEqual(a.at(-2)?.id, "g2");
});

test("never the same game twice in a row while more than one remains", () => {
  const rand = mulberry32(1);
  let last: string | null = null;
  for (let i = 0; i < 2000; i++) {
    const pick = pickGame(pool, rand, last);
    assert.notEqual(pick?.id, last);
    last = pick?.id ?? null;
  }
  // Two games: strictly alternating.
  const two = pool.slice(0, 2);
  assert.equal(pickGame(two, () => 0.99, "g0")?.id, "g1");
  assert.equal(pickGame(two, () => 0, "g1")?.id, "g0");
  // One game: it may repeat. Empty: nothing.
  assert.equal(pickGame(pool.slice(0, 1), () => 0.5, "g0")?.id, "g0");
  assert.equal(pickGame([], () => 0.5, null), null);
  // A last pick that is not in the pool does not shrink the pool.
  assert.equal(pickGame(pool, () => 0.999, "zzz")?.id, "g5");
});

test("the pick is fair: every eligible game about equally often", () => {
  const rand = mulberry32(2026);
  const counts = new Map<string, number>();
  const n = 60000;
  for (let i = 0; i < n; i++) {
    const id = pickGame(pool, rand, null)?.id ?? "";
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  assert.equal(counts.size, pool.length);
  for (const count of counts.values()) assert.ok(Math.abs(count / n - 1 / 6) < 0.01, String(count));
  // With a last pick, the other five share evenly.
  const rest = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const id = pickGame(pool, rand, "g0")?.id ?? "";
    rest.set(id, (rest.get(id) ?? 0) + 1);
  }
  assert.equal(rest.has("g0"), false);
  for (const count of rest.values()) assert.ok(Math.abs(count / n - 1 / 5) < 0.01, String(count));
});

test("the reel eases out and ticks once per item, slowing down", () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.equal(reelPosition(0, 1000, 10), 0);
  assert.equal(reelPosition(1000, 1000, 10), 9);
  assert.equal(reelPosition(5, 0, 10), 9, "no duration: land at once");
  const ticks = tickTimes(3000, 28);
  assert.equal(ticks.length, 27);
  for (let i = 1; i < ticks.length; i++) assert.ok((ticks[i] ?? 0) > (ticks[i - 1] ?? 0));
  const gaps = ticks.map((t, i) => t - (ticks[i - 1] ?? 0));
  assert.ok((gaps.at(-1) ?? 0) > (gaps[1] ?? 0) * 5, "later ticks are further apart");
  assert.ok(Math.abs((ticks.at(-1) ?? 0) - 3000) < 1e-6);
  assert.deepEqual(tickTimes(0, 28), []);
});
