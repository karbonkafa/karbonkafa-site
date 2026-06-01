# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`karbonkafa-site` — the KarbonGameStudios site ("Karbon OS"): a game backlog/archive,
achievement guides, auto-translated gaming news, user lists, and a faux-desktop UI.
Astro 6 static site deployed to Vercel. Turkish-first, bilingual (tr/en).

## Commands

Documented package manager is npm (Node `22.x`; a `pnpm-lock.yaml` is also present).

- `npm run dev` — dev server at `localhost:4321`
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the build
- `npm run astro check` — type-check `.astro`/`.ts` (tsconfig extends `astro/tsconfigs/strict`)

There is no test runner, linter, or formatter configured. Type-checking via `astro check`
is the only static gate.

The two Python scripts in `scripts/` are **data-pipeline tools, not part of the build** —
run manually or via CI, never invoked by `astro build`:
- `python3 scripts/fetch-news.py` — RSS → translate → markdown (needs `feedparser requests deep-translator trafilatura`)
- `python3 scripts/enrich-igdb.py` — backfill `igdb.json` from the IGDB API

## Architecture

### Rendering model
`output: 'static'` with the Vercel adapter, **but** the `src/pages/api/*` routes set
`export const prerender = false` and run as Vercel serverless functions. Everything else
is prerendered at build time.

### Data layer — large static JSON, merged by slug
Most content lives as big JSON files in `src/data/` and is `import`ed directly into pages
(bundled at build). The core pattern: **`games.json` is the base record (~2,000 games),
`igdb.json` is enrichment keyed by slug**, and pages merge them — `igdb.json` fields win
when present, `games.json` is the fallback (see [src/pages/games/[slug].astro](src/pages/games/%5Bslug%5D.astro)).
- `games.json` — base game library (slug, title, platform, status, etc.)
- `igdb.json` — IGDB enrichment keyed by slug (devs, genres, engines, timeToBeat, similarGames…)
- `reviews.json` — per-slug sub-scores; **written at runtime by the API** (see below)
- `guides.ts` — achievement-guide metadata + missable lists (a TS module, not JSON)
- `quiz.json`/`quiz-pool.json`, `schedule.json`, `lists.json`, `watch.json`,
  `watch-lists.json` — feature-specific data
- `news-processed.json` — dedup ledger for the news fetcher; do not hand-edit

To add a game: append to `games.json`, then run `enrich-igdb.py` to populate `igdb.json`.

### News content collection
News articles are markdown in `src/content/news/`, loaded via Astro's glob loader with a
Zod schema in [src/content.config.ts](src/content.config.ts). The `category` field is a
**fixed Turkish enum** (`Duyuru`, `Çıkış`, `Donanım`, `Endüstri`, `Bağımsız`, `Haftalık`) —
new categories must be added to the schema. `fetch-news.py` runs via GitHub Actions
([.github/workflows/fetch-news.yml](.github/workflows/fetch-news.yml)) 3×/day, generates
these files, and commits them back to `main`.

### API routes (`src/pages/api/`, serverless)
- `review.ts` — **mutates the repo at runtime**: admin-password-gated, reads/writes
  `src/data/reviews.json` through the GitHub Contents API (commits with `GITHUB_TOKEN`).
  Because of this, `reviews.json` changes can arrive from production — pull before editing it
  locally to avoid conflicts.
- `rate.ts` — admin-password-gated proxy to an external "Karbon API" (`KARBON_API_URL`, a VPS).
- `ticker.ts` — computes the current/next "KARBON TV" show from `schedule.json` for the marquee.

### i18n
Client-side, not Astro i18n routing. [src/i18n.ts](src/i18n.ts) holds a flat `tr`/`en`
dictionary. Translatable elements carry `data-i18n="key"` (or `data-i18n-tr`/`data-i18n-en`
for inline pairs, `data-i18n-placeholder`); an inline script in
[src/layouts/Layout.astro](src/layouts/Layout.astro) swaps text on load and on
`astro:after-swap`, persisting choice in `localStorage`. **To add a string, add the key to
both `tr` and `en` in `i18n.ts`** and reference it via `data-i18n`.

### Layout / "Karbon OS" shell
[src/layouts/Layout.astro](src/layouts/Layout.astro) is the desktop-metaphor shell: apps bar,
sticky taskbar, clock, auth panel, and a SomaFM radio player. It uses Astro's `<ClientRouter />`
(View Transitions), so client state (radio playback, clock interval) is kept on `window.*`
globals and re-bound on `astro:page-load`/`astro:after-swap` rather than re-initialized.
Styling is overwhelmingly **inline `style=` attributes**, not Tailwind utility classes.

### Tailwind
Tailwind v4 via the `@tailwindcss/vite` plugin in [astro.config.mjs](astro.config.mjs) —
**there is no `tailwind.config.*`**; configuration/imports live in `src/styles/global.css`.

### Auth
Supabase (`@supabase/supabase-js`) for profiles/lists, used client-side with the public
anon key ([src/lib/supabase.ts](src/lib/supabase.ts) exports the client and `Profile`/
`GameList`/`ListItem` types). Steam login is a hand-rolled OpenID 2.0 redirect
(`auth/steam.astro` → `auth/steam/callback.astro`); the callback is the only place the
`SUPABASE_SERVICE_ROLE_KEY` is used.

## Environment variables
`PUBLIC_*` vars are exposed to the client (Supabase URL/anon key, `PUBLIC_TMDB_KEY`).
Server-only vars used by API routes and the Steam callback — `ADMIN_PASSWORD`,
`GITHUB_TOKEN`, `KARBON_API_KEY`, `KARBON_API_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SITE_URL`, `STEAM_API_KEY` — are configured in Vercel and are not all present in the local
`.env`. `review.ts`/`rate.ts` will return 401/500 locally without `ADMIN_PASSWORD`/`GITHUB_TOKEN`.
