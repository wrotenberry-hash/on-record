import Link from "next/link";
import { billLabel } from "@/components/federal/badges";
import { Wordmark } from "@/components/brand/wordmark";
import type { MenuBill } from "@/lib/changes/queue-store";
import { NOT_YET_SHOWN, NOTHING_SHOWN } from "@/lib/changes/queue-rules";

/** "H.R. 2102" for a federal bill, "HB 2" for a Texas one, and the stored key when the bill is not on file. */
export function billName(b: MenuBill): string {
  return b.billType && b.number !== null ? billLabel(b.billType, b.number) : b.identifier ?? b.key;
}

/** The top bar every editor screen carries. */
export function EditorTop() {
  return <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link>
    <nav><Link href="/editor">Cases</Link><Link href="/editor/analysis">Bill summaries</Link><Link href="/editor/next">What&apos;s next</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>;
}

/** The first thing both screens say: readers see nothing from a menu, approved or not, in this phase. */
export function ReadersSeeNothing() {
  return <p className="gate gate-closed" role="note"><b>{NOTHING_SHOWN}</b> {NOT_YET_SHOWN}</p>;
}
