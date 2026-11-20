import Link from "next/link";
import { getDb } from "@/db";
import { requireEditorUser } from "@/lib/auth";
import { brandTitle } from "@/lib/brand";
import { AnalysisBadge, shortDate } from "@/components/federal/badges";
import { menusForReview, type MenuRow } from "@/lib/changes/queue-store";
import { MENU_STATUS_WORD, windowWords } from "@/lib/changes/queue-rules";
import { billName, EditorTop, ReadersSeeNothing } from "./parts";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Menus of changes"), robots: { index: false, follow: false } };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The editor's queue of drafted menus of changes (owner, 20 Nov 2026: "AI drafts the menu; nothing goes live until the
 * editor approves it in a queue that shows the option beside its source text"). One row per menu; the options and
 * their source text are on the menu's own screen.
 */
export default async function ChangeMenusPage() {
  await requireEditorUser("/editor/changes");
  const rows = await menusForReview(getDb()).catch(() => null);
  const all = rows ?? [], waiting = all.filter(r => r.menu.status === "review"), approved = all.filter(r => r.menu.status === "live"), rest = all.filter(r => r.menu.status === "failed" || r.menu.status === "closed");
  const spent = all.reduce((sum, r) => sum + r.menu.costUsd, 0);

  const row = ({ menu, bill, versionLabel, counts, groups }: MenuRow) => <li key={menu.id} className="review-item change-row">
    <div className="eyebrow">{billName(bill)} · {versionLabel ?? `Version ${menu.version}`}</div>
    <p><b><Link href={`/editor/changes/${encodeURIComponent(menu.id)}`}>{bill.title ?? "This bill is not on file"}</Link></b></p>
    <p className="meta">Where the bill stood when this was drafted: {windowWords(menu.windowAtDraft)}</p>
    <p className="meta">{menu.status === "review" ? `${plural(counts.draft, "option waits", "options wait")} for you` : MENU_STATUS_WORD[menu.status]}
      {" · "}{plural(groups, "group", "groups")} · {counts.approved} approved · {counts.rejected} rejected · Drafted {shortDate(menu.createdAt)}
      {menu.decidedAt ? ` · Decided ${shortDate(menu.decidedAt)}` : ""} · Cost ${menu.costUsd.toFixed(2)}</p>
    {menu.status === "failed" && menu.notes.length > 0 && <ul className="analysis-list">{menu.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    <p className="change-links"><Link href={`/editor/changes/${encodeURIComponent(menu.id)}`}>{menu.status === "review" ? "Review this menu" : "Open this menu"}<span className="visually-hidden">: {billName(bill)}</span></Link></p>
  </li>;

  return <>
    <EditorTop />
    <main className="fed-page analysis-admin change-queue">
      <p className="crumbs"><Link href="/editor">← Cases</Link></p>
      <div className="eyebrow">EDITOR · MENUS OF CHANGES <AnalysisBadge title="Drafted by AI from the bill's own text and the official record, checked by rules, and read by an editor" /></div>
      <h1>Menus of changes</h1>
      <ReadersSeeNothing />
      <p>AI drafts each menu from three sources and nothing else: amendments filed on the official record, differences between versions of a bill, and numbers, dates and limits in the bill&apos;s own text. Every option quotes the section it would change, word for word. Open a menu to read each option beside its source text, then approve or reject it.</p>
      {rows ? <p className="meta">Waiting for you: {plural(waiting.length, "menu", "menus")} · Approved: {approved.length} · Closed or not finished: {rest.length} · Spent on drafting: ${spent.toFixed(2)}</p>
        : <p className="meta">The menus could not be loaded. Reload in a minute.</p>}

      <h2>Waiting for you ({waiting.length})</h2>
      {waiting.length ? <ul className="review-list">{waiting.map(row)}</ul> : <p className="meta">Nothing waiting.</p>}

      <h2>Approved ({approved.length})</h2>
      <p className="meta">Approved by you. Not shown to readers in this phase.</p>
      {approved.length ? <ul className="review-list">{approved.map(row)}</ul> : <p className="meta">None yet.</p>}

      {rest.length > 0 && <><h2>Closed or not finished ({rest.length})</h2><ul className="review-list">{rest.map(row)}</ul></>}
    </main>
  </>;
}
