import { asc, eq, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { alertEvents, betaInvites } from "@/db/schema";
import { inviteToken, newInviteId, trialGate, verifyInviteToken } from "@/lib/trial-token";
import { lastSuccessfulCallAt } from "@/lib/model-calls";
import { utcDay } from "@/lib/event-dims";
import { BRAND } from "@/lib/brand";

/** Invite-only trial (owner decision 2026-11-15): 25 revocable links, opening on their own. */
export const TRIAL_COOKIE = "or_trial";
export const TRIAL_INVITES = 25;
export const TRIAL_COOKIE_MAX_AGE_S = 60 * 24 * 3600;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

function secret() { return process.env.EDITOR_ACCESS_KEY?.trim() || ""; }

export async function gateState() {
  const ok = await lastSuccessfulCallAt().catch(() => null);
  return trialGate(ok);
}

/** Creates the 25 invites the first time; later calls change nothing. */
export async function ensureInvites(count = TRIAL_INVITES) {
  const db = getDb();
  const have = Number((await db.select({ n: sql<number>`count(*)` }).from(betaInvites).get())?.n ?? 0);
  if (have >= count) return;
  const now = Date.now();
  const rows = Array.from({ length: count - have }, (_, i) => ({ id: newInviteId(), number: have + i + 1, createdAt: now }));
  await db.insert(betaInvites).values(rows).onConflictDoNothing();
}

export async function inviteLinks() {
  const rows = await getDb().select().from(betaInvites).orderBy(asc(betaInvites.number));
  const key = secret();
  return Promise.all(rows.map(async r => ({ ...r, url: key ? `${SITE_URL}/trial/${await inviteToken(key, r.id)}` : null })));
}

/** The token's invite when it is genuine and not revoked. */
export async function inviteForToken(token: string | null | undefined) {
  const id = await verifyInviteToken(secret(), token);
  if (!id) return { invite: null, problem: "invalid" as const };
  const invite = await getDb().select().from(betaInvites).where(eq(betaInvites.id, id)).get();
  if (!invite) return { invite: null, problem: "invalid" as const };
  if (invite.revokedAt) return { invite: null, problem: "revoked" as const };
  return { invite, problem: null };
}

/**
 * The trial reader on this request, or null. Requires a genuine, unrevoked invite
 * cookie and an open gate. Records only that the invite was used today.
 */
export async function currentInvite(): Promise<{ id: string; number: number; activeDays: number } | null> {
  try {
    const token = (await cookies()).get(TRIAL_COOKIE)?.value;
    let invite = token ? (await inviteForToken(token)).invite : null;
    // A reader who signed in by email on another device opens the site through the invite their account came from.
    if (!invite) {
      const { currentAccount } = await import("@/lib/accounts");
      const account = await currentAccount();
      if (account?.inviteId) invite = (await getDb().select().from(betaInvites).where(eq(betaInvites.id, account.inviteId)).get()) ?? null;
      if (invite?.revokedAt) invite = null;
    }
    if (!invite || !(await gateState()).open) return null;
    const day = utcDay();
    let activeDays = invite.activeDays;
    if (invite.lastActiveDay !== day) {
      activeDays += 1;
      const now = Date.now();
      // One page can ask who the reader is several times at the same moment (the page and its title): the day is
      // counted only by the first of them, so "active days" (and the feedback question on day three) cannot run ahead.
      await getDb().update(betaInvites).set({ lastActiveDay: day, lastSeenAt: now, firstSeenAt: invite.firstSeenAt ?? now, activeDays: sql`${betaInvites.activeDays} + 1` })
        .where(sql`${betaInvites.id} = ${invite.id} and (${betaInvites.lastActiveDay} is null or ${betaInvites.lastActiveDay} <> ${day})`);
    }
    return { id: invite.id, number: invite.number, activeDays };
  } catch { return null; }
}

/** Counts only, for the health probe. */
export async function trialCounts() {
  const db = getDb(), week = Date.now() - 7 * 24 * 3600 * 1000;
  const [all, used, active, revoked] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(betaInvites).get(),
    db.select({ n: sql<number>`count(*)` }).from(betaInvites).where(sql`${betaInvites.firstSeenAt} is not null`).get(),
    db.select({ n: sql<number>`count(*)` }).from(betaInvites).where(sql`${betaInvites.lastSeenAt} >= ${week} and ${betaInvites.revokedAt} is null`).get(),
    db.select({ n: sql<number>`count(*)` }).from(betaInvites).where(sql`${betaInvites.revokedAt} is not null`).get(),
  ]);
  const returned = await db.select({ n: sql<number>`count(*)` }).from(betaInvites).where(sql`${betaInvites.activeDays} >= 2`).get();
  // Weekly returning readers: invites used in the last 7 days on a later day than their first visit.
  const returning = await db.select({ n: sql<number>`count(*)` }).from(betaInvites)
    .where(sql`${betaInvites.lastSeenAt} >= ${week} and ${betaInvites.revokedAt} is null and ${betaInvites.activeDays} >= 2`).get();
  return { gate: await gateState(), invites: Number(all?.n ?? 0), used: Number(used?.n ?? 0), activeLast7Days: Number(active?.n ?? 0),
    usedOnTwoOrMoreDays: Number(returned?.n ?? 0), revoked: Number(revoked?.n ?? 0), returningLast7Days: Number(returning?.n ?? 0) };
}

/**
 * When the gate first opens: one email saying the trial is live and where the
 * links are (rule 5: report by email). Sent once, recorded like an alert.
 */
export async function sendTrialOpenIfDue(send: (subject: string, text: string) => Promise<{ ok: boolean; id?: string; error?: string }>) {
  try {
    const gate = await gateState();
    if (!gate.open) return { sent: false, reason: gate.reason };
    const db = getDb();
    const already = await db.select({ id: alertEvents.id }).from(alertEvents).where(eq(alertEvents.kind, "TRIAL_OPEN")).limit(1).get();
    if (already) return { sent: false, reason: "already sent" };
    await ensureInvites();
    const open = Number((await db.select({ n: sql<number>`count(*)` }).from(betaInvites).where(isNull(betaInvites.revokedAt)).get())?.n ?? 0);
    const subject = `[${BRAND.name}] The invite-only trial is open`;
    const text = [`OpenAI calls are succeeding in production, so the ${open} trial invite links now work.`, "",
      `Copy them from your phone: ${SITE_URL}/editor/trial`, "",
      "Each link opens the site for one person: Politicians, Issues, bills with their summaries, and Follow. Public reading stays off.",
      "Revoke any link on the same page; it stops working on the person's next visit.", "",
      "What is recorded: daily counts by page type, and per link only the days it was used. Never which bills, issues or members anyone viewed, beyond the members they choose to follow."].join("\n");
    const delivery = await send(subject, text);
    if (!delivery.ok) return { sent: false, reason: delivery.error ?? "send failed" };
    await db.insert(alertEvents).values({ id: crypto.randomUUID(), kind: "TRIAL_OPEN", sentAt: Date.now(), detail: text.slice(0, 1000),
      recipient: process.env.ALERT_TO_EMAIL?.trim() || "owner" });
    return { sent: true };
  } catch (error) { return { sent: false, reason: error instanceof Error ? error.message.slice(0, 120) : "failed" }; }
}
