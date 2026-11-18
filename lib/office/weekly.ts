import { getDb } from "@/db";
import { sendTo } from "@/lib/mailer";
import { OFFICE_EMAIL_FLAG, officeEmailCap, officeEmailEnabled } from "@/lib/office/email";
import { officeOptOutUrl, officeUrl } from "@/lib/office/session";
import { purgeOfficeData, sendOfficeEmails, type OfficeEmailRun } from "@/lib/office/store";

/**
 * The weekly office email, for the scheduled update (docs/OFFICE_EMAIL_DESIGN.md). OFF unless OFFICE_EMAIL_ENABLED is
 * "1": with the switch off this reads nothing and sends nothing. At most OFFICE_EMAIL_MAX_PER_RUN emails a run
 * (default 50). Email goes through the site's one mailer, which refuses to send until a sending domain is verified.
 * Not called from anywhere yet: the scheduled update needs one line (see the design note).
 */
export async function runOfficeEmails(now = Date.now()): Promise<OfficeEmailRun> {
  const run = await sendOfficeEmails(getDb(), {
    enabled: officeEmailEnabled(process.env[OFFICE_EMAIL_FLAG]), now, maxPerRun: officeEmailCap(process.env.OFFICE_EMAIL_MAX_PER_RUN),
    send: async (to, subject, text) => { const r = await sendTo(to, subject, text); return r.ok ? { ok: true } : { ok: false, error: r.error }; },
    links: async accountId => ({ dashboard: officeUrl("/office/dashboard"), optOut: await officeOptOutUrl(accountId, now) }),
  });
  if (run.enabled) console.log(`OFFICE_EMAIL week ${run.week} | due ${run.due} | sent ${run.sent} | failed ${run.failed} | nothing to show ${run.nothingToShow} | held ${run.held} | member gone ${run.memberGone} | over cap ${run.overCap}`);
  return run;
}

/** Housekeeping for the scheduled update: old office links, and addresses that asked for a link and never used one. */
export async function purgeOffice(now = Date.now()) { return purgeOfficeData(getDb(), now); }
