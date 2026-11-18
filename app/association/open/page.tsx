import { notFound } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { brandTitle } from "@/lib/brand";
import { associationsEnabled } from "@/lib/associations/session";
import { openLink } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Open association totals"), robots: { index: false, follow: false }, referrer: "no-referrer" as const };

/**
 * Where the emailed link lands. Loading this page uses nothing: the link is used when the button is tapped. Mail
 * programs that open links ahead of the reader therefore cannot spend it.
 */
export default async function OpenAssociationPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  if (!associationsEnabled()) notFound();
  const { t } = await searchParams;
  return <>
    <header className="topbar"><span className="brand"><Wordmark /><i/></span><nav><small>ASSOCIATION TOTALS</small></nav></header>
    <main className="fed-page analysis-admin">
      <div className="eyebrow">ASSOCIATIONS</div>
      <h1>Open your association&apos;s totals</h1>
      <p>Tap the button to sign in on this device. The link in your email works once, for 30 minutes.</p>
      <form action={openLink} className="review-actions"><input type="hidden" name="t" value={t ?? ""} /><button>Open the totals</button></form>
    </main>
  </>;
}
