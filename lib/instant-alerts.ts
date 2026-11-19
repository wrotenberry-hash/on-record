import { getDb } from "@/db";
import { notifyUser } from "@/lib/push";
import { sendTo } from "@/lib/mailer";
import { runVoteAlerts } from "@/lib/loop/alerts";

/**
 * Vote alerts, after each update of the record (owner's point 2, 18 Nov 2026): a reader whose setting is on hears
 * about every vote on a bill by a legislator they follow, in one message per update. The rule is lib/loop/alerts.ts;
 * this file hands it the database, the push sender and the mailer.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
export async function runInstantAlerts(now = Date.now()) {
  return runVoteAlerts(getDb(), now, { notify: notifyUser, send: sendTo, site: SITE });
}
