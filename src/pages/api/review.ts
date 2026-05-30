export const prerender = false;

import type { APIRoute } from 'astro';

const CATEGORIES = ['hikaye', 'oynanis', 'gorsel', 'ses', 'deger'] as const;
type Category = typeof CATEGORIES[number];

interface SubReview {
  hikaye?: number;
  oynanis?: number;
  gorsel?: number;
  ses?: number;
  deger?: number;
  overall?: number;
  updatedAt?: string;
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { slug, scores, password } = body as { slug: string; scores: Partial<Record<Category, number>>; password: string };

  if (!slug || !scores) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  if (password !== import.meta.env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const token = import.meta.env.GITHUB_TOKEN;
  const repo = 'karbonkafa/karbonkafa-site';
  const path = 'src/data/reviews.json';
  const apiBase = `https://api.github.com/repos/${repo}/contents/${path}`;

  // Fetch current file
  const getRes = await fetch(apiBase, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });

  if (!getRes.ok) {
    return new Response(JSON.stringify({ error: 'GitHub read error' }), { status: 500 });
  }

  const fileData = await getRes.json();
  const currentContent: Record<string, SubReview> = JSON.parse(
    Buffer.from(fileData.content, 'base64').toString('utf-8')
  );

  // Calculate scores
  const existing = currentContent[slug] || {};
  const merged = { ...existing, ...scores };
  const vals = CATEGORIES.map(c => merged[c]).filter(v => v !== undefined && v > 0) as number[];
  const overall = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : undefined;

  currentContent[slug] = { ...merged, overall, updatedAt: new Date().toISOString() };

  // Save to GitHub
  const newContent = Buffer.from(JSON.stringify(currentContent, null, 2)).toString('base64');
  const updateRes = await fetch(apiBase, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `review: ${slug}`,
      content: newContent,
      sha: fileData.sha,
    }),
  });

  if (!updateRes.ok) {
    return new Response(JSON.stringify({ error: 'GitHub write error' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, review: currentContent[slug] }), { status: 200 });
};
