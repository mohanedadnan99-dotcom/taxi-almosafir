const { storageConfigured, saveOrder } = require('../lib/orders');
const { loadConfig, activeVehicleNames } = require('../lib/config');

const TRIP_LABELS = {
  departure: 'مغادرة',
  arrival: 'استقبال',
};

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
  const fakeTails = new Set([
    '00000000', '11111111', '22222222', '33333333', '44444444',
    '55555555', '66666666', '77777777', '88888888', '99999999',
    '12345678', '87654321'
  ]);
  return !fakeTails.has(digits.slice(-8));
}

function escapeHtml(value) {
  return clean(value, 1000)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function reference() {
  const d = new Date();
  const date = d.toISOString().slice(2, 10).replaceAll('-', '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TM-${date}-${rand}`;
}

async function telegram(method, payload, token) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }
  return data;
}

module.exports = async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (req.method === 'GET') {
    const config = await loadConfig().catch(() => null);
    return res.status(200).json({
      telegramConfigured: Boolean(token && chatId),
      orderStorageConfigured: storageConfigured(),
      activeVehicles: config ? [...activeVehicleNames(config)] : [],
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!token || !chatId) {
    console.error('Telegram env vars are missing');
    return res.status(503).json({ error: 'ربط التلكرام يحتاج تفعيل بيانات البوت على Vercel.' });
  }

  try {
    const body = req.body || {};
    const name = clean(body.name, 80);
    const phone = normalizePhone(body.phone);
    const car = clean(body.car, 60);
    const tripType = clean(body.tripType, 20);
    const address = clean(body.address, 500) || 'موقع محدد من الخريطة';
    const notes = clean(body.notes, 500);
    const passengers = Number(body.passengers);
    const bags = Number(body.bags);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const config = await loadConfig();
    const allowedCars = activeVehicleNames(config);

    if (!name) {
      return res.status(400).json({ error: 'اكتب اسم المسافر.' });
    }
    if (!validPhone(phone)) {
      return res.status(400).json({ error: 'رقم الهاتف غير صحيح. استخدم رقماً حقيقياً محلياً أو دولياً.' });
    }
    if (!allowedCars.has(car)) {
      return res.status(400).json({ error: 'اختر سيارة متاحة حالياً من القائمة.' });
    }
    if (!TRIP_LABELS[tripType]) {
      return res.status(400).json({ error: 'اختار نوع الرحلة: مغادرة أو استقبال.' });
    }
    if (!Number.isInteger(passengers) || passengers < 1 || passengers > 20 || !Number.isInteger(bags) || bags < 0 || bags > 50) {
      return res.status(400).json({ error: 'عدد الأشخاص أو الحقائب غير صحيح.' });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'الموقع غير صحيح.' });
    }

    const ref = reference();
    const createdAt = new Date().toISOString();
    const maps = `https://www.google.com/maps?q=${lat},${lng}`;
    const order = {
      reference: ref,
      createdAt,
      updatedAt: createdAt,
      status: 'new',
      statusHistory: [{ type: 'created', status: 'new', at: createdAt, actor: 'website' }],
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
      source: 'website',
      telegram: 'pending',
    };

    let stored = false;
    if (storageConfigured()) {
      try {
        await saveOrder(order);
        stored = true;
      } catch (error) {
        console.error('Order storage error before Telegram', error);
      }
    } else {
      console.warn('Order storage is not configured; booking will only be sent to Telegram.');
    }

    const text = [
      '<b>حجز جديد — تكسي المسافر</b>',
      '',
      `<b>رقم الحجز:</b> ${escapeHtml(ref)}`,
      `<b>نوع الرحلة:</b> ${escapeHtml(TRIP_LABELS[tripType])}`,
      `<b>اسم المسافر:</b> ${escapeHtml(name)}`,
      `<b>عدد الأشخاص:</b> ${passengers}`,
      `<b>عدد الحقائب:</b> ${bags}`,
      `<b>رقم الهاتف:</b> ${escapeHtml(phone)}`,
      `<b>نوع السيارة المطلوبة:</b> ${escapeHtml(car)}`,
      `<b>العنوان:</b> ${escapeHtml(address)}`,
      notes ? `<b>ملاحظة:</b> ${escapeHtml(notes)}` : null,
      `<b>الوكيشن:</b> <a href="${maps}">فتح الموقع على الخريطة</a>`
    ].filter(Boolean).join('\n');

    try {
      await telegram('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{ text: 'فتح الوكيشن', url: maps }]]
        }
      }, token);

      await telegram('sendLocation', {
        chat_id: chatId,
        latitude: lat,
        longitude: lng
      }, token);

      if (stored) {
        order.telegram = 'sent';
        order.updatedAt = new Date().toISOString();
        await saveOrder(order).catch((error) => console.error('Order Telegram status save error', error));
      }

      return res.status(201).json({ ok: true, reference: ref, stored });
    } catch (error) {
      if (stored) {
        order.telegram = 'failed';
        order.updatedAt = new Date().toISOString();
        await saveOrder(order).catch((saveError) => console.error('Order failure status save error', saveError));
      }
      throw error;
    }
  } catch (error) {
    console.error('Booking Telegram error', error);
    return res.status(502).json({ error: 'تعذر إرسال الحجز للتلكرام حالياً، حاول مرة ثانية.' });
  }
};
