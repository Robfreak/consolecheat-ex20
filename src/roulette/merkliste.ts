import { cleanText, codePoints, dedupe, MAX_GAMES, STATUSES, TITLE_MAX, type Game } from "./games.ts";

// Read-only view of the Spiele-Merkliste (consolecheat-ex6). Same origin
// (robfreak.github.io), so its localStorage key is readable here. This module only
// ever calls getItem on that key; nothing in this tool writes it.

export const MERKLISTE_KEY = "consolecheat-ex6-merkliste-v1";
export const MERKLISTE_SCHEMA = "consolecheat-ex6-merkliste";
export const MERKLISTE_VERSION = 1;
export const MERKLISTE_URL = "https://robfreak.github.io/consolecheat-ex6/";
const TITLE_ID = /^(CUSA|PPSA)\d{5}$/;

export type MerklisteError = "missing" | "blocked" | "json" | "schema" | "version" | "shape";
export type MerklisteResult =
  | { ok: true; games: Game[]; skipped: number; counts: Record<(typeof STATUSES)[number], number> }
  | { ok: false; error: MerklisteError };

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses the Merkliste file: `{ schema, version: 1, lists: { backlog, playing, completed,
 * wishlist } }`, each list an array of `{ titleIds: string[], name, note }`.
 * Tolerant per entry (a bad entry is skipped and counted), strict on schema and version.
 * The Merkliste has no genre or playtime, so those start empty.
 */
export function parseMerkliste(raw: string | null): MerklisteResult {
  if (raw === null) return { ok: false, error: "missing" };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "json" };
  }
  if (!plain(data)) return { ok: false, error: "shape" };
  if (data.schema !== MERKLISTE_SCHEMA) return { ok: false, error: "schema" };
  if (data.version !== MERKLISTE_VERSION) return { ok: false, error: "version" };
  if (!plain(data.lists)) return { ok: false, error: "shape" };
  const games: Game[] = [];
  const counts = { backlog: 0, playing: 0, completed: 0, wishlist: 0 };
  let skipped = 0;
  const ids = new Set<string>();
  for (const status of STATUSES) {
    const rows = data.lists[status];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      skipped++;
      continue;
    }
    for (const row of rows) {
      if (games.length >= MAX_GAMES) {
        skipped++;
        continue;
      }
      if (!plain(row) || typeof row.name !== "string") {
        skipped++;
        continue;
      }
      const title = cleanText(row.name);
      if (!title || codePoints(title) > TITLE_MAX) {
        skipped++;
        continue;
      }
      const titleIds = Array.isArray(row.titleIds) ? row.titleIds.filter((id): id is string => typeof id === "string" && TITLE_ID.test(id)) : [];
      // The same game in two lists (or twice) is counted once, first list wins.
      if (titleIds.some((id) => ids.has(id))) {
        skipped++;
        continue;
      }
      for (const id of titleIds) ids.add(id);
      games.push({ id: titleIds[0] ?? `name:${title.toLocaleLowerCase("de")}`, title, genre: null, hours: null, status });
      counts[status]++;
    }
  }
  const unique = dedupe(games);
  return { ok: true, games: unique, skipped: skipped + games.length - unique.length, counts };
}

/** Reads the Merkliste key. getItem only, never setItem or removeItem. */
export function readMerkliste(storage: Pick<Storage, "getItem"> | null): MerklisteResult {
  if (!storage) return { ok: false, error: "blocked" };
  let raw: string | null;
  try {
    raw = storage.getItem(MERKLISTE_KEY);
  } catch {
    return { ok: false, error: "blocked" };
  }
  return parseMerkliste(raw);
}
