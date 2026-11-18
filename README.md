# Backlog-Roulette · consolecheat-ex20

Zu viele Spiele, keine Entscheidung? Eine Walze zieht fair ein Spiel aus deinem Backlog. Teil der consolecheat-Werkzeuge. Inoffiziell, nicht von Sony.

**Live:** https://robfreak.github.io/consolecheat-ex20/ (nachdem GitHub Pages eingeschaltet ist, siehe unten)

## Quellen

1. **Spiele-Merkliste (ex6), nur lesen.** Alle consolecheat-Werkzeuge liegen auf `robfreak.github.io` und teilen sich deshalb den `localStorage`. Das Roulette liest den Schlüssel `consolecheat-ex6-merkliste-v1` direkt und schreibt ihn **nie**.
   Schema (aus `Robfreak/consolecheat-ex6`, `src/lists.ts`):
   ```json
   { "schema": "consolecheat-ex6-merkliste", "version": 1,
     "lists": { "backlog": [], "playing": [], "completed": [], "wishlist": [] } }
   ```
   Jeder Eintrag ist `{ "titleIds": ["CUSA07408"], "name": "God of War", "note": "" }`. Die Liste wird zum Status. Die Merkliste kennt weder Genre noch Spielzeit; beides lässt sich im Roulette ergänzen und liegt dann im eigenen Schlüssel. Unlesbare Einträge werden übersprungen und gezählt; ein anderes Schema oder eine andere Version wird mit einer Meldung abgelehnt. Ändert sich die Merkliste in einem anderen Tab, liest das Roulette sie neu ein.
2. **JSON-Import:** der Export der Merkliste (gleiches Format) oder eine einfache Liste
   `[{ "title": "Hades", "genre": "Roguelike", "hours": 25, "status": "backlog" }]` (auch als `{ "games": [...] }`). `genre`, `hours` und `status` sind optional; `hours` darf `12`, `"12,5"` oder `"12 h"` sein. Höchstens 256 KB und 2000 Spiele; ein ungültiger Eintrag lehnt die Datei ab und wird mit Nummer genannt.
3. **Eigene Eingabe:** ein Spiel pro Zeile, optional `Titel | Genre | Stunden`. Leere Zeilen und `#`-Kommentare zählen nicht, doppelte Titel werden ignoriert, fehlerhafte Zeilen mit Zeilennummer gemeldet.

Die Seite zeigt immer, woher die Liste stammt (Quelle, Anzahl, Zeitpunkt).

## Funktionen

- **Walze:** eine große Walze läuft über die Titel und landet mit Ease-out auf dem gezogenen Spiel. Die Auswahl ist gleichverteilt (mulberry32, seedbar) und zieht nie zweimal hintereinander dasselbe Spiel, solange mehr als eins im Topf ist. „Annehmen“ oder „Nochmal“; der Verlauf merkt sich beides.
- **Merkliste-Hinweis:** nach dem Annehmen gibt es einen kopierbaren Hinweis, das Spiel auf der Merkliste unter „Spiele ich gerade“ einzutragen. Das Roulette ändert die Merkliste selbst nicht.
- **Filter:** Genre (aus den Daten, mehrfach), Spielzeit (unter 5 h, 5–20, 20–60, 60+, unbekannt) und Status (Standard: Backlog und Spiele ich gerade). Bleibt nichts übrig, gibt es eine klare Meldung und „Filter zurücksetzen“.
- **Ton:** nur Web Audio – Ticks beim Drehen, ein kurzer Jingle beim Landen, stummschaltbar. Der AudioContext entsteht erst bei der ersten Aktion.
- **Bewegung:** Mit `prefers-reduced-motion` landet die Walze sofort, ohne Animation und ohne Blinken.
- DE/EN (Standard Deutsch), hell/dunkel, ab 390 px Breite, Tastatur und Screenreader (Ergebnis per `aria-live`).

## Steuerung

| Eingabe | Aktion |
| --- | --- |
| Leertaste (kein Feld, kein Knopf fokussiert) | Drehen |
| × | Drehen |
| △ | Gezogenes Spiel annehmen |

Der erste Abruf eines Controllers (auch nach dem Wiederverbinden) merkt sich nur den Tastenzustand. Solange ein Textfeld den Fokus hat, greifen Tastenkürzel und Controller nicht.

## Speicher

`consolecheat-roulette-v1` (Schema `consolecheat-roulette`, Version 1): Quelle, importierte Liste, eingegebener Text, Genre-/Spielzeit-Ergänzungen für Merkliste-Spiele, Filter, Stummschaltung und der Verlauf (letzte 50 Ziehungen mit Zeitpunkt und offen/angenommen/neu gedreht). Unlesbare Teile werden übersprungen. Der Knopf auf der Datenschutz-Seite löscht nur diesen Schlüssel; die Merkliste wird nur gelesen.

## Entwicklung

Node 22.6 oder neuer.

```sh
npm ci
npm test        # node --test über src/roulette/*.test.ts
npm run build   # tsc, vite build, scripts/check-dist.mjs
npm run dev
```

Der Code liegt in `src/roulette`. `src/roulette/fixtures/` enthält Beispieldateien aus dem Ordner `samples` von `Robfreak/consolecheat-ex6`. Die Seite lädt nichts von Dritten; `scripts/check-dist.mjs` prüft das im Build.

## GitHub Pages einschalten

Der Workflow `.github/workflows/pages.yml` baut bei jedem Push auf `main` und legt `dist/` in den Branch `gh-pages`. Einmalig: **Settings → Pages → Source: Deploy from a branch → Branch `gh-pages` / `(root)`**. Danach ist die Seite unter https://robfreak.github.io/consolecheat-ex20/ erreichbar.

## Lizenz der Schriften

Outfit und Source Sans 3 stehen unter der SIL Open Font License, siehe `public/FONT-OFL.txt` und `THIRD_PARTY_NOTICES.md`.
