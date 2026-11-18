import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHours } from "./games.ts";
import { IMPORT_MAX_BYTES, parseImport, parseManual } from "./importer.ts";

const merklisteExport = readFileSync(new URL("./fixtures/merkliste-valid.json", import.meta.url), "utf8");

test("the Merkliste's own export format imports", () => {
  const result = parseImport(merklisteExport);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.format, "merkliste");
  assert.equal(result.games.length, 4);
  assert.deepEqual(result.games.map((g) => g.status), ["backlog", "playing", "completed", "wishlist"]);
});

test("a simple array of {title, genre?, hours?} imports, also wrapped in {games}", () => {
  const rows = [
    { title: "Hades", genre: "Roguelike", hours: 25 },
    { title: "Astro Bot", hours: "12 h" },
    { title: "Elden Ring", genre: "RPG", hours: "80,5", status: "playing" },
    { title: "hades", genre: "Doppelt" },
  ];
  for (const text of [JSON.stringify(rows), JSON.stringify({ games: rows })]) {
    const result = parseImport(text);
    assert.ok(result.ok, text);
    if (!result.ok) continue;
    assert.equal(result.format, "array");
    assert.equal(result.duplicates, 1);
    assert.deepEqual(
      result.games.map((g) => [g.title, g.genre, g.hours, g.status]),
      [
        ["Hades", "Roguelike", 25, "backlog"],
        ["Astro Bot", null, 12, "backlog"],
        ["Elden Ring", "RPG", 80.5, "playing"],
      ],
    );
  }
});

test("invalid imports are refused and name the bad entry", () => {
  assert.deepEqual(parseImport("{nope"), { ok: false, error: "json" });
  assert.deepEqual(parseImport('{"foo": 1}'), { ok: false, error: "format" });
  assert.deepEqual(parseImport("[]"), { ok: false, error: "empty" });
  assert.deepEqual(parseImport('[{"title":"A"},{"name":"B"}]'), { ok: false, error: "entry", index: 2 });
  assert.deepEqual(parseImport('[{"title":"A","hours":-3}]'), { ok: false, error: "entry", index: 1 });
  assert.deepEqual(parseImport('[{"title":"A","hours":"viel"}]'), { ok: false, error: "entry", index: 1 });
  assert.deepEqual(parseImport(`[{"title":"A","genre":"${"g".repeat(41)}"}]`), { ok: false, error: "entry", index: 1 });
  assert.deepEqual(parseImport('[{"title":"A","status":"irgendwas"}]'), { ok: false, error: "entry", index: 1 });
  assert.deepEqual(parseImport(`[{"title":"${"t".repeat(201)}"}]`), { ok: false, error: "entry", index: 1 });
  assert.deepEqual(parseImport('["Hades"]'), { ok: false, error: "entry", index: 1 });
  assert.deepEqual(parseImport(JSON.stringify(Array.from({ length: 2001 }, (_, i) => ({ title: `G${i}` })))), { ok: false, error: "tooMany" });
  assert.deepEqual(parseImport(" ".repeat(IMPORT_MAX_BYTES + 1)), { ok: false, error: "size" });
  assert.deepEqual(parseImport(JSON.stringify({ schema: "consolecheat-ex6-merkliste", version: 9, lists: {} })), { ok: false, error: "merkliste" });
});

test("manual lines: title, optional genre and hours; issues name the line", () => {
  const text = [
    "Hades | Roguelike | 25",
    "",
    "# Kommentar",
    "Astro Bot | | 12 h",
    "Elden Ring",
    "  Celeste |Plattformer|  ",
    "Kaputt | RPG | viel",
    " | RPG | 3",
    "A | B | 1 | zu viel",
    "hades",
    "Persona 5 | JRPG | 100 Stunden",
  ].join("\n");
  const result = parseManual(text);
  assert.deepEqual(
    result.games.map((g) => [g.title, g.genre, g.hours]),
    [
      ["Hades", "Roguelike", 25],
      ["Astro Bot", null, 12],
      ["Elden Ring", null, null],
      ["Celeste", "Plattformer", null],
      ["Persona 5", "JRPG", 100],
    ],
  );
  assert.deepEqual(result.issues, [
    { line: 7, reason: "hours" },
    { line: 8, reason: "title" },
    { line: 9, reason: "columns" },
  ]);
  assert.equal(result.duplicates, 1);
  assert.deepEqual(parseManual("").games, []);
});

test("hours accept common spellings and refuse nonsense", () => {
  assert.equal(parseHours("12"), 12);
  assert.equal(parseHours("12,5"), 12.5);
  assert.equal(parseHours("3.5h"), 3.5);
  assert.equal(parseHours("40 Std."), 40);
  assert.equal(parseHours("2 hours"), 2);
  assert.equal(parseHours(""), null);
  assert.equal(parseHours(null), null);
  assert.equal(parseHours("-1"), undefined);
  assert.equal(parseHours("zwölf"), undefined);
  assert.equal(parseHours(Number.NaN), undefined);
  assert.equal(parseHours(20000), undefined);
});
