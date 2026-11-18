import { useEffect, useMemo, useRef, useState } from "react";
import { applyFilters, defaultFilters, genresOf, HOUR_RANGES, isDefault, NO_GENRE, type Filters } from "./filters.ts";
import { GENRE_MAX, parseHours, STATUSES, type Game, type Source } from "./games.ts";
import { parseImport, parseManual } from "./importer.ts";
import { createPadPoller, isTypingTarget, pageKeyAction, type Action, type TargetLike } from "./input.ts";
import { fill, type Copy, type Lang } from "./messages.ts";
import { MERKLISTE_KEY, MERKLISTE_URL, readMerkliste, type MerklisteResult } from "./merkliste.ts";
import { buildStrip, pickGame, REDUCED_SPIN_MS, reelPosition, SPIN_MS, tickTimes } from "./pick.ts";
import { freshSeed, mulberry32 } from "./prng.ts";
import { createSound } from "./sound.ts";
import {
  addPick,
  emptyStore,
  lastPickId,
  loadStore,
  saveStore,
  settleLatest,
  withExtras,
  type LoadResult,
  type Store,
  type StorageLike,
} from "./storage.ts";

const ITEM_PX = 64;

function browserStore(): StorageLike | null {
  try {
    localStorage.getItem("consolecheat-roulette-v1");
    return localStorage;
  } catch {
    return null;
  }
}

function targetOf(element: Element | EventTarget | null): TargetLike {
  if (!element || !(element instanceof HTMLElement)) return null;
  return {
    tagName: element.tagName,
    type: element instanceof HTMLInputElement ? element.type : undefined,
    isContentEditable: element.isContentEditable,
  };
}

