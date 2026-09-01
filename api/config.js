const { authenticateRequest } = require('../lib/admin-auth');
const { storageConfigured } = require('../lib/orders');
const { loadConfig, saveConfig, publicConfig, sanitizeConfig } = require('../lib/config');

module.exports = async function handler(req, res) {
  const session = authenticateRequest(req);
  res.setHeader('Cache-Control', session ? 'no-store' : 'public, max-age=0, must-revalidate');

  if (req.method === 'GET') {
    try {
      const config = await loadConfig();
      return res.status(200).json({
        ok: true,
        storageConfigured: storageConfigured(),
        admin: Boolean(session),
        config: session ? sanitizeConfig(config) : publicConfig(config),
      });
    } catch (error) {
      console.error('Config read error', error);
      return res.status(500).json({ error: 'تعذر تحميل إعدادات الموقع.' });
    }
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    if (!session) return res.status(401).json({ error: 'جلسة الإدارة غير صالحة.', code: 'UNAUTHORIZED' });
    if (!storageConfigured()) return res.status(503).json({ error: 'التخزين الدائم غير مفعّل؛ لا يمكن حفظ الإعدادات.', code: 'STORAGE_NOT_CONFIGURED' });
    try {
      const incoming = sanitizeConfig(req.body?.config || req.body || {});
      if (!incoming.vehicles.some((v) => v.active)) return res.status(400).json({ error: 'يجب إبقاء سيارة واحدة فعّالة على الأقل.' });
      const config = await saveConfig(incoming, session.sub || 'admin');
      return res.status(200).json({ ok: true, config: sanitizeConfig(config), storageConfigured: true, admin: true });
    } catch (error) {
      console.error('Config save error', error);
      return res.status(error?.code === 'STORAGE_NOT_CONFIGURED' ? 503 : 500).json({ error: error?.message || 'تعذر حفظ الإعدادات.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
