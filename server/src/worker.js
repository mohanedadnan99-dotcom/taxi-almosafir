// نقش · خادم الطلبات والدفع (Cloudflare Worker)
// المفتاح السري لـ Wayl يبقى هنا كـ secret (WAYL_KEY) ولا يصل للمتصفح أبدًا.

const WAYL_API = 'https://api.thewayl.com/api/v1/links';
const PRICES = { normal: 5000, strong: 10000 };
const TEMPLATES = {
  door: ['طَرقة', 'strong'], curtain: ['سِتارة', 'strong'], union: ['لقاء', 'strong'], ring: ['مِحبس', 'strong'],
  royal: ['ملكي', 'strong'], night: ['ليل بغداد', 'strong'], emerald: ['زمرّد', 'strong'],
  pearl: ['لؤلؤ', 'normal'], garden: ['بُستان', 'normal'], marble: ['مرمر', 'normal'],
};
const TYPES = ['خطوبة', 'عقد قران', 'زفاف', 'حنّة'];
const RESERVED = new Set(['api', 'paid', 'admin', 'www', 'test', 'invite', 'assets', 'index', 'naqsh', 'static', 'robots', 'favicon', 'sitemap', 'login', 'dashboard']);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
const MAX_SONG = 15 * 1024 * 1024;
const PAID = new Set(['Complete', 'Delivered']);
const DEAD = new Set(['Cancelled', 'Rejected', 'Returned']);
const RESERVE_TTL = 65 * 60; // رابط الدفع من Wayl يبقى ساعة

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...extra } });
const fail = (message, status = 400) => json({ ok: false, message }, status);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      let m;
      if (req.method === 'GET' && (m = p.match(/^\/api\/slug\/([^/]+)$/))) return await slugCheck(env, decodeURIComponent(m[1]));
      if (req.method === 'POST' && p === '/api/orders') return await createOrder(req, env, url);
      if (req.method === 'GET' && (m = p.match(/^\/api\/orders\/([a-z0-9-]+)$/))) return await orderStatus(env, m[1]);
      if (req.method === 'POST' && p === '/api/wayl/webhook') return await webhook(req, env);
      if (req.method === 'GET' && (m = p.match(/^\/api\/invite\/([a-z0-9-]+)$/))) return await getInvite(env, m[1]);
      if (req.method === 'GET' && (m = p.match(/^\/api\/song\/([a-z0-9-]+)$/))) return await getSong(req, env, m[1]);
      if (req.method === 'GET' && p === '/api/health') return json({ ok: true, payments: !!env.WAYL_KEY, env: env.WAYL_ENV });
      return fail('المسار غير موجود', 404);
    } catch (e) {
      console.error(e);
      return fail('صار خطأ بالخادم، حاول مرة ثانية بعد شوية', 500);
    }
  },
};

/* ---------- slugs ---------- */
async function slugState(env, slug) {
  const raw = await env.NAQSH.get('slug:' + slug);
  return raw ? JSON.parse(raw) : null;
}
function slugProblem(slug) {
  if (!SLUG_RE.test(slug) || slug.includes('--')) return 'الرابط لازم يكون من ٣ لـ ٣٠ حرف: حروف إنكليزية صغيرة وأرقام وشَرطة بالنص';
  if (RESERVED.has(slug)) return 'هذا الاسم محجوز للموقع، جرّب واحد من الاقتراحات';
  return null;
}
async function slugCheck(env, slug) {
  const bad = slugProblem(slug);
  if (bad) return json({ ok: true, available: false, message: bad });
  const st = await slugState(env, slug);
  return json({ ok: true, available: !st, message: st ? 'هذا الرابط محجوز، جرّب واحد من الاقتراحات' : 'الرابط متاح' });
}