function reducedMotion(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type Spin = { strip: Game[]; pick: Game; started: number; duration: number };

export function Roulette({ text, lang }: { text: Copy; lang: Lang }) {
  const [local] = useState(browserStore);
  const [merkliste, setMerkliste] = useState<MerklisteResult>(() => readMerkliste(local));
  const [readAt, setReadAt] = useState(() => new Date());
  const [initial] = useState<LoadResult>(() => {
    if (!local) return { store: emptyStore(), corrupt: false };
    let raw: string | null = null;
    try {
      raw = local.getItem("consolecheat-roulette-v1");
    } catch {
      raw = null;
    }
    const loaded = loadStore(local);
    // First visit without a Merkliste: start on the manual entry.
    if (raw === null && !readMerkliste(local).ok) loaded.store.source = "manual";
    return loaded;
  });
  const [store, setStore] = useState<Store>(initial.store);
  const [saveFailed, setSaveFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Game | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [strip, setStrip] = useState<Game[]>([]);
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [hintShown, setHintShown] = useState(false);

  const storeRef = useRef(store);
  storeRef.current = store;
  const textRef = useRef(text);
  textRef.current = text;
  const reelRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(0);
  const spinRef = useRef<Spin | null>(null);
  const soundRef = useRef<ReturnType<typeof createSound> | null>(null);

  function sound() {
    if (!soundRef.current) soundRef.current = createSound();
    soundRef.current.setMuted(storeRef.current.muted);
    return soundRef.current;
  }

  function commit(next: Store) {
    storeRef.current = next;
    setStore(next);
    setSaveFailed(local ? !saveStore(local, next) : true);
  }

  function reread() {
    setMerkliste(readMerkliste(local));
    setReadAt(new Date());
  }

  // Another tab (the Merkliste itself) changed the Merkliste: read it again.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === MERKLISTE_KEY || event.key === null) reread();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manual = useMemo(() => parseManual(store.manualText), [store.manualText]);
  const games: Game[] = useMemo(() => {
    if (store.source === "merkliste") return merkliste.ok ? withExtras(merkliste.games, store.extras) : [];
    if (store.source === "import") return store.imported?.games ?? [];
    return manual.games;
  }, [store.source, merkliste, store.extras, store.imported, manual]);
  const pool = useMemo(() => applyFilters(games, store.filters), [games, store.filters]);
  const genres = useMemo(() => genresOf(games), [games]);
  const poolRef = useRef(pool);
  poolRef.current = pool;

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }), [lang]);
  const timeFmt = useMemo(() => new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", { timeStyle: "short" }), [lang]);

  function setFilters(filters: Filters) {
    commit({ ...storeRef.current, filters });
  }

  function placeReel(position: number) {
    const el = reelRef.current;
    // The window shows three rows; row 1 (the middle) is the current item.
    if (el) el.style.transform = `translateY(${(1 - position) * ITEM_PX}px)`;
  }

  function finish(spin: Spin) {
    spinRef.current = null;
    placeReel(spin.strip.length - 1);
    setSpinning(false);
    setResult(spin.pick);
    setHintShown(false);
    commit(addPick(storeRef.current, spin.pick, storeRef.current.source, new Date()));
    setNotice(fill(textRef.current.result, { title: spin.pick.title }));
    sound().jingle();
  }

  function spin() {
    if (spinRef.current) return;
    const current = poolRef.current;
    if (current.length === 0) {
      setNotice(games.length === 0 ? textRef.current.emptySource : textRef.current.emptyFiltered);
      return;
    }
    const s = sound();
    s.unlock();
    const rand = mulberry32(freshSeed());
    const pick = pickGame(current, rand, lastPickId(storeRef.current, storeRef.current.source));
    if (!pick) return;
    const reduced = reducedMotion();
    const next: Spin = {
      strip: buildStrip(current, pick, rand, reduced ? 3 : undefined),
      pick,
      started: performance.now(),
      duration: reduced ? REDUCED_SPIN_MS : SPIN_MS,
    };
    spinRef.current = next;
    setStrip(next.strip);
    setResult(null);
    setSpinning(true);
    setNotice(textRef.current.spinning);
    if (next.duration <= 0) {
      // Reduced motion: no animation, land at once.
      requestAnimationFrame(() => finish(next));
      return;
    }
    placeReel(0);
    const ticks = tickTimes(next.duration, next.strip.length);
    let tickIndex = 0;
    const frame = (now: number) => {
      const active = spinRef.current;
      if (active !== next) return;
      const elapsed = now - next.started;
      while (tickIndex < ticks.length && (ticks[tickIndex] ?? Infinity) <= elapsed) {
        tickIndex++;
        s.tick();
      }
      if (elapsed >= next.duration) {
        finish(next);
        return;
      }
      placeReel(reelPosition(elapsed, next.duration, next.strip.length));
      frameRef.current = requestAnimationFrame(frame);
    };
    frameRef.current = requestAnimationFrame(frame);
  }

  function accept() {
    const latest = storeRef.current.history[0];
    if (!result || !latest || latest.outcome !== "open") return;
    commit(settleLatest(storeRef.current, "accepted"));
    setNotice(fill(textRef.current.accepted, { title: result.title }));
    setHintShown(true);
  }

  function reroll() {
    if (spinRef.current) return;
    commit(settleLatest(storeRef.current, "rerolled"));
    spin();
  }

  const runRef = useRef<(action: Action) => void>(() => undefined);
  runRef.current = (action) => {
    if (action.type === "spin") spin();
    else accept();
  };

  // Space spins (not while a field or a control has focus).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = pageKeyAction(event, targetOf(event.target));
      if (!action) return;
      event.preventDefault();
      runRef.current(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Gamepad: the first poll of each pad (and after a reconnect) only seeds.
  useEffect(() => {
    if (typeof navigator.getGamepads !== "function") return;
    const poller = createPadPoller();
    let frame = 0;
    let running = false;
    const poll = () => {
      const pads = [...navigator.getGamepads()];
      const blocked = isTypingTarget(targetOf(document.activeElement));
      for (const action of poller.poll(pads, blocked)) runRef.current(action);
      if (pads.some(Boolean)) frame = requestAnimationFrame(poll);
      else running = false;
    };
    const begin = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(poll);
    };
    const onDisconnect = (event: GamepadEvent) => poller.forget(event.gamepad.index);
    window.addEventListener("gamepadconnected", begin);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    if (navigator.getGamepads().some(Boolean)) begin();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("gamepadconnected", begin);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  function runImport(raw: string, name: string) {
    const parsed = parseImport(raw);
    if (!parsed.ok) {
      const message = fill(text.importErrors[parsed.error], { index: parsed.index ?? 0 });
      setImportMessage({ ok: false, text: message });
      return;
    }
    commit({
      ...storeRef.current,
      source: "import",
      imported: { name: name.slice(0, 120), format: parsed.format, at: new Date().toISOString(), games: parsed.games },
    });
    setImportMessage({ ok: true, text: fill(text.importDone, { n: parsed.games.length }) });
    setResult(null);
  }

  async function copyHint(hint: string) {
    try {
      await navigator.clipboard.writeText(hint);
      setNotice(text.hintCopied);
    } catch {
      setNotice(text.hintManual);
    }
  }

  function setExtra(id: string, patch: { genre?: string; hours?: string }) {
    const s = storeRef.current;
    const before = s.extras[id] ?? { genre: null, hours: null };
    const genre = patch.genre !== undefined ? patch.genre.replace(/\s+/g, " ").trimStart().slice(0, GENRE_MAX) || null : before.genre;
    let hours = before.hours;
    if (patch.hours !== undefined) {
      const parsed = parseHours(patch.hours);
      hours = parsed === undefined ? before.hours : parsed;
    }
    const extras = { ...s.extras };
    if (genre === null && hours === null) delete extras[id];
    else extras[id] = { genre, hours };
    commit({ ...s, extras });
  }

  const sourceName =
    store.source === "merkliste" ? text.sourceMerkliste : store.source === "import" ? text.sourceImport : text.sourceManual;
  const lastEntry = store.history[0];
  const canAccept = Boolean(result && !spinning && lastEntry?.outcome === "open" && lastEntry.id === result.id);
  const hint = result ? fill(text.hintText, { title: result.title, url: MERKLISTE_URL }) : "";
  const shownStrip = strip.length > 0 ? strip : [];
  const merklisteGames = merkliste.ok ? withExtras(merkliste.games, store.extras) : [];

  function toggle<T>(list: readonly T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  return (
    <div className="flex flex-col gap-4">
      {initial.corrupt ? <p className="text-sm text-warn">{text.storeCorrupt}</p> : null}
      {saveFailed ? <p className="text-sm text-warn">{text.saveFailed}</p> : null}

      <div className="roulette-layout">
        <section className="panel rounded-xl px-4 py-4" aria-labelledby="source-heading">
          <h3 id="source-heading" className="font-display text-lg font-semibold tracking-tight">
            {text.sourceHeading}
          </h3>
          <fieldset className="mt-2">
            <legend className="sr-only">{text.sourceHeading}</legend>
            <div className="segmented" role="presentation">
              {(["merkliste", "import", "manual"] as Source[]).map((id) => (
                <label key={id} className={`segment${store.source === id ? " is-on" : ""}`}>
                  <input
                    type="radio"
                    name="roulette-source"
                    value={id}
                    checked={store.source === id}
                    className="sr-only"
                    onChange={() => {
                      commit({ ...storeRef.current, source: id });
                      setResult(null);
                      if (id === "merkliste") reread();
                    }}
                  />
                  {id === "merkliste" ? text.sourceMerkliste : id === "import" ? text.sourceImport : text.sourceManual}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-3 text-sm font-medium text-fg" data-testid="source-line">
            {fill(text.sourceFrom, { source: sourceName })}
          </p>

          {store.source === "merkliste" ? (
            <div className="mt-1 flex flex-col gap-2 text-sm text-muted">
              {merkliste.ok ? (
                <>
                  <p>{fill(text.sourceMerklisteInfo, { n: merkliste.games.length, key: MERKLISTE_KEY, time: timeFmt.format(readAt) })}</p>
                  {merkliste.skipped > 0 ? <p className="text-warn">{fill(text.sourceMerklisteSkipped, { n: merkliste.skipped })}</p> : null}
                </>
              ) : (
                <p className="text-warn">{text.merklisteErrors[merkliste.error]}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={reread}>
                  {text.reread}
                </button>
                <a className="btn btn-ghost btn-sm" href={MERKLISTE_URL}>
                  {text.openMerkliste}
                </a>
              </div>
            </div>
          ) : null}

          {store.source === "import" ? (
            <div className="mt-1 flex flex-col gap-2 text-sm">
              <p className="text-muted">
                {store.imported
                  ? fill(text.sourceImportInfo, {
                      n: store.imported.games.length,
                      name: store.imported.name,
                      format: store.imported.format === "merkliste" ? text.formatMerkliste : text.formatArray,
                      date: dateFmt.format(new Date(store.imported.at)),
                    })
                  : text.importNone}
              </p>
              <p className="text-subtle">{text.importNote}</p>
              <label htmlFor="import-file" className="font-medium">
                {text.importFile}
              </label>
              <input
                id="import-file"
                type="file"
                accept="application/json,.json"
                className="file-input"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (file.size > 256 * 1024) {
                    setImportMessage({ ok: false, text: text.importErrors.size });
                    return;
                  }
                  runImport(await file.text(), file.name);
                }}
              />
              <label htmlFor="import-text" className="font-medium">
                {text.importPaste}
              </label>
              <textarea id="import-text" className="field min-h-24 py-2 font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} />
              <div>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!importText.trim()} onClick={() => runImport(importText, "JSON")}>
                  {text.importButton}
                </button>
              </div>
              {importMessage ? (
                <p className={importMessage.ok ? "text-ok" : "text-warn"} role="status">
                  {importMessage.text}
                </p>
              ) : null}
            </div>
          ) : null}

          {store.source === "manual" ? (
            <div className="mt-1 flex flex-col gap-2 text-sm">
              <p className="text-muted">{fill(text.sourceManualInfo, { n: manual.games.length })}</p>
              <label htmlFor="manual-text" className="font-medium">
                {text.manualLabel}
              </label>
              <textarea
                id="manual-text"
                className="field min-h-40 py-2"
                value={store.manualText}
                placeholder={"Hades | Roguelike | 25\nAstro Bot | Jump 'n' Run | 12\nElden Ring"}
                aria-describedby="manual-issues"
                onChange={(event) => commit({ ...storeRef.current, manualText: event.target.value })}
              />
              <div id="manual-issues" className="text-warn" aria-live="polite">
                {manual.issues.slice(0, 5).map((issue) => (
                  <p key={issue.line}>{fill(text.manualIssues[issue.reason], { line: issue.line })}</p>
                ))}
                {manual.duplicates > 0 ? <p>{fill(text.manualDuplicates, { n: manual.duplicates })}</p> : null}
                {manual.tooMany ? <p>{text.manualTooMany}</p> : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel rounded-xl px-4 py-4" aria-labelledby="reel-heading">
          <div className="flex items-center justify-between gap-2">
            <h3 id="reel-heading" className="font-display text-lg font-semibold tracking-tight">
              {text.reelLabel}
            </h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-pressed={store.muted}
              onClick={() => {
                const muted = !storeRef.current.muted;
                commit({ ...storeRef.current, muted });
                soundRef.current?.setMuted(muted);
              }}
            >
              {store.muted ? text.unmute : text.mute}
            </button>
          </div>
          <div className={`reel mt-3${spinning ? " is-spinning" : ""}${result ? " has-result" : ""}`} aria-hidden="true">
            <div className="reel-strip" ref={reelRef}>
              {shownStrip.length === 0 ? (
                <div className="reel-item">{text.reelIdle}</div>
              ) : (
                shownStrip.map((game, i) => (
                  <div className="reel-item" key={`${i}-${game.id}`}>
                    {game.title}
                  </div>
                ))
              )}
            </div>
            <div className="reel-window" />
          </div>
          <div className="mt-3 min-h-14" aria-live="polite" role="status" data-testid="result">
            <p className="font-display text-xl font-semibold text-fg">{notice}</p>
            {result && !spinning ? (
              <p className="text-sm text-muted">
                {fill(text.resultMeta, {
                  status: text.statuses[result.status],
                  genre: result.genre ?? text.noGenre,
                  hours: result.hours === null ? text.unknownHours : fill(text.hoursValue, { n: result.hours.toLocaleString(lang) }),
                })}
              </p>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={spin} disabled={spinning || pool.length === 0} aria-keyshortcuts="Space">
              {spinning ? text.spinning : text.spin}
            </button>
            <button type="button" className="btn btn-ghost" onClick={accept} disabled={!canAccept}>
              {text.accept}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reroll} disabled={!result || spinning || pool.length === 0}>
              {text.reroll}
            </button>
          </div>
          {pool.length === 0 ? (
            <div className="mt-3 rounded-lg border border-line px-3 py-3 text-sm" data-testid="empty">
              <p className="text-fg">{games.length === 0 ? text.emptySource : text.emptyFiltered}</p>
              {games.length > 0 ? (
                <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setFilters(defaultFilters())}>
                  {text.resetFilters}
                </button>
              ) : null}
            </div>
          ) : null}
          {hintShown && result && store.source === "merkliste" && result.status !== "playing" ? (
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <label htmlFor="merkliste-hint" className="font-medium">
                {text.hintLabel}
              </label>
              <input id="merkliste-hint" className="field text-xs" readOnly value={hint} onFocus={(e) => e.target.select()} />
              <p className="text-subtle">{text.hintNote}</p>
              <div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyHint(hint)}>
                  {text.hintCopy}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel rounded-xl px-4 py-4" aria-labelledby="filters-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="filters-heading" className="font-display text-lg font-semibold tracking-tight">
            {text.filtersHeading}
          </h3>
          <p className="text-sm text-muted" data-testid="pool-count">
            {fill(text.poolCount, { n: pool.length, total: games.length })}
          </p>
        </div>
        <div className="filter-grid mt-2">
          <fieldset>
            <legend className="text-sm font-medium">{text.genreLegend}</legend>
            {genres.length === 0 || (genres.length === 1 && genres[0]?.key === NO_GENRE) ? (
              <p className="mt-1 text-sm text-subtle">{text.noGenres}</p>
            ) : null}
            <div className="chips mt-1">
              {genres.map((genre) => (
                <label key={genre.key || "none"} className="chip">
                  <input
                    type="checkbox"
                    checked={!store.filters.excludedGenres.includes(genre.key)}
                    onChange={() => setFilters({ ...store.filters, excludedGenres: toggle(store.filters.excludedGenres, genre.key) })}
                  />
                  <span>
                    {genre.key === NO_GENRE ? text.noGenre : genre.label} <span className="text-subtle">({genre.count})</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">{text.hoursLegend}</legend>
            <div className="chips mt-1">
              {HOUR_RANGES.map((range) => (
                <label key={range} className="chip">
                  <input
                    type="checkbox"
                    checked={store.filters.hours.includes(range)}
                    onChange={() => setFilters({ ...store.filters, hours: toggle(store.filters.hours, range) })}
                  />
                  <span>{text.hourRanges[range]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">{text.statusLegend}</legend>
            <div className="chips mt-1">
              {STATUSES.map((status) => (
                <label key={status} className="chip">
                  <input
                    type="checkbox"
                    checked={store.filters.statuses.includes(status)}
                    onChange={() => setFilters({ ...store.filters, statuses: toggle(store.filters.statuses, status) })}
                  />
                  <span>{text.statuses[status]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <button type="button" className="btn btn-ghost btn-sm mt-3" disabled={isDefault(store.filters)} onClick={() => setFilters(defaultFilters())}>
          {text.resetFilters}
        </button>
      </section>

      {store.source === "merkliste" && merklisteGames.length > 0 ? (
        <details className="panel rounded-xl px-4 py-4">
          <summary className="cursor-pointer font-display text-lg font-semibold tracking-tight">{text.extrasHeading}</summary>
          <p className="mt-2 text-sm text-muted">{text.extrasNote}</p>
          <datalist id="genre-options">
            {genres
              .filter((g) => g.key !== NO_GENRE)
              .map((g) => (
                <option key={g.key} value={g.label} />
              ))}
          </datalist>
          <ul className="mt-2">
            {merklisteGames.slice(0, 500).map((game) => (
              <li key={game.id} className="extra-row">
                <span className="min-w-0 break-words text-sm font-medium">{game.title}</span>
                <input
                  type="text"
                  className="field field-sm"
                  list="genre-options"
                  maxLength={GENRE_MAX}
                  aria-label={fill(text.extrasGenre, { title: game.title })}
                  defaultValue={game.genre ?? ""}
                  onBlur={(event) => setExtra(game.id, { genre: event.target.value })}
                />
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step="0.5"
                  inputMode="decimal"
                  className="field field-sm"
                  aria-label={fill(text.extrasHours, { title: game.title })}
                  defaultValue={game.hours ?? ""}
                  onBlur={(event) => setExtra(game.id, { hours: event.target.value })}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <section className="panel rounded-xl px-4 py-4" aria-labelledby="history-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="history-heading" className="font-display text-lg font-semibold tracking-tight">
            {text.historyHeading}
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={store.history.length === 0}
            onClick={() => commit({ ...storeRef.current, history: [] })}
          >
            {text.historyClear}
          </button>
        </div>
        {store.history.length === 0 ? (
          <p className="mt-2 text-sm text-subtle">{text.historyEmpty}</p>
        ) : (
          <ol className="mt-2" data-testid="history">
            {store.history.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="history-row">
                <span className="min-w-0 break-words font-medium">{entry.title}</span>
                <span className={`badge badge-${entry.outcome}`}>{text.outcomes[entry.outcome]}</span>
                <time dateTime={entry.at} className="text-xs text-subtle">
                  {dateFmt.format(new Date(entry.at))} ·{" "}
                  {entry.source === "merkliste" ? text.sourceMerkliste : entry.source === "import" ? text.sourceImport : text.sourceManual}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

