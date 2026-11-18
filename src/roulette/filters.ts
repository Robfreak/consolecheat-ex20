import { genreKey, STATUSES, type Game, type Status } from "./games.ts";

export const HOUR_RANGES = ["lt5", "5to20", "20to60", "60plus", "unknown"] as const;
export type HourRange = (typeof HOUR_RANGES)[number];

/** Excluded genres (so genres that appear later are in by default), included ranges and statuses. */
export type Filters = { excludedGenres: string[]; hours: HourRange[]; statuses: Status[] };

/** Everything except finished games and the wishlist. */
export function defaultFilters(): Filters {
  return { excludedGenres: [], hours: [...HOUR_RANGES], statuses: ["backlog", "playing"] };
}

export function isDefault(filters: Filters): boolean {
  const d = defaultFilters();
  return (
    filters.excludedGenres.length === 0 &&
    filters.hours.length === d.hours.length &&
    filters.statuses.length === d.statuses.length &&
    d.statuses.every((s) => filters.statuses.includes(s))
  );
}

/** <5 h, 5–<20, 20–<60, 60+ and unknown. */
export function hourRange(hours: number | null): HourRange {
  if (hours === null) return "unknown";
  if (hours < 5) return "lt5";
  if (hours < 20) return "5to20";
  if (hours < 60) return "20to60";
  return "60plus";
}

export const NO_GENRE = "";

/** Genres in the data, case-insensitive, sorted; games without genre are the "" entry at the end. */
export function genresOf(games: readonly Game[]): { key: string; label: string; count: number }[] {
  const map = new Map<string, { key: string; label: string; count: number }>();
  for (const game of games) {
    const key = game.genre ? genreKey(game.genre) : NO_GENRE;
    const entry = map.get(key) ?? { key, label: game.genre ?? "", count: 0 };
    entry.count++;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === NO_GENRE) return 1;
    if (b.key === NO_GENRE) return -1;
    return a.label.localeCompare(b.label, "de", { sensitivity: "base" });
  });
}

export function matches(game: Game, filters: Filters): boolean {
  const genre = game.genre ? genreKey(game.genre) : NO_GENRE;
  if (filters.excludedGenres.includes(genre)) return false;
  if (!filters.hours.includes(hourRange(game.hours))) return false;
  return filters.statuses.includes(game.status);
}

export function applyFilters(games: readonly Game[], filters: Filters): Game[] {
  return games.filter((game) => matches(game, filters));
}

/** Validates stored filters; unknown values are dropped, a broken value gives the defaults. */
export function parseFilters(value: unknown): Filters | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.excludedGenres) || !Array.isArray(rec.hours) || !Array.isArray(rec.statuses)) return null;
  return {
    excludedGenres: [...new Set(rec.excludedGenres.filter((g): g is string => typeof g === "string" && g.length <= 40))].slice(0, 200),
    hours: HOUR_RANGES.filter((r) => rec.hours instanceof Array && rec.hours.includes(r)),
    statuses: STATUSES.filter((s) => rec.statuses instanceof Array && rec.statuses.includes(s)),
  };
}
