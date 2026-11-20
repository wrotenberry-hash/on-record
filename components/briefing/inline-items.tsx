import Link from "next/link";
import { CAUGHT_UP, FULL_EXPLANATION } from "@/lib/briefing-inline";
import type { ComposedItem, ItemState } from "@/lib/briefing-items";
import "@/components/dashboard/end.css";

/**
 * The briefing a reader can finish here (owner, 20 Nov 2026): at most five items, each with its headline, "Today",
 * "This bill", where it stands and the reader's own legislators' votes, then "You're caught up." The link to the bill
 * page stays, labelled "Full explanation"; nothing a reader needs is behind it. `editor` adds, for the editor only,
 * whether each item would be shown inline to readers and why not.
 */
const STATE_WORD: Record<ItemState, string> = {
  inline: "Readers see this item in full: it passed the written rules and the reader test.",
  untested: "Not shown in full to readers yet: the reader test has not run on this item (it runs with each scheduled update).",
  failed: "Not shown in full to readers: the item failed the reader test.",
  rule: "Not shown in full to readers: the item breaks a written rule.",
  older_format: "Readers see the headline and where it stands: this summary is in an older format with no “today / this bill” lines.",
  no_summary: "Readers see the title and where it stands: there is no approved summary.",
};

export function InlineItems({ items, editor = false }: { items: ComposedItem[]; editor?: boolean }) {
  return <div className="brief-inline">
    {items.length ? <ol className="brief-items">{items.map(i => <li key={i.key} className="brief-item">
      <h2><span className="bill-tag">{i.label}</span> {i.headline}</h2>
      {i.today && i.thisBill ? <>
        <p><strong>Today:</strong> {i.today}</p>
        <p><strong>This bill:</strong> {i.thisBill}</p>
      </> : i.note ? <p className="meta">{i.note}</p> : null}
      <p><strong>Where it stands:</strong> {i.stands}</p>
      {i.legislators.length ? <p><strong>Your legislators:</strong> {i.legislators.join(" ")}</p> : null}
      <p className="brief-more"><Link href={i.href}>{FULL_EXPLANATION}<span className="visually-hidden">: {i.label}</span></Link></p>
      {editor ? <p className="meta brief-editor">{STATE_WORD[i.state]}{i.reasons.length ? ` ${i.reasons.join(" ")}` : ""}</p> : null}
    </li>)}</ol> : <p className="meta">Nothing was decided or scheduled in this period.</p>}
    <p className="caught-up">{CAUGHT_UP}</p>
  </div>;
}
