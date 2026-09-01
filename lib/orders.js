const ORDER_PREFIX = 'orders/';
const ALLOWED_STATUSES = new Set(['new', 'confirmed', 'completed', 'cancelled']);

function storageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function storageError() {
  const error = new Error('التخزين الدائم للطلبات غير مفعّل بعد.');
  error.code = 'STORAGE_NOT_CONFIGURED';
  return error;
}

async function blobSdk() {
  if (!storageConfigured()) throw storageError();
  return import('@vercel/blob');
}

function orderPath(reference) {
  const safe = String(reference || '').replace(/[^A-Z0-9_-]/gi, '').slice(0, 60);
  if (!safe) throw new Error('Invalid order reference');
  return `${ORDER_PREFIX}${safe}.json`;
}

async function saveOrder(order) {
  const { put } = await blobSdk();
  const pathname = orderPath(order.reference);
  await put(pathname, JSON.stringify(order), {
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

async function getOrder(reference) {
  try {
    return await readBlobJson(orderPath(reference));
  } catch (error) {
    if (error && (error.status === 404 || error.statusCode === 404)) return null;
    throw error;
  }
}

async function listOrders() {
  const { list } = await blobSdk();
  const blobs = [];
  let cursor;
  let pages = 0;

  do {
    const page = await list({ prefix: ORDER_PREFIX, limit: 1000, cursor });
    for (const blob of page.blobs || []) {
      if (blob.pathname && blob.pathname.endsWith('.json')) blobs.push(blob);
    }
    cursor = page.cursor;
    pages += 1;
  } while (cursor && pages < 10);

  const orders = [];
  const batchSize = 20;
  for (let i = 0; i < blobs.length; i += batchSize) {
    const batch = blobs.slice(i, i + batchSize);
    const values = await Promise.all(batch.map((blob) => readBlobJson(blob.url).catch(() => null)));
    for (const value of values) if (value && value.reference) orders.push(value);
  }

  return orders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
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
  saveOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
};
