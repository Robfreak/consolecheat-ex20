import assert from "node:assert/strict";
import test from "node:test";
import { applyFilters, defaultFilters, genresOf, hourRange, isDefault, NO_GENRE, parseFilters } from "./filters.ts";
import type { Game } from "./games.ts";

const g = (title: string, genre: string | null, hours: number | null, status: Game["status"] = "backlog"): Game => ({
  id: title.toLowerCase(),
  title,
  genre,
  hours,
  status,
});
const games = [
  g("Hades", "Roguelike", 25),
  g("Dead Cells", "roguelike", 4),
  g("Elden Ring", "RPG", 80),
  g("Astro Bot", "Jump 'n' Run", 12, "playing"),
  g("Tetris", null, null),
  g("Bloodborne", "RPG", 40, "completed"),
  g("Wunsch", "RPG", 5, "wishlist"),
];

test("playtime ranges: <5, 5–20, 20–60, 60+, unknown", () => {
  assert.deepEqual([0, 4.9, 5, 19.9, 20, 59.9, 60, 500, null].map(hourRange), ["lt5", "lt5", "5to20", "5to20", "20to60", "20to60", "60plus", "60plus", "unknown"]);
});

test("genres come from the data, case-insensitive, with 'no genre' last", () => {
  const list = genresOf(games);
  assert.deepEqual(list.map((x) => [x.key, x.count]), [["jump 'n' run", 1], ["roguelike", 2], ["rpg", 3], [NO_GENRE, 1]]);
});

test("default filters: backlog and playing, every genre and playtime", () => {
  assert.deepEqual(applyFilters(games, defaultFilters()).map((x) => x.title), ["Hades", "Dead Cells", "Elden Ring", "Astro Bot", "Tetris"]);
  assert.ok(isDefault(defaultFilters()));
});

test("genre, playtime and status filters combine", () => {
  const f = { ...defaultFilters(), excludedGenres: ["rpg", NO_GENRE] };
  assert.deepEqual(applyFilters(games, f).map((x) => x.title), ["Hades", "Dead Cells", "Astro Bot"]);
  const short = { ...defaultFilters(), hours: ["lt5" as const, "unknown" as const] };
  assert.deepEqual(applyFilters(games, short).map((x) => x.title), ["Dead Cells", "Tetris"]);
  const done = { ...defaultFilters(), statuses: ["completed" as const, "wishlist" as const] };
  assert.deepEqual(applyFilters(games, done).map((x) => x.title), ["Bloodborne", "Wunsch"]);
  assert.equal(isDefault(done), false);
});

test("filters that leave nothing give an empty pool", () => {
  assert.deepEqual(applyFilters(games, { ...defaultFilters(), hours: [] }), []);
  assert.deepEqual(applyFilters(games, { ...defaultFilters(), statuses: [] }), []);
  assert.deepEqual(applyFilters(games, { ...defaultFilters(), excludedGenres: ["roguelike", "rpg", "jump 'n' run", NO_GENRE] }), []);
  assert.deepEqual(applyFilters([], defaultFilters()), []);
});

test("stored filters are validated", () => {
  assert.equal(parseFilters(null), null);
  assert.equal(parseFilters({ hours: [] }), null);
  assert.deepEqual(parseFilters({ excludedGenres: ["rpg", 3, "rpg"], hours: ["lt5", "bogus"], statuses: ["playing", "x"] }), {
    excludedGenres: ["rpg"],
    hours: ["lt5"],
    statuses: ["playing"],
  });
});
