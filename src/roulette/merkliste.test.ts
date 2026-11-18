import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MERKLISTE_KEY, parseMerkliste, readMerkliste } from "./merkliste.ts";

// fixtures/merkliste-valid.json is samples/valid-merkliste.json from Robfreak/consolecheat-ex6 (main).
const valid = readFileSync(new URL("./fixtures/merkliste-valid.json", import.meta.url), "utf8");
const extraFields = readFileSync(new URL("./fixtures/merkliste-extra-fields.json", import.meta.url), "utf8");

test("the key and schema match the Spiele-Merkliste (ex6)", () => {
  assert.equal(MERKLISTE_KEY, "consolecheat-ex6-merkliste-v1");
  const data = JSON.parse(valid);
  assert.equal(data.schema, "consolecheat-ex6-merkliste");
  assert.equal(data.version, 1);
});

test("the real Merkliste sample parses into games with status from the list", () => {
  const result = parseMerkliste(valid);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(
    result.games.map((g) => [g.title, g.status, g.id, g.genre, g.hours]),
    [
      ["God of War", "backlog", "CUSA07408", null, null],
      ["Gran Turismo 7", "playing", "PPSA01317", null, null],
      ["Bloodborne", "completed", "CUSA00207", null, null],
      ["The Last of Us Part II", "wishlist", "CUSA07820", null, null],
    ],
  );
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.counts, { backlog: 1, playing: 1, completed: 1, wishlist: 1 });
});

test("extra fields on an entry (price, playtime) are ignored, not fatal", () => {
  const result = parseMerkliste(extraFields);
  assert.ok(result.ok && result.games.length === 1 && result.games[0]?.title === "God of War");
});

test("corrupt, foreign or wrong-version data is refused with a reason", () => {
  assert.deepEqual(parseMerkliste(null), { ok: false, error: "missing" });
  assert.deepEqual(parseMerkliste("{"), { ok: false, error: "json" });
  assert.deepEqual(parseMerkliste("[]"), { ok: false, error: "shape" });
  assert.deepEqual(parseMerkliste('"x"'), { ok: false, error: "shape" });
  assert.deepEqual(parseMerkliste(JSON.stringify({ schema: "consolecheat-ex1-titles", version: 1, lists: {} })), { ok: false, error: "schema" });
  assert.deepEqual(parseMerkliste(JSON.stringify({ schema: "consolecheat-ex6-merkliste", version: 2, lists: {} })), { ok: false, error: "version" });
  assert.deepEqual(parseMerkliste(JSON.stringify({ schema: "consolecheat-ex6-merkliste", version: 1, lists: [] })), { ok: false, error: "shape" });
});

test("bad entries are skipped and counted; duplicates across lists are kept once", () => {
  const raw = JSON.stringify({
    schema: "consolecheat-ex6-merkliste",
    version: 1,
    lists: {
      backlog: [
        { titleIds: ["CUSA07408"], name: "God of War", note: "" },
        { titleIds: ["CUSA11111"], name: "", note: "" },
        { titleIds: ["CUSA22222"], name: 42, note: "" },
        "nope",
        { titleIds: [], name: "Ohne ID", note: "" },
        { titleIds: ["BAD"], name: "  Leer   zeichen ", note: "" },
      ],
      playing: [{ titleIds: ["CUSA07408"], name: "God of War", note: "doppelt" }],
      completed: "kaputt",
    },
  });
  const result = parseMerkliste(raw);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.games.map((g) => g.title), ["God of War", "Ohne ID", "Leer zeichen"]);
  assert.equal(result.games[1]?.id, "name:ohne id");
  assert.equal(result.skipped, 5);
});

test("reading the Merkliste only calls getItem", () => {
  const calls: string[] = [];
  const storage = {
    getItem(key: string) {
      calls.push(`get:${key}`);
      return valid;
    },
    setItem(key: string) {
      calls.push(`set:${key}`);
    },
    removeItem(key: string) {
      calls.push(`remove:${key}`);
    },
  };
  assert.ok(readMerkliste(storage).ok);
  assert.deepEqual(calls, [`get:${MERKLISTE_KEY}`]);
  const blocked = { getItem: () => { throw new Error("SecurityError"); } };
  assert.deepEqual(readMerkliste(blocked), { ok: false, error: "blocked" });
  assert.deepEqual(readMerkliste(null), { ok: false, error: "blocked" });
});
