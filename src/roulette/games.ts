// The common game shape for every source (Merkliste, import, manual entry).

export const STATUSES = ["backlog", "playing", "completed", "wishlist"] as const;
export type Status = (typeof STATUSES)[number];

export type Source = "merkliste" | "import" | "manual";

export type Game = {
  /** Stable within a source: Merkliste title ID, else the lower-cased title. */
  id: string;
  title: string;
  genre: string | null;
  hours: number | null;
  status: Status;
};

export const TITLE_MAX = 200;
export const GENRE_MAX = 40;
export const HOURS_MAX = 10000;
export const MAX_GAMES = 2000;

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function codePoints(value: string): number {
  return [...value].length;
}

/** "Rollenspiel" and "rollenspiel " are the same genre; the first spelling wins. */
export function genreKey(genre: string): string {
  return cleanText(genre).toLocaleLowerCase("de");
}

export function titleKey(title: string): string {
  return cleanText(title).toLocaleLowerCase("de");
}

/** Accepts 12, "12", "12,5", "12.5 h", "12 Std", "12 Stunden", "12 hours". */
export function parseHours(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value <= HOURS_MAX ? value : undefined;
  if (typeof value !== "string") return undefined;
  const text = cleanText(value);
  if (!text) return null;
  const match = /^(\d{1,5}(?:[.,]\d{1,2})?)\s*(h|std\.?|stunden|stunde|hours?|hrs?)?$/i.exec(text);
  if (!match?.[1]) return undefined;
  const hours = Number(match[1].replace(",", "."));
  return hours <= HOURS_MAX ? hours : undefined;
}

/** Keeps the first game of each title (case-insensitive). */
export function dedupe(games: readonly Game[]): Game[] {
  const seen = new Set<string>();
  const out: Game[] = [];
  for (const game of games) {
    const key = titleKey(game.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(game);
  }
  return out;
}
