import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { people, representations, sourceCaptures, sourceCommunications } from "@/db/schema";
import { verifyAction } from "@/lib/session-token";
import { confirmSkip } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Landing page for the "Not today?" link in the morning email. Reached without
 * signing in; the signed token in the link is the authority. Opening the page
 * changes nothing. The POST button does the deferral, so a mail client that
 * prefetches the link cannot skip a case by accident.
 */
export default async function SkipPage({ searchParams }: { searchParams: Promise<{ t?: string; status?: string }> }) {
  const { t, status } = await searchParams;
  let body: React.ReactNode;
  if (status === "done") body = <><h1>Done. That case waits at the back of the order.</h1><p>Tomorrow&apos;s email picks a different one. The case is still in the editor if you change your mind.</p></>;
  else if (status === "expired") body = <><h1>This link has expired.</h1><p>Links from the morning email work for 48 hours. Open the editor and use &ldquo;Not now&rdquo; on the case instead.</p></>;
  else {
    const action = await verifyAction(process.env.EDITOR_ACCESS_KEY, "defer", t);
    if (!action) body = <><h1>This link has expired.</h1><p>Links from the morning email work for 48 hours. Open the editor and use &ldquo;Not now&rdquo; on the case instead.</p></>;
    else {
      const row = await getDb().select({ speakerName: people.displayName, exactText: representations.exactText, deferredAt: representations.deferredAt })
        .from(representations).innerJoin(sourceCaptures, eq(sourceCaptures.id, representations.captureId))
        .innerJoin(sourceCommunications, eq(sourceCommunications.id, sourceCaptures.communicationId))
        .innerJoin(people, eq(people.id, sourceCommunications.speakerId)).where(eq(representations.id, action.subject)).get();
      if (!row) body = <><h1>That case is no longer open.</h1><p>Nothing to skip.</p></>;
      else if (row.deferredAt) body = <><h1>Already skipped.</h1><p>This case is at the back of the order. Tomorrow&apos;s email picks a different one.</p></>;
      else body = <>
        <h1>Skip today&apos;s case?</h1>
        <p><b>{row.speakerName}</b>: &ldquo;{row.exactText.length > 160 ? `${row.exactText.slice(0, 157).trimEnd()}…` : row.exactText}&rdquo;</p>
        <p>It moves to the back of the morning-email order. Nothing is judged, rejected or published. You can bring it back from the editor.</p>
        <form action={confirmSkip}><input type="hidden" name="t" value={t} /><button type="submit" className="cta">Not today</button></form>
      </>;
    }
  }
  return <main className="skip-page">
    <div className="eyebrow">ON RECORD · DAILY REVIEW</div>
    {body}
    <p className="fine"><Link href="/editor">Open the editor</Link></p>
  </main>;
}
