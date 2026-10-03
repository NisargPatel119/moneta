// Single-user session: the cookie holds "<expiresAt>.<hmac>" signed with a key
// derived from APP_PASSWORD. Changing APP_PASSWORD signs out every device.

export const SESSION_COOKIE = 'ws_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

const encoder = new TextEncoder();

async function getKey() {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`wealth-sync-session:${password}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string) {
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) return null;
  return new Uint8Array(hex.match(/../g)!.map(h => parseInt(h, 16)));
}

export async function createSessionToken() {
  const key = await getKey();
  if (!key) throw new Error('APP_PASSWORD is not set');
  const expiresAt = String(Date.now() + SESSION_MAX_AGE * 1000);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(expiresAt));
  return `${expiresAt}.${toHex(sig)}`;
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  const key = await getKey();
  if (!key) return false;

  const [expiresAt, sigHex] = token.split('.');
  const sig = sigHex ? fromHex(sigHex) : null;
  if (!expiresAt || !sig || Number(expiresAt) < Date.now()) return false;

  // crypto.subtle.verify is constant-time
  return crypto.subtle.verify('HMAC', key, sig, encoder.encode(expiresAt));
}

// Constant-time password check: compare HMACs of both values instead of the raw strings
export async function checkPassword(attempt: string) {
  const key = await getKey();
  if (!key) return false;
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(process.env.APP_PASSWORD!));
  return crypto.subtle.verify('HMAC', key, expected, encoder.encode(attempt));
}
