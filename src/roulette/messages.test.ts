import assert from "node:assert/strict";
import test from "node:test";
import { copy, fill, initialLang } from "./messages.ts";

function shape(value: unknown, path = ""): string[] {
  if (typeof value === "string") return [path];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => shape(child, `${path}.${key}`));
}

function get(root: unknown, path: string): string {
  return path
    .split(".")
    .slice(1)
    .reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], root) as string;
}

test("German and English have the same keys and no empty strings", () => {
  assert.deepEqual(shape(copy.de).sort(), shape(copy.en).sort());
  for (const lang of ["de", "en"] as const) for (const path of shape(copy[lang])) assert.ok(get(copy[lang], path).trim().length > 0, `${lang}${path}`);
});

test("placeholders match between languages", () => {
  const holes = (s: string) => (s.match(/\{[A-Za-z0-9]+\}/g) ?? []).sort();
  for (const path of shape(copy.de)) assert.deepEqual(holes(get(copy.de, path)), holes(get(copy.en, path)), path);
});

test("German is the default and the key copy is present", () => {
  assert.equal(initialLang(null), "de");
  assert.equal(initialLang("en"), "en");
  assert.equal(initialLang("xx"), "de");
  assert.match(copy.de.storageNote, /consolecheat-roulette-v1/);
  assert.match(copy.de.storageNote, /consolecheat-ex6-merkliste-v1.*nur gelesen/);
  assert.match(copy.en.storageNote, /only read/);
  assert.match(copy.de.deleteAsk, /consolecheat-roulette-v1/);
  assert.match(copy.de.deleteAsk, /Merkliste/);
  assert.equal(copy.de.statuses.playing, "Spiele ich gerade");
  assert.equal(fill(copy.de.result, { title: "Hades" }), "Gezogen: Hades");
});