/* ---------- validation ---------- */
const str = (v, max, min = 0) => { const s = String(v ?? '').trim(); return s.length >= min && s.length <= max ? s : null; };
function validate(d) {
  const out = {};
  if (!TEMPLATES[d.tpl]) return ['القالب غير صحيح'];
  out.tpl = d.tpl;
  if (!TYPES.includes(d.type)) return ['نوع المناسبة غير صحيح'];
  out.type = d.type;
  const fields = [['family', 40, 1, 'اسم العائلة'], ['groom', 20, 1, 'اسم العريس'], ['bride', 20, 0, 'اسم العروس'], ['venue', 32, 1, 'المكان'], ['area', 40, 0, 'المنطقة'], ['note', 80, 0, 'الكلمة الختامية']];
  for (const [k, max, min, label] of fields) {
    const v = str(d[k], max, min);
    if (v === null) return [`${label} ${min ? 'مطلوب و' : ''}لازم ما يتجاوز ${max} حرف`];
    out[k] = v;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return ['التاريخ غير صحيح'];
  if (!/^\d{2}:\d{2}$/.test(d.time || '')) return ['الساعة غير صحيحة'];
  const when = Date.parse(d.date + 'T' + d.time + ':00+03:00');
  if (isNaN(when)) return ['التاريخ غير صحيح'];
  if (when < Date.now() - 6 * 3600e3) return ['تاريخ الحفل لازم يكون بالمستقبل'];
  if (when > Date.now() + 2 * 365 * 864e5) return ['تاريخ الحفل بعيد هواية، اختار تاريخ خلال سنتين'];
  out.date = d.date; out.time = d.time; out.when = when;
  out.hideBride = !!d.hideBride; out.verse = !!d.verse; out.countdown = !!d.countdown;
  const slug = String(d.slug || '').toLowerCase();
  const bad = slugProblem(slug);
  if (bad) return [bad];
  out.slug = slug;
  return [null, out];
}
const rid = (n = 10) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };

/* ---------- create order → Wayl link ---------- */
async function createOrder(req, env, url) {
  if (!env.WAYL_KEY || !env.WEBHOOK_SECRET) return fail('الدفع غير مفعّل بعد على الخادم', 503);
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) return fail('صيغة الطلب غير صحيحة');
  const form = await req.formData();
  let raw;
  try { raw = JSON.parse(form.get('data') || '{}'); } catch { return fail('بيانات الطلب غير صحيحة'); }
  const [err, d] = validate(raw);
  if (err) return fail(err);
  const [tplName, tier] = TEMPLATES[d.tpl];
  const total = PRICES[tier];

  // song (strong tier only)
  const song = form.get('song');
  let songMeta = null;
  if (song && typeof song === 'object' && song.size) {
    if (tier !== 'strong') return fail('الأغنية متوفرة بالقالب القوي فقط');
    if (song.size > MAX_SONG) return fail('حجم الأغنية أكبر من ١٥ ميغا');
    const type = song.type || 'audio/mpeg';
    if (!/^audio\//.test(type)) return fail('ملف الأغنية لازم يكون صوت (MP3 أو M4A)');
    const start = Math.max(0, Math.min(1200, parseInt(raw.songStart, 10) || 0));
    songMeta = { type, start };
  }

  // reserve slug
  if (await slugState(env, d.slug)) return fail('هذا الرابط انحجز قبل شوية، اختار رابط ثاني', 409);
  const ref = 'nq-' + rid(10);
  await env.NAQSH.put('slug:' + d.slug, JSON.stringify({ ref, status: 'reserved' }), { expirationTtl: RESERVE_TTL });
  if (songMeta) {
    await env.NAQSH.put('song:' + ref, await song.arrayBuffer(), { expirationTtl: 2 * 86400, metadata: songMeta });
  }
  const order = { ref, status: 'pending', tier, total, tplName, data: d, song: songMeta, createdAt: Date.now() };
  await env.NAQSH.put('order:' + ref, JSON.stringify(order), { expirationTtl: 3 * 86400 });

  const origin = url.origin;
  const body = {
    env: env.WAYL_ENV || 'live',
    referenceId: ref,
    total,
    currency: 'IQD',
    customParameter: d.slug,
    lineItem: [{ label: `دعوة رقمية · قالب ${tplName}`, amount: total, type: 'increase' }],
    webhookUrl: origin + '/api/wayl/webhook',
    webhookSecret: env.WEBHOOK_SECRET,
    redirectionUrl: origin + '/paid',
  };
  const r = await fetch(env.WAYL_API || WAYL_API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WAYL-AUTHENTICATION': env.WAYL_KEY }, body: JSON.stringify(body) });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.data || !res.data.url) {
    console.error('wayl create failed', r.status, JSON.stringify(res).slice(0, 400));
    await env.NAQSH.delete('slug:' + d.slug);
    return fail('ما كدرنا نفتح بوابة الدفع هسه، حاول مرة ثانية بعد دقيقة', 502);
  }
  order.waylId = res.data.id;
  await env.NAQSH.put('order:' + ref, JSON.stringify(order), { expirationTtl: 3 * 86400 });
  return json({ ok: true, ref, url: res.data.url, total });
}

