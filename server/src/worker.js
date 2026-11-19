// نقش · خادم الطلبات والدفع (Cloudflare Worker)
// المفتاح السري لـ Wayl يبقى هنا كـ secret (WAYL_KEY) ولا يصل للمتصفح أبدًا.

const WAYL_API = 'https://api.thewayl.com/api/v1/links';
const PRICES = { silver: 5000, gold: 10000, diamond: 20000 };
const RSVP_TIERS = new Set(['gold', 'diamond']);
const EDIT_WINDOW = 24 * 3600e3;
const TIER_NAME = { silver: 'فضّي', gold: 'ذهبي', diamond: 'ماسي' };
const TEMPLATES = {
  lanterns: ['فوانيس', 'diamond'], fireworks: ['ألعاب نارية', 'diamond'], candles: ['شموع', 'diamond'],
  door: ['طَرقة', 'gold'], curtain: ['سِتارة', 'gold'], union: ['لقاء', 'gold'], ring: ['مِحبس', 'gold'],
  royal: ['ملكي', 'gold'], night: ['ليل بغداد', 'gold'], emerald: ['زمرّد', 'gold'],
  pearl: ['لؤلؤ', 'silver'], garden: ['بُستان', 'silver'], marble: ['مرمر', 'silver'],
};
const OCC = {
  engagement: ['خطوبة', 'couple'], nikah: ['عقد قران', 'couple'], wedding: ['زفاف', 'couple'], henna: ['حنّة', 'couple'],
  birthday: ['عيد ميلاد', 'person'], newborn: ['مولود جديد', 'person'], graduation: ['تخرّج', 'person'], hajj: ['عودة من الحج', 'person'], anniversary: ['ذكرى زواج', 'couple'],
  iftar: ['إفطار رمضاني', 'host'], eid: ['معايدة العيد', 'host'],
  opening: ['افتتاح', 'org'], conference: ['مؤتمر', 'org'], official: ['حفل رسمي', 'org'], honor: ['حفل تكريم', 'org'], launch: ['إطلاق منتج', 'org'],
  condolence: ['مجلس فاتحة', 'mourning'],
};
const LEGACY_TYPE = { 'خطوبة': 'engagement', 'عقد قران': 'nikah', 'زفاف': 'wedding', 'حنّة': 'henna' };
const MOURNING_TPL = new Set(['pearl', 'marble', 'emerald', 'night', 'candles']);
const YT_RE = /^[A-Za-z0-9_-]{11}$/;
const RESERVED = new Set(['api', 'paid', 'panel', 'edit', 'og', 'mine', 'terms', 'admin', 'www', 'test', 'invite', 'assets', 'index', 'naqsh', 'static', 'robots', 'favicon', 'sitemap', 'login', 'dashboard']);
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
    if (!p.startsWith('/api/')) {
      const sm = req.method === 'GET' && p.match(/^\/([a-z0-9][a-z0-9-]{1,28}[a-z0-9])\/?$/);
      if (sm && !RESERVED.has(sm[1])) { try { const r = await ogPage(req, env, url, sm[1]); if (r) return r; } catch (e) { console.error(e); } }
      return env.ASSETS.fetch(req);
    }
    try {
      let m;
      if (req.method === 'GET' && (m = p.match(/^\/api\/slug\/([^/]+)$/))) return await slugCheck(env, decodeURIComponent(m[1]));
      if (req.method === 'POST' && p === '/api/orders') return await createOrder(req, env, url);
      if (req.method === 'GET' && (m = p.match(/^\/api\/orders\/([a-z0-9-]+)$/))) return await orderStatus(env, m[1]);
      if (req.method === 'POST' && p === '/api/wayl/webhook') return await webhook(req, env);
      if (req.method === 'GET' && (m = p.match(/^\/api\/invite\/([a-z0-9-]+)$/))) return await getInvite(env, m[1]);
      if (req.method === 'GET' && (m = p.match(/^\/api\/song\/([a-z0-9-]+)$/))) return await getSong(req, env, m[1]);
      if (req.method === 'POST' && (m = p.match(/^\/api\/rsvp\/([a-z0-9-]+)$/))) return await rsvpPost(req, env, m[1]);
      if (req.method === 'GET' && (m = p.match(/^\/api\/rsvp\/([a-z0-9-]+)$/))) return await rsvpList(env, m[1], url.searchParams.get('key') || '');
      if (req.method === 'GET' && (m = p.match(/^\/api\/manage\/([a-z0-9-]+)$/))) return await manageGet(env, m[1], url.searchParams.get('key') || '');
      if (req.method === 'POST' && (m = p.match(/^\/api\/edit\/([a-z0-9-]+)$/))) return await editInvite(req, env, m[1]);
      if (req.method === 'GET' && p === '/api/admin/orders') return await adminOrders(env, url.searchParams.get('key') || '');
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
function validate(d, opts = {}) {
  const out = {};
  if (!TEMPLATES[d.tpl]) return ['القالب غير صحيح'];
  out.tpl = d.tpl;
  const type = OCC[d.type] ? d.type : LEGACY_TYPE[d.type];
  if (!type) return ['نوع المناسبة غير صحيح'];
  out.type = type;
  const kind = OCC[type][1];
  if (kind === 'mourning' && !MOURNING_TPL.has(d.tpl)) return ['هذا القالب ما يناسب مجلس الفاتحة، اختار قالب هادئ'];
  const fields = [['family', 50, 1, 'الجهة الداعية'], ['groom', 40, 1, 'الاسم الرئيسي'], ['bride', 40, 0, 'السطر الثاني'], ['venue', 40, 1, 'المكان'], ['area', 50, 0, 'المنطقة'], ['note', 100, 0, 'الكلمة الختامية']];
  for (const [k, max, min, label] of fields) {
    const v = str(d[k], max, min);
    if (v === null) return [`${label} ${min ? 'مطلوب و' : ''}لازم ما يتجاوز ${max} حرف`];
    out[k] = v;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return ['التاريخ غير صحيح'];
  if (!/^\d{2}:\d{2}$/.test(d.time || '')) return ['الساعة غير صحيحة'];
  const when = Date.parse(d.date + 'T' + d.time + ':00+03:00');
  if (isNaN(when)) return ['التاريخ غير صحيح'];
  if (when < Date.now() - 6 * 3600e3) return ['تاريخ المناسبة لازم يكون بالمستقبل'];
  if (when > Date.now() + 2 * 365 * 864e5) return ['التاريخ بعيد هواية، اختار تاريخ خلال سنتين'];
  out.date = d.date; out.time = d.time; out.when = when;
  out.hideBride = !!d.hideBride; out.countdown = kind === 'mourning' ? false : !!d.countdown;
  const vm = ['quran', 'general', 'none'].includes(d.verseMode) ? d.verseMode : (d.verse === false ? 'none' : 'quran');
  out.verseMode = vm; out.verse = vm !== 'none';
  out.lang = ['ar', 'en', 'ku'].includes(d.lang) ? d.lang : 'ar';
  if (!opts.skipSlug) {
    const slug = String(d.slug || '').toLowerCase();
    const bad = slugProblem(slug);
    if (bad) return [bad];
    out.slug = slug;
  }
  return [null, out];
}
function parseYT(raw) {
  if (!raw || !raw.id) return null;
  const id = String(raw.id);
  if (!YT_RE.test(id)) return 'رابط يوتيوب غير صحيح';
  const start = Math.max(0, Math.min(36000, parseInt(raw.start, 10) || 0));
  let end = Math.max(0, Math.min(36000, parseInt(raw.end, 10) || 0));
  if (end && end <= start) return 'وقت نهاية الأغنية لازم يكون بعد وقت البداية';
  return { id, start, end };
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
    if (tier === 'silver') return fail('الأغنية متوفرة بالباقة الذهبية والماسية فقط');
    if (OCC[d.type][1] === 'mourning') return fail('مجلس الفاتحة يكون بدون أغنية');
    if (song.size > MAX_SONG) return fail('حجم الأغنية أكبر من ١٥ ميغا');
    const type = song.type || 'audio/mpeg';
    if (!/^audio\//.test(type)) return fail('ملف الأغنية لازم يكون صوت (MP3 أو M4A)');
    const start = Math.max(0, Math.min(1200, parseInt(raw.songStart, 10) || 0));
    songMeta = { type, start };
  }

  let yt = null;
  if (!songMeta && raw.yt) {
    const y = parseYT(raw.yt);
    if (typeof y === 'string') return fail(y);
    if (y && tier === 'silver') return fail('الأغنية متوفرة بالباقة الذهبية والماسية فقط');
    if (y && OCC[d.type][1] === 'mourning') return fail('مجلس الفاتحة يكون بدون أغنية');
    yt = y;
  }
  // reserve slug
  if (await slugState(env, d.slug)) return fail('هذا الرابط انحجز قبل شوية، اختار رابط ثاني', 409);
  const ref = 'nq-' + rid(10);
  await env.NAQSH.put('slug:' + d.slug, JSON.stringify({ ref, status: 'reserved' }), { expirationTtl: RESERVE_TTL });
  if (songMeta) {
    await env.NAQSH.put('song:' + ref, await song.arrayBuffer(), { expirationTtl: 2 * 86400, metadata: songMeta });
  }
  const order = { ref, status: 'pending', tier, total, tplName, data: d, song: songMeta, yt, createdAt: Date.now() };
  await env.NAQSH.put('order:' + ref, JSON.stringify(order), { expirationTtl: 3 * 86400 });

  const origin = url.origin;
  const body = {
    env: env.WAYL_ENV || 'live',
    referenceId: ref,
    total,
    currency: 'IQD',
    customParameter: d.slug,
    lineItem: [{ label: `دعوة ${OCC[d.type][0]} · باقة ${TIER_NAME[tier]} · قالب ${tplName}`, amount: total, type: 'increase' }],
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
  const ownerKey = rid(16);
  const invite = { ...order.data, slug, tier: order.tier, hasSong: !!order.song, songStart: order.song ? order.song.start : 0, yt: order.yt || null, ref, ownerKey, exp: expiration, paidAt: Date.now() };
  if (order.song) {
    const s = await env.NAQSH.getWithMetadata('song:' + ref, 'arrayBuffer');
    if (s && s.value) await env.NAQSH.put('songfile:' + slug, s.value, { expiration, metadata: s.metadata });
    else invite.hasSong = false;
  }
  await env.NAQSH.put('inv:' + slug, JSON.stringify(invite), { expiration });
  await env.NAQSH.put('slug:' + slug, JSON.stringify({ ref, status: 'active' }), { expiration });
  order.status = 'paid'; order.slug = slug; order.ownerKey = ownerKey; order.paidAt = Date.now(); order.waylStatus = w.status; order.paymentMethod = w.paymentMethod || null;
  await env.NAQSH.put('order:' + ref, JSON.stringify(order), { expiration });
  return order;
}
async function orderStatus(env, ref) {
  const o = await activate(env, ref);
  if (o.status === 'missing') return fail('الطلب غير موجود', 404);
  return json({ ok: true, status: o.status, slug: o.slug || o.data.slug, total: o.total, tier: o.tier, tpl: o.data.tpl, groom: o.data.groom, family: o.data.family, type: o.data.type, panelKey: o.status === 'paid' ? (o.ownerKey || null) : null, rsvp: RSVP_TIERS.has(o.tier), editUntil: o.paidAt ? o.paidAt + EDIT_WINDOW : null });
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
  const { ref, when, ownerKey, exp, paidAt, ...pub } = JSON.parse(raw);
  pub.rsvp = RSVP_TIERS.has(pub.tier);
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

/* ---------- RSVP (diamond) ---------- */
async function loadInvite(env, slug) { const raw = await env.NAQSH.get('inv:' + slug); return raw ? JSON.parse(raw) : null; }
async function rsvpPost(req, env, slug) {
  const inv = await loadInvite(env, slug);
  if (!inv || !RSVP_TIERS.has(inv.tier)) return fail('تأكيد الحضور غير متوفر لهذه الدعوة', 404);
  let b; try { b = await req.json(); } catch { return fail('بيانات غير صحيحة'); }
  const name = str(b.name, 40, 2); if (!name) return fail('اكتب اسمك (حرفين على الأقل)');
  const attending = !!b.attending;
  const count = attending ? Math.max(1, Math.min(20, parseInt(b.count, 10) || 1)) : 0;
  const message = str(b.message, 200, 0); if (message === null) return fail('التهنئة طويلة، اختصرها لـ ٢٠٠ حرف');
  const cid = String(b.cid || '').replace(/[^a-z0-9]/gi, '').slice(0, 24) || rid(12);
  const list = JSON.parse((await env.NAQSH.get('rsvp:' + slug)) || '[]');
  const i = list.findIndex(x => x.cid === cid);
  const row = { cid, name, attending, count, message, at: Date.now() };
  if (i >= 0) list[i] = row; else { if (list.length >= 1500) return fail('وصل عدد الردود للحد الأقصى'); list.push(row); }
  await env.NAQSH.put('rsvp:' + slug, JSON.stringify(list), inv.exp ? { expiration: inv.exp } : {});
  return json({ ok: true, cid });
}
async function rsvpList(env, slug, key) {
  const inv = await loadInvite(env, slug);
  if (!inv || !inv.ownerKey || !key || key.length !== inv.ownerKey.length || !timingSafe(key, inv.ownerKey)) return fail('الرابط غير صحيح', 403);
  const list = JSON.parse((await env.NAQSH.get('rsvp:' + slug)) || '[]').sort((a, b) => b.at - a.at).map(({ cid, ...r }) => r);
  const yes = list.filter(r => r.attending);
  return json({ ok: true, tier: inv.tier, rsvp: RSVP_TIERS.has(inv.tier), editUntil: inv.paidAt ? inv.paidAt + EDIT_WINDOW : null, invite: { groom: inv.groom, bride: inv.hideBride ? '' : inv.bride, family: inv.family, type: inv.type, date: inv.date, time: inv.time, venue: inv.venue }, totals: { replies: list.length, attending: yes.length, people: yes.reduce((n, r) => n + r.count, 0), declined: list.length - yes.length }, list });
}

/* ---------- owner admin: list recent orders (protected by ADMIN_KEY) ---------- */
async function adminOrders(env, key) {
  if (!env.ADMIN_KEY || key.length !== env.ADMIN_KEY.length || !timingSafe(key, env.ADMIN_KEY)) return fail('غير مسموح', 403);
  const out = [];
  let cursor;
  do { const l = await env.NAQSH.list({ prefix: 'order:', cursor }); for (const k of l.keys) { const o = JSON.parse((await env.NAQSH.get(k.name)) || 'null'); if (o) out.push({ ref: o.ref, status: o.status, waylStatus: o.waylStatus || null, tier: o.tier, total: o.total, tpl: o.data && o.data.tpl, slug: o.slug || (o.data && o.data.slug), groom: o.data && o.data.groom, song: !!o.song, createdAt: o.createdAt, paidAt: o.paidAt || null }) } cursor = l.list_complete ? null : l.cursor; } while (cursor);
  out.sort((a, b) => b.createdAt - a.createdAt);
  return json({ ok: true, count: out.length, orders: out });
}

/* ---------- owner: manage + edit within 24h ---------- */
function ownerOk(inv, key) { return inv && inv.ownerKey && key && key.length === inv.ownerKey.length && timingSafe(key, inv.ownerKey); }
async function manageGet(env, slug, key) {
  const inv = await loadInvite(env, slug);
  if (!ownerOk(inv, key)) return fail('الرابط غير صحيح', 403);
  const { ref, ownerKey, exp, ...data } = inv;
  return json({ ok: true, invite: data, editUntil: inv.paidAt ? inv.paidAt + EDIT_WINDOW : 0, rsvp: RSVP_TIERS.has(inv.tier) });
}
async function editInvite(req, env, slug) {
  let b; try { b = await req.json(); } catch { return fail('بيانات غير صحيحة'); }
  const inv = await loadInvite(env, slug);
  if (!ownerOk(inv, String(b.key || ''))) return fail('الرابط غير صحيح', 403);
  if (!inv.paidAt || Date.now() > inv.paidAt + EDIT_WINDOW) return fail('انتهت مدة التعديل (٢٤ ساعة بعد الدفع)', 403);
  const [err, d] = validate(b.data || {}, { skipSlug: true });
  if (err) return fail(err);
  if (TEMPLATES[d.tpl][1] !== inv.tier) return fail('تكدر تبدّل القالب بقالب من نفس الباقة بس');
  let yt = inv.yt || null;
  if (b.data && 'yt' in b.data) {
    const y = parseYT(b.data.yt);
    if (typeof y === 'string') return fail(y);
    if (y && inv.tier === 'silver') return fail('الأغنية متوفرة بالباقة الذهبية والماسية فقط');
    yt = y;
  }
  const kind = OCC[d.type][1];
  const expiration = Math.floor(Math.max(d.when + 30 * 864e5, Date.now() + 7 * 864e5) / 1000);
  const next = { ...inv, ...d, slug, yt: kind === 'mourning' ? null : yt, hasSong: kind === 'mourning' ? false : inv.hasSong, exp: expiration, editedAt: Date.now() };
  await env.NAQSH.put('inv:' + slug, JSON.stringify(next), { expiration });
  await env.NAQSH.put('slug:' + slug, JSON.stringify({ ref: inv.ref, status: 'active' }), { expiration });
  if (expiration !== inv.exp) {
    if (inv.hasSong) { const sf = await env.NAQSH.getWithMetadata('songfile:' + slug, 'arrayBuffer'); if (sf && sf.value) await env.NAQSH.put('songfile:' + slug, sf.value, { expiration, metadata: sf.metadata }); }
    const rs = await env.NAQSH.get('rsvp:' + slug); if (rs) await env.NAQSH.put('rsvp:' + slug, rs, { expiration });
  }
  return json({ ok: true });
}

/* ---------- WhatsApp / social link preview for each invitation ---------- */
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function ogPage(req, env, url, slug) {
  const inv = await loadInvite(env, slug);
  if (!inv) return null;
  const res = await env.ASSETS.fetch(new Request(url.origin + '/', req));
  if (!res.ok) return null;
  let html = await res.text();
  const occ = OCC[inv.type] || OCC[LEGACY_TYPE[inv.type]] || ['مناسبة', 'person'];
  const kind = occ[1];
  const names = kind === 'couple' ? inv.groom + (!inv.hideBride && inv.bride ? ' و ' + inv.bride : '') : inv.groom;
  const title = kind === 'mourning' ? `مجلس فاتحة المرحوم ${inv.groom}` : `دعوة ${occ[0]} · ${names}`;
  const d = new Date(Date.parse(inv.date + 'T' + inv.time + ':00+03:00'));
  const ds = new Intl.DateTimeFormat('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Baghdad' }).format(d);
  const desc = `${inv.family} · ${ds} · ${inv.venue}${inv.area ? '، ' + inv.area : ''}`;
  const img = `${url.origin}/og/${encodeURIComponent(inv.tpl)}.jpg`;
  const meta = `<meta property="og:type" content="website"><meta property="og:site_name" content="نقش · دعوات رقمية"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(desc)}"><meta property="og:url" content="${escH(url.origin + '/' + slug)}"><meta property="og:image" content="${escH(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="description" content="${escH(desc)}">`;
  html = html.replace(/<!--OG-->[\s\S]*?<!--\/OG-->/, '').replace('<title>نقش · دعوات رقمية</title>', `<title>${escH(title)}</title>${meta}`);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120' } });
}
