const crypto = require('node:crypto');
const { storageConfigured, listOrders, updateOrderStatus } = require('../lib/orders');

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function suppliedPassword(req) {
  const header = clean(req.headers['x-admin-password'], 200);
  if (header) return header;
  const auth = clean(req.headers.authorization, 260);
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
}

function noStore(res) {
  return res.status(503).json({
    error: 'تخزين الطلبات غير مفعّل بعد على Vercel.',
    code: 'STORAGE_NOT_CONFIGURED',
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!adminConfigured()) {
    return res.status(503).json({
      error: 'دخول لوحة الإدارة غير مفعّل بعد.',
      code: 'ADMIN_NOT_CONFIGURED',
    });
  }

  if (!secureEqual(suppliedPassword(req), process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
  }

  if (!storageConfigured()) return noStore(res);

  if (req.method === 'GET') {
    try {
      const orders = await listOrders();
      return res.status(200).json({ ok: true, orders });
    } catch (error) {
      console.error('Orders list error', error);
      return res.status(500).json({ error: 'تعذر تحميل الطلبات حالياً.' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const reference = clean(req.body?.reference, 60);
      const status = clean(req.body?.status, 30);
      if (!reference || !['new', 'confirmed', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'بيانات تحديث الطلب غير صحيحة.' });
      }
      const order = await updateOrderStatus(reference, status);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود.' });
      return res.status(200).json({ ok: true, order });
    } catch (error) {
      console.error('Order status update error', error);
      return res.status(500).json({ error: 'تعذر تحديث حالة الطلب.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
