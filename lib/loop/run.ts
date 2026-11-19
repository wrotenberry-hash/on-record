import { getDb } from "@/db";
import { notifyUser } from "@/lib/push";
import { sendToReader } from "@/lib/mailer";
import { runLoopNotices } from "@/lib/loop/notices";
import { loopMeasures } from "@/lib/loop/marks";

/**
 * Closing the loop on the running site: hands lib/loop/notices.ts the database, the push sender, the mailer and the
 * secret that signs the one-time marks. Called once per scheduled update, after the Congress and Texas records are
 * refreshed. Safe to call again: a notice is written and sent once.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
/** The secret the marks are signed with: the site's one secret, under its own purpose (lib/loop/marks.ts adds the purpose). */
export const markSecret = () => process.env.EDITOR_ACCESS_KEY?.trim() || "";

export async function runLoop(now = Date.now()) {
  return runLoopNotices(getDb(), now, { notify: notifyUser, send: sendToReader, site: SITE, secret: markSecret() });
}

/** The weekly email's open rate and the return rate after a notice, for the What's next page. Totals only. */
export async function loopNumbers(now = Date.now()) { return loopMeasures(getDb(), now); }
