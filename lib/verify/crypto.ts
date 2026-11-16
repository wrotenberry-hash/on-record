/**
 * Keyed hashes and address encryption for Round J, derived from the existing
 * EDITOR_ACCESS_KEY under their own purposes (no new secret, O-35). Rotating
 * that key makes stored addresses unreadable and phone hashes unmatched; the
 * district ids used for counting are unaffected.
 */
const enc = new TextEncoder();
const root = () => process.env.EDITOR_ACCESS_KEY?.trim() || "";

async function derive(purpose: string, usage: "hmac" | "aes") {
  const material = await crypto.subtle.digest("SHA-256", enc.encode(`on-record:${purpose}:${root()}`));
  return usage === "hmac"
    ? crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    : crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
const b64 = (u: Uint8Array) => { let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** HMAC-SHA256 under a per-purpose key: "phone", "ip", "device", "rate", "reason". */
export async function keyedHash(purpose: string, value: string) {
  if (!root()) throw new Error("EDITOR_ACCESS_KEY is not set");
  return hex(await crypto.subtle.sign("HMAC", await derive(`hash:${purpose}`, "hmac") as CryptoKey, enc.encode(value)));
}
export const shortHash = (h: string | null | undefined) => (h ? h.slice(0, 8) : "");

/** AES-256-GCM under a per-purpose key ("address:v1" for stored addresses, "pending-phone" for the 10-minute cookie). */
export async function encryptValue(purpose: string, plain: string) {
  if (!root()) throw new Error("EDITOR_ACCESS_KEY is not set");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await derive(`aes:${purpose}`, "aes") as CryptoKey, enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}
export async function decryptValue(purpose: string, cipher: string | null | undefined) {
  const [v, iv, ct] = String(cipher ?? "").split(".");
  if (v !== "v1" || !iv || !ct) return null;
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await derive(`aes:${purpose}`, "aes") as CryptoKey, unb64(ct))); }
  catch { return null; }
}
export const encryptAddress = (plain: string) => encryptValue("address:v1", plain);
export const decryptAddress = (cipher: string) => decryptValue("address:v1", cipher);
