import { PublicShell } from "@/components/public/public-shell";
import { AllNotices } from "@/components/loop/notices";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("What happened to your bills"), robots: { index: false, follow: false } };

/** A reader's own closing-the-loop notices, newest first, capped, ending with a line. Private like every reader page. */
export default async function NoticesPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/notices" access={access}>{null}</PublicShell>;
  const userId = await currentAppUserId();
  return <PublicShell current="/notices" access={access}>
    <section className="fed-page">
      <div className="eyebrow">YOUR BILLS</div>
      <h1>What happened to bills you weighed in on</h1>
      <p className="lede">One notice for each floor vote, passage, failed vote, signing or veto on a bill you answered or follow. Only you see this list.</p>
      <AllNotices userId={userId} />
    </section>
  </PublicShell>;
}
