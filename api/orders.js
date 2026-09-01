const crypto = require('node:crypto');
const { storageConfigured, listOrders, updateOrderStatus } = require('../lib/orders');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_SHA256 = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function suppliedUsername(req) {
  return clean(req.headers['x-admin-username'], 80);
}

function suppliedPassword(req) {
  const header = clean(req.headers['x-admin-password'], 200);
  if (header) return header;
  const auth = clean(req.headers.authorization, 260);
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
}

function authenticated(req) {
  const usernameOk = secureEqual(suppliedUsername(req), ADMIN_USERNAME);
  const passwordOk = secureEqual(sha256(suppliedPassword(req)), ADMIN_PASSWORD_SHA256);
  return usernameOk && passwordOk;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!authenticated(req)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }

  if (req.method === 'GET') {
    if (!storageConfigured()) {
      return res.status(200).json({
        ok: true,
        orders: [],
        storageConfigured: false,
        warning: 'اللوحة جاهزة للعرض، لكن تخزين الطلبات الدائم بعده غير مفعّل على Vercel.'
      });
    }

    try {
      const orders = await listOrders();
      return res.status(200).json({ ok: true, orders, storageConfigured: true });
    } catch (error) {
      console.error('Orders list error', error);
      return res.status(500).json({ error: 'تعذر تحميل الطلبات حالياً.' });
    }
  }

  if (req.method === 'PATCH') {
    if (!storageConfigured()) {
      return res.status(503).json({
        error: 'تخزين الطلبات غير مفعّل بعد على Vercel.',
        code: 'STORAGE_NOT_CONFIGURED',
      });
    }

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
