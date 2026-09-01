const ORDER_PREFIX = 'orders/';
const ALLOWED_STATUSES = new Set(['new', 'confirmed', 'completed', 'cancelled']);

function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function storageConfigured() {
  return supabaseConfigured() || blobConfigured();
}

function storageBackend() {
  if (supabaseConfigured()) return 'supabase';
  if (blobConfigured()) return 'vercel-blob';
  return null;
}

function storageError() {
  const error = new Error('التخزين الدائم للطلبات غير مفعّل بعد.');
  error.code = 'STORAGE_NOT_CONFIGURED';
  return error;
}

function dbKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function dbBase() {
  return String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: dbKey(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

function toRow(order) {
  return {
    reference: order.reference,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    status: order.status,
    status_history: order.statusHistory || [],
    name: order.name,
    phone: order.phone,
    car: order.car,
    passengers: order.passengers,
    bags: order.bags,
    address: order.address,
    notes: order.notes || '',
    lat: order.lat,
    lng: order.lng,
    maps: order.maps,
    source: order.source || 'website',
    telegram: order.telegram || 'pending',
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    reference: row.reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    statusHistory: Array.isArray(row.status_history) ? row.status_history : [],
    name: row.name,
    phone: row.phone,
    car: row.car,
    passengers: Number(row.passengers) || 0,
    bags: Number(row.bags) || 0,
    address: row.address || '',
    notes: row.notes || '',
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    maps: row.maps || '',
    source: row.source || 'website',
    telegram: row.telegram || 'pending',
  };
}

async function supabaseRequest(path, options = {}) {
  if (!supabaseConfigured()) throw storageError();
  const response = await fetch(`${dbBase()}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {}),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' ? (data.message || data.hint || data.details) : text;
    const error = new Error(message || `Supabase request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function saveSupabaseOrder(order) {
  const rows = await supabaseRequest('orders?on_conflict=reference', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(toRow(order)),
  });
  return fromRow(Array.isArray(rows) ? rows[0] : null) || order;
}

async function getSupabaseOrder(reference) {
  const encoded = encodeURIComponent(String(reference || ''));
  const rows = await supabaseRequest(`orders?reference=eq.${encoded}&select=*&limit=1`, { method: 'GET' });
  return fromRow(Array.isArray(rows) ? rows[0] : null);
}

async function listSupabaseOrders() {
  const rows = await supabaseRequest('orders?select=*&order=created_at.desc&limit=10000', { method: 'GET' });
  return (Array.isArray(rows) ? rows : []).map(fromRow).filter(Boolean);
}

async function blobSdk() {
  if (!blobConfigured()) throw storageError();
  return import('@vercel/blob');
}

function orderPath(reference) {
  const safe = String(reference || '').replace(/[^A-Z0-9_-]/gi, '').slice(0, 60);
  if (!safe) throw new Error('Invalid order reference');
  return `${ORDER_PREFIX}${safe}.json`;
}

async function saveBlobOrder(order) {
  const { put } = await blobSdk();
  await put(orderPath(order.reference), JSON.stringify(order), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
  return order;
}

async function readBlobJson(urlOrPathname) {
  const { get } = await blobSdk();
  const result = await get(urlOrPathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

async function getBlobOrder(reference) {
  try {
    return await readBlobJson(orderPath(reference));
  } catch (error) {
    if (error && (error.status === 404 || error.statusCode === 404)) return null;
    throw error;
  }
}

async function listBlobOrders() {
  const { list } = await blobSdk();
  const blobs = [];
  let cursor;
  let pages = 0;
  do {
    const page = await list({ prefix: ORDER_PREFIX, limit: 1000, cursor });
    for (const blob of page.blobs || []) if (blob.pathname && blob.pathname.endsWith('.json')) blobs.push(blob);
    cursor = page.cursor;
    pages += 1;
  } while (cursor && pages < 10);

  const orders = [];
  for (let i = 0; i < blobs.length; i += 20) {
    const values = await Promise.all(blobs.slice(i, i + 20).map((blob) => readBlobJson(blob.url).catch(() => null)));
    for (const value of values) if (value && value.reference) orders.push(value);
  }
  return orders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function saveOrder(order) {
  if (supabaseConfigured()) return saveSupabaseOrder(order);
  if (blobConfigured()) return saveBlobOrder(order);
  throw storageError();
}

async function getOrder(reference) {
  if (supabaseConfigured()) return getSupabaseOrder(reference);
  if (blobConfigured()) return getBlobOrder(reference);
  throw storageError();
}

async function listOrders() {
  if (supabaseConfigured()) return listSupabaseOrders();
  if (blobConfigured()) return listBlobOrders();
  throw storageError();
}

async function updateOrderStatus(reference, status) {
  if (!ALLOWED_STATUSES.has(status)) throw new Error('Invalid status');
  const order = await getOrder(reference);
  if (!order) return null;
  const now = new Date().toISOString();
  order.status = status;
  order.updatedAt = now;
  order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  order.statusHistory.push({ status, at: now });
  await saveOrder(order);
  return order;
}

module.exports = {
  ALLOWED_STATUSES,
  storageConfigured,
  storageBackend,
  saveOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
};
