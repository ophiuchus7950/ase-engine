/**
 * Rivela ASE — stateless session tokens (HMAC-signed, node:crypto only).
 *
 * Token format: `v1.<base64url(payload)>.<base64url(sig)>` where payload is
 * `{ sub, org, exp }` and sig = HMAC-SHA256(payload, secret). The secret is
 * the shared API key (config.ASE_API_KEY) — single-user MVP keeps one secret.
 * No server-side session store: validity is self-contained in the token.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface TokenPayload {
  sub: string; // user id
  org: string; // organization id
  exp: number; // epoch ms
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(userId: string, organizationId: string, secret: string): string {
  const payload: TokenPayload = {
    sub: userId,
    org: organizationId,
    exp: Date.now() + TTL_MS,
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${VERSION}.${encoded}.${sign(encoded, secret)}`;
}

/** Returns the payload when the token is well-formed, signed, and unexpired. */
export function verifySessionToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, encoded, signature] = parts as [string, string, string];
  const expected = sign(encoded, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.sub !== 'string' || typeof payload.org !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
