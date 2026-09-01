const { validateCredentials, createToken, SESSION_TTL_SECONDS, securityConfigured } = require('../lib/admin-auth');

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const username = clean(req.body?.username, 80);
  const password = clean(req.body?.password, 200);
  if (!username || !password || !validateCredentials(username, password)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }

  return res.status(200).json({
    ok: true,
    token: createToken(),
    expiresIn: SESSION_TTL_SECONDS,
    role: 'administrator',
    securityConfigured: securityConfigured(),
  });
};
