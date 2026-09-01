const crypto = require('node:crypto');

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD_SHA256 = '13dc3c25cae3c5fdce1a18bc332d780fa19802bf08cb10c345c123becc2841c1';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function username() {
  return String(process.env.ADMIN_USERNAME || DEFAULT_USERNAME).trim();
}

function passwordHash() {
  if (process.env.ADMIN_PASSWORD_SHA256) return String(process.env.ADMIN_PASSWORD_SHA256).trim().toLowerCase();
  if (process.env.ADMIN_PASSWORD) return sha256(process.env.ADMIN_PASSWORD);
  return DEFAULT_PASSWORD_SHA256;
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || sha256(`taxi-almosafir:${passwordHash()}:session-v1`);
}

function securityConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && (process.env.ADMIN_PASSWORD_SHA256 || process.env.ADMIN_PASSWORD) && process.env.ADMIN_SESSION_SECRET);
}

function validateCredentials(inputUsername, inputPassword) {
  const userOk = secureEqual(String(inputUsername || '').trim(), username());
  const passOk = secureEqual(sha256(inputPassword), passwordHash());
  return userOk && passOk;
}

function createToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: username(),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    role: 'administrator',
  }), 'utf8').toString('base64url');
  return `${payload}.${hmac(payload, sessionSecret())}`;
}

function verifyToken(token) {
  try {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return null;
    const expected = hmac(payload, sessionSecret());
    if (!secureEqual(signature, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!data || data.sub !== username() || !data.exp || data.exp <= now) return null;
    return data;
  } catch {
    return null;
  }
}

function bearer(req) {
  const auth = String(req.headers.authorization || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function authenticateRequest(req) {
  return verifyToken(bearer(req));
}

module.exports = {
  SESSION_TTL_SECONDS,
  securityConfigured,
  validateCredentials,
  createToken,
  verifyToken,
  authenticateRequest,
};
