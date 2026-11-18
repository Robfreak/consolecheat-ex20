import { cleanText, codePoints, dedupe, GENRE_MAX, isStatus, MAX_GAMES, parseHours, TITLE_MAX, titleKey, type Game } from "./games.ts";
import { MERKLISTE_SCHEMA, parseMerkliste } from "./merkliste.ts";

export const IMPORT_MAX_BYTES = 256 * 1024;
export const MANUAL_MAX_CHARS = 100_000;

export type ImportFormat = "merkliste" | "array";
export type ImportError = "size" | "json" | "format" | "entry" | "empty" | "tooMany" | "merkliste";
export type ImportResult =
  | { ok: true; format: ImportFormat; games: Game[]; duplicates: number }
  | { ok: false; error: ImportError; index?: number };

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** One imported/typed game, or null when the row is invalid. */
export function makeGame(title: unknown, genre: unknown, hours: unknown, status: unknown = undefined): Game | null {
  if (typeof title !== "string") return null;
  const name = cleanText(title);
  if (!name || codePoints(name) > TITLE_MAX) return null;
  let cleanGenre: string | null = null;
  if (genre !== undefined && genre !== null) {
    if (typeof genre !== "string") return null;
    cleanGenre = cleanText(genre) || null;
    if (cleanGenre && codePoints(cleanGenre) > GENRE_MAX) return null;
  }
  const h = parseHours(hours);
  if (h === undefined) return null;
  if (status !== undefined && status !== null && !isStatus(status)) return null;
  return { id: titleKey(name), title: name, genre: cleanGenre, hours: h, status: isStatus(status) ? status : "backlog" };
}

/**
 * JSON import. Accepts
 *  1. the Merkliste's own export (`schema: "consolecheat-ex6-merkliste"`), and
 *  2. a plain array of `{ title, genre?, hours?, status? }`
 *     (also `{ "games": [...] }`). `hours` may be a number or "12 h".
 * Any invalid row rejects the whole file and names its position.
 */
export function parseImport(text: string): ImportResult {
  if (utf8Size(text) > IMPORT_MAX_BYTES) return { ok: false, error: "size" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "json" };
  }
  if (plain(data) && data.schema === MERKLISTE_SCHEMA) {
    const parsed = parseMerkliste(text);
    if (!parsed.ok) return { ok: false, error: "merkliste" };
    if (parsed.games.length === 0) return { ok: false, error: "empty" };
    return { ok: true, format: "merkliste", games: parsed.games, duplicates: parsed.skipped };
  }
  const rows = Array.isArray(data) ? data : plain(data) && Array.isArray(data.games) ? data.games : null;
  if (!rows) return { ok: false, error: "format" };
  if (rows.length === 0) return { ok: false, error: "empty" };
  if (rows.length > MAX_GAMES) return { ok: false, error: "tooMany" };
  const games: Game[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row: unknown = rows[i];
    const game = plain(row) ? makeGame(row.title, row.genre, row.hours, row.status) : null;
    if (!game) return { ok: false, error: "entry", index: i + 1 };
    games.push(game);
  }
  const unique = dedupe(games);
  return { ok: true, format: "array", games: unique, duplicates: games.length - unique.length };
}

export type ManualIssue = { line: number; reason: "title" | "genre" | "hours" | "columns" };
export type ManualResult = { games: Game[]; issues: ManualIssue[]; duplicates: number; tooMany: boolean };

/** One game per line, optionally `Titel | Genre | Stunden`. Blank lines and `#` comments are ignored. */
export function parseManual(text: string): ManualResult {
  const issues: ManualIssue[] = [];
  const games: Game[] = [];
  let tooMany = false;
  const lines = text.slice(0, MANUAL_MAX_CHARS).split(/\r?\n/);
  lines.forEach((line, n) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const parts = trimmed.split("|").map((part) => part.trim());
    if (parts.length > 3) {
      issues.push({ line: n + 1, reason: "columns" });
      return;
    }
    const [title = "", genre = "", hours = ""] = parts;
    if (!title || codePoints(cleanText(title)) > TITLE_MAX) {
      issues.push({ line: n + 1, reason: "title" });
      return;
    }
    if (codePoints(cleanText(genre)) > GENRE_MAX) {
      issues.push({ line: n + 1, reason: "genre" });
      return;
    }
    if (parseHours(hours) === undefined) {
      issues.push({ line: n + 1, reason: "hours" });
      return;
    }
    if (games.length >= MAX_GAMES) {
      tooMany = true;
      return;
    }
    const game = makeGame(title, genre, hours);
    if (game) games.push(game);
  });
  const unique = dedupe(games);
  return { games: unique, issues, duplicates: games.length - unique.length, tooMany };
}
