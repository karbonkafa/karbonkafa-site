export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Unified, normalized search result. Enough to upsert an `entities` row.
export interface SearchResult {
  type: 'game' | 'movie' | 'tv' | 'album' | 'book';
  source: string;
  source_id: string;
  slug: string;
  title: string;
  image_url: string | null;
  year: number | null;
  meta: Record<string, unknown>;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

// ── Games: our own curated catalog (backfilled IGDB data) ──────────────
async function searchGames(q: string): Promise<SearchResult[]> {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const sb = createClient(url, key);
  const { data } = await sb
    .from('entities')
    .select('source, source_id, slug, title, image_url, year, meta')
    .eq('type', 'game')
    .ilike('title', `%${q}%`)
    .order('year', { ascending: false, nullsFirst: false })
    .limit(20);
  return (data ?? []).map(r => ({ type: 'game', ...r })) as SearchResult[];
}

// ── Movies & TV: TMDB multi-search ─────────────────────────────────────
async function searchTmdb(q: string): Promise<SearchResult[]> {
  const key = import.meta.env.PUBLIC_TMDB_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://api.themoviedb.org/3/search/multi?api_key=${key}&language=tr-TR&include_adult=false&query=${encodeURIComponent(q)}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results ?? [])
    .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 20)
    .map((r: any): SearchResult => {
      const title = r.title || r.name || '?';
      const date = r.release_date || r.first_air_date || '';
      return {
        type: r.media_type,
        source: 'tmdb',
        source_id: `${r.media_type}-${r.id}`,
        slug: `${slugify(title)}-${r.id}`,
        title,
        image_url: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null,
        year: date ? Number(date.slice(0, 4)) || null : null,
        meta: { overview: r.overview ?? '', tmdbId: r.id },
      };
    });
}

// ── Music albums: MusicBrainz + Cover Art Archive ──────────────────────
async function searchMusic(q: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&type=album&fmt=json&limit=20`,
    { headers: { 'User-Agent': 'karbonkafa/1.0 ( https://www.karbonkafa.com )', Accept: 'application/json' } },
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json['release-groups'] ?? []).map((rg: any): SearchResult => {
    const artist = (rg['artist-credit'] ?? []).map((a: any) => a.name).join(', ');
    const date: string = rg['first-release-date'] || '';
    return {
      type: 'album',
      source: 'musicbrainz',
      source_id: rg.id,
      slug: `${slugify(rg.title)}-${rg.id.slice(0, 8)}`,
      title: rg.title,
      image_url: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
      year: date ? Number(date.slice(0, 4)) || null : null,
      meta: { artist, mbid: rg.id },
    };
  });
}

// ── Books: OpenLibrary ─────────────────────────────────────────────────
async function searchBooks(q: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20&fields=key,title,first_publish_year,cover_i,author_name`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.docs ?? []).map((d: any): SearchResult => {
    const author = (d.author_name ?? []).slice(0, 2).join(', ');
    const key: string = d.key; // e.g. /works/OL12345W
    return {
      type: 'book',
      source: 'openlibrary',
      source_id: key,
      slug: `${slugify(d.title)}-${key.split('/').pop()}`,
      title: d.title,
      image_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      year: d.first_publish_year ?? null,
      meta: { author, olKey: key },
    };
  });
}

const ADAPTERS: Record<string, (q: string) => Promise<SearchResult[]>> = {
  game: searchGames,
  movie: searchTmdb,
  tv: searchTmdb,
  album: searchMusic,
  book: searchBooks,
};

export const GET: APIRoute = async ({ url }) => {
  const type = url.searchParams.get('type') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();

  if (!ADAPTERS[type]) {
    return new Response(JSON.stringify({ error: 'Unknown type' }), { status: 400 });
  }
  if (q.length < 2) {
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  }

  try {
    const results = await ADAPTERS[type](q);
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Search failed', results: [] }), { status: 500 });
  }
};
