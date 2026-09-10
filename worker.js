export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/vote') {
      return handleVote(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleVote(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const product = typeof body.product === 'string' ? body.product.trim().slice(0, 100) : '';
  const vote = body.vote === 'yes' || body.vote === 'no' ? body.vote : '';
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '';

  if (!product || !vote) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }
  if (vote === 'yes' && (!email || email.indexOf('@') === -1)) {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }

  const ts = Date.now();
  const key = 'vote:' + ts + ':' + Math.random().toString(36).slice(2, 8);
  const value = JSON.stringify({ product, vote, email, ts });

  try {
    await env.SURVEY_KV.put(key, value);
  } catch (e) {
    return json({ ok: false, error: 'storage_failed' }, 500);
  }

  return json({ ok: true });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
