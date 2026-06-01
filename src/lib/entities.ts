import type { SupabaseClient } from '@supabase/supabase-js';

// Mirror of the normalized shape returned by /api/search.
export interface SearchResult {
  type: 'game' | 'movie' | 'tv' | 'album' | 'track' | 'book';
  source: string;
  source_id: string;
  slug: string;
  title: string;
  image_url: string | null;
  year: number | null;
  meta: Record<string, unknown>;
}

export interface Entity extends SearchResult {
  id: string;
}

export const ENTITY_TYPES = [
  { type: 'game',  label: 'Oyun',       icon: '🎮' },
  { type: 'movie', label: 'Film',       icon: '🎬' },
  { type: 'tv',    label: 'Dizi',       icon: '📺' },
  { type: 'album', label: 'Albüm',      icon: '🎵' },
  { type: 'track', label: 'Parça',      icon: '🎶' },
  { type: 'book',  label: 'Kitap',      icon: '📚' },
] as const;

export function typeInfo(type: string) {
  return ENTITY_TYPES.find(t => t.type === type) ?? { type, label: type, icon: '•' };
}

/** Internal detail-page URL for an entity, or null if no page exists yet. */
export function entityHref(e: { type: string; source_id: string; slug: string }): string | null {
  if (e.type === 'game') return `/games/${e.slug}`;
  if (e.type === 'movie' || e.type === 'tv') return `/dizi-film/${e.source_id}`;
  return null; // album / book — no dedicated page yet
}

/** "Developer · 2018" style subtitle, type-aware. */
export function entitySubtitle(e: { type: string; year: number | null; meta?: any }): string {
  const m = e.meta ?? {};
  let lead = '';
  if (e.type === 'game') lead = Array.isArray(m.developer) ? m.developer[0] : (m.developer || '');
  else if (e.type === 'album') lead = m.artist || '';
  else if (e.type === 'track') lead = [m.artist, m.album].filter(Boolean).join(' — ');
  else if (e.type === 'book') lead = m.author || '';
  return [lead, e.year ? String(e.year) : ''].filter(Boolean).join(' · ');
}

/** Query the unified search endpoint for one media type. */
export async function searchEntities(type: string, q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.results ?? [];
}

/**
 * Resolve a search candidate to an entities.id, creating the catalog row if
 * needed. Runs under the caller's Supabase session (RLS: authenticated insert).
 * Two-step (select-then-insert) so we never need an UPDATE policy on entities.
 */
export async function resolveEntity(sb: SupabaseClient, r: SearchResult): Promise<string | null> {
  const found = await sb
    .from('entities')
    .select('id')
    .eq('source', r.source)
    .eq('source_id', r.source_id)
    .maybeSingle();
  if (found.data?.id) return found.data.id;

  const inserted = await sb
    .from('entities')
    .insert({
      type: r.type,
      source: r.source,
      source_id: r.source_id,
      slug: r.slug,
      title: r.title,
      image_url: r.image_url,
      year: r.year,
      meta: r.meta ?? {},
    })
    .select('id')
    .single();

  // Lost a race? Another insert won the unique(source, source_id) — re-select.
  if (inserted.error) {
    const retry = await sb
      .from('entities')
      .select('id')
      .eq('source', r.source)
      .eq('source_id', r.source_id)
      .maybeSingle();
    return retry.data?.id ?? null;
  }
  return inserted.data.id;
}
