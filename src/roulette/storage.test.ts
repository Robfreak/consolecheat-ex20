import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { defaultFilters } from "./filters.ts";
import type { Game } from "./games.ts";
import { MERKLISTE_KEY } from "./merkliste.ts";
import {
  addPick,
  emptyStore,
  HISTORY_MAX,
  LANG_KEY,
  lastPickId,
  loadStore,
  parseStore,
  resetStore,
  saveStore,
  serializeStore,
  settleLatest,
  STORE_KEY,
  THEME_KEY,
  withExtras,
  type Store,
  type StorageLike,
} from "./storage.ts";

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(`set:${key}`);
      data.set(key, String(value));
    },
    removeItem: (key) => {
      writes.push(`remove:${key}`);
      data.delete(key);
    },
  };
  return { storage, data, writes };
}

const hades: Game = { id: "hades", title: "Hades", genre: "Roguelike", hours: 25, status: "backlog" };
const astro: Game = { id: "astro bot", title: "Astro Bot", genre: null, hours: 12, status: "playing" };
const sample: Store = {
  source: "import",
  imported: { name: "liste.json", format: "array", at: "2026-11-18T20:00:00.000Z", games: [hades, astro] },
  manualText: "Elden Ring | RPG | 80",
  extras: { CUSA07408: { genre: "Action", hours: 30 } },
  filters: { excludedGenres: ["rpg"], hours: ["lt5", "unknown"], statuses: ["backlog"] },
  muted: true,
  history: [{ id: "hades", title: "Hades", source: "import", at: "2026-11-18T20:01:00.000Z", outcome: "accepted" }],
};

test("the key is consolecheat-roulette-v1 with schema and version", () => {
  assert.equal(STORE_KEY, "consolecheat-roulette-v1");
  const json = JSON.parse(serializeStore(sample));
  assert.equal(json.schema, "consolecheat-roulette");
  assert.equal(json.version, 1);
});

test("history, filters, lists, extras and mute persist", () => {
  const { storage } = memory();
  assert.equal(saveStore(storage, sample), true);
  assert.deepEqual(loadStore(storage), { store: sample, corrupt: false });
});

test("corrupt or foreign data falls back without throwing", () => {
  for (const raw of ["{", "null", "[]", "7", '{"schema":"consolecheat-roulette","version":2}', '{"schema":"x","version":1}']) {
    assert.deepEqual(parseStore(raw), { store: emptyStore(), corrupt: true }, raw);
  }
  assert.deepEqual(parseStore(null), { store: emptyStore(), corrupt: false });
  const mixed = parseStore(
    JSON.stringify({
      schema: "consolecheat-roulette",
      version: 1,
      source: "elsewhere",
      imported: { name: "x", format: "array", at: "now", games: [{ id: "a", title: "", genre: null, hours: null, status: "backlog" }] },
      manualText: 5,
      extras: { good: { genre: "RPG", hours: 3 }, bad: { genre: 1, hours: null } },
      filters: "nope",
      muted: "yes",
      history: [sample.history[0], { id: "x", title: "X", source: "import", at: "nie", outcome: "accepted" }, null],
    }),
  );
  assert.equal(mixed.corrupt, true);
  assert.equal(mixed.store.source, "merkliste");
  assert.equal(mixed.store.imported, null);
  assert.equal(mixed.store.manualText, "");
  assert.deepEqual(mixed.store.extras, { good: { genre: "RPG", hours: 3 } });
  assert.deepEqual(mixed.store.filters, defaultFilters());
  assert.equal(mixed.store.muted, false);
  assert.deepEqual(mixed.store.history, sample.history);
});

test("a throwing storage does not crash", () => {
  const broken: StorageLike = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("full");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadStore(broken).store, emptyStore());
  assert.equal(saveStore(broken, sample), false);
  assert.equal(resetStore(broken), false);
});

test("reset removes only the roulette key; the Merkliste, language and theme stay", () => {
  const merkliste = '{"schema":"consolecheat-ex6-merkliste","version":1,"lists":{}}';
  const { storage, data } = memory({ [MERKLISTE_KEY]: merkliste, [LANG_KEY]: "en", [THEME_KEY]: "light", "consolecheat-bingo-v1": "{}" });
  saveStore(storage, sample);
  assert.equal(resetStore(storage), true);
  assert.equal(data.has(STORE_KEY), false);
  assert.equal(data.get(MERKLISTE_KEY), merkliste);
  assert.deepEqual([...data.keys()].sort(), ["consolecheat-bingo-v1", MERKLISTE_KEY, "consolecheat-lang", "consolecheat-theme"].sort());
});

test("the Merkliste key is never written: saving and resetting touch only the own key", () => {
  const { storage, writes } = memory();
  saveStore(storage, sample);
  saveStore(storage, emptyStore());
  resetStore(storage);
  assert.deepEqual(writes, [`set:${STORE_KEY}`, `set:${STORE_KEY}`, `remove:${STORE_KEY}`]);
  // No source file writes or removes the Merkliste key, or clears storage.
  const dir = new URL("./", import.meta.url);
  for (const name of readdirSync(dir)) {
    if (!/\.(ts|tsx)$/.test(name) || name.endsWith(".test.ts")) continue;
    const source = readFileSync(new URL(name, dir), "utf8");
    assert.doesNotMatch(source, /(setItem|removeItem)\(\s*MERKLISTE_KEY/, name);
    assert.doesNotMatch(source, /(setItem|removeItem)\(\s*["'`]consolecheat-ex6/, name);
    assert.doesNotMatch(source, /localStorage\.clear\(/, name);
  }
});

test("picks: newest first, an open pick becomes rerolled, accept settles, capped", () => {
  let store = addPick(emptyStore(), hades, "manual", new Date("2026-11-18T20:00:00Z"));
  assert.equal(store.history[0]?.outcome, "open");
  store = addPick(store, astro, "manual", new Date("2026-11-18T20:01:00Z"));
  assert.deepEqual(store.history.map((h) => [h.title, h.outcome]), [["Astro Bot", "open"], ["Hades", "rerolled"]]);
  store = settleLatest(store, "accepted");
  assert.equal(store.history[0]?.outcome, "accepted");
  assert.equal(settleLatest(store, "rerolled"), store, "only an open pick can be settled");
  assert.equal(lastPickId(store, "manual"), "astro bot");
  assert.equal(lastPickId(store, "import"), null);
  for (let i = 0; i < 80; i++) store = addPick(store, hades, "manual", new Date());
  assert.equal(store.history.length, HISTORY_MAX);
});

test("Merkliste games take genre and hours from the own extras", () => {
  const game: Game = { id: "CUSA07408", title: "God of War", genre: null, hours: null, status: "backlog" };
  assert.deepEqual(withExtras([game], sample.extras), [{ ...game, genre: "Action", hours: 30 }]);
  assert.deepEqual(withExtras([game], {}), [game]);
});
