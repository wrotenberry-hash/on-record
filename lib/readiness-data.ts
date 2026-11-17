import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { coverage90d } from "@/lib/analysis/queries";
import { PRIMERS } from "@/lib/analysis/primers";
import { PUBLIC_MIN_PROMPT } from "@/lib/analysis/publish-gate";
import { EVIDENCE } from "@/lib/readiness-evidence";
import { readiness, readinessTotals, type Check, type ReadinessInput } from "@/lib/readiness";
import { bookingUrl } from "@/lib/trial-welcome";
import { texasCounts } from "@/lib/texas/ingest";
import { txCalendar, txToday } from "@/lib/texas/calendar";

/** One number from the database; 0 when the table is empty or the query fails (a failed count must never read as a pass). */
async function count(query: ReturnType<typeof sql>): Promise<number> {
  try { return Number((await getDb().get<{ n: number }>(query))?.n ?? 0); } catch { return 0; }
}

/** The test-ready checklist with today's numbers (docs/TEST_READY_BUILD.md). Used by Editor → What's next and the health probe. */
export async function readinessNow(now = Date.now()): Promise<{ checks: Check[]; totals: ReturnType<typeof readinessTotals> }> {
  const [cov, federalMembers, federalContacts, texasMembers, texasContacts, hearings, txSen, txRep, txCommittees, invites, errorsBroken] = await Promise.all([
    coverage90d(now).catch(() => null),
    count(sql`select count(*) as n from official_politicians where is_current = 1`),
    count(sql`select count(*) as n from legislator_contacts c join official_politicians p on p.id = c.member_id where c.kind = 'federal' and p.is_current = 1 and (c.phone is not null or c.contact_form_url is not null)`),
    count(sql`select count(*) as n from tx_people where is_current = 1`),
    count(sql`select count(*) as n from legislator_contacts c join tx_people p on p.id = c.member_id where c.kind = 'texas' and p.is_current = 1 and c.phone is not null`),
    count(sql`select count(*) as n from official_committee_meetings where starts_at >= ${new Date(now).toISOString().slice(0, 10)}`),
    count(sql`select count(*) as n from tx_people where is_current = 1 and lower(chamber) in ('upper', 'senate')`),
    count(sql`select count(*) as n from tx_people where is_current = 1 and lower(chamber) in ('lower', 'house')`),
    count(sql`select count(*) as n from tx_committees`),
    count(sql`select count(*) as n from beta_invites where revoked_at is null`),
    // The same fault three or more times in an hour on any one day counts as broken until the quality builder's finer rule is merged.
    count(sql`select count(*) as n from error_events where day = ${new Date(now).toISOString().slice(0, 10)} and n >= 3 and last_at >= ${now - 3_600_000}`),
  ]);
  // Texas: seats, committees and whether the update will follow the 2027 session, from the same numbers the probe shows.
  const tx = await texasCounts(now).catch(() => null) as { members?: { senators?: number; representatives?: number }; committees?: { total?: number }; readyForSession?: boolean; notReadyReasons?: string[] } | null;
  const txDates = (() => { try { return txCalendar(txToday(now)).rows.length; } catch { return 0; } })();
  const input: ReadinessInput = {
    now, brand: EVIDENCE.brand, flow: EVIDENCE.flow,
    influence: { federalMembers, federalWithPhoneOrForm: federalContacts, texasMembers, texasWithPhone: texasContacts, hearingsStored: hearings, ...EVIDENCE.influence, hearingsStepLive: hearings > 0 },
    content: { bills90d: cov?.bills ?? 0, passing90d: cov?.passing ?? 0, held90d: cov?.held ?? 0,
      primersReviewed: PRIMERS.filter(p => p.reviewed).length, primersWaiting: PRIMERS.filter(p => !p.reviewed).length,
      txSenators: tx?.members?.senators ?? txSen, txRepresentatives: tx?.members?.representatives ?? txRep, txCommittees: tx?.committees?.total ?? txCommittees, txCalendarDates: txDates,
      txReadyForSession: tx ? !!tx.readyForSession : null, txNotReadyWhy: (tx?.notReadyReasons ?? []).join(" ") },
    trust: { ...EVIDENCE.trust, correctionsLog: true, contactEmail: !!process.env.PUBLIC_CONTACT_EMAIL?.trim() },
    quality: { ...EVIDENCE.quality, breakageNow: errorsBroken > 0 },
    trial: { invites, welcomeScreen: EVIDENCE.welcomeScreen, bookingLink: !!bookingUrl(process.env.TRIAL_BOOKING_URL), summariesShownToTrial: PUBLIC_MIN_PROMPT !== null },
  };
  const checks = readiness(input);
  return { checks, totals: readinessTotals(checks) };
}
