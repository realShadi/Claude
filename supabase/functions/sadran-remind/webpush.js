// Web Push for Sadran's reminders: message encryption (RFC 8291, aes128gcm) and
// VAPID signing (RFC 8292), built on WebCrypto only so it runs in Deno and Node alike.

const te = new TextEncoder();

export function b64uEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// HKDF-SHA-256 for outputs of at most 32 bytes: extract with the salt, then one expand block.
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

// Encrypt one message for a browser subscription (single record, RFC 8188 framing).
export async function encrypt(payload, p256dh, auth) {
  const uaPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(te.encode(payload), new Uint8Array([2])); // 0x02: last record, no padding
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  const recordSize = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, sealed);
}

// The Authorization header that proves the message comes from this app's server.
export async function vapidAuthorization(endpoint, publicKey, privateJwk, subject) {
  const enc = obj => b64uEncode(te.encode(JSON.stringify(obj)));
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' +
    enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject });
  const { kty, crv, x, y, d } = privateJwk;
  const key = await crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto returns the raw r||s signature that ES256 expects.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned)));
  return 'vapid t=' + unsigned + '.' + b64uEncode(sig) + ', k=' + publicKey;
}

// Send one notification. Resolves { status, text }; 404 and 410 mean the subscription is gone.
export async function sendPush(subscription, payload, opts) {
  const body = await encrypt(payload, subscription.p256dh, subscription.auth);
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, opts.publicKey, opts.privateJwk, opts.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl || 86400),
      Urgency: 'normal',
    },
    body,
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, text: text.slice(0, 300) };
}
