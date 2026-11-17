import Link from "next/link";
import { headers } from "next/headers";
import { PublicShell } from "@/components/public/public-shell";
import { ReportProblem } from "@/components/share/report-problem";
import { viewerAccess } from "@/lib/viewer";
import { reportPagePath, reportSubject, safePagePath } from "@/lib/report-page";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Something wrong?"), robots: { index: false, follow: false } };

/**
 * "Something wrong? Tell us": the report form for any page, reached from the
 * footer link. The same form, reasons, limits and queue as "Report a problem"
 * on a share card (lib/problems.ts): the editor sees it on Editor → Problems,
 * and a fix is listed on the Corrections page without the reader's note.
 */
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ page?: string; reported?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/corrections" access={access} page="/report">{null}</PublicShell>;
  const sp = await searchParams, h = await headers();
  // After sending, the form's own address is the Referer: then the page named in the link is the one reported.
  const about = sp.reported ? safePagePath(sp.page) ?? "/" : reportPagePath({ queryPage: sp.page, referer: h.get("referer"), host: h.get("x-forwarded-host") ?? h.get("host") });
  const exact = !about.includes("[");
  return <PublicShell current="/corrections" access={access} page="/report">
    <section className="fed-page">
      <div className="eyebrow">TELL US</div>
      <h1>Something wrong?</h1>
      <p className="lede">Tell us what is wrong on {exact ? <>the page <b>{about}</b></> : "the page you were on"}. The editor reads every report. When something is fixed, the fix is listed on the <Link href="/corrections">Corrections</Link> page.</p>
      <ReportProblem subjectKind="page" subjectRef={reportSubject(sp.page, about)} page={about} status={sp.reported} label="What is wrong?" open returnTo="/report" />
      <p className="meta">We do not ask who you are. A report holds what you choose here, your optional note, and which page it was about.</p>
      <p className="meta">{exact ? <><Link href={about}>Back to the page</Link> · </> : null}<Link href="/">Home</Link></p>
    </section>
  </PublicShell>;
}
