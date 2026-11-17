import "@/app/trust.css";
import { DRAFT_BANNER, FOUNDER_PLACEHOLDERS, LEGAL_REVIEW, type FounderKey, type LegalKey } from "@/lib/trust";

/** The banner at the top of the Privacy and Terms drafts. */
export function DraftBanner() {
  return <div className="draft-banner" role="note"><b>{DRAFT_BANNER}</b>
    This page describes what the site does today. A lawyer has not reviewed it. Each note in square brackets marks a point the lawyer must decide.</div>;
}

/** A point a lawyer must decide, shown in place so it cannot be missed. The wording lives in lib/trust.ts. */
export function Legal({ k }: { k: LegalKey }) {
  return <span className="legal-review">[LEGAL REVIEW: {LEGAL_REVIEW[k]}]</span>;
}

/** A line the founder still has to write or confirm: the editor sees the bracketed prompt, readers see the neutral line. */
export function Founder({ k, draft }: { k: FounderKey; draft: boolean }) {
  const p = FOUNDER_PLACEHOLDERS[k];
  return draft ? <span className="founder-note">[Founder: {p.editor}]</span> : <>{p.reader}</>;
}

/** The one-sentence plain answer that opens each section. */
export function Answer({ children }: { children: React.ReactNode }) {
  return <p className="answer">{children}</p>;
}
