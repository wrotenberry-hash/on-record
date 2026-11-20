import "./bill-row.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { AnalysisBadge, OfficialBadge } from "@/components/federal/badges";
import { EXPLANATION_COMING, WHAT_THIS_BILL_DOES, type BillRowText } from "@/lib/bill-row";

/**
 * One bill in a list of votes (owner, 20 Nov 2026; the rule and the words are in lib/bill-row.ts). In this order: the
 * bill's plain-English headline, one sentence on what it does, how the legislator voted, the bill number small, and a
 * labelled link, "What this bill does". The link covers the whole row, so a tap anywhere on it opens the bill; other
 * links inside the row (the official source, Share) stay above it and still work.
 *
 * `vote` is how the legislator voted; `children` are lines that belong with the vote (what a Yes meant, a term
 * explained); `meta` follows the bill number on the small line (the date, the official wording, the source).
 */
export function BillRow({ row, href, vote, meta, children, className, as: Tag = "li", ...rest }:
  { row: BillRowText; href: string; vote?: ReactNode; meta?: ReactNode; children?: ReactNode; className?: string; as?: "li" | "div" } & Record<`data-${string}`, string | undefined>) {
  return <Tag className={`bill-row${className ? ` ${className}` : ""}`} {...rest}>
    <p className="br-main">{row.main} {row.label === "Analysis" ? <AnalysisBadge /> : <OfficialBadge title="The bill's official title, copied from government records" />}</p>
    {row.coming ? <p className="br-does br-coming">{EXPLANATION_COMING}</p> : row.does ? <p className="br-does">{row.does}</p> : null}
    {vote ? <p className="br-vote">{vote}</p> : null}
    {children}
    <p className="br-meta"><span className="br-number">{row.number}</span>{meta ? <> · {meta}</> : null}</p>
    <Link className="br-more" href={href}>{WHAT_THIS_BILL_DOES}<span className="visually-hidden">: {row.main}</span><span className="br-arrow" aria-hidden="true">→</span></Link>
  </Tag>;
}
