const { storageConfigured, storageBackend, listOrders, updateOrderStatus, saveOrder, appendOrderEvent } = require('../lib/orders');
const { authenticateRequest, securityConfigured } = require('../lib/admin-auth');
const { loadConfig, activeVehicleNames } = require('../lib/config');

const TRIP_LABELS = { departure: 'مغادرة', arrival: 'استقبال' };

function clean(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function toLatinDigits(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function normalizePhone(value) {
  const raw = toLatinDigits(clean(value, 40));
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return `+${digits}`;
  if (raw.startsWith('00') && digits.length > 2) return `+${digits.slice(2)}`;
  return digits;
}

function validPhone(value) {
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  if (/^(\d)\1{7,}$/.test(digits)) return false;
  return true;
}

function manualReference() {
  const d = new Date();
  const date = d.toISOString().slice(2, 10).replaceAll('-', '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TM-M-${date}-${rand}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = authenticateRequest(req);
  if (!session) return res.status(401).json({ error: 'انتهت جلسة الإدارة أو بيانات الدخول غير صحيحة.', code: 'UNAUTHORIZED' });

  if (req.method === 'GET') {
    if (!storageConfigured()) {
      return res.status(200).json({
        ok: true,
        orders: [],
        storageConfigured: false,
        storageBackend: null,
        securityConfigured: securityConfigured(),
        serverTime: new Date().toISOString(),
        warning: 'اللوحة جاهزة، لكن التخزين الدائم للطلبات غير مفعّل على Vercel.'
      });
    }
    try {
      const orders = await listOrders();
      return res.status(200).json({
        ok: true,
        orders,
        storageConfigured: true,
        storageBackend: storageBackend(),
        securityConfigured: securityConfigured(),
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Orders list error', error);
      return res.status(500).json({ error: 'تعذر تحميل الطلبات حالياً.' });
    }
  }

  if (req.method === 'POST') {
    if (!storageConfigured()) return res.status(503).json({ error: 'تخزين الطلبات غير مفعّل بعد.', code: 'STORAGE_NOT_CONFIGURED' });
    try {
      const name = clean(req.body?.name, 80);
      const phone = normalizePhone(req.body?.phone);
      const car = clean(req.body?.car, 60);
      const tripType = clean(req.body?.tripType, 20);
      const address = clean(req.body?.address, 500) || 'طلب يدوي من لوحة الإدارة';
      const notes = clean(req.body?.notes, 500);
      const passengers = Number(req.body?.passengers || 1);
      const bags = Number(req.body?.bags || 0);
      const latRaw = req.body?.lat;
      const lngRaw = req.body?.lng;
      const lat = latRaw === '' || latRaw == null ? null : Number(latRaw);
      const lng = lngRaw === '' || lngRaw == null ? null : Number(lngRaw);
      const config = await loadConfig();
      const allowedCars = activeVehicleNames(config);

      if (!name) return res.status(400).json({ error: 'اكتب اسم المسافر.' });
      if (!validPhone(phone)) return res.status(400).json({ error: 'رقم الهاتف غير صحيح.' });
      if (!allowedCars.has(car)) return res.status(400).json({ error: 'اختر سيارة فعّالة من قائمة الأسطول.' });
      if (!TRIP_LABELS[tripType]) return res.status(400).json({ error: 'اختر نوع الرحلة.' });
      if (!Number.isInteger(passengers) || passengers < 1 || passengers > 20 || !Number.isInteger(bags) || bags < 0 || bags > 50) {
        return res.status(400).json({ error: 'عدد الأشخاص أو الأمتعة غير صحيح.' });
      }
      if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) return res.status(400).json({ error: 'الإحداثيات غير صحيحة.' });

      const now = new Date().toISOString();
      const reference = manualReference();
      const maps = Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps?q=${lat},${lng}` : '';
      const order = {
        reference,
        createdAt: now,
        updatedAt: now,
        status: 'new',
        statusHistory: [{ type: 'created', status: 'new', at: now, actor: session.sub || 'admin' }],
        name,
        phone,
        car,
        tripType,
        tripLabel: TRIP_LABELS[tripType],
        passengers,
        bags,
        address,
        notes,
        lat,
        lng,
        maps,
        source: 'admin',
        telegram: 'not-sent',
      };
      await saveOrder(order);
      return res.status(201).json({ ok: true, order });
    } catch (error) {
      console.error('Manual order create error', error);
      return res.status(500).json({ error: 'تعذر إنشاء الطلب اليدوي.' });
    }
  }

  if (req.method === 'PATCH') {
    if (!storageConfigured()) return res.status(503).json({ error: 'تخزين الطلبات غير مفعّل بعد.', code: 'STORAGE_NOT_CONFIGURED' });
    try {
      const action = clean(req.body?.action, 30);
      if (action === 'note' || action === 'assign') {
        const reference = clean(req.body?.reference, 60);
        if (!reference) return res.status(400).json({ error: 'رقم الطلب مطلوب.' });
        const payload = action === 'note'
          ? { type: 'note', note: clean(req.body?.note, 600) }
          : { type: 'assignment', assignee: clean(req.body?.assignee, 100) };
        if (action === 'note' && !payload.note) return res.status(400).json({ error: 'اكتب الملاحظة الإدارية.' });
        if (action === 'assign' && !payload.assignee) return res.status(400).json({ error: 'اكتب اسم المسؤول.' });
        const order = await appendOrderEvent(reference, payload, session.sub || 'admin');
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود.' });
        return res.status(200).json({ ok: true, order });
      }

      const status = clean(req.body?.status, 30);
      if (!['new', 'confirmed', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'حالة الطلب غير صحيحة.' });

      const references = Array.isArray(req.body?.references)
        ? req.body.references.map((v) => clean(v, 60)).filter(Boolean).slice(0, 200)
        : [clean(req.body?.reference, 60)].filter(Boolean);
      if (!references.length) return res.status(400).json({ error: 'رقم الطلب مطلوب.' });

      const updated = [];
      for (const reference of references) {
        const order = await updateOrderStatus(reference, status, session.sub || 'admin');
        if (order) updated.push(order);
      }
      if (!updated.length) return res.status(404).json({ error: 'لم يتم العثور على الطلب.' });
      return res.status(200).json({ ok: true, order: updated[0], orders: updated, count: updated.length });
    } catch (error) {
      console.error('Order update error', error);
      return res.status(500).json({ error: 'تعذر تحديث الطلب.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
