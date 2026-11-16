import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { readerVisible } from "@/lib/analysis/publish-gate";
import { analysisBillSummaries, officialRollCalls, postQueue } from "@/db/schema";
import { publicReadEnabled, PUBLIC_READ_FLAG } from "@/lib/public-access";
import { resolveShare, type ShareParams, type ShareType } from "@/lib/share-resolve";
import { captionWith, shortLinkFor, SITE } from "@/lib/share";
import { voteKind } from "@/lib/federal/vote-kinds";
import { isQuietKill } from "@/lib/said-did-rules";
import { blueskyText } from "@/lib/share-rules";

/**
 * Round G: On Record's own accounts. Each day the scheduled run drafts up to three
 * posts from the record (a quiet kill if there was one, a bill explainer, and a
 * dashboard card). The owner approves each with one tap. Only cards whose every
 * block is Official may auto-post, and only once an account is connected.
 *
 * Hard stop: nothing ever posts while the site is private (PUBLIC_READ_ENABLED off),
 * and posting also needs SOCIAL_POSTING_ENABLED=1. No paid promotion, no replies,
 * no engagement automation; one post per item.
 */
const on = (v: string | undefined) => ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase());
export function socialConfig() {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]), postingFlag = on(process.env.SOCIAL_POSTING_ENABLED);
  const bluesky = !!(process.env.BLUESKY_HANDLE?.trim() && process.env.BLUESKY_APP_PASSWORD?.trim());
  const threads = !!(process.env.THREADS_USER_ID?.trim() && process.env.THREADS_ACCESS_TOKEN?.trim());
  return { publicRead, postingFlag, bluesky, threads, canPost: publicRead && postingFlag && (bluesky || threads),
    blocked: !publicRead ? "The site is private (PUBLIC_READ_ENABLED is off), so nothing posts." : !postingFlag ? "SOCIAL_POSTING_ENABLED is off." : !(bluesky || threads) ? "No account is connected yet." : null };
}
export const QUEUE_ONLY = ["X", "Instagram", "TikTok"] as const;

const DASH = ["funnel", "control", "players"] as const;
async function draft(day: string, type: ShareType, p: ShareParams, subject: string, now: number) {
  const r = await resolveShare(type, p);
  if (!r) return false;
  const link = await shortLinkFor(`/share/card?${r.query}`, r.type);
  const image = r.slides ? `/api/cards/g?${r.query}&n=1` : `/api/cards/g?${r.query}&format=feed`;
  const res = await getDb().insert(postQueue).values({ id: crypto.randomUUID(), day, kind: type, subject, imagePath: image, link: link ?? `${SITE}/share/card?${r.query}`,
    caption: captionWith(r.caption, link ?? `${SITE}/share/card?${r.query}`), officialOnly: r.officialOnly ? 1 : 0, createdAt: now }).onConflictDoNothing();
  return res.rowsAffected > 0;
}

/** The daily auto-drafted queue. Idempotent per day. */
export async function draftDailyPosts(now = Date.now()) {
  const db = getDb(), day = new Date(now).toISOString().slice(0, 10);
  const existing = await db.select({ id: postQueue.id }).from(postQueue).where(eq(postQueue.day, day));
  if (existing.length >= 3) return { day, drafted: 0, skipped: "already drafted" };
  let drafted = 0;
  const recent = await db.select({ id: officialRollCalls.id, question: officialRollCalls.question, title: officialRollCalls.title, result: officialRollCalls.result, billId: officialRollCalls.billId })
    .from(officialRollCalls).where(gte(officialRollCalls.votedAt, now - 3 * 86400e3)).orderBy(desc(officialRollCalls.votedAt)).limit(60);
  const quiet = recent.find(r => r.billId && isQuietKill(voteKind(r.question, r.title), r.question, r.result));
  if (quiet && await draft(day, "quiet", { roll: quiet.id }, quiet.id, now)) drafted++;
  const billIds = [...new Set(recent.map(r => r.billId).filter((b): b is string => !!b))];
  if (billIds.length) {
    const withSummary = await db.select({ billId: analysisBillSummaries.billId }).from(analysisBillSummaries).where(and(inArray(analysisBillSummaries.billId, billIds), readerVisible()));
    const pick = billIds.find(b => withSummary.some(s => s.billId === b));
    if (pick && await draft(day, "carousel", { bill: pick }, pick, now)) drafted++;
  }
  const kind = DASH[new Date(now).getUTCDay() % DASH.length];
  if (await draft(day, "dash", { kind }, kind, now)) drafted++;
  const auto = await autoPostOfficial(now);
  return { day, drafted, auto };
}

/** Official-only drafts post themselves once posting is allowed and an account is connected. */
async function autoPostOfficial(now: number) {
  if (!socialConfig().canPost) return { posted: 0, reason: socialConfig().blocked };
  const rows = await getDb().select().from(postQueue).where(and(eq(postQueue.status, "draft"), eq(postQueue.officialOnly, 1))).limit(3);
  let posted = 0;
  for (const r of rows) if ((await postNow(r.id, now)) === "posted") posted++;
  return { posted };
}

