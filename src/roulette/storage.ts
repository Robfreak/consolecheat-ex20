import { cleanText, codePoints, GENRE_MAX, isStatus, MAX_GAMES, parseHours, TITLE_MAX, type Game, type Source } from "./games.ts";
import { defaultFilters, parseFilters, type Filters } from "./filters.ts";

// Own data under one key. The Merkliste key (consolecheat-ex6-merkliste-v1) is read
// elsewhere and is never written by this tool.

export const STORE_KEY = "consolecheat-roulette-v1";
export const LANG_KEY = "consolecheat-lang";
export const THEME_KEY = "consolecheat-theme";
export const SCHEMA = "consolecheat-roulette";
export const VERSION = 1;
export const HISTORY_MAX = 50;
export const EXTRAS_MAX = 2000;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Outcome = "open" | "accepted" | "rerolled";
export type HistoryEntry = { id: string; title: string; source: Source; at: string; outcome: Outcome };
export type Extra = { genre: string | null; hours: number | null };
export type Imported = { name: string; format: "merkliste" | "array"; at: string; games: Game[] };

export type Store = {
  source: Source;
  imported: Imported | null;
  manualText: string;
  extras: Record<string, Extra>;
  filters: Filters;
  muted: boolean;
  history: HistoryEntry[];
};
export type LoadResult = { store: Store; corrupt: boolean };

export function emptyStore(): Store {
  return { source: "merkliste", imported: null, manualText: "", extras: {}, filters: defaultFilters(), muted: false, history: [] };
}

const SOURCES: readonly Source[] = ["merkliste", "import", "manual"];
const OUTCOMES: readonly Outcome[] = ["open", "accepted", "rerolled"];

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGame(value: unknown): Game | null {
  if (!plain(value)) return null;
  const { id, title, genre, hours, status } = value;
  if (typeof id !== "string" || id.length > 260 || typeof title !== "string") return null;
  const t = cleanText(title);
  if (!t || codePoints(t) > TITLE_MAX) return null;
  if (genre !== null && (typeof genre !== "string" || codePoints(genre) > GENRE_MAX)) return null;
  const h = parseHours(hours);
  if (h === undefined || (hours !== null && typeof hours !== "number")) return null;
  if (!isStatus(status)) return null;
  return { id, title: t, genre: genre ? cleanText(genre) || null : null, hours: h, status };
}

function parseExtra(value: unknown): Extra | null {
  if (!plain(value)) return null;
  const genre = value.genre;
  if (genre !== null && (typeof genre !== "string" || codePoints(genre) > GENRE_MAX)) return null;
  const hours = value.hours === null ? null : typeof value.hours === "number" ? parseHours(value.hours) : undefined;
  if (hours === undefined) return null;
  return { genre: genre ? cleanText(genre) || null : null, hours };
}

function parseHistory(value: unknown): HistoryEntry | null {
  if (!plain(value)) return null;
  const { id, title, source, at, outcome } = value;
  if (typeof id !== "string" || typeof title !== "string" || codePoints(title) > TITLE_MAX) return null;
  if (!SOURCES.includes(source as Source) || !OUTCOMES.includes(outcome as Outcome)) return null;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return { id, title, source: source as Source, at, outcome: outcome as Outcome };
}

/** Never throws. Unknown schema/version or broken JSON gives an empty store flagged corrupt; bad parts are skipped. */
export function parseStore(raw: string | null): LoadResult {
  if (raw === null) return { store: emptyStore(), corrupt: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { store: emptyStore(), corrupt: true };
  }
  if (!plain(data) || data.schema !== SCHEMA || data.version !== VERSION) return { store: emptyStore(), corrupt: true };
  const store = emptyStore();
  let corrupt = false;
  if (SOURCES.includes(data.source as Source)) store.source = data.source as Source;
  else corrupt = true;
  if (data.imported != null) {
    const imp = data.imported;
    if (
      plain(imp) &&
      typeof imp.name === "string" &&
      (imp.format === "merkliste" || imp.format === "array") &&
      typeof imp.at === "string" &&
      Array.isArray(imp.games) &&
      imp.games.length <= MAX_GAMES
    ) {
      const games = imp.games.map(parseGame);
      if (games.every(Boolean)) store.imported = { name: imp.name.slice(0, 120), format: imp.format, at: imp.at, games: games as Game[] };
      else corrupt = true;
    } else corrupt = true;
  }
  if (typeof data.manualText === "string") store.manualText = data.manualText.slice(0, 100_000);
  else if (data.manualText !== undefined) corrupt = true;
  if (plain(data.extras)) {
    for (const [id, value] of Object.entries(data.extras).slice(0, EXTRAS_MAX)) {
      const extra = parseExtra(value);
      if (extra) store.extras[id] = extra;
      else corrupt = true;
    }
  } else if (data.extras !== undefined) corrupt = true;
  const filters = parseFilters(data.filters);
  if (filters) store.filters = filters;
  else if (data.filters !== undefined) corrupt = true;
  if (typeof data.muted === "boolean") store.muted = data.muted;
  if (Array.isArray(data.history)) {
    for (const item of data.history.slice(0, HISTORY_MAX)) {
      const entry = parseHistory(item);
      if (entry) store.history.push(entry);
      else corrupt = true;
    }
  } else if (data.history !== undefined) corrupt = true;
  return { store, corrupt };
}

export function serializeStore(store: Store): string {
  return JSON.stringify({ schema: SCHEMA, version: VERSION, ...store });
}

export function loadStore(local: StorageLike): LoadResult {
  try {
    return parseStore(local.getItem(STORE_KEY));
  } catch {
    return { store: emptyStore(), corrupt: false };
  }
}

/** Writes only STORE_KEY. */
export function saveStore(local: StorageLike, store: Store): boolean {
  try {
    local.setItem(STORE_KEY, serializeStore(store));
    return true;
  } catch {
    return false;
  }
}

/** Removes only this tool's key: not the Merkliste, not language or theme. */
export function resetStore(local: StorageLike): boolean {
  try {
    local.removeItem(STORE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Adds a landed pick; an earlier open pick counts as rerolled. Newest first, capped. */
export function addPick(store: Store, game: Game, source: Source, at: Date): Store {
  const history = store.history.map((entry) => (entry.outcome === "open" ? { ...entry, outcome: "rerolled" as const } : entry));
  const entry: HistoryEntry = { id: game.id, title: game.title, source, at: at.toISOString(), outcome: "open" };
  return { ...store, history: [entry, ...history].slice(0, HISTORY_MAX) };
}

export function settleLatest(store: Store, outcome: "accepted" | "rerolled"): Store {
  const [first, ...rest] = store.history;
  if (!first || first.outcome !== "open") return store;
  return { ...store, history: [{ ...first, outcome }, ...rest] };
}

/** The game picked last from this source, for the no-repeat rule. */
export function lastPickId(store: Store, source: Source): string | null {
  return store.history.find((entry) => entry.source === source)?.id ?? null;
}

/** Merkliste games get genre and playtime from this tool's own extras. */
export function withExtras(games: readonly Game[], extras: Record<string, Extra>): Game[] {
  return games.map((game) => {
    const extra = extras[game.id];
    return extra ? { ...game, genre: extra.genre, hours: extra.hours } : game;
  });
}