/* ---------- payment confirmation (always re-checked with Wayl) ---------- */
async function waylStatus(env, ref) {
  const r = await fetch((env.WAYL_API || WAYL_API) + '/' + encodeURIComponent(ref), { headers: { 'X-WAYL-AUTHENTICATION': env.WAYL_KEY } });
  if (!r.ok) return null;
  const res = await r.json().catch(() => null);
  return res && res.data ? res.data : null;
}
async function activate(env, ref) {
  const raw = await env.NAQSH.get('order:' + ref);
  if (!raw) return { status: 'missing' };
  const order = JSON.parse(raw);
  if (order.status === 'paid') return order;
  const w = await waylStatus(env, ref);
  if (!w) return order;
  if (DEAD.has(w.status)) {
    order.status = 'failed'; order.waylStatus = w.status;
    await env.NAQSH.put('order:' + ref, JSON.stringify(order), { expirationTtl: 3 * 86400 });
    const st = await slugState(env, order.data.slug);
    if (st && st.ref === ref && st.status === 'reserved') await env.NAQSH.delete('slug:' + order.data.slug);
    return order;
  }
  if (!PAID.has(w.status) || Number(w.total) !== order.total) { order.waylStatus = w.status; return order; }

  // paid → publish the invitation until 30 days after the event
  let slug = order.data.slug;
  const st = await slugState(env, slug);
  if (st && st.ref !== ref) slug = slug.slice(0, 25) + '-' + rid(4); // reservation lost meanwhile
  const expiration = Math.floor(Math.max(order.data.when + 30 * 864e5, Date.now() + 7 * 864e5) / 1000);
  const invite = { ...order.data, slug, tier: order.tier, hasSong: !!order.song, songStart: order.song ? order.song.start : 0, ref };
  if (order.song) {
    const s = await env.NAQSH.getWithMetadata('song:' + ref, 'arrayBuffer');
    if (s && s.value) await env.NAQSH.put('songfile:' + slug, s.value, { expiration, metadata: s.metadata });
    else invite.hasSong = false;
  }
  await env.NAQSH.put('inv:' + slug, JSON.stringify(invite), { expiration });
  await env.NAQSH.put('slug:' + slug, JSON.stringify({ ref, status: 'active' }), { expiration });
  order.status = 'paid'; order.slug = slug; order.paidAt = Date.now(); order.waylStatus = w.status; order.paymentMethod = w.paymentMethod || null;
  await env.NAQSH.put('order:' + ref, JSON.stringify(order), { expiration });
  return order;
}
async function orderStatus(env, ref) {
  const o = await activate(env, ref);
  if (o.status === 'missing') return fail('الطلب غير موجود', 404);
  return json({ ok: true, status: o.status, slug: o.slug || o.data.slug, total: o.total, tpl: o.data.tpl, groom: o.data.groom, family: o.data.family, type: o.data.type });
}

async function webhook(req, env) {
  const raw = await req.text();
  const sig = (req.headers.get('x-wayl-signature-256') || '').replace(/^sha256=/, '').toLowerCase();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WEBHOOK_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!sig || sig.length !== mac.length || !timingSafe(sig, mac)) return fail('توقيع غير صحيح', 401);
  let ev; try { ev = JSON.parse(raw); } catch { return fail('بيانات غير صحيحة'); }
  if (ev.referenceId) await activate(env, String(ev.referenceId));
  return json({ ok: true });
}
function timingSafe(a, b) { let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }

/* ---------- guest side ---------- */
async function getInvite(env, slug) {
  const raw = await env.NAQSH.get('inv:' + slug);
  if (!raw) return fail('الدعوة غير موجودة أو انتهت مدتها', 404);
  const { ref, when, ...pub } = JSON.parse(raw);
  return json({ ok: true, invite: pub }, 200, { 'Cache-Control': 'public, max-age=60' });
}
async function getSong(req, env, slug) {
  const s = await env.NAQSH.getWithMetadata('songfile:' + slug, 'arrayBuffer');
  if (!s || !s.value) return new Response('Not found', { status: 404, headers: CORS });
  const buf = s.value, size = buf.byteLength, type = (s.metadata && s.metadata.type) || 'audio/mpeg';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400', ...CORS };
  const range = req.headers.get('range');
  const m = range && range.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    let start = m[1] === '' ? size - parseInt(m[2], 10) : parseInt(m[1], 10);
    let end = m[2] === '' || m[1] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
    if (isNaN(start) || start < 0 || start > end) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(buf, { headers: { ...base, 'Content-Length': String(size) } });
}
