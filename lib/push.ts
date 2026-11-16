import { createECDH, createHash, createPrivateKey, sign } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { alertOutbox, alertPrefs, pushSubscriptions } from "@/db/schema";

/**
 * Round D web push without a new secret: the VAPID key pair is derived from
 * EDITOR_ACCESS_KEY under its own purpose (rotating that key re-keys push, and
 * readers re-enable it once). Pushes carry no payload: the service worker
 * fetches the alert text from /api/push/latest with the reader's own cookie,
 * so nothing personal passes through the browser's push service.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function vapidKeys() {
  const root = process.env.EDITOR_ACCESS_KEY?.trim();
  if (!root) return null;
  const d = createHash("sha256").update(`on-record:vapid:v1:${root}`).digest();
  const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey();
  const key = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  return { publicKey: b64u(pub), key };
}

function vapidJwt(endpoint: string, keys: NonNullable<ReturnType<typeof vapidKeys>>) {
  const aud = new URL(endpoint).origin;
  const part = (o: object) => b64u(Buffer.from(JSON.stringify(o)));
  const data = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })}`;
  return `${data}.${b64u(sign("sha256", Buffer.from(data), { key: keys.key, dsaEncoding: "ieee-p1363" }))}`;
}

export async function endpointHash(endpoint: string) { return createHash("sha256").update(endpoint).digest("hex"); }

async function pushOne(sub: typeof pushSubscriptions.$inferSelect, keys: NonNullable<ReturnType<typeof vapidKeys>>) {
  try {
    const res = await fetch(sub.endpoint, { method: "POST", headers: { TTL: "86400", Urgency: "normal", Authorization: `vapid t=${vapidJwt(sub.endpoint, keys)}, k=${keys.publicKey}`, "Content-Length": "0" }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 404 || res.status === 410) { await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpointHash, sub.endpointHash)); return false; }
    await getDb().update(pushSubscriptions).set(res.ok ? { lastSentAt: Date.now(), failures: 0 } : { failures: sub.failures + 1 }).where(eq(pushSubscriptions.endpointHash, sub.endpointHash));
    return res.ok;
  } catch { return false; }
}

/** Records an alert for the reader and pushes to their devices when they turned push on. */
export async function notifyUser(userId: string, alert: { title: string; body: string; url: string }) {
  const db = getDb();
  await db.insert(alertOutbox).values({ id: crypto.randomUUID(), userId, title: alert.title.slice(0, 120), body: alert.body.slice(0, 300), url: alert.url, createdAt: Date.now() });
  const prefs = await db.select().from(alertPrefs).where(eq(alertPrefs.userId, userId)).get();
  const keys = vapidKeys();
  if (!prefs?.push || !keys) return { pushed: 0 };
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let pushed = 0; for (const s of subs) if (await pushOne(s, keys)) pushed++;
  return { pushed };
}

export async function latestAlert(userId: string) {
  const db = getDb();
  const row = await db.select().from(alertOutbox).where(and(eq(alertOutbox.userId, userId), isNull(alertOutbox.seenAt))).orderBy(desc(alertOutbox.createdAt)).limit(1).get();
  if (row) await db.update(alertOutbox).set({ seenAt: Date.now() }).where(eq(alertOutbox.id, row.id));
  return row ?? null;
}
