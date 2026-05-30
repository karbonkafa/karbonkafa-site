export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const { slug, rating } = await request.json();

  if (!slug || rating === undefined || rating < 1 || rating > 10) {
    return new Response(JSON.stringify({ error: 'Geçersiz istek' }), { status: 400 });
  }

  const apiKey = import.meta.env.KARBON_API_KEY;
  const apiUrl = import.meta.env.KARBON_API_URL || 'http://187.124.20.135:3001';

  const res = await fetch(`${apiUrl}/games/${slug}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ rating }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'API hatası' }), { status: 500 });
  }

  const data = await res.json();
  return new Response(JSON.stringify({ ok: true, rating: data.rating }), { status: 200 });
};
