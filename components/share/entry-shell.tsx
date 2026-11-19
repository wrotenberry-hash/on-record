import { PublicShell } from "@/components/public/public-shell";
import { Wordmark } from "@/components/brand/wordmark";
import { countEvent } from "@/lib/events";
import { SHARED_VIEW_NOTE } from "@/lib/public-access";
import { BRAND } from "@/lib/brand";
import type { EntryAccess } from "@/lib/viewer";
import "./share.css";

/**
 * The frame for the pages SHARED_PAGES_PUBLIC can open (one shared bill, an issue page). An invited reader, the
 * editor and the private notice get the usual frame, unchanged. A visitor let in by the narrower switch gets a bare
 * one: the name, a note that this is one page of an invite-only site, the page, and a short footer. No menu (its
 * pages are private), no visit marker, no alerts, no feedback prompt: nothing that is a reader's.
 * Each render adds one to an aggregate count by page type ("shared:/bills/[id]"); no visitor and no bill is recorded.
 */
export async function EntryShell({ current, page, access, children }: { current: string; page: string; access: EntryAccess; children: React.ReactNode }) {
  if (!access.shared) return <PublicShell current={current} access={access} page={page}>{children}</PublicShell>;
  await countEvent("page_view", `shared:${page}`);
  return <>
    <header className="topbar"><span className="brand"><Wordmark /><i /></span><nav><small>ONE SHARED PAGE</small></nav></header>
    <main>
      <div className="entry-shell-note" role="note">{SHARED_VIEW_NOTE}</div>
      {children}
      <footer className="entry-foot">{BRAND.tagline} {BRAND.name} shows what officials said and did; it does not grade them. Every line links to the official record it was copied from.</footer>
    </main>
  </>;
}
