"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireEditorUser } from "@/lib/auth";
import { withinLimit } from "@/lib/verify/store";

/**
 * Owner request 16 Nov 2026: start the scheduled update now instead of waiting for 13:00 or 19:00 UTC.
 * Editor sign-in only, at most once per 10 minutes and four times an hour (raised from two on 17 Nov for the writing-model trial), never within 10 minutes of a scheduled run. The secret stays on
 * the server: this calls the app's own update with the cron secret and does not wait for it to finish
 * (it runs for up to 5 minutes in its own function).
 */
export async function runUpdateNow() {
  await requireEditorUser("/editor/next");
  const now = new Date(), m = now.getUTCHours() * 60 + now.getUTCMinutes();
  if ([13 * 60, 19 * 60].some(t => Math.abs(m - t) <= 10)) redirect("/editor/next?run=scheduled#run");
  // 16 Nov: a double press started two runs at once, which duplicated work. One start per 10 minutes.
  if (!(await withinLimit("manual_run_gap", "owner"))) redirect("/editor/next?run=recent#run");
  if (!(await withinLimit("manual_run_hour", "owner"))) redirect("/editor/next?run=limit#run");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) redirect("/editor/next?run=nosecret#run");
  const h = await headers(), host = h.get("x-forwarded-host") ?? h.get("host"), proto = h.get("x-forwarded-proto") ?? "https";
  try {
    await fetch(`${proto}://${host}/api/automation/tick`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(4000), cache: "no-store" });
  } catch { /* expected: the update keeps running after this request stops waiting */ }
  redirect(`/editor/next?run=started&at=${now.getTime()}#run`);
}
