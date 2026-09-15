export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/vote') {
      return handleVote(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/votes') {
      return handleAdminVotes(request, env);
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

async function handleAdminVotes(request, env) {
  const password = request.headers.get('x-admin-password') || '';
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let cursor;
  const keys = [];
  do {
    const page = await env.SURVEY_KV.list({ prefix: 'vote:', cursor, limit: 1000 });
    keys.push.apply(keys, page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const records = await Promise.all(keys.map(async function (k) {
    const raw = await env.SURVEY_KV.get(k.name);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }));

  const byProduct = {};
  let totalYes = 0;
  let totalNo = 0;

  records.forEach(function (r) {
    if (!r) return;
    const p = r.product || 'unknown';
    if (!byProduct[p]) byProduct[p] = { yes: 0, no: 0, emails: [] };
    if (r.vote === 'yes') {
      byProduct[p].yes += 1;
      totalYes += 1;
      if (r.email) byProduct[p].emails.push(r.email);
    } else if (r.vote === 'no') {
      byProduct[p].no += 1;
      totalNo += 1;
    }
  });

  return json({
    ok: true,
    total: records.filter(Boolean).length,
    totalYes: totalYes,
    totalNo: totalNo,
    byProduct: byProduct
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
