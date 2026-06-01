// One-time backfill: load the curated games into the unified `entities` table.
// Usage:  node scripts/backfill-entities.mjs
// Needs PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (service role
// bypasses RLS — never expose this key to the client).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Minimal .env loader (no dotenv dependency)
function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv();

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const games = JSON.parse(readFileSync(join(root, 'src/data/games.json'), 'utf8'));

const rows = games.map((g) => ({
  type: 'game',
  source: g.igdbId ? 'igdb' : 'karbon',
  source_id: g.igdbId ? String(g.igdbId) : g.slug,
  slug: g.slug,
  title: g.title,
  image_url: g.coverUrl ?? null,
  year: g.releaseYear ?? null,
  meta: {
    developer: g.developer ?? null,
    genres: g.genres ?? [],
    platform: g.platform ?? null,
    metacritic: g.metacriticScore ?? null,
  },
}));

// De-dup by (source, source_id) to avoid in-batch conflicts
const seen = new Set();
const unique = rows.filter((r) => {
  const k = `${r.source}:${r.source_id}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log(`Backfilling ${unique.length} game entities (from ${games.length} games)...`);

const CHUNK = 500;
let done = 0;
for (let i = 0; i < unique.length; i += CHUNK) {
  const chunk = unique.slice(i, i + CHUNK);
  const { error } = await sb.from('entities').upsert(chunk, { onConflict: 'source,source_id' });
  if (error) {
    console.error(`Chunk ${i / CHUNK} failed:`, error.message);
    process.exit(1);
  }
  done += chunk.length;
  console.log(`  ${done}/${unique.length}`);
}

console.log('✓ Done.');
