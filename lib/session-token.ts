/**
 * Editor session tokens for the single-reviewer private build.
 *
 * The reviewer signs in once with EDITOR_ACCESS_KEY (a long random value kept
 * in the Vercel project). The server then issues a signed, expiring token in an
 * HttpOnly cookie. The token carries the reviewer's email and an expiry, signed
 * with HMAC-SHA256 under a key derived from the access key, so rotating the
 * access key invalidates every session. Nothing here is a password store; the
 * access key itself is never written anywhere but the environment.
 */
const encoder = new TextEncoder();
const VERSION = "v1";

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(accessKey: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`on-record-session:${accessKey}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function payload(email: string, expiresAt: number): string {
  return `${VERSION}.${base64url(encoder.encode(email))}.${expiresAt}`;
}

export async function signSession(accessKey: string, email: string, expiresAt: number): Promise<string> {
  const body = payload(email, expiresAt);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(accessKey), encoder.encode(body));
  return `${body}.${base64url(signature)}`;
}

export type VerifiedSession = { email: string; expiresAt: number };

/** Returns the session when the signature is valid and the token has not expired; otherwise null. */
export async function verifySession(accessKey: string | undefined | null, token: string | undefined | null, now = Date.now()): Promise<VerifiedSession | null> {
  if (!accessKey?.trim() || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, encodedEmail, expiryText, signature] = parts;
  const expiresAt = Number(expiryText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
  let email: string;
  try { email = new TextDecoder().decode(fromBase64url(encodedEmail)); } catch { return null; }
  if (!email) return null;
  const expected = await crypto.subtle.sign("HMAC", await hmacKey(accessKey.trim()), encoder.encode(payload(email, expiresAt)));
  if (!timingSafeEqual(base64url(expected), signature)) return null;
  return { email, expiresAt };
}

/** Constant-time comparison of the supplied access key against the configured one. */
export async function sameAccessKey(supplied: string, configured: string | undefined | null): Promise<boolean> {
  if (!configured?.trim() || !supplied) return false;
  const [a, b] = await Promise.all([supplied, configured.trim()].map(x => crypto.subtle.digest("SHA-256", encoder.encode(x))));
  return timingSafeEqual(base64url(a), base64url(b));
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
