import Link from "next/link";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { countEvent } from "@/lib/events";
import { dim, type Audience } from "@/lib/event-dims";
import { cookies } from "next/headers";
import { FEEDBACK_COOKIE, shouldAskFeedback } from "@/lib/feedback-rules";
import { FeedbackPrompt } from "@/components/feedback/feedback-prompt";

/** The voting record leads (owner decision 2026-11-15); the claim record follows. */
export const PUBLIC_PAGES = [
  { href: "/politicians", label: "Politicians" },
  { href: "/issues", label: "Issues" },
  { href: "/following", label: "Following" },
  { href: "/account", label: "Account" },
  { href: "/method", label: "How a claim is checked" },
  { href: "/about", label: "Who runs this" },
  { href: "/corrections", label: "Corrections" },
  { href: "/transparency", label: "Transparency" },
  { href: "/records", label: "Published records" },
] as const;

type Access = { allowed: boolean; preview: boolean; editor?: unknown; invite?: { activeDays?: number } | null; audience?: Audience };

/**
 * Frame for the reader-facing pages. The same switch that closes /records
 * closes these: with PUBLIC_READ_ENABLED off, every public page shows the
 * private-review notice and nothing else. Pages that pass `access` (lib/viewer.ts)
 * also open, as a labelled private preview, to the signed-in editor and to
 * invite-only trial readers; pages that do not pass it behave exactly as before.
 * Each render adds one to an aggregate page-view count by audience and page type
 * (`page`, e.g. "/politicians/[id]"); no reader or id is recorded.
 */
export async function PublicShell({ current, children, access, page }: { current: string; children: React.ReactNode; access?: Access; page?: string }) {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  const enabled = access ? access.allowed : publicRead;
  const audience: Audience = access?.audience ?? (publicRead ? "public" : "closed");
  await countEvent("page_view", dim(enabled ? audience : "closed", page ?? current));
  const trial = !!access?.invite && !access?.editor;
  const askFeedback = trial && enabled && shouldAskFeedback(access?.invite?.activeDays, (await cookies()).get(FEEDBACK_COOKIE)?.value);
  // The claim record is not part of the trial: it opens with public reading.
  const pages = PUBLIC_PAGES.filter(p => p.href !== "/records" || publicRead || !!access?.editor);
  const nav = pages.map(p => <Link key={p.href} href={p.href} aria-current={p.href === current ? "page" : undefined}>{p.label}</Link>);
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link>
      <nav>{enabled ? nav : <Link href="/editor">Checking instrument</Link>}<small>{trial ? "INVITE-ONLY TRIAL" : access?.preview ? "PRIVATE PREVIEW" : enabled ? "CHECKING RECORDS ONLY" : "PRIVATE REVIEW BUILD"}</small></nav></header>
    {enabled && <nav className="mobile-nav" aria-label="Sections">{nav}</nav>}
    <main>
      {access?.preview && (trial
        ? <div className="preview-banner" role="note"><b>Invite-only trial.</b> You are seeing On Record before it is public. Thank you for trying it; tell the person who invited you what was confusing or missing.</div>
        : <div className="preview-banner" role="note"><b>Private preview.</b> You can see this page because you are signed in as the editor. Public reading is off; only you and trial invitees can see it.</div>)}
      {askFeedback && <FeedbackPrompt />}
      {enabled ? children : <><div className="intro"><div className="eyebrow">PRIVATE REVIEW</div><h1>This page is not yet public.</h1>
        <p>On Record is being evaluated privately. This page will appear once the editorial team enables public reading.</p></div>
        <div className="notice"><b>Nothing on this site is a finding.</b> Numerical ratings and aggregate scores are disabled.</div></>}
      {enabled && <footer className="public-foot"><nav>{pages.map(p => <Link key={p.href} href={p.href}>{p.label}</Link>)}</nav><small>Talk is cheap. The record isn&apos;t. On Record shows what officials said and did; it does not grade them.</small></footer>}
    </main>
  </>;
}
