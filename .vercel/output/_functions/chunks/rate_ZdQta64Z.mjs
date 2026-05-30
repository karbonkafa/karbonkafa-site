const prerender = false;
const POST = async ({ request }) => {
  const { slug, rating } = await request.json();
  if (!slug || rating === void 0 || rating < 1 || rating > 10) {
    return new Response(JSON.stringify({ error: "Geçersiz istek" }), { status: 400 });
  }
  const apiKey = undefined                              ;
  const apiUrl = "http://187.124.20.135:3001";
  const res = await fetch(`${apiUrl}/games/${slug}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({ rating })
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "API hatası" }), { status: 500 });
  }
  const data = await res.json();
  return new Response(JSON.stringify({ ok: true, rating: data.rating }), { status: 200 });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
