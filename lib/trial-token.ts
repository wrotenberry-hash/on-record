/**
 * Invite links for the invite-only trial. The token is an HMAC of the invite id
 * under the editor's existing secret (domain-separated), so links can be shown
 * again on the editor page without storing them, and no new secret is needed.
 * Pure (Web Crypto only); tested in tests/trial.test.mjs.
 */
const enc = new TextEncoder();
const DOMAIN = "on-record:trial-invite:v1:";

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(DOMAIN + message)));
  return Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
}

export const INVITE_ID_PATTERN = /^inv_[a-z0-9]{10}$/;

/** "<invite id>.<32 hex>": the part after /trial/ in an invite link, and the cookie value. */
export async function inviteToken(secret: string, inviteId: string) {
  return `${inviteId}.${(await hmacHex(secret, inviteId)).slice(0, 32)}`;
}

/** The invite id when the token is genuine, else null. Constant-time compare. */
export async function verifyInviteToken(secret: string, token: string | null | undefined): Promise<string | null> {
  if (!secret || !token) return null;
  const [id, mac] = token.split(".");
  if (!id || !mac || !INVITE_ID_PATTERN.test(id) || !/^[0-9a-f]{32}$/.test(mac)) return null;
  const expected = (await hmacHex(secret, id)).slice(0, 32);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0 ? id : null;
}

export function newInviteId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `inv_${Array.from(bytes, b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")}`;
}

/**
 * Owner decision 2026-11-15: the trial opens on its own once OpenAI calls succeed in
 * production (the quick fixes and tracking ship in the same deploy as this code).
 */
export function trialGate(lastSuccessfulCallAt: number | null | undefined): { open: boolean; reason: string } {
  return lastSuccessfulCallAt ? { open: true, reason: "OpenAI calls are succeeding in production" }
    : { open: false, reason: "waiting for the first successful OpenAI call in production" };
}