export async function decidePost(id: string, decision: "approve" | "reject", caption: string | null, now = Date.now()) {
  const db = getDb(), row = await db.select().from(postQueue).where(eq(postQueue.id, id)).get();
  if (!row || (row.status !== "draft" && row.status !== "failed")) return "gone";
  if (decision === "reject") { await db.update(postQueue).set({ status: "rejected", decidedAt: now }).where(eq(postQueue.id, id)); return "rejected"; }
  const text = caption?.trim() ? caption.trim().slice(0, 600) : row.caption;
  await db.update(postQueue).set({ status: "approved", caption: text, decidedAt: now }).where(eq(postQueue.id, id));
  return socialConfig().canPost ? postNow(id, now) : "approved";
}

/** Posts one approved (or official-only) item to every connected account. */
export async function postNow(id: string, now = Date.now()) {
  const cfg = socialConfig();
  if (!cfg.canPost) return "blocked";
  const db = getDb(), row = await db.select().from(postQueue).where(eq(postQueue.id, id)).get();
  if (!row || row.status === "posted" || row.status === "rejected") return "gone";
  const done: Record<string, string> = { ...(row.postedTo ?? {}) }, errors: string[] = [];
  const imageUrl = `${SITE}${row.imagePath}`;
  if (cfg.bluesky && !done.bluesky) await postBluesky(row.caption, row.link, imageUrl).then(u => { done.bluesky = u; }).catch(e => errors.push(`Bluesky: ${(e as Error).message}`.slice(0, 200)));
  if (cfg.threads && !done.threads) await postThreads(row.caption, imageUrl).then(u => { done.threads = u; }).catch(e => errors.push(`Threads: ${(e as Error).message}`.slice(0, 200)));
  const status = errors.length && !Object.keys(done).length ? "failed" : "posted";
  await db.update(postQueue).set({ status, postedTo: done, error: errors.join("; ") || null, postedAt: status === "posted" ? now : null }).where(eq(postQueue.id, id));
  return status;
}

async function postBluesky(caption: string, link: string, imageUrl: string) {
  const base = process.env.BLUESKY_SERVICE?.trim() || "https://bsky.social";
  const s = await fetch(`${base}/xrpc/com.atproto.server.createSession`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: process.env.BLUESKY_HANDLE!.trim(), password: process.env.BLUESKY_APP_PASSWORD!.trim() }), signal: AbortSignal.timeout(15_000) });
  if (!s.ok) throw new Error(`sign-in ${s.status}`);
  const { accessJwt, did } = await s.json() as { accessJwt: string; did: string };
  const img = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!img.ok) throw new Error(`card ${img.status}`);
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.length > 976_000) throw new Error("card image over Bluesky's 976 KB limit");
  const up = await fetch(`${base}/xrpc/com.atproto.repo.uploadBlob`, { method: "POST", headers: { "content-type": "image/png", authorization: `Bearer ${accessJwt}` }, body: bytes, signal: AbortSignal.timeout(20_000) });
  if (!up.ok) throw new Error(`upload ${up.status}`);
  const { blob } = await up.json() as { blob: unknown };
  const { text, facets } = blueskyText(caption, link);
  const rec = await fetch(`${base}/xrpc/com.atproto.repo.createRecord`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accessJwt}` }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text, facets, langs: ["en"], createdAt: new Date().toISOString(),
      embed: { $type: "app.bsky.embed.images", images: [{ alt: "A card from On Record: an official record with its source.", image: blob }] } } }) });
  if (!rec.ok) throw new Error(`post ${rec.status}`);
  return ((await rec.json()) as { uri: string }).uri;
}

async function postThreads(caption: string, imageUrl: string) {
  const base = process.env.THREADS_API_BASE?.trim() || "https://graph.threads.net/v1.0", user = process.env.THREADS_USER_ID!.trim(), token = process.env.THREADS_ACCESS_TOKEN!.trim();
  const create = await fetch(`${base}/${user}/threads?${new URLSearchParams({ media_type: "IMAGE", image_url: imageUrl, text: caption.slice(0, 500), access_token: token })}`, { method: "POST", signal: AbortSignal.timeout(20_000) });
  if (!create.ok) throw new Error(`container ${create.status}`);
  const { id } = await create.json() as { id: string };
  const pub = await fetch(`${base}/${user}/threads_publish?${new URLSearchParams({ creation_id: id, access_token: token })}`, { method: "POST", signal: AbortSignal.timeout(20_000) });
  if (!pub.ok) throw new Error(`publish ${pub.status}`);
  return ((await pub.json()) as { id: string }).id;
}

export async function postQueueList(limit = 30) {
  return getDb().select().from(postQueue).orderBy(desc(postQueue.createdAt)).limit(limit);
}
export async function postQueueCounts() {
  const rows = await getDb().select({ status: postQueue.status }).from(postQueue);
  return rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
}
